import { Quaternion, Vector3 } from 'three'
import { assemblyBounds, gravity, metersPerLdu, physicsStep, physicsWorld, vectorFrom } from '../mechanics/physics-world.js'
import { rotationPoses } from './model.js?v=drive-physics'
import { findSuspension, suspensionValue } from './suspension.js'
import { advanceRotor, carryPose, wheelContact } from './vehicle-drive.js?v=drive-physics'

const up = new Vector3(0, 1, 0)
const units = metersPerLdu
const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const angleFor = v => Math.atan2(v.x, v.z)

function mountChassis(rapier, world, vehicle, models, wheels, terrain) {
  const sourceHeading = angleFor(vehicle.forward)
  const heading = terrain?.heading ?? sourceHeading
  const start = terrain?.start.clone() ?? vehicle.origin.clone()
  start.y += vehicle.lift + 4
  start.multiplyScalar(units)
  const body = world.createRigidBody(rapier.RigidBodyDesc.dynamic()
    .setTranslation(start.x, start.y, start.z)
    .setRotation(new Quaternion().setFromAxisAngle(up, heading - sourceHeading))
    .setLinearDamping(.12).setAngularDamping(.6).setCcdEnabled(true).setCanSleep(false))

  const movingIds = new Set(wheels.flatMap(({ wheel, suspension }) => {
    const compressed = suspension && suspension.motion.solve(suspension.points.at(-1).angle)
    return [wheel.id, wheel.rim, ...(compressed?.keys() ?? [])]
  }))
  const housing = new Quaternion().setFromAxisAngle(up, sourceHeading)
  const bounds = assemblyBounds(vehicle.parts.filter(part => !movingIds.has(part.id)), models,
    vehicle.origin, housing.clone().invert())
  const lowestAxle = Math.min(...vehicle.initial.map(c => c.position.y - vehicle.origin.y))
  if (bounds.isEmpty()) {
    const positions = vehicle.initial.map(c => c.position.clone().sub(vehicle.origin).applyQuaternion(housing.clone().invert()))
    bounds.setFromPoints(positions)
    bounds.expandByVector(new Vector3(10, 25, 15))
  }
  bounds.min.y = Math.min(bounds.max.y - 5, Math.max(bounds.min.y, lowestAxle - 10))
  const size = bounds.getSize(new Vector3()).multiplyScalar(units / 2).max(new Vector3(.08, .04, .08))
  const center = bounds.getCenter(new Vector3()).applyQuaternion(housing).multiplyScalar(units)
  world.createCollider(rapier.ColliderDesc.cuboid(size.x, size.y, size.z)
    .setTranslation(center.x, center.y, center.z).setRotation(housing)
    .setMass(clamp(vehicle.parts.length * .025, .4, 30)).setFriction(.45).setRestitution(.12), body)
  return body
}

function springImpulse(spec, depth, normalVelocity, supportedMass) {
  const span = spec.max - spec.min
  const sag = Math.max(spec.suspension ? span * .19 : .035, .015)
  const stiffness = supportedMass * gravity / sag
  const damping = 1.45 * Math.sqrt(supportedMass * stiffness)
  const stroke = depth - spec.min
  const bottomOut = Math.max(0, depth - spec.max)
  return clamp((stiffness * (stroke + 3 * bottomOut) - damping * normalVelocity) * physicsStep,
    0, supportedMass * gravity * physicsStep * 11)
}

export function createPhysicalDrive(rapier, vehicle, models, assembly, terrain) {
  const world = physicsWorld(rapier, terrain)
  try {
    return runVehicle(rapier, world, vehicle, models, assembly, terrain)
  } catch (error) {
    world.free()
    throw error
  }
}

