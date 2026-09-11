export const PERSISTENT_CACHE_VERSION = 'persistent-cache-v1.0.0'
const DB_NAME='bricklab-performance-v1'
const STORE='kv'

function storageKey(namespace,version,key){return `bricklab.cache.${namespace}.${version}:${key}`}
function defaultIndexedDB(){try{return globalThis.indexedDB??null}catch{return null}}
function defaultStorage(){try{return globalThis.localStorage??null}catch{return null}}

function openDb(indexedDBRef){
  return new Promise((resolve,reject)=>{
    const request=indexedDBRef.open(DB_NAME,1)
    request.onupgradeneeded=()=>{
      const db=request.result
      if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:'id'})
    }
    request.onsuccess=()=>resolve(request.result)
    request.onerror=()=>reject(request.error||new Error('IndexedDB open failed'))
  })
}

function requestPromise(request){
  return new Promise((resolve,reject)=>{
    request.onsuccess=()=>resolve(request.result)
    request.onerror=()=>reject(request.error||new Error('IndexedDB request failed'))
  })
}

export function createPersistentJsonCache({
  namespace='default',
  version='v1',
  ttlMs=30*24*60*60*1000,
  indexedDBRef=defaultIndexedDB(),
  storage=defaultStorage(),
  now=()=>Date.now(),
}={}){
  let dbPromise=null
  const stats={hits:0,misses:0,writes:0,expired:0,errors:0,backend:indexedDBRef?'indexeddb':storage?'localstorage':'memory'}
  const memory=new Map()
  const idFor=key=>storageKey(namespace,version,key)
  const finiteTime=value=>Number.isFinite(Number(value))?Number(value):0
  const fresh=record=>record && (!ttlMs || now()-finiteTime(record.storedAt)<=ttlMs)

  async function db(){
    if(!indexedDBRef)return null
    dbPromise??=openDb(indexedDBRef).catch(()=>{stats.errors+=1;dbPromise=null;return null})
    return dbPromise
  }

  async function readRecord(id){
    const database=await db()
    if(database){
      try{return await requestPromise(database.transaction(STORE,'readonly').objectStore(STORE).get(id))}
      catch{stats.errors+=1}
    }
    if(storage){
      try{const raw=storage.getItem(id);return raw?JSON.parse(raw):null}catch{stats.errors+=1}
    }
    return memory.get(id)??null
  }

  async function writeRecord(record){
    const database=await db()
    if(database){
      try{await requestPromise(database.transaction(STORE,'readwrite').objectStore(STORE).put(record));return true}
      catch{stats.errors+=1}
    }
    if(storage){
      try{storage.setItem(record.id,JSON.stringify(record));return true}catch{stats.errors+=1}
    }
    memory.set(record.id,record);return true
  }

  async function deleteRecord(id){
    const database=await db()
    if(database){try{await requestPromise(database.transaction(STORE,'readwrite').objectStore(STORE).delete(id))}catch{stats.errors+=1}}
    if(storage){try{storage.removeItem(id)}catch{stats.errors+=1}}
    memory.delete(id)
  }

  return Object.freeze({
    version:PERSISTENT_CACHE_VERSION,
    async get(key){
      const id=idFor(key)
      const record=await readRecord(id)
      if(!record){stats.misses+=1;return null}
      if(!fresh(record)){
        stats.expired+=1;stats.misses+=1
        await deleteRecord(id)
        return null
      }
      stats.hits+=1
      return record.value
    },
    async set(key,value){
      const record={id:idFor(key),namespace,version,key:String(key),storedAt:now(),value}
      await writeRecord(record);stats.writes+=1;return value
    },
    async delete(key){await deleteRecord(idFor(key))},
    async clearKnown(keys=[]){for(const key of keys)await deleteRecord(idFor(key))},
    stats:()=>Object.freeze({...stats,namespace,cacheVersion:version,ttlMs}),
  })
}
