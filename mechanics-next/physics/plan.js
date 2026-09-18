import { deterministicId } from '../core/model.js'
import {
  groupConstraintsByBodyPair,
  solveConstraintBundle,
} from '../constraints/bundle-solver.js'

export const MECHANICS_PHYSICS_PLAN_VERSION='mechanics-physics-plan-0.1.0'
const SUPPORTED_JOINTS=new Set(['fixed','revolute','prismatic','cylindrical','spherical'])

function normalizedAxis(frame){
  const raw=frame?.axis
  if(!Array.isArray(raw)||raw.length!==3)return null
  const value=raw.map(Number)
  const length=Math.hypot(...value)
  return length>1e-9?value.map(component=>component/length):null
}

function normalizedPosition(frame){
  const raw=frame?.positionStud??frame?.position
  if(!Array.isArray(raw)||raw.length!==3||!raw.every(Number.isFinite))return null
  return raw.map(Number)
}

function normalizedOrientation(frame){
  const raw=frame?.orientationBrickLab??frame?.orientation
  if(!Array.isArray(raw)||raw.length!==9||!raw.every(Number.isFinite))return null
  return raw.map(Number)
}

function frameOf(constraint){
  const source=constraint?.referenceFrame??constraint?.metadata?.referenceFrame??null
  if(!source)return null
  const position=normalizedPosition(source)
  const axis=normalizedAxis(source)
  if(!position||!axis)return null
  const orientation=normalizedOrientation(source)
  return Object.freeze({
    positionStud:Object.freeze(position),
    axisWorld:Object.freeze(axis),
    orientationWorld:orientation?Object.freeze(orientation):null,
    degraded:source.degraded===true,
  })
}

function pairKey(a,b){
  return[String(a),String(b)].sort().join('<>')
}

function sameAxis(a,b,tolerance=1e-4){
  const aa=normalizedAxis(a),bb=normalizedAxis(b)
  if(!aa||!bb)return false
  const dot=Math.abs(aa[0]*bb[0]+aa[1]*bb[1]+aa[2]*bb[2])
  return 1-dot<=tolerance
}

function sameLine(a,b,toleranceStud=1e-4){
  const aa=normalizedAxis(a),bb=normalizedAxis(b)
  const pa=normalizedPosition(a),pb=normalizedPosition(b)
  if(!aa||!bb||!pa||!pb||!sameAxis(a,b))return false
  const d=[pb[0]-pa[0],pb[1]-pa[1],pb[2]-pa[2]]
  const along=d[0]*aa[0]+d[1]*aa[1]+d[2]*aa[2]
  const lateral=[
    d[0]-along*aa[0],
    d[1]-along*aa[1],
    d[2]-along*aa[2],
  ]
  return Math.hypot(...lateral)<=toleranceStud
}

function explicitKind(constraints,solution){
  // If this bundle is rigid but physics intentionally kept the two bodies separate
  // (compound member boundary), represent the composed rigidity as one fixed joint.
  if(solution?.rigid)return'fixed'
  if(constraints.length===1){
    const kind=constraints[0]?.constraintKind??constraints[0]?.kind
    return SUPPORTED_JOINTS.has(kind)?kind:null
  }

  const kinds=[...new Set(constraints.map(item=>item?.constraintKind??item?.kind))]
  const frames=constraints.map(item=>item?.referenceFrame).filter(Boolean)
  const coaxial=frames.length===constraints.length &&
    frames.every(frame=>sameLine(frames[0],frame))

  if(coaxial&&kinds.every(kind=>kind==='revolute')&&solution.remainingDof===1)return'revolute'
  if(coaxial&&kinds.every(kind=>kind==='prismatic')&&solution.remainingDof===1)return'prismatic'
  if(coaxial&&kinds.every(kind=>kind==='cylindrical')&&solution.remainingDof===2)return'cylindrical'

  if(kinds.every(kind=>kind==='spherical')&&solution.remainingDof===3&&constraints.length===1)return'spherical'
  return null
}

function limitsFor(constraints,kind){
  const axisKey=kind==='revolute'?'ry':kind==='prismatic'?'ty':null
  if(!axisKey)return null
  let min=-Infinity,max=Infinity,found=false
  for(const constraint of constraints){
    const dof=constraint?.dof?.[axisKey]
    if(dof?.state!=='limited'||!Array.isArray(dof.limits))continue
    found=true
    min=Math.max(min,Number(dof.limits[0]))
    max=Math.min(max,Number(dof.limits[1]))
  }
  if(!found)return null
  if(!(Number.isFinite(min)&&Number.isFinite(max)&&min<=max))return{invalid:true,min,max}
  return Object.freeze({min,max})
}

