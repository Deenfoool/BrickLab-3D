import { Quaternion, Vector3 } from 'three'
import { portsFor } from '../mechanics/catalog.js?v=linkages'
import { rotationMotion, rotationPoses } from './model.js?v=linkages'
import { worldPort } from './placement.js?v=linkages'
import { terrainPose } from './drive-terrain.js?v=sketchbook'

const up = new Vector3(0, 1, 0)
const vector = value => new Vector3().fromArray(value)
const rad = Math.PI / 180
const clamp = (value, low, high) => Math.min(high, Math.max(low, value))
const approach = (value, target, step) => value + clamp(target - value, -step, step)
const horizontal = value => value.setY(0)

export function driveSettings(value) {
  const id = value => typeof value === 'string' && value.length ? value : null
  return {
    venue: value?.venue === 'flat' ? 'flat' : 'sketchbook',
    heading: Number.isFinite(value?.heading) ? clamp(value.heading, -180, 180) : 0,
    mode: value?.mode === 'powered' ? 'powered' : 'push',
    driveParts: Array.isArray(value?.driveParts) ? [...new Set(value.driveParts.map(id).filter(Boolean))] : [],
    steering: id(value?.steering),
    invert: value?.invert === true,
  }
}

export const forwardVector = degrees => new Vector3(Math.sin(degrees * rad), 0, Math.cos(degrees * rad))

function wheelGeometry(port, model) {
  const axis = vector(port.axis).normalize()
  const center = model.bounds.getCenter(new Vector3())
  const size = model.bounds.getSize(new Vector3()).multiplyScalar(.5)
  const radial = [0, 1, 2].map(i => size.getComponent(i) * Math.sqrt(1 - axis.getComponent(i) ** 2))
  const radius = Math.max(...radial)
  const line = vector(port.start)
  center.copy(line.clone().addScaledVector(axis, center.sub(line).dot(axis)))
  return { center, radius }
}

function contact(wheel, part, forward) {
  const rotation = new Quaternion().fromArray(part.rotation)
  const position = wheel.center.clone().applyQuaternion(rotation).add(vector(part.position))
  const { axis } = worldPort(part, wheel.port)
  const heading = new Vector3().crossVectors(up, axis).normalize()
  if (heading.dot(forward) < 0) heading.negate()
  return { wheel, position, heading, axis }
}

function axisOffset(port, model) {
  return model.bounds.getCenter(new Vector3()).sub(vector(port.start)).cross(vector(port.axis).normalize()).length()
}

function wheelsIn(parts, connections, models, catalog) {
  const byId = new Map(parts.map(part => [part.id, part]))
  return parts.flatMap(rim => {
    const ports = portsFor(rim.design)
    const rimPort = ports.find(port => port.role === 'rim-seat')
    const mounted = connections.filter(link => link.shaft.part === rim.id || link.socket.part === rim.id)
    const axleMount = mounted.filter(link => link.socket.part === rim.id || link.shaft.port !== rimPort?.id)
    if (!axleMount.length) return []
    const integralWheel = /^Wheel\s+\d/i.test(catalog[rim.design]?.en ?? '')
    const model = models.get(rim.design)
    const mountIds = new Set(axleMount.map(link => (link.shaft.part === rim.id ? link.shaft : link.socket).port))
    const bearing = integralWheel && model && ports.filter(port => mountIds.has(port.id) &&
        ['bearing', 'wheel-bearing', 'key', 'blind-key', 'wheel-spindle'].includes(port.role))
      .sort((a, b) => axisOffset(a, model) - axisOffset(b, model))[0]
    const runningPort = rimPort ?? bearing
    if (!runningPort || (!rimPort && axisOffset(runningPort, model) > .5)) return []
    const tyreLink = rimPort && mounted.find(link => link.shaft.part === rim.id && link.shaft.port === rimPort.id)
    const tyre = byId.get(tyreLink?.socket.part)
    const part = tyre ?? rim
    const runningModel = models.get(part.design)
    const port = tyre ? portsFor(tyre.design).find(port => port.role === 'tyre-seat') : runningPort
    if (!runningModel || !port || Math.abs(worldPort(part, port).axis.dot(up)) > .5) return []
    const { center, radius } = wheelGeometry(port, runningModel)
    return radius > 0 ? [{ id: part.id, rim: rim.id, port, center, radius }] : []
  })
}

