import * as THREE from 'three'
import { validateConnectedGeometryV4 } from './validity-v4.js'

export const PHYSICS_ADAPTER_VERSION_V4 = 'connector-rapier-adapter-v4.2.1'

// Rapier GenericJoint axesMask means LOCKED axes. Joint-frame X is the connector axis.
const MASK_PRISMATIC_X = 2 | 4 | 8 | 16 | 32
const MASK_CYLINDRICAL_X = 2 | 4 | 16 | 32
const RELEASE_CONFIRM_FRAMES = 2
const MAX_INITIAL_LINEAR_ERROR = 0.04
const MAX_INITIAL_ANGULAR_ERROR = THREE.MathUtils.degToRad(1)

function vec(v) { return {x:v.x,y:v.y,z:v.z} }
function quat(q) { return {x:q.x,y:q.y,z:q.z,w:q.w} }
function clamp(value,min,max) { return Math.max(min,Math.min(max,value)) }

function bodyQuaternion(body) {
  const q=body.rotation()
  return new THREE.Quaternion(q.x,q.y,q.z,q.w)
}

function bodyLocalPoint(member,worldPoint) {
  return worldPoint.clone().applyMatrix4(member.component.bodyWorldInverse)
}

function bodyLocalDirection(member,worldDirection) {
  return worldDirection.clone().applyQuaternion(member.component.bodyWorldRotation.clone().invert()).normalize()
}

function jointWorldQuaternion(axis,reference) {
  const x=axis.clone().normalize()
  let y=reference.clone().projectOnPlane(x)
  if (y.lengthSq()<1e-10) y=Math.abs(x.y)<0.9?new THREE.Vector3(0,1,0):new THREE.Vector3(0,0,1)
  y.projectOnPlane(x).normalize()
  const z=x.clone().cross(y).normalize()
  y=z.clone().cross(x).normalize()
  const m=new THREE.Matrix4().makeBasis(x,y,z)
  return new THREE.Quaternion().setFromRotationMatrix(m).normalize()
}

function bodyLocalFrameQuaternion(member,worldQuaternion) {
  return member.component.bodyWorldRotation.clone().invert().multiply(worldQuaternion).normalize()
}

function ensureFiniteVector(v,label) {
  if (![v.x,v.y,v.z].every(Number.isFinite)) throw new Error(`${label} is non-finite`)
  return v
}

function commonAxis(frameA,frameB) {
  const axis=frameA.axis.clone().add(frameB.axis)
  return axis.lengthSq()>1e-10?axis.normalize():frameA.axis.clone().normalize()
}

function sharedPoint(frameA,frameB) {
  return frameA.position.clone().add(frameB.position).multiplyScalar(0.5)
}

function jointAnchors(rule,frameA,frameB,axisWorld) {
  const center=sharedPoint(frameA,frameB)
  if (rule.kind!=='prismatic' && rule.kind!=='cylindrical') return {worldA:center,worldB:center.clone()}

  // Preserve the existing legal axial insertion offset, but remove any tiny lateral
  // connector residual from the virtual joint anchors. The constraint is therefore
  // exactly satisfied before Rapier's first step and cannot create a correction kick.
  const axial=frameA.position.clone().sub(frameB.position).dot(axisWorld)
  const half=axisWorld.clone().multiplyScalar(axial/2)
  return {worldA:center.clone().add(half),worldB:center.clone().sub(half)}
}

