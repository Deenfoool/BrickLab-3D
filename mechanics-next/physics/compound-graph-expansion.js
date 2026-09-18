import { createBodyDescriptor } from '../core/model.js'
import { createConstraint } from '../constraints/dof.js'
import { createAssemblyGraph } from '../topology/assembly-graph.js'

export const COMPOUND_GRAPH_EXPANSION_VERSION='mechanics-compound-graph-expansion-0.1.0'

function clone(value){
  if(value==null)return value
  if(typeof structuredClone==='function'){
    try{return structuredClone(value)}catch{}
  }
  return JSON.parse(JSON.stringify(value))
}

function replacementIndex(plan){
  return new Map((plan?.replacements||[]).map(item=>[String(item.rootBodyId),item]))
}

function bodySpecIndex(plan){
  return new Map((plan?.bodies||[]).map(item=>[String(item.memberId),item]))
}

function memberBodyDescriptor(replacement,spec){
  return createBodyDescriptor({
    id:String(spec.memberId),
    instanceId:String(spec.memberId),
    partId:replacement.rootPartId??null,
    family:'compound-member',
    role:spec.role??'compound-member',
    metadata:{
      compoundRootBodyId:String(replacement.rootBodyId),
      compoundRootInstanceId:String(replacement.rootInstanceId),
      compoundRootPartId:replacement.rootPartId??null,
      memberId:String(spec.memberId),
      memberPath:spec.path??null,
      colliderKind:spec.collider?.kind??null,
    },
  })
}

function endpointForSide(edge,side){
  const suffix=side==='a'?'A':'B'
  return edge?.metadata?.[`endpoint${suffix}Id`]??null
}

function remapBody(edge,side,replacements,blockers){
  const bodyId=String(side==='a'?edge.bodyA:edge.bodyB)
  const replacement=replacements.get(bodyId)
  if(!replacement)return{bodyId,replacement:null,memberId:null}

  const endpointId=endpointForSide(edge,side)
  const owner=endpointId?replacement.endpointOwners?.[endpointId]??null:null
  if(owner){
    return{
      bodyId:String(owner),
      replacement,
      memberId:String(owner),
      endpointId,
    }
  }

  // A compound root with more than one physical member may never silently route
  // an external constraint to a preferred/default member. That would turn unknown
  // topology into fake mechanics.
  if((replacement.memberIds?.length||0)===1){
    const only=String(replacement.memberIds[0])
    return{bodyId:only,replacement,memberId:only,endpointId}
  }

  blockers.push(Object.freeze({
    code:'compound-external-endpoint-owner-unresolved',
    constraintId:edge.id,
    rootBodyId:bodyId,
    rootInstanceId:replacement.rootInstanceId,
    endpointId:endpointId??null,
    side,
    knownOwners:Object.freeze({...replacement.endpointOwners}),
  }))
  return null
}

export function expandCompoundPhysicsGraph({
  graph,
  compoundMemberPlan,
}={}){
  if(!graph?.bodies||!graph?.edges)throw new TypeError('AssemblyGraph is required')
  const replacements=replacementIndex(compoundMemberPlan)
  if(!replacements.size){
    return Object.freeze({
      version:COMPOUND_GRAPH_EXPANSION_VERSION,
      graph,
      expanded:false,
      blockers:Object.freeze([]),
      materializedRootIds:Object.freeze([]),
      materializedRootInstanceIds:Object.freeze([]),
      memberBodyIds:Object.freeze([]),
      remappedConstraints:Object.freeze([]),
      stats:Object.freeze({
        roots:0,
        memberBodies:0,
        remappedConstraints:0,
        blockers:0,
      }),
    })
  }

  const bodySpecs=bodySpecIndex(compoundMemberPlan)
  const expanded=createAssemblyGraph()
  const blockers=[]
  const memberBodyIds=[]
  const remappedConstraints=[]

  for(const body of graph.bodies()){
    if(replacements.has(String(body.id)))continue
    expanded.addBody(body)
  }

  for(const replacement of replacements.values()){
    for(const memberId of replacement.memberIds||[]){
      const spec=bodySpecs.get(String(memberId))
      if(!spec){
        blockers.push(Object.freeze({
          code:'compound-member-body-spec-missing',
          rootBodyId:replacement.rootBodyId,
          memberId:String(memberId),
        }))
        continue
      }
      const body=memberBodyDescriptor(replacement,spec)
      expanded.addBody(body)
      memberBodyIds.push(body.id)
    }
  }

  for(const edge of graph.edges('constraint')){
    const a=remapBody(edge,'a',replacements,blockers)
    const b=remapBody(edge,'b',replacements,blockers)
    if(!a||!b)continue
    if(a.bodyId===b.bodyId)continue

    try{
      const constraint=createConstraint({
        id:edge.id,
        bodyA:a.bodyId,
        bodyB:b.bodyId,
        kind:edge.constraintKind??edge.kind,
        dof:clone(edge.dof),
        frameA:clone(edge.frameA),
        frameB:clone(edge.frameB),
        referenceFrame:clone(edge.referenceFrame),
        metadata:{
          ...(clone(edge.metadata)||{}),
          physicsCompoundRemap:Object.freeze({
            originalBodyA:String(edge.bodyA),
            originalBodyB:String(edge.bodyB),
            bodyA:a.bodyId,
            bodyB:b.bodyId,
            rootA:a.replacement?.rootBodyId??null,
            rootB:b.replacement?.rootBodyId??null,
            memberA:a.memberId??null,
            memberB:b.memberId??null,
          }),
        },
        evidence:clone(edge.evidence),
      })
      expanded.addConstraint(constraint)
      if(a.replacement||b.replacement){
        remappedConstraints.push(Object.freeze({
          constraintId:constraint.id,
          originalBodyA:String(edge.bodyA),
          originalBodyB:String(edge.bodyB),
          bodyA:a.bodyId,
          bodyB:b.bodyId,
        }))
      }
    }catch(error){
      blockers.push(Object.freeze({
        code:'compound-constraint-remap-failed',
        constraintId:edge.id,
        detail:String(error?.message||error),
      }))
    }
  }

  return Object.freeze({
    version:COMPOUND_GRAPH_EXPANSION_VERSION,
    graph:expanded,
    expanded:true,
    blockers:Object.freeze(blockers),
    materializedRootIds:Object.freeze([...replacements.keys()]),
    materializedRootInstanceIds:Object.freeze(
      [...replacements.values()].map(item=>String(item.rootInstanceId))),
    memberBodyIds:Object.freeze(memberBodyIds),
    remappedConstraints:Object.freeze(remappedConstraints),
    stats:Object.freeze({
      roots:replacements.size,
      memberBodies:memberBodyIds.length,
      remappedConstraints:remappedConstraints.length,
      blockers:blockers.length,
    }),
  })
}
