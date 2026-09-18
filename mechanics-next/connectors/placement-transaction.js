export const PLACEMENT_TRANSACTION_VERSION='mechanics-placement-transaction-0.1.0'

export async function commitPlacementTransaction(candidate,{
  adapter,
  occupancy=null,
  validate=null,
  commitConnection=null,
}={}){
  if(!candidate?.solution?.valid)return Object.freeze({accepted:false,reason:'invalid-candidate'})
  if(!adapter?.snapshot||!adapter?.setWorldPose||!adapter?.restore){
    throw new TypeError('placement transaction requires snapshot/setWorldPose/restore adapter')
  }

  const occupancyPlan=candidate.occupancyPlan??null
  if(occupancyPlan&&occupancy?.canReserve){
    const availability=occupancy.canReserve(occupancyPlan)
    if(!availability.accepted)return Object.freeze({
      accepted:false,reason:'occupied',conflicts:availability.conflicts,
    })
  }

  const snapshot=await adapter.snapshot(candidate.moving)
  let reserved=false
  let connection=null
  try{
    await adapter.setWorldPose(candidate.moving,{
      position:candidate.solution.worldPosition,
      quaternion:candidate.solution.worldQuaternion,
    })

    const validation=typeof validate==='function'
      ?await validate(candidate)
      :{valid:true}
    if(validation===false||validation?.valid===false){
      await adapter.restore(candidate.moving,snapshot)
      return Object.freeze({
        accepted:false,
        reason:`post-placement:${validation?.reason||'invalid'}`,
        validation,
      })
    }

    if(occupancyPlan&&occupancy?.reserve){
      const result=occupancy.reserve(occupancyPlan)
      if(!result.accepted){
        await adapter.restore(candidate.moving,snapshot)
        return Object.freeze({accepted:false,reason:'occupied',conflicts:result.conflicts})
      }
      reserved=true
    }

    if(typeof commitConnection==='function'){
      connection=await commitConnection(candidate)
      if(connection===false||connection?.accepted===false){
        if(reserved)occupancy?.release?.(occupancyPlan.connectionId)
        await adapter.restore(candidate.moving,snapshot)
        return Object.freeze({
          accepted:false,
          reason:connection?.reason||'connection-rejected',
          connection,
        })
      }
    }

    return Object.freeze({
      accepted:true,
      version:PLACEMENT_TRANSACTION_VERSION,
      candidateKey:candidate.key,
      connection,
    })
  }catch(error){
    if(reserved)occupancy?.release?.(occupancyPlan?.connectionId)
    try{await adapter.restore(candidate.moving,snapshot)}catch{}
    return Object.freeze({
      accepted:false,
      reason:'transaction-error',
      error:String(error?.message||error),
    })
  }
}