function makeJoint(session,item,runtime) {
  const {entry,rule}=item
  const memberA=session.members.get(entry.objectA.userData.instanceId)
  const memberB=session.members.get(entry.objectB.userData.instanceId)
  if (!memberA || !memberB) throw new Error(`V4 physics member missing for ${item.id}`)
  if (memberA.body===memberB.body) return {internal:true,item,memberA,memberB,joint:null}

  const frameA=runtime.worldFrame(entry.objectA,entry.connectorA)
  const frameB=runtime.worldFrame(entry.objectB,entry.connectorB)
  const axisWorld=ensureFiniteVector(commonAxis(frameA,frameB),'axisWorld')
  const anchors=jointAnchors(rule,frameA,frameB,axisWorld)
  const anchorA=ensureFiniteVector(bodyLocalPoint(memberA,anchors.worldA),'anchorA')
  const anchorB=ensureFiniteVector(bodyLocalPoint(memberB,anchors.worldB),'anchorB')
  const axisA=ensureFiniteVector(bodyLocalDirection(memberA,axisWorld),'axisA')
  const axisB=ensureFiniteVector(bodyLocalDirection(memberB,axisWorld),'axisB')

  // Both local frames are derived from one common world frame. This freezes only the
  // already-certified relative orientation; it does not ask Rapier to repair a small
  // connector-reference mismatch at t=0.
  const worldJointRotation=jointWorldQuaternion(axisWorld,frameA.reference)
  const localFrameA=bodyLocalFrameQuaternion(memberA,worldJointRotation)
  const localFrameB=bodyLocalFrameQuaternion(memberB,worldJointRotation)

  let params=null
  if (rule.kind==='fixed') {
    params=session.RAPIER.JointData.fixed(vec(anchorA),quat(localFrameA),vec(anchorB),quat(localFrameB))
  } else if (rule.kind==='spherical') {
    params=session.RAPIER.JointData.spherical(vec(anchorA),vec(anchorB))
  } else if (rule.kind==='revolute') {
    if (typeof session.RAPIER.JointData.revoluteWithAxes!=='function') throw new Error('Rapier revoluteWithAxes unavailable')
    params=session.RAPIER.JointData.revoluteWithAxes(vec(anchorA),vec(anchorB),vec(axisA),vec(axisB))
  } else if (rule.kind==='prismatic' || rule.kind==='cylindrical') {
    if (typeof session.RAPIER.JointData.generic!=='function') throw new Error('Rapier GenericJoint unavailable')
    const mask=rule.kind==='prismatic'?MASK_PRISMATIC_X:MASK_CYLINDRICAL_X
    params=session.RAPIER.JointData.generic(vec(anchorA),vec(anchorB),vec(axisA),mask)
  }
  if (!params) throw new Error(`Unsupported V4 physics kind ${rule.kind}`)

  const joint=session.world.createImpulseJoint(params,memberA.body,memberB.body,true)
  if (!joint) throw new Error(`Rapier failed to create V4 joint ${item.id}`)

  // GenericJoint's public constructor accepts one local axis for both bodies. Rapier
  // 0.20 exposes full independent local frames after creation; set them before the
  // first world.step so the common world constraint frame is exact on both bodies.
  if (rule.kind==='prismatic' || rule.kind==='cylindrical') {
    if (typeof joint.setLocalFrame1!=='function' || typeof joint.setLocalFrame2!=='function') {
      session.world.removeImpulseJoint(joint,true)
      throw new Error('Rapier independent local-frame API unavailable')
    }
    joint.setLocalFrame1(vec(anchorA),quat(localFrameA))
    joint.setLocalFrame2(vec(anchorB),quat(localFrameB))
  }
  joint.setContactsEnabled?.(false)

  return {
    internal:false,item,memberA,memberB,joint,
    localAxisA:axisA.clone(),
    invalidFrames:0,
    released:false,
    createdAt:session.simulationTime??0,
  }
}

function relativeLinearSpeed(monitor) {
  const av=monitor.memberA.body.linvel(), bv=monitor.memberB.body.linvel()
  const axis=monitor.localAxisA.clone().applyQuaternion(bodyQuaternion(monitor.memberA.body)).normalize()
  return {axis,speed:(bv.x-av.x)*axis.x+(bv.y-av.y)*axis.y+(bv.z-av.z)*axis.z}
}

function applyResistance(monitor) {
  const resistance=monitor.item.rule.resistance
  if (!resistance || monitor.released || monitor.internal) return
  const {axis,speed}=relativeLinearSpeed(monitor)
  if (Math.abs(speed)<1e-5) return
  const magnitude=clamp(-speed*resistance.axialDamping,-resistance.maxAxialForce,resistance.maxAxialForce)
  const force=axis.multiplyScalar(magnitude)
  monitor.memberB.body.addForce(vec(force),true)
  monitor.memberA.body.addForce(vec(force.clone().multiplyScalar(-1)),true)
}

