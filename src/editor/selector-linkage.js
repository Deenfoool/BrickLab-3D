import { Quaternion, Vector3 } from 'three'
import { connectionMode, portLength } from '../mechanics/axial.js?v=gear-selector'
import { portsFor } from '../mechanics/catalog.js?v=gear-selector'
import { assignPose, jointBodies, turnPose } from '../mechanics/linkage.js'
import { worldPort } from './placement.js?v=gear-selector'

const vector = value => new Vector3().fromArray(value)
const lineTolerance = .02
const coaxial = (a, b) => Math.abs(a.axis.dot(b.axis)) > .99999 &&
  a.start.clone().sub(b.start).cross(b.axis).length() < lineTolerance
const transformPoint = (point, pose) => point.clone().applyQuaternion(pose.rotation).add(pose.translation)

function supportedPivot(body, excluded, reference) {
  const joints = body.edges.filter(edge => edge !== excluded && edge.joint.group !== 'changeover')
  if (!joints.length || joints.some(edge => edge.joint.motion !== 'continuous')) return
  const pivot = reference ?? joints[0]
  if (joints.every(edge => coaxial(edge, pivot))) return pivot
}

// A through-pin supported on both sides defines the lever pivot even in older
// scenes whose middle bearing was never registered as an insertion.
function handlePivot(body, end, byId, assembly) {
  const saved = supportedPivot(body, end)
  if (saved || body.edges.some(edge => edge !== end)) return saved
  const pivots = []
  for (const id of body.ids) for (const bore of portsFor(byId.get(id).design).filter(p => p.role === 'bearing')) {
    const line = worldPort(byId.get(id), bore)
    const middle = line.start.clone().addScaledVector(line.axis, portLength(bore) / 2)
    for (const pin of byId.values()) for (const port of portsFor(pin.design).filter(p => ['pin', 'friction-pin'].includes(p.role))) {
      const shaft = worldPort(pin, port)
      if (!coaxial(line, shaft)) continue
      const t = middle.clone().sub(shaft.start).dot(shaft.axis)
      if (t < portLength(bore) / 2 || t > portLength(port) - portLength(bore) / 2) continue
      const supports = assembly.connections.filter(l => l.shaft.part === pin.id && l.shaft.port === port.id &&
        !body.ids.includes(l.socket.part)).map(l => l.fit.occupancy.shaft)
      if (supports.some(([,hi]) => hi < t) && supports.some(([lo]) => lo > t)) pivots.push(line)
    }
  }
  if (pivots.length === 1) return pivots[0]
}

export function clutchTravel(ring, axis, center, direction, parts) {
  if (!direction) return 0
  const dogs = portsFor(ring.design).filter(port => port.role === 'clutch-driver')
    .map(dog => ({ dog, tip: worldPort({ ...ring, position: center.toArray() }, dog) }))
  let travel = 10 * direction
  for (const part of parts) {
    if (part.id === ring.id) continue
    for (const face of portsFor(part.design).filter(port => port.role === 'clutch-face')) {
      const target = worldPort(part, face)
      if (target.axis.dot(axis) * direction < .99999) continue
      for (const { dog, tip } of dogs) {
        if (!connectionMode(dog, face) || tip.axis.dot(target.axis) > -.99999) continue
        const delta = target.start.clone().addScaledVector(target.axis, Math.min(portLength(face), portLength(dog))).sub(tip.start)
        const distance = delta.dot(axis)
        if (delta.addScaledVector(axis, -distance).length() < .01 && distance * direction > 0 &&
            Math.abs(distance) <= Math.abs(travel) + .001) travel = distance
      }
    }
  }
  return travel
}

function guidedRing(lever, pivot, tip, parts, links, assembly) {
  const saved = links.find(link => link.shaft.part === lever.id && link.socket.port === 'shift-groove')
  let best
  for (const guide of links.filter(link => link.socket.port === 'selector-guide')) {
    const ring = parts.get(guide.socket.part)
    if (!ring || (saved && ring.id !== saved.socket.part)) continue
    const axis = worldPort(ring, assembly.port(ring.id, guide.socket.port)).axis
    if (Math.abs(axis.dot(pivot.axis)) > 1e-4) continue
    const spline = assembly.port(guide.shaft.part, guide.shaft.port)
    const shaft = worldPort(parts.get(guide.shaft.part), spline)
    const center = shaft.start.addScaledVector(shaft.axis, portLength(spline) / 2)
    // The rounded fork straddles the groove while allowing the ring to rotate.
    const radial = tip.clone().sub(pivot.start)
    radial.addScaledVector(pivot.axis, -radial.dot(pivot.axis))
    radial.addScaledVector(axis, -radial.dot(axis)).normalize()
    const gap = vector(ring.position).sub(tip)
    const sideways = Math.abs(gap.dot(pivot.axis))
    const along = Math.abs(gap.dot(axis))
    const clearance = gap.dot(radial)
    if (!saved && (sideways > 10 || along > 3 || clearance < 13 || clearance > 22)) continue
    const score = sideways + along
    if (!best || score < best.score) {
      const offset = vector(ring.position).sub(center).dot(axis)
      const [min, max] = assembly.axialTravel(guide.shaft, guide.socket).map(delta => offset - delta).reverse()
      const near = clutchTravel(ring, axis, center, -1, parts.values())
      const far = clutchTravel(ring, axis, center, 1, parts.values())
      best = { ring, axis, center, score, range: [Math.min(offset, Math.max(min, near)), Math.max(offset, Math.min(max, far))] }
    }
  }
  return best
}

