import { deterministicId, evidence } from '../core/model.js'
import { constraintDof, createConstraint, dofEntry } from '../constraints/dof.js'
import { endpointSemanticKind } from './endpoint-semantics.js'
import { mechanicalInterfaceRule } from './interface-rules.js'
import { semanticInterfaceVariants } from './interface-variants.js'
import { rigidPoseFromMatrix4 } from '../math/rigid.js'
import { worldConnectorFrame } from '../connectors/world-frame.js'
import { validateStudContactBundle } from '../connectors/contact-bundle.js'
import { matchMechanicalEndpoints } from '../connectors/profile-matcher.js'

function evidenceConfidence(tier) {
  if (tier === 'A') return 'verified'
  if (tier === 'B') return 'strong'
  if (tier === 'C') return 'inferred'
  return 'weak'
}

function endpointByLegacyId(instance, endpointId) {
  return instance?.endpoints?.find(endpoint =>
    endpoint?.id === endpointId ||
    endpoint?.metadata?.legacyEndpointId === endpointId ||
    endpoint?.metadata?.compatibilityEndpointId === endpointId ||
    endpoint?.metadata?.sourceEndpointId === endpointId ||
    endpoint?.metadata?.templateKey === endpointId
  ) ?? null
}

function specialRelation(kindA, kindB) {
  const pair = new Set([kindA, kindB])
  if (pair.has('differential-internal-interface')) {
    return Object.freeze({
      kind:'differential-port',
      structural:false,
      transmission:true,
      reason:'LDCad differential internal interface',
    })
  }
  if (pair.has('universal-joint-port')) {
    return Object.freeze({
      kind:'universal-joint-port',
      structural:false,
      transmission:true,
      reason:'LDCad universal joint compound port',
    })
  }
  if (pair.has('flex-system-end')) {
    return Object.freeze({
      kind:'flex-system-port',
      structural:false,
      transmission:false,
      deformable:true,
      reason:'flexible system endpoint',
    })
  }
  return null
}

function endpointSourceId(endpoint){
  return String(
    endpoint?.metadata?.builtinConnectorId ??
    endpoint?.metadata?.sourceEndpointId ??
    endpoint?.metadata?.compatibilityEndpointId ??
    endpoint?.metadata?.templateKey ??
    endpoint?.id ??
    ''
  )
}

function packagedPort(classification,endpoint){
  const properties=classification?.properties||{}
  const endpointId=endpointSourceId(endpoint)
  const differential=properties.packagedDifferential
  if(differential){
    const ports=[
      ['input',differential.inputConnectorId],
      ['left',differential.leftConnectorId],
      ['right',differential.rightConnectorId],
    ]
    const found=ports.find(([,id])=>String(id||'')===endpointId)
    if(found)return Object.freeze({
      packageKind:'packaged-differential',
      portRole:found[0],
      portId:endpointId,
      parameters:differential,
    })
  }

  const transmission=properties.packagedTransmission
  if(transmission){
    const ports=[
      ['input',transmission.inputConnectorId],
      ['output',transmission.outputConnectorId],
    ]
    const found=ports.find(([,id])=>String(id||'')===endpointId)
    if(found)return Object.freeze({
      packageKind:classification?.role==='worm'?'worm-drive':'packaged-transmission',
      portRole:found[0],
      portId:endpointId,
      parameters:transmission,
    })
  }
  return null
}

function packagedTransmissionPortRule(endpointA,endpointB,classificationA,classificationB){
  const portA=packagedPort(classificationA,endpointA)
  const portB=packagedPort(classificationB,endpointB)
  if(Boolean(portA)===Boolean(portB))return null

  const packageSide=portA?'a':'b'
  const port=portA??portB
  const externalKind=packageSide==='a'
    ?endpointSemanticKind(endpointB)
    :endpointSemanticKind(endpointA)
  const rotaryReceiver=new Set([
    'technic-axle','technic-axle-hole','technic-round-hole','wheel-axle-interface',
  ])
  if(!rotaryReceiver.has(externalKind))return null

  return Object.freeze({
    packageSide,
    port,
    rule:Object.freeze({
      kind:'revolute',
      topology:Object.freeze({
        dof:constraintDof('revolute'),
        axis:'y',
        keyedRotation:false,
        retained:true,
        transmissionPort:true,
      }),
      dynamics:Object.freeze({
        rotationalResistance:'low',
        transmissionPort:true,
      }),
      evidence:Object.freeze({
        tier:'A',
        source:'BrickLab explicit packaged transmission port metadata',
      }),
    }),
    interfacePair:Object.freeze(['transmission-port','rotary-shaft']),
  })
}

