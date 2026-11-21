import { Quaternion, Vector3 } from 'three'
import { jointBodies, movePose } from './linkage.js'
import { assemblyBounds, gravity, metersPerLdu, physicsStep, physicsWorld, vectorFrom } from './physics-world.js'
import { controlPlusBodies, hubSettings, motorSettings, motorSupply, motorTorque } from './motors.js'

const units = metersPerLdu
const vector = values => new Vector3().fromArray(values)

function springVisuals(joints) {
  const coils = new Map(joints.filter(joint => joint.motion === 'spring').map(joint => [joint.b, joint]))
  return joints.filter(joint => joint.motion === 'slider' && joint.stroke && coils.has(joint.b)).map(joint => {
    const coil = coils.get(joint.b)
    const rod = vector(joint.shaftLine.start)
    const cylinder = vector(joint.socketLine.start)
    const length = rod.distanceTo(cylinder)
    const coilLength = vector(joint.springSeat).sub(vector(coil.socketLine.start))
      .dot(rod.clone().sub(cylinder).normalize())
    return { joint, coil, rod, cylinder, length, coilLength }
  })
}

function addJoint(rapier, world, edge, a, b, spring) {
  const joint = edge.joint
  const at = edge.start.clone().multiplyScalar(units)
  const localA = at.clone().sub(a.origin)
  const localB = at.clone().sub(b.origin)
  const axis = edge.axis.clone().normalize()
  let descriptor
  if (joint.motion === 'ball') descriptor = rapier.JointData.spherical(localA, localB)
  else if (joint.motion === 'slider' && joint.stroke) descriptor = rapier.JointData.prismatic(localA, localB, axis)
  else if (['continuous', 'detented'].includes(joint.motion)) descriptor = rapier.JointData.revolute(localA, localB, axis)
  else return false
  if (a.body.isFixed() && b.body.isFixed()) return true

  // Rapier measures prismatic travel from its first body to its second body.
  const native = world.createImpulseJoint(descriptor, a.body, b.body, true)
  native.setContactsEnabled(false)
  if (joint.motion === 'slider') {
    const initial = vector(joint.shaftLine.start).sub(edge.start).dot(axis)
    native.setLimits((initial - joint.stroke[1]) * units, (initial - joint.stroke[0]) * units)
    if (spring) {
      const mass = Math.max(a.body.mass(), b.body.mass(), .03)
      const travel = (joint.stroke[1] - joint.stroke[0]) * units
      const rest = Math.max(joint.stroke[0], Math.min(joint.stroke[1],
        spring.length + (spring.coil.restLength ?? spring.coilLength) - spring.coilLength))
      const stiffness = mass * gravity / Math.max(.01, travel * .22)
      const damper = world.createImpulseJoint(rapier.JointData.spring(rest * units, stiffness, Math.sqrt(mass * stiffness) * 1.8,
        spring.rod.clone().multiplyScalar(units).sub(a.origin), spring.cylinder.clone().multiplyScalar(units).sub(b.origin)),
      a.body, b.body, true)
      damper.setContactsEnabled(false)
    }
  }
  if (joint.motion === 'detented' && joint.detents?.length > 1) {
    const offsets = joint.detents.map(angle => Math.atan2(Math.sin(joint.roll - angle), Math.cos(joint.roll - angle)))
    native.setLimits(Math.min(0, ...offsets), Math.max(0, ...offsets))
    native.configureMotorPosition(0, 8, 1.2)
  }
  return true
}

function inverseInertia(body, axis) {
  if (body.isFixed()) return 0
  const { m11, m12, m13, m22, m23, m33 } = body.effectiveWorldInvInertia()
  const { x, y, z } = axis
  return m11 * x * x + m22 * y * y + m33 * z * z + 2 * (m12 * x * y + m13 * x * z + m23 * y * z)
}

function driveClutch({ a, b, axis, limit }) {
  const worldAxis = axis.clone().applyQuaternion(a.rotation())
  const inverse = inverseInertia(a, worldAxis) + inverseInertia(b, worldAxis)
  if (inverse <= 0) return
  const relativeSpeed = vectorFrom(a.angvel()).sub(vectorFrom(b.angvel())).dot(worldAxis)
  const maximum = limit * physicsStep
  const impulse = worldAxis.multiplyScalar(Math.max(-maximum, Math.min(maximum, relativeSpeed / inverse)))
  if (!b.isFixed()) b.applyTorqueImpulse(impulse, true)
  if (!a.isFixed()) a.applyTorqueImpulse(impulse.negate(), true)
}

