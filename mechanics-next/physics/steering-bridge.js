export const MECHANICS_STEERING_BRIDGE_VERSION='mechanics-steering-bridge-0.2.0'

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

function endpointByStableId(record,id){
  const wanted=String(id||'')
  return record?.instance?.endpoints?.find(endpoint=>String(endpoint?.id||'')===wanted)??null
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

function physicsJointIndex(structuralPlan){
  const byConstraint=new Map()
  for(const joint of structuralPlan?.joints||[]){
    for(const constraintId of joint.sourceConstraintIds||[]){
      byConstraint.set(String(constraintId),joint)
    }
  }
  return byConstraint
}

function linkedKnucklesForRack({record,graph,byBody}){
  const mechanics=record?.instance?.descriptor?.classification?.properties?.steeringRack
  if(!mechanics)return Object.freeze({
    tieRodBodyIds:Object.freeze([]),
    knuckleBodyIds:Object.freeze([]),
    knuckleInstanceIds:Object.freeze([]),
  })

  const rackBodyId=String(record.instance.body.id)
  const tieRodBodyIds=new Set()
  const knuckleBodyIds=new Set()
  for(const connectorId of [
    mechanics.leftConnectorId??'tie-left',
    mechanics.rightConnectorId??'tie-right',
  ]){
    const endpoint=endpointBySource(record,connectorId)
    const edge=edgeAtEndpoint(graph,rackBodyId,endpoint)
    const tieBodyId=edge?otherBody(edge,rackBodyId):null
    const tieRecord=tieBodyId?byBody.get(tieBodyId):null
    if(tieRecord?.instance?.descriptor?.classification?.role!=='steering-link')continue
    tieRodBodyIds.add(tieBodyId)

    for(const neighbor of graph?.neighbors?.(tieBodyId,{kind:'constraint'})||[]){
      if(neighbor.edge?.id===edge.id)continue
      const candidateBodyId=String(neighbor.bodyId)
      const candidate=byBody.get(candidateBodyId)
      const steering=candidate?.instance?.descriptor?.classification?.properties?.steeringKnuckle
      if(!steering)continue
      const endpointId=edgeEndpointId(neighbor.edge,candidateBodyId)
      const knuckleEndpoint=endpointByStableId(candidate,endpointId)
      if(sourceId(knuckleEndpoint)!=='steering-arm')continue
      knuckleBodyIds.add(candidateBodyId)
    }
  }

  return Object.freeze({
    tieRodBodyIds:Object.freeze([...tieRodBodyIds]),
    knuckleBodyIds:Object.freeze([...knuckleBodyIds]),
    knuckleInstanceIds:Object.freeze(
      [...knuckleBodyIds]
        .map(bodyId=>byBody.get(bodyId)?.instance?.body?.instanceId)
        .filter(Boolean)
        .map(String),
    ),
  })
}

function rackPinionDriven(discovery,rackBodyId){
  return (discovery?.transmissions||[]).some(item=>
    item?.kind==='rack-pinion'&&
    (item?.bodies||[]).map(String).includes(String(rackBodyId)))
}

export function buildMechanicsSteeringPlan({
  records=[],
  graph,
  structuralPlan,
  discovery=null,
}={}){
  const byBody=new Map(records.map(record=>[String(record.instance.body.id),record]))
  const jointsByConstraint=physicsJointIndex(structuralPlan)

  const entries=[]
  const racks=[]
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
        subsystem:'knuckle',
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
        subsystem:'knuckle',
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
        subsystem:'knuckle',
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
      subsystem:'knuckle',
      knuckleBodyId,
      wheelBodyId,
      status:'resolved',
      physicsJointId:physicsJoint.id,
    }))
  }

  for(const record of records){
    const mechanics=record?.instance?.descriptor?.classification?.properties?.steeringRack
    if(!mechanics)continue
    const rackBodyId=String(record.instance.body.id)
    const sliderEndpoint=endpointBySource(record,mechanics.sliderConnectorId??'slider')
    const guideEdge=edgeAtEndpoint(graph,rackBodyId,sliderEndpoint)
    const physicsJoint=guideEdge?jointsByConstraint.get(String(guideEdge.id)):null
    const linkage=linkedKnucklesForRack({record,graph,byBody})

    if(!guideEdge){
      diagnostics.push(Object.freeze({
        subsystem:'rack',
        rackBodyId,
        rackInstanceId:record.instance.body.instanceId,
        status:'guide-unconnected',
        linkedKnuckles:linkage.knuckleInstanceIds.length,
      }))
      continue
    }
    if(!physicsJoint){
      const detail=Object.freeze({
        subsystem:'rack',
        rackBodyId,
        rackInstanceId:record.instance.body.instanceId,
        status:'guide-physics-joint-missing',
        guideConstraintId:guideEdge.id,
      })
      diagnostics.push(detail)
      blockers.push(Object.freeze({code:'steering-rack-physics-joint-unavailable',...detail}))
      continue
    }
    if(physicsJoint.kind!=='prismatic'){
      const detail=Object.freeze({
        subsystem:'rack',
        rackBodyId,
        status:'guide-not-prismatic',
        guideConstraintId:guideEdge.id,
        physicsJointId:physicsJoint.id,
        jointKind:physicsJoint.kind,
      })
      diagnostics.push(detail)
      blockers.push(Object.freeze({code:'steering-rack-guide-not-prismatic',...detail}))
      continue
    }

    const specialized=guideEdge?.metadata?.steeringRack
    const maxTravelStud=Math.abs(
      Number(specialized?.maxTravelStud??mechanics.maxTravelStud??1),
    )
    const coordinateSign=Number(specialized?.coordinateSign)<0?-1:1
    racks.push(Object.freeze({
      rackBodyId,
      rackInstanceId:String(record.instance.body.instanceId),
      guideConstraintId:String(guideEdge.id),
      physicsJointId:String(physicsJoint.id),
      maxTravelStud:Number.isFinite(maxTravelStud)&&maxTravelStud>0?maxTravelStud:1,
      stiffness:Number.isFinite(Number(specialized?.stiffness??mechanics.stiffness))
        ?Math.max(0,Number(specialized?.stiffness??mechanics.stiffness)):4,
      damping:Number.isFinite(Number(specialized?.damping??mechanics.damping))
        ?Math.max(0,Number(specialized?.damping??mechanics.damping)):.42,
      coordinateSign,
      rackPinionDriven:rackPinionDriven(discovery,rackBodyId),
      tieRodBodyIds:linkage.tieRodBodyIds,
      linkedKnuckleBodyIds:linkage.knuckleBodyIds,
      linkedKnuckleInstanceIds:linkage.knuckleInstanceIds,
    }))
    diagnostics.push(Object.freeze({
      subsystem:'rack',
      rackBodyId,
      status:'resolved',
      physicsJointId:physicsJoint.id,
      linkedKnuckles:linkage.knuckleInstanceIds.length,
      rackPinionDriven:rackPinionDriven(discovery,rackBodyId),
    }))
  }

  return Object.freeze({
    version:MECHANICS_STEERING_BRIDGE_VERSION,
    pass:blockers.length===0,
    entries:Object.freeze(entries),
    racks:Object.freeze(racks),
    blockers:Object.freeze(blockers),
    diagnostics:Object.freeze(diagnostics),
    stats:Object.freeze({
      candidates:diagnostics.length,
      resolved:entries.length+racks.length,
      knuckles:entries.length,
      racks:racks.length,
      incomplete:diagnostics.filter(item=>item.status!=='resolved').length,
      blockers:blockers.length,
    }),
  })
}

