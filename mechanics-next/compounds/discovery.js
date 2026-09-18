import {
  createTransmission,
  deterministicId,
  evidence,
} from '../core/model.js'
import {
  clamp,
  cross3,
  dot3,
  len3,
  norm3,
  signedAngleAround,
} from '../math/rigid.js'
import { worldConnectorFrame } from '../connectors/world-frame.js'
import {
  rotationCouplingEquation,
  screwLinearEquation,
} from '../transmission/equations.js'
import { createUniversalJointRelation } from './universal-joint.js'

export const COMPOUND_DISCOVERY_VERSION='mechanics-compound-discovery-0.1.0'
const EPS=1e-7

function bodyRecordMap(records=[]){
  return new Map(records.map(record=>[String(record?.instance?.body?.id||''),record]).filter(([id])=>id))
}

function role(record){
  return record?.instance?.descriptor?.classification?.role||'unknown'
}

function properties(record){
  return record?.instance?.descriptor?.classification?.properties||{}
}

function trustedCompoundParameterEvidence(props){
  const confidence=String(props?.compoundParameterEvidence?.confidence||'unknown').toLowerCase()
  return confidence==='verified'||confidence==='strong'
}

function endpointById(record,endpointId){
  return record?.instance?.endpoints?.find(endpoint=>String(endpoint?.id)===String(endpointId))??null
}

function endpointIdForBody(relation,bodyId){
  if(String(relation?.bodyA)===String(bodyId))return relation.endpointA
  if(String(relation?.bodyB)===String(bodyId))return relation.endpointB
  return null
}

function otherBody(relation,bodyId){
  if(String(relation?.bodyA)===String(bodyId))return String(relation.bodyB)
  if(String(relation?.bodyB)===String(bodyId))return String(relation.bodyA)
  return null
}

function worldFrameForRelationPort(record,relation,bodyId){
  const endpointId=endpointIdForBody(relation,bodyId)
  const endpoint=endpointById(record,endpointId)
  if(!endpoint)return null
  try{
    return worldConnectorFrame(
      record.pose,
      endpoint,
      {visualOffsetStud:record.visualOffsetStud||[0,0,0]},
    )
  }catch{
    return null
  }
}

function portPhase(frameA,frameB){
  const axisA=norm3(frameA.axis)
  const axisB=norm3(frameB.axis)
  const normal=cross3(axisA,axisB)
  if(len3(normal)<=EPS)return 0
  const n=norm3(normal)
  const zero=norm3(cross3(n,axisA),frameA.reference)
  return signedAngleAround(zero,frameA.reference,axisA)
}

function closestAxisPivot(frameA,frameB){
  const p1=frameA.position,p2=frameB.position
  const d1=norm3(frameA.axis),d2=norm3(frameB.axis)
  const r=[p1[0]-p2[0],p1[1]-p2[1],p1[2]-p2[2]]
  const a=dot3(d1,d1)
  const e=dot3(d2,d2)
  const b=dot3(d1,d2)
  const c=dot3(d1,r)
  const f=dot3(d2,r)
  const denom=a*e-b*b
  let s=0,t=0
  if(Math.abs(denom)>EPS){
    s=(b*f-c*e)/denom
    t=(a*f-b*c)/denom
  }else{
    s=0
    t=e>EPS?f/e:0
  }
  const q1=[p1[0]+d1[0]*s,p1[1]+d1[1]*s,p1[2]+d1[2]*s]
  const q2=[p2[0]+d2[0]*t,p2[1]+d2[1]*t,p2[2]+d2[2]*t]
  const pivot=[
    (q1[0]+q2[0])/2,
    (q1[1]+q2[1])/2,
    (q1[2]+q2[2])/2,
  ]
  return Object.freeze({
    pivot:Object.freeze(pivot),
    axisA:Object.freeze([...d1]),
    axisB:Object.freeze([...d2]),
    lineErrorStud:Math.hypot(q1[0]-q2[0],q1[1]-q2[1],q1[2]-q2[2]),
  })
}