function shockPrismaticSemantics({
  endpointA,
  endpointB,
  classificationA,
  classificationB,
  worldFrameA,
  worldFrameB,
}={}){
  const propsA=classificationA?.properties||{}
  const propsB=classificationB?.properties||{}
  const bodySide=propsA.shockBody?'a':propsB.shockBody?'b':null
  const rodSide=propsA.shockRod?'a':propsB.shockRod?'b':null
  if(!bodySide||!rodSide||bodySide===rodSide)return null

  const bodyProps=bodySide==='a'?propsA.shockBody:propsB.shockBody
  const rodProps=rodSide==='a'?propsA.shockRod:propsB.shockRod
  const bodyEndpoint=bodySide==='a'?endpointA:endpointB
  const rodEndpoint=rodSide==='a'?endpointA:endpointB
  const bodySource=endpointSourceId(bodyEndpoint)
  const rodSource=endpointSourceId(rodEndpoint)
  if(bodySource!==String(bodyProps.railConnectorId??'rail'))return null
  if(rodSource!==String(rodProps.sliderConnectorId??'slider'))return null

  const referenceAxis=worldFrameA?.axis
  const rodAxis=(rodSide==='a'?worldFrameA:worldFrameB)?.axis
  if(!referenceAxis||!rodAxis)return null
  const dot=
    referenceAxis[0]*rodAxis[0]+
    referenceAxis[1]*rodAxis[1]+
    referenceAxis[2]*rodAxis[2]
  const alignment=dot>=0?1:-1
  const coordinateSign=(rodSide==='a'?-1:1)*alignment

  const rawMin=Number(bodyProps.minTravelStud)
  const rawMax=Number(bodyProps.maxTravelStud)
  const rest=Number(bodyProps.restTravelStud)
  const stiffness=Number(bodyProps.springStiffness)
  const damping=Number(bodyProps.damping)
  if(![rawMin,rawMax,rest,stiffness,damping].every(Number.isFinite))return null

  const first=rawMin*coordinateSign
  const second=rawMax*coordinateSign
  const limits=Object.freeze([Math.min(first,second),Math.max(first,second)])
  return Object.freeze({
    kind:'shock-prismatic',
    bodySide,
    rodSide,
    coordinateSign,
    limits,
    restTravelStud:rest*coordinateSign,
    springStiffness:Math.max(0,stiffness),
    damping:Math.max(0,damping),
    bodyEndpointId:bodyEndpoint.id,
    rodEndpointId:rodEndpoint.id,
  })
}

