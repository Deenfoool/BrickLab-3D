import * as THREE from 'three'

export const SCENE_MOTION_ADAPTER_VERSION='mechanics-scene-motion-adapter-0.1.0'

function cloneWorldMatrix(object){
  object?.updateWorldMatrix?.(true,false)
  if(!object?.matrixWorld?.clone)throw new TypeError('Object lacks matrixWorld')
  return object.matrixWorld.clone()
}

function worldToLocalMatrix(object,worldMatrix){
  if(!object?.parent)return worldMatrix.clone()
  object.parent.updateWorldMatrix?.(true,false)
  return object.parent.matrixWorld.clone().invert().multiply(worldMatrix)
}

function applyWorldMatrix(object,worldMatrix){
  const local=worldToLocalMatrix(object,worldMatrix)
  local.decompose(object.position,object.quaternion,object.scale)
  object.updateMatrix?.()
  object.updateMatrixWorld?.(true)
}

function rotationAroundWorldPivot(axis,pivot,radians){
  const a=new THREE.Vector3(...axis).normalize()
  const p=new THREE.Vector3(...pivot)
  const rotation=new THREE.Matrix4().makeRotationAxis(a,radians)
  return new THREE.Matrix4().makeTranslation(p.x,p.y,p.z)
    .multiply(rotation)
    .multiply(new THREE.Matrix4().makeTranslation(-p.x,-p.y,-p.z))
}

function transformPoint(matrix,value){
  return new THREE.Vector3(...value).applyMatrix4(matrix).toArray()
}

function transformDirection(matrix,value){
  const v=new THREE.Vector3(...value)
  const e=matrix.elements
  const x=v.x,y=v.y,z=v.z
  v.set(
    e[0]*x+e[4]*y+e[8]*z,
    e[1]*x+e[5]*y+e[9]*z,
    e[2]*x+e[6]*y+e[10]*z,
  ).normalize()
  return v.toArray()
}

export function captureMotionBaseline(records=[]){
  const byInstance=new Map()
  const byBody=new Map()

  for(const record of records){
    const object=record?.object
    const instanceId=record?.instance?.body?.instanceId
    const bodyId=record?.instance?.body?.id
    if(!object||!instanceId||!bodyId)continue
    const entry=Object.freeze({
      object,
      instanceId:String(instanceId),
      bodyId:String(bodyId),
      worldMatrix:cloneWorldMatrix(object),
      parent:object.parent??null,
    })
    byInstance.set(String(instanceId),entry)
    byBody.set(String(bodyId),entry)
  }

  return Object.freeze({
    version:SCENE_MOTION_ADAPTER_VERSION,
    byInstance,
    byBody,
    count:byInstance.size,
  })
}

function motionMatrix(motion){
  return rotationAroundWorldPivot(motion.axis,motion.pivot,motion.thetaRad)
}

function translationWorld(axis,distanceStud){
  const a=new THREE.Vector3(...axis).normalize().multiplyScalar(Number(distanceStud)||0)
  return new THREE.Matrix4().makeTranslation(a.x,a.y,a.z)
}

function compoundMotionMatrix(motion){
  const orbit=rotationAroundWorldPivot(
    motion.orbit.axis,
    motion.orbit.pivot,
    motion.orbit.thetaRad,
  )

  const spunPivot=transformPoint(orbit,motion.spin.pivot)
  const spunAxis=transformDirection(orbit,motion.spin.axis)
  const spin=rotationAroundWorldPivot(
    spunAxis,
    spunPivot,
    motion.spin.thetaRad * (Number(motion.spin.directionSign)<0?-1:1),
  )
  return spin.multiply(orbit)
}

function hierarchyDepth(object){
  let depth=0,node=object?.parent
  while(node){depth+=1;node=node.parent}
  return depth
}

export function applyMotionPlanToBaseline(plan,baseline,{
  updateParents=true,
}={}){
  if(!baseline?.byInstance)throw new TypeError('Motion baseline is required')
  if(!plan?.motions)return Object.freeze({applied:0,missing:Object.freeze([]),invalid:Object.freeze([])})

  const missing=[]
  const invalid=[]
  let applied=0

  if(updateParents){
    const parents=new Set([...baseline.byInstance.values()].map(entry=>entry.parent).filter(Boolean))
    for(const parent of parents)parent.updateWorldMatrix?.(true,false)
  }

  const ordered=plan.motions
    .map(motion=>({
      motion,
      entry:baseline.byInstance.get(String(motion.instanceId))
        ??baseline.byBody.get(String(motion.bodyId)),
    }))
    .sort((a,b)=>hierarchyDepth(a.entry?.object)-hierarchyDepth(b.entry?.object))

  for(const {motion,entry} of ordered){
    if(!entry){
      missing.push(Object.freeze({bodyId:motion.bodyId,instanceId:motion.instanceId}))
      continue
    }

    if(motion.kind==='rotation'&&!Number.isFinite(Number(motion.thetaRad))){
      invalid.push(Object.freeze({bodyId:motion.bodyId,reason:'theta-not-finite'}))
      continue
    }
    if(motion.kind==='translation'&&!Number.isFinite(Number(motion.distanceStud))){
      invalid.push(Object.freeze({bodyId:motion.bodyId,reason:'distance-not-finite'}))
      continue
    }

    let delta
    if(motion.kind==='rotation')delta=motionMatrix(motion)
    else if(motion.kind==='compound-rotation')delta=compoundMotionMatrix(motion)
    else if(motion.kind==='translation')delta=translationWorld(motion.axis,motion.distanceStud)
    else{
      invalid.push(Object.freeze({bodyId:motion.bodyId,reason:`unsupported-motion:${motion.kind}`}))
      continue
    }

    const world=delta.multiply(entry.worldMatrix.clone())
    applyWorldMatrix(entry.object,world)
    applied+=1
  }

  return Object.freeze({
    applied,
    missing:Object.freeze(missing),
    invalid:Object.freeze(invalid),
  })
}

export function restoreMotionBaseline(baseline){
  if(!baseline?.byInstance)return 0
  let restored=0
  const entries=[...baseline.byInstance.values()]
    .sort((a,b)=>hierarchyDepth(a.object)-hierarchyDepth(b.object))
  for(const entry of entries){
    applyWorldMatrix(entry.object,entry.worldMatrix)
    restored+=1
  }
  return restored
}
