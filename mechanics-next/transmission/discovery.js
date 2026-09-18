import { deterministicId, createTransmission, evidence } from '../core/model.js'
import {
  differentialEquation,
  differentialSpiderEquation,
  gearMeshEquation,
  rigidRotationEquation,
} from './equations.js'
import { gearFrameForRecord, evaluateGearPair } from './gear-geometry.js'

export const TRANSMISSION_DISCOVERY_VERSION='mechanics-transmission-discovery-0.1.0'

function recordMap(records=[]){
  return new Map(records.map(record=>[record.instance.body.id,record]))
}
function rigidIslandIndex(graph){
  const index=new Map()
  for(const island of graph?.rigidIslands?.()||[]){
    const key=island.join('|')
    for(const bodyId of island)index.set(bodyId,key)
  }
  return index
}
function keyedRotationConstraint(edge){
  if(edge?.kind!=='constraint')return false
  if(edge?.metadata?.topology?.keyedRotation===true)return true
  const pair=edge?.metadata?.interfacePair||[]
  return pair.includes('axle')&&pair.includes('axle-hole')
}
function bodyRole(record){return record?.instance?.descriptor?.classification?.role||'unknown'}

function shaftCouplings(graph){
  const equations=[]
  const transmissions=[]
  for(const edge of graph?.edges?.('constraint')||[]){
    if(!keyedRotationConstraint(edge))continue
    const id=deterministicId('shaft-coupling',edge.id,edge.bodyA,edge.bodyB)
    const equation=rigidRotationEquation({id,bodyA:edge.bodyA,bodyB:edge.bodyB})
    equations.push(equation)
    transmissions.push(createTransmission({
      id,
      kind:'shaft-coupling',
      bodies:[edge.bodyA,edge.bodyB],
      equations:[equation],
      metadata:{constraintId:edge.id},
      evidence:evidence({source:'mechanics-next:keyed-constraint',confidence:'strong',reason:'keyed axle interface locks relative rotation'}),
    }))
  }
  return{equations,transmissions}
}

function gearMeshes(records,graph,options={},protectedClusters=[]){
  const islands=rigidIslandIndex(graph)
  const gears=records.map(record=>({record,gear:gearFrameForRecord(record)})).filter(item=>item.gear)
  const equations=[]
  const transmissions=[]
  const diagnostics=[]

  for(let i=0;i<gears.length;i+=1){
    for(let j=i+1;j<gears.length;j+=1){
      const a=gears[i],b=gears[j]
      if(islands.get(a.gear.bodyId)&&islands.get(a.gear.bodyId)===islands.get(b.gear.bodyId))continue
      if(protectedClusters.some(cluster=>cluster.has(a.gear.bodyId)&&cluster.has(b.gear.bodyId)))continue
      const geometry=evaluateGearPair(a.gear,b.gear,options)
      diagnostics.push(Object.freeze({
        bodyA:a.gear.bodyId,
        bodyB:b.gear.bodyId,
        kind:a.gear.kind,
        valid:Boolean(geometry.valid),
        geometry,
      }))
      if(!geometry.valid)continue

      const id=deterministicId('gear-mesh',a.gear.bodyId,b.gear.bodyId,a.gear.teeth,b.gear.teeth)
      const equation=gearMeshEquation({
        id,
        bodyA:a.gear.bodyId,
        bodyB:b.gear.bodyId,
        teethA:a.gear.teeth,
        teethB:b.gear.teeth,
        directionSign:geometry.directionSign,
      })
      equations.push(equation)
      transmissions.push(createTransmission({
        id,
        kind:a.gear.kind==='bevel'?'bevel-gear-mesh':'spur-gear-mesh',
        bodies:[a.gear.bodyId,b.gear.bodyId],
        parameters:{
          teethA:a.gear.teeth,
          teethB:b.gear.teeth,
          ratioAB:geometry.directionSign*a.gear.teeth/b.gear.teeth,
          geometry,
        },
        equations:[equation],
        metadata:{
          sourceA:a.gear.source,
          sourceB:b.gear.source,
        },
        evidence:evidence({
          source:'mechanics-next:gear-geometry',
          confidence:a.gear.source==='gear-geometry-evidence'||b.gear.source==='gear-geometry-evidence'?'strong':'inferred',
          reason:'compatible gear pitch geometry',
        }),
      }))
    }
  }
  return{equations,transmissions,diagnostics,gears}
}

function differentialGroups(records,relations=[]){
  const byBody=recordMap(records)
  const groups=new Map()
  for(const relation of relations){
    if(relation?.kind!=='differential-port')continue
    const a=byBody.get(relation.bodyA),b=byBody.get(relation.bodyB)
    const carrier=bodyRole(a)==='differential'?a:bodyRole(b)==='differential'?b:null
    const inner=carrier===a?b:carrier===b?a:null
    if(!carrier||!inner)continue
    const key=carrier.instance.body.id
    const list=groups.get(key)||[]
    list.push(inner)
    groups.set(key,list)
  }
  return groups
}

