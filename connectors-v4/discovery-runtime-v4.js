import { PARTS, findPart } from '../parts.js'
import { fetchLDrawText } from '../ldraw/runtime-v3.js'
import { validateConnectorV4 } from './schema-v4.js'
import { finalizeConnectorIdentitiesV4 } from './identity-v4.js'
import { connectorToBrickLabV4 } from './shadow-resolver-v4.js'
import {
  CONNECTOR_DISCOVERY_VERSION_V4,
  discoverPrimitiveConnectorsV4,
  discoveryConnectorRoleV4,
  mergeDiscoveredConnectorsV4,
} from './discovery-v4.js?v=connector-discovery-20260912-v2'

export const CONNECTOR_DISCOVERY_RUNTIME_VERSION_V4 = 'connector-discovery-runtime-v4.2.0'

const MAX_CONNECTORS_PER_PART=4096
const inFlight=new Map()
const scanState=new Map()

function isReadyLDraw(def){
  return Boolean(def?.ldraw?.file&&String(def.id||'').startsWith('ldraw-')&&def.ldraw.ready&&def.connectivityV4?.status==='ready')
}

function summarizeRoles(connectors){
  const roles={}
  for(const connector of connectors??[]){
    const role=discoveryConnectorRoleV4(connector)||'other'
    roles[role]=(roles[role]||0)+1
  }
  return roles
}

function publish(def,detail={}){
  window.dispatchEvent(new CustomEvent('bricklab:connectordiscovery',{
    detail:{
      version:CONNECTOR_DISCOVERY_RUNTIME_VERSION_V4,
      discoveryVersion:CONNECTOR_DISCOVERY_VERSION_V4,
      partId:def?.id||null,
      file:def?.ldraw?.file||null,
      ...detail,
    },
  }))
}

async function augmentDefinition(def,{force=false}={}){
  if(!isReadyLDraw(def))return null
  const previous=def.connectivityV4.discovery
  if(!force&&previous?.version===CONNECTOR_DISCOVERY_VERSION_V4&&previous?.complete===true)return previous
  if(inFlight.has(def.id))return inFlight.get(def.id)

  const task=(async()=>{
    scanState.set(def.id,'loading')
    try{
      const text=await fetchLDrawText(def.ldraw.file)
      const discovery=await discoverPrimitiveConnectorsV4(def.ldraw.file,text,fetchLDrawText)
      const merged=mergeDiscoveredConnectorsV4(def.connectivityV4.connectors,discovery.connectors)
      const validRaw=merged.added.filter(connector=>validateConnectorV4(connector).valid)
      const identities=finalizeConnectorIdentitiesV4(def.ldraw.file,validRaw)
      const existingIds=new Set((def.connectivityV4.connectors??[]).map(connector=>connector.endpointId).filter(Boolean))
      const capacity=Math.max(0,MAX_CONNECTORS_PER_PART-(def.connectivityV4.connectors?.length||0))
      const additions=[]
      for(const connector of identities.connectors){
        if(additions.length>=capacity)break
        if(existingIds.has(connector.endpointId))continue
        const converted=connectorToBrickLabV4(connector,def.connectivityV4.visualOffsetStud||[0,0,0])
        if(!validateConnectorV4(converted).valid)continue
        existingIds.add(converted.endpointId)
        additions.push(converted)
      }

      if(additions.length)def.connectivityV4.connectors.push(...additions)
      def.connectivityV4.stats={
        ...(def.connectivityV4.stats||{}),
        discoveryCandidates:discovery.connectors.length,
        discoverySuppressed:merged.suppressed,
        discoveryAdded:additions.length,
        discoveryRejected:merged.added.length-validRaw.length,
      }
      def.connectivityV4.discovery={
        version:CONNECTOR_DISCOVERY_VERSION_V4,
        runtimeVersion:CONNECTOR_DISCOVERY_RUNTIME_VERSION_V4,
        complete:true,
        candidates:discovery.connectors.length,
        suppressed:merged.suppressed,
        added:additions.length,
        roles:summarizeRoles(additions),
        scanStats:discovery.stats,
      }
      if(def.connectivityV4.health)def.connectivityV4.health={...def.connectivityV4.health,connectors:def.connectivityV4.connectors.length}
      scanState.set(def.id,'ready')
      publish(def,{status:'ready',...def.connectivityV4.discovery})
      if(additions.length){
        window.dispatchEvent(new CustomEvent('bricklab:mechanicalintelligencechange',{detail:{partId:def.id,reason:'connector-discovery',added:additions.length}}))
        window.dispatchEvent(new CustomEvent('bricklab:partcatalogchange'))
      }
      return def.connectivityV4.discovery
    }catch(error){
      const message=String(error?.message||error)
      scanState.set(def.id,'error')
      def.connectivityV4.discovery={version:CONNECTOR_DISCOVERY_VERSION_V4,runtimeVersion:CONNECTOR_DISCOVERY_RUNTIME_VERSION_V4,complete:false,error:message}
      console.debug?.(`[BrickLab Connector Discovery] ${def.id} scan skipped`,error)
      publish(def,{status:'error',error:message})
      return def.connectivityV4.discovery
    }finally{inFlight.delete(def.id)}
  })()
  inFlight.set(def.id,task)
  return task
}

function schedule(partId){
  const def=findPart(partId)
  if(!isReadyLDraw(def))return
  queueMicrotask(()=>void augmentDefinition(def))
}

window.addEventListener('bricklab:connectorv4',event=>{
  const status=event.detail?.status
  if(status==='ready'||status==='quarantined')schedule(event.detail?.partId)
})
window.addEventListener('bricklab:ldrawloaded',event=>schedule(event.detail?.id))
queueMicrotask(()=>{for(const def of PARTS)if(isReadyLDraw(def))void augmentDefinition(def)})

globalThis.BrickLabConnectorDiscovery=Object.freeze({
  version:CONNECTOR_DISCOVERY_RUNTIME_VERSION_V4,
  discoveryVersion:CONNECTOR_DISCOVERY_VERSION_V4,
  scan(partId,{force=false}={}){return augmentDefinition(findPart(partId),{force})},
  state(partId){return scanState.get(partId)||'idle'},
  status(partId){return findPart(partId)?.connectivityV4?.discovery||null},
  stats(){
    let ready=0,error=0,added=0
    for(const def of PARTS){
      const info=def?.connectivityV4?.discovery
      if(!info)continue
      if(info.complete)ready+=1;else if(info.error)error+=1
      added+=Number(info.added)||0
    }
    return Object.freeze({ready,error,added,inFlight:inFlight.size})
  },
})
