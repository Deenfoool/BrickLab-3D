export const COMPOUND_SCENE_MEMBER_MAP_VERSION='mechanics-compound-scene-member-map-0.1.0'

function key(path,occurrence){
  return `${String(path||'').replace(/^parts\//i,'').replace(/\\/g,'/').toLowerCase()}#${Number(occurrence)||0}`
}

export function collectMechanicalMemberProxies(root){
  const result=[]
  root?.traverse?.(node=>{
    if(node?.userData?.mechanicalMemberProxy!==true)return
    result.push(node)
  })
  return Object.freeze(result)
}

export function mapDecompositionToScene(root,decomposition){
  const proxies=collectMechanicalMemberProxies(root)
  const byKey=new Map()
  for(const proxy of proxies){
    const k=key(
      proxy.userData?.mechanicalMemberPath,
      proxy.userData?.mechanicalMemberOccurrence,
    )
    if(!byKey.has(k))byKey.set(k,proxy)
  }

  const mapped=[]
  const missing=[]
  for(const member of decomposition?.members||[]){
    const k=key(member.path,member.occurrence)
    const proxy=byKey.get(k)??null
    if(!proxy){
      missing.push(Object.freeze({
        memberId:member.id,
        path:member.path,
        occurrence:member.occurrence,
      }))
      continue
    }
    proxy.updateWorldMatrix?.(true,false)
    mapped.push(Object.freeze({
      memberId:member.id,
      path:member.path,
      occurrence:member.occurrence,
      internalRole:member.internalRole,
      proxy,
      worldMatrix:proxy.matrixWorld?.clone?.()??null,
    }))
  }

  return Object.freeze({
    version:COMPOUND_SCENE_MEMBER_MAP_VERSION,
    complete:missing.length===0&&(decomposition?.members?.length||0)>0,
    mapped:Object.freeze(mapped),
    missing:Object.freeze(missing),
    proxyCount:proxies.length,
    memberCount:decomposition?.members?.length||0,
  })
}