function turnValue(motion, normalized) {
  const [min, max] = motion.range ?? [-45, 45]
  const value = normalized < 0 ? -min * normalized : max * normalized
  return motion.unit === 'linear' ? value : value * rad
}

export function prepareTestDrive(parts, assembly, models, input, catalog = {}) {
  const settings = driveSettings(input)
  const byId = new Map(parts.map(part => [part.id, part]))
  const wheels = wheelsIn(parts, assembly.connections, models, catalog)
  const forward = forwardVector(settings.heading)
  const initial = wheels.map(wheel => contact(wheel, byId.get(wheel.id), forward))
  const origin = new Vector3()
  for (const { position } of initial) origin.add(position)
  if (initial.length) origin.divideScalar(initial.length)
  const track = initial.map(({ position }) => position.clone().sub(origin).dot(forward))
  const rearOffset = track.length ? Math.min(...track) : 0
  const wheelbase = track.length ? Math.max(...track) - rearOffset : 0
  const rear = initial.filter((_, i) => track[i] <= rearOffset + wheelbase * .25)
  if (rear.length) origin.copy(rear.reduce((sum, item) => sum.add(item.position), new Vector3()).divideScalar(rear.length))
  origin.y = 0
  const lift = initial.length ? -Math.min(...initial.map(c => c.position.y - c.wheel.radius)) : 0

  const steering = settings.steering && rotationMotion(settings.steering, parts, assembly)
  const previewSteering = value => new Map((rotationPoses(parts, steering, value) ?? []).map(part => [part.id, part]))
  const neutral = steering?.ok ? previewSteering(0) : new Map()
  for (const id of neutral.keys()) neutral.set(id, byId.get(id))
  const steeringParts = normalized => {
    if (!steering?.ok || normalized === 0) return new Map(neutral)
    const sign = settings.invert ? -1 : 1
    return previewSteering(turnValue(steering, normalized * sign))
  }
  const left = steeringParts(-.6)
  const right = steeringParts(.6)
  const steered = initial.filter(c => [left, right].some(poses => {
    const part = poses.get(c.wheel.id)
    return part && c.heading.dot(contact(c.wheel, part, forward).heading) < .9999
  })).map(c => c.wheel.id)

  const groups = []
  const assigned = new Set()
  function addDrive(id) {
    if (!byId.has(id)) return
    const plan = rotationMotion(id, parts, assembly)
    if (!plan?.ok || plan.solve) return
    const reached = initial.filter(c => {
      const spin = plan.spins.get(c.wheel.id)
      return spin && Math.abs(vector(spin.axis).dot(c.axis)) > .99
    })
    if (!reached.length || reached.some(c => assigned.has(c.wheel.id))) return
    reached.forEach(c => assigned.add(c.wheel.id))
    groups.push({ plan, sample: reached[0] })
  }
  if (settings.mode === 'powered') {
    for (const id of settings.driveParts) {
      const wheel = wheels.find(w => w.id === id)
      addDrive(wheel?.rim ?? id)
    }
  }
  const driven = [...assigned]
  for (const wheel of wheels) {
    if (!assigned.has(wheel.id)) addDrive(wheel.rim)
  }

  const aligned = initial.filter(c => c.heading.dot(forward) > .65).length >= 2
  return { parts, byId, settings, forward, origin, lift, wheelbase, initial, groups, driven, steered, steeringParts, aligned,
    ready: wheelbase > 5 && aligned && (settings.mode === 'push' || driven.length > 0) }
}

export function newDriveState(vehicle, terrain) {
  const position = terrain ? terrain.start.clone().sub(vehicle.origin) : new Vector3()
  position.y += vehicle.lift
  const yaw = terrain ? terrain.heading - Math.atan2(vehicle.forward.x, vehicle.forward.z) : 0
  return { position, yaw, tilt: new Quaternion(), speed: 0, steering: 0,
    turns: vehicle.groups.map(() => 0) }
}