function suspensionArmRevoluteSemantics({
  endpointA,
  endpointB,
  classificationA,
  classificationB,
  worldFrameA,
  worldFrameB,
}={}){
  const propsA=classificationA?.properties||{}
  const propsB=classificationB?.properties||{}
  const armSide=propsA.suspensionArm?'a':propsB.suspensionArm?'b':null
  if(!armSide)return null
  const armProps=armSide==='a'?propsA.suspensionArm:propsB.suspensionArm
  const armEndpoint=armSide==='a'?endpointA:endpointB
  if(endpointSourceId(armEndpoint)!==String(armProps.pivotConnectorId??'pivot'))return null

  const referenceAxis=worldFrameA?.axis
  const armAxis=(armSide==='a'?worldFrameA:worldFrameB)?.axis
  if(!referenceAxis||!armAxis)return null
  const dot=
    referenceAxis[0]*armAxis[0]+
    referenceAxis[1]*armAxis[1]+
    referenceAxis[2]*armAxis[2]
  const alignment=dot>=0?1:-1
  const coordinateSign=(armSide==='a'?-1:1)*alignment

  const maxAngleRaw=Number(armProps.maxAngle)
  const maxAngle=Number.isFinite(maxAngleRaw)&&maxAngleRaw>0
    ?maxAngleRaw:Math.PI*55/180
  const minAngleRaw=Number(armProps.minAngle)
  const physicalMin=Number.isFinite(minAngleRaw)?minAngleRaw:-maxAngle
  const physicalMax=maxAngle
  const first=physicalMin*coordinateSign
  const second=physicalMax*coordinateSign

  return Object.freeze({
    kind:'suspension-arm-revolute',
    armSide,
    coordinateSign,
    limits:Object.freeze([Math.min(first,second),Math.max(first,second)]),
    physicalMinAngle:physicalMin,
    physicalMaxAngle:physicalMax,
    restAngle:(Number(armProps.restAngle)||0)*coordinateSign,
    preload:(Number(armProps.preload)||0)*coordinateSign,
    stiffness:Number.isFinite(Number(armProps.stiffness))
      ?Math.max(0,Number(armProps.stiffness)):.12,
    damping:Number.isFinite(Number(armProps.damping))
      ?Math.max(0,Number(armProps.damping)):.01,
    springRate:Number.isFinite(Number(armProps.springRate))
      ?Math.max(0,Number(armProps.springRate)):null,
    compressionDamping:Number.isFinite(Number(armProps.compressionDamping))
      ?Math.max(0,Number(armProps.compressionDamping)):null,
    reboundDamping:Number.isFinite(Number(armProps.reboundDamping))
      ?Math.max(0,Number(armProps.reboundDamping)):null,
    bumpStop:Number.isFinite(Number(armProps.bumpStop))
      ?Math.min(.999,Math.max(0,Number(armProps.bumpStop))):.88,
    armEndpointId:armEndpoint.id,
  })
}

function steeringRackPrismaticSemantics({
  endpointA,
  endpointB,
  classificationA,
  classificationB,
  worldFrameA,
  worldFrameB,
}={}){
  const propsA=classificationA?.properties||{}
  const propsB=classificationB?.properties||{}
  const rackSide=propsA.steeringRack?'a':propsB.steeringRack?'b':null
  if(!rackSide)return null
  const rackProps=rackSide==='a'?propsA.steeringRack:propsB.steeringRack
  const rackEndpoint=rackSide==='a'?endpointA:endpointB
  if(endpointSourceId(rackEndpoint)!==String(rackProps.sliderConnectorId??'slider'))return null

  const maxTravel=Math.abs(Number(rackProps.maxTravelStud))
  if(!(Number.isFinite(maxTravel)&&maxTravel>0))return null
  const referenceAxis=worldFrameA?.axis
  const rackAxis=(rackSide==='a'?worldFrameA:worldFrameB)?.axis
  if(!referenceAxis||!rackAxis)return null
  const dot=
    referenceAxis[0]*rackAxis[0]+
    referenceAxis[1]*rackAxis[1]+
    referenceAxis[2]*rackAxis[2]
  const alignment=dot>=0?1:-1
  const coordinateSign=(rackSide==='a'?-1:1)*alignment
  return Object.freeze({
    kind:'steering-rack-prismatic',
    rackSide,
    coordinateSign,
    limits:Object.freeze([-maxTravel,maxTravel]),
    maxTravelStud:maxTravel,
    stiffness:Number.isFinite(Number(rackProps.stiffness))?Math.max(0,Number(rackProps.stiffness)):4,
    damping:Number.isFinite(Number(rackProps.damping))?Math.max(0,Number(rackProps.damping)):.42,
    rackEndpointId:rackEndpoint.id,
  })
}

function motorOutputRule(kindA,kindB,partRoleA,partRoleB){
  const motorSide=partRoleA==='motor'?'a':partRoleB==='motor'?'b':null
  if(!motorSide)return null
  const motorKind=motorSide==='a'?kindA:kindB
  const drivenKind=motorSide==='a'?kindB:kindA
  if(motorKind!=='technic-axle')return null
  if(!['technic-axle-hole','technic-pin-hole','technic-round-hole'].includes(drivenKind))return null
  return Object.freeze({
    motorSide,
    rule:Object.freeze({
      kind:'revolute',
      topology:Object.freeze({
        dof:constraintDof('revolute'),
        axis:'y',
        motorOutput:true,
        keyedRotation:false,
        retained:true,
      }),
      dynamics:Object.freeze({
        rotationalResistance:'low',
        motorDriven:true,
      }),
      evidence:Object.freeze({
        tier:'A',
        source:'BrickLab motor output semantics',
      }),
    }),
    interfacePair:Object.freeze(['motor-output','rotary-receiver']),
  })
}

