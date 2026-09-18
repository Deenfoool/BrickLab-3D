export const MECHANICS_STEERING_BRIDGE_VERSION='mechanics-steering-bridge-0.1.0'

function sourceId(endpoint){
  return String(
    endpoint?.metadata?.builtinConnectorId ??
    endpoint?.metadata?.sourceEndpointId ??
    endpoint?.metadata?.compatibilityEndpointId ??
    endpoint?.metadata?.templateKey ??
    endpoint?.id ??
    ''
  )
}

function endpointBySource(record,id){
  const wanted=String(id||'')
  return record?.instance?.endpoints?.find(endpoint=>
    String(endpoint?.id||'')===wanted||sourceId(endpoint)===wanted)??null
}

function edgeEndpointId(edge,bodyId){
  if(String(edge.bodyA)===String(bodyId))return edge?.metadata?.endpointAId??null
  if(String(edge.bodyB)===String(bodyId))return edge?.metadata?.endpointBId??null
  return null
}

function edgeAtEndpoint(graph,bodyId,endpoint){
  if(!endpoint)return null
  const stable=String(endpoint.id)
  return (graph?.neighbors?.(bodyId,{kind:'constraint'})||[])
    .map(item=>item.edge)
    .find(edge=>String(edgeEndpointId(edge,bodyId)||'')===stable)??null
}

function otherBody(edge,bodyId){
  if(String(edge.bodyA)===String(bodyId))return String(edge.bodyB)
  if(String(edge.bodyB)===String(bodyId))return String(edge.bodyA)
  return null
}

export function buildMechanicsSteeringPlan({
  records=[],
  graph,
  structuralPlan,
}={}){
  const byBody=new Map(records.map(record=>[String(record.instance.body.id),record]))
  const jointsByConstraint=new Map()
  for(const joint of structuralPlan?.joints||[]){
    for(const constraintId of joint.sourceConstraintIds||[]){
      jointsByConstraint.set(String(constraintId),joint)
    }
  }

  const entries=[]
  const diagnostics=[]
  const blockers=[]
  for(const record of records){
    const steering=record?.instance?.descriptor?.classification?.properties?.steeringKnuckle
    if(!steering)continue
    const knuckleBodyId=String(record.instance.body.id)
    const pivotEndpoint=endpointBySource(record,steering.pivotConnectorId??'pivot-pin')
    const bearingEndpoint=endpointBySource(record,steering.bearingConnectorId??'wheel-bearing')
    const pivotEdge=edgeAtEndpoint(graph,knuckleBodyId,pivotEndpoint)
    const bearingEdge=edgeAtEndpoint(graph,knuckleBodyId,bearingEndpoint)
    const wheelBodyId=bearingEdge?otherBody(bearingEdge,knuckleBodyId):null
    const wheelRecord=wheelBodyId?byBody.get(wheelBodyId):null
    const physicsJoint=pivotEdge?jointsByConstraint.get(String(pivotEdge.id)):null

    if(!pivotEndpoint||!bearingEndpoint||!pivotEdge||!bearingEdge||!wheelRecord||!physicsJoint){
      const detail=Object.freeze({
        knuckleBodyId,
        knuckleInstanceId:record.instance.body.instanceId,
        status:'incomplete',
        pivotEndpoint:Boolean(pivotEndpoint),
        bearingEndpoint:Boolean(bearingEndpoint),
        pivotConstraintId:pivotEdge?.id??null,
        bearingConstraintId:bearingEdge?.id??null,
        wheelBodyId,
        physicsJointId:physicsJoint?.id??null,
      })
      diagnostics.push(detail)
      if(pivotEdge&&bearingEdge&&!physicsJoint){
        blockers.push(Object.freeze({
          code:'steering-physical-joint-unavailable',
          ...detail,
        }))
      }
      continue
    }
    if(physicsJoint.kind!=='revolute'){
      const detail=Object.freeze({
        knuckleBodyId,
        status:'pivot-not-revolute',
        pivotConstraintId:pivotEdge.id,
        physicsJointId:physicsJoint.id,
        jointKind:physicsJoint.kind,
      })
      diagnostics.push(detail)
      blockers.push(Object.freeze({code:'steering-pivot-not-revolute',...detail}))
      continue
    }
    if(!wheelRecord.instance.descriptor.classification.properties?.wheel){
      diagnostics.push(Object.freeze({
        knuckleBodyId,
        status:'bearing-target-not-wheel',
        wheelBodyId,
      }))
      continue
    }

    entries.push(Object.freeze({
      knuckleBodyId,
      knuckleInstanceId:String(record.instance.body.instanceId),
      wheelBodyId,
      wheelInstanceId:String(wheelRecord.instance.body.instanceId),
      pivotConstraintId:String(pivotEdge.id),
      bearingConstraintId:String(bearingEdge.id),
      physicsJointId:String(physicsJoint.id),
      axisWorld:Object.freeze([...physicsJoint.frame.axisWorld]),
      maxSteerRadians:(Number(steering.maxSteerDeg)||34)*Math.PI/180,
      stiffness:Number.isFinite(Number(steering.stiffness))?Number(steering.stiffness):8.5,
      damping:Number.isFinite(Number(steering.damping))?Number(steering.damping):1.35,
    }))
    diagnostics.push(Object.freeze({
      knuckleBodyId,
      wheelBodyId,
      status:'resolved',
      physicsJointId:physicsJoint.id,
    }))
  }

  return Object.freeze({
    version:MECHANICS_STEERING_BRIDGE_VERSION,
    pass:blockers.length===0,
    entries:Object.freeze(entries),
    blockers:Object.freeze(blockers),
    diagnostics:Object.freeze(diagnostics),
    stats:Object.freeze({
      candidates:diagnostics.length,
      resolved:entries.length,
      incomplete:diagnostics.filter(item=>item.status!=='resolved').length,
      blockers:blockers.length,
    }),
  })
}

export function materializeMechanicsSteeringBindings(plan,jointState){
  const monitorById=new Map(
    (jointState?.monitors||[]).map(monitor=>[String(monitor?.item?.id||''),monitor]),
  )
  const bindings=[]
  const failures=[]
  for(const entry of plan?.entries||[]){
    const monitor=monitorById.get(String(entry.physicsJointId))
    if(!monitor||!monitor.handle||monitor.released){
      failures.push(Object.freeze({
        code:'steering-joint-monitor-missing',
        physicsJointId:entry.physicsJointId,
        knuckleInstanceId:entry.knuckleInstanceId,
      }))
      continue
    }
    const knuckleIsA=String(monitor.item.bodyA)===String(entry.knuckleBodyId)
    const knuckleIsB=String(monitor.item.bodyB)===String(entry.knuckleBodyId)
    if(!knuckleIsA&&!knuckleIsB){
      failures.push(Object.freeze({
        code:'steering-knuckle-side-missing',
        physicsJointId:entry.physicsJointId,
        knuckleBodyId:entry.knuckleBodyId,
      }))
      continue
    }
    bindings.push(Object.freeze({
      ...entry,
      joint:monitor.handle,
      member:knuckleIsA?monitor.memberA:monitor.memberB,
      localAxis:(knuckleIsA?monitor.localAxisA:monitor.localAxisB).clone(),
    }))
  }
  return Object.freeze({
    version:MECHANICS_STEERING_BRIDGE_VERSION,
    pass:failures.length===0,
    bindings:Object.freeze(bindings),
    failures:Object.freeze(failures),
  })
}
