export const OCCUPANCY_VERSION='mechanics-occupancy-0.1.0'
export const OCCUPANCY_EPS=1e-5

function normalizeInterval(interval){
  const values=Array.isArray(interval)?interval:[interval?.start,interval?.end]
  if(!Number.isFinite(values?.[0])||!Number.isFinite(values?.[1]))throw new TypeError('interval requires finite endpoints')
  const start=Math.min(values[0],values[1]),end=Math.max(values[0],values[1])
  if(end-start<=OCCUPANCY_EPS)throw new RangeError('interval must have positive length')
  return[start,end]
}

export function intervalOverlap(a,b,epsilon=OCCUPANCY_EPS){
  const[a0,a1]=normalizeInterval(a),[b0,b1]=normalizeInterval(b)
  const start=Math.max(a0,b0),end=Math.min(a1,b1),length=end-start
  return Object.freeze({
    overlaps:length>epsilon,
    touches:Math.abs(length)<=epsilon,
    interval:length>epsilon?Object.freeze([start,end]):null,
    length:Math.max(0,length),
  })
}

export function endpointChannel(bodyId,endpointId){
  const body=String(bodyId||'').trim(),endpoint=String(endpointId||'').trim()
  if(!body||!endpoint)throw new TypeError('bodyId and endpointId are required')
  return`${body}::${endpoint}`
}

export class OccupancyLedger{
  #exclusive=new Map()
  #axial=new Map()

