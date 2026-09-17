import * as THREE from 'three'

export const MECHANICAL_ROTATION_PIVOT_VERSION='mechanical-rotation-pivot-v1.0.0'

const subsystems=globalThis.BrickLabSubsystems
const viewport=document.querySelector('#viewport')
const canvas=viewport?.querySelector('canvas')
let drag=null
let queued=false

function buildRotateActive(){
  return subsystems?.editor?.mode?.()==='build' && document.querySelector('#rotateTool')?.classList.contains('active')===true
}

function ldrawPivotLocal(object){
  const visual=object?.children?.find?.(child=>child?.userData?.ldrawVisual)
  return visual?.position?.clone?.()??null
}

function pivotWorld(object,pivotLocal){
  object?.updateWorldMatrix?.(true,false)
  return pivotLocal?.clone?.().applyMatrix4(object.matrixWorld)??null
}

function correct(){
  queued=false
  if(!drag?.object||!drag.pivotLocal||!drag.pivotWorld)return
  const object=drag.object
  if(!object.parent)return
  // Do nothing unless TransformControls actually changed orientation. Pointer motion
  // outside the gizmo must remain a no-op.
  if(object.quaternion.angleTo(drag.lastQuaternion)<1e-10)return
  object.updateWorldMatrix?.(true,false)
  const current=pivotWorld(object,drag.pivotLocal)
  if(!current)return
  const delta=drag.pivotWorld.clone().sub(current)
  if(delta.lengthSq()>1e-16){
    const worldPosition=new THREE.Vector3()
    object.getWorldPosition(worldPosition)
    worldPosition.add(delta)
    object.parent.updateWorldMatrix?.(true,false)
    object.position.copy(object.parent.worldToLocal(worldPosition))
    object.updateMatrixWorld?.(true)
  }
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
  const pivotLocal=ldrawPivotLocal(object)
  if(!object||!pivotLocal)return
  const world=pivotWorld(object,pivotLocal)
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
  pivotLocal(object){return ldrawPivotLocal(object)?.toArray?.()??null},
  pivotWorld(object){const local=ldrawPivotLocal(object);return local?pivotWorld(object,local)?.toArray?.()??null:null},
})

globalThis.dispatchEvent?.(new CustomEvent('bricklab:mechanicalrotationpivotready',{detail:{version:MECHANICAL_ROTATION_PIVOT_VERSION}}))