function dynamicsFor(constraints){
  const values=constraints.map(item=>item?.metadata?.dynamics).filter(Boolean)
  if(!values.length)return null
  const springMotors=values.map(value=>value.springMotor).filter(Boolean)
  const suspensionMotors=values.map(value=>value.suspensionMotor).filter(Boolean)
  const springMotor=springMotors.length===1?springMotors[0]:null
  const suspensionMotor=suspensionMotors.length===1?suspensionMotors[0]:null
  return Object.freeze({
    rotationalResistance:values.map(value=>value.rotationalResistance).find(Boolean)??null,
    axialResistance:values.map(value=>value.axialResistance).find(Boolean)??null,
    retention:constraints.map(item=>item?.metadata?.topology?.retained).some(Boolean),
    springMotor,
    springMotorConflict:springMotors.length>1,
    suspensionMotor,
    suspensionMotorConflict:suspensionMotors.length>1,
    raw:Object.freeze(values),
  })
}

function releasePolicy(constraints){
  const interval=constraints.some(item=>item?.metadata?.occupancy)
  return Object.freeze({
    mode:interval?'revalidate-profile':'persistent',
    sourceConstraintIds:Object.freeze(constraints.map(item=>item.id)),
  })
}

function rigidComponents(graph,{excludeMergeBodyIds=[]}={}){
  const bodyById=new Map(graph.bodies().map(body=>[body.id,body]))
  return graph.rigidIslands({excludeMergeBodyIds}).map((bodyIds,index)=>{
    const bodies=bodyIds.map(id=>bodyById.get(id)).filter(Boolean)
    return Object.freeze({
      id:deterministicId('physics-component',...bodyIds),
      index,
      bodyIds:Object.freeze([...bodyIds]),
      instanceIds:Object.freeze(bodies.map(body=>body.instanceId).filter(Boolean)),
      partIds:Object.freeze(bodies.map(body=>body.partId).filter(Boolean)),
    })
  })
}

function componentIndex(components){
  const index=new Map()
  for(const component of components){
    for(const bodyId of component.bodyIds)index.set(bodyId,component.id)
  }
  return index
}

function physicsJointForBundle(pair,constraints,componentsByBody){
  const solution=solveConstraintBundle(constraints)
  const componentA=componentsByBody.get(pair[0])
  const componentB=componentsByBody.get(pair[1])
  if(!componentA||!componentB)return{
    blocker:Object.freeze({
      code:'component-missing',
      bodyIds:Object.freeze([...pair]),
      constraintIds:Object.freeze(constraints.map(item=>item.id)),
    }),
  }
  if(componentA===componentB)return{internal:true,solution}

  const kind=explicitKind(constraints,solution)
  if(!kind)return{
    blocker:Object.freeze({
      code:'unsupported-constraint-bundle',
      pairKey:pairKey(...pair),
      bodyIds:Object.freeze([...pair]),
      constraintIds:Object.freeze(constraints.map(item=>item.id)),
      remainingDof:solution.remainingDof,
      solvedKind:solution.kind,
      sourceKinds:Object.freeze(constraints.map(item=>item.constraintKind??item.kind)),
    }),
  }

  const frame=frameOf(constraints[0])
  if(!frame)return{
    blocker:Object.freeze({
      code:'joint-frame-missing',
      pairKey:pairKey(...pair),
      bodyIds:Object.freeze([...pair]),
      constraintIds:Object.freeze(constraints.map(item=>item.id)),
      jointKind:kind,
    }),
  }
  if(frame.degraded)return{
    blocker:Object.freeze({
      code:'joint-frame-degraded',
      pairKey:pairKey(...pair),
      bodyIds:Object.freeze([...pair]),
      constraintIds:Object.freeze(constraints.map(item=>item.id)),
      jointKind:kind,
    }),
  }

  const dynamics=dynamicsFor(constraints)
  if(dynamics?.springMotorConflict||dynamics?.suspensionMotorConflict)return{
    blocker:Object.freeze({
      code:'conflicting-joint-motors',
      pairKey:pairKey(...pair),
      bodyIds:Object.freeze([...pair]),
      constraintIds:Object.freeze(constraints.map(item=>item.id)),
      springMotorConflict:Boolean(dynamics.springMotorConflict),
      suspensionMotorConflict:Boolean(dynamics.suspensionMotorConflict),
    }),
  }

  const limits=limitsFor(constraints,kind)
  if(limits?.invalid)return{
    blocker:Object.freeze({
      code:'invalid-joint-limits',
      pairKey:pairKey(...pair),
      bodyIds:Object.freeze([...pair]),
      constraintIds:Object.freeze(constraints.map(item=>item.id)),
      jointKind:kind,
      limits,
    }),
  }

  return{
    joint:Object.freeze({
      id:deterministicId('physics-joint',componentA,componentB,...constraints.map(item=>item.id)),
      kind,
      componentA,
      componentB,
      bodyA:pair[0],
      bodyB:pair[1],
      sourceConstraintIds:Object.freeze(constraints.map(item=>item.id)),
      frame,
      limits,
      dynamics,
      release:releasePolicy(constraints),
      contacts:'disabled-for-connected-pair',
      solution,
    }),
  }
}

