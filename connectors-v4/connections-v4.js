import { axialSpanV4 } from './schema-v4.js?v=connector-v4-20260910-v3'
import { proposeConstraintV4 } from './constraints-v4.js?v=connector-v4-20260910-v1'
import { createAxialOccupancyV4 } from './occupancy-v4.js?v=connector-v4-20260910-v1'

export const CONNECTION_SCHEMA_VERSION_V4 = 4
export const CONNECTION_GRAPH_VERSION_V4 = 'connection-graph-v4.0.0'
const EPS = 1e-6

export function endpointKeyV4(instanceId, endpointId) {
  if (!instanceId || !endpointId) return ''
  return `${instanceId}::${endpointId}`
}

function endpointFrom(object,connector) {
  const instanceId=object?.userData?.instanceId
  if (!instanceId || !connector?.endpointId) throw new TypeError('V4 connection endpoint requires instanceId and endpointId')
  return {
    instanceId,
    partId:object.userData?.partId || null,
    endpointId:connector.endpointId,
    family:connector.family,
    gender:connector.gender || connector.geometry?.firstGender || null,
  }
}

function maleFemaleCandidate(candidate) {
  const a=candidate?.source
  const b=candidate?.target
  if (a?.family !== 'cylinder' || b?.family !== 'cylinder') return null
  if (a.gender==='male' && b.gender==='female') return {male:a,female:b,maleObject:candidate.sourceObject,femaleObject:candidate.targetObject,movingMale:true}
  if (b.gender==='male' && a.gender==='female') return {male:b,female:a,maleObject:candidate.targetObject,femaleObject:candidate.sourceObject,movingMale:false}
  return null
}

function cylinderReservation(candidate) {
  const pair=maleFemaleCandidate(candidate)
  if (!pair) return null
  const axial=candidate.solution?.axial
  if (!axial || !Number.isFinite(axial.offsetLdu)) return null
  const maleOffset=axial.offsetLdu*(pair.movingMale?1:-1)
  const maleSpan=axialSpanV4(pair.male)
  const femaleSpan=axialSpanV4(pair.female)
  // evaluateMaleOffset defines male coordinates shifted by `maleOffset` into the
  // female frame. Convert the female occupied span back into male-local LDU.
  const start=Math.max(maleSpan[0],femaleSpan[0]-maleOffset)
  const end=Math.min(maleSpan[1],femaleSpan[1]-maleOffset)
  if (!(end-start>EPS)) return null
  return {
    channelKey:endpointKeyV4(pair.maleObject.userData.instanceId,pair.male.endpointId),
    maleEndpointId:pair.male.endpointId,
    femaleEndpointId:pair.female.endpointId,
    interval:[start,end],
    maleSpan:[...maleSpan],
    femaleSpan:[...femaleSpan],
    maleOffsetLdu:maleOffset,
  }
}

function exclusiveEndpointsFor(candidate) {
  const source=endpointFrom(candidate.sourceObject,candidate.source)
  const target=endpointFrom(candidate.targetObject,candidate.target)
  if (candidate.source.family==='cylinder' && candidate.target.family==='cylinder') {
    // A female bore cannot accept two physical shafts at once. A long male profile
    // is intentionally NOT exclusive; interval occupancy decides whether another
    // beam/gear/bush can use another region of the same axle/pin/bar.
    return [candidate.source.gender==='female'?source:target]
  }
  if (candidate.source.family==='clip' && candidate.target.family==='cylinder') return [source]
  if (candidate.target.family==='clip' && candidate.source.family==='cylinder') return [target]
  return [source,target]
}

function connectionIdFor(a,b) {
  return `v4conn:${[endpointKeyV4(a.instanceId,a.endpointId),endpointKeyV4(b.instanceId,b.endpointId)].sort().join('<>')}`
}