function angularInternalTopology(kind,jointBody){
  if(kind==='universal-joint'){
    return Object.freeze({
      rootBodyId:jointBody,
      rootIsCompoundContainer:true,
      members:Object.freeze([
        Object.freeze({id:`${jointBody}::input-yoke`,role:'input-yoke'}),
        Object.freeze({id:`${jointBody}::cross`,role:'cross'}),
        Object.freeze({id:`${jointBody}::output-yoke`,role:'output-yoke'}),
      ]),
      joints:Object.freeze([
        Object.freeze({a:'input-yoke',b:'cross',kind:'revolute'}),
        Object.freeze({a:'cross',b:'output-yoke',kind:'revolute',axisRelation:'orthogonal'}),
      ]),
      transmission:'cardan-phase',
    })
  }
  return Object.freeze({
    rootBodyId:jointBody,
    rootIsCompoundContainer:true,
    members:Object.freeze([
      Object.freeze({id:`${jointBody}::input-member`,role:'input-member'}),
      Object.freeze({id:`${jointBody}::coupling-core`,role:'constant-velocity-core'}),
      Object.freeze({id:`${jointBody}::output-member`,role:'output-member'}),
    ]),
    joints:Object.freeze([
      Object.freeze({a:'input-member',b:'coupling-core',kind:'articulated'}),
      Object.freeze({a:'coupling-core',b:'output-member',kind:'articulated'}),
    ]),
    transmission:'constant-velocity',
  })
}

function jointGroups(records,relations){
  const byBody=bodyRecordMap(records)
  const groups=new Map()

  for(const relation of relations||[]){
    if(relation?.kind!=='universal-joint-port')continue
    const recordA=byBody.get(String(relation.bodyA))
    const recordB=byBody.get(String(relation.bodyB))
    const jointA=['universal-joint','cv-joint'].includes(role(recordA))
    const jointB=['universal-joint','cv-joint'].includes(role(recordB))
    if(jointA===jointB)continue
    const joint=jointA?recordA:recordB
    const jointBody=joint.instance.body.id
    const externalBody=jointA?String(relation.bodyB):String(relation.bodyA)
    const list=groups.get(jointBody)||[]
    list.push({relation,joint,externalBody})
    groups.set(jointBody,list)
  }
  return groups
}