// Intersect the driven ball's orbit with the sphere defined by the rigid link.
function followerAngle(point, ball, pivot, distance) {
  const radius = ball.clone().sub(pivot.start)
  const target = point.clone().sub(pivot.start)
  const height = target.dot(pivot.axis) - radius.dot(pivot.axis)
  radius.addScaledVector(pivot.axis, -radius.dot(pivot.axis))
  target.addScaledVector(pivot.axis, -target.dot(pivot.axis))
  const length = radius.length()
  const span = target.length()
  if (length < .01 || span < .01) return
  const cosine = (length ** 2 + span ** 2 + height ** 2 - distance ** 2) / (2 * length * span)
  if (Math.abs(cosine) > 1 + 1e-8) return
  const middle = Math.atan2(radius.clone().cross(target).dot(pivot.axis), radius.dot(target))
  const angle = Math.acos(Math.max(-1, Math.min(1, cosine)))
  const wrap = value => Math.atan2(Math.sin(value), Math.cos(value))
  const first = wrap(middle + angle)
  const second = wrap(middle - angle)
  return Math.abs(first) < Math.abs(second) ? first : second
}

function makeLinkage(input, rocker, rod, originalA, originalB, guide, tip, missing) {
  const length = originalA.distanceTo(originalB)
  const tangent = rocker.pivot.axis.clone().cross(tip.clone().sub(rocker.pivot.start)).dot(guide.axis)
  const restTravel = tip.clone().sub(guide.center).dot(guide.axis)
  const pivotTravel = rocker.pivot.start.clone().sub(guide.center).dot(guide.axis)
  const radialStep = restTravel - pivotTravel
  const forkRadius = Math.hypot(radialStep, tangent)
  const direction = Math.sign(tangent)
  const ringStart = vector(guide.ring.position)
  const assembledTravel = ringStart.clone().sub(guide.center).dot(guide.axis)
  if (!direction || length < 1 || forkRadius < 1) return

  function solve(drive, angle, travelOffset = assembledTravel - restTravel) {
    const follow = drive === input ? rocker : input
    const drivePose = turnPose(drive.pivot.start, drive.pivot.axis, angle)
    const solved = followerAngle(transformPoint(drive.ball, drivePose), follow.ball, follow.pivot, length)
    if (solved === undefined || Math.abs(solved) > Math.PI / 3) return
    const followPose = turnPose(follow.pivot.start, follow.pivot.axis, solved)
    const inputPose = drive === input ? drivePose : followPose
    const rockerPose = drive === rocker ? drivePose : followPose
    const a = transformPoint(input.ball, inputPose)
    const b = transformPoint(rocker.ball, rockerPose)
    const rotation = new Quaternion().setFromUnitVectors(
      originalB.clone().sub(originalA).normalize(), b.clone().sub(a).normalize())
    const transforms = new Map()
    assignPose(transforms, input.body, inputPose)
    assignPose(transforms, rocker.body, rockerPose)
    assignPose(transforms, rod, { rotation, translation: a.sub(originalA.clone().applyQuaternion(rotation)) })
    if (travelOffset !== null) {
      const travel = transformPoint(tip, rockerPose).sub(guide.center).dot(guide.axis) + travelOffset
      if (travel < guide.range[0] - 1e-5 || travel > guide.range[1] + 1e-5) return
      const shift = travel - assembledTravel
      transforms.set(guide.ring.id, { rotation: new Quaternion(), translation: guide.axis.clone().multiplyScalar(shift) })
    }
    return transforms
  }

  return {
    ring: guide.ring, missing,
    contains: id => guide.ring.id === id || [input.body, rocker.body, rod].some(body => body.ids.includes(id)),
    motion(id) {
      const drive = input.body.ids.includes(id) ? input : rocker.body.ids.includes(id) ? rocker : null
      if (drive) return { kind: 'selector', range: [-30, 30], solve: angle => solve(drive, angle) }
    },
    recover: () => solve(input, 0, null),
    shift(travel) {
      const amplitude = (travel - pivotTravel) * direction / forkRadius
      if (Math.abs(amplitude) > 1) return
      return solve(rocker, Math.asin(amplitude) - Math.atan2(radialStep * direction, Math.abs(tangent)), 0)
    },
  }
}