function compoundStructuralJoints(discovery,componentsByBody){
  const joints=[]
  const blockers=[]
  for(const descriptor of discovery?.compoundDescriptors||[]){
    if(!['universal-joint','cv-joint'].includes(descriptor?.kind))continue
    if(descriptor.status!=='resolved'){
      blockers.push(Object.freeze({
        code:'compound-angular-unresolved',
        kind:descriptor.kind,
        bodyId:descriptor.bodyId,
        status:descriptor.status,
      }))
      continue
    }
    const bodies=descriptor.externalBodies||[]
    if(bodies.length!==2){
      blockers.push(Object.freeze({
        code:'compound-angular-port-count',
        kind:descriptor.kind,
        bodyId:descriptor.bodyId,
        externalBodies:Object.freeze([...(bodies||[])]),
      }))
      continue
    }
    const componentA=componentsByBody.get(String(bodies[0]))
    const componentB=componentsByBody.get(String(bodies[1]))
    if(!componentA||!componentB){
      blockers.push(Object.freeze({
        code:'compound-angular-component-missing',
        kind:descriptor.kind,
        bodyId:descriptor.bodyId,
        externalBodies:Object.freeze([...bodies]),
      }))
      continue
    }
    if(componentA===componentB)continue
    if(!Array.isArray(descriptor.pivotWorldStud)||descriptor.pivotWorldStud.length!==3||
       !Array.isArray(descriptor.inputAxisWorld)||descriptor.inputAxisWorld.length!==3){
      blockers.push(Object.freeze({
        code:'compound-angular-frame-missing',
        kind:descriptor.kind,
        bodyId:descriptor.bodyId,
      }))
      continue
    }
    joints.push(Object.freeze({
      id:deterministicId('physics-compound-joint',descriptor.id,...bodies),
      kind:'spherical',
      componentA,
      componentB,
      bodyA:String(bodies[0]),
      bodyB:String(bodies[1]),
      sourceConstraintIds:Object.freeze([]),
      frame:Object.freeze({
        positionStud:Object.freeze([...descriptor.pivotWorldStud]),
        axisWorld:Object.freeze([...descriptor.inputAxisWorld]),
        degraded:false,
      }),
      limits:null,
      dynamics:null,
      release:Object.freeze({
        mode:'persistent',
        sourceConstraintIds:Object.freeze([]),
      }),
      contacts:'disabled-for-connected-pair',
      compound:Object.freeze({
        descriptorId:descriptor.id,
        kind:descriptor.kind,
        torsionCoupling:true,
        bendAngleRad:descriptor.bendAngleRad,
        maxBendAngleRad:descriptor.maxBendAngleRad??null,
        axisIntersectionErrorStud:descriptor.axisIntersectionErrorStud??null,
      }),
      solution:Object.freeze({
        valid:true,
        remainingDof:3,
        kind:'spherical',
        virtualCompound:true,
      }),
    }))
  }
  return{joints,blockers}
}

