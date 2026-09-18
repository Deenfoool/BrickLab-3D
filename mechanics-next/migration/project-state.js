import { createConstraint } from '../constraints/dof.js'
import { deterministicId } from '../core/model.js'
import { rigidPoseFromMatrix4 } from '../math/rigid.js'
import { worldConnectorFrame } from '../connectors/world-frame.js'
import { endpointSemanticKind } from '../intelligence/endpoint-semantics.js'
import { interpretObservedConnection } from '../intelligence/connection-interpreter.js'

export const MECHANICS_PROJECT_SCHEMA_VERSION=1

function clone(value){
  if(value==null)return value
  if(typeof structuredClone==='function'){
    try{return structuredClone(value)}catch{}
  }
  return JSON.parse(JSON.stringify(value))
}

function endpointRecord(edge,side){
  const m=edge.metadata||{}
  const suffix=side==='a'?'A':'B'
  return Object.freeze({
    instanceId:m[`instance${suffix}Id`]??null,
    endpointId:m[`endpoint${suffix}Id`]??null,
    observedEndpointId:m[`observedEndpoint${suffix}Id`]??null,
    semantic:m[`semantic${suffix}`]??null,
  })
}

export function exportMechanicsProjectState({
  graph,
  relations=[],
  compoundState=null,
}={}){
  if(!graph?.edges)throw new TypeError('AssemblyGraph is required')
  const connections=[]
  for(const edge of graph.edges('constraint')){
    const a=endpointRecord(edge,'a')
    const b=endpointRecord(edge,'b')
    if(!a.instanceId||!b.instanceId||!a.endpointId||!b.endpointId)continue
    const observedConnectionId=edge.metadata?.observedConnectionId ??
      deterministicId(
        'observed-link',
        ...[
          `${a.instanceId}::${a.observedEndpointId??a.endpointId}`,
          `${b.instanceId}::${b.observedEndpointId??b.endpointId}`,
        ].sort(),
      )
    connections.push(Object.freeze({
      id:edge.id,
      observedConnectionId,
      kind:edge.constraintKind??edge.kind,
      a,b,
      dof:clone(edge.dof),
      interfacePair:Object.freeze([...(edge.metadata?.interfacePair||[])]),
      topology:clone(edge.metadata?.topology??null),
      dynamics:clone(edge.metadata?.dynamics??null),
      geometry:clone(edge.metadata?.connectionGeometry??null),
      occupancy:clone(edge.metadata?.occupancy??null),
      evidence:clone(edge.evidence??null),
    }))
  }

  const savedRelations=(relations||[]).map(relation=>Object.freeze({
    id:relation.id,
    kind:relation.kind,
    bodyA:relation.bodyA,
    bodyB:relation.bodyB,
    endpointA:relation.endpointA??null,
    endpointB:relation.endpointB??null,
    structural:relation.structural===true,
    transmission:relation.transmission===true,
    deformable:relation.deformable===true,
    reason:relation.reason??null,
  }))

  return Object.freeze({
    schemaVersion:MECHANICS_PROJECT_SCHEMA_VERSION,
    engine:'mechanics-next',
    connections:Object.freeze(connections.sort((a,b)=>a.id.localeCompare(b.id))),
    relations:Object.freeze(savedRelations.sort((a,b)=>String(a.id).localeCompare(String(b.id)))),
    compoundState:clone(
      typeof compoundState?.snapshot==='function'
        ?compoundState.snapshot()
        :compoundState??null,
    ),
  })
}

function instanceEndpoint(sceneObserver,instanceId,endpointId){
  const instance=sceneObserver?.instance?.(instanceId)
  if(!instance)return{instance:null,endpoint:null}
  const endpoint=instance.endpoints?.find(item=>item.id===endpointId)??null
  return{instance,endpoint}
}

function instanceByBodyId(sceneObserver,bodyId){
  return sceneObserver?.instances?.().find(instance=>String(instance?.body?.id||'')===String(bodyId))??null
}

