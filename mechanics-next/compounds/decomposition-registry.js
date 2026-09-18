import { createNativeLDrawInheritanceResolver } from '../ldraw/official-inheritance.js'
import { createNativeShadowResolver } from '../ldraw/shadow-resolver.js'
import { createPartMechanicalDescriptor } from '../intelligence/part-descriptor.js'
import { decomposeShortcutInstance, inferCompoundTopology } from './shortcut-decomposer.js'

export const COMPOUND_DECOMPOSITION_REGISTRY_VERSION='mechanics-compound-decomposition-registry-0.1.0'

function observationFromMetadata(path,metadata){
  const file=String(metadata?.file||path||'')
  const code=String(metadata?.code||file.replace(/^parts\//i,'').replace(/\.dat$/i,''))
  return Object.freeze({
    id:`ldraw-${code}`,
    name:metadata?.description??metadata?.name??`LDraw ${code}`,
    description:metadata?.description??metadata?.name??null,
    category:metadata?.category??'LDraw',
    tags:Object.freeze(['ldraw',code,file,...(metadata?.keywords||[])]),
    ldraw:Object.freeze({code,file}),
  })
}

export class CompoundDecompositionRegistry{
  #ldraw
  #inheritance
  #cache=new Map()
  #pending=new Map()
  #failures=new Map()
  #descriptorCache=new Map()
  #revision=0
  #onResolved

  constructor({
    ldraw=globalThis.BrickLabLDraw,
    inheritanceResolver=null,
    shadowResolver=null,
    onResolved=null,
  }={}){
    if(typeof ldraw?.readText!=='function'){
      throw new TypeError('Compound decomposition registry requires BrickLabLDraw.readText')
    }
    this.#ldraw=ldraw
    const shadow=shadowResolver??createNativeShadowResolver({
      // Compound boundary discovery itself does not require Shadow metadata.
      // A real native shadow resolver may be injected later without changing this API.
      fetchShadowText:async()=>null,
    })
    this.#inheritance=inheritanceResolver??createNativeLDrawInheritanceResolver({
      fetchOfficialText:async path=>{
        try{return await ldraw.readText(path)}
        catch{return null}
      },
      shadowResolver:shadow,
    })
    this.#onResolved=typeof onResolved==='function'?onResolved:null
  }

  get revision(){return this.#revision}

  cached(instanceId){
    return this.#cache.get(String(instanceId||''))??null
  }

  failure(instanceId){
    return this.#failures.get(String(instanceId||''))??null
  }

  async #describePath(path){
    const key=String(path||'')
    if(this.#descriptorCache.has(key))return this.#descriptorCache.get(key)
    const promise=(async()=>{
      let metadata=null
      try{
        metadata=await this.#ldraw.getMetadata?.(key.replace(/^parts\//i,''))
      }catch{}
      if(!metadata){
        try{
          const text=await this.#ldraw.readText(key)
          const first=String(text||'').split(/\r?\n/).find(line=>/^0\s+\S/.test(line))
          metadata={
            file:key.replace(/^parts\//i,''),
            code:key.split('/').pop()?.replace(/\.dat$/i,'')||key,
            description:first?.replace(/^0\s+/,'').trim()||null,
          }
        }catch{return null}
      }
      return createPartMechanicalDescriptor({
        observation:observationFromMetadata(key,metadata),
        endpoints:[],
      })
    })()
    this.#descriptorCache.set(key,promise)
    try{return await promise}
    catch(error){
      this.#descriptorCache.delete(key)
      throw error
    }
  }

  async resolve(instance){
    const instanceId=String(instance?.body?.instanceId||'')
    if(!instanceId)return null
    const descriptor=instance?.descriptor
    if(descriptor?.bodyPolicy!=='compound-candidate')return null
    if(this.#cache.has(instanceId))return this.#cache.get(instanceId)
    if(this.#pending.has(instanceId))return this.#pending.get(instanceId)

    const file=descriptor?.file
    if(!file){
      const failure=Object.freeze({reason:'ldraw-file-missing',instanceId})
      this.#failures.set(instanceId,failure)
      return null
    }

    const promise=(async()=>{
      const decomposition=await decomposeShortcutInstance({
        instanceId,
        partId:instance.body.partId,
        file,
        inheritanceResolver:this.#inheritance,
        describePath:path=>this.#describePath(path),
      })
      const value=Object.freeze({
        ...decomposition,
        topology:inferCompoundTopology(
          decomposition,
          descriptor?.classification?.role,
        ),
      })
      this.#cache.set(instanceId,value)
      this.#failures.delete(instanceId)
      this.#revision+=1
      this.#onResolved?.(value,instance)
      return value
    })().catch(error=>{
      const failure=Object.freeze({
        reason:'decomposition-error',
        instanceId,
        detail:String(error?.message||error),
      })
      this.#failures.set(instanceId,failure)
      this.#revision+=1
      return null
    }).finally(()=>this.#pending.delete(instanceId))

    this.#pending.set(instanceId,promise)
    return promise
  }

  prefetch(instances=[]){
    const tasks=[]
    for(const instance of instances){
      if(instance?.descriptor?.bodyPolicy!=='compound-candidate')continue
      tasks.push(this.resolve(instance))
    }
    return Promise.allSettled(tasks)
  }

  invalidate(instanceId){
    const id=String(instanceId||'')
    const removed=this.#cache.delete(id)
    this.#failures.delete(id)
    if(removed)this.#revision+=1
    return removed
  }

  clear(){
    const count=this.#cache.size+this.#failures.size
    this.#cache.clear()
    this.#failures.clear()
    this.#descriptorCache.clear()
    this.#inheritance.clearCache?.()
    if(count)this.#revision+=1
    return count
  }

  status(){
    const resolved=[...this.#cache.values()]
    return Object.freeze({
      version:COMPOUND_DECOMPOSITION_REGISTRY_VERSION,
      revision:this.#revision,
      resolved:this.#cache.size,
      pending:this.#pending.size,
      failures:this.#failures.size,
      members:resolved.reduce((sum,item)=>sum+(item.members?.length||0),0),
      topologies:Object.freeze(resolved.reduce((acc,item)=>{
        const status=item.topology?.status||'unknown'
        acc[status]=(acc[status]||0)+1
        return acc
      },{})),
    })
  }
}

export function createCompoundDecompositionRegistry(options){
  return new CompoundDecompositionRegistry(options)
}