function resolveRule(endpointA, endpointB, {
  match = null,
  partRoleA = null,
  partRoleB = null,
  classificationA = null,
  classificationB = null,
} = {}) {
  const kindA = endpointSemanticKind(endpointA)
  const kindB = endpointSemanticKind(endpointB)
  const packaged=packagedTransmissionPortRule(
    endpointA,endpointB,classificationA,classificationB)
  if(packaged)return{
    kindA,
    kindB,
    rule:packaged.rule,
    interfacePair:packaged.interfacePair,
    special:null,
    transmissionPort:packaged,
  }
  const motor=motorOutputRule(kindA,kindB,partRoleA,partRoleB)
  if(motor)return{
    kindA,
    kindB,
    rule:motor.rule,
    interfacePair:motor.interfacePair,
    special:null,
    motorSide:motor.motorSide,
  }
  const special = specialRelation(kindA, kindB)
  if (special) return { special, kindA, kindB, rule:null, interfacePair:null }

  if (kindA === 'rim-tire-interface' && kindB === 'rim-tire-interface') {
    if (partRoleA === 'tire' && partRoleB === 'rim') {
      return { kindA, kindB, rule:mechanicalInterfaceRule('tyre','rim'), interfacePair:['tyre','rim'] }
    }
    if (partRoleA === 'rim' && partRoleB === 'tire') {
      return { kindA, kindB, rule:mechanicalInterfaceRule('rim','tyre'), interfacePair:['rim','tyre'] }
    }
  }

  for (const a of semanticInterfaceVariants(kindA,{endpoint:endpointA,match})) {
    for (const b of semanticInterfaceVariants(kindB,{endpoint:endpointB,match})) {
      const rule = mechanicalInterfaceRule(a, b)
      if (rule) return { kindA, kindB, rule, interfacePair:[a,b] }
    }
  }

  const profileMatch=matchMechanicalEndpoints(endpointA,endpointB,{
    classificationA,
    classificationB,
  })
  if(profileMatch?.compatible&&profileMatch?.interfaceRule){
    return {
      kindA,
      kindB,
      rule:profileMatch.interfaceRule,
      interfacePair:profileMatch.interfacePair??['profile','profile'],
      special:null,
      profileDerived:true,
    }
  }

  return { kindA, kindB, rule:null, interfacePair:null, special:null }
}

function visualOffsetForObject(object){
  const visual=object?.children?.find?.(child=>child?.userData?.ldrawVisual)
  return visual?.position
    ?[Number(visual.position.x)||0,Number(visual.position.y)||0,Number(visual.position.z)||0]
    :[0,0,0]
}

function relativeOrientationSignature(frameA,frameB){
  const a=frameA?.orientation
  const b=frameB?.orientation
  if(!Array.isArray(a)||!Array.isArray(b)||a.length!==9||b.length!==9)return null
  const value=[]
  for(let row=0;row<3;row++){
    for(let col=0;col<3;col++){
      value.push(
        a[row]*b[col]+
        a[3+row]*b[3+col]+
        a[6+row]*b[6+col]
      )
    }
  }
  return Object.freeze(value)
}

function connectionGeometry(frameA,frameB){
  const dx=frameA.position[0]-frameB.position[0]
  const dy=frameA.position[1]-frameB.position[1]
  const dz=frameA.position[2]-frameB.position[2]
  const axis=frameB.axis
  const axial=dx*axis[0]+dy*axis[1]+dz*axis[2]
  const lx=dx-axis[0]*axial
  const ly=dy-axis[1]*axial
  const lz=dz-axis[2]*axial
  return Object.freeze({
    anchorDistanceStud:Math.hypot(dx,dy,dz),
    axialSeparationStud:axial,
    lateralDistanceStud:Math.hypot(lx,ly,lz),
    axisDot:
      frameA.axis[0]*frameB.axis[0]+
      frameA.axis[1]*frameB.axis[1]+
      frameA.axis[2]*frameB.axis[2],
    relativeOrientation:relativeOrientationSignature(frameA,frameB),
  })
}

