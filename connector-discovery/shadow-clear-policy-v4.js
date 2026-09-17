import { parseShadowTextV4 } from '../connectors-v4/ldcad-parser-v4.js'

export const SHADOW_CLEAR_POLICY_VERSION_V4='connector-shadow-clear-policy-v4.1.0'

// These semantic primitives carry stable IDs in the pinned LDCad Shadow Library.
// If a part-level Shadow explicitly SNAP_CLEARs one of those IDs, geometry discovery
// must not resurrect the removed inherited endpoint afterwards.
const CLEAR_IDS_BY_PRIMITIVE=Object.freeze({
  'axlehole.dat':Object.freeze(['axleHole']),
  'axlehol4.dat':Object.freeze(['axleHole']),
  'axlehol5.dat':Object.freeze(['axleHole']),
})

const basename=value=>String(value||'').replace(/\\/g,'/').split('/').pop()?.toLowerCase()||''

export function rootShadowClearIdsV4(text,{file=''}={}){
  if(!String(text||'').trim())return[]
  const parsed=parseShadowTextV4(text,{file})
  return[...new Set(parsed.operations.filter(operation=>operation?.type==='clear'&&operation.id).map(operation=>operation.id))]
}

export function discoveredConnectorClearIdsV4(connector){
  const explicit=Array.isArray(connector?.clearIds)?connector.clearIds:[]
  const primitiveIds=CLEAR_IDS_BY_PRIMITIVE[basename(connector?.source?.primitive)]??[]
  return[...new Set([...explicit,...primitiveIds].filter(Boolean))]
}

export function filterShadowClearedDiscoveryV4(connectors,clearIds){
  const blocked=new Set(clearIds??[])
  const kept=[]
  const suppressed=[]
  for(const connector of connectors??[]){
    const ids=discoveredConnectorClearIdsV4(connector)
    const blockedBy=ids.find(id=>blocked.has(id))||null
    if(blockedBy)suppressed.push({connector,clearId:blockedBy})
    else kept.push(connector)
  }
  return{kept,suppressed,blockedIds:[...blocked]}
}