export function createPhysicalAssembly(rapier, parts, joints, models, { pinned = [], gravityEnabled = true } = {}) {
  const world = gravityEnabled ? physicsWorld(rapier) : new rapier.World({ x: 0, y: 0, z: 0 })
  world.timestep = physicsStep
  try {
    return simulateAssembly(rapier, world, parts, joints, models, new Set(pinned), gravityEnabled)
  } catch (error) {
    world.free()
    throw error
  }
}

function simulateAssembly(rapier, world, parts, joints, models, pinned, gravityEnabled) {
  const partById = new Map(parts.map(part => [part.id, part]))
  const springs = springVisuals(joints)
  const springByJoint = new Map(springs.map(spring => [spring.joint, spring]))
  // Each coil follows its cylinder. The native spring acts on the two damper endpoints.
  const graph = jointBodies(partById.keys(), joints.map(joint => joint.motion === 'spring' ? { ...joint, motion: 'fixed' }
    : joint.torqueLimit ? { ...joint, motion: 'continuous' } : joint))
  const groups = [...new Set(graph.byPart.values())]
  const bodies = new Map()
  const components = new Map()
  for (const group of groups) {
    if (components.has(group)) continue
    const queue = [group]
    components.set(group, group)
    for (const node of queue) {
      for (const edge of node.edges) {
        const other = edge.other(node)
        if (components.has(other)) continue
        components.set(other, group)
        queue.push(other)
      }
    }
  }
  const byHandle = new Map()
  const identity = new Quaternion()
  const lowest = assemblyBounds(parts, models, new Vector3(), identity).min.y
  const lift = gravityEnabled && Number.isFinite(lowest) && lowest < 2 ? (2 - lowest) * units : 0
  for (const group of groups) {
    const members = group.ids.map(id => partById.get(id))
    const bounds = assemblyBounds(members, models, new Vector3(), identity)
    if (bounds.isEmpty()) continue
    const origin = bounds.getCenter(new Vector3()).multiplyScalar(units)
    const fixed = members.some(part => pinned.has(part.id))
    const desc = fixed ? rapier.RigidBodyDesc.fixed() :
      rapier.RigidBodyDesc.dynamic().setCcdEnabled(true).setLinearDamping(.12).setAngularDamping(.32)
    const body = world.createRigidBody(desc.setTranslation(origin.x, origin.y + lift, origin.z))
    for (const part of members) {
      const local = models.get(part.design)?.bounds
      if (!local || local.isEmpty()) continue
      const rotation = new Quaternion().fromArray(part.rotation)
      const center = local.getCenter(new Vector3()).applyQuaternion(rotation).add(vector(part.position))
        .multiplyScalar(units).sub(origin)
      const size = local.getSize(new Vector3()).multiplyScalar(units * .48).max(new Vector3(.01, .01, .01))
      world.createCollider(rapier.ColliderDesc.cuboid(size.x, size.y, size.z)
        .setRotation(rotation).setTranslation(center.x, center.y, center.z)
        .setMass(.025).setFriction(.5).setActiveHooks(rapier.ActiveHooks.FILTER_CONTACT_PAIRS), body)
    }
    bodies.set(group, { body, origin })
    byHandle.set(body.handle, components.get(group))
  }

  const clutches = []
  let constraints = 0
  let unsupported = 0
  for (const edge of graph.edges) {
    const a = bodies.get(edge.a)
    const b = bodies.get(edge.b)
    if (a && b && addJoint(rapier, world, edge, a, b, springByJoint.get(edge.joint))) {
      constraints++
      if (edge.joint.torqueLimit) clutches.push({ a: a.body, b: b.body, axis: edge.axis, limit: edge.joint.torqueLimit })
    } else unsupported++
  }
  const hooks = {
    filterContactPair(_, __, a, b) {
      const component = byHandle.get(a)
      return component && component === byHandle.get(b) ? null : rapier.SolverFlags.COMPUTE_IMPULSE
    },
    filterIntersectionPair() { return true },
  }

  const motors = parts.filter(part => controlPlusBodies.has(part.design)).flatMap(part => {
    const joint = joints.find(joint => joint.a === part.id && ['control-plus-l-output', 'pf-l-output'].includes(joint.group))
    if (!joint) return []
    const housing = bodies.get(graph.byPart.get(part.id))
    const output = bodies.get(graph.byPart.get(joint.b))
    if (!housing || !output) return []
    return [{ part, housing, output, axis: vector(joint.shaftLine.axis), angle: 0, hold: 0, speed: 0, stalled: false }]
  })
  let electricParts = parts.map(part => ({ ...part, electric: { ...part.electric } }))

  function driveMotors() {
    for (const motor of motors) {
      const supply = motorSupply(electricParts.find(part => part.id === motor.part.id), electricParts)
      const axis = motor.axis.clone().applyQuaternion(motor.housing.body.rotation())
      const speed = vectorFrom(motor.output.body.angvel()).sub(vectorFrom(motor.housing.body.angvel())).dot(axis)
      motor.angle += speed * physicsStep
      motor.speed = speed
      motor.stalled = supply.powered && Math.abs(supply.power) > 1 && Math.abs(speed) < .01
      const torque = motorTorque(supply, speed, motor.angle, motor.hold)
      // Approximate 2 Ah battery pack, including no-load current and stall current.
      const hub = electricParts.find(part => part.id === supply.hubId)
      if (hub && supply.powered) {
        const amps = Math.abs(supply.power) > 0 ? .05 + .65 * Math.abs(torque) / .18 : .65 * Math.abs(torque) / .18
        hub.electric.battery = Math.max(0, hubSettings(hub).battery - amps * physicsStep / (2 * 3600) * 100)
      }
      const impulse = axis.multiplyScalar(torque * physicsStep)
      if (motor.housing === motor.output) continue
      motor.output.body.applyTorqueImpulse(impulse, true)
      motor.housing.body.applyTorqueImpulse(impulse.negate(), true)
    }
  }

  function poseOf(group) {
    const entry = bodies.get(group)
    if (!entry) return
    const rotation = new Quaternion().copy(entry.body.rotation())
    const translation = vectorFrom(entry.body.translation()).sub(entry.origin.clone().applyQuaternion(rotation)).divideScalar(units)
    return { rotation, translation }
  }

  function preview() {
    const transforms = new Map(groups.map(group => [group, poseOf(group)]))
    const scales = new Map()
    for (const { joint, coil, rod, cylinder, length, coilLength } of springs) {
      const a = transforms.get(graph.byPart.get(joint.a))
      const b = transforms.get(graph.byPart.get(joint.b))
      if (!a || !b) continue
      const distance = rod.clone().applyQuaternion(a.rotation).add(a.translation)
        .distanceTo(cylinder.clone().applyQuaternion(b.rotation).add(b.translation))
      scales.set(coil.a, [1, Math.max(.1, coilLength + distance - length) / (coil.restLength ?? coilLength), 1])
    }
    return parts.flatMap(part => {
      const transform = transforms.get(graph.byPart.get(part.id))
      return transform ? [movePose(part, { ...transform, scale: scales.get(part.id) })] : []
    })
  }

  let elapsed = 0
  return {
    bodies: bodies.size,
    constraints,
    unsupported,
    get motors() { return motors.map(motor => ({ part: motor.part.id, rpm: motor.speed * 30 / Math.PI, stalled: motor.stalled,
      ...motorSupply(electricParts.find(part => part.id === motor.part.id), electricParts) })) },
    controlMotor(id, power, stop) {
      const motor = motors.find(motor => motor.part.id === id)
      if (!motor) return
      if (power === 0) motor.hold = motor.angle
      electricParts = electricParts.map(part => part.id === id
        ? { ...part, electric: { ...motorSettings(part), power, stop } } : part)
    },
    advance(dt, drive) {
      const body = drive && bodies.get(graph.byPart.get(drive.part))?.body
      elapsed += Math.min(.05, Math.max(0, dt))
      for (; elapsed >= physicsStep; elapsed -= physicsStep) {
        driveMotors()
        if (body && !body.isFixed()) body.applyTorqueImpulse(drive.torque.clone().multiplyScalar(physicsStep), true)
        for (const clutch of clutches) driveClutch(clutch)
        world.step(undefined, hooks)
      }
      return preview()
    },
    push(id, direction) {
      const target = bodies.get(graph.byPart.get(id))?.body
      if (!target || !target.isDynamic()) return
      target.applyImpulse(direction.clone().multiplyScalar(target.mass() * 1.6), true)
    },
    dispose() { world.free() },
  }
}
