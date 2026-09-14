import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { findPart } from '../parts.js'
import { loadPreviewLDrawModel, resetPreviewGeometryLoader } from './preview-geometry-v1.js?v=parts-library-family-preload-20260914-v1'

export const PARTS_LIBRARY_PREVIEW_VERSION = 'parts-library-preview-v1.1.0'

const PREVIEW_SIZE = Object.freeze({ width:320, height:220 })
const MAX_CONCURRENT = 2
const MAX_CACHE = 240
const FAMILY_WORKERS = 2
const RETRY_AFTER_MS = 30000
const PREVIEW_LOADER_ROTATE = 96
const PERSISTENT_CACHE = 'bricklab-parts-previews-v1'
const PERSISTENT_SCHEMA = 'family-preload-20260914-v1'
const keyFor = item => item?.key || item?.id || (item?.file ? `ldraw-${item.file}` : null)
const materialList = material => Array.isArray(material) ? material : material ? [material] : []
const priorityValue = priority => priority === 'high' ? 0 : priority === 'background' ? 2 : 1

function markPreviewResolution(root) {
  root?.traverse?.(child => {
    for (const material of materialList(child.material)) material?.resolution?.set?.(PREVIEW_SIZE.width, PREVIEW_SIZE.height)
  })
}

function cloneLDrawPreviewModel(model, color = 0xd7263d, { disposeGeometry=false } = {}) {
  const root = model.clone(true)
  const clonedMaterials = new Set()
  const geometries = new Set()
  root.traverse(child => {
    if (child.geometry) geometries.add(child.geometry)
    if (!child.isMesh && !child.isLineSegments) return
    const source = materialList(child.material)
    const clones = source.map(material => {
      if (!material) return material
      const copy = material.clone()
      clonedMaterials.add(copy)
      if (copy.name === 'Main_Colour' && copy.color) copy.color.setHex(color)
      return copy
    })
    child.material = Array.isArray(child.material) ? clones : clones[0]
  })
  markPreviewResolution(root)
  return {
    object:root,
    dispose() {
      clonedMaterials.forEach(material => material.dispose?.())
      if (disposeGeometry) geometries.forEach(geometry => geometry.dispose?.())
    },
  }
}

function nativePreviewObject(definition) {
  if (!definition?.create) return null
  const object = definition.create(definition.defaultColor)
  if (!object) return null
  markPreviewResolution(object)
  return {
    object,
    dispose() {
      object.traverse?.(child => {
        if (!child.geometry?.userData?.bricklabSharedVisual) child.geometry?.dispose?.()
        for (const material of materialList(child.material)) {
          if (!material?.userData?.bricklabSharedVisual) material?.dispose?.()
        }
      })
    },
  }
}

function hashFamily(items) {
  let hash = 2166136261
  for (const item of items) {
    const key = keyFor(item) || ''
    for (let i=0;i<key.length;i+=1) {
      hash ^= key.charCodeAt(i)
      hash = Math.imul(hash, 16777619)
    }
    hash ^= 124
    hash = Math.imul(hash, 16777619)
  }
  return `${PERSISTENT_SCHEMA}:${items.length}:${(hash >>> 0).toString(36)}`
}

