import * as THREE from 'three'
import { PhysicsSession } from './physics.js'
import { findPart } from './parts.js'
import { PHYSICS_UNITS } from './physical-parts.js'
import {
  VEHICLE_MODEL_VERSION,
  ackermannAngles,
  approachVehicle,
  boundedBrakeTorque,
  classifyWheelAxles,
  clampVehicle,
} from './vehicle-model-v1.js'

export const VEHICLE_SYSTEM_VERSION = 'vehicle-system-v1'
const STUD = PHYSICS_UNITS.studMeters
const EPS = 1e-10
const DEFAULT_MAX_STEER_DEG = 34
const DEFAULT_STEER_RATE = 2.8 // normalized input per second
const DEFAULT_BRAKE_GRIP = 1.15
const DEFAULT_STEER_STIFFNESS = 8.5
const DEFAULT_STEER_DAMPING = 1.35
const VISUAL_PIVOT = new THREE.Vector3(0, 1.15, 0)
const VISUAL_UP = new THREE.Vector3(0, 1, 0)

function bodyRotation(body) {
  const q = body.rotation()
  return new THREE.Quaternion(q.x, q.y, q.z, q.w)
}

function bodyAngular(body) {
  const v = body.angvel()
  return new THREE.Vector3(v.x, v.y, v.z)
}

function bodyPosition(body) {
  const v = body.translation()
  return new THREE.Vector3(v.x, v.y, v.z)
}

function vec(v) { return { x: v.x, y: v.y, z: v.z } }

function wheelCenter(wheel) {
  if (!wheel?.member) return null
  const local=wheel.centerLocalMeters?.clone?.()
    ?? new THREE.Vector3(0,1.15,0)
      .applyMatrix4(wheel.member.relativeMatrix)
      .multiplyScalar(STUD)
  return local
    .applyQuaternion(bodyRotation(wheel.body))
    .add(bodyPosition(wheel.body))
}

function wheelPositionInChassis(session, wheel) {
  const center = wheelCenter(wheel)
  const chassis = session.chassisMonitor?.body
  if (!center || !chassis) return null
  return center.sub(bodyPosition(chassis))
    .applyQuaternion(bodyRotation(chassis).invert())
}

function inverseInertiaQuadratic(body, worldVector) {
  if (!body?.isDynamic?.() || worldVector.lengthSq() < EPS) return 0
  const principalFrame = body.principalInertiaLocalFrame?.()
  const inverse = body.invPrincipalInertia?.()
  if (!principalFrame || !inverse) return 0
  const frame = bodyRotation(body).multiply(new THREE.Quaternion(
    principalFrame.x, principalFrame.y, principalFrame.z, principalFrame.w,
  ))
  const local = worldVector.clone().applyQuaternion(frame.invert())
  return Math.max(0, local.x * local.x * inverse.x + local.y * local.y * inverse.y + local.z * local.z * inverse.z)
}

function worldAxisFromLocal(body, localAxis) {
  return localAxis.clone().applyQuaternion(bodyRotation(body)).normalize()
}

function steeredLocalAxis(session, wheel) {
  const base = wheel.vehicleBaseLocalAxis ?? wheel.localAxis
  // A real steering knuckle already rotates the wheel rigid body in Rapier.
  // Applying the virtual yaw again would double the steering angle.
  if (wheel.physicalSteeringV1) return base.clone()

  const angle = Number(wheel.steerAngle) || 0
  if (Math.abs(angle) < 1e-8 || !session.chassisMonitor?.body) return base.clone()

  const bodyQ = bodyRotation(wheel.body)
  const worldAxis = base.clone().applyQuaternion(bodyQ).normalize()
  const chassisUp = new THREE.Vector3(0, 1, 0)
    .applyQuaternion(bodyRotation(session.chassisMonitor.body)).normalize()
  worldAxis.applyAxisAngle(chassisUp, angle).normalize()
  return worldAxis.applyQuaternion(bodyQ.clone().invert()).normalize()
}

function captureWheelVisual(wheel) {
  if (!wheel.object || wheel.vehicleVisualBase) return
  wheel.vehicleVisualBase = wheel.object.children.map(child => ({
    child,
    position: child.position.clone(),
    quaternion: child.quaternion.clone(),
  }))
}

