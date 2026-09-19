import { deterministicId } from '../core/model.js'
import { dot3, len3, norm3, sub3 } from '../math/rigid.js'
import { matchMechanicalEndpoints } from './profile-matcher.js'
import { solveMechanicalPlacement } from './placement-solver.js'
import { worldConnectorFrame } from './world-frame.js'
import { occupancyPlanForPlacement } from './occupancy.js'

export const CANDIDATE_SEARCH_VERSION='mechanics-candidate-search-0.1.0'
export const DEFAULT_CAPTURE_DISTANCE_STUD=.72
export const DEFAULT_MIN_AXIS_ALIGNMENT=.72
const SUPPORT_POSITION_EPS=.045
const SUPPORT_AXIS_DOT=.997

function throughReceiver(match){
  const female=match?.female
  return female?.family==='cylinder'&&female?.profile?.centered===true&&
    String(female?.profile?.caps||'none').toLowerCase()==='none'
}
function polarityOptions(match){return throughReceiver(match)?[1,-1]:[1]}
function evidenceTierScore(match){
  const tier=match?.interfaceRule?.evidence?.tier
  if(tier==='A')return 1
  if(tier==='B')return .9
  if(tier==='C')return .7
  if(tier==='D')return .45
  return .2
}
function orientationFree(match){return Boolean(match?.freeOrientation)}
function requiredAlignment(distance,capture,minAlignment){
  const proximity=Math.max(0,Math.min(1,1-distance/Math.max(capture,1e-6)))
  return Math.max(.55,Math.min(1,minAlignment-(minAlignment-.55)*proximity))
}
function candidateScore(candidate,{captureDistanceStud,minAxisAlignment}){
  const d=candidate.solution.diagnostics
  const distance=d.translationStud/Math.max(captureDistanceStud,1e-6)
  const rotation=Math.min(Math.PI,Math.abs(d.rotationRad||0))/Math.PI
  const lateral=Math.min(2,(d.initialLateralDistanceStud||0)/Math.max(captureDistanceStud,1e-6))
  const engagement=Math.min(1,Math.max(0,d.engagementLdu||0)/20)
  const alignment=Math.max(-1,Math.min(1,candidate.alignment))
  const required=requiredAlignment(d.translationStud,captureDistanceStud,minAxisAlignment)
  const alignmentPenalty=orientationFree(candidate.match)?0:Math.max(0,(1-alignment)/Math.max(1e-5,1-required))
  const evidence=evidenceTierScore(candidate.match)
  const occupancyPenalty=candidate.occupancy?.accepted===false?10:0
  const unresolvedPenalty=candidate.connectionEligible?0:2
  const supportBonus=Math.min(.35,Math.max(0,(candidate.supportCount||1)-1)*.05)

  return distance+
    rotation*.12+
    lateral*.08+
    alignmentPenalty*.12+
    occupancyPenalty+
    unresolvedPenalty-
    engagement*.04-
    evidence*.06-
    supportBonus
}
function compareCandidates(a,b){
  return a.score-b.score||
    (b.supportCount||1)-(a.supportCount||1)||
    a.solution.diagnostics.translationStud-b.solution.diagnostics.translationStud||
    a.key.localeCompare(b.key)
}
function frameCacheFor(record,cache){
  if(!cache.has(record))cache.set(record,new Map())
  return cache.get(record)
}
function endpointFrame(record,endpoint,cache){
  const endpointCache=frameCacheFor(record,cache)
  if(endpointCache.has(endpoint.id))return endpointCache.get(endpoint.id)
  const frame=worldConnectorFrame(record.pose,endpoint,{visualOffsetStud:record.visualOffsetStud||[0,0,0]})
  endpointCache.set(endpoint.id,frame)
  return frame
}

function candidateKey(moving,source,target,targetEndpoint,polarity){
  return deterministicId(
    'candidate',
    moving.instance.body.id,source.id,
    target.instance.body.id,targetEndpoint.id,
    polarity,
  )
}

function solvePair(moving,source,target,targetEndpoint,sourceFrame,targetFrame,match,polarity,options){
  const solution=solveMechanicalPlacement({
    source,target:targetEndpoint,
    sourceFrame,targetFrame,
    objectPose:moving.pose,
    match,
    axisPolarity:polarity,
  })
  if(!solution.valid)return null
  if(solution.diagnostics.translationStud>options.captureDistanceStud)return null
  const rawAlignment=dot3(norm3(sourceFrame.axis),norm3(targetFrame.axis))*polarity
  const alignment=throughReceiver(match)?Math.abs(rawAlignment):rawAlignment
  const required=requiredAlignment(solution.diagnostics.translationStud,options.captureDistanceStud,options.minAxisAlignment)
  if(!orientationFree(match)&&alignment<required)return null

  const candidate={
    version:CANDIDATE_SEARCH_VERSION,
    key:candidateKey(moving,source,target,targetEndpoint,polarity),
    moving,
    targetRecord:target,
    source,
    target:targetEndpoint,
    sourceBodyId:moving.instance.body.id,
    targetBodyId:target.instance.body.id,
    match,
    solution,
    alignment,
    requiredAlignment:required,
    axisPolarity:polarity,
    supportCount:1,
    connectionEligible:Boolean(match.interfaceRule),
  }

  const occupancyPlan=occupancyPlanForPlacement(candidate,{connectionId:candidate.key})
  candidate.occupancyPlan=occupancyPlan
  candidate.occupancy=options.occupancy?.canReserve
    ?options.occupancy.canReserve(occupancyPlan)
    :Object.freeze({accepted:true,conflicts:Object.freeze([])})

  if(candidate.occupancy.accepted===false&&!options.includeOccupied)return null
  if(typeof options.collisionProbe==='function'){
    const collision=options.collisionProbe(candidate)
    candidate.collision=collision
    if(collision?.blocked&&!options.includeColliding)return null
  }

  candidate.score=candidateScore(candidate,options)
  return candidate
}