function monitorFor(monitorById,entry,bodyId,failureCode,failures){
  const monitor=monitorById.get(String(entry.physicsJointId))
  if(!monitor||!monitor.handle||monitor.released){
    failures.push(Object.freeze({
      code:failureCode,
      physicsJointId:entry.physicsJointId,
      bodyId,
    }))
    return null
  }
  const isA=String(monitor.item.bodyA)===String(bodyId)
  const isB=String(monitor.item.bodyB)===String(bodyId)
  if(!isA&&!isB){
    failures.push(Object.freeze({
      code:`${failureCode}-side-missing`,
      physicsJointId:entry.physicsJointId,
      bodyId,
    }))
    return null
  }
  return{monitor,isA}
}

export function materializeMechanicsSteeringBindings(plan,jointState){
  const monitorById=new Map(
    (jointState?.monitors||[]).map(monitor=>[String(monitor?.item?.id||''),monitor]),
  )
  const bindings=[]
  const rackBindings=[]
  const failures=[]

  for(const entry of plan?.entries||[]){
    const resolved=monitorFor(
      monitorById,entry,entry.knuckleBodyId,'steering-joint-monitor-missing',failures)
    if(!resolved)continue
    bindings.push(Object.freeze({
      ...entry,
      joint:resolved.monitor.handle,
      member:resolved.isA?resolved.monitor.memberA:resolved.monitor.memberB,
      localAxis:(resolved.isA?resolved.monitor.localAxisA:resolved.monitor.localAxisB).clone(),
    }))
  }

  for(const entry of plan?.racks||[]){
    const resolved=monitorFor(
      monitorById,entry,entry.rackBodyId,'steering-rack-joint-monitor-missing',failures)
    if(!resolved)continue
    rackBindings.push(Object.freeze({
      ...entry,
      joint:resolved.monitor.handle,
      member:resolved.isA?resolved.monitor.memberA:resolved.monitor.memberB,
      localAxis:(resolved.isA?resolved.monitor.localAxisA:resolved.monitor.localAxisB).clone(),
    }))
  }

  return Object.freeze({
    version:MECHANICS_STEERING_BRIDGE_VERSION,
    pass:failures.length===0,
    bindings:Object.freeze(bindings),
    rackBindings:Object.freeze(rackBindings),
    failures:Object.freeze(failures),
  })
}
