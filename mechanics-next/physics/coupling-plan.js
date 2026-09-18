import { rotaryFrameForRecord } from '../interaction/motion-plan.js'

export const MECHANICS_COUPLING_PLAN_VERSION='mechanics-coupling-plan-0.1.0'
const EPS=1e-9

function parseVariable(variable){
  const match=String(variable).match(/^(.*)::(omega|slide)$/)
  return match?{bodyId:match[1],channel:match[2]}:null
}

function constraintKind(edge){
  return edge?.constraintKind??edge?.kind
}

function allowsRelativeRotation(edge){
  if(!edge?.dof)return false
  return ['free','limited','driven'].includes(edge.dof.ry?.state) &&
    ['locked'].includes(edge.dof.tx?.state) &&
    ['locked'].includes(edge.dof.tz?.state)
}

function componentIndex(graph){
  const index=new Map()
  for(const island of graph.rigidIslands()){
    const id=island.join('|')
    for(const bodyId of island)index.set(bodyId,id)
  }
  return index
}

function angularReference(bodyId,graph,islands){
  const candidates=[]
  const componentId=islands.get(bodyId)??String(bodyId)
  const componentBodies=[...islands.entries()]
    .filter(([,id])=>id===componentId)
    .map(([id])=>id)
  if(!componentBodies.length)componentBodies.push(String(bodyId))

  for(const memberBodyId of componentBodies){
    for(const{bodyId:other,edge}of graph.neighbors(memberBodyId,{kind:'constraint'})){
      const otherComponent=islands.get(other)??other
      if(otherComponent===componentId)continue
      const kind=constraintKind(edge)
      if(!['revolute','cylindrical'].includes(kind)&&!allowsRelativeRotation(edge))continue
      candidates.push({
        bodyId:other,
        componentId:otherComponent,
        edgeId:edge.id,
        viaBodyId:memberBodyId,
      })
    }
  }

  const unique=[...new Map(candidates.map(item=>[item.componentId,item])).values()]
  if(unique.length===0)return{referenceBodyId:null,status:'world-reference'}
  if(unique.length===1)return{
    referenceBodyId:unique[0].bodyId,
    status:'resolved',
    edgeId:unique[0].edgeId,
    viaBodyId:unique[0].viaBodyId,
  }
  return{
    referenceBodyId:null,
    status:'ambiguous',
    candidates:Object.freeze(unique),
  }
}

function recordIndex(records=[]){
  return new Map(records.map(record=>[String(record?.instance?.body?.id||''),record]).filter(([id])=>id))
}

function linearMotionIndex(discovery){
  return new Map((discovery?.linearMotions||[]).map(item=>[String(item.bodyId),item]))
}

function angularTerm(bodyId,coefficient,records,graph,islands,forcedReferenceBodyId=null){
  const record=records.get(bodyId)
  if(!record)return{blocker:{code:'coupling-record-missing',bodyId,channel:'omega'}}
  const frame=rotaryFrameForRecord(record)
  if(!frame)return{blocker:{code:'coupling-rotary-frame-missing',bodyId}}
  const reference=forcedReferenceBodyId
    ?{referenceBodyId:String(forcedReferenceBodyId),status:'forced-relative'}
    :angularReference(bodyId,graph,islands)
  if(reference.status==='ambiguous'){
    return{blocker:{
      code:'coupling-angular-reference-ambiguous',
      bodyId,
      candidates:reference.candidates,
    }}
  }
  return{term:Object.freeze({
    coordinate:'angular',
    bodyId,
    referenceBodyId:reference.referenceBodyId,
    referenceStatus:reference.status,
    referenceConstraintId:reference.edgeId??null,
    coefficient:Number(coefficient),
    axisWorld:Object.freeze([...frame.axis]),
  })}
}

function linearTerm(bodyId,coefficient,motions){
  const motion=motions.get(bodyId)
  if(!motion)return{blocker:{code:'coupling-linear-frame-missing',bodyId}}
  return{term:Object.freeze({
    coordinate:'linear',
    bodyId,
    referenceBodyId:motion.parentBodyId??null,
    coefficient:Number(coefficient),
    axisWorld:Object.freeze([...(motion.axis||[0,1,0])]),
    sourceUnits:'scene-stud-per-second',
  })}
}