function referenceFrameFor(object,endpoint,visualOffsetStud=[0,0,0]){
  object?.updateWorldMatrix?.(true,false)
  const elements=object?.matrixWorld?.elements
  if(!elements)throw new Error('scene object lacks matrixWorld')
  const pose=rigidPoseFromMatrix4(Array.from(elements))
  const frame=worldConnectorFrame(pose,endpoint,{visualOffsetStud})
  return Object.freeze({
    position:Object.freeze([...frame.position]),
    axis:Object.freeze([...frame.axis]),
    orientation:Object.freeze([...frame.orientation]),
  })
}

export function validateMechanicsProjectState(state){
  const failures=[]
  if(state?.schemaVersion!==MECHANICS_PROJECT_SCHEMA_VERSION){
    failures.push(Object.freeze({
      code:'schema-version',
      expected:MECHANICS_PROJECT_SCHEMA_VERSION,
      actual:state?.schemaVersion??null,
    }))
  }
  if(!Array.isArray(state?.connections)){
    failures.push(Object.freeze({code:'connections-not-array'}))
  }else{
    const ids=new Set()
    for(const connection of state.connections){
      if(!connection?.id||ids.has(connection.id)){
        failures.push(Object.freeze({
          code:'connection-id-invalid',
          id:connection?.id??null,
        }))
      }
      ids.add(connection?.id)
      for(const side of ['a','b']){
        const endpoint=connection?.[side]
        if(!endpoint?.instanceId||!endpoint?.endpointId){
          failures.push(Object.freeze({
            code:'connection-endpoint-invalid',
            connectionId:connection?.id??null,
            side,
          }))
        }
      }
    }
  }
  return Object.freeze({
    pass:failures.length===0,
    failures:Object.freeze(failures),
  })
}