function runVehicle(rapier, world, vehicle, models, assembly, terrain) {
  const suspensionByWheel = findSuspension(vehicle, assembly)
  const wheels = vehicle.initial.map(contact => {
    const { wheel } = contact
    const suspension = suspensionByWheel.get(wheel.id)
    return { ...contact, suspension, offset: 0, travel: 0, grounded: false,
      min: (suspension?.min ?? -6) * units, max: (suspension?.max ?? 7) * units,
      radius: wheel.radius * units }
  })
  const body = mountChassis(rapier, world, vehicle, models, wheels, terrain)
  const driven = new Set(vehicle.settings.mode === 'powered' ? vehicle.driven : wheels.map(({ wheel }) => wheel.id))
  const wheelsById = new Map(wheels.map(wheel => [wheel.wheel.id, wheel]))
  const turns = vehicle.groups.map(() => 0)
  const bottom = (terrain?.collisionMeshes ?? []).reduce((height, mesh) =>
    Math.min(height, mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld).min.y), 0) * units - 25
  const supportedMass = body.mass() / wheels.length
  let outOfBounds = false
  let steering = 0
  let remaining = 0
  let posed = vehicle.steeringParts(0)
  world.step()

  function wheelForces(spec, rotation, origin, chassisUp, input) {
    const steered = posed.get(spec.wheel.id)
    const contact = steered ? wheelContact(spec.wheel, steered, vehicle.forward) : spec
    const hub = contact.position.clone().sub(vehicle.origin).multiplyScalar(units).applyQuaternion(rotation).add(origin)
    const start = hub.clone().addScaledVector(chassisUp, spec.max)
    const probe = new rapier.Ray(start, chassisUp.clone().negate())
    const hit = world.castRayAndGetNormal(probe, spec.radius + spec.max - spec.min, true,
      rapier.QueryFilterFlags.EXCLUDE_DYNAMIC, undefined, undefined, body)
    const normal = hit && vectorFrom(hit.normal)
    spec.grounded = Boolean(normal && normal.dot(chassisUp) > .28 && normal.y > .25)
    spec.travel = 0
    if (!spec.grounded) {
      spec.offset = spec.min / units
      return
    }
    const point = vectorFrom(probe.pointAt(hit.timeOfImpact))
    const depth = spec.max + spec.radius - hit.timeOfImpact
    spec.offset = clamp(depth, spec.min, spec.max) / units
    const velocity = vectorFrom(body.velocityAtPoint(point))
    const load = springImpulse(spec, depth, velocity.dot(normal), supportedMass)
    if (!load) return
    const forward = contact.heading.clone().applyQuaternion(rotation).projectOnPlane(normal).normalize()
    const side = new Vector3().crossVectors(normal, forward).normalize()
    const speed = velocity.dot(forward)
    spec.travel = speed * physicsStep / units
    const power = driven.has(spec.wheel.id) ? input.throttle : 0
    const limit = power > 0 ? 4.2 : 2.4
    const gain = power ? clamp(1 - power * speed / limit, 0, 1.5) : 0
    const traction = input.brake ? -speed * supportedMass * .55 :
      (power * 7 * gain - speed * .7) * supportedMass * physicsStep
    const friction = forward.multiplyScalar(traction).addScaledVector(side, -velocity.dot(side) * supportedMass * .55)
      .clampLength(0, load * .95)
    return { impulse: normal.multiplyScalar(load).add(friction), point }
  }

  function solveStep(input) {
    const requested = vehicle.steered.length ? input.steer : 0
    steering += clamp(requested - steering, -2.7 * physicsStep, 2.7 * physicsStep)
    posed = vehicle.steeringParts(steering)
    const rotation = new Quaternion().copy(body.rotation())
    const origin = vectorFrom(body.translation())
    const chassisUp = up.clone().applyQuaternion(rotation)
    const forces = wheels.map(spec => wheelForces(spec, rotation, origin, chassisUp, input))
    for (const force of forces) {
      if (force) body.applyImpulseAtPoint(force.impulse, force.point, true)
    }
    vehicle.groups.forEach(({ plan, sample }, index) => {
      const spin = plan.spins.get(sample.wheel.id)
      const sign = Math.sign(new Vector3().fromArray(spin.axis).dot(new Vector3().crossVectors(up, sample.heading)))
      turns[index] = advanceRotor(spin, turns[index], wheelsById.get(sample.wheel.id).travel * sign / sample.wheel.radius)
    })
    world.step()
    outOfBounds = body.translation().y < bottom
  }

  function snapshot() {
    const rotation = new Quaternion().copy(body.rotation())
    const position = vectorFrom(body.translation()).divideScalar(units).sub(vehicle.origin)
    const speed = vectorFrom(body.linvel()).dot(vehicle.forward.clone().applyQuaternion(rotation))
    const yawRate = Math.abs(body.angvel().y)
    const sample = new Map(posed)
    for (const spec of wheels) {
      if (!spec.suspension) continue
      const { motion, points } = spec.suspension
      const { angle } = suspensionValue(points, spec.offset)
      for (const part of rotationPoses(vehicle.parts, motion, angle) ?? []) {
        sample.set(part.id, carryPose(vehicle.byId.get(part.id), part, sample.get(part.id)))
      }
    }
    vehicle.groups.forEach(({ plan }, index) => {
      for (const part of rotationPoses(vehicle.parts, plan, turns[index])) {
        sample.set(part.id, carryPose(vehicle.byId.get(part.id), part, sample.get(part.id)))
      }
    })
    return { poses: [...sample.values()], position, yaw: 0, tilt: rotation, speed, outOfBounds,
      radius: yawRate > 1e-4 && Math.abs(speed) > .05 ? Math.abs(speed) / yawRate : Infinity,
      grounded: wheels.filter(wheel => wheel.grounded).length,
      suspension: wheels.flatMap(({ suspension, offset, wheel }) => suspension ?
        [{ wheel: wheel.id, spring: suspension.spring, offset, length: suspensionValue(suspension.points, offset).length }] : []) }
  }

  return {
    advance(input, dt) {
      remaining += clamp(dt, 0, .05)
      for (; !outOfBounds && remaining >= physicsStep; remaining -= physicsStep) solveStep(input)
      return snapshot()
    },
    dispose() { world.free() },
  }
}
