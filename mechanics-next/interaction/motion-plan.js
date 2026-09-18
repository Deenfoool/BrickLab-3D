import { mechanicalVariable } from '../core/model.js'
import { endpointSemanticKind } from '../intelligence/endpoint-semantics.js'
import { worldConnectorFrame } from '../connectors/world-frame.js'
import { gearFrameForRecord } from '../transmission/gear-geometry.js'

export const MOTION_PLAN_VERSION='mechanics-motion-plan-0.1.0'
const ROTARY_SEMANTICS=new Set([
  'technic-axle','technic-axle-hole','technic-round-hole',
  'wheel-axle-interface','turntable-bearing','wheel-retainer',
])

function rotaryFrame(record){
  const gear=gearFrameForRecord(record)
  if(gear)return Object.freeze({
    pivot:Object.freeze([...gear.center]),
    axis:Object.freeze([...gear.axis]),
    source:gear.source,
  })

  for(const endpoint of record?.instance?.endpoints||[]){
    if(!ROTARY_SEMANTICS.has(endpointSemanticKind(endpoint)))continue
    try{
      const frame=worldConnectorFrame(
        record.pose,
        endpoint,
        {visualOffsetStud:record.visualOffsetStud||[0,0,0]},
      )
      return Object.freeze({
        pivot:Object.freeze([...frame.position]),
        axis:Object.freeze([...frame.axis]),
        source:'rotary-endpoint',
      })
    }catch{}
  }

  const classification=record?.instance?.descriptor?.classification
  if(classification?.capabilities?.rotary){
    return Object.freeze({
      pivot:Object.freeze([...record.pose.position]),
      axis:Object.freeze([0,1,0]),
      source:'rotary-classification-fallback',
      confidence:'weak',
    })
  }
  return null
}

function thetaOf(result,bodyId){
  const value=result?.values?.[mechanicalVariable(bodyId,'theta')]
  return Number.isFinite(Number(value))?Number(value):null
}

function slideOf(result,bodyId){
  const value=result?.values?.[mechanicalVariable(bodyId,'slide')]
  return Number.isFinite(Number(value))?Number(value):null
}

export function buildMotionPlan({
  records=[],
  discovery,
  displacementResult,
}={}){
  const byBody=new Map(records.map(record=>[record.instance.body.id,record]))
  const compoundByBody=new Map((discovery?.compoundMotions||[]).map(item=>[item.bodyId,item]))
  const motions=[]
  const unresolved=[]

  for(const record of records){
    const bodyId=record.instance.body.id
    const theta=thetaOf(displacementResult,bodyId)
    const compound=compoundByBody.get(bodyId)

    if(compound?.kind==='differential-spider'){
      const parent=byBody.get(compound.parentBodyId)
      const orbitFrame=parent?rotaryFrame(parent):null
      const spinFrame=rotaryFrame(record)
      const orbitTheta=thetaOf(displacementResult,compound.orbitBodyId)??0
      const spinTheta=theta??0
      if(Math.abs(orbitTheta)<1e-12&&Math.abs(spinTheta)<1e-12)continue
      if(!orbitFrame||!spinFrame){
        unresolved.push(Object.freeze({
          bodyId,reason:'compound-frame-missing',compound,
        }))
        continue
      }
      motions.push(Object.freeze({
        kind:'compound-rotation',
        compoundKind:'differential-spider',
        bodyId,
        instanceId:record.instance.body.instanceId,
        orbit:Object.freeze({
          parentBodyId:compound.parentBodyId,
          pivot:orbitFrame.pivot,
          axis:orbitFrame.axis,
          thetaRad:orbitTheta,
        }),
        spin:Object.freeze({
          frame:'carrier-relative',
          pivot:spinFrame.pivot,
          axis:Object.freeze([...compound.localAxis]),
          thetaRad:spinTheta,
          directionSign:compound.directionSign,
        }),
      }))
      continue
    }

    if(theta==null||Math.abs(theta)<1e-12)continue
    const frame=rotaryFrame(record)
    if(!frame){
      unresolved.push(Object.freeze({bodyId,reason:'rotary-frame-missing'}))
      continue
    }
    motions.push(Object.freeze({
      kind:'rotation',
      bodyId,
      instanceId:record.instance.body.instanceId,
      pivot:frame.pivot,
      axis:frame.axis,
      thetaRad:theta,
      frameSource:frame.source,
      confidence:frame.confidence??'normal',
    }))
  }

  for(const descriptor of discovery?.linearMotions||[]){
    const distanceStud=slideOf(displacementResult,descriptor.bodyId)
    if(distanceStud==null||Math.abs(distanceStud)<1e-12)continue
    const record=byBody.get(descriptor.bodyId)
    if(!record){
      unresolved.push(Object.freeze({
        bodyId:descriptor.bodyId,
        reason:'linear-motion-record-missing',
        descriptor,
      }))
      continue
    }
    motions.push(Object.freeze({
      kind:'translation',
      bodyId:descriptor.bodyId,
      instanceId:record.instance.body.instanceId,
      axis:Object.freeze([...(descriptor.axis||[0,1,0])]),
      distanceStud,
      parentBodyId:descriptor.parentBodyId??null,
      frameSource:descriptor.source??'compound-linear',
    }))
  }

  return Object.freeze({
    version:MOTION_PLAN_VERSION,
    status:displacementResult?.status||'unknown',
    motions:Object.freeze(motions),
    unresolved:Object.freeze(unresolved),
    freeVariables:Object.freeze([...(displacementResult?.freeVariables||[])]),
    conflicts:Object.freeze([...(displacementResult?.conflicts||[])]),
  })
}

export function rotaryFrameForRecord(record){
  return rotaryFrame(record)
}
