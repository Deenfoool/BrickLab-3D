// Three 0.180 caches rejected promises for missing subparts/geometry. Remove only
// the rejected entry, retaining all successful shared geometry and material caches.
export function installLDrawCacheRecovery(loader) {
  for (const [cache,method] of [[loader.partsCache?.parseCache,'ensureDataLoaded'],[loader.partsCache,'loadModel']]) {
    if(!cache || typeof cache[method]!=='function' || !cache._cache)throw Error('Unsupported LDraw loader cache contract')
    const original=cache[method]
    cache[method]=async function(file,...args){
      try{return await original.call(this,file,...args)}
      catch(error){
        const key=String(file).toLowerCase(),entry=this._cache[key]
        if(entry?.then)void Promise.resolve(entry).catch(()=>{if(this._cache[key]===entry)delete this._cache[key]})
        throw error
      }
    }
  }
  return loader
}

export async function retryLoad(operation,{attempts=2}={}) {
  for(let attempt=0;attempt<attempts;attempt++){
    try{return await operation()}
    catch(error){if(attempt+1===attempts || error?.status===404)throw error}
  }
}

export async function withLoadDeadline(task,ms=45000) {
  let timer
  try{return await Promise.race([task,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('LDraw loading timed out; retry the part')),ms)})])}
  finally{clearTimeout(timer)}
}

// Three may warn and omit a failed nested Part. Certify all referenced geometry
// before accepting a model, so an incomplete assembly is never cached as ready.
export async function parseCompleteLDraw(loader,text) {
  const cache=loader.partsCache.parseCache,complete=new Set()
  async function visit(info,ancestors) {
    await Promise.all(info.subobjects.map(async child=>{
      const key=child.fileName.toLowerCase()
      if(ancestors.has(key))throw Error(`Cyclic LDraw geometry: ${key}`)
      if(complete.has(key))return
      if(ancestors.size>80)throw Error('LDraw geometry nesting exceeds safe depth')
      await cache.ensureDataLoaded(child.fileName)
      await visit(cache.getData(child.fileName,false),new Set([...ancestors,key]))
      complete.add(key)
    }))
  }
  await visit(cache.parse(text),new Set())
  return new Promise((resolve,reject)=>loader.parse(text,resolve,reject))
}
