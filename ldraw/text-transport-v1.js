import { canonicalLDrawFile } from './part-aliases-v1.js?v=ldraw-aliases-20260917-v1'

export const LDRAW_UNOFFICIAL_MIRROR = 'https://raw.githubusercontent.com/brycewalls/ldraw-parts-mirror/304f0153dad23d3eebef1c1e85789a85973ee1e8/ldraw/UnOfficial/'

export const LDRAW_MIRRORS = [
  'https://raw.githubusercontent.com/mrkrstphr/ldraw-parts/main/',
  'https://raw.githubusercontent.com/pybricks/ldraw/master/',
  LDRAW_UNOFFICIAL_MIRROR,
]

// These files currently exist only in the pinned unofficial snapshot. Probing both
// official mirrors first adds four expected 404s to every engine load and makes real
// connector failures hard to spot in DevTools.
const UNOFFICIAL_ONLY_PATHS = new Set([
  'parts/4368.dat', 'parts/4369.dat',
  'parts/s/4368s01.dat', 'parts/s/4369s01.dat',
])

function canonicalReadPath(value){
  const path=String(value||'').replace(/\\/g,'/').trim()
  return /^parts\/[^/]+\.dat$/i.test(path)?canonicalLDrawFile(path):path
}

// Official mirrors stay first. The pinned unofficial Parts Tracker mirror is a
// last-resort fallback only, so a part automatically migrates to the official
// geometry as soon as either official mirror contains it.
// A 404 is authoritative only after every configured mirror has been checked.
export function createLDrawTextTransport({fetcher=globalThis.fetch,mirrors=LDRAW_MIRRORS,timeoutMs=15000}={}) {
  const cache=new Map()
  const missingPaths=new Set()
  const resolvedSubparts=new Map()
  const diagnostics={requests:0,network404:0,avoided404:0,mirrorFallbacks:0,locationHits:0,aliasHits:0}

  const missingError=path=>{const error=Error(`LDraw HTTP 404: ${path}`);error.status=404;return error}
  const bareKey=value=>String(value||'').replace(/\\/g,'/').trim().toLowerCase()
  // Normal LDraw part IDs are overwhelmingly numeric (3001.dat, 4719c01.dat) or
  // a single letter followed by a numeric ID (u9134.dat). Primitive names such as
  // stud.dat, 1-4chrd.dat, rect.dat, axlehole.dat and r04o1000.dat should therefore
  // go to p/ first instead of deliberately missing parts/ on every model parse.
  const looksLikePartFile=name=>/^(?:\d{3,}|[a-z]\d{3,})[a-z0-9_.-]*\.dat$/i.test(String(name||'').split('/').pop()||'')

  async function read(requestedPath) {
    const path=canonicalReadPath(requestedPath)
    if(path!==String(requestedPath||'').replace(/\\/g,'/').trim())diagnostics.aliasHits+=1
    if(!/^(?:parts|p|models)\/[\w/.-]+\.dat$/i.test(path) && path!=='LDConfig.ldr')throw Error(`Invalid LDraw path: ${path}`)
    if(path.split('/').includes('..'))throw Error('Invalid LDraw traversal')
    if(missingPaths.has(path)){diagnostics.avoided404+=1;throw missingError(path)}
    if(cache.has(path))return cache.get(path)
    const task=(async()=>{
      let last,allNotFound=true
      const readMirrors=UNOFFICIAL_ONLY_PATHS.has(path.toLowerCase())&&mirrors.includes(LDRAW_UNOFFICIAL_MIRROR)
        ? [LDRAW_UNOFFICIAL_MIRROR,...mirrors.filter(mirror=>mirror!==LDRAW_UNOFFICIAL_MIRROR)]
        : mirrors
      for(let index=0;index<readMirrors.length;index+=1){
        const mirror=readMirrors[index]
        const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs)
        try{
          diagnostics.requests+=1
          const response=await fetcher(mirror+path,{mode:'cors',cache:'force-cache',signal:controller.signal})
          if(!response.ok){
            const error=Error(`LDraw HTTP ${response.status}: ${path}`);error.status=response.status
            if(response.status===404)diagnostics.network404+=1
            else allNotFound=false
            throw error
          }
          const text=await response.text()
          if(!/^\s*0\s/m.test(text)||/^\s*</.test(text))throw Error(`Invalid LDraw response: ${path}`)
          return text
        }catch(error){
          last=error
          if(error?.status!==404)allNotFound=false
          if(index+1<readMirrors.length)diagnostics.mirrorFallbacks+=1
        }finally{clearTimeout(timer)}
      }
      if(allNotFound&&last?.status===404)missingPaths.add(path)
      throw last
    })()
    cache.set(path,task)
    try{return await task}catch(error){if(cache.get(path)===task)cache.delete(path);throw error}
  }

  async function subpart(file) {
    const normalized=String(file).replace(/\\/g,'/').trim()
    const key=bareKey(normalized)
    const paths=[]
    const remembered=resolvedSubparts.get(key)
    if(remembered){paths.push(remembered);diagnostics.locationHits+=1}
    for(const name of new Set([normalized,normalized.toLowerCase()])){
      if(/^(parts|p|models)\//i.test(name))paths.push(name)
      else if(/^(48|8)\//.test(name))paths.push(`p/${name}`)
      else if(/^s\//i.test(name))paths.push(`parts/${name}`)
      else if(looksLikePartFile(name))paths.push(`parts/${name}`,`p/${name}`,`models/${name}`)
      else paths.push(`p/${name}`,`parts/${name}`,`models/${name}`)
    }
    let last
    for(const path of [...new Set(paths)]){
      try{
        const text=await read(path)
        resolvedSubparts.set(key,canonicalReadPath(path))
        return text
      }catch(error){last=error;if(error.status!==404)throw error}
    }
    throw last
  }
  return {
    read,
    subpart,
    stats:()=>Object.freeze({...diagnostics,cached:cache.size,missing:missingPaths.size,resolved:resolvedSubparts.size}),
  }
}
