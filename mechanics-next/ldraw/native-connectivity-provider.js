import { createNativeShadowResolver } from './shadow-resolver.js'
import { createNativeLDrawInheritanceResolver } from './official-inheritance.js'
import { ldcadConnectorToEndpoint } from './connector-adapter.js'
import { createEndpointDescriptor, deterministicId, evidence } from '../core/model.js'
import { discoverDifferentialFixturesV4 } from '../../connector-discovery/differential-fixtures-v4.js'

export const NATIVE_CONNECTIVITY_PROVIDER_VERSION='mechanics-native-connectivity-provider-0.1.0'
export const NATIVE_SHADOW_SOURCE=Object.freeze({
  repository:'RolandMelkert/LDCadShadowLibrary',
  commit:'f2fb70c55521e0dfdf2af4d26a87167d4d0d9eec',
})

const normalize=value=>String(value||'').replace(/\\/g,'/').replace(/^\.\//,'').replace(/\/+/g,'/').toLowerCase().trim()
const rootPath=value=>{
  const path=normalize(value)
  if(/^(?:parts|p)\//.test(path))return path
  if(/^s\//.test(path))return `parts/${path}`
  if(/^(?:48|8)\//.test(path))return `p/${path}`
  return `parts/${path}`
}
const encoded=value=>normalize(value).split('/').map(encodeURIComponent).join('/')

function builtinOrientation(axis=[0,1,0]){
  const d=axis.map(Number)
  const n=Math.hypot(...d)||1
  const y=d.map(value=>-value/n)
  const seed=Math.abs(y[1])<.9?[0,1,0]:[1,0,0]
  const dot=seed[0]*y[0]+seed[1]*y[1]+seed[2]*y[2]
  let x=[
    seed[0]-dot*y[0],
    seed[1]-dot*y[1],
    seed[2]-dot*y[2],
  ]
  const xn=Math.hypot(...x)||1
  x=x.map(value=>value/xn)
  const z=[
    x[1]*y[2]-x[2]*y[1],
    x[2]*y[0]-x[0]*y[2],
    x[0]*y[1]-x[1]*y[0],
  ]
  return[
    x[0],y[0],z[0],
    x[1],y[1],z[1],
    x[2],y[2],z[2],
  ]
}

function builtinProfile(type){
  const section=(shape,radiusLdu,lengthLdu,elastic=false)=>({shape,radiusLdu,lengthLdu,elastic})
  switch(String(type||'')){
    case'axle':
      return{family:'cylinder',gender:'male',profile:{centered:true,caps:'none',sections:[section('A',6,20)]},capabilities:['slide']}
    case'axle-hole':
      return{family:'cylinder',gender:'female',profile:{centered:true,caps:'none',sections:[section('A',6,20)]},capabilities:['slide']}
    case'pin':
      return{family:'cylinder',gender:'male',profile:{centered:true,caps:'none',sections:[section('_L',6,20,true)]},capabilities:['slide']}
    case'pin-hole':
      return{family:'cylinder',gender:'female',profile:{centered:true,caps:'none',sections:[section('R',8,4),section('R',6,12),section('R',8,4)]},capabilities:['slide']}
    case'stud':
      return{family:'cylinder',gender:'male',profile:{centered:false,caps:'one',sections:[section('R',6,4)]},capabilities:[]}
    case'tube':
      return{family:'cylinder',gender:'female',profile:{centered:false,caps:'one',sections:[section('R',6,4)]},capabilities:[]}
    case'slider':
    case'slider-rail':
      return{
        family:'generic',
        gender:null,
        profile:{kind:'linear-guide',type:String(type)},
        capabilities:['slide'],
      }
    default:return null
  }
}

function builtinConnectorToEndpoint(connector,{bodyId,partId,index=0}={}){
  const shape=builtinProfile(connector?.type)
  if(!shape||!bodyId)return null
  const sourceId=String(connector?.id??`builtin-${index}`)
  return createEndpointDescriptor({
    id:deterministicId('endpoint',bodyId,'builtin',sourceId),
    bodyId,
    family:shape.family,
    gender:shape.gender,
    frame:{
      positionStud:Array.isArray(connector?.position)?connector.position.slice(0,3).map(Number):[0,0,0],
      orientationBrickLab:builtinOrientation(connector?.axis),
    },
    profile:shape.profile,
    capabilities:shape.capabilities,
    metadata:{
      sourceEndpointId:sourceId,
      builtinConnectorId:sourceId,
      builtinType:connector?.type??null,
      parser:'mechanics-next:builtin-catalog',
    },
    evidence:evidence({
      source:'bricklab-builtin-connector',
      confidence:'verified',
      reason:`native builtin connector type: ${connector?.type??'unknown'}`,
      detail:{partId},
    }),
  })
}

function rounded(value,digits=6){
  if(!Number.isFinite(value))return value
  const scale=10**digits
  return Math.round(value*scale)/scale
}
function stableConnectorValue(value){
  if(Array.isArray(value))return value.map(stableConnectorValue)
  if(!value||typeof value!=='object')return typeof value==='number'?rounded(value):value
  return Object.fromEntries(
    Object.keys(value).sort()
      .filter(key=>!['source','provenance','key','endpointId','clearIds','compatibilityEndpointId'].includes(key))
      .map(key=>[key,stableConnectorValue(value[key])])
  )
}
function nativeConnectorSignature(connector){
  return JSON.stringify(stableConnectorValue({
    family:connector?.family,
    gender:connector?.gender,
    group:connector?.group||null,
    frame:connector?.frame,
    geometry:connector?.geometry,
    snap:connector?.snap,
    inheritance:connector?.inheritance,
  }))
}
function fnv1a(text){
  let hash=0x811c9dc5
  for(let i=0;i<text.length;i+=1){
    hash^=text.charCodeAt(i)
    hash=Math.imul(hash,0x01000193)
  }
  return(hash>>>0).toString(16).padStart(8,'0')
}
function finalizeNativeConnectors(file,connectors=[]){
  const seen=new Set()
  const result=[]
  for(const connector of connectors){
    const signature=nativeConnectorSignature(connector)
    if(seen.has(signature))continue
    seen.add(signature)
    result.push(Object.freeze({
      ...connector,
      compatibilityEndpointId:`v4:${normalize(file)}:${fnv1a(signature)}`,
    }))
  }
  return Object.freeze(result)
}

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
    return file?rootPath(file):null
  }

  const builtinForPart=partId=>{
    const def=parts.get(partId)
    if(def?.ldraw?.file)return null
    const connectors=Array.isArray(def?.connectors)?def.connectors.filter(item=>builtinProfile(item?.type)):null
    if(!connectors?.length)return null
    return Object.freeze({
      status:'ready',
      partId:String(partId),
      file:null,
      builtin:true,
      connectors:Object.freeze(connectors.map(item=>Object.freeze({
        ...item,
        position:Array.isArray(item.position)?Object.freeze([...item.position]):null,
        axis:Array.isArray(item.axis)?Object.freeze([...item.axis]):null,
      }))),
      warnings:Object.freeze([]),
      source:Object.freeze({kind:'bricklab-builtin-catalog'}),
    })
  }

  const hydrate=partId=>{
    const id=String(partId||'')
    if(!id)return Promise.resolve(null)
    if(cache.get(id)?.status==='ready')return Promise.resolve(cache.get(id))
    if(pending.has(id))return pending.get(id)
    const builtin=builtinForPart(id)
    if(builtin){
      cache.set(id,builtin)
      revision+=1
      resolved+=1
      return Promise.resolve(builtin)
    }
    const file=fileForPart(id)
    if(!file){
      const value=Object.freeze({status:'missing',partId:id,file:null,connectors:Object.freeze([]),warnings:Object.freeze([])})
      cache.set(id,value)
      return Promise.resolve(value)
    }
    cache.set(id,Object.freeze({status:'loading',partId:id,file,connectors:Object.freeze([]),warnings:Object.freeze([])}))
    const promise=resolver.resolve(file).then(result=>{
      // Verified assembly seat geometry is read-only catalog evidence, not a
      // Connector V4 graph or hydration writer. Native endpoint IDs remain ours.
      const fixtures=discoverDifferentialFixturesV4(file)
      const finalized=finalizeNativeConnectors(result.file||file,[
        ...(result.connectors||[]),
        ...fixtures.connectors,
      ])
      const value=Object.freeze({
        status:'ready',
        partId:id,
        file,
        connectors:finalized,
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
      const builtin=builtinForPart(id)
      if(builtin){
        cache.set(id,builtin)
        revision+=1
        resolved+=1
        return builtin
      }
      void hydrate(id)
      return Object.freeze({status:'loading',partId:id,file:fileForPart(id),connectors:Object.freeze([]),warnings:Object.freeze([])})
    },
    hydrate,
    prefetch(partIds=[]){
      return Promise.allSettled([...new Set(partIds.map(String).filter(Boolean))].map(hydrate))
    },
    toEndpoint(connector,options={}){
      if(connector?.type&&Array.isArray(connector?.position)){
        return builtinConnectorToEndpoint(connector,options)
      }
      return ldcadConnectorToEndpoint(connector,options)
    },
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