function applyWheelVisual(wheel, angle) {
  if (wheel.physicalSteeringV1) {
    resetWheelVisual(wheel)
    return
  }
  captureWheelVisual(wheel)
  if (!wheel.vehicleVisualBase) return
  const steerQ = new THREE.Quaternion().setFromAxisAngle(VISUAL_UP, angle)
  for (const entry of wheel.vehicleVisualBase) {
    const offset = entry.position.clone().sub(VISUAL_PIVOT).applyQuaternion(steerQ)
    entry.child.position.copy(VISUAL_PIVOT).add(offset)
    entry.child.quaternion.copy(steerQ).multiply(entry.quaternion)
  }
}

function resetWheelVisual(wheel) {
  if (!wheel.vehicleVisualBase) return
  for (const entry of wheel.vehicleVisualBase) {
    entry.child.position.copy(entry.position)
    entry.child.quaternion.copy(entry.quaternion)
  }
}

function steeringKnuckleRecord(record) {
  if (record?.connection?.kind !== 'hinge') return null
  for (const side of ['a', 'b']) {
    const member = side === 'a' ? record.memberA : record.memberB
    const endpoint = record.connection[side]
    const definition = findPart(member?.object?.userData?.partId)
    const steering = definition?.mechanics?.steeringKnuckle
    if (!steering) continue
    const pivotConnectorId = steering.pivotConnectorId ?? 'pivot-pin'
    if (endpoint?.connectorId !== pivotConnectorId) continue
    return { side, member, steering, endpoint }
  }
  return null
}

function wheelForKnuckle(session, knuckleId, steering) {
  const bearingConnectorId = steering.bearingConnectorId ?? 'wheel-bearing'
  for (const connection of session.connections ?? []) {
    if (connection?.kind !== 'bearing') continue
    let otherId = null
    if (connection.a?.instanceId === knuckleId && connection.a.connectorId === bearingConnectorId) otherId = connection.b?.instanceId
    else if (connection.b?.instanceId === knuckleId && connection.b.connectorId === bearingConnectorId) otherId = connection.a?.instanceId
    if (!otherId) continue
    const otherBody = session.members.get(otherId)?.body
    if (!otherBody) continue
    const wheel = (session.wheelMonitors ?? []).find(candidate => candidate.body === otherBody)
    if (wheel) return wheel
  }
  return null
}

function initializePhysicalSteering(session) {
  session.steeringJointsV1 = []
  for (const wheel of session.wheelMonitors ?? []) wheel.physicalSteeringV1 = null

  const chassis = session.chassisMonitor?.body
  if (!chassis) return session.steeringJointsV1
  const chassisUp = new THREE.Vector3(0, 1, 0).applyQuaternion(bodyRotation(chassis)).normalize()

  for (const record of session.revoluteJoints ?? []) {
    const info = steeringKnuckleRecord(record)
    if (!info || !record.joint) continue
    const knuckleId = info.member.object.userData.instanceId
    const wheel = wheelForKnuckle(session, knuckleId, info.steering)
    if (!wheel) continue

    const maxSteerRadians = THREE.MathUtils.degToRad(info.steering.maxSteerDeg ?? DEFAULT_MAX_STEER_DEG)
    const stiffness = info.steering.stiffness ?? DEFAULT_STEER_STIFFNESS
    const damping = info.steering.damping ?? DEFAULT_STEER_DAMPING
    const axisWorld = worldAxisFromLocal(record.memberA.body, record.axisA)
    const axisSign = Math.sign(axisWorld.dot(chassisUp)) || 1

    record.joint.configureMotorModel?.(session.RAPIER.MotorModel?.ForceBased ?? 1)
    record.joint.setLimits?.(-maxSteerRadians, maxSteerRadians)
    record.joint.configureMotorPosition?.(0, stiffness, damping)

    const steeringJoint = {
      id: knuckleId,
      joint: record.joint,
      connection: record.connection,
      wheel,
      knuckle: info.member.object,
      maxSteerRadians,
      stiffness,
      damping,
      axisSign,
      targetAngle: 0,
    }
    wheel.physicalSteeringV1 = steeringJoint
    session.steeringJointsV1.push(steeringJoint)
  }

  return session.steeringJointsV1
}

