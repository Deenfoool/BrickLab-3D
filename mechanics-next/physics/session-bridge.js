export const MECHANICS_PHYSICS_BRIDGE_VERSION='mechanics-physics-session-bridge-0.1.0'

function bodyKey(body){
  if(body==null)return null
  if(body.handle!=null)return `handle:${body.handle}`
  return body
}

export function buildPhysicsSessionBridge({
  session,
  graph,
  plan,
}={}){
  if(!session?.members)throw new TypeError('Physics session members map is required')
  if(!graph?.body)throw new TypeError('AssemblyGraph is required')
  if(!plan?.components)throw new TypeError('Mechanics physics plan is required')

  const failures=[]
  const memberByMechanicalBody=new Map()
  const componentByRapierBody=new Map()

  for(const component of plan.components){
    const rapierBodies=new Map()
    for(const bodyId of component.bodyIds){
      const body=graph.body(bodyId)
      const instanceId=body?.instanceId
      const member=instanceId?session.members.get(instanceId):null
      if(!member){
        failures.push(Object.freeze({
          code:'session-member-missing',
          componentId:component.id,
          bodyId,
          instanceId:instanceId??null,
        }))
        continue
      }
      memberByMechanicalBody.set(bodyId,member)
      rapierBodies.set(bodyKey(member.body),member.body)
    }

    if(rapierBodies.size!==1){
      failures.push(Object.freeze({
        code:'rigid-island-not-merged',
        componentId:component.id,
        bodyIds:component.bodyIds,
        rapierBodyCount:rapierBodies.size,
      }))
      continue
    }

    const rapierKey=[...rapierBodies.keys()][0]
    const existing=componentByRapierBody.get(rapierKey)
    if(existing&&existing!==component.id){
      failures.push(Object.freeze({
        code:'production-body-overmerged',
        rapierBody:String(rapierKey),
        componentA:existing,
        componentB:component.id,
      }))
      continue
    }
    componentByRapierBody.set(rapierKey,component.id)
  }

  const resolveMember=bodyId=>memberByMechanicalBody.get(String(bodyId))??null
  return Object.freeze({
    version:MECHANICS_PHYSICS_BRIDGE_VERSION,
    pass:failures.length===0,
    failures:Object.freeze(failures),
    resolveMember,
    stats:Object.freeze({
      plannedComponents:plan.components.length,
      mappedBodies:memberByMechanicalBody.size,
      rapierBodies:componentByRapierBody.size,
      failures:failures.length,
    }),
  })
}