export function createPartsLibraryPreviewService({ findDefinition=findPart, loadLDraw=loadPreviewLDrawModel, now=()=>Date.now() } = {}) {
  const cache=new Map(),failures=new Map(),pending=new Map(),pendingPriority=new Map(),queued=new Map(),queue=[]
  const persistedKeys=new Set()
  let active=0,pumpScheduled=false,renderer=null,scene=null,camera=null,rendererUnavailable=false,order=0
  let persistentCachePromise=null,persistentUnavailable=false,persistentHits=0,persistentWrites=0,persistentWriteFailures=0
  let generatedSinceLoaderReset=0

  function remember(key,value) {
    cache.delete(key);cache.set(key,value)
    while(cache.size>MAX_CACHE)cache.delete(cache.keys().next().value)
  }

  function cacheRequest(kind,key) {
    const origin=globalThis.location?.origin || 'https://bricklab.invalid'
    return new Request(`${origin}/__bricklab_parts_preview_cache__/${PERSISTENT_SCHEMA}/${kind}/${encodeURIComponent(key)}`)
  }

  async function persistentStore() {
    if(persistentUnavailable || typeof globalThis.caches?.open!=='function')return null
    if(!persistentCachePromise){
      persistentCachePromise=globalThis.caches.open(PERSISTENT_CACHE).catch(error=>{
        persistentUnavailable=true
        persistentCachePromise=null
        console.debug?.('[BrickLab Library] Persistent preview cache unavailable.',error)
        return null
      })
    }
    return persistentCachePromise
  }

  async function readPersistent(key) {
    try {
      const store=await persistentStore();if(!store)return null
      const response=await store.match(cacheRequest('item',key));if(!response)return null
      const value=await response.text()
      if(!/^data:image\//.test(value))return null
      persistedKeys.add(key);persistentHits+=1
      return value
    } catch(error){console.debug?.('[BrickLab Library] Persistent preview read failed.',error);return null}
  }

  async function writePersistent(key,value) {
    if(!key||!value)return false
    if(persistedKeys.has(key))return true
    try {
      const store=await persistentStore();if(!store)return false
      await store.put(cacheRequest('item',key),new Response(value,{headers:{'content-type':'text/plain;charset=utf-8','cache-control':'max-age=31536000, immutable'}}))
      persistedKeys.add(key);persistentWrites+=1
      return true
    } catch(error){
      persistentWriteFailures+=1
      console.debug?.('[BrickLab Library] Persistent preview write failed.',error)
      return false
    }
  }

  async function readFamilyManifest(familyId) {
    try {
      const store=await persistentStore();if(!store)return null
      const response=await store.match(cacheRequest('family',familyId));return response?response.text():null
    } catch{return null}
  }

  async function writeFamilyManifest(familyId,signature) {
    try {
      const store=await persistentStore();if(!store)return false
      await store.put(cacheRequest('family',familyId),new Response(signature,{headers:{'content-type':'text/plain;charset=utf-8'}}))
      return true
    } catch{return false}
  }

  function ensureRenderer() {
    if(renderer)return true
    if(rendererUnavailable)return false
    try {
      renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true,powerPreference:'low-power'})
      renderer.setPixelRatio(Math.min(1.5,globalThis.devicePixelRatio||1));renderer.setSize(PREVIEW_SIZE.width,PREVIEW_SIZE.height,false);renderer.setClearColor(0x000000,0)
      renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.02
      scene=new THREE.Scene();scene.userData.bricklabPartsLibraryPreview=true
      camera=new THREE.PerspectiveCamera(30,PREVIEW_SIZE.width/PREVIEW_SIZE.height,.01,200)
      scene.add(new THREE.HemisphereLight(0xf5f9ff,0x263039,1.55))
      const key=new THREE.DirectionalLight(0xfffbf2,2.35);key.position.set(5,8,7)
      const fill=new THREE.DirectionalLight(0xb6d2ff,.72);fill.position.set(-5,4,-3);scene.add(key,fill)
      try {
        const pmrem=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment();scene.environment=pmrem.fromScene(room,.04).texture;room.dispose?.();pmrem.dispose()
      } catch(error){console.debug?.('[BrickLab Library] Preview environment unavailable; direct lights remain active.',error)}
      return true
    } catch(error){rendererUnavailable=true;renderer=null;console.warn('[BrickLab Library] 3D part previews unavailable.',error);return false}
  }

  function renderObject(source) {
    if(!source?.object)return null
    if(!ensureRenderer()){source.dispose?.();return null}
    const wrapper=new THREE.Group(),object=source.object;wrapper.add(object);scene.add(wrapper)
    try {
      object.updateMatrixWorld?.(true)
      const bounds=new THREE.Box3().setFromObject(object);if(bounds.isEmpty())return null
      const center=bounds.getCenter(new THREE.Vector3());object.position.sub(center)
      wrapper.rotation.set(-.28,-.72,.035);wrapper.updateMatrixWorld(true)
      const framed=new THREE.Box3().setFromObject(wrapper),framedCenter=framed.getCenter(new THREE.Vector3()),size=framed.getSize(new THREE.Vector3())
      const radius=Math.max(size.x,size.y,size.z,.65);wrapper.position.sub(framedCenter);wrapper.updateMatrixWorld(true)
      camera.position.set(radius*1.35,radius*.92,radius*2.25);camera.near=Math.max(.01,radius/100);camera.far=Math.max(30,radius*14);camera.lookAt(0,0,0);camera.updateProjectionMatrix()
      renderer.render(scene,camera)
      let url=renderer.domElement.toDataURL('image/webp',.72)
      if(!/^data:image\/webp/i.test(url))url=renderer.domElement.toDataURL('image/png')
      return url
    } finally {scene.remove(wrapper);source.dispose?.()}
  }

  async function sourceFor(item) {
    const definition=findDefinition(item?.key)
    if(item?.file){
      if(definition?.ldraw?.ready&&definition.create)return nativePreviewObject(definition)
      const payload=await loadLDraw(item.file);if(!payload?.model)return null
      return cloneLDrawPreviewModel(payload.model,definition?.defaultColor??0xd7263d,{disposeGeometry:true})
    }
    return nativePreviewObject(definition)
  }

  function pump() {
    pumpScheduled=false;queue.sort((a,b)=>a.priority-b.priority||a.order-b.order)
    while(active<MAX_CONCURRENT&&queue.length)void execute(queue.shift())
  }
  function schedulePump(immediate=false) {
    if(!queue.length)return
    if(immediate&&pumpScheduled){pumpScheduled=false;queueMicrotask(pump);return}
    if(pumpScheduled)return
    pumpScheduled=true
    if(immediate)queueMicrotask(pump)
    else if(typeof globalThis.requestIdleCallback==='function')globalThis.requestIdleCallback(pump,{timeout:180})
    else setTimeout(pump,24)
  }
  async function execute(task) {
    active+=1;queued.delete(task.key)
    try {
      const source=await sourceFor(task.item),url=source?renderObject(source):null
      if(url){
        failures.delete(task.key);remember(task.key,url);await writePersistent(task.key,url)
        if(task.item?.file){generatedSinceLoaderReset+=1;if(generatedSinceLoaderReset>=PREVIEW_LOADER_ROTATE){generatedSinceLoaderReset=0;resetPreviewGeometryLoader()}}
      } else failures.set(task.key,now())
      task.resolve(url)
    } catch(error){failures.set(task.key,now());console.debug?.(`[BrickLab Library] Preview failed for ${task.item?.code||task.key}`,error);task.resolve(null)}
    finally{pending.delete(task.key);pendingPriority.delete(task.key);active-=1;schedulePump(false)}
  }

  function request(item,{priority='normal'}={}) {
    const key=keyFor(item);if(!key)return Promise.resolve(null)
    if(cache.has(key)){const value=cache.get(key);remember(key,value);return Promise.resolve(value)}
    const failedAt=failures.get(key);if(failedAt&&now()-failedAt<RETRY_AFTER_MS)return Promise.resolve(null)
    const nextPriority=priorityValue(priority)
    if(pending.has(key)){
      pendingPriority.set(key,Math.min(pendingPriority.get(key)??nextPriority,nextPriority))
      const task=queued.get(key);if(task){task.priority=pendingPriority.get(key);if(task.priority===0)schedulePump(true)}
      return pending.get(key)
    }
    let resolve;const promise=new Promise(done=>{resolve=done})
    pending.set(key,promise);pendingPriority.set(key,nextPriority)
    void (async()=>{
      const stored=await readPersistent(key)
      if(stored){remember(key,stored);pending.delete(key);pendingPriority.delete(key);resolve(stored);return}
      const task={key,item:{...item},priority:pendingPriority.get(key)??nextPriority,order:order++,resolve}
      queued.set(key,task);queue.push(task);schedulePump(task.priority===0)
    })().catch(error=>{
      pending.delete(key);pendingPriority.delete(key);failures.set(key,now());console.debug?.('[BrickLab Library] Preview cache lookup failed.',error);resolve(null)
    })
    return promise
  }

  async function preloadFamily(familyId,items,{signal,onProgress,workers=FAMILY_WORKERS}={}) {
    const seen=new Set(),familyItems=[]
    for(const item of items??[]){const key=keyFor(item);if(!key||seen.has(key))continue;seen.add(key);familyItems.push(item)}
    const total=familyItems.length,signature=hashFamily(familyItems)
    const notify=state=>{try{onProgress?.(Object.freeze({...state,percent:state.total?Math.round(state.done/state.total*100):100}))}catch{}}
    if(!total){const result={phase:'complete',familyId,total:0,done:0,failed:0,cached:0,cancelled:false};notify(result);return result}
    const store=await persistentStore()
    if(!store){const result={phase:'unavailable',familyId,total,done:0,failed:total,cached:0,cancelled:false};notify(result);return result}
    if(await readFamilyManifest(familyId)===signature){const result={phase:'complete',familyId,total,done:total,failed:0,cached:total,cancelled:false,manifestHit:true};notify(result);return result}

    let cursor=0,done=0,failed=0,cached=0
    notify({phase:'loading',familyId,total,done,failed,cached,cancelled:false})
    const worker=async()=>{
      while(!signal?.aborted){
        const index=cursor++;if(index>=familyItems.length)return
        const item=familyItems[index],key=keyFor(item)
        const alreadyPersisted=persistedKeys.has(key)
        const url=await request(item,{priority:'background'})
        let durable=Boolean(url)&&(persistedKeys.has(key)||await writePersistent(key,url))
        if(durable){if(alreadyPersisted)cached+=1}else failed+=1
        done+=1
        notify({phase:'loading',familyId,total,done,failed,cached,cancelled:false})
      }
    }
    await Promise.all(Array.from({length:Math.max(1,Math.min(FAMILY_WORKERS,Number(workers)||FAMILY_WORKERS))},worker))
    const cancelled=Boolean(signal?.aborted)
    const complete=!cancelled&&done===total&&failed===0
    if(complete)await writeFamilyManifest(familyId,signature)
    const result={phase:cancelled?'cancelled':complete?'complete':'partial',familyId,total,done,failed,cached,cancelled}
    notify(result);return result
  }

  return Object.freeze({
    version:PARTS_LIBRARY_PREVIEW_VERSION,
    peek(item){const key=keyFor(item);return key?cache.get(key)??null:null},
    request,
    preloadFamily,
    status(){return Object.freeze({cached:cache.size,persistedKnown:persistedKeys.size,pending:pending.size,queued:queue.length,active,rendererReady:Boolean(renderer),rendererUnavailable,persistentAvailable:!persistentUnavailable&&typeof globalThis.caches?.open==='function',persistentHits,persistentWrites,persistentWriteFailures})},
    clear(){cache.clear();failures.clear()},
    async clearPersistent(){persistedKeys.clear();persistentCachePromise=null;return typeof globalThis.caches?.delete==='function'?globalThis.caches.delete(PERSISTENT_CACHE):false},
  })
}