function discoverAngularJoints(records,relations){
  const equations=[]
  const velocityEquations=[]
  const transmissions=[]
  const nonlinearRelations=[]
  const descriptors=[]
  const diagnostics=[]

  for(const[jointBody,ports]of jointGroups(records,relations)){
    const jointRecord=ports[0]?.joint
    const jointRole=role(jointRecord)

    if(ports.length!==2){
      diagnostics.push(Object.freeze({
        kind:jointRole,
        bodyId:jointBody,
        status:'port-count-unresolved',
        portCount:ports.length,
      }))
      descriptors.push(Object.freeze({
        kind:jointRole,
        bodyId:jointBody,
        status:'incomplete',
        externalBodies:Object.freeze(ports.map(port=>port.externalBody)),
      }))
      continue
    }

    const ordered=[...ports].sort((a,b)=>
      String(a.relation.id).localeCompare(String(b.relation.id))||
      a.externalBody.localeCompare(b.externalBody))
    const first=ordered[0],second=ordered[1]
    const frameA=worldFrameForRelationPort(jointRecord,first.relation,jointBody)
    const frameB=worldFrameForRelationPort(jointRecord,second.relation,jointBody)

    if(!frameA||!frameB){
      diagnostics.push(Object.freeze({
        kind:jointRole,
        bodyId:jointBody,
        status:'port-frame-unavailable',
      }))
      continue
    }

    const rawDot=clamp(dot3(norm3(frameA.axis),norm3(frameB.axis)),-1,1)
    const bendAngleRad=Math.acos(clamp(Math.abs(rawDot),0,1))
    const directionSign=rawDot>=0?1:-1
    const maxBend=Number(properties(jointRecord).maxBendAngleRad)
    const beyondVerifiedLimit=Number.isFinite(maxBend)&&bendAngleRad>maxBend+1e-6
    const phase=portPhase(frameA,frameB)
    const structural=closestAxisPivot(frameA,frameB)
    const id=deterministicId(jointRole,jointBody,first.externalBody,second.externalBody)

    const descriptor=Object.freeze({
      id,
      kind:jointRole,
      bodyId:jointBody,
      externalBodies:Object.freeze([first.externalBody,second.externalBody]),
      portRelationIds:Object.freeze([first.relation.id,second.relation.id]),
      bendAngleRad,
      inputPhaseRad:phase,
      directionSign,
      pivotWorldStud:structural.pivot,
      inputAxisWorld:structural.axisA,
      outputAxisWorld:structural.axisB,
      axisIntersectionErrorStud:structural.lineErrorStud,
      virtualStructuralJoint:'spherical+torsion-coupling',
      maxBendAngleRad:Number.isFinite(maxBend)?maxBend:null,
      beyondVerifiedLimit,
      status:beyondVerifiedLimit?'limit-exceeded':'resolved',
      internalTopology:angularInternalTopology(jointRole,jointBody),
    })
    descriptors.push(descriptor)

    if(beyondVerifiedLimit){
      diagnostics.push(Object.freeze({
        kind:jointRole,
        bodyId:jointBody,
        status:'bend-limit-exceeded',
        bendAngleRad,
        maxBendAngleRad:maxBend,
      }))
      continue
    }

    if(jointRole==='cv-joint'){
      const equation=rotationCouplingEquation({
        id,
        bodyA:first.externalBody,
        bodyB:second.externalBody,
        ratioAB:directionSign,
        kind:'constant-velocity-joint',
      })
      equations.push(equation)
      transmissions.push(createTransmission({
        id,
        kind:'cv-joint',
        bodies:[first.externalBody,second.externalBody,jointBody],
        parameters:{
          bendAngleRad,
          directionSign,
          constantVelocity:true,
        },
        equations:[equation],
        metadata:{jointBody,portRelationIds:[first.relation.id,second.relation.id]},
        evidence:evidence({
          source:'mechanics-next:compound-cv-joint',
          confidence:'strong',
          reason:'two universal-joint ports on CV-classified compound',
        }),
      }))
      diagnostics.push(Object.freeze({
        kind:'cv-joint',
        bodyId:jointBody,
        status:'resolved-linear',
        bendAngleRad,
      }))
      continue
    }

    const nonlinear=createUniversalJointRelation({
      id,
      inputBody:first.externalBody,
      outputBody:second.externalBody,
      bendAngleRad,
      inputPhaseRad:phase,
      directionSign,
      metadata:{
        jointBody,
        portRelationIds:[first.relation.id,second.relation.id],
      },
    })
    const instantaneousRatio=nonlinear.velocityRatio(0)
    const velocityEquation=rotationCouplingEquation({
      id:`${id}:instantaneous-omega`,
      bodyA:first.externalBody,
      bodyB:second.externalBody,
      ratioAB:instantaneousRatio,
      kind:'universal-joint-instantaneous',
    })
    nonlinearRelations.push(nonlinear)
    velocityEquations.push(velocityEquation)
    transmissions.push(createTransmission({
      id,
      kind:'universal-joint',
      bodies:[first.externalBody,second.externalBody,jointBody],
      parameters:{
        bendAngleRad,
        inputPhaseRad:phase,
        directionSign,
        nonlinear:true,
        instantaneousVelocityRatio:instantaneousRatio,
      },
      equations:[velocityEquation],
      metadata:{jointBody,relationId:nonlinear.id},
      evidence:evidence({
        source:'mechanics-next:compound-universal-joint',
        confidence:'strong',
        reason:'two LDCad uniJnt ports resolved into exact Cardan relation',
      }),
    }))
    diagnostics.push(Object.freeze({
      kind:'universal-joint',
      bodyId:jointBody,
      status:'resolved-nonlinear',
      bendAngleRad,
      directionSign,
    }))
  }

  return{equations,velocityEquations,transmissions,nonlinearRelations,descriptors,diagnostics}
}

