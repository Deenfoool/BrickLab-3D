import { deterministicId, createTransmission, evidence } from '../core/model.js'
import {
  differentialEquation,
  differentialSpiderEquation,
  gearMeshEquation,
  packagedDifferentialEquation,
  rackPinionEquation,
  rigidRotationEquation,
  rotationCouplingEquation,
} from './equations.js'
import { gearFrameForRecord, evaluateGearPair } from './gear-geometry.js'
import { rackFrameForRecord, evaluateRackPinionPair } from './rack-geometry.js'
import { discoverCompoundMechanisms } from '../compounds/discovery.js'

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
    const polarity=Number(edge?.metadata?.axisPolarity)<0?-1:1
    const equation=rotationCouplingEquation({
      id,
      bodyA:edge.bodyA,
      bodyB:edge.bodyB,
      ratioAB:polarity,
      kind:'shaft-coupling',
    })
    equations.push(equation)
    transmissions.push(createTransmission({
      id,
      kind:'shaft-coupling',
      bodies:[edge.bodyA,edge.bodyB],
      equations:[equation],
      metadata:{constraintId:edge.id,axisPolarity:polarity},
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

function transmissionPortEdges(graph,packageBodyId){
  return (graph?.edges?.('constraint')||[])
    .filter(edge=>String(edge?.metadata?.transmissionPort?.packageBodyId||'')===String(packageBodyId))
}

function packagedPortBindings(graph,packageBodyId){
  const grouped=new Map()
  for(const edge of transmissionPortEdges(graph,packageBodyId)){
    const port=edge.metadata.transmissionPort
    const list=grouped.get(port.portRole)||[]
    list.push(Object.freeze({
      edge,
      bodyId:String(port.externalBodyId),
      instanceId:String(port.externalInstanceId),
      polarity:Number(port.axisPolarity)<0?-1:1,
      portId:String(port.portId),
    }))
    grouped.set(port.portRole,list)
  }
  return grouped
}

function onePort(grouped,role){
  const values=grouped.get(role)||[]
  return values.length===1?values[0]:null
}

function discoverPackagedTransmissions(records,graph,{controlState=null}={}){
  const equations=[]
  const transmissions=[]
  const diagnostics=[]

  for(const record of records){
    const classification=record?.instance?.descriptor?.classification
    const properties=classification?.properties||{}
    const packageData=properties.packagedTransmission
    if(!packageData)continue
    if(['universal-joint','cv-joint'].includes(classification.role))continue

    const bodyId=record.instance.body.id
    const instanceId=record.instance.body.instanceId
    const grouped=packagedPortBindings(graph,bodyId)
    const input=onePort(grouped,'input')
    const output=onePort(grouped,'output')
    const ambiguous=[...grouped.entries()]
      .filter(([,values])=>values.length>1)
      .map(([portRole,values])=>Object.freeze({
        portRole,
        count:values.length,
        bodyIds:Object.freeze(values.map(item=>item.bodyId)),
      }))

    const runtimeState=typeof controlState==='function'?controlState(instanceId):null
    const mode=String(runtimeState?.mode||'forward')
    const modes=packageData.modes||{}
    const rawRatio=Number(modes[mode]??modes.forward??0)

    if(ambiguous.length){
      diagnostics.push(Object.freeze({
        kind:classification.role==='worm'?'worm-drive':'packaged-transmission',
        bodyId,
        instanceId,
        status:'ambiguous-port-binding',
        mode,
        ambiguous:Object.freeze(ambiguous),
      }))
      continue
    }

    if(!input||!output){
      diagnostics.push(Object.freeze({
        kind:classification.role==='worm'?'worm-drive':'packaged-transmission',
        bodyId,
        instanceId,
        status:'awaiting-ports',
        mode,
        inputConnected:Boolean(input),
        outputConnected:Boolean(output),
      }))
      continue
    }

    const ratio=rawRatio*input.polarity*output.polarity
    const id=deterministicId('packaged-transmission',bodyId,input.bodyId,output.bodyId)
    const kind=classification.role==='worm'?'worm-drive':'packaged-transmission'
    const effectiveModes=Object.freeze(Object.fromEntries(
      Object.entries(modes)
        .filter(([,value])=>Number.isFinite(Number(value)))
        .map(([key,value])=>[
          String(key),
          Number(value)*input.polarity*output.polarity,
        ]),
    ))
    const equation=Math.abs(ratio)>1e-12
      ?Object.freeze({
          ...rotationCouplingEquation({
            id,
            bodyA:input.bodyId,
            bodyB:output.bodyId,
            ratioAB:ratio,
            kind,
          }),
          metadata:Object.freeze({
            ...rotationCouplingEquation({
              id,
              bodyA:input.bodyId,
              bodyB:output.bodyId,
              ratioAB:ratio,
              kind,
            }).metadata,
            physicsExclude:true,
            controlId:instanceId,
          }),
        })
      :null
    if(equation)equations.push(equation)

    const physicalRatio=Number(effectiveModes.forward)||
      Object.values(effectiveModes).find(value=>Math.abs(Number(value))>1e-12)||
      1
    const physicalBase=rotationCouplingEquation({
      id:`${id}:physics-control`,
      bodyA:input.bodyId,
      bodyB:output.bodyId,
      ratioAB:physicalRatio,
      kind:`${kind}-physics-control`,
    })
    const physicsEquation=Object.freeze({
      ...physicalBase,
      metadata:Object.freeze({
        ...physicalBase.metadata,
        controlledTransmission:true,
        controlId:instanceId,
        modeRatios:effectiveModes,
        defaultMode:mode,
        packageKind:kind,
      }),
    })

    transmissions.push(createTransmission({
      id,
      kind,
      bodies:[input.bodyId,output.bodyId],
      parameters:{
        housingBodyId:bodyId,
        housingInstanceId:instanceId,
        controlId:instanceId,
        mode,
        modeRatios:effectiveModes,
        ratioAB:ratio,
        rawRatio,
        inputPolarity:input.polarity,
        outputPolarity:output.polarity,
        efficiency:packageData.efficiency??null,
        backdriveEfficiency:packageData.wormDrive?.backdriveEfficiency??null,
        neutral:Math.abs(rawRatio)<=1e-12,
      },
      equations:[physicsEquation],
      metadata:{
        inputConstraintId:input.edge.id,
        outputConstraintId:output.edge.id,
        controlledPhysics:true,
      },
      evidence:evidence({
        source:'mechanics-next:explicit-package-ports',
        confidence:'verified',
        reason:'catalog transmission input/output connector IDs and mode ratio',
      }),
    }))
    diagnostics.push(Object.freeze({
      kind,
      bodyId,
      instanceId,
      status:equation?'resolved':'neutral',
      mode,
      ratioAB:ratio,
      inputBodyId:input.bodyId,
      outputBodyId:output.bodyId,
    }))
  }
  return{equations,transmissions,diagnostics}
}

function discoverPackagedDifferentials(records,graph){
  const equations=[]
  const transmissions=[]
  const diagnostics=[]
  const balancedClosures=[]

  for(const record of records){
    const classification=record?.instance?.descriptor?.classification
    const data=classification?.properties?.packagedDifferential
    if(!data)continue

    const bodyId=record.instance.body.id
    const instanceId=record.instance.body.instanceId
    const grouped=packagedPortBindings(graph,bodyId)
    const input=onePort(grouped,'input')
    const left=onePort(grouped,'left')
    const right=onePort(grouped,'right')
    const ambiguous=[...grouped.entries()]
      .filter(([,values])=>values.length>1)
      .map(([portRole,values])=>Object.freeze({
        portRole,
        count:values.length,
        bodyIds:Object.freeze(values.map(item=>item.bodyId)),
      }))

    if(ambiguous.length){
      diagnostics.push(Object.freeze({
        kind:'packaged-differential',
        bodyId,instanceId,
        status:'ambiguous-port-binding',
        ambiguous:Object.freeze(ambiguous),
      }))
      continue
    }
    if(!input||!left||!right){
      diagnostics.push(Object.freeze({
        kind:'packaged-differential',
        bodyId,instanceId,
        status:'awaiting-ports',
        inputConnected:Boolean(input),
        leftConnected:Boolean(left),
        rightConnected:Boolean(right),
      }))
      continue
    }

    const ratio=Number(data.ratio)||1
    const id=deterministicId(
      'packaged-differential',
      bodyId,input.bodyId,left.bodyId,right.bodyId,
    )
    const equation=packagedDifferentialEquation({
      id,
      input:input.bodyId,
      left:left.bodyId,
      right:right.bodyId,
      ratio,
      inputSign:input.polarity,
      leftSign:left.polarity,
      rightSign:right.polarity,
    })
    const balanced=rotationCouplingEquation({
      id:`${id}:balanced-preview`,
      bodyA:left.bodyId,
      bodyB:right.bodyId,
      ratioAB:left.polarity*right.polarity,
      kind:'packaged-differential-balanced-preview',
    })
    equations.push(equation)
    balancedClosures.push(balanced)
    transmissions.push(createTransmission({
      id,
      kind:'open-differential',
      bodies:[input.bodyId,left.bodyId,right.bodyId],
      parameters:{
        packaged:true,
        housingBodyId:bodyId,
        housingInstanceId:instanceId,
        ratio,
        inputPolarity:input.polarity,
        leftPolarity:left.polarity,
        rightPolarity:right.polarity,
        efficiency:data.efficiency??null,
        torqueSplit:data.torqueSplit??null,
        underdeterminedWithSingleDriver:true,
      },
      equations:[equation],
      metadata:{
        inputConstraintId:input.edge.id,
        leftConstraintId:left.edge.id,
        rightConstraintId:right.edge.id,
      },
      evidence:evidence({
        source:'mechanics-next:explicit-differential-ports',
        confidence:'verified',
        reason:'catalog differential input/left/right connector IDs',
      }),
    }))
    diagnostics.push(Object.freeze({
      kind:'packaged-differential',
      bodyId,instanceId,
      status:'resolved',
      inputBodyId:input.bodyId,
      leftBodyId:left.bodyId,
      rightBodyId:right.bodyId,
      ratio,
    }))
  }

  return{equations,transmissions,diagnostics,balancedClosures}
}

function rackPinionMeshes(records,graph){
  const islands=rigidIslandIndex(graph)
  const gears=records
    .map(record=>({record,gear:gearFrameForRecord(record)}))
    .filter(item=>item.gear?.kind==='spur')
  const racks=records
    .map(record=>({record,rack:rackFrameForRecord(record)}))
    .filter(item=>item.rack)
  const equations=[]
  const transmissions=[]
  const diagnostics=[]
  const linearMotions=[]
  const motionBodies=new Set()

  for(const rackItem of racks){
    const guide=(graph?.neighbors?.(rackItem.rack.bodyId,{kind:'constraint'})||[])
      .find(item=>(item.edge?.constraintKind??item.edge?.kind)==='prismatic')??null

    for(const gearItem of gears){
      if(islands.get(gearItem.gear.bodyId)&&
         islands.get(gearItem.gear.bodyId)===islands.get(rackItem.rack.bodyId))continue
      const geometry=evaluateRackPinionPair(gearItem.gear,rackItem.rack)
      diagnostics.push(Object.freeze({
        kind:'rack-pinion',
        gearBodyId:gearItem.gear.bodyId,
        rackBodyId:rackItem.rack.bodyId,
        valid:Boolean(geometry.valid),
        guideConstraintId:guide?.edge?.id??null,
        geometry,
      }))
      if(!geometry.valid||!guide)continue

      const id=deterministicId(
        'rack-pinion',
        gearItem.gear.bodyId,
        rackItem.rack.bodyId,
      )
      const equation=rackPinionEquation({
        id,
        gearBody:gearItem.gear.bodyId,
        rackBody:rackItem.rack.bodyId,
        pitchRadius:gearItem.gear.pitchRadius,
        direction:geometry.travelSign,
      })
      equations.push(equation)
      transmissions.push(createTransmission({
        id,
        kind:'rack-pinion',
        bodies:[gearItem.gear.bodyId,rackItem.rack.bodyId],
        parameters:{
          pitchRadius:gearItem.gear.pitchRadius,
          direction:geometry.travelSign,
          geometry,
          guideConstraintId:guide.edge.id,
        },
        equations:[equation],
        evidence:evidence({
          source:'mechanics-next:rack-pinion-geometry',
          confidence:'strong',
          reason:'module-matched pinion at rack pitch line with prismatic guide',
        }),
      }))
      if(!motionBodies.has(rackItem.rack.bodyId)){
        motionBodies.add(rackItem.rack.bodyId)
        linearMotions.push(Object.freeze({
          kind:'rack-pinion-output',
          bodyId:rackItem.rack.bodyId,
          parentBodyId:guide.bodyId??null,
          axis:Object.freeze([...rackItem.rack.travelAxis]),
          channel:'slide',
          source:'rack-pinion-geometry',
          maxTravelStud:rackItem.rack.maxTravelStud,
        }))
      }
    }
  }
  return{equations,transmissions,diagnostics,linearMotions}
}

function transmissionCoverage(records,{gears,racks,packaged,differentials,compounds}={}){
  const gearBodies=new Set((gears?.gears||[]).map(item=>item.gear.bodyId))
  const rackBodies=new Set(records
    .filter(record=>rackFrameForRecord(record))
    .map(record=>record.instance.body.id))
  const packagedBodies=new Set((packaged?.diagnostics||[]).map(item=>item.bodyId))
  const packagedDiffBodies=new Set((differentials?.diagnostics||[])
    .filter(item=>item.kind==='packaged-differential')
    .map(item=>item.bodyId))
  const compoundBodies=new Set((compounds?.descriptors||[]).map(item=>item.bodyId))
  const items=[]

  for(const record of records){
    const classification=record?.instance?.descriptor?.classification
    if(!classification?.capabilities?.transmission)continue
    const role=classification.role
    const bodyId=record.instance.body.id
    let supported=false
    let model=null

    if(['spur-gear','bevel-gear','crown-gear','clutch-gear'].includes(role)){
      supported=gearBodies.has(bodyId)
      model='gear-geometry'
    }else if(role==='rack'){
      supported=rackBodies.has(bodyId)
      model='rack-geometry'
    }else if(['gearbox','worm'].includes(role)&&classification.properties?.packagedTransmission){
      supported=packagedBodies.has(bodyId)
      model='packaged-port-ratio'
    }else if(role==='packaged-differential'){
      supported=packagedDiffBodies.has(bodyId)
      model='packaged-differential'
    }else if(role==='differential'){
      supported=true
      model='structural-differential'
    }else if(['universal-joint','cv-joint','linear-actuator','driving-ring'].includes(role)){
      supported=compoundBodies.has(bodyId)||role==='driving-ring'
      model='compound-mechanism'
    }else if(role==='pulley'||role==='sprocket'){
      supported=false
      model='explicit-belt-or-chain-required'
    }else if(role==='worm'){
      supported=false
      model='physical-worm-geometry-unresolved'
    }

    items.push(Object.freeze({
      bodyId,
      instanceId:record.instance.body.instanceId,
      partId:record.instance.body.partId,
      role,
      supported,
      model,
    }))
  }
  return Object.freeze(items)
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
        carrier:carrierBody,
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
  compoundState=null,
  controlState=null,
}={}){
  const groups=differentialGroups(records,relations)
  const protectedClusters=[...groups.entries()].map(([carrier,inners])=>
    new Set([carrier,...inners.map(record=>record.instance.body.id)]))
  const shaft=shaftCouplings(graph)
  const gears=gearMeshes(records,graph,gearOptions,protectedClusters)
  const racks=rackPinionMeshes(records,graph)
  const packaged=discoverPackagedTransmissions(records,graph,{controlState})
  const packagedDifferentials=discoverPackagedDifferentials(records,graph)
  const differentials=discoverDifferentials(records,relations)
  const angularPackageBodies=new Set(records.filter(record=>
    ['universal-joint','cv-joint'].includes(bodyRole(record))
  ).map(record=>record.instance.body.id))
  const angularPorts=(graph?.edges?.('constraint')||[]).filter(edge=>
    angularPackageBodies.has(edge.metadata?.transmissionPort?.packageBodyId)
  ).map(edge=>({
    id:`${edge.metadata.transmissionPort.packageBodyId}:${edge.metadata.transmissionPort.portRole}`,
    kind:'universal-joint-port',
    bodyA:edge.bodyA,
    bodyB:edge.bodyB,
    endpointA:edge.metadata.endpointAId,
    endpointB:edge.metadata.endpointBId,
  }))
  const compounds=discoverCompoundMechanisms({
    records,
    graph,
    relations:[...relations,...angularPorts],
    stateRegistry:compoundState,
  })

  return Object.freeze({
    version:TRANSMISSION_DISCOVERY_VERSION,
    equations:Object.freeze([
      ...shaft.equations,
      ...gears.equations,
      ...racks.equations,
      ...packaged.equations,
      ...packagedDifferentials.equations,
      ...differentials.equations,
      ...compounds.equations,
    ]),
    transmissions:Object.freeze([
      ...shaft.transmissions,
      ...gears.transmissions,
      ...racks.transmissions,
      ...packaged.transmissions,
      ...packagedDifferentials.transmissions,
      ...differentials.transmissions,
      ...compounds.transmissions,
    ]),
    velocityEquations:Object.freeze(compounds.velocityEquations||[]),
    balancedDifferentialClosures:Object.freeze([
      ...packagedDifferentials.balancedClosures,
      ...differentials.balancedClosures,
    ]),
    compoundMotions:Object.freeze(differentials.compoundMotions),
    nonlinearRelations:Object.freeze(compounds.nonlinearRelations),
    compoundDescriptors:Object.freeze(compounds.descriptors),
    linearMotions:Object.freeze([
      ...racks.linearMotions,
      ...compounds.linearMotions,
    ]),
    dynamics:Object.freeze(compounds.dynamics),
    diagnostics:Object.freeze({
      gearPairs:Object.freeze(gears.diagnostics),
      rackPinion:Object.freeze(racks.diagnostics),
      packaged:Object.freeze(packaged.diagnostics),
      differentials:Object.freeze([
        ...packagedDifferentials.diagnostics,
        ...differentials.diagnostics,
      ]),
      compounds:Object.freeze(compounds.diagnostics),
      coverage:transmissionCoverage(records,{
        gears,
        racks,
        packaged,
        differentials:Object.freeze({
          diagnostics:Object.freeze([
            ...packagedDifferentials.diagnostics,
            ...differentials.diagnostics,
          ]),
        }),
        compounds,
      }),
    }),
  })
}