function applyPhysicalSteeringTargets(session) {
  for (const steering of session.steeringJointsV1 ?? []) {
    if(['rack-linkage','rack-pinion'].includes(steering.driveMode))continue
    const requested = steering.wheel?.axleRole === 'front' ? (steering.wheel.steerAngle ?? 0) : 0
    const limited = clampVehicle(requested, -steering.maxSteerRadians, steering.maxSteerRadians)
    steering.targetAngle = limited
    steering.joint.configureMotorPosition?.(
      limited * steering.axisSign,
      steering.stiffness,
      steering.damping,
    )
  }
}

function applyMechanicsNextRackTargets(session) {
  const input=Number(session.vehicleControlV1?.steeringInput)||0
  for(const rack of session.steeringRacksV1??[]){
    if(rack.driveMode==='rack-pinion')continue
    const targetStud=clampVehicle(input,-1,1)*rack.maxTravelStud
    rack.targetTravelStud=targetStud
    rack.joint.configureMotorPosition?.(
      targetStud*STUD*rack.coordinateSign,
      rack.stiffness,
      rack.damping,
    )
  }
}

function applyWheelBrakes(session, dt) {
  const control = session.vehicleControlV1
  if (!control?.enabled) return
  const service = clampVehicle(control.brakeInput, 0, 1)
  const parking = control.parkingBrake ? 1 : 0

  for (const wheel of session.wheelMonitors ?? []) {
    wheel.brakeTorqueNm = 0
    wheel.brakeInput = 0
  }
  if (service <= 0 && parking <= 0) return

  const rearBoost = 1.25
  for (const wheel of session.wheelMonitors ?? []) {
    if (!wheel.vehicleBaseLocalAxis) continue
    const input = Math.max(service, wheel.axleRole === 'rear' ? parking : 0)
    if (input <= 0) continue

    const axis = worldAxisFromLocal(wheel.body, wheel.vehicleBaseLocalAxis)
    const omega = bodyAngular(wheel.body).dot(axis)
    const invI = inverseInertiaQuadratic(wheel.body, axis)
    const load = Math.max(0, Number(wheel.normalLoadN) || 0)
    const axleFactor = wheel.axleRole === 'rear' ? rearBoost : 1
    const maxTorque = Math.max(0.00002, load * Math.max(wheel.radius || 0, STUD) * DEFAULT_BRAKE_GRIP * axleFactor)
    const torque = boundedBrakeTorque({ omega, input, maxTorque, inverseInertia: invI, dt })
    wheel.brakeTorqueNm = torque
    wheel.brakeInput = input
    if (Math.abs(torque) > EPS) wheel.body.addTorque?.(vec(axis.multiplyScalar(torque)), true)
  }
}

PhysicsSession.prototype.initializeVehicleSystemV1 = function initializeVehicleSystemV1() {
  const wheelEntries = []
  for (const wheel of this.wheelMonitors ?? []) {
    const p = wheelPositionInChassis(this, wheel)
    if (!p) continue
    wheel.vehicleBaseLocalAxis = wheel.localAxis.clone()
    captureWheelVisual(wheel)
    wheelEntries.push({ id: wheel.id, x: p.x, z: p.z, wheel })
  }

  const layout = classifyWheelAxles(wheelEntries)
  const byId = new Map(layout.wheels.map(item => [item.id, item]))
  for (const wheel of this.wheelMonitors ?? []) {
    const item = byId.get(wheel.id)
    wheel.side = item?.side ?? 'right'
    wheel.axleRole = item?.axle ?? 'middle'
    wheel.steerAngle = 0
    wheel.brakeInput = 0
    wheel.brakeTorqueNm = 0
  }

  this.vehicleControlV1 = {
    enabled: Boolean(this.chassisMonitor && layout.wheels.length >= 2),
    steeringInput: 0,
    steeringTarget: 0,
    brakeInput: 0,
    parkingBrake: false,
    maxSteerRadians: THREE.MathUtils.degToRad(DEFAULT_MAX_STEER_DEG),
    steerRate: DEFAULT_STEER_RATE,
    wheelbaseM: Math.max(layout.wheelbase, this.chassisMonitor?.wheelbaseM ?? 0),
    trackM: Math.max(layout.track, this.chassisMonitor?.trackM ?? 0),
    frontWheelCount: layout.wheels.filter(w => w.axle === 'front').length,
    rearWheelCount: layout.wheels.filter(w => w.axle === 'rear').length,
    leftAngle: 0,
    rightAngle: 0,
    centerAngle: 0,
    turnRadiusM: Infinity,
    steeringMode: 'virtual',
  }

  const physical = initializePhysicalSteering(this)
  const physicalFront = physical.filter(item => item.wheel?.axleRole === 'front')
  if (physicalFront.length) {
    this.vehicleControlV1.maxSteerRadians = Math.min(
      this.vehicleControlV1.maxSteerRadians,
      ...physicalFront.map(item => item.maxSteerRadians),
    )
    const frontCount = Math.max(1, this.vehicleControlV1.frontWheelCount)
    this.vehicleControlV1.steeringMode = physicalFront.length >= frontCount ? 'physical' : 'mixed'
  }

  return this.vehicleControlV1
}

