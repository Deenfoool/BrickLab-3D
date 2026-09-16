import * as THREE from 'three'

export const LDRAW_MECHANISM_REGISTRY_VERSION = 'ldraw-mechanism-registry-v1.2.0'

const FLEX_LENGTH=10.6
const FLEX_CONTROL_X=Object.freeze([-FLEX_LENGTH*.24,0,FLEX_LENGTH*.24])
const FLEX_MAX_OFFSET=FLEX_LENGTH*.48

const freeze = value => Object.freeze(value)

const REGISTRY = freeze({
  '32199': freeze({
    kind:'flex-axle', canonical:'32199', lengthL:11,
    pose:freeze({ bendXDeg:0, bendYDeg:0 }),
    limits:freeze({ bendXDeg:[-95,95], bendYDeg:[-95,95] }),
  }),
  '55709': freeze({ aliasOf:'32199' }),
  '3712c01': freeze({
    kind:'universal-joint', canonical:'3712c01', assemblyFile:'3712c01.dat',
    pose:freeze({ inputDeg:0, outputDeg:0 }),
    limits:freeze({ inputDeg:[-35,35], outputDeg:[-35,35] }),
    components:freeze([
      freeze({ file:'3712.dat', role:'input-yoke', occurrence:0, pivotLdu:[0,0,0], axis:[1,0,0], poseKey:'inputDeg' }),
      freeze({ file:'3712.dat', role:'output-yoke', occurrence:1, pivotLdu:[0,0,0], axis:[0,1,0], poseKey:'outputDeg' }),
      freeze({ file:'3326.dat', role:'cross', occurrence:0 }),
    ]),
  }),
  '9244': freeze({ aliasOf:'3712c01' }),
  '43056c01': freeze({
    kind:'friction-hinge', canonical:'43056c01', assemblyFile:'43056c01.dat',
    pose:freeze({ angleDeg:0 }), limits:freeze({ angleDeg:[-175,175] }),
    components:freeze([
      freeze({ file:'43056.dat', role:'fixed-leaf', occurrence:0 }),
      freeze({ file:'43045.dat', role:'moving-leaf', occurrence:0, pivotLdu:[0,-6,40], axis:[0,1,0], poseKey:'angleDeg' }),
      freeze({ file:'2780.dat', role:'hinge-pin', occurrence:0 }),
    ]),
  }),
  '50923': freeze({ kind:'ball-end', canonical:'50923' }),
  '59141': freeze({ aliasOf:'50923' }),
})

function codeOf(value) {
  return String(value?.ldraw?.code || value?.ldraw?.file || value?.id || value || '')
    .replace(/^ldraw-/i,'').replace(/^parts[\\/]/i,'').replace(/\\/g,'/').split('/').pop()
    ?.replace(/\.dat$/i,'').toLowerCase() || ''
}

export function ldrawMechanismDescriptor(value) {
  const code=codeOf(value), entry=REGISTRY[code]
  if (!entry) return null
  if (!entry.aliasOf) return freeze({ code, ...entry })
  const canonical=REGISTRY[entry.aliasOf]
  return canonical ? freeze({ code, ...canonical, aliasOf:entry.aliasOf }) : null
}

export function defaultLDrawMechanismPose(value) {
  const descriptor=ldrawMechanismDescriptor(value)
  return descriptor?.pose ? { ...descriptor.pose } : null
}

export function normalizeLDrawMechanismPose(value, pose = {}) {
  const descriptor=ldrawMechanismDescriptor(value)
  if (!descriptor?.pose) return null
  const result={}
  for (const [key,fallback] of Object.entries(descriptor.pose)) {
    const range=descriptor.limits?.[key] || [-Infinity,Infinity]
    const number=Number(pose?.[key])
    result[key]=Math.min(range[1],Math.max(range[0],Number.isFinite(number)?number:fallback))
  }
  if(descriptor.kind==='flex-axle'&&Array.isArray(pose?.flexPoints)&&pose.flexPoints.length===3){
    result.flexPoints=pose.flexPoints.map((point,index)=>[
      FLEX_CONTROL_X[index],
      THREE.MathUtils.clamp(Number(point?.[1])||0,-FLEX_MAX_OFFSET,FLEX_MAX_OFFSET),
      THREE.MathUtils.clamp(Number(point?.[2])||0,-FLEX_MAX_OFFSET,FLEX_MAX_OFFSET),
    ])
  }
  return result
}

export function listLDrawMechanismRegistry() {
  return Object.keys(REGISTRY).map(code => ldrawMechanismDescriptor(code))
}