function constraintPair(constraint){
  return constraint?.metadata?.interfacePair||[]
}

function isKeyedRotationConstraint(constraint){
  const pair=constraintPair(constraint)
  return constraint?.metadata?.topology?.keyedRotation===true||
    (pair.includes('axle')&&pair.includes('axle-hole'))
}

function guideConstraint(constraint){
  const a=constraint?.metadata?.semanticA
  const b=constraint?.metadata?.semanticB
  return a==='linear-actuator-guide'||b==='linear-actuator-guide'||
    constraintPair(constraint).includes('linear-actuator-guide')
}

function connectedConstraints(graph,bodyId){
  return (graph?.edges?.('constraint')||[]).filter(edge=>
    String(edge.bodyA)===String(bodyId)||String(edge.bodyB)===String(bodyId))
}

function opposite(edge,bodyId){
  return String(edge.bodyA)===String(bodyId)?String(edge.bodyB):String(edge.bodyA)
}

function discoverLinearActuators(records,graph){
  const byBody=bodyRecordMap(records)
  const equations=[]
  const transmissions=[]
  const descriptors=[]
  const linearMotions=[]
  const diagnostics=[]
  const consumed=new Set()

  for(const edge of graph?.edges?.('constraint')||[]){
    if(!guideConstraint(edge))continue
    const recordA=byBody.get(String(edge.bodyA))
    const recordB=byBody.get(String(edge.bodyB))
    const actuatorA=role(recordA)==='linear-actuator'
    const actuatorB=role(recordB)==='linear-actuator'
    const actuator=actuatorA?recordA:actuatorB?recordB:null
    if(!actuator)continue

    const actuatorBody=actuator.instance.body.id
    if(consumed.has(actuatorBody))continue
    consumed.add(actuatorBody)
    const sliderBody=opposite(edge,actuatorBody)
    const actuatorProps=properties(actuator)
    const lead=Number(actuatorProps.screwLeadStudPerTurn)
    const leadTrusted=trustedCompoundParameterEvidence(actuatorProps)
    const inputConstraints=connectedConstraints(graph,actuatorBody)
      .filter(item=>item.id!==edge.id&&isKeyedRotationConstraint(item))
    const inputBodies=[...new Set(inputConstraints.map(item=>opposite(item,actuatorBody)))]
    const inputBody=inputBodies.length===1?inputBodies[0]:null
    const axis=Array.isArray(edge?.referenceFrame?.axis)
      ?Object.freeze([...edge.referenceFrame.axis])
      :Object.freeze([0,1,0])
    const id=deterministicId('linear-actuator',actuatorBody,sliderBody,inputBody||'unknown')

    const descriptor=Object.freeze({
      id,
      kind:'linear-actuator',
      bodyId:actuatorBody,
      sliderBody,
      inputBody,
      guideConstraintId:edge.id,
      inputConstraintIds:Object.freeze(inputConstraints.map(item=>item.id)),
      axis,
      screwLeadStudPerTurn:Number.isFinite(lead)&&lead!==0?lead:null,
      travelStud:Number.isFinite(Number(actuatorProps.travelStud))
        ?Number(actuatorProps.travelStud):null,
      leadEvidence:actuatorProps.compoundParameterEvidence??null,
      status:!inputBody
        ?'input-unresolved'
        :!(Number.isFinite(lead)&&lead!==0&&leadTrusted)
          ?'lead-unverified'
          :'resolved',
      internalTopology:Object.freeze({
        rootBodyId:actuatorBody,
        rootIsCompoundContainer:true,
        members:Object.freeze([
          Object.freeze({id:`${actuatorBody}::housing`,role:'housing'}),
          Object.freeze({id:`${actuatorBody}::screw`,role:'screw-input'}),
          Object.freeze({id:`${actuatorBody}::rod`,role:'rod',mappedBodyId:sliderBody}),
        ]),
        joints:Object.freeze([
          Object.freeze({a:'housing',b:'rod',kind:'prismatic',axis}),
          Object.freeze({a:'housing',b:'screw-input',kind:'revolute'}),
        ]),
        transmission:'screw-linear',
      }),
    })
    descriptors.push(descriptor)

    linearMotions.push(Object.freeze({
      kind:'prismatic-output',
      bodyId:sliderBody,
      parentBodyId:actuatorBody,
      axis,
      channel:'slide',
      source:'linear-actuator-guide',
    }))

    if(!inputBody){
      diagnostics.push(Object.freeze({
        kind:'linear-actuator',
        bodyId:actuatorBody,
        status:'input-unresolved',
        inputCandidateCount:inputBodies.length,
      }))
      continue
    }
    if(!(Number.isFinite(lead)&&lead!==0&&leadTrusted)){
      diagnostics.push(Object.freeze({
        kind:'linear-actuator',
        bodyId:actuatorBody,
        status:'lead-unverified',
        inputBody,
        sliderBody,
        suppliedLeadStudPerTurn:Number.isFinite(lead)?lead:null,
        leadEvidence:actuatorProps.compoundParameterEvidence??null,
      }))
      continue
    }

    const equation=screwLinearEquation({
      id,
      rotaryBody:inputBody,
      sliderBody,
      leadStudPerTurn:lead,
    })
    equations.push(equation)
    transmissions.push(createTransmission({
      id,
      kind:'linear-actuator',
      bodies:[inputBody,actuatorBody,sliderBody],
      parameters:{
        screwLeadStudPerTurn:lead,
        travelStud:descriptor.travelStud,
        axis,
      },
      equations:[equation],
      metadata:{
        guideConstraintId:edge.id,
        inputConstraintIds:descriptor.inputConstraintIds,
      },
      evidence:evidence({
        source:'mechanics-next:linear-actuator',
        confidence:'strong',
        reason:'trusted screw lead + LDCad linear actuator guide',
      }),
    }))
    diagnostics.push(Object.freeze({
      kind:'linear-actuator',
      bodyId:actuatorBody,
      status:'resolved',
      inputBody,
      sliderBody,
      screwLeadStudPerTurn:lead,
    }))
  }

  for(const record of records){
    if(role(record)!=='linear-actuator')continue
    const bodyId=record.instance.body.id
    if(consumed.has(bodyId))continue
    const decomposition=record.compoundDecomposition??null
    const topology=decomposition?.topology??null
    const decomposed=topology?.kind==='linear-actuator'&&topology?.status==='resolved'
    const status=decomposed?'decomposed-awaiting-materialization':'awaiting-compound-decomposition'
    descriptors.push(Object.freeze({
      id:deterministicId('linear-actuator',bodyId,decomposed?'decomposed':'undecomposed'),
      kind:'linear-actuator',
      bodyId,
      sliderBody:null,
      inputBody:null,
      status,
      decomposition:decomposition?Object.freeze({
        version:decomposition.version,
        memberCount:decomposition.members?.length||0,
        housingMemberId:topology?.housingMemberId??null,
        rodMemberId:topology?.rodMemberId??null,
        screwMemberId:topology?.screwMemberId??null,
      }):null,
      internalTopology:decomposed
        ?topology
        :Object.freeze({
            rootBodyId:bodyId,
            rootIsCompoundContainer:true,
            members:Object.freeze([
              Object.freeze({id:`${bodyId}::housing`,role:'housing'}),
              Object.freeze({id:`${bodyId}::rod`,role:'rod'}),
            ]),
            joints:Object.freeze([
              Object.freeze({a:'housing',b:'rod',kind:'prismatic'}),
            ]),
            transmission:null,
          }),
    }))
    diagnostics.push(Object.freeze({
      kind:'linear-actuator',
      bodyId,
      status,
      memberCount:decomposition?.members?.length||0,
    }))
  }

  return{equations,transmissions,descriptors,linearMotions,diagnostics}
}

