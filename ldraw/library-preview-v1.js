import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { findPart } from '../parts.js'
import { preloadLDrawPrototype } from './runtime-v3.js?v=ldraw-loading-20260912-v1'

export const PARTS_LIBRARY_PREVIEW_VERSION = 'parts-library-preview-v1.0.0'

const PREVIEW_SIZE = Object.freeze({ width:320, height:220 })
const MAX_CONCURRENT = 2
const MAX_CACHE = 240
const RETRY_AFTER_MS = 30000
const keyFor = item => item?.key || item?.id || (item?.file ? `ldraw-${item.file}` : null)
const materialList = material => Array.isArray(material) ? material : material ? [material] : []

function markPreviewResolution(root) {
  root?.traverse?.(child => {
    for (const material of materialList(child.material)) material?.resolution?.set?.(PREVIEW_SIZE.width, PREVIEW_SIZE.height)
  })
}

function cloneLDrawPreviewModel(model, color = 0xd7263d) {
  const root = model.clone(true)
  const clonedMaterials = new Set()
  root.traverse(child => {
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
  return { object:root, dispose:() => clonedMaterials.forEach(material => material.dispose?.()) }
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

export function createPartsLibraryPreviewService({ findDefinition=findPart, loadLDraw=preloadLDrawPrototype, now=()=>Date.now() } = {}) {
  const cache=new Map(),failures=new Map(),pending=new Map(),queued=new Map(),queue=[]
  let active=0,pumpScheduled=false,renderer=null,scene=null,camera=null,rendererUnavailable=false,order=0

  function remember(key,value) {
    cache.delete(key);cache.set(key,value)
    while(cache.size>MAX_CACHE)cache.delete(cache.keys().next().value)
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
      renderer.render(scene,camera);return renderer.domElement.toDataURL('image/png')
    } finally {scene.remove(wrapper);source.dispose?.()}
  }

  async function sourceFor(item) {
    const definition=findDefinition(item?.key)
    if(item?.file){
      if(definition?.ldraw?.ready&&definition.create)return nativePreviewObject(definition)
      const payload=await loadLDraw(item.file);if(!payload?.model)return null
      return cloneLDrawPreviewModel(payload.model,definition?.defaultColor??0xd7263d)
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
      if(url){failures.delete(task.key);remember(task.key,url)}else failures.set(task.key,now())
      task.resolve(url)
    } catch(error){failures.set(task.key,now());console.debug?.(`[BrickLab Library] Preview failed for ${task.item?.code||task.key}`,error);task.resolve(null)}
    finally{pending.delete(task.key);active-=1;schedulePump(false)}
  }

  function request(item,{priority='normal'}={}) {
    const key=keyFor(item);if(!key)return Promise.resolve(null)
    if(cache.has(key)){const value=cache.get(key);remember(key,value);return Promise.resolve(value)}
    const failedAt=failures.get(key);if(failedAt&&now()-failedAt<RETRY_AFTER_MS)return Promise.resolve(null)
    if(pending.has(key)){
      const task=queued.get(key);if(task&&priority==='high')task.priority=0
      if(priority==='high')schedulePump(true)
      return pending.get(key)
    }
    let resolve;const promise=new Promise(done=>{resolve=done})
    const task={key,item:{...item},priority:priority==='high'?0:1,order:order++,resolve}
    pending.set(key,promise);queued.set(key,task);queue.push(task);schedulePump(priority==='high');return promise
  }

  return Object.freeze({
    version:PARTS_LIBRARY_PREVIEW_VERSION,
    peek(item){const key=keyFor(item);return key?cache.get(key)??null:null},
    request,
    status(){return Object.freeze({cached:cache.size,pending:pending.size,queued:queue.length,active,rendererReady:Boolean(renderer),rendererUnavailable})},
    clear(){cache.clear();failures.clear()},
  })
}