export function selectorLinkages(parts, joints, assembly, recover = false) {
  const levers = parts.filter(part => part.design === '6641')
  if (!levers.length) return []
  const byId = new Map(parts.map(part => [part.id, part]))
  const graph = jointBodies(byId.keys(), joints)
  const links = assembly.connections
  const result = []
  for (const lever of levers) {
    const rocker = graph.byPart.get(lever.id)
    const pivot = worldPort(lever, portsFor(lever.design).find(port => port.role === 'key'))
    // The physical tip is 22 LDU from the local pivot at Z=-20.
    const tip = worldPort(lever, { start: [0, 0, -42], axis: [1, 0, 0] }).start
    const guide = guidedRing(lever, pivot, tip, byId, links, assembly)
    if (!guide) continue
    // A saved rod may already be seated on the handle and be missing the catch end.
    if (recover && supportedPivot(rocker, null, pivot)) {
      const balls = rocker.ids.flatMap(id => portsFor(byId.get(id).design)
        .filter(port => port.role === 'ball' && !links.some(l => l.shaft.part === id && l.shaft.port === port.id))
        .map(port => ({ id, port, start: worldPort(byId.get(id), port).start })))
      const possible = []
      for (const end of graph.edges.filter(e => e.joint.motion === 'ball' && e.b.edges.length === 1)) {
        const rodPart = byId.get(end.joint.b)
        const sockets = portsFor(rodPart.design).filter(p => p.role === 'ball-socket')
        const support = handlePivot(end.a, end, byId, assembly)
        if (sockets.length !== 2 || !support || Math.abs(support.axis.dot(pivot.axis)) < .99999) continue
        const socket = sockets.find(p => p.id !== end.joint.socketPort)
        const target = worldPort(rodPart, socket).start
        for (const ball of balls) {
          if (!connectionMode(ball.port, socket) || ball.start.distanceTo(target) > 4.5) continue
          const missing = { shaft: { part: ball.id, port: ball.port.id }, socket: { part: rodPart.id, port: socket.id } }
          const linkage = makeLinkage({ body: end.a, pivot: support, ball: end.start },
            { body: rocker, pivot, ball: ball.start }, end.b, end.start, target, guide, tip, missing)
          if (linkage) possible.push(linkage)
        }
      }
      if (possible.length === 1) result.push(possible[0])
    }
    for (const end of rocker.edges) {
      if (end.joint.motion !== 'ball' || end.a !== rocker || !supportedPivot(rocker, end, pivot)) continue
      const rod = end.b
      const rodPart = byId.get(end.joint.b)
      const sockets = portsFor(rodPart.design).filter(port => port.role === 'ball-socket')
      if (sockets.length !== 2 || rod.edges.length > 2) continue
      const otherPort = sockets.find(port => port.id !== end.joint.socketPort)
      if (!otherPort) continue
      const originalA = worldPort(rodPart, otherPort).start
      const originalB = end.start
      const other = rod.edges.find(edge => edge !== end)
      if (other && (other.joint.motion !== 'ball' || other.b !== rod || other.joint.socketPort !== otherPort.id)) continue
      if (!other && !recover) continue
      const candidates = other ? [{ id: other.joint.a, start: other.start, edge: other }] : parts.flatMap(part => {
        if (graph.byPart.get(part.id) === rocker || graph.byPart.get(part.id) === rod) return []
        return portsFor(part.design).filter(port => connectionMode(port, otherPort)?.anchor === 'sphere' &&
          !links.some(link => link.shaft.part === part.id && link.shaft.port === port.id))
          .map(port => ({ id: part.id, port: port.id, start: worldPort(part, port).start }))
          .filter(ball => ball.start.distanceTo(originalA) <= 4.5)
      })
      const inputs = candidates.flatMap(candidate => {
        const body = graph.byPart.get(candidate.id)
        const support = handlePivot(body, candidate.edge, byId, assembly)
        if (!support || body === rocker || Math.abs(support.axis.dot(pivot.axis)) < .99999) return []
        return [{ ...candidate, body, pivot: support, ball: candidate.start }]
      })
      if (inputs.length !== 1) continue
      const [input] = inputs
      const missing = other ? null : {
        shaft: { part: input.id, port: input.port }, socket: { part: rodPart.id, port: otherPort.id },
      }
      const mechanism = makeLinkage(input, { body: rocker, pivot, ball: end.start }, rod, originalA, originalB, guide, tip, missing)
      if (mechanism) result.push(mechanism)
    }
  }
  return result
}