function discoverSprings(records){
  const descriptors=[]
  const dynamics=[]
  const diagnostics=[]

  for(const record of records){
    if(role(record)!=='shock-absorber')continue
    const bodyId=record.instance.body.id
    const props=properties(record)
    const trusted=trustedCompoundParameterEvidence(props)
    const supplied=Object.freeze({
      restLengthStud:Number.isFinite(Number(props.restLengthStud))?Number(props.restLengthStud):null,
      travelStud:Number.isFinite(Number(props.travelStud))?Number(props.travelStud):null,
      springStiffness:Number.isFinite(Number(props.springStiffness))?Number(props.springStiffness):null,
      damping:Number.isFinite(Number(props.damping))?Number(props.damping):null,
    })
    const decomposition=record.compoundDecomposition??null
    const decomposedTopology=decomposition?.topology??null
    const decomposed=decomposedTopology?.kind==='shock-absorber'&&decomposedTopology?.status==='resolved'
    const data=Object.freeze({
      id:deterministicId('spring-damper',bodyId),
      kind:'spring-damper',
      bodyId,
      topology:'prismatic-internal',
      restLengthStud:trusted?supplied.restLengthStud:null,
      travelStud:trusted?supplied.travelStud:null,
      springStiffness:trusted?supplied.springStiffness:null,
      damping:trusted?supplied.damping:null,
      suppliedParameters:supplied,
      parameterEvidence:props.compoundParameterEvidence??null,
      status:decomposed?'decomposed-awaiting-materialization':'awaiting-compound-decomposition',
      materialization:Object.freeze({
        housingMemberId:decomposedTopology?.housingMemberId??null,
        rodMemberId:decomposedTopology?.rodMemberId??null,
        springMemberId:decomposedTopology?.springMemberId??null,
        memberCount:decomposition?.members?.length||0,
      }),
      internalTopology:decomposed
        ?decomposedTopology
        :Object.freeze({
            rootBodyId:bodyId,
            rootIsCompoundContainer:true,
            members:Object.freeze([
              Object.freeze({id:`${bodyId}::housing`,role:'housing'}),
              Object.freeze({id:`${bodyId}::rod`,role:'rod'}),
              Object.freeze({id:`${bodyId}::spring`,role:'spring',nonRigid:true}),
            ]),
            joints:Object.freeze([
              Object.freeze({a:'housing',b:'rod',kind:'prismatic'}),
            ]),
            transmission:null,
            dynamics:'spring-damper',
          }),
    })
    descriptors.push(data)
    dynamics.push(data)
    diagnostics.push(Object.freeze({
      kind:'spring-damper',
      bodyId,
      status:data.status,
      parametersVerified:[
        data.restLengthStud!=null?'restLengthStud':null,
        data.travelStud!=null?'travelStud':null,
        data.springStiffness!=null?'springStiffness':null,
        data.damping!=null?'damping':null,
      ].filter(Boolean),
    }))
  }

  return{descriptors,dynamics,diagnostics}
}