PhysicsSession.prototype.updateVehicleControlsV1 = function updateVehicleControlsV1(dt) {
  const control = this.vehicleControlV1
  if (!control?.enabled) return
  control.steeringInput = approachVehicle(
    control.steeringInput,
    clampVehicle(control.steeringTarget, -1, 1),
    control.steerRate * Math.max(0, dt),
  )

  const steering = ackermannAngles({
    input: control.steeringInput,
    wheelbase: Math.max(control.wheelbaseM, STUD),
    track: Math.max(control.trackM, STUD),
    maxSteerRadians: control.maxSteerRadians,
  })
  control.leftAngle = steering.left
  control.rightAngle = steering.right
  control.centerAngle = steering.center
  control.turnRadiusM = steering.radius

  for (const wheel of this.wheelMonitors ?? []) {
    wheel.steerAngle = wheel.axleRole === 'front'
      ? (wheel.side === 'left' ? steering.left : steering.right)
      : 0
  }
  applyPhysicalSteeringTargets(this)
  applyMechanicsNextRackTargets(this)
}
PhysicsSession.prototype.updateVehicleControlsV1.__bricklabOwner = `${VEHICLE_SYSTEM_VERSION}:native-controls`

PhysicsSession.prototype.updateVehicleVisualsV1 = function updateVehicleVisualsV1() {
  for (const wheel of this.wheelMonitors ?? []) applyWheelVisual(wheel, wheel.steerAngle ?? 0)
}

PhysicsSession.prototype.resetVehicleVisualsV1 = function resetVehicleVisualsV1() {
  for (const wheel of this.wheelMonitors ?? []) resetWheelVisual(wheel)
}

const previousBuildChassisMonitor = PhysicsSession.prototype.buildChassisMonitor
PhysicsSession.prototype.buildChassisMonitor = function buildChassisWithVehicleSystem(...args) {
  const result = previousBuildChassisMonitor.apply(this, args)
  this.initializeVehicleSystemV1()
  return result
}
PhysicsSession.prototype.buildChassisMonitor.__bricklabOwner = VEHICLE_SYSTEM_VERSION

const previousTireForces = PhysicsSession.prototype.applyTireForcesV2
PhysicsSession.prototype.applyTireForcesV2 = function applyVehicleAwareTireForces(dt) {
  const saved = []
  for (const wheel of this.wheelMonitors ?? []) {
    if (!wheel.vehicleBaseLocalAxis) wheel.vehicleBaseLocalAxis = wheel.localAxis.clone()
    saved.push([wheel, wheel.localAxis])
    wheel.localAxis = steeredLocalAxis(this, wheel)
  }

  try {
    return previousTireForces.call(this, dt)
  } finally {
    for (const [wheel, original] of saved) wheel.localAxis = original
    applyWheelBrakes(this, dt)
  }
}
PhysicsSession.prototype.applyTireForcesV2.__bricklabOwner = `${VEHICLE_SYSTEM_VERSION}:tire-wrapper`

function currentSession() { return globalThis.__bricklabPhysicsSession ?? null }
function controlState() { return currentSession()?.vehicleControlV1 ?? null }

function setSteering(value) {
  const control = controlState()
  if (!control) return false
  control.steeringTarget = clampVehicle(value, -1, 1)
  return true
}

function setBrake(value) {
  const control = controlState()
  if (!control) return false
  control.brakeInput = clampVehicle(value, 0, 1)
  return true
}