function solvedPose(candidate){
  return Object.freeze({
    position:candidate.solution.worldPosition,
    quaternion:candidate.solution.worldQuaternion,
  })
}

function collectMultiContactSupport(candidate,frameCache){
  const moving=candidate.moving,targetRecord=candidate.targetRecord
  const moved={...moving,pose:solvedPose(candidate)}
  const supports=[]
  const usedTargets=new Set()

  for(const source of moving.instance.endpoints){
    let sourceFrame
    try{sourceFrame=endpointFrame(moved,source,frameCache)}catch{continue}
    let best=null
    for(const target of targetRecord.instance.endpoints){
      if(usedTargets.has(target.id))continue
      const match=matchMechanicalEndpoints(source,target,{
        classificationA:moving.instance.descriptor?.classification,
        classificationB:targetRecord.instance.descriptor?.classification,
      })
      if(!match.compatible||!match.interfaceRule)continue
      let targetFrame
      try{targetFrame=endpointFrame(targetRecord,target,frameCache)}catch{continue}
      const distance=len3(sub3(sourceFrame.position,targetFrame.position))
      if(distance>SUPPORT_POSITION_EPS)continue
      const alignment=Math.abs(dot3(norm3(sourceFrame.axis),norm3(targetFrame.axis)))
      if(!match.freeOrientation&&alignment<SUPPORT_AXIS_DOT)continue
      if(!best||distance<best.distance)best={source,target,match,distance,alignment}
    }
    if(best){
      usedTargets.add(best.target.id)
      supports.push(Object.freeze(best))
    }
  }

  if(!supports.length){
    supports.push(Object.freeze({
      source:candidate.source,
      target:candidate.target,
      match:candidate.match,
      distance:0,
      alignment:Math.abs(candidate.alignment??1),
    }))
  }
  return Object.freeze(supports)
}

export function findMechanicalCandidates({
  moving,
  targets=[],
  captureDistanceStud=DEFAULT_CAPTURE_DISTANCE_STUD,
  minAxisAlignment=DEFAULT_MIN_AXIS_ALIGNMENT,
  occupancy=null,
  collisionProbe=null,
  includeOccupied=false,
  includeColliding=false,
  includeSemanticUnknown=false,
  maxResults=16,
  supportAnalysisLimit=24,
}={}){
  if(!moving?.instance?.body||!moving?.pose)return Object.freeze([])
  const options={
    captureDistanceStud,
    minAxisAlignment,
    occupancy,
    collisionProbe,
    includeOccupied,
    includeColliding,
  }
  const frameCache=new Map()
  const results=[]

  for(const source of moving.instance.endpoints){
    let sourceFrame
    try{sourceFrame=endpointFrame(moving,source,frameCache)}catch{continue}

    for(const targetRecord of targets){
      if(!targetRecord?.instance?.body||!targetRecord?.pose)continue
      if(targetRecord.instance.body.id===moving.instance.body.id)continue

      for(const target of targetRecord.instance.endpoints){
        const match=matchMechanicalEndpoints(source,target,{
          classificationA:moving.instance.descriptor?.classification,
          classificationB:targetRecord.instance.descriptor?.classification,
        })
        if(!match.compatible)continue
        if(!match.interfaceRule&&!includeSemanticUnknown)continue

        let targetFrame
        try{targetFrame=endpointFrame(targetRecord,target,frameCache)}catch{continue}

        for(const polarity of polarityOptions(match)){
          const candidate=solvePair(
            moving,source,targetRecord,target,sourceFrame,targetFrame,match,polarity,options,
          )
          if(candidate)results.push(candidate)
        }
      }
    }
  }

  results.sort(compareCandidates)
  const analysis=Math.min(results.length,Math.max(0,Math.floor(supportAnalysisLimit)))
  for(let index=0;index<analysis;index+=1){
    const candidate=results[index]
    candidate.supportPairs=collectMultiContactSupport(candidate,frameCache)
    candidate.supportCount=candidate.supportPairs.length
    candidate.occupancyPlan=occupancyPlanForPlacement(candidate,{connectionId:candidate.key})
    candidate.occupancy=options.occupancy?.canReserve
      ?options.occupancy.canReserve(candidate.occupancyPlan)
      :Object.freeze({accepted:true,conflicts:Object.freeze([])})
    candidate.rejectedBySupportOccupancy=
      candidate.occupancy.accepted===false&&!options.includeOccupied
    candidate.score=candidateScore(candidate,options)
  }
  const viable=results.filter(candidate=>candidate.rejectedBySupportOccupancy!==true)
  viable.sort(compareCandidates)

  const limit=Number.isFinite(maxResults)?Math.max(1,Math.floor(maxResults)):viable.length
  return Object.freeze(viable.slice(0,limit).map(candidate=>Object.freeze(candidate)))
}

export function findBestMechanicalCandidate(options={}){
  return findMechanicalCandidates({...options,maxResults:1})[0]??null
}
