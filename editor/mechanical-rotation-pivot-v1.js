import * as THREE from 'three'

export const MECHANICAL_ROTATION_PIVOT_VERSION='mechanical-rotation-pivot-v1.2.0'

const subsystems=globalThis.BrickLabSubsystems
const documentRef=globalThis.document
const viewport=documentRef?.querySelector?.('#viewport')
const canvas=viewport?.querySelector?.('canvas')
let drag=null
let queued=false

function buildRotateActive(){
  return subsystems?.editor?.mode?.()==='build' && documentRef?.querySelector?.('#rotateTool')?.classList.contains('active')===true
}

function rotaryMechanicalPart(object){
  const partId=object?.userData?.partId
  if(!partId)return false
  const mechanics=subsystems?.parts?.get?.(partId)?.mechanics
  if(mechanics?.gear||mechanics?.shaft||mechanics?.wheel)return true
  const connectivity=globalThis.BrickLabConnectorV4?.get?.(partId)
  return Boolean(connectivity?.connectors?.some?.(connector=>
    connector?.family==='cylinder' && (connector.geometry?.sections??[]).some(section=>
      section?.shape==='A' && Math.abs((section.radiusLdu??0)-6)<.1
    )
  ))
}

export function ldrawMechanicalPivotLocalV1(object){
  const visual=object?.children?.find?.(child=>child?.userData?.ldrawVisual)
  return visual?.position?.clone?.()??null
}

export function mechanicalPivotWorldV1(object,pivotLocal=ldrawMechanicalPivotLocalV1(object)){
  object?.updateWorldMatrix?.(true,false)
  return pivotLocal?.clone?.().applyMatrix4(object.matrixWorld)??null
}

export function preserveMechanicalPivotWorldV1(object,pivotLocal,fixedPivotWorld){
  if(!object?.parent||!pivotLocal?.isVector3||!fixedPivotWorld?.isVector3)return false
  object.updateWorldMatrix?.(true,false)
  const current=mechanicalPivotWorldV1(object,pivotLocal)
  if(!current)return false
  const delta=fixedPivotWorld.clone().sub(current)
  if(delta.lengthSq()<=1e-16)return true
  const worldPosition=new THREE.Vector3()
  object.getWorldPosition(worldPosition)
  worldPosition.add(delta)
  object.parent.updateWorldMatrix?.(true,false)
  object.position.copy(object.parent.worldToLocal(worldPosition))
  object.updateMatrixWorld?.(true)
  return true
}

function correct(){
  queued=false
  if(!drag?.object||!drag.pivotLocal||!drag.pivotWorld)return
  const object=drag.object
  if(!object.parent)return
  // Do nothing unless TransformControls actually changed orientation. Pointer motion
  // outside the gizmo must remain a no-op.
  if(object.quaternion.angleTo(drag.lastQuaternion)<1e-10)return
  preserveMechanicalPivotWorldV1(object,drag.pivotLocal,drag.pivotWorld)
  drag.lastQuaternion.copy(object.quaternion)
}

function scheduleCorrection(){
  if(queued)return
  queued=true
  queueMicrotask(correct)
}

function begin(event){
  if(event.button!==0||!buildRotateActive())return
  const object=subsystems?.editor?.primarySelection?.()
  if(!object||!rotaryMechanicalPart(object))return
  const pivotLocal=ldrawMechanicalPivotLocalV1(object)
  if(!pivotLocal)return
  const world=mechanicalPivotWorldV1(object,pivotLocal)
  if(!world)return
  drag={
    pointerId:event.pointerId,
    object,
    pivotLocal,
    pivotWorld:world,
    lastQuaternion:object.quaternion.clone(),
  }
}

function move(event){
  if(!drag||event.pointerId!==drag.pointerId)return
  scheduleCorrection()
}

function finish(event){
  if(!drag||(event?.pointerId!=null&&event.pointerId!==drag.pointerId))return
  scheduleCorrection()
  queueMicrotask(()=>{drag=null})
}

canvas?.addEventListener('pointerdown',begin,true)
canvas?.addEventListener('pointermove',move,true)
canvas?.addEventListener('pointerup',finish,true)
canvas?.addEventListener('pointercancel',finish,true)

globalThis.BrickLabMechanicalRotationPivot=Object.freeze({
  version:MECHANICAL_ROTATION_PIVOT_VERSION,
  eligible:rotaryMechanicalPart,
  pivotLocal(object){return ldrawMechanicalPivotLocalV1(object)?.toArray?.()??null},
  pivotWorld(object){return mechanicalPivotWorldV1(object)?.toArray?.()??null},
})

globalThis.dispatchEvent?.(new CustomEvent('bricklab:mechanicalrotationpivotready',{detail:{version:MECHANICAL_ROTATION_PIVOT_VERSION}}))