export function restoreMechanicsProjectState(state,{
  graph,
  sceneObserver,
  objectByInstanceId,
  visualOffsetForPart=()=>[0,0,0],
  replace=false,
}={}){
  const validation=validateMechanicsProjectState(state)
  if(!validation.pass)return Object.freeze({
    restored:0,
    rejected:state?.connections?.length||0,
    failures:validation.failures,
    relations:Object.freeze([]),
  })
  if(!graph?.addConstraint)throw new TypeError('AssemblyGraph is required')
  if(!sceneObserver?.instance)throw new TypeError('Scene observer is required')
  if(typeof objectByInstanceId!=='function')throw new TypeError('objectByInstanceId is required')

  if(replace){
    for(const edge of graph.edges('constraint'))graph.removeEdge(edge.id)
  }

  let restored=0
  const failures=[]
  const createdIds=[]
  for(const record of state.connections){
    const left=instanceEndpoint(sceneObserver,record.a.instanceId,record.a.endpointId)
    const right=instanceEndpoint(sceneObserver,record.b.instanceId,record.b.endpointId)
    if(!left.endpoint||!right.endpoint){
      failures.push(Object.freeze({
        code:'endpoint-not-found',
        connectionId:record.id,
        aFound:Boolean(left.endpoint),
        bFound:Boolean(right.endpoint),
      }))
      continue
    }

    const semanticA=endpointSemanticKind(left.endpoint)
    const semanticB=endpointSemanticKind(right.endpoint)
    if((record.a.semantic&&record.a.semantic!==semanticA)||
       (record.b.semantic&&record.b.semantic!==semanticB)){
      failures.push(Object.freeze({
        code:'endpoint-semantic-changed',
        connectionId:record.id,
        expected:[record.a.semantic,record.b.semantic],
        actual:[semanticA,semanticB],
      }))
      continue
    }

    const objectA=objectByInstanceId(record.a.instanceId)
    const objectB=objectByInstanceId(record.b.instanceId)
    if(!objectA||!objectB){
      failures.push(Object.freeze({
        code:'scene-object-not-found',
        connectionId:record.id,
        instanceId:!objectA?record.a.instanceId:record.b.instanceId,
      }))
      continue
    }

    try{
      const observedRecord={
        id:record.id,
        a:{
          instanceId:record.a.instanceId,
          endpointId:record.a.observedEndpointId??record.a.endpointId,
        },
        b:{
          instanceId:record.b.instanceId,
          endpointId:record.b.observedEndpointId??record.b.endpointId,
        },
        occupancy:clone(record.occupancy),
        metadata:{
          restoredFromSchema:MECHANICS_PROJECT_SCHEMA_VERSION,
          connectionGeometry:clone(record.geometry??null),
        },
      }
      const interpretation=interpretObservedConnection(observedRecord,{
        sceneObserver,
        objectById:objectByInstanceId,
      })
      if(!interpretation.valid||interpretation.type!=='constraint'){
        failures.push(Object.freeze({
          code:'connection-reinterpretation-failed',
          connectionId:record.id,
          reason:interpretation?.reason??interpretation?.type??'unknown',
        }))
        continue
      }
      const current=interpretation.constraint
      graph.addConstraint(createConstraint({
        id:record.id,
        bodyA:current.bodyA,
        bodyB:current.bodyB,
        kind:current.constraintKind??current.kind,
        dof:clone(current.dof),
        frameA:current.frameA,
        frameB:current.frameB,
        referenceFrame:current.referenceFrame,
        metadata:{
          ...(clone(current.metadata)||{}),
          connectionGeometry:clone(
            record.geometry??current.metadata?.connectionGeometry??null,
          ),
          occupancy:clone(record.occupancy),
          restoredFromSchema:MECHANICS_PROJECT_SCHEMA_VERSION,
          persistedConstraintKind:record.kind,
        },
        evidence:clone(current.evidence??record.evidence),
      }))
      createdIds.push(record.id)
      restored+=1
    }catch(error){
      failures.push(Object.freeze({
        code:'constraint-restore-error',
        connectionId:record.id,
        detail:String(error?.message||error),
      }))
    }
  }

  const restoredRelations=[]
  if(!failures.length){
    for(const relationRecord of state.relations||[]){
      const instanceA=instanceByBodyId(sceneObserver,relationRecord.bodyA)
      const instanceB=instanceByBodyId(sceneObserver,relationRecord.bodyB)
      if(!instanceA||!instanceB){
        failures.push(Object.freeze({
          code:'relation-body-not-found',
          relationId:relationRecord?.id??null,
          bodyA:relationRecord?.bodyA??null,
          bodyB:relationRecord?.bodyB??null,
        }))
        break
      }
      try{
        const interpretation=interpretObservedConnection({
          id:relationRecord.id,
          a:{
            instanceId:instanceA.body.instanceId,
            endpointId:relationRecord.endpointA,
          },
          b:{
            instanceId:instanceB.body.instanceId,
            endpointId:relationRecord.endpointB,
          },
        },{
          sceneObserver,
          objectById:objectByInstanceId,
        })
        if(!interpretation.valid||interpretation.type!=='relation'){
          failures.push(Object.freeze({
            code:'relation-reinterpretation-failed',
            relationId:relationRecord.id,
            reason:interpretation?.reason??interpretation?.type??'unknown',
          }))
          break
        }
        restoredRelations.push(interpretation.relation)
      }catch(error){
        failures.push(Object.freeze({
          code:'relation-reinterpretation-error',
          relationId:relationRecord?.id??null,
          detail:String(error?.message||error),
        }))
        break
      }
    }
  }

  let rolledBack=0
  if(failures.length){
    for(const id of createdIds){
      if(graph.removeEdge(id))rolledBack+=1
    }
    restored=0
    restoredRelations.length=0
  }

  return Object.freeze({
    restored,
    rejected:failures.length,
    rolledBack,
    failures:Object.freeze(failures),
    relations:Object.freeze(restoredRelations),
    compoundState:clone(state.compoundState??null),
  })
}

export function persistenceCompatibilityReport({
  exportedState,
  restoredResult,
}={}){
  const expected=exportedState?.connections?.length||0
  const restored=Number(restoredResult?.restored||0)
  const rejected=Number(restoredResult?.rejected||0)
  const failures=Object.freeze([...(restoredResult?.failures||[])])
  return Object.freeze({
    pass:expected===restored&&rejected===0&&failures.length===0,
    expected,
    restored,
    rejected,
    failures,
  })
}