function setParkingBrake(value) {
  const control = controlState()
  if (!control) return false
  control.parkingBrake = Boolean(value)
  return true
}

function resetVisuals() {
  const session = currentSession()
  session?.resetVehicleVisualsV1?.()
}

function installMechanicsNextSteering(session,bridge={}) {
  const directBindings=Array.isArray(bridge)?bridge:(bridge?.bindings??[])
  const rackBindings=Array.isArray(bridge)?[]:(bridge?.rackBindings??[])
  const totalRequested=directBindings.length+rackBindings.length
  if(!session)return Object.freeze({installed:0,racks:0,skipped:totalRequested})
  const chassis=session.chassisMonitor?.body
  if(!chassis)return Object.freeze({installed:0,racks:0,skipped:totalRequested})

  const chassisUp=new THREE.Vector3(0,1,0).applyQuaternion(bodyRotation(chassis)).normalize()
  const wheelByInstance=new Map(
    (session.wheelMonitors??[])
      .filter(wheel=>wheel?.object?.userData?.instanceId)
      .map(wheel=>[String(wheel.object.userData.instanceId),wheel]),
  )

  session.steeringJointsV1=[]
  session.steeringRacksV1=[]
  for(const wheel of session.wheelMonitors??[])wheel.physicalSteeringV1=null
  let skipped=0

  for(const binding of directBindings){
    const wheel=wheelByInstance.get(String(binding.wheelInstanceId))
    if(!wheel||!binding?.joint||!binding?.member?.body||!binding?.localAxis?.clone){
      skipped+=1
      continue
    }
    const maxSteerRadians=Math.max(
      0,
      Number(binding.maxSteerRadians)||THREE.MathUtils.degToRad(DEFAULT_MAX_STEER_DEG),
    )
    const stiffness=Math.max(0,Number(binding.stiffness)||DEFAULT_STEER_STIFFNESS)
    const damping=Math.max(0,Number(binding.damping)||DEFAULT_STEER_DAMPING)
    const axisWorld=binding.localAxis.clone()
      .applyQuaternion(bodyRotation(binding.member.body))
      .normalize()
    const axisSign=Math.sign(axisWorld.dot(chassisUp))||1

    binding.joint.configureMotorModel?.(session.RAPIER.MotorModel?.ForceBased??1)
    binding.joint.setLimits?.(-maxSteerRadians,maxSteerRadians)
    binding.joint.configureMotorPosition?.(0,stiffness,damping)

    const steeringJoint={
      id:String(binding.knuckleInstanceId),
      joint:binding.joint,
      connection:null,
      wheel,
      knuckle:binding.member.object??null,
      maxSteerRadians,
      stiffness,
      damping,
      axisSign,
      targetAngle:0,
      driveMode:'direct',
      mechanicsNext:true,
      physicsJointId:binding.physicsJointId,
    }
    wheel.physicalSteeringV1=steeringJoint
    session.steeringJointsV1.push(steeringJoint)
  }

  const directByKnuckle=new Map(
    session.steeringJointsV1.map(item=>[String(item.id),item]),
  )
  for(const binding of rackBindings){
    if(!binding?.joint){
      skipped+=1
      continue
    }
    const linkedIds=new Set((binding.linkedKnuckleInstanceIds??[]).map(String))
    const linkedSteering=[...linkedIds].map(id=>directByKnuckle.get(id)).filter(Boolean)
    const frontCount=Math.max(1,session.vehicleControlV1?.frontWheelCount||0)
    const required=Math.min(2,frontCount)
    const fullyLinked=linkedSteering.length>=required
    const driveMode=binding.rackPinionDriven
      ?'rack-pinion'
      :fullyLinked?'rack-servo':'rack-mixed'

    binding.joint.configureMotorModel?.(session.RAPIER.MotorModel?.ForceBased??1)
    const limit=Math.max(.001,Number(binding.maxTravelStud)||1)*STUD
    binding.joint.setLimits?.(-limit,limit)
    if(binding.rackPinionDriven){
      binding.joint.configureMotorPosition?.(0,0,0)
    }else{
      binding.joint.configureMotorPosition?.(
        0,
        Math.max(0,Number(binding.stiffness)||4),
        Math.max(0,Number(binding.damping)||.42),
      )
    }

    for(const steering of linkedSteering){
      steering.driveMode=binding.rackPinionDriven?'rack-pinion':'rack-linkage'
      steering.joint.configureMotorPosition?.(0,0,0)
    }

    session.steeringRacksV1.push({
      id:String(binding.rackInstanceId),
      joint:binding.joint,
      member:binding.member??null,
      physicsJointId:binding.physicsJointId,
      maxTravelStud:Math.max(.001,Number(binding.maxTravelStud)||1),
      stiffness:Math.max(0,Number(binding.stiffness)||4),
      damping:Math.max(0,Number(binding.damping)||.42),
      coordinateSign:Number(binding.coordinateSign)<0?-1:1,
      linkedKnuckleIds:linkedIds,
      fullyLinked,
      rackPinionDriven:Boolean(binding.rackPinionDriven),
      driveMode,
      targetTravelStud:0,
      mechanicsNext:true,
    })
  }

  if(session.vehicleControlV1){
    const physicalFront=session.steeringJointsV1.filter(item=>item.wheel?.axleRole==='front')
    const racks=session.steeringRacksV1
    if(racks.some(item=>item.driveMode==='rack-pinion')){
      session.vehicleControlV1.steeringMode=
        racks.some(item=>item.fullyLinked)?'rack-pinion':'rack-pinion-mixed'
    }else if(racks.some(item=>item.fullyLinked)){
      session.vehicleControlV1.steeringMode='rack'
    }else if(racks.length){
      session.vehicleControlV1.steeringMode='rack-mixed'
    }else{
      const frontCount=Math.max(1,session.vehicleControlV1.frontWheelCount||0)
      session.vehicleControlV1.steeringMode=
        physicalFront.length>=frontCount?'physical':
        physicalFront.length?'mixed':'virtual'
    }
  }

  return Object.freeze({
    installed:session.steeringJointsV1.length,
    racks:session.steeringRacksV1.length,
    skipped,
  })
}