function discoverClutches(records,graph,stateRegistry){
  const byBody=bodyRecordMap(records)
  const equations=[]
  const transmissions=[]
  const descriptors=[]
  const diagnostics=[]

  for(const record of records){
    if(role(record)!=='driving-ring')continue
    const ringBody=record.instance.body.id
    const stateKey=`clutch:${ringBody}`
    const state=stateRegistry?.get?.(stateKey)??null
    const slideConstraint=connectedConstraints(graph,ringBody)
      .find(edge=>constraintPair(edge).includes('driving-ring'))??null
    const descriptor={
      id:deterministicId('conditional-clutch',ringBody),
      kind:'conditional-clutch',
      ringBody,
      stateKey,
      slideConstraintId:slideConstraint?.id??null,
      mode:state?.mode??'unknown',
      targetBodyId:state?.targetBodyId??null,
    }

    if(state?.mode!=='engaged'){
      descriptors.push(Object.freeze({...descriptor,status:state?.mode==='disengaged'?'disengaged':'engagement-unresolved'}))
      diagnostics.push(Object.freeze({
        kind:'conditional-clutch',
        ringBody,
        status:state?.mode==='disengaged'?'disengaged':'engagement-unresolved',
        stateKey,
      }))
      continue
    }

    const targetBody=String(state.targetBodyId||'')
    const target=byBody.get(targetBody)
    if(!target||role(target)!=='clutch-gear'){
      descriptors.push(Object.freeze({...descriptor,status:'invalid-engagement-target'}))
      diagnostics.push(Object.freeze({
        kind:'conditional-clutch',
        ringBody,
        status:'invalid-engagement-target',
        targetBodyId:targetBody||null,
      }))
      continue
    }

    const directionSign=Number(state.directionSign)<0?-1:1
    const id=deterministicId('clutch-engagement',ringBody,targetBody)
    const equation=rotationCouplingEquation({
      id,
      bodyA:ringBody,
      bodyB:targetBody,
      ratioAB:directionSign,
      kind:'engaged-clutch',
    })
    equations.push(equation)
    transmissions.push(createTransmission({
      id,
      kind:'engaged-clutch',
      bodies:[ringBody,targetBody],
      parameters:{directionSign,stateKey},
      equations:[equation],
      metadata:{slideConstraintId:slideConstraint?.id??null},
      evidence:evidence({
        source:'mechanics-next:compound-state',
        confidence:'strong',
        reason:'explicit clutch engagement state',
      }),
    }))
    descriptors.push(Object.freeze({...descriptor,status:'engaged',targetBodyId:targetBody}))
    diagnostics.push(Object.freeze({
      kind:'conditional-clutch',
      ringBody,
      status:'engaged',
      targetBodyId:targetBody,
    }))
  }

  return{equations,transmissions,descriptors,diagnostics}
}

