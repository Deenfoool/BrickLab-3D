import * as THREE from 'three'
import {OrbitControls} from 'three/addons/controls/OrbitControls.js'
import {parts,loadPartModel,partMesh} from '../editor/parts.js?v=system-complete'
import {viewerFitDistance} from './community-viewer-math.js'
import {groupPreviewParts,previewPose} from './public-preview.js?v=large-viewer-1'

const MAX_TRIANGLES=8000000,MAX_GEOMETRY_BYTES=128*1024*1024
function triangles(g){return Math.floor((g.index?.count??g.attributes.position.count)/3)}
function bytes(g){return Object.values(g.attributes).reduce((n,a)=>n+(a.array?.byteLength??0),g.index?.array?.byteLength??0)}
// InstancedMesh cannot use negative determinant instance matrices. Bake reflection
// into one shared geometry, correcting triangle winding and retaining material groups.
export function reflectedGeometry(source){
 const g=source.clone().scale(-1,1,1)
 if(!g.index)g.setIndex(Array.from({length:g.attributes.position.count},(_,i)=>i))
 const index=g.index.array
 for(let i=0;i+2<index.length;i+=3){const a=index[i];index[i]=index[i+2];index[i+2]=a}
 g.index.needsUpdate=true;g.computeBoundingBox();g.computeBoundingSphere()
 return g
}
const yieldFrame=()=>new Promise(resolve=>setTimeout(resolve,0))
export async function mountLargeModelViewer(host,doc,{signal,onProgress=()=>{}}){
 signal.throwIfAborted()
 const world=new THREE.Scene(),solids=new THREE.Group(),camera=new THREE.PerspectiveCamera(42,1,.01,10000000)
 world.add(solids,new THREE.HemisphereLight(0xe3efff,0x4c5260,2.15))
 for(const [color,intensity,position] of [[0xffe5ca,2.6,[1,2.7,1.6]],[0xaacbff,1.8,[-2,1.3,-1.5]]]){
  const light=new THREE.DirectionalLight(color,intensity);light.position.fromArray(position);world.add(light)
 }
 const geometries=new Set(),materials=new Set(),instances=new Set()
 const bounds=new THREE.Box3(),estimate=new THREE.Box3()
 const position=new THREE.Vector3(),rotation=new THREE.Quaternion(),unit=new THREE.Vector3(1,1,1),matrix=new THREE.Matrix4(),partBounds=new THREE.Box3()
 let renderer,controls,observer,disposed=false,interacted=false,shown=0,simplified=0,usedTriangles=0,usedBytes=0
 const draw=()=>{if(!disposed&&renderer)renderer.render(world,camera)}
 const dispose=()=>{
  if(disposed)return;disposed=true;signal.removeEventListener('abort',dispose)
  observer?.disconnect();window.removeEventListener('resize',resize)
  controls?.removeEventListener('change',draw);controls?.dispose()
  for(const mesh of instances)mesh.dispose()
  solids.clear();for(const g of geometries)g.dispose();for(const m of materials)m.dispose()
  instances.clear();geometries.clear();materials.clear()
  if(renderer){renderer.domElement.remove();renderer.dispose()}
 }
 function resize(){
  if(!renderer||disposed||!host.clientWidth||!host.clientHeight)return
  renderer.setSize(host.clientWidth,host.clientHeight,false)
  camera.aspect=host.clientWidth/host.clientHeight;camera.updateProjectionMatrix();draw()
 }
 function reset(){
  if(disposed)return
  const box=bounds.isEmpty()?estimate:bounds,sphere=box.getBoundingSphere(new THREE.Sphere()),radius=Math.max(1,sphere.radius)
  const distance=viewerFitDistance(radius,camera.fov,camera.aspect)
  camera.near=Math.max(.01,radius*.001);camera.far=Math.max(100,distance+radius*5)
  camera.position.copy(sphere.center).addScaledVector(new THREE.Vector3(1.35,.92,1.6).normalize(),distance)
  controls.target.copy(sphere.center);camera.updateProjectionMatrix();controls.update();draw()
 }
 signal.addEventListener('abort',dispose,{once:true})
 try{
  for(const [i,p] of doc.parts.entries())estimate.expandByPoint(position.fromArray(previewPose(p,i).position))
  estimate.expandByScalar(50)
  renderer=new THREE.WebGLRenderer({alpha:true,antialias:false,powerPreference:'high-performance'})
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1))
  renderer.setClearColor(0,0);host.append(renderer.domElement)
  controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=false;controls.enableZoom=false;controls.enablePan=false
  controls.addEventListener('change',draw);controls.addEventListener('start',()=>{interacted=true})
  resize();reset()
  if(typeof ResizeObserver==='function'){observer=new ResizeObserver(resize);observer.observe(host)}else window.addEventListener('resize',resize)
  const groups=groupPreviewParts(doc.parts),total=groups.length
  let completed=0,processed=0
  for(const [design,entries] of groups){
   signal.throwIfAborted()
   if(Object.hasOwn(parts,design)){
    let model
    try{model=await loadPartModel(parts[design],{smoothNormals:false})}catch{}
    if(disposed||signal.aborted){if(model&&parts[design].pack)for(const g of model.meshes)g.dispose();signal.throwIfAborted();break}
    if(model){
     const mirrored=entries.some(e=>e.part.mirrored),normal=entries.some(e=>!e.part.mirrored)
     const cost=model.meshes.reduce((n,g)=>n+triangles(g),0)*entries.length
     const memory=model.meshes.reduce((n,g)=>n+bytes(g),0)*(Number(normal)+Number(mirrored))
     const reserve=(doc.parts.length-processed-entries.length)*12
     const proxy=usedTriangles+cost+reserve>MAX_TRIANGLES||usedBytes+memory>MAX_GEOMETRY_BYTES
     let source=model
     if(proxy){
      const size=model.bounds.getSize(new THREE.Vector3()),center=model.bounds.getCenter(new THREE.Vector3())
      const g=new THREE.BoxGeometry(Math.max(.1,size.x),Math.max(.1,size.y),Math.max(.1,size.z)).translate(center.x,center.y,center.z)
      g.computeBoundingBox();source={meshes:[g],bounds:model.bounds.clone()};geometries.add(g)
      if(parts[design].pack)for(const item of model.meshes)item.dispose()
      simplified+=entries.length;usedTriangles+=12*entries.length;usedBytes+=bytes(g)*(Number(normal)+Number(mirrored))
     }else{
      if(parts[design].pack)for(const g of model.meshes)geometries.add(g)
      usedTriangles+=cost;usedBytes+=memory
     }
     const reflected=new Map(),template=partMesh(source,'#ffffff'),finish=template.userData.finish
     materials.add(finish)
     const instanceColor=new THREE.Color()
     function addInstances(geometry,material,list,colored){
      const mesh=new THREE.InstancedMesh(geometry,material,list.length)
      instances.add(mesh)
      for(const [i,{part,index}] of list.entries()){
       const pose=previewPose(part,index,source.bounds.max.y)
       matrix.compose(position.fromArray(pose.position),rotation.fromArray(pose.rotation),unit)
       mesh.setMatrixAt(i,matrix)
       if(colored)mesh.setColorAt(i,instanceColor.set(part.color??parts[design].color))
       partBounds.copy(geometry.boundingBox).applyMatrix4(matrix);bounds.union(partBounds)
      }
      mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true
      mesh.computeBoundingSphere();solids.add(mesh)
     }
     for(const mirror of [false,true]){
      const list=entries.filter(e=>Boolean(e.part.mirrored)===mirror)
      if(!list.length)continue
      for(const child of template.children){
       let geometry=child.geometry
       if(mirror){
        if(!reflected.has(geometry)){const g=reflectedGeometry(geometry);reflected.set(geometry,g);geometries.add(g)}
        geometry=reflected.get(geometry)
       }
       const mats=Array.isArray(child.material)?child.material:[child.material]
       if(mats.every(m=>m===finish)){addInstances(geometry,child.material,list,true);continue}
       if(mats.every(m=>m!==finish)){addInstances(geometry,child.material,list,false);continue}
       // Mixed printed/fixed finishes must not be multiplied by the instance color.
       // Group only these uncommon material combinations by actual part color.
       const buckets=new Map()
       for(const entry of list){const color=entry.part.color??parts[design].color;if(!buckets.has(color))buckets.set(color,[]);buckets.get(color).push(entry)}
       for(const [color,bucket] of buckets){
        const coloredFinish=finish.clone();coloredFinish.color.set(color);materials.add(coloredFinish)
        addInstances(geometry,mats.map(m=>m===finish?coloredFinish:m),bucket,false)
       }
      }
     }
     shown+=entries.length
    }
   }
   processed+=entries.length;completed++
   onProgress(completed,total,{shown,simplified,parts:doc.parts.length})
   if(completed%4===0||completed===total){draw();await yieldFrame()}
  }
  signal.throwIfAborted()
  if(!shown||bounds.isEmpty())throw Error('No renderable parts')
  if(!interacted)reset();else draw()
  return {dispose,reset,zoom(){},shown,total:doc.parts.length,simplified,large:true}
 }catch(e){dispose();throw e}
}
