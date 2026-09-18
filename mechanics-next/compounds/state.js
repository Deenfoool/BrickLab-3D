export const COMPOUND_STATE_VERSION='mechanics-compound-state-0.1.0'

export class CompoundStateRegistry{
  #states=new Map()
  #revision=0

  get revision(){return this.#revision}

  get(key){
    const value=this.#states.get(String(key||''))
    return value?Object.freeze(structuredClone(value)):null
  }

  set(key,value){
    const id=String(key||'').trim()
    if(!id)throw new TypeError('compound state key is required')
    if(value==null){
      const removed=this.#states.delete(id)
      if(removed)this.#revision+=1
      return null
    }
    const cloned=structuredClone(value)
    this.#states.set(id,cloned)
    this.#revision+=1
    return Object.freeze(structuredClone(cloned))
  }

  delete(key){
    const removed=this.#states.delete(String(key||''))
    if(removed)this.#revision+=1
    return removed
  }

  clear(){
    const count=this.#states.size
    this.#states.clear()
    if(count)this.#revision+=1
    return count
  }

  entries(){
    return Object.freeze([...this.#states.entries()].map(([key,value])=>
      Object.freeze([key,Object.freeze(structuredClone(value))])))
  }

  snapshot(){
    return Object.freeze({
      version:COMPOUND_STATE_VERSION,
      revision:this.#revision,
      states:Object.freeze(Object.fromEntries(
        [...this.#states].map(([key,value])=>[key,structuredClone(value)]),
      )),
    })
  }
}

export function createCompoundStateRegistry(){
  return new CompoundStateRegistry()
}
