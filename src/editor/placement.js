import { Quaternion, Vector3 } from 'three'
import { measureInsertion } from '../mechanics/assembly.js?v=gear-selector'
import { centeredOffset, connectionMode, portLength } from '../mechanics/axial.js?v=gear-selector'

const Y = new Vector3(0, 1, 0)
const base = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI)
export const baseRotation = base.toArray()
const vector = value => new Vector3().fromArray(value)
const rotation = value => new Quaternion().fromArray(value).normalize()

export function worldPort(pose, port) {
  const q = rotation(pose.rotation)
  return {
    start: vector(port.start).applyQuaternion(q).add(vector(pose.position)),
    axis: vector(port.axis).applyQuaternion(q).normalize(),
  }
}

function reference(port) {
  const axis = vector(port.axis).normalize()
  const basis = port.reference ? vector(port.reference)
    : Math.abs(axis.x) > .5 ? Y.clone() : new Vector3(1, 0, 0)
  return basis.addScaledVector(axis, -basis.dot(axis)).normalize()
}

export function joinedPose(movingPose, movingPort, fixedPose, fixedPort, placement) {
  const fixed = worldPort(fixedPose, fixedPort)
  const moving = worldPort(movingPose, movingPort)
  if (placement.anchor === 'sphere') {
    return { position: vector(movingPose.position).add(fixed.start).sub(moving.start).toArray(), rotation: movingPose.rotation }
  }
  const movingShaft = movingPort.gender === 'M'
  const axis = fixed.axis.clone().multiplyScalar(placement.direction)
  const from = reference(movingPort)
  const fixedReference = reference(fixedPort).applyQuaternion(rotation(fixedPose.rotation))
  const to = fixedReference.applyAxisAngle(fixed.axis, movingShaft ? placement.roll : -placement.roll * placement.direction)
  const q = rotation(movingPose.rotation)
  q.premultiply(new Quaternion().setFromUnitVectors(moving.axis, axis))
  const current = from.applyQuaternion(q)
  const angle = Math.atan2(axis.dot(current.clone().cross(to)), current.dot(to))
  if (placement.keyStep || placement.detents?.length) q.premultiply(new Quaternion().setFromAxisAngle(axis, angle))
  else if (placement.roll) q.premultiply(new Quaternion().setFromAxisAngle(axis, placement.roll))
  const socketAxis = movingShaft ? fixed.axis : axis
  const position = fixed.start.clone().addScaledVector(socketAxis, (movingShaft ? 1 : -1) * placement.offset)
    .sub(vector(movingPort.start).applyQuaternion(q))
  return { position: position.toArray(), rotation: q.toArray() }
}

export function candidateOffsets(shaft, socket, direction, side, depth) {
  const shaftSize = portLength(shaft)
  const socketSize = portLength(socket)
  const mode = connectionMode(shaft, socket)
  if (mode?.axialRange) {
    const [min, max] = mode.axialRange
    return [centeredOffset(shaft, socket, direction) + Math.max(min, Math.min(max, depth))]
  }
  if (mode?.anchor === 'slide') return direction === 1 ? [Math.max(mode.stroke[0], Math.min(mode.stroke[1], mode.stroke[1] + depth))] : []
  if (mode?.anchor) return direction === 1 || mode.anchor === 'pivot' ? [0] : []
  if (mode?.clutch) return direction === -1 && side === 'start' ? [Math.min(shaftSize, socketSize)] : []
  if (mode?.tube) return direction === 1 && side === 'start' ? [0] : []
  if (mode?.rimSeat) return direction === mode.rimSeat[1] ? [mode.rimSeat[0]] : []
  if (mode?.seat) return [side === 'start' ? 0 : socketSize]
  if (socket.seat !== undefined) return [socket.seat]
  const points = [
    (socketSize - direction * shaftSize) / 2,
    side === 'start' ? socketSize - Math.max(0, direction * shaftSize) : -Math.min(0, direction * shaftSize),
  ]
  const maleEnds = [0]
  const femaleEnds = [0]
  for (const section of shaft.sections) maleEnds.push(maleEnds.at(-1) + direction * section.length)
  for (const section of socket.sections) femaleEnds.push(femaleEnds.at(-1) + section.length)
  for (const f of femaleEnds) for (const m of maleEnds) points.push(f - m)
  return [...new Set(points)].map(offset => offset + depth)
}

// Find the actual offset and roll of a connection after a manual transform.
export function retainedPlacement(shaft, male, socket, female, previous) {
  const a = worldPort(shaft, male)
  const b = worldPort(socket, female)
  const world = {
    shaft: { start: a.start.toArray(), axis: a.axis.toArray() },
    socket: { start: b.start.toArray(), axis: b.axis.toArray() },
  }
  const measured = measureInsertion(world.shaft, world.socket, connectionMode(male, female)?.anchor)
  if (!measured) return null
  const aRef = reference(male).applyQuaternion(rotation(shaft.rotation))
  const bRef = reference(female).applyQuaternion(rotation(socket.rotation))
  const roll = Math.atan2(b.axis.dot(bRef.clone().cross(aRef)), bRef.dot(aRef))
  return { placement: { ...previous, ...measured, roll }, world }
}

export function samePose(a, b) {
  const position = vector(a.position).distanceToSquared(vector(b.position))
  const alignment = Math.abs(rotation(a.rotation).dot(rotation(b.rotation)))
  return position < 1e-10 && alignment > 1 - 1e-10
}