function persistedConnectionGeometry(value,fallback){
  if(!value||typeof value!=='object')return fallback
  const relative=Array.isArray(value.relativeOrientation)&&value.relativeOrientation.length===9
    ?Object.freeze(value.relativeOrientation.map(Number))
    :fallback?.relativeOrientation??null
  return Object.freeze({
    anchorDistanceStud:Number.isFinite(Number(value.anchorDistanceStud))
      ?Number(value.anchorDistanceStud):fallback?.anchorDistanceStud??0,
    axialSeparationStud:Number.isFinite(Number(value.axialSeparationStud))
      ?Number(value.axialSeparationStud):fallback?.axialSeparationStud??0,
    lateralDistanceStud:Number.isFinite(Number(value.lateralDistanceStud))
      ?Number(value.lateralDistanceStud):fallback?.lateralDistanceStud??0,
    axisDot:Number.isFinite(Number(value.axisDot))
      ?Number(value.axisDot):fallback?.axisDot??1,
    relativeOrientation:relative,
  })
}

function worldFrame(object,endpoint){
  object?.updateWorldMatrix?.(true,false)
  const elements=object?.matrixWorld?.elements
  if(!elements||elements.length!==16){
    throw new Error('connection object lacks matrixWorld')
  }
  const pose=rigidPoseFromMatrix4(Array.from(elements))
  const frame=worldConnectorFrame(pose,endpoint,{
    visualOffsetStud:visualOffsetForObject(object),
  })
  return{
    position:[...frame.position],
    axis:[...frame.axis],
    orientation:[...frame.orientation],
    degraded:false,
  }
}

