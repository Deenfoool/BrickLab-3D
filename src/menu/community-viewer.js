import * as THREE from 'three'
import {OrbitControls} from 'three/addons/controls/OrbitControls.js'
import {partMesh,parts,loadPartModel} from '../editor/parts.js?v=system-complete'
import {loadParts} from '../editor/model.js?v=track-builder'

export async function mountModelViewer(host,document,{signal,onProgress=()=>{}}){
 signal.throwIfAborted()
 const models=new Map(),solids=new THREE.Group()
 let renderer,controls,resizeObserver,disposed=false
 const world=new THREE.Scene()
 world.add(solids,new THREE.HemisphereLight(0xe3efff,0x4c5260,2.15))
 for(const [color,intensity,position] of [[0xffe5ca,2.6,[1,2.7,1.6]],[0xaacbff,1.8,[-2,1.3,-1.5]]]){
  const light=new THREE.DirectionalLight(color,intensity);light.position.fromArray(position);world.add(light)
 }
 const camera=new THREE.PerspectiveCamera(42,1,.01,10000000)
 const draw=()=>{if(!disposed&&renderer)renderer.render(world,camera)}
 const dispose=()=>{
  if(disposed)return;disposed=true
  signal.removeEventListener('abort',dispose)
  resizeObserver?.disconnect();window.removeEventListener('resize',resize)
  controls?.removeEventListener('change',draw);controls?.dispose()
  for(const object of solids.children)object.userData.finish?.dispose()
  solids.clear()
  for(const [design,model] of models)if(parts[design]?.pack)for(const geometry of model.meshes)geometry.dispose()
  models.clear()
  if(renderer){renderer.domElement.remove();renderer.dispose();renderer.forceContextLoss()}
 }
 function resize(){
  if(!renderer||disposed)return
  const w=Math.max(1,host.clientWidth),h=Math.max(1,host.clientHeight)
  renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();draw()
 }
 signal.addEventListener('abort',dispose,{once:true})
 try{
  const designs=[...new Set(document.parts.map(p=>p.design))].filter(d=>Object.hasOwn(parts,d))
  for(let start=0;start<designs.length;start+=4){
   signal.throwIfAborted()
   await Promise.allSettled(designs.slice(start,start+4).map(async design=>{
    const model=await loadPartModel(parts[design])
    if(!model)return
    if(disposed||signal.aborted){if(parts[design].pack)for(const geometry of model.meshes)geometry.dispose();return}
    models.set(design,model)
   }))
   signal.throwIfAborted();onProgress(Math.min(start+4,designs.length),designs.length)
  }
  const poses=loadParts(document,models)
  if(!poses.length)throw Error('No renderable parts')
  for(const p of poses){
   const mesh=partMesh(models.get(p.design),p.color??parts[p.design].color)
   mesh.position.fromArray(p.position);mesh.quaternion.fromArray(p.rotation);mesh.scale.x=p.mirrored?-1:1;solids.add(mesh)
  }
  const bounds=new THREE.Box3().setFromObject(solids),sphere=bounds.getBoundingSphere(new THREE.Sphere())
  if(bounds.isEmpty()||!Number.isFinite(sphere.radius))throw Error('Invalid model bounds')
  const radius=Math.max(1,sphere.radius),center=sphere.center
  renderer=new THREE.WebGLRenderer({alpha:true,antialias:true})
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5))
  renderer.setClearColor(0,0);host.append(renderer.domElement)
  controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=false;controls.enablePan=true
  controls.minDistance=radius*.12;controls.maxDistance=radius*30
  controls.addEventListener('change',draw)
  function reset(){
   const half=THREE.MathUtils.degToRad(camera.fov/2),horizontal=Math.atan(Math.tan(half)*camera.aspect)
   const distance=radius/Math.sin(Math.min(half,horizontal))*1.18
   camera.near=Math.max(.01,radius*.001);camera.far=Math.max(100,radius*80)
   camera.position.copy(center).addScaledVector(new THREE.Vector3(1.35,.92,1.6).normalize(),distance)
   controls.target.copy(center);camera.updateProjectionMatrix();controls.update();draw()
  }
  resize();reset()
  if(typeof ResizeObserver==='function'){resizeObserver=new ResizeObserver(resize);resizeObserver.observe(host)}
  else window.addEventListener('resize',resize)
  return {dispose,reset,zoom(factor){
   if(disposed)return
   const delta=camera.position.clone().sub(controls.target)
   delta.setLength(THREE.MathUtils.clamp(delta.length()*factor,controls.minDistance,controls.maxDistance))
   camera.position.copy(controls.target).add(delta);controls.update();draw()
  },shown:poses.length,total:document.parts.length}
 }catch(e){dispose();throw e}
}