export function probeMechanicsProjectState(state,{
  sceneObserver,
  objectByInstanceId=()=>null,
}={}){
  const validation=validateMechanicsProjectState(state)
  if(!validation.pass)return Object.freeze({
    pass:false,
    expected:state?.connections?.length||0,
    resolvable:0,
    failures:validation.failures,
    mode:'dry-run',
  })
  const failures=[]
  let resolvable=0
  for(const record of state.connections||[]){
    const left=instanceEndpoint(sceneObserver,record.a.instanceId,record.a.endpointId)
    const right=instanceEndpoint(sceneObserver,record.b.instanceId,record.b.endpointId)
    if(!left.endpoint||!right.endpoint){
      failures.push(Object.freeze({
        code:'endpoint-not-found',
        connectionId:record.id,
        aFound:Boolean(left.endpoint),
        bFound:Boolean(right.endpoint),
      }))
      continue
    }
    const actualA=endpointSemanticKind(left.endpoint)
    const actualB=endpointSemanticKind(right.endpoint)
    if((record.a.semantic&&record.a.semantic!==actualA)||
       (record.b.semantic&&record.b.semantic!==actualB)){
      failures.push(Object.freeze({
        code:'endpoint-semantic-changed',
        connectionId:record.id,
        expected:[record.a.semantic,record.b.semantic],
        actual:[actualA,actualB],
      }))
      continue
    }
    const objectA=objectByInstanceId(record.a.instanceId)
    const objectB=objectByInstanceId(record.b.instanceId)
    if(!objectA||!objectB){
      failures.push(Object.freeze({
        code:'scene-object-not-found',
        connectionId:record.id,
      }))
      continue
    }
    try{
      const interpretation=interpretObservedConnection({
        id:record.id,
        a:{
          instanceId:record.a.instanceId,
          endpointId:record.a.observedEndpointId??record.a.endpointId,
        },
        b:{
          instanceId:record.b.instanceId,
          endpointId:record.b.observedEndpointId??record.b.endpointId,
        },
        occupancy:clone(record.occupancy),
        metadata:{connectionGeometry:clone(record.geometry??null)},
      },{
        sceneObserver,
        objectById:objectByInstanceId,
      })
      if(!interpretation.valid||interpretation.type!=='constraint'){
        failures.push(Object.freeze({
          code:'connection-reinterpretation-failed',
          connectionId:record.id,
          reason:interpretation?.reason??interpretation?.type??'unknown',
        }))
        continue
      }
    }catch(error){
      failures.push(Object.freeze({
        code:'connection-reinterpretation-error',
        connectionId:record.id,
        detail:String(error?.message||error),
      }))
      continue
    }
    resolvable+=1
  }
  let resolvableRelations=0
  if(!failures.length){
    for(const relationRecord of state.relations||[]){
      const instanceA=instanceByBodyId(sceneObserver,relationRecord.bodyA)
      const instanceB=instanceByBodyId(sceneObserver,relationRecord.bodyB)
      if(!instanceA||!instanceB){
        failures.push(Object.freeze({
          code:'relation-body-not-found',
          relationId:relationRecord?.id??null,
        }))
        continue
      }
      try{
        const interpretation=interpretObservedConnection({
          id:relationRecord.id,
          a:{instanceId:instanceA.body.instanceId,endpointId:relationRecord.endpointA},
          b:{instanceId:instanceB.body.instanceId,endpointId:relationRecord.endpointB},
        },{
          sceneObserver,
          objectById:objectByInstanceId,
        })
        if(!interpretation.valid||interpretation.type!=='relation'){
          failures.push(Object.freeze({
            code:'relation-reinterpretation-failed',
            relationId:relationRecord.id,
            reason:interpretation?.reason??interpretation?.type??'unknown',
          }))
          continue
        }
        resolvableRelations+=1
      }catch(error){
        failures.push(Object.freeze({
          code:'relation-reinterpretation-error',
          relationId:relationRecord?.id??null,
          detail:String(error?.message||error),
        }))
      }
    }
  }

  return Object.freeze({
    pass:failures.length===0&&
      resolvable===(state.connections?.length||0)&&
      resolvableRelations===(state.relations?.length||0),
    expected:state.connections?.length||0,
    resolvable,
    expectedRelations:state.relations?.length||0,
    resolvableRelations,
    rejected:failures.length,
    failures:Object.freeze(failures),
    mode:'dry-run',
  })
}
