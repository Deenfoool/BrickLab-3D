import { Quaternion, Vector3 } from 'three'
import {mountObstacles} from './world-obstacles.js'
import { assemblyBounds, gravity, metersPerLdu, physicsStep, physicsWorld, vectorFrom } from '../mechanics/physics-world.js'
import { rotationPoses } from './model.js?v=volvo-spur-gears'
import { findSuspension, suspensionValue } from './suspension.js?v=volvo-spur-gears'
import { advanceRotor, carryPose, driveScale, wheelBottom, wheelContact } from './vehicle-drive.js?v=volvo-spur-gears'

const up = new Vector3(0, 1, 0)
const units = metersPerLdu
const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const angleFor = v => Math.atan2(v.x, v.z)

function mountChassis(rapier, world, vehicle, models, wheels, terrain, scale) {
  const sourceHeading = angleFor(vehicle.forward)
  const heading = terrain?.heading ?? sourceHeading
  const start = terrain?.start.clone() ?? vehicle.origin.clone()
  start.y += (vehicle.lift + 4) * scale
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
  const mass = clamp(vehicle.parts.length * .025, .4, 30)
  if(terrain?.group?.userData.worldTrack){
    const rotation=new Quaternion().setFromAxisAngle(up,heading-sourceHeading);
    const shapeCenter=center.clone().multiplyScalar(scale).applyQuaternion(rotation).add(start);
    const shapeRotation=rotation.clone().multiply(housing);
    const shape=new rapier.Cuboid(size.x*scale,size.y*scale,size.z*scale);
    if(world.intersectionWithShape(shapeCenter,shapeRotation,shape,terrain.obstacles?.length?undefined:rapier.QueryFilterFlags.EXCLUDE_DYNAMIC,undefined,undefined,body))throw Error('На старте кузов пересекает препятствие. Измени точку старта или масштаб.');
  }
  const collider = world.createCollider(rapier.ColliderDesc.cuboid(size.x * scale, size.y * scale, size.z * scale)
    .setTranslation(center.x * scale, center.y * scale, center.z * scale).setRotation(housing)
    .setMass(mass * scale ** 3).setFriction(.45).setRestitution(.12), body)
  return { body, collider, size, center, housing, mass }
}

function springImpulse(min, max, sag, depth, normalVelocity, supportedMass) {
  const stiffness = supportedMass * gravity / sag
  const damping = 1.45 * Math.sqrt(supportedMass * stiffness)
  const stroke = depth - min
  const bottomOut = Math.max(0, depth - max)
  return clamp((stiffness * (stroke + 3 * bottomOut) - damping * normalVelocity) * physicsStep,
    0, supportedMass * gravity * physicsStep * 11)
}

export function createPhysicalDrive(rapier, vehicle, models, assembly, terrain) {
  const world = physicsWorld(rapier, terrain)
  try {
    const obstacles=mountObstacles(rapier,world,terrain?.obstacles);
    if(terrain?.group?.userData.worldTrack)world.step();
    return runVehicle(rapier, world, vehicle, models, assembly, terrain,obstacles)
  } catch (error) {
    world.free()
    throw error
  }
}