  exclusiveOwner(channel){return this.#exclusive.get(String(channel||''))??null}

  axialReservations(channel){
    return Object.freeze((this.#axial.get(String(channel||''))||[]).map(item=>Object.freeze({
      ...item,interval:Object.freeze([...item.interval]),
    })))
  }

  conflicts(plan,{ignoreConnectionId=null}={}){
    const result=[]
    for(const channel of plan?.exclusiveChannels||[]){
      const owner=this.#exclusive.get(channel)
      if(owner&&owner!==ignoreConnectionId&&owner!==plan.connectionId){
        result.push(Object.freeze({type:'exclusive-endpoint',channel,connectionId:owner}))
      }
    }
    for(const reservation of plan?.axialReservations||[]){
      const list=this.#axial.get(reservation.channel)||[]
      for(const existing of list){
        if(existing.connectionId===ignoreConnectionId||existing.connectionId===plan.connectionId)continue
        const overlap=intervalOverlap(existing.interval,reservation.interval)
        if(overlap.overlaps)result.push(Object.freeze({
          type:'axial-overlap',
          channel:reservation.channel,
          connectionId:existing.connectionId,
          overlap,
        }))
      }
    }
    return Object.freeze(result)
  }

  canReserve(plan,options={}){
    const conflicts=this.conflicts(plan,options)
    return Object.freeze({accepted:conflicts.length===0,conflicts})
  }

  reserve(plan,{replace=false}={}){
    if(!plan?.connectionId)throw new TypeError('occupancy plan requires connectionId')
    if(replace)this.release(plan.connectionId)
    const availability=this.canReserve(plan)
    if(!availability.accepted)return Object.freeze({
      accepted:false,conflicts:availability.conflicts,
    })

    for(const channel of plan.exclusiveChannels||[])this.#exclusive.set(channel,plan.connectionId)
    for(const reservation of plan.axialReservations||[]){
      const list=this.#axial.get(reservation.channel)||[]
      list.push(Object.freeze({
        connectionId:plan.connectionId,
        interval:Object.freeze(normalizeInterval(reservation.interval)),
        occupantBodyId:reservation.occupantBodyId??null,
        metadata:reservation.metadata??null,
      }))
      list.sort((a,b)=>a.interval[0]-b.interval[0]||a.interval[1]-b.interval[1]||a.connectionId.localeCompare(b.connectionId))
      this.#axial.set(reservation.channel,list)
    }
    return Object.freeze({accepted:true,conflicts:Object.freeze([])})
  }

  release(connectionId){
    const wanted=String(connectionId||'')
    let removed=0
    for(const[channel,owner]of[...this.#exclusive]){
      if(owner!==wanted)continue
      this.#exclusive.delete(channel);removed+=1
    }
    for(const[channel,list]of[...this.#axial]){
      const next=list.filter(item=>item.connectionId!==wanted)
      removed+=list.length-next.length
      if(next.length)this.#axial.set(channel,next)
      else this.#axial.delete(channel)
    }
    return removed
  }

  freeIntervals(channel,bounds,epsilon=OCCUPANCY_EPS){
    const[min,max]=normalizeInterval(bounds)
    const occupied=this.axialReservations(channel)
      .map(item=>[Math.max(min,item.interval[0]),Math.min(max,item.interval[1])])
      .filter(([start,end])=>end-start>epsilon)
      .sort((a,b)=>a[0]-b[0])
    const merged=[]
    for(const interval of occupied){
      const last=merged.at(-1)
      if(!last||interval[0]>last[1]+epsilon)merged.push([...interval])
      else last[1]=Math.max(last[1],interval[1])
    }
    const free=[]
    let cursor=min
    for(const[start,end]of merged){
      if(start-cursor>epsilon)free.push([cursor,start])
      cursor=Math.max(cursor,end)
    }
    if(max-cursor>epsilon)free.push([cursor,max])
    return Object.freeze(free.map(interval=>Object.freeze(interval)))
  }

  snapshot(){
    return Object.freeze({
      exclusive:Object.freeze(Object.fromEntries(this.#exclusive)),
      axial:Object.freeze(Object.fromEntries([...this.#axial].map(([channel,list])=>[
        channel,list.map(item=>({...item,interval:[...item.interval]})),
      ]))),
    })
  }

  clear(){this.#exclusive.clear();this.#axial.clear()}
}

export function occupancyStateForEndpoint(ledger,bodyId,endpoint,{minimumFreeLdu=1}={}){
  if(!ledger||!bodyId||!endpoint?.id)return Object.freeze({
    known:false,occupied:false,available:true,partiallyOccupied:false,fullyOccupied:false,
    exclusiveOwner:null,axialReservations:Object.freeze([]),freeAxialIntervals:Object.freeze([]),
  })
  const channel=endpointChannel(bodyId,endpoint.id)
  const exclusiveOwner=ledger.exclusiveOwner(channel)
  const axialReservations=ledger.axialReservations(channel)
  const sections=Array.isArray(endpoint?.profile?.sections)?endpoint.profile.sections:[]
  const totalLdu=sections.reduce((sum,section)=>sum+Math.max(0,Number(section?.lengthLdu)||0),0)
  const bounds=totalLdu>0
    ?(endpoint?.profile?.centered===true?[-totalLdu/2,totalLdu/2]:[0,totalLdu])
    :null
  const freeAxialIntervals=!exclusiveOwner&&axialReservations.length&&bounds
    ?ledger.freeIntervals(channel,bounds)
    :Object.freeze([])
  const usableFreeInterval=freeAxialIntervals.some(interval=>
    Number(interval?.[1])-Number(interval?.[0])>=Math.max(0,Number(minimumFreeLdu)||0)
  )
  const partiallyOccupied=!exclusiveOwner&&axialReservations.length>0&&usableFreeInterval
  const fullyOccupied=Boolean(exclusiveOwner)||(axialReservations.length>0&&!usableFreeInterval)
  return Object.freeze({
    known:true,
    occupied:fullyOccupied,
    available:!fullyOccupied,
    partiallyOccupied,
    fullyOccupied,
    exclusiveOwner,
    axialReservations,
    freeAxialIntervals,
  })
}

export function occupancyPlanForPlacement(candidate,{connectionId}={}){
  const id=String(connectionId||candidate?.id||candidate?.key||'').trim()
  if(!id)throw new TypeError('connectionId is required')
  const source=candidate?.source,target=candidate?.target,match=candidate?.match
  const sourceBody=candidate?.sourceBodyId,targetBody=candidate?.targetBodyId
  const exclusiveChannels=[]
  const axialReservations=[]

  const primaryPair=new Set(match?.interfacePair||[])
  const primaryIsStud=primaryPair.has('stud')&&primaryPair.has('anti-stud')
  const studBundle=primaryIsStud?(candidate?.supportPairs||[]).filter(pair=>{
    const values=new Set(pair?.match?.interfacePair||[])
    return values.has('stud')&&values.has('anti-stud')
  }):[]
  if(studBundle.length>=2){
    for(const pair of studBundle){
      if(sourceBody&&pair?.source?.id)exclusiveChannels.push(endpointChannel(sourceBody,pair.source.id))
      if(targetBody&&pair?.target?.id)exclusiveChannels.push(endpointChannel(targetBody,pair.target.id))
    }
    return Object.freeze({
      connectionId:id,
      exclusiveChannels:Object.freeze([...new Set(exclusiveChannels)]),
      axialReservations:Object.freeze([]),
    })
  }

  if(match?.family==='cylinder'&&match.male&&match.female){
    const male=match.male,female=match.female
    const maleBody=source===male?sourceBody:targetBody
    const femaleBody=source===female?sourceBody:targetBody
    exclusiveChannels.push(endpointChannel(femaleBody,female.id))
    const interval=candidate?.solution?.axial?.fit?.best?.occupiedMaleInterval
      ??candidate?.solution?.axial?.fit?.requested?.occupiedMaleInterval
      ??null
    if(interval)axialReservations.push(Object.freeze({
      channel:endpointChannel(maleBody,male.id),
      interval:Object.freeze([...interval]),
      occupantBodyId:femaleBody,
      metadata:Object.freeze({family:'cylinder'}),
    }))
  }else if(match?.family==='clip-cylinder'&&match.male){
    const male=match.male
    const clip=source?.family==='clip'?source:target?.family==='clip'?target:null
    const maleBody=source===male?sourceBody:targetBody
    const clipBody=source===clip?sourceBody:targetBody
    if(clip&&clipBody)exclusiveChannels.push(endpointChannel(clipBody,clip.id))
    const interval=candidate?.solution?.axial?.fit?.best?.occupiedMaleInterval
      ??candidate?.solution?.axial?.fit?.requested?.occupiedMaleInterval
      ??null
    if(interval&&maleBody)axialReservations.push(Object.freeze({
      channel:endpointChannel(maleBody,male.id),
      interval:Object.freeze([...interval]),
      occupantBodyId:clipBody,
      metadata:Object.freeze({family:'clip-cylinder'}),
    }))
  }else{
    if(sourceBody&&source?.id)exclusiveChannels.push(endpointChannel(sourceBody,source.id))
    if(targetBody&&target?.id)exclusiveChannels.push(endpointChannel(targetBody,target.id))
  }

  return Object.freeze({
    connectionId:id,
    exclusiveChannels:Object.freeze([...new Set(exclusiveChannels)]),
    axialReservations:Object.freeze(axialReservations),
  })
}