function releaseMonitor(session,monitor,reason) {
  if (monitor.released) return false
  monitor.released=true
  try { if (monitor.joint?.isValid?.()!==false) session.world.removeImpulseJoint(monitor.joint,true) } catch (error) {
    console.warn('[BrickLab Connector V4] Could not remove released Rapier joint.',error)
  }
  const state=session.connectorV4Physics
  state.released+=1
  state.active=Math.max(0,state.active-1)
  state.releaseEvents.push({id:monitor.item.id,connectionIds:[...monitor.item.connectionIds],reason,time:session.simulationTime??0})
  if (state.releaseEvents.length>64) state.releaseEvents.shift()
  window.dispatchEvent(new CustomEvent('bricklab:connectorv4physicsrelease',{detail:{
    adapterVersion:PHYSICS_ADAPTER_VERSION_V4,
    id:monitor.item.id,
    connectionIds:[...monitor.item.connectionIds],
    family:monitor.item.family,
    reason,
  }}))
  return true
}

function validateMonitor(session,monitor,runtime) {
  if (monitor.released || monitor.internal || monitor.item.rule.release!=='axial-profile') return
  const {entry}=monitor.item
  const validity=validateConnectedGeometryV4(entry.objectA,entry.connectorA,entry.objectB,entry.connectorB)
  if (validity.valid) { monitor.invalidFrames=0; return }
  monitor.invalidFrames+=1
  if (monitor.invalidFrames<RELEASE_CONFIRM_FRAMES) return
  releaseMonitor(session,monitor,validity.reason || 'profile-disengaged')
}

function installHooks(session,monitors,runtime) {
  const originalMotor=session.applyMotorTorques?.bind(session)
  session.applyMotorTorques=function connectorV4Forces(dt) {
    originalMotor?.(dt)
    for (const monitor of monitors) applyResistance(monitor)
  }

  const originalSync=session.syncObjects.bind(session)
  session.syncObjects=function connectorV4SyncAndValidate() {
    originalSync()
    for (const monitor of monitors) validateMonitor(session,monitor,runtime)
  }

  const originalDispose=session.dispose.bind(session)
  session.dispose=function connectorV4Dispose() {
    for (const monitor of monitors) monitor.released=true
    return originalDispose()
  }
}

function preflightEntry(item) {
  const {validity}=item.entry
  if (!validity?.valid) return `invalid-live-geometry:${validity?.reason||'unknown'}`
  if (Number.isFinite(validity.lateralErrorStud) && validity.lateralErrorStud>MAX_INITIAL_LINEAR_ERROR) return 'initial-linear-error'
  if (Number.isFinite(validity.twistErrorRad) && validity.twistErrorRad>MAX_INITIAL_ANGULAR_ERROR) return 'initial-angular-error'
  return null
}

export function installConnectorPhysicsV4(session,plan,runtime) {
  if (!session?.world || !session?.RAPIER || !runtime) throw new TypeError('A built PhysicsSession and Connector V4 runtime are required')
  if (!plan?.pass) throw new Error('Connector V4 physics plan contains blockers')

  const preflightFailures=[]
  for (const item of plan.joints) {
    const reason=preflightEntry(item)
    if (reason) preflightFailures.push({id:item.id,reason})
  }
  if (preflightFailures.length) {
    const error=new Error(`Connector V4 physics preflight rejected ${preflightFailures.length} joint(s)`)
    error.failures=preflightFailures
    throw error
  }

  const monitors=[]
  try {
    for (const item of plan.joints) monitors.push(makeJoint(session,item,runtime))
  } catch (error) {
    for (const monitor of monitors) {
      try { if (monitor.joint?.isValid?.()!==false) session.world.removeImpulseJoint(monitor.joint,true) } catch {}
    }
    throw error
  }

  session.connectorV4Physics={
    adapterVersion:PHYSICS_ADAPTER_VERSION_V4,
    policyVersion:plan.version,
    planned:plan.joints.length,
    active:monitors.filter(m=>!m.internal).length,
    internal:monitors.filter(m=>m.internal).length,
    released:0,
    releaseEvents:[],
    families:[...new Set(plan.joints.map(item=>item.family))],
    monitors,
  }
  installHooks(session,monitors,runtime)
  window.dispatchEvent(new CustomEvent('bricklab:connectorv4physicsready',{detail:{
    adapterVersion:PHYSICS_ADAPTER_VERSION_V4,
    joints:session.connectorV4Physics.active,
    internal:session.connectorV4Physics.internal,
    families:[...session.connectorV4Physics.families],
  }}))
  return session.connectorV4Physics
}

export const CONNECTOR_V4_RAPIER_MASKS=Object.freeze({
  prismaticX:MASK_PRISMATIC_X,
  cylindricalX:MASK_CYLINDRICAL_X,
})