export function interpretObservedConnection(record, {
  sceneObserver,
  objectById = () => null,
} = {}) {
  if (!record?.a?.instanceId || !record?.b?.instanceId) {
    return Object.freeze({ valid:false, reason:'connection-instance-identity-missing', recordId:record?.id ?? null })
  }

  const instanceA = sceneObserver?.instance?.(record.a.instanceId)
  const instanceB = sceneObserver?.instance?.(record.b.instanceId)
  if (!instanceA || !instanceB) {
    return Object.freeze({ valid:false, reason:'mechanical-instance-missing', recordId:record.id ?? null })
  }

  const endpointA = endpointByLegacyId(instanceA, record.a.endpointId)
  const endpointB = endpointByLegacyId(instanceB, record.b.endpointId)
  if (!endpointA || !endpointB) {
    return Object.freeze({
      valid:false,
      reason:'normalized-endpoint-missing',
      recordId:record.id ?? null,
      missing:{
        a:!endpointA ? record.a.endpointId : null,
        b:!endpointB ? record.b.endpointId : null,
      },
    })
  }

  const resolved = resolveRule(endpointA, endpointB, {
    match:record.match,
    partRoleA:instanceA.descriptor?.classification?.role,
    partRoleB:instanceB.descriptor?.classification?.role,
    classificationA:instanceA.descriptor?.classification,
    classificationB:instanceB.descriptor?.classification,
  })

  if (resolved.special) {
    return Object.freeze({
      valid:true,
      type:'relation',
      recordId:record.id ?? null,
      relation:Object.freeze({
        id:deterministicId('mechanical-relation', record.id, resolved.special.kind),
        ...resolved.special,
        bodyA:instanceA.body.id,
        bodyB:instanceB.body.id,
        endpointA:endpointA.id,
        endpointB:endpointB.id,
      }),
      diagnostics:Object.freeze({
        semanticA:resolved.kindA,
        semanticB:resolved.kindB,
      }),
    })
  }

  if (!resolved.rule) {
    return Object.freeze({
      valid:false,
      reason:'interface-rule-unresolved',
      recordId:record.id ?? null,
      semanticA:resolved.kindA,
      semanticB:resolved.kindB,
      legacyMatchFamily:record?.match?.family ?? null,
    })
  }

  const contactBundle=record?.metadata?.contactBundle??null
  const objectA = objectById(record.a.instanceId)
  const objectB = objectById(record.b.instanceId)
  let verifiedContactBundle=null
  if(contactBundle?.kind==='stud-bundle'){
    const bundleValidation=validateStudContactBundle(contactBundle,{
      instanceA,
      instanceB,
      frameAForEndpoint:endpoint=>worldFrame(objectA,endpoint),
      frameBForEndpoint:endpoint=>worldFrame(objectB,endpoint),
    })
    if(!bundleValidation.valid){
      return Object.freeze({
        valid:false,
        reason:`contact-bundle-invalid:${bundleValidation.reason}`,
        recordId:record.id??null,
        bundleValidation,
      })
    }
    verifiedContactBundle=bundleValidation.bundle
    resolved.rule=Object.freeze({
      ...resolved.rule,
      kind:'fixed',
      topology:Object.freeze({
        ...resolved.rule.topology,
        dof:constraintDof('fixed'),
        retained:true,
        bundleCanBecomeRigid:true,
        contactBundleKind:'stud-bundle',
      }),
      dynamics:Object.freeze({
        ...resolved.rule.dynamics,
        multiContactRigid:true,
      }),
    })
  }
  const worldFrameA = worldFrame(objectA, endpointA)
  const worldFrameB = worldFrame(objectB, endpointB)
  const referenceFrame = worldFrameA
  const axisDot=
    worldFrameA.axis[0]*worldFrameB.axis[0]+
    worldFrameA.axis[1]*worldFrameB.axis[1]+
    worldFrameA.axis[2]*worldFrameB.axis[2]
  const axisPolarity=axisDot>=0?1:-1
  const suspension=resolved.rule.kind==='revolute'
    ?suspensionArmRevoluteSemantics({
        endpointA,
        endpointB,
        classificationA:instanceA.descriptor?.classification,
        classificationB:instanceB.descriptor?.classification,
        worldFrameA,
        worldFrameB,
      })
    :null
  const shock=resolved.rule.kind==='prismatic'
    ?shockPrismaticSemantics({
        endpointA,
        endpointB,
        classificationA:instanceA.descriptor?.classification,
        classificationB:instanceB.descriptor?.classification,
        worldFrameA,
        worldFrameB,
      })
    :null
  const steeringRack=!shock&&resolved.rule.kind==='prismatic'
    ?steeringRackPrismaticSemantics({
        endpointA,
        endpointB,
        classificationA:instanceA.descriptor?.classification,
        classificationB:instanceB.descriptor?.classification,
        worldFrameA,
        worldFrameB,
      })
    :null
  const limitedTravel=shock??steeringRack
  const constraintDofValue=suspension
    ?Object.freeze({
        ...resolved.rule.topology.dof,
        ry:dofEntry('limited',{
          limits:[...suspension.limits],
          source:'mechanics-next:suspension-arm-travel',
        }),
      })
    :limitedTravel
      ?Object.freeze({
          ...resolved.rule.topology.dof,
          ty:dofEntry('limited',{
            limits:[...limitedTravel.limits],
            source:shock?'mechanics-next:shock-travel':'mechanics-next:steering-rack-travel',
          }),
        })
      :resolved.rule.topology.dof
  const constraintDynamics=suspension
    ?Object.freeze({
        ...resolved.rule.dynamics,
        suspensionMotor:Object.freeze({
          armBodyId:suspension.armSide==='a'?instanceA.body.id:instanceB.body.id,
          armInstanceId:suspension.armSide==='a'?instanceA.body.instanceId:instanceB.body.instanceId,
          coordinateSign:suspension.coordinateSign,
          restAngle:suspension.restAngle,
          preload:suspension.preload,
          stiffness:suspension.stiffness,
          damping:suspension.damping,
          springRate:suspension.springRate,
          compressionDamping:suspension.compressionDamping,
          reboundDamping:suspension.reboundDamping,
          bumpStop:suspension.bumpStop,
          physicalMinAngle:suspension.physicalMinAngle,
          physicalMaxAngle:suspension.physicalMaxAngle,
          source:'bricklab-explicit-suspension-arm-metadata',
        }),
      })
    :shock
      ?Object.freeze({
        ...resolved.rule.dynamics,
        axialResistance:'spring-damper',
        springMotor:Object.freeze({
          targetStud:shock.restTravelStud,
          stiffness:shock.springStiffness,
          damping:shock.damping,
          coordinateSign:shock.coordinateSign,
          source:'bricklab-explicit-shock-metadata',
        }),
      })
    :steeringRack
      ?Object.freeze({
          ...resolved.rule.dynamics,
          steeringActuator:Object.freeze({
            maxTravelStud:steeringRack.maxTravelStud,
            stiffness:steeringRack.stiffness,
            damping:steeringRack.damping,
            coordinateSign:steeringRack.coordinateSign,
            source:'bricklab-explicit-steering-rack-metadata',
          }),
        })
      :resolved.rule.dynamics
  const constraintTopology=suspension
    ?Object.freeze({
        ...resolved.rule.topology,
        dof:constraintDofValue,
        suspensionArm:true,
        angularLimits:suspension.limits,
      })
    :limitedTravel
      ?Object.freeze({
          ...resolved.rule.topology,
          dof:constraintDofValue,
          shock:Boolean(shock),
          steeringRack:Boolean(steeringRack),
          travelLimitsStud:limitedTravel.limits,
        })
      :resolved.rule.topology
  const tier = resolved.rule.evidence?.tier || 'D'
  const constraint = createConstraint({
    id:deterministicId('constraint', record.id, instanceA.body.id, instanceB.body.id),
    bodyA:instanceA.body.id,
    bodyB:instanceB.body.id,
    kind:resolved.rule.kind,
    dof:constraintDofValue,
    frameA:endpointA.frame,
    frameB:endpointB.frame,
    referenceFrame,
    metadata:{
      observedConnectionId:record.id ?? null,
      instanceAId:String(record.a.instanceId),
      instanceBId:String(record.b.instanceId),
      endpointAId:endpointA.id,
      endpointBId:endpointB.id,
      observedEndpointAId:record.a.endpointId??null,
      observedEndpointBId:record.b.endpointId??null,
      interfacePair:resolved.interfacePair,
      semanticA:resolved.kindA,
      semanticB:resolved.kindB,
      dynamics:constraintDynamics,
      topology:constraintTopology,
      suspension,
      shock,
      steeringRack,
      legacyMatchFamily:record?.match?.family ?? null,
      occupancy:record?.occupancy ?? null,
      contactBundle:verifiedContactBundle,
      axisPolarity,
      endpointWorldAxes:Object.freeze({
        a:Object.freeze([...worldFrameA.axis]),
        b:Object.freeze([...worldFrameB.axis]),
      }),
      connectionGeometry:persistedConnectionGeometry(
        record?.metadata?.connectionGeometry,
        connectionGeometry(worldFrameA,worldFrameB),
      ),
      motorDrive:resolved.motorSide?Object.freeze({
        motorSide:resolved.motorSide,
        motorBodyId:resolved.motorSide==='a'?instanceA.body.id:instanceB.body.id,
        drivenBodyId:resolved.motorSide==='a'?instanceB.body.id:instanceA.body.id,
        motorInstanceId:resolved.motorSide==='a'?instanceA.body.instanceId:instanceB.body.instanceId,
        drivenInstanceId:resolved.motorSide==='a'?instanceB.body.instanceId:instanceA.body.instanceId,
        motorEndpointId:resolved.motorSide==='a'?endpointA.id:endpointB.id,
        drivenEndpointId:resolved.motorSide==='a'?endpointB.id:endpointA.id,
      }):null,
      transmissionPort:resolved.transmissionPort?Object.freeze({
        packageKind:resolved.transmissionPort.port.packageKind,
        packageSide:resolved.transmissionPort.packageSide,
        packageBodyId:resolved.transmissionPort.packageSide==='a'?instanceA.body.id:instanceB.body.id,
        packageInstanceId:resolved.transmissionPort.packageSide==='a'?instanceA.body.instanceId:instanceB.body.instanceId,
        externalBodyId:resolved.transmissionPort.packageSide==='a'?instanceB.body.id:instanceA.body.id,
        externalInstanceId:resolved.transmissionPort.packageSide==='a'?instanceB.body.instanceId:instanceA.body.instanceId,
        portRole:resolved.transmissionPort.port.portRole,
        portId:resolved.transmissionPort.port.portId,
        parameters:resolved.transmissionPort.port.parameters,
        axisPolarity,
        packageAxisWorld:Object.freeze([
          ...(resolved.transmissionPort.packageSide==='a'?worldFrameA.axis:worldFrameB.axis),
        ]),
        externalAxisWorld:Object.freeze([
          ...(resolved.transmissionPort.packageSide==='a'?worldFrameB.axis:worldFrameA.axis),
        ]),
      }):null,
    },
    evidence:evidence({
      source:'mechanics-next:connection-interpreter',
      confidence:evidenceConfidence(tier),
      reason:resolved.rule.evidence?.source || 'mechanical interface rule',
      detail:{ tier },
    }),
  })

  return Object.freeze({
    valid:true,
    type:'constraint',
    recordId:record.id ?? null,
    constraint,
    diagnostics:Object.freeze({
      semanticA:resolved.kindA,
      semanticB:resolved.kindB,
      interfacePair:Object.freeze(resolved.interfacePair),
      referenceFrameDegraded:referenceFrame.degraded,
    }),
  })
}