function diagnostics() {
  const session = currentSession()
  const control = session?.vehicleControlV1
  const chassis = session?.chassisMonitor
  const velocity = chassis?.body?.linvel?.()
  return {
    version: VEHICLE_SYSTEM_VERSION,
    model: VEHICLE_MODEL_VERSION,
    enabled: Boolean(control?.enabled),
    steeringMode: control?.steeringMode ?? 'virtual',
    physicalSteeringJoints: session?.steeringJointsV1?.length ?? 0,
    steeringInput: control?.steeringInput ?? 0,
    steeringTarget: control?.steeringTarget ?? 0,
    centerSteerDeg: THREE.MathUtils.radToDeg(control?.centerAngle ?? 0),
    leftSteerDeg: THREE.MathUtils.radToDeg(control?.leftAngle ?? 0),
    rightSteerDeg: THREE.MathUtils.radToDeg(control?.rightAngle ?? 0),
    turnRadiusM: Number.isFinite(control?.turnRadiusM) ? control.turnRadiusM : null,
    brakeInput: control?.brakeInput ?? 0,
    parkingBrake: Boolean(control?.parkingBrake),
    speedMps: velocity ? Math.hypot(velocity.x, velocity.z) : 0,
    accelerationMps2: chassis?.acceleration ?? 0,
    wheelbaseM: control?.wheelbaseM ?? 0,
    trackM: control?.trackM ?? 0,
    massKg: chassis?.totalMassKg ?? session?.vehicleMassKg ?? 0,
    comStud: chassis?.comStud?.toArray?.() ?? null,
    wheels: (session?.wheelMonitors ?? []).map(wheel => ({
      id: wheel.id,
      side: wheel.side,
      axle: wheel.axleRole,
      steering: wheel.physicalSteeringV1 ? 'physical' : 'virtual',
      steerDeg: THREE.MathUtils.radToDeg(wheel.steerAngle ?? 0),
      brakeTorqueNm: wheel.brakeTorqueNm ?? 0,
      contact: Boolean(wheel.contact),
      slipPercent: wheel.slipPercent ?? 0,
    })),
  }
}

globalThis.BrickLabVehicle = {
  version: VEHICLE_SYSTEM_VERSION,
  installMechanicsNextSteering,
  setSteering,
  setBrake,
  setParkingBrake,
  resetVisuals,
  getState: diagnostics,
}