export function discoverCompoundMechanisms({
  records=[],
  graph,
  relations=[],
  stateRegistry=null,
}={}){
  const angular=discoverAngularJoints(records,relations)
  const actuators=discoverLinearActuators(records,graph)
  const springs=discoverSprings(records)
  const clutches=discoverClutches(records,graph,stateRegistry)

  return Object.freeze({
    version:COMPOUND_DISCOVERY_VERSION,
    equations:Object.freeze([
      ...angular.equations,
      ...actuators.equations,
      ...clutches.equations,
    ]),
    velocityEquations:Object.freeze(angular.velocityEquations),
    transmissions:Object.freeze([
      ...angular.transmissions,
      ...actuators.transmissions,
      ...clutches.transmissions,
    ]),
    nonlinearRelations:Object.freeze(angular.nonlinearRelations),
    descriptors:Object.freeze([
      ...angular.descriptors,
      ...actuators.descriptors,
      ...springs.descriptors,
      ...clutches.descriptors,
    ]),
    linearMotions:Object.freeze(actuators.linearMotions),
    dynamics:Object.freeze(springs.dynamics),
    diagnostics:Object.freeze([
      ...angular.diagnostics,
      ...actuators.diagnostics,
      ...springs.diagnostics,
      ...clutches.diagnostics,
    ]),
  })
}