function carryPose(original, rolling, steered) {
  if (!steered) return rolling
  const local = new Quaternion().fromArray(steered.rotation).multiply(new Quaternion().fromArray(original.rotation).invert())
  return {
    ...rolling,
    position: vector(rolling.position).sub(vector(original.position)).applyQuaternion(local).add(vector(steered.position)).toArray(),
    rotation: local.multiply(new Quaternion().fromArray(rolling.rotation)).toArray(),
  }
}

function advanceRotor(spin, angle, increment) {
  if (!increment) return angle
  if (!spin.angleAt) return angle + increment / spin.ratio
  const target = spin.angleAt(angle) + increment
  let next = angle
  for (let step = 0; step < 8; step++) {
    const error = target - spin.angleAt(next)
    if (Math.abs(error) < 1e-7) break
    const slope = (spin.angleAt(next + .0001) - spin.angleAt(next - .0001)) / .0002
    if (Math.abs(slope) < 1e-8) break
    next += clamp(error / slope, -1, 1)
  }
  return next
}

export function stepTestDrive(vehicle, state, controls, dt, terrain) {
  const { forward, origin, byId, groups, ready } = vehicle
  const step = clamp(dt, 0, .05)
  state.steering = approach(state.steering, vehicle.steered.length ? controls.steer : 0, 2.7 * step)
  const target = controls.brake || !ready ? 0 : (controls.throttle > 0 ? 320 : 190) * controls.throttle
  const acceleration = controls.brake ? 1150 : controls.throttle ? 300 : 125
  state.speed = approach(state.speed, target, acceleration * step)

  const poses = vehicle.steeringParts(state.steering)
  const contacts = vehicle.initial.map(c => poses.has(c.wheel.id) ? contact(c.wheel, poses.get(c.wheel.id), forward) : c)
  let sum = 0
  let weight = 0
  // Minimize lateral motion at the actual wheel headings around the rear contact line.
  for (const c of contacts) {
    const lateral = new Vector3().crossVectors(up, c.heading)
    const tangent = new Vector3().crossVectors(up, horizontal(c.position.clone().sub(origin)))
    const arm = lateral.dot(tangent)
    sum += arm * lateral.dot(forward)
    weight += arm * arm
  }
  const curvature = weight > 1 && vehicle.steered.length && Math.abs(sum / weight) > 1e-8 ? -sum / weight : 0
  let distance = state.speed * step
  let yawStep = curvature * distance
  const nextPosition = state.position.clone().addScaledVector(
    forward.clone().applyAxisAngle(up, state.yaw + yawStep / 2), distance)
  const nextYaw = (state.yaw + yawStep) % (2 * Math.PI)
  const support = terrain && terrainPose(terrain, origin, state, contacts, nextPosition, nextYaw)
  const blocked = Boolean(terrain && !support && distance)
  if (terrain && !support) {
    distance = yawStep = state.speed = 0
  } else {
    if (support) {
      if (distance) distance = Math.sign(distance) * Math.hypot(distance, support.height - state.position.y)
      nextPosition.y = support.height
      state.tilt.copy(support.tilt)
    }
    state.position.copy(nextPosition)
    state.yaw = nextYaw
  }
  const contactById = new Map(contacts.map(c => [c.wheel.id, c]))
  groups.forEach(({ plan, sample }, index) => {
    const c = contactById.get(sample.wheel.id)
    const tangent = new Vector3().crossVectors(up, horizontal(c.position.clone().sub(origin)))
    const traveled = forward.clone().multiplyScalar(distance).addScaledVector(tangent, yawStep).dot(c.heading)
    const spin = plan.spins.get(c.wheel.id)
    const sign = Math.sign(vector(spin.axis).dot(new Vector3().crossVectors(up, sample.heading)))
    state.turns[index] = advanceRotor(spin, state.turns[index], traveled * sign / c.wheel.radius)
    for (const part of rotationPoses(vehicle.parts, plan, state.turns[index])) {
      poses.set(part.id, carryPose(byId.get(part.id), part, poses.get(part.id)))
    }
  })

  return { poses: [...poses.values()], yaw: state.yaw, tilt: state.tilt, position: state.position, blocked, radius: Math.abs(curvature) > 1e-6 ? 1 / Math.abs(curvature) : Infinity,
    speed: state.speed, distance }
}