function transmissionPlan(discovery){
  const items=[]
  for(const transmission of discovery?.transmissions||[]){
    items.push(Object.freeze({
      id:transmission.id,
      kind:transmission.kind,
      bodies:Object.freeze([...(transmission.bodies||[])]),
      parameters:transmission.parameters??{},
      mode:['spur-gear-mesh','bevel-gear-mesh','open-differential','universal-joint','cv-joint','linear-actuator','engaged-clutch']
        .includes(transmission.kind)
        ?'dynamic-coupling'
        :'semantic',
      evidence:transmission.evidence??null,
    }))
  }
  return Object.freeze(items)
}

function dynamicsPlan(discovery){
  return Object.freeze((discovery?.dynamics||[]).map(item=>Object.freeze({
    ...item,
    ready:item.kind!=='spring-damper'||
      (item.status==='resolved'&&Number.isFinite(item.springStiffness)&&Number.isFinite(item.damping)),
  })))
}

export function buildMechanicsPhysicsPlan({
  graph,
  discovery=null,
  materializedCompoundRootIds=[],
  excludeRigidMergeBodyIds=[],
}={}){
  if(!graph?.bodies||!graph?.edges||!graph?.rigidIslands){
    throw new TypeError('Mechanics physics plan requires AssemblyGraph')
  }

  const materializedRoots=new Set((materializedCompoundRootIds||[]).map(String))
  const components=Object.freeze(rigidComponents(graph,{
    excludeMergeBodyIds:excludeRigidMergeBodyIds,
  }))
  const byBody=componentIndex(components)
  const blockers=[]
  const joints=[]
  const internalBundles=[]
  const constraints=graph.edges('constraint')

  for(const[rawKey,bundle]of groupConstraintsByBodyPair(constraints)){
    const pair=rawKey.split('<>')
    const result=physicsJointForBundle(pair,bundle,byBody)
    if(result.blocker)blockers.push(result.blocker)
    else if(result.joint)joints.push(result.joint)
    else if(result.internal)internalBundles.push(Object.freeze({
      pairKey:rawKey,
      constraintIds:Object.freeze(bundle.map(item=>item.id)),
      solution:result.solution,
    }))
  }

  const compoundStructure=compoundStructuralJoints(discovery,byBody)
  joints.push(...compoundStructure.joints)
  blockers.push(...compoundStructure.blockers)

  const transmissions=transmissionPlan(discovery)
  const dynamics=Object.freeze((discovery?.dynamics||[]).map(item=>Object.freeze({
    ...item,
    ready:item.kind!=='spring-damper'||
      (
        Number.isFinite(item.springStiffness)&&
        Number.isFinite(item.damping)&&
        (item.status==='resolved'||materializedRoots.has(String(item.bodyId)))
      ),
  })))
  for(const item of dynamics){
    if(item.kind==='spring-damper'&&!item.ready){
      blockers.push(Object.freeze({
        code:'spring-dynamics-unverified',
        bodyId:item.bodyId,
        descriptorId:item.id,
        required:Object.freeze(['springStiffness','damping']),
      }))
    }
  }

  const compoundBlockers=[]
  for(const descriptor of discovery?.compoundDescriptors||[]){
    if(descriptor.status==='limit-exceeded'){
      compoundBlockers.push(Object.freeze({
        code:'compound-limit-exceeded',
        kind:descriptor.kind,
        bodyId:descriptor.bodyId,
      }))
    }
    if(descriptor.status==='decomposed-awaiting-materialization'&&
       !materializedRoots.has(String(descriptor.bodyId))){
      compoundBlockers.push(Object.freeze({
        code:'compound-members-not-materialized',
        kind:descriptor.kind,
        bodyId:descriptor.bodyId,
        decomposition:descriptor.decomposition??descriptor.materialization??null,
      }))
    }
  }
  blockers.push(...compoundBlockers)

  return Object.freeze({
    version:MECHANICS_PHYSICS_PLAN_VERSION,
    pass:blockers.length===0,
    components,
    joints:Object.freeze(joints),
    internalBundles:Object.freeze(internalBundles),
    transmissions,
    dynamics,
    compoundDescriptors:Object.freeze([...(discovery?.compoundDescriptors||[])]),
    blockers:Object.freeze(blockers),
    stats:Object.freeze({
      graphBodies:graph.bodies().length,
      components:components.length,
      rigidMerged:graph.bodies().length-components.length,
      structuralConstraints:constraints.length,
      joints:joints.length,
      internalBundles:internalBundles.length,
      transmissions:transmissions.length,
      dynamics:dynamics.length,
      blockers:blockers.length,
    }),
  })
}
