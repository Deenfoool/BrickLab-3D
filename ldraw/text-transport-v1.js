export const LDRAW_MIRRORS = [
  'https://raw.githubusercontent.com/pybricks/ldraw/master/',
  'https://cdn.jsdelivr.net/gh/pybricks/ldraw@master/',
]

// Same library on both hosts. A CDN failure never substitutes unrelated geometry.
export function createLDrawTextTransport({fetcher=globalThis.fetch,mirrors=LDRAW_MIRRORS,timeoutMs=15000}={}) {
  const cache=new Map()
  async function read(path) {
    if(!/^(?:parts|p|models)\/[\w/.-]+\.dat$/i.test(path) && path!=='LDConfig.ldr')throw Error(`Invalid LDraw path: ${path}`)
    if(path.split('/').includes('..'))throw Error('Invalid LDraw traversal')
    if(cache.has(path))return cache.get(path)
    const task=(async()=>{
      let last
      for(const mirror of mirrors){
        const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs)
        try{
          const response=await fetcher(mirror+path,{mode:'cors',cache:'force-cache',signal:controller.signal})
          if(!response.ok){const error=Error(`LDraw HTTP ${response.status}: ${path}`);error.status=response.status;throw error}
          const text=await response.text()
          if(!/^\s*0\s/m.test(text)||/^\s*</.test(text))throw Error(`Invalid LDraw response: ${path}`)
          return text
        }catch(error){last=error}finally{clearTimeout(timer)}
      }
      throw last
    })()
    cache.set(path,task)
    try{return await task}catch(error){if(cache.get(path)===task)cache.delete(path);throw error}
  }
  async function subpart(file) {
    const normalized=String(file).replace(/\\/g,'/').trim()
    const paths=[]
    for(const name of new Set([normalized,normalized.toLowerCase()])){
      if(/^(parts|p|models)\//i.test(name))paths.push(name)
      else if(/^(48|8)\//.test(name))paths.push(`p/${name}`)
      else if(/^s\//i.test(name))paths.push(`parts/${name}`)
      else paths.push(`parts/${name}`,`p/${name}`,`models/${name}`)
    }
    let last
    for(const path of paths){try{return await read(path)}catch(error){last=error;if(error.status!==404)throw error}}
    throw last
  }
  return {read,subpart}
}