function convertEquation(equation,{records,graph,islands,motions,nonlinearRelations}){
  if(Math.abs(Number(equation?.constant)||0)>EPS){
    return{blocker:Object.freeze({
      code:'nonzero-velocity-constraint-unsupported',
      equationId:equation?.id??null,
      constant:equation?.constant,
    })}
  }
  const parsed=[]
  for(const[variable,coefficient]of Object.entries(equation?.coefficients||{})){
    const item=parseVariable(variable)
    if(!item)return{blocker:Object.freeze({
      code:'physics-channel-unsupported',
      equationId:equation.id,
      variable,
    })}
    parsed.push({...item,coefficient:Number(coefficient)})
  }
  if(parsed.length<2)return{skip:true}

  const hasLinear=parsed.some(item=>item.channel==='slide')
  const terms=[]
  for(const item of parsed){
    const forcedReference=
      equation?.metadata?.kind==='differential-spider-spin' &&
      item.bodyId===equation?.metadata?.spider
        ?equation?.metadata?.carrier
        :null
    const result=item.channel==='omega'
      ?angularTerm(item.bodyId,item.coefficient,records,graph,islands,forcedReference)
      :linearTerm(item.bodyId,item.coefficient,motions)
    if(result.blocker)return{blocker:Object.freeze({
      ...result.blocker,
      equationId:equation.id,
    })}
    let term=result.term
    if(hasLinear){
      // BrickLab's production Rapier session uses scene units directly: one scene unit
      // is one stud. Screw/rack coefficients are already expressed in stud/rad and
      // linear velocity is stud/s, so no hidden metre conversion is valid here.
      term=Object.freeze({...term,coefficient:Number(term.coefficient)})
    }
    terms.push(term)
  }

  const nonlinearRelation=equation?.metadata?.kind==='universal-joint-instantaneous'
    ?(nonlinearRelations||[]).find(relation=>
        relation?.kind==='universal-joint' &&
        relation.inputBody===equation.metadata.bodyA &&
        relation.outputBody===equation.metadata.bodyB)??null
    :null

  return{coupler:Object.freeze({
    id:`physics-coupler:${equation.id}`,
    equationId:equation.id,
    kind:hasLinear?'mixed-linear-angular':'angular',
    terms:Object.freeze(terms),
    metadata:equation.metadata??null,
    nonlinearRelation,
    controlledTransmission:equation?.metadata?.controlledTransmission===true
      ?Object.freeze({
          controlId:String(equation.metadata.controlId||''),
          modeRatios:Object.freeze({...equation.metadata.modeRatios}),
          defaultMode:String(equation.metadata.defaultMode||'forward'),
          bodyA:String(equation.metadata.bodyA||parsed[0]?.bodyId||''),
          bodyB:String(equation.metadata.bodyB||parsed[1]?.bodyId||''),
          packageKind:equation.metadata.packageKind??null,
        })
      :null,
    sourceEquation:equation,
  })}
}

export function buildMechanicsCouplingPlan({
  graph,
  discovery,
  records=[],
}={}){
  if(!graph?.neighbors||!graph?.rigidIslands)throw new TypeError('AssemblyGraph is required')

  const recordMap=recordIndex(records)
  const islands=componentIndex(graph)
  const motions=linearMotionIndex(discovery)
  const couplers=[]
  const blockers=[]
  const skipped=[]

  const controlledPhysicalEquations=(discovery?.transmissions||[])
    .flatMap(item=>item?.equations||[])
    .filter(equation=>equation?.metadata?.controlledTransmission===true)
  const equations=[
    ...(discovery?.equations||[]).filter(equation=>equation?.metadata?.physicsExclude!==true),
    ...(discovery?.velocityEquations||[]).filter(equation=>equation?.metadata?.physicsExclude!==true),
    ...controlledPhysicalEquations,
  ]

  for(const equation of equations){
    const result=convertEquation(equation,{
      records:recordMap,
      graph,
      islands,
      motions,
      nonlinearRelations:discovery?.nonlinearRelations||[],
    })
    if(result.coupler)couplers.push(result.coupler)
    else if(result.blocker)blockers.push(result.blocker)
    else if(result.skip)skipped.push(equation.id)
  }

  return Object.freeze({
    version:MECHANICS_COUPLING_PLAN_VERSION,
    pass:blockers.length===0,
    couplers:Object.freeze(couplers),
    blockers:Object.freeze(blockers),
    skipped:Object.freeze(skipped),
    stats:Object.freeze({
      equations:equations.length,
      couplers:couplers.length,
      blockers:blockers.length,
      skipped:skipped.length,
    }),
  })
}
