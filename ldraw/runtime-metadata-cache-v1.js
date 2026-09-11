import { findPart } from '../parts.js'
import {
  LDRAW_RUNTIME_VERSION,
  getLDrawMetadata as getBaseLDrawMetadata,
} from './runtime-v3.js'
import { createPersistentJsonCache } from '../performance/persistent-cache-v1.js'

export * from './runtime-v3.js'

export const LDRAW_PERSISTENT_METADATA_VERSION = 'ldraw-persistent-metadata-v1.0.0'
const cache=createPersistentJsonCache({
  namespace:'ldraw-metadata',
  version:`${LDRAW_PERSISTENT_METADATA_VERSION}:${LDRAW_RUNTIME_VERSION}`,
  ttlMs:30*24*60*60*1000,
})
const diagnostics={hits:0,misses:0,writes:0,seeds:0}

const normalizeFile=value=>String(value||'').replace(/^parts\//i,'').replace(/\\/g,'/').trim()
const codeOf=file=>normalizeFile(file).replace(/\.dat$/i,'')

function metadataFromDefinition(def){
  const ldraw=def?.ldraw
  if(!ldraw?.file||!ldraw?.ready)return null
  return {
    file:normalizeFile(ldraw.file),
    code:ldraw.code||codeOf(ldraw.file),
    name:ldraw.name||'',
    description:ldraw.description||def.name||`LDraw part ${ldraw.code||codeOf(ldraw.file)}`,
    category:ldraw.category||'',
    keywords:Array.isArray(ldraw.keywords)?[...ldraw.keywords]:[],
    license:ldraw.license||'',
    type:ldraw.type||'',
  }
}

async function seedDefinition(def){
  const metadata=metadataFromDefinition(def)
  if(!metadata)return false
  await cache.set(metadata.file,metadata)
  diagnostics.seeds+=1;diagnostics.writes+=1
  return true
}

export async function getLDrawMetadata(file){
  const normalized=normalizeFile(file)
  if(!normalized)return getBaseLDrawMetadata(file)
  const cached=await cache.get(normalized)
  if(cached){diagnostics.hits+=1;return cached}
  diagnostics.misses+=1
  const metadata=await getBaseLDrawMetadata(normalized)
  await cache.set(normalized,metadata)
  diagnostics.writes+=1
  return metadata
}

if(typeof window!=='undefined'){
  window.addEventListener('bricklab:ldrawloaded',event=>{
    const def=findPart(event.detail?.id)
    if(def)void seedDefinition(def).catch(()=>{})
  })
}

globalThis.BrickLabLDrawPersistentMetadata=Object.freeze({
  version:LDRAW_PERSISTENT_METADATA_VERSION,
  get:getLDrawMetadata,
  seed:seedDefinition,
  stats:()=>Object.freeze({...diagnostics,storage:cache.stats()}),
})