export function createConnectionProposalV4(candidate,{metadata=null}={}) {
  if (!candidate?.solution?.valid || !candidate?.match?.compatible) throw new TypeError('A valid V4 placement candidate is required')
  const a=endpointFrom(candidate.sourceObject,candidate.source)
  const b=endpointFrom(candidate.targetObject,candidate.target)
  const reservation=cylinderReservation(candidate)
  const exclusiveEndpoints=exclusiveEndpointsFor(candidate)
  const constraint=proposeConstraintV4(candidate.match,{source:'connector-v4-geometry'})
  return {
    schemaVersion:CONNECTION_SCHEMA_VERSION_V4,
    graphVersion:CONNECTION_GRAPH_VERSION_V4,
    id:connectionIdFor(a,b),
    status:'candidate',
    placementOnly:false,
    physicsReady:false,
    a,b,
    match:{
      family:candidate.match.family,
      reason:candidate.match.reason,
      keyed:Boolean(candidate.match.keyed),
      rotationalSymmetry:candidate.match.rotationalSymmetry ?? null,
      editorMotion:{...(candidate.match.editorMotion||{})},
    },
    placement:{
      solverVersion:candidate.solution.solverVersion,
      axialOffsetLdu:candidate.solution.axial?.offsetLdu ?? 0,
      placementMode:candidate.solution.placementMode || 'aligned',
    },
    constraint,
    occupancy:reservation,
    occupancyReady:Boolean(reservation || candidate.match.family!=='cylinder'),
    exclusiveEndpointKeys:exclusiveEndpoints.map(endpoint=>endpointKeyV4(endpoint.instanceId,endpoint.endpointId)),
    metadata:metadata && typeof metadata==='object'?structuredClone(metadata):null,
  }
}

function clone(value){return typeof structuredClone==='function'?structuredClone(value):JSON.parse(JSON.stringify(value))}

export function createConnectionGraphV4() {
  const connections=new Map()
  const exclusiveOwners=new Map()
  const axial=createAxialOccupancyV4()

  function conflictsFor(proposal) {
    const conflicts=[]
    for (const key of proposal?.exclusiveEndpointKeys ?? []) {
      const owner=exclusiveOwners.get(key)
      if (owner && owner!==proposal.id) conflicts.push({type:'exclusive-endpoint',key,connectionId:owner})
    }
    const reservation=proposal?.occupancy
    if (reservation) {
      const found=axial.conflicts(reservation.channelKey,reservation.interval,{ignoreConnectionId:proposal.id})
      for (const conflict of found) conflicts.push({type:'axial-overlap',channelKey:reservation.channelKey,connectionId:conflict.item.connectionId,overlap:conflict.overlap})
    }
    return conflicts
  }

  function add(proposal) {
    if (!proposal?.id || proposal.schemaVersion!==CONNECTION_SCHEMA_VERSION_V4) return {accepted:false,reason:'invalid-proposal',conflicts:[]}
    if (connections.has(proposal.id)) return {accepted:false,reason:'duplicate-connection',conflicts:[]}
    const conflicts=conflictsFor(proposal)
    if (conflicts.length) return {accepted:false,reason:'occupied',conflicts}

    if (proposal.occupancy) {
      const reserved=axial.reserve(proposal.occupancy.channelKey,{
        connectionId:proposal.id,
        occupantId:proposal.b.instanceId,
        interval:proposal.occupancy.interval,
        meta:{a:proposal.a,b:proposal.b},
      })
      if (!reserved.accepted) return {accepted:false,reason:'axial-overlap',conflicts:reserved.conflicts}
    }
    for (const key of proposal.exclusiveEndpointKeys ?? []) exclusiveOwners.set(key,proposal.id)
    const stored=clone({...proposal,status:'connected'})
    connections.set(stored.id,stored)
    return {accepted:true,connection:clone(stored),conflicts:[]}
  }

  function remove(connectionId) {
    const existing=connections.get(connectionId)
    if (!existing) return false
    connections.delete(connectionId)
    axial.releaseConnection(connectionId)
    for (const [key,owner] of [...exclusiveOwners]) if (owner===connectionId) exclusiveOwners.delete(key)
    return true
  }

  function removePart(instanceId) {
    const ids=[...connections.values()].filter(connection=>connection.a.instanceId===instanceId||connection.b.instanceId===instanceId).map(connection=>connection.id)
    for (const id of ids) remove(id)
    return ids.length
  }

  return {
    version:CONNECTION_GRAPH_VERSION_V4,
    canAdd(proposal){const conflicts=conflictsFor(proposal);return{accepted:conflicts.length===0,conflicts}},
    add,
    remove,
    removePart,
    get(id){const value=connections.get(id);return value?clone(value):null},
    list(){return [...connections.values()].map(clone)},
    forPart(instanceId){return [...connections.values()].filter(connection=>connection.a.instanceId===instanceId||connection.b.instanceId===instanceId).map(clone)},
    endpointOwner(instanceId,endpointId){return exclusiveOwners.get(endpointKeyV4(instanceId,endpointId))||null},
    axialReservations(channelKey){return axial.query(channelKey)},
    clear(){connections.clear();exclusiveOwners.clear();axial.clear()},
    stats(){return{connections:connections.size,exclusiveEndpoints:exclusiveOwners.size,axialChannels:new Set([...connections.values()].map(c=>c.occupancy?.channelKey).filter(Boolean)).size}},
  }
}
