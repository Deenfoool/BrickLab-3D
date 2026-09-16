import * as THREE from 'three'
import { applyLDrawMechanismPose, flexAxleControlPoints, ldrawMechanismDescriptor } from './mechanism-registry-v1.js'

export const FLEX_AXLE_EDITOR_VERSION='flex-axle-editor-v1.0.0'

const editor=()=>globalThis.BrickLabSubsystems?.editor
const canvas=globalThis.BrickLabViewportV1?.canvas
const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2(),dragPlane=new THREE.Plane()
const worldPoint=new THREE.Vector3(),planeNormal=new THREE.Vector3()
let root=null,handles=null,drag=null,hover=null

function selected(){return editor()?.primarySelection?.()||null}
function isFlex(object){return ldrawMechanismDescriptor(object?.userData?.partId)?.kind==='flex-axle'}
function setPointer(event){
  const rect=canvas.getBoundingClientRect()
  pointer.set(((event.clientX-rect.left)/rect.width)*2-1,-((event.clientY-rect.top)/rect.height)*2+1)
}
function camera(){return globalThis.BrickLabViewportV1?.camera?.()||null}
function material(active=false){return new THREE.MeshBasicMaterial({color:active?0xffffff:0x74e6a6,depthTest:false,transparent:true,opacity:active?1:.92})}
function dispose(){
  if(handles){handles.traverse(node=>{node.geometry?.dispose?.();node.material?.dispose?.()});handles.removeFromParent?.()}
  handles=null;root=null;drag=null;hover=null
  if(canvas)canvas.style.cursor=''
}
function syncPositions(){
  if(!root||!handles)return
  const points=flexAxleControlPoints(root.userData.mechanismPose)
  handles.children.forEach((handle,index)=>handle.position.fromArray(points[index]))
}
function mount(){
  const object=selected()
  if(object===root&&handles){syncPositions();return}
  dispose()
  if(!isFlex(object)||editor()?.mode?.()!=='build')return
  root=object;handles=new THREE.Group();handles.name='bricklab-flex-axle-handles';handles.userData.physicsIgnore=true
  const points=flexAxleControlPoints(root.userData.mechanismPose)
  points.forEach((point,index)=>{
    const handle=new THREE.Mesh(new THREE.SphereGeometry(index===1?.24:.2,20,14),material())
    handle.position.fromArray(point);handle.renderOrder=1000
    handle.userData.flexHandleIndex=index;handle.userData.physicsIgnore=true;handle.userData.instanceRoot=root
    handles.add(handle)
  })
  root.add(handles);root.updateMatrixWorld(true)
}
function hitHandle(event){
  if(!handles||!camera())return null
  setPointer(event);raycaster.setFromCamera(pointer,camera())
  return raycaster.intersectObjects(handles.children,false)[0]?.object||null
}
function repaint(next){
  if(hover===next)return
  if(hover)hover.material.color.setHex(0x74e6a6)
  hover=next
  if(hover)hover.material.color.setHex(0xffffff)
  if(canvas&&!drag)canvas.style.cursor=hover?'grab':''
}
function pointerDown(event){
  if(event.button!==0)return
  const handle=hitHandle(event);if(!handle)return
  event.preventDefault();event.stopImmediatePropagation()
  const activeCamera=camera();handle.getWorldPosition(worldPoint);activeCamera.getWorldDirection(planeNormal)
  dragPlane.setFromNormalAndCoplanarPoint(planeNormal,worldPoint)
  drag={handle,index:handle.userData.flexHandleIndex,pointerId:event.pointerId}
  canvas.setPointerCapture?.(event.pointerId);canvas.style.cursor='grabbing';repaint(handle)
}
function pointerMove(event){
  if(!drag){repaint(hitHandle(event));return}
  event.preventDefault();event.stopImmediatePropagation();setPointer(event)
  raycaster.setFromCamera(pointer,camera())
  if(!raycaster.ray.intersectPlane(dragPlane,worldPoint))return
  const local=root.worldToLocal(worldPoint.clone()),points=flexAxleControlPoints(root.userData.mechanismPose)
  points[drag.index]=[points[drag.index][0],local.y,local.z]
  applyLDrawMechanismPose(root,{...root.userData.mechanismPose,flexPoints:points})
  syncPositions()
}
function finish(event){
  if(!drag)return
  event.preventDefault();event.stopImmediatePropagation()
  canvas.releasePointerCapture?.(drag.pointerId);drag=null;canvas.style.cursor=hover?'grab':''
  document.querySelector('#saveBtn')?.click()
  globalThis.dispatchEvent?.(new CustomEvent('bricklab:editorexternalmutation',{detail:{type:'flex-axle-shape',instanceId:root?.userData?.instanceId}}))
}

if(canvas){
  canvas.addEventListener('pointerdown',pointerDown,true)
  canvas.addEventListener('pointermove',pointerMove,true)
  canvas.addEventListener('pointerup',finish,true)
  canvas.addEventListener('pointercancel',finish,true)
  canvas.addEventListener('pointerleave',event=>{if(!drag)repaint(null)})
}
for(const name of ['bricklab:selectionchange','bricklab:editorselectionchange','bricklab:ldrawloaded'])globalThis.addEventListener?.(name,mount)
globalThis.addEventListener?.('bricklab:flexaxlereset',mount)
mount()

globalThis.BrickLabFlexAxleEditor=Object.freeze({version:FLEX_AXLE_EDITOR_VERSION,refresh:mount})
