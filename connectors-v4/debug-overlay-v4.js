import * as THREE from 'three'

export const CONNECTOR_DEBUG_VERSION_V4='connector-debug-overlay-v4.2.1'
const ROOT_NAME='__bricklabConnectorV4Debug'
const MAX_ENDPOINTS_PER_PART=384
let enabled=false

const familyColor={
  cylinder:0x55d6ff,
  clip:0xffb454,
  fingers:0xb784ff,
  generic:0x70e29a,
  sphere:0xff6fae,
}

function runtime(){return globalThis.BrickLabConnectorV4??null}

function clearObject(object){
  const old=object?.getObjectByName?.(ROOT_NAME)
  if(!old)return
  object.remove(old)
  old.traverse(child=>{
    child.geometry?.dispose?.()
    if(Array.isArray(child.material))child.material.forEach(m=>m?.dispose?.())
    else child.material?.dispose?.()
  })
}

function localAxis(connector){
  const o=connector?.frame?.orientationBrickLab
  if(!Array.isArray(o)||o.length!==9)return new THREE.Vector3(0,-1,0)
  return new THREE.Vector3(-o[1],-o[4],-o[7]).normalize()
}

function endpointVisual(connector){
  const p=connector?.frame?.positionStud
  if(!Array.isArray(p)||p.length!==3)return null
  const group=new THREE.Group()
  group.position.fromArray(p)
  group.userData.connectorV4Debug=true

  const color=familyColor[connector.family]??0xffffff
  const radius=connector.gender==='female'?0.035:0.045
  const dot=new THREE.Mesh(
    new THREE.SphereGeometry(radius,8,6),
    new THREE.MeshBasicMaterial({color,depthTest:false,transparent:true,opacity:0.9}),
  )
  dot.renderOrder=999
  dot.raycast=()=>{}
  group.add(dot)

  const axis=localAxis(connector)
  const length=Math.min(0.45,Math.max(0.16,((connector.geometry?.sections??[]).reduce((n,s)=>n+(Number(s.lengthLdu)||0),0))/20/4))
  const lineGeom=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),axis.clone().multiplyScalar(length)])
  const line=new THREE.Line(lineGeom,new THREE.LineBasicMaterial({color,depthTest:false,transparent:true,opacity:0.9}))
  line.renderOrder=999
  line.raycast=()=>{}
  group.add(line)
  return group
}

function drawObject(object){
  clearObject(object)
  const data=runtime()?.get?.(object?.userData?.partId)
  if(!enabled||data?.status!=='ready')return
  const root=new THREE.Group()
  root.name=ROOT_NAME
  root.userData.connectorV4Debug=true
  root.raycast=()=>{}
  for(const connector of (data.connectors??[]).slice(0,MAX_ENDPOINTS_PER_PART)){
    const visual=endpointVisual(connector)
    if(visual)root.add(visual)
  }
  object.add(root)
}

function refresh(){
  const objects=runtime()?.objects?.()??[]
  for(const object of objects)drawObject(object)
}

function clear(){
  for(const object of runtime()?.objects?.()??[])clearObject(object)
}

function setEnabled(value){
  enabled=Boolean(value)
  if(enabled)refresh();else clear()
  window.dispatchEvent(new CustomEvent('bricklab:connectorv4debug',{detail:{enabled,version:CONNECTOR_DEBUG_VERSION_V4}}))
  return enabled
}

window.addEventListener('keydown',event=>{
  if(event.code!=='F9'||event.ctrlKey||event.metaKey||event.altKey)return
  const target=event.target
  if(target instanceof HTMLElement&&(/INPUT|TEXTAREA|SELECT/.test(target.tagName)||target.isContentEditable))return
  event.preventDefault()
  setEnabled(!enabled)
})
window.addEventListener('bricklab:connectorv4',()=>{if(enabled)queueMicrotask(refresh)})
window.addEventListener('bricklab:connectorv4physicsstarting',()=>setEnabled(false))

export const BrickLabConnectorV4Debug=Object.freeze({
  version:CONNECTOR_DEBUG_VERSION_V4,
  get enabled(){return enabled},
  setEnabled,
  toggle(){return setEnabled(!enabled)},
  refresh,
  clear,
})
globalThis.BrickLabConnectorV4Debug=BrickLabConnectorV4Debug