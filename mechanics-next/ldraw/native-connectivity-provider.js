import { createNativeShadowResolver } from './shadow-resolver.js'
import { createNativeLDrawInheritanceResolver } from './official-inheritance.js'
import { ldcadConnectorToEndpoint } from './connector-adapter.js'

export const NATIVE_CONNECTIVITY_PROVIDER_VERSION='mechanics-native-connectivity-provider-0.1.0'
export const NATIVE_SHADOW_SOURCE=Object.freeze({
  repository:'RolandMelkert/LDCadShadowLibrary',
  commit:'f2fb70c55521e0dfdf2af4d26a87167d4d0d9eec',
})

const normalize=value=>String(value||'').replace(/\\/g,'/').replace(/^\.\//,'').replace(/\/+/g,'/').toLowerCase().trim()
const encoded=value=>normalize(value).split('/').map(encodeURIComponent).join('/')

async function fetchTextOrNull(url){
  const response=await fetch(url,{mode:'cors',cache:'force-cache'})
  if(response.status===404)return null
  if(!response.ok)throw new Error(`HTTP ${response.status}: ${url}`)
  return response.text()
}

export function createNativeConnectivityProvider({
  parts,
  ldraw=globalThis.BrickLabLDraw,
  fetchShadowText=null,
  onUpdate=null,
}={}){
  if(!parts?.get)throw new TypeError('Native connectivity provider requires parts.get')
  if(typeof ldraw?.readText!=='function')throw new TypeError('Native connectivity provider requires BrickLabLDraw.readText')

  const shadowRoot=`https://raw.githubusercontent.com/${NATIVE_SHADOW_SOURCE.repository}/${NATIVE_SHADOW_SOURCE.commit}/`
  const readShadow=fetchShadowText??(path=>fetchTextOrNull(shadowRoot+encoded(path)))
  const shadow=createNativeShadowResolver({fetchShadowText:readShadow})
  const resolver=createNativeLDrawInheritanceResolver({
    fetchOfficialText:async path=>{
      try{return await ldraw.readText(path)}
      catch(error){
        if(error?.status===404)return null
        return null
      }
    },
    shadowResolver:shadow,
  })

  const cache=new Map()
  const pending=new Map()
  let revision=0
  let resolved=0
  let failed=0

  const fileForPart=partId=>{
    const def=parts.get(partId)
    const file=def?.ldraw?.file
    return file?normalize(file):null
  }

  const hydrate=partId=>{
    const id=String(partId||'')
    if(!id)return Promise.resolve(null)
    if(cache.get(id)?.status==='ready')return Promise.resolve(cache.get(id))
    if(pending.has(id))return pending.get(id)
    const file=fileForPart(id)
    if(!file){
      const value=Object.freeze({status:'missing',partId:id,file:null,connectors:Object.freeze([]),warnings:Object.freeze([])})
      cache.set(id,value)
      return Promise.resolve(value)
    }
    cache.set(id,Object.freeze({status:'loading',partId:id,file,connectors:Object.freeze([]),warnings:Object.freeze([])}))
    const promise=resolver.resolve(file).then(result=>{
      const value=Object.freeze({
        status:'ready',
        partId:id,
        file,
        connectors:Object.freeze([...(result.connectors||[])]),
        warnings:Object.freeze([...(result.warnings||[])]),
        compoundReferences:Object.freeze([...(result.compoundReferences||[])]),
        stats:result.stats??null,
        source:NATIVE_SHADOW_SOURCE,
      })
      cache.set(id,value)
      revision+=1
      resolved+=1
      onUpdate?.(id,value)
      return value
    }).catch(error=>{
      const value=Object.freeze({
        status:'error',
        partId:id,
        file,
        connectors:Object.freeze([]),
        warnings:Object.freeze([{code:'native-connectivity-error',detail:String(error?.message||error)}]),
        error:String(error?.message||error),
        source:NATIVE_SHADOW_SOURCE,
      })
      cache.set(id,value)
      revision+=1
      failed+=1
      onUpdate?.(id,value)
      return value
    }).finally(()=>pending.delete(id))
    pending.set(id,promise)
    return promise
  }

  return Object.freeze({
    version:NATIVE_CONNECTIVITY_PROVIDER_VERSION,
    source:NATIVE_SHADOW_SOURCE,
    get(partId){
      const id=String(partId||'')
      if(!id)return null
      const current=cache.get(id)
      if(current)return current
      void hydrate(id)
      return Object.freeze({status:'loading',partId:id,file:fileForPart(id),connectors:Object.freeze([]),warnings:Object.freeze([])})
    },
    hydrate,
    prefetch(partIds=[]){
      return Promise.allSettled([...new Set(partIds.map(String).filter(Boolean))].map(hydrate))
    },
    toEndpoint:ldcadConnectorToEndpoint,
    invalidate(partId){
      const id=String(partId||'')
      const removed=cache.delete(id)
      if(removed)revision+=1
      return removed
    },
    clear(){
      const count=cache.size
      cache.clear()
      pending.clear()
      resolver.clearCache?.()
      if(count)revision+=1
      return count
    },
    stats(){
      const statuses={}
      let connectors=0
      for(const value of cache.values()){
        statuses[value.status]=(statuses[value.status]||0)+1
        connectors+=value.connectors?.length||0
      }
      return Object.freeze({
        version:NATIVE_CONNECTIVITY_PROVIDER_VERSION,
        revision,
        cached:cache.size,
        pending:pending.size,
        resolved,
        failed,
        connectors,
        statuses:Object.freeze(statuses),
      })
    },
  })
}