function runVehicle(rapier, world, vehicle, models, assembly, terrain,obstacles) {
  const suspensionByWheel = findSuspension(vehicle, assembly)
  const wheels = vehicle.initial.map(contact => {
    const { wheel } = contact
    const suspension = suspensionByWheel.get(wheel.id)
    return { ...contact, suspension, offset: 0, travel: 0, grounded: false,
      min: suspension?.min ?? -6, max: suspension?.max ?? 7 }
  })
  let scale = vehicle.settings.scale
  const { body, collider, size, center, housing, mass } = mountChassis(rapier, world, vehicle, models, wheels, terrain, scale)
  const driven = new Set(vehicle.settings.mode === 'powered' ? vehicle.driven : wheels.map(({ wheel }) => wheel.id))
  const wheelsById = new Map(wheels.map(wheel => [wheel.wheel.id, wheel]))
  const turns = vehicle.groups.map(() => 0)
  const bottom = (terrain?.collisionMeshes ?? []).reduce((height, mesh) =>
    Math.min(height, mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld).min.y), 0) * units - 25
  let supportedMass = body.mass() / wheels.length
  let outOfBounds = false
  let steering = 0
  let remaining = 0
  let elapsed=0
  let posed = vehicle.steeringParts(0)
  world.step()

  function steeredContact(spec) {
    const steered = posed.get(spec.wheel.id)
    return steered ? wheelContact(spec.wheel, steered, vehicle.forward) : spec
  }

  function wheelForces(spec, rotation, origin, chassisUp, input) {
    const contact = steeredContact(spec)
    const wheelUnits = units * scale
    const min = spec.min * wheelUnits
    const max = spec.max * wheelUnits
    const radius = spec.wheel.radius * wheelUnits
    const hub = contact.position.clone().sub(vehicle.origin).multiplyScalar(wheelUnits).applyQuaternion(rotation).add(origin)
    // Search from the highest reachable contact patch rather than above the whole tyre.
    const upper = max + radius * .28
    const start = hub.clone().addScaledVector(chassisUp, upper - radius)
    const probe = new rapier.Ray(start, chassisUp.clone().negate())
    const hit = world.castRayAndGetNormal(probe, upper - min, true,
      terrain?.obstacles?.length?undefined:rapier.QueryFilterFlags.EXCLUDE_DYNAMIC, undefined, undefined, body)
    const normal = hit && vectorFrom(hit.normal)
    spec.grounded = Boolean(normal && normal.dot(chassisUp) > .28 && normal.y > .25)
    spec.travel = 0
    if (!spec.grounded) {
      spec.offset = spec.min
      return
    }
    const point = vectorFrom(probe.pointAt(hit.timeOfImpact))
    const depth = upper - hit.timeOfImpact
    spec.offset = clamp(depth, min, max) / wheelUnits
    const support=hit.collider?.parent?.();
    const velocity = vectorFrom(body.velocityAtPoint(point));
    if(support?.velocityAtPoint)velocity.sub(vectorFrom(support.velocityAtPoint(point)))
    const sag = spec.suspension ? Math.max((max - min) * .19, .015 * scale) : .035 * scale
    const load = springImpulse(min, max, sag, depth, velocity.dot(normal), supportedMass)
    if (!load) return
    const forward = contact.heading.clone().applyQuaternion(rotation).projectOnPlane(normal).normalize()
    const side = new Vector3().crossVectors(normal, forward).normalize()
    const speed = velocity.dot(forward)
    spec.travel = speed * physicsStep / wheelUnits
    const power = driven.has(spec.wheel.id) ? input.throttle : 0
    const limit = power > 0 ? 4.2 : 2.4
    const gain = power ? clamp(1 - power * speed / limit, 0, 1.5) : 0
    const traction = input.brake ? -speed * supportedMass * .55 :
      (power * 7 * gain - speed * .7) * supportedMass * physicsStep
    const friction = forward.multiplyScalar(traction).addScaledVector(side, -velocity.dot(side) * supportedMass * .55)
      .clampLength(0, load * (terrain?.group?.userData.worldTrack?clamp(hit.collider?.friction?.()??.8,.05,1.5):.95))
    return { impulse: normal.multiplyScalar(load).add(friction), point,support }
  }

  function solveStep(input) {
    elapsed+=physicsStep;obstacles.beforeStep(elapsed);
    const requested = vehicle.steered.length ? input.steer : 0
    steering += clamp(requested - steering, -2.7 * physicsStep, 2.7 * physicsStep)
    posed = vehicle.steeringParts(steering)
    const rotation = new Quaternion().copy(body.rotation())
    const origin = vectorFrom(body.translation())
    const chassisUp = up.clone().applyQuaternion(rotation)
    const forces = wheels.map(spec => wheelForces(spec, rotation, origin, chassisUp, input))
    for (const force of forces) {
      if (force){body.applyImpulseAtPoint(force.impulse, force.point, true);if(force.support?.isDynamic())force.support.applyImpulseAtPoint(force.impulse.clone().negate(),force.point,true)}
    }
    vehicle.groups.forEach(({ plan, sample }, index) => {
      const spin = plan.spins.get(sample.wheel.id)
      const sign = Math.sign(new Vector3().fromArray(spin.axis).dot(new Vector3().crossVectors(up, sample.heading)))
      turns[index] = advanceRotor(spin, turns[index], wheelsById.get(sample.wheel.id).travel * sign / sample.wheel.radius)
    })
    world.step()
    outOfBounds = body.translation().y < bottom || Boolean(terrain?.group?.userData.worldTrack&&(Math.abs(body.translation().x)>9.5||Math.abs(body.translation().z)>9.5))
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
    return { poses: [...sample.values()], position, yaw: 0, tilt: rotation, scale, speed, outOfBounds, elapsed,
      radius: yawRate > 1e-4 && Math.abs(speed) > .05 ? Math.abs(speed) / yawRate : Infinity,
      grounded: wheels.filter(wheel => wheel.grounded).length,
      suspension: wheels.flatMap(({ suspension, offset, wheel }) => suspension ?
        [{ wheel: wheel.id, spring: suspension.spring, offset, length: suspensionValue(suspension.points, offset).length }] : []) }
  }

  function resize(value) {
    const next = driveScale(value)
    if (next === scale) return true

    const rotation = new Quaternion().copy(body.rotation())
    const position = vectorFrom(body.translation())
    const supported = wheels.filter(wheel => wheel.grounded)
    if (supported.length) {
      const bottom = Math.min(...supported.map(wheel => wheelBottom(steeredContact(wheel), vehicle.origin, rotation, wheel.offset)))
      position.y += (scale - next) * bottom * units
    }
    const half = size.clone().multiplyScalar(next)
    const localCenter = center.clone().multiplyScalar(next)
    const shape = new rapier.Cuboid(half.x, half.y, half.z)
    const shapeCenter = localCenter.clone().applyQuaternion(rotation).add(position)
    const shapeRotation = rotation.clone().multiply(housing)
    if (next > scale && world.intersectionWithShape(shapeCenter, shapeRotation, shape,
      rapier.QueryFilterFlags.EXCLUDE_DYNAMIC, undefined, undefined, body)) return false

    scale = next
    collider.setShape(shape)
    collider.setTranslationWrtParent(localCenter)
    collider.setMass(mass * scale ** 3)
    body.recomputeMassPropertiesFromColliders()
    supportedMass = body.mass() / wheels.length
    body.setTranslation(position, true)
    return true
  }

  return {
    resize,
    advance(input, dt) {
      remaining += clamp(dt, 0, .05)
      for (; !outOfBounds && remaining >= physicsStep; remaining -= physicsStep) solveStep(input)
      obstacles.sync();return snapshot()
    },
    dispose() { obstacles.reset();world.free() },
  }
}