function articulatedNodes(root) {
  const result=[]
  root?.traverse?.(node=>{if(node.userData?.mechanismRole)result.push(node)})
  return result
}

function disposeFlexVisual(root) {
  const previous=root?.getObjectByName?.('bricklab-flex-axle-visual')
  if (!previous) return
  previous.traverse?.(node=>{node.geometry?.dispose?.();node.material?.dispose?.()})
  previous.removeFromParent?.()
}

export function flexAxleControlPoints(pose={}) {
  if(Array.isArray(pose.flexPoints)&&pose.flexPoints.length===3)return pose.flexPoints.map((point,index)=>[
    FLEX_CONTROL_X[index],
    THREE.MathUtils.clamp(Number(point?.[1])||0,-FLEX_MAX_OFFSET,FLEX_MAX_OFFSET),
    THREE.MathUtils.clamp(Number(point?.[2])||0,-FLEX_MAX_OFFSET,FLEX_MAX_OFFSET),
  ])
  const x=Math.tan(THREE.MathUtils.degToRad(pose.bendXDeg || 0))*FLEX_LENGTH*.28
  const y=Math.tan(THREE.MathUtils.degToRad(pose.bendYDeg || 0))*FLEX_LENGTH*.28
  return [[FLEX_CONTROL_X[0],y*.35,x*.35],[0,y,x],[FLEX_CONTROL_X[2],y*.35,x*.35]]
}

function flexCurve(pose) {
  const controls=flexAxleControlPoints(pose)
  return new THREE.CatmullRomCurve3([
    new THREE.Vector3(-FLEX_LENGTH/2,0,0),
    ...controls.map(point=>new THREE.Vector3(...point)),
    new THREE.Vector3(FLEX_LENGTH/2,0,0),
  ],false,'catmullrom',.52)
}

function rebuildFlexVisual(root, pose) {
  disposeFlexVisual(root)
  const visual=new THREE.Group();visual.name='bricklab-flex-axle-visual'
  const color=Number(root.userData?.color ?? 0xd7263d)
  const material=new THREE.MeshStandardMaterial({color,roughness:.62,metalness:0})
  const curve=flexCurve(pose)
  const shaft=new THREE.Mesh(new THREE.TubeGeometry(curve,52,.155,8,false),material)
  shaft.castShadow=true;shaft.receiveShadow=true;visual.add(shaft)
  const tipGeometry=new THREE.CylinderGeometry(.11,.11,.52,12)
  for(const t of [0,1]){
    const tip=new THREE.Mesh(tipGeometry,material.clone())
    const point=curve.getPoint(t), tangent=curve.getTangent(t)
    tip.position.copy(point).addScaledVector(tangent,t===0?-.26:.26)
    tip.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),tangent)
    tip.castShadow=true;visual.add(tip)
  }
  root.add(visual)
  root.traverse(node=>{if(node.userData?.ldrawVisual)node.visible=false})
}

export function applyLDrawMechanismPose(root, requestedPose = null) {
  const descriptor=ldrawMechanismDescriptor(root?.userData?.partId || root?.userData?.ldraw?.code)
  if (!descriptor) return null
  const pose=normalizeLDrawMechanismPose(descriptor.code,requestedPose || root.userData.mechanismPose || descriptor.pose || {})
  if (pose) root.userData.mechanismPose={...pose}
  if (descriptor.kind==='flex-axle' && pose) rebuildFlexVisual(root,pose)
  for(const node of articulatedNodes(root)){
    const key=node.userData.mechanismPoseKey
    const bind=node.userData.mechanismBindQuaternion
    if(bind)node.quaternion.fromArray(bind)
    if(!key||!pose||!Number.isFinite(pose[key]))continue
    const axis=new THREE.Vector3(...(node.userData.mechanismAxis||[0,1,0])).normalize()
    node.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(axis,THREE.MathUtils.degToRad(pose[key])))
  }
  root.updateMatrixWorld?.(true)
  globalThis.dispatchEvent?.(new CustomEvent('bricklab:mechanismposechange',{detail:{instanceId:root.userData?.instanceId,partId:root.userData?.partId,pose:{...pose}}}))
  return pose
}

export const BrickLabLDrawMechanisms = freeze({
  version:LDRAW_MECHANISM_REGISTRY_VERSION,
  descriptor:ldrawMechanismDescriptor,
  defaultPose:defaultLDrawMechanismPose,
  normalizePose:normalizeLDrawMechanismPose,
  list:listLDrawMechanismRegistry,
  applyPose:applyLDrawMechanismPose,
})

globalThis.BrickLabLDrawMechanisms=BrickLabLDrawMechanisms