export class ShadowConnectionInterpreter {
  #graph
  #sceneObserver
  #objectById
  #owned = new Map()
  #relations = new Map()
  #unresolved = new Map()
  #syncCount = 0

  constructor({ graph, sceneObserver, objectById = () => null } = {}) {
    if (!graph?.addConstraint || !graph?.removeEdge) throw new TypeError('Connection interpreter requires assembly graph')
    if (!sceneObserver?.instance) throw new TypeError('Connection interpreter requires scene observer')
    this.#graph = graph
    this.#sceneObserver = sceneObserver
    this.#objectById = objectById
  }

  sync(records = []) {
    const seen = new Set()
    let added = 0
    let updated = 0
    let unchanged = 0

    for (const record of records || []) {
      const recordId = String(record?.id || deterministicId(
        'observed-connection',
        record?.a?.instanceId, record?.a?.endpointId,
        record?.b?.instanceId, record?.b?.endpointId,
      ))
      seen.add(recordId)

      const interpretation = interpretObservedConnection({ ...record, id:recordId }, {
        sceneObserver:this.#sceneObserver,
        objectById:this.#objectById,
      })

      if (!interpretation.valid) {
        const previous = this.#owned.get(recordId)
        if (previous) this.#graph.removeEdge(previous.edgeId)
        this.#owned.delete(recordId)
        this.#relations.delete(recordId)
        this.#unresolved.set(recordId, interpretation)
        continue
      }

      this.#unresolved.delete(recordId)
      if (interpretation.type === 'relation') {
        const previous = this.#owned.get(recordId)
        if (previous) this.#graph.removeEdge(previous.edgeId)
        this.#owned.delete(recordId)
        this.#relations.set(recordId, interpretation.relation)
        continue
      }

      this.#relations.delete(recordId)
      const constraint = interpretation.constraint
      const token = JSON.stringify({
        id:constraint.id,
        bodyA:constraint.bodyA,
        bodyB:constraint.bodyB,
        kind:constraint.kind,
        pair:constraint.metadata?.interfacePair,
        frame:constraint.referenceFrame,
      })
      const previous = this.#owned.get(recordId)
      if (previous?.token === token && this.#graph.edge(previous.edgeId)) {
        unchanged += 1
        continue
      }

      if (previous) {
        this.#graph.removeEdge(previous.edgeId)
        updated += 1
      } else {
        added += 1
      }

      this.#graph.addConstraint(constraint)
      this.#owned.set(recordId, Object.freeze({ edgeId:constraint.id, token }))
    }

    let removed = 0
    for (const [recordId, previous] of [...this.#owned]) {
      if (seen.has(recordId)) continue
      this.#graph.removeEdge(previous.edgeId)
      this.#owned.delete(recordId)
      removed += 1
    }
    for (const recordId of [...this.#relations.keys()]) {
      if (!seen.has(recordId)) this.#relations.delete(recordId)
    }
    for (const recordId of [...this.#unresolved.keys()]) {
      if (!seen.has(recordId)) this.#unresolved.delete(recordId)
    }

    this.#syncCount += 1
    return Object.freeze({
      syncCount:this.#syncCount,
      records:(records || []).length,
      constraints:this.#owned.size,
      relations:this.#relations.size,
      unresolved:this.#unresolved.size,
      added,
      updated,
      removed,
      unchanged,
    })
  }

  relations() {
    return Object.freeze([...this.#relations.values()])
  }

  unresolved() {
    return Object.freeze([...this.#unresolved.values()])
  }

  stats() {
    return Object.freeze({
      syncCount:this.#syncCount,
      constraints:this.#owned.size,
      relations:this.#relations.size,
      unresolved:this.#unresolved.size,
    })
  }
}

export function createShadowConnectionInterpreter(options) {
  return new ShadowConnectionInterpreter(options)
}