function discoverDifferentials(records,relations=[]){
  const byBody=recordMap(records)
  const groups=differentialGroups(records,relations)
  const equations=[]
  const transmissions=[]
  const diagnostics=[]
  const balancedClosures=[]
  const compoundMotions=[]

  for(const[carrierBody,innerRecords]of groups){
    const carrierRecord=byBody.get(carrierBody)
    const carrierGear=gearFrameForRecord(carrierRecord)
    if(!carrierGear){
      diagnostics.push(Object.freeze({carrierBody,status:'missing-carrier-axis'}))
      continue
    }

    const candidates=innerRecords.map(record=>({
      record,
      gear:gearFrameForRecord(record),
    })).filter(item=>item.gear)
      .map(item=>({
        ...item,
        alignment:Math.abs(
          item.gear.axis[0]*carrierGear.axis[0]+
          item.gear.axis[1]*carrierGear.axis[1]+
          item.gear.axis[2]*carrierGear.axis[2]
        ),
      }))
      .sort((a,b)=>b.alignment-a.alignment)

    const side=candidates.filter(item=>item.alignment>=.82).slice(0,2)
    const spider=candidates.filter(item=>item.alignment<.82)
    if(side.length!==2){
      diagnostics.push(Object.freeze({
        carrierBody,
        status:'underdetermined-side-gears',
        candidateCount:candidates.length,
        alignedCount:side.length,
        candidates:Object.freeze(candidates.map(item=>Object.freeze({
          bodyId:item.record.instance.body.id,
          alignment:item.alignment,
        }))),
      }))
      continue
    }

    const left=side[0].record.instance.body.id
    const right=side[1].record.instance.body.id
    const id=deterministicId('differential',carrierBody,left,right)
    const equation=differentialEquation({id,carrier:carrierBody,left,right})
    const balance=rigidRotationEquation({
      id:`${id}:balanced-preview`,
      bodyA:left,
      bodyB:right,
    })

    const spiderEquations=[]
    const referenceSpiderAxis=spider[0]?.gear?.axis??null
    for(const item of spider){
      const spiderBody=item.record.instance.body.id
      const directionSign=referenceSpiderAxis
        ?((item.gear.axis[0]*referenceSpiderAxis[0]+
           item.gear.axis[1]*referenceSpiderAxis[1]+
           item.gear.axis[2]*referenceSpiderAxis[2])>=0?1:-1)
        :1
      const spiderEquation=differentialSpiderEquation({
        id:`${id}:spider:${spiderBody}`,
        spider:spiderBody,
        left,
        right,
        directionSign,
      })
      spiderEquations.push(spiderEquation)
      compoundMotions.push(Object.freeze({
        kind:'differential-spider',
        bodyId:spiderBody,
        parentBodyId:carrierBody,
        orbitBodyId:carrierBody,
        spinBodyId:spiderBody,
        spinFrame:'carrier-relative',
        localAxis:Object.freeze([...item.gear.axis]),
        directionSign,
      }))
    }

    equations.push(equation,...spiderEquations)
    balancedClosures.push(balance)
    transmissions.push(createTransmission({
      id,
      kind:'open-differential',
      bodies:[carrierBody,left,right,...spider.map(item=>item.record.instance.body.id)],
      parameters:{
        sideBodies:[left,right],
        spiderBodies:spider.map(item=>item.record.instance.body.id),
        relation:'2*carrier-left-right=0',
        spiderRelation:'2*spider+left-right=0',
        underdeterminedWithSingleDriver:true,
      },
      equations:[equation,...spiderEquations],
      metadata:{
        carrierAxis:carrierGear.axis,
        carrierGearTeeth:carrierGear.teeth,
      },
      evidence:evidence({
        source:'mechanics-next:differential-port+geometry',
        confidence:'strong',
        reason:'two internal bevel gears aligned to carrier axis',
      }),
    }))
    diagnostics.push(Object.freeze({
      carrierBody,
      status:'resolved',
      sideBodies:Object.freeze([left,right]),
      spiderBodies:Object.freeze(spider.map(item=>item.record.instance.body.id)),
    }))
  }

  return{equations,transmissions,diagnostics,balancedClosures,compoundMotions}
}

export function discoverMechanicalTransmissions({
  records=[],
  graph,
  relations=[],
  gearOptions={},
}={}){
  const groups=differentialGroups(records,relations)
  const protectedClusters=[...groups.entries()].map(([carrier,inners])=>
    new Set([carrier,...inners.map(record=>record.instance.body.id)]))
  const shaft=shaftCouplings(graph)
  const gears=gearMeshes(records,graph,gearOptions,protectedClusters)
  const differentials=discoverDifferentials(records,relations)

  return Object.freeze({
    version:TRANSMISSION_DISCOVERY_VERSION,
    equations:Object.freeze([
      ...shaft.equations,
      ...gears.equations,
      ...differentials.equations,
    ]),
    transmissions:Object.freeze([
      ...shaft.transmissions,
      ...gears.transmissions,
      ...differentials.transmissions,
    ]),
    balancedDifferentialClosures:Object.freeze(differentials.balancedClosures),
    compoundMotions:Object.freeze(differentials.compoundMotions),
    diagnostics:Object.freeze({
      gearPairs:Object.freeze(gears.diagnostics),
      differentials:Object.freeze(differentials.diagnostics),
    }),
  })
}
