export const RELEASED_CONNECTION_STATE_VERSION='mechanics-released-connection-state-0.1.0'

function normalizedId(id){
  const value=String(id??'').trim()
  return value||null
}

export function createReleasedConnectionState(){
  const ids=new Set()
  return Object.freeze({
    version:RELEASED_CONNECTION_STATE_VERSION,
    has(id){
      const value=normalizedId(id)
      return value?ids.has(value):false
    },
    release(id){
      const value=normalizedId(id)
      if(!value)return false
      const before=ids.size
      ids.add(value)
      return ids.size!==before
    },
    releaseMany(values=[]){
      let added=0
      for(const value of values)if(this.release(value))added+=1
      return added
    },
    reconnect(id){
      const value=normalizedId(id)
      return value?ids.delete(value):false
    },
    clear(){
      const count=ids.size
      ids.clear()
      return count
    },
    snapshot(){
      return Object.freeze([...ids].sort())
    },
  })
}

export function applyPhysicsJointRelease(event,{
  graph,
  occupancy,
  nativeObservedRecords,
  releasedConnections,
}={}){
  const observedIds=new Set()
  const occupancyIds=new Set()
  const removedConstraints=[]

  for(const constraintId of event?.constraintIds||[]){
    const id=String(constraintId)
    const edge=graph?.edge?.(id)
    if(!edge)continue
    const observedId=edge?.metadata?.observedConnectionId
    const occupancyId=edge?.metadata?.occupancy?.connectionId
    if(observedId)observedIds.add(String(observedId))
    if(occupancyId)occupancyIds.add(String(occupancyId))
    if(graph?.removeEdge?.(id))removedConstraints.push(id)
  }

  for(const observedId of observedIds){
    releasedConnections?.release?.(observedId)
    nativeObservedRecords?.delete?.(observedId)
    occupancy?.release?.(observedId)
  }
  for(const occupancyId of occupancyIds)occupancy?.release?.(occupancyId)

  return Object.freeze({
    jointId:event?.jointId??null,
    reason:event?.reason??'profile-disengaged',
    constraintIds:Object.freeze([...(event?.constraintIds||[])].map(String)),
    removedConstraints:Object.freeze(removedConstraints),
    observedConnectionIds:Object.freeze([...observedIds]),
    occupancyConnectionIds:Object.freeze([...occupancyIds]),
  })
}
