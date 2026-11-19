import { Box3, Plane, Quaternion, Vector3 } from 'three'
import { measureInsertion } from '../mechanics/assembly.js?v=gear-selector'
import { evaluateSpurMesh } from '../mechanics/gears.js'
import { centeredOffset, connectionMode, portLength } from '../mechanics/axial.js?v=gear-selector'
import { gearAt, gearRacks, portsFor } from '../mechanics/catalog.js?v=system-tiles'
import { candidateOffsets, joinedPose, samePose, worldPort } from './placement.js?v=mirror-menu'

const gearPort = part => portsFor(part.design).find(port => port.role === 'gear')
const canSlideOn = port => ['axle', 'duplo-axle', 'rod'].includes(port.role)
const pinPitch = 20
const pinSeatRadius = 2
const isPinBore = port => port.role === 'bearing' && port.openings.length === 2 && portLength(port) === pinPitch
const longPinBore = (male, female) =>
  ['pin', 'friction-pin'].includes(male.role) && portLength(male) >= 3 * pinPitch &&
  portLength(male) % pinPitch === 0 && isPinBore(female)
const line = ({ start, axis }) => ({ start: start.toArray(), axis: axis.toArray() })
const coversPinBore = fit => fit.occupancy.socket[1] - fit.occupancy.socket[0] >= pinPitch - .01

function pinStack(sockets, target, male) {
  return sockets.filter(({ bore }) => {
    const placement = measureInsertion(bore, target)
    if (!placement) return false
    const separation = Math.abs(placement.offset + (placement.direction - 1) * pinPitch / 2)
    const step = Math.round(separation / pinPitch)
    return step > 0 && step * pinPitch < portLength(male) && Math.abs(separation - step * pinPitch) <= .01
  })
}

function seatedPinNeighbors(assembly, stack, shaft, pose, male) {
  const axis = line(worldPort(pose, male))
  const seats = new Set()
  for (const { socket, bore } of stack) {
    const placement = measureInsertion(axis, bore)
    if (!placement) continue
    const fit = assembly.previewInsertion(shaft, socket, placement, { seated: true })
    if (fit.ok && coversPinBore(fit)) {
      seats.add(Math.round(fit.occupancy.shaft[0] / pinPitch))
    }
  }
  return seats.size
}

function gearCenter(part, port) {
  const { start, axis } = worldPort(part, port)
  return { center: start.addScaledVector(axis, portLength(port) / 2), axis }
}

function meshCandidate({ scene, moving, fixed, ownGear, fixedGear, event, ray, acceptPose }) {
  const a = gearCenter(moving, ownGear)
  const b = gearCenter(fixed, fixedGear)
  if (1 - Math.abs(a.axis.dot(b.axis)) > 0.00005) return
  const plane = ray && new Plane().setFromNormalAndCoplanarPoint(b.axis, b.center)
  let aim = a.center
  if (plane) {
    aim = Math.abs(ray.direction.dot(b.axis)) > 1e-4 ? ray.intersectPlane(plane, new Vector3()) : null
    aim ??= ray.closestPointToPoint(b.center, new Vector3())
  }
  const radial = aim.clone().sub(b.center)
  radial.addScaledVector(b.axis, -radial.dot(b.axis))
  if (radial.lengthSq() < 1e-6) return
  const point = b.center.clone().add(radial.setLength(ownGear.sections[0].radius + fixedGear.sections[0].radius))
  // Keep an already overlapping tooth face at its current depth during an axial gizmo drag.
  if (acceptPose) point.addScaledVector(b.axis, a.center.clone().sub(b.center).dot(b.axis))
  const distance = scene.pixelDistance(point, event)
  if (!Number.isFinite(distance) || distance > 25) return
  const pose = { position: new Vector3().fromArray(moving.position).add(point.clone().sub(a.center)).toArray(), rotation: moving.rotation }
  if (acceptPose && !acceptPose(pose)) return
  const mesh = evaluateSpurMesh(gearAt(moving.id, moving.design, point.toArray(), a.axis.toArray()),
    gearAt(fixed.id, fixed.design, b.center.toArray(), b.axis.toArray()))
  if (mesh.ok) return { key: JSON.stringify(['mesh', fixed.id]), point, distance, pose, mesh }
}

function rackCandidate(scene, moving, fixed, ownGear, fixedGear, event, ray, acceptPose) {
  const rackPart = ownGear ? fixed : moving
  const gearPart = ownGear ? moving : fixed
  const gear = ownGear ?? fixedGear
  const rack = gearRacks[rackPart.design]
  const teeth = gear?.sections[0]
  if (!rack || !teeth || Math.abs(2 * Math.PI * teeth.radius / teeth.teeth - rack.pitch) > .22) return
  const { start, axis } = worldPort(rackPart, rack)
  const normal = new Vector3().fromArray(rack.normal).applyQuaternion(new Quaternion().fromArray(rackPart.rotation))
  const center = gearCenter(gearPart, gear)
  if (Math.abs(axis.dot(center.axis)) > 1e-4 || Math.abs(normal.dot(center.axis)) > 1e-4) return
  const pitch = start.addScaledVector(normal, teeth.radius)
  const cursor = ownGear && ray ? ray.intersectPlane(new Plane().setFromNormalAndCoplanarPoint(center.axis, pitch), new Vector3()) : null
  const along = Math.max(-rack.length / 2 + 1, Math.min(rack.length / 2 - 1, (cursor ?? center.center).clone().sub(pitch).dot(axis)))
  const point = pitch.addScaledVector(axis, along)
  if (acceptPose) point.addScaledVector(center.axis, center.center.clone().sub(point).dot(center.axis))
  const distance = scene.pixelDistance(point, event)
  if (!Number.isFinite(distance) || distance > 25) return
  const offset = point.clone().sub(center.center).multiplyScalar(ownGear ? 1 : -1)
  const pose = { position: new Vector3().fromArray(moving.position).add(offset).toArray(), rotation: moving.rotation }
  if (!acceptPose || acceptPose(pose)) return { key: JSON.stringify(['rack', fixed.id]), point, distance, pose, mesh: { ok: true } }
}

function shaftTargets(port, start, axis, span, along) {
  if (along <= .001 || along >= span - .001) return []
  const point = start.clone().addScaledVector(axis, along)
  return port.openings.map(side => ({ side, point, along }))
}

function longPinTargets(port, start, axis, span) {
  const targets = []
  for (let along = pinPitch / 2; along < span; along += pinPitch) {
    for (const target of shaftTargets(port, start, axis, span, along)) {
      targets.push({ ...target, targetKind: `pin-seat-${along}` })
    }
  }
  return targets
}

function withinSnapRange(scene, event, targets) {
  return targets.map(target => ({ ...target, distance: scene.pixelDistance(target.point, event) }))
    .filter(({ distance }) => Number.isFinite(distance) && distance <= 31)
}

function targetsOnPort(scene, event, port, start, axis, span, ray) {
  if (port.role === 'selector-spline' || port.role === 'selector-guide') {
    const point = start.clone().addScaledVector(axis, span / 2)
    if (ray) ray.distanceSqToSegment(start, start.clone().addScaledVector(axis, span), undefined, point)
    return withinSnapRange(scene, event, port.openings.map(side => ({ side, point })))
  }
  const targets = port.openings.map(side => ({
    side, point: start.clone().addScaledVector(axis, side === 'end' ? span : 0),
  }))
  if (ray && canSlideOn(port)) {
    const nearest = new Vector3()
    ray.distanceSqToSegment(start, start.clone().addScaledVector(axis, span), undefined, nearest)
    targets.push(...shaftTargets(port, start, axis, span, nearest.sub(start).dot(axis)))
  }
  return withinSnapRange(scene, event, targets)
}

function anchorCandidate(context, fixed, fixedPort, own, start, mode) {
  const { scene, assembly, moving, event, acceptPose } = context
  const distance = scene.pixelDistance(start, event)
  if (!Number.isFinite(distance) || distance > 31) return undefined
  const ownMale = own.gender === 'M'
  const shaft = { part: ownMale ? moving.id : fixed.id, port: (ownMale ? own : fixedPort).id }
  const socket = { part: ownMale ? fixed.id : moving.id, port: (ownMale ? fixedPort : own).id }
  const key = JSON.stringify([fixed.id, fixedPort.id, own.id, 'anchor'])
  const sameDirection = worldPort(moving, own).axis.dot(worldPort(fixed, fixedPort).axis) >= 0
  const direction = mode.anchor === 'pivot' && mode.rotation !== 'spring' && !sameDirection ? -1 : 1
  const offset = mode.stroke ? (mode.stroke[0] + mode.stroke[1]) / 2 : 0
  const fit = assembly.previewInsertion(shaft, socket, { offset, direction })
  if (!fit.ok) return { key, point: start, distance, failure: fit.reason }
  const poses = mode.stroke && acceptPose
    ? [offset, worldPort(ownMale ? moving : fixed, ownMale ? own : fixedPort).start
      .sub(worldPort(ownMale ? fixed : moving, ownMale ? fixedPort : own).start)
      .dot(worldPort(ownMale ? fixed : moving, ownMale ? fixedPort : own).axis)]
    : [offset]
  for (const position of poses) {
    const candidate = position === offset ? fit : assembly.previewInsertion(shaft, socket, { offset: position, direction })
    if (!candidate.ok) continue
    const pose = joinedPose(moving, own, fixed, fixedPort, candidate.placement)
    if (!acceptPose || acceptPose(pose)) return { key, point: start, distance, pose, fit: candidate, shaft, socket }
  }
}

export function nearbyConnections(context) {
  const { scene, assembly, parts, moving, event, depth, roll, acceptPose, ray } = context
  const candidates = []
  const orientation = new Quaternion().fromArray(moving.rotation)
  const ownPorts = portsFor(moving.design)
  if (!ownPorts.length) return candidates
  const ownConnectors = ownPorts.filter(port => port.role !== 'gear' && !port.legacy)
  const ownGear = gearPort(moving)
  let bearingSockets
  for (const fixed of parts) {
    if (fixed.id === moving.id) continue
    const fixedGear = gearPort(fixed)
    if (ownGear && fixedGear) {
      const candidate = meshCandidate({ scene, moving, fixed, ownGear, fixedGear, event, ray, acceptPose })
      if (candidate) candidates.push(candidate)
    }
    if (ownGear && gearRacks[fixed.design] || fixedGear && gearRacks[moving.design]) {
      const candidate = rackCandidate(scene, moving, fixed, ownGear, fixedGear, event, ray, acceptPose)
      if (candidate) candidates.push(candidate)
    }
    for (const fixedPort of portsFor(fixed.design)) {
      if (fixedPort.role === 'gear' || fixedPort.legacy) continue
      const { start, axis } = worldPort(fixed, fixedPort)
      const span = portLength(fixedPort)
      if (['shift-tip', 'shift-groove', 'ball', 'ball-socket', 'pivot', 'clip', 'plug', 'receptacle', 'piston', 'damper-cylinder', 'coil', 'coil-seat'].includes(fixedPort.role)) {
        if (scene.pixelDistance(start, event) > 31) continue
        for (const own of ownConnectors) {
          const mode = own.gender === 'M' ? connectionMode(own, fixedPort) : connectionMode(fixedPort, own)
          if (!mode?.anchor || (!acceptPose && (own.shift || fixedPort.shift))) continue
          const candidate = anchorCandidate(context, fixed, fixedPort, own, start, mode)
          if (candidate) candidates.push(candidate)
        }
        continue
      }
      const targets = targetsOnPort(scene, event, fixedPort, start, axis, span, ray)
      const slidingShaft = canSlideOn(fixedPort)
      const gizmoShaft = acceptPose && slidingShaft
      const stops = slidingShaft && depth === 0 ? assembly.shaftEntryStops({ part: fixed.id, port: fixedPort.id }) : null
      let pinTargets
      for (const own of ownConnectors) {
        const movingShaft = own.gender === 'M'
        const male = movingShaft ? own : fixedPort
        const female = movingShaft ? fixedPort : own
        const mode = connectionMode(male, female)
        if (!mode || mode.anchor) continue
        const ownWorld = acceptPose && worldPort(moving, own)
        // A rigid selection can only translate. Discard impossible port pairs
        // before enumerating insertion depths or checking occupied intervals.
        const displacement = context.translationOnly && ownWorld.start.clone().sub(start)
        const axial = displacement && displacement.dot(axis)
        const alignment = displacement && ownWorld.axis.dot(axis)
        if (displacement && (Math.abs(alignment) < .999999 ||
            displacement.lengthSq() - axial * axial > 12.01 ** 2)) continue
        const socketWidth = portLength(female)
        let points = targets
        const fitsLongPin = longPinBore(male, female)
        if (!movingShaft && fitsLongPin) {
          pinTargets ??= withinSnapRange(scene, event, longPinTargets(fixedPort, start, axis, span))
          points = [...targets, ...pinTargets]
        }
        if (gizmoShaft && !movingShaft) {
          const center = ownWorld.start.clone().addScaledVector(ownWorld.axis, socketWidth / 2)
          const along = center.sub(start).dot(axis)
          points = [...targets, ...withinSnapRange(scene, event, shaftTargets(fixedPort, start, axis, span, along))]
        }
        if (slidingShaft && !movingShaft && fixedPort.sections.length > 1) {
          // Aiming at a molded stop selects the adjacent seat, reached from the opposite end.
          const boreRadius = Math.max(...female.sections.map(section => section.radius))
          const first = fixedPort.sections[0]
          const last = fixedPort.sections.at(-1)
          const seats = []
          if (last.radius > boreRadius) seats.push({ side: 'start', along: span - last.length - socketWidth / 2, at: span - last.length })
          if (first.radius > boreRadius) seats.push({ side: 'end', along: first.length + socketWidth / 2, at: first.length })
          for (const seat of seats) {
            if (seat.along < socketWidth / 2 || seat.along > span - socketWidth / 2) continue
            const point = start.clone().addScaledVector(axis, seat.at)
            points = [...points, ...withinSnapRange(scene, event, [{ ...seat, point, targetKind: 'stop' }])]
          }
        }
        if (stops && !movingShaft) {
          // Present the two accessible shoulders as snap targets in screen space.
          // A failed aim inside an occupied interval must not hide a nearby legal seat.
          const centers = [stops.start - socketWidth / 2, stops.end + socketWidth / 2]
          const shoulders = centers.flatMap((along, index) => along >= socketWidth / 2 && along <= span - socketWidth / 2
            ? [{ side: index === 0 ? 'start' : 'end', point: start.clone().addScaledVector(axis, along), along, targetKind: 'neighbor' }]
            : [])
          points = [...points, ...withinSnapRange(scene, event, shoulders)]
        }
        if (!points.length) continue
        const pin = depth === 0 && fitsLongPin
        let stack = []
        if (pin && movingShaft && !acceptPose) {
          bearingSockets ??= parts.filter(part => part.id !== moving.id).flatMap(part => portsFor(part.design)
            .filter(port => !port.legacy && isPinBore(port))
            .map(port => ({ socket: { part: part.id, port: port.id }, bore: line(worldPort(part, port)) })))
          stack = pinStack(bearingSockets, line({ start, axis }), male)
        }
        for (const { side, point, along, distance, targetKind = along === undefined ? 'end' : 'slide' } of points) {
          const shaft = { part: movingShaft ? moving.id : fixed.id, port: male.id }
          const socket = { part: movingShaft ? fixed.id : moving.id, port: female.id }
          const key = JSON.stringify([fixed.id, fixedPort.id, own.id, side, targetKind])
          const directions = movingShaft ? [1, -1] : [side === 'start' ? -1 : 1, side === 'start' ? 1 : -1]
          const entries = movingShaft ? [side] : female.openings
          // Each end can reach only as far as the first installed socket on that side.
          const shoulder = stops && along !== undefined && (side === 'start'
            ? stops.start - socketWidth / 2 : stops.end + socketWidth / 2)
          const nearShoulder = Number.isFinite(shoulder) && shoulder >= socketWidth / 2 &&
            shoulder <= span - socketWidth / 2 &&
            scene.pixelDistance(start.clone().addScaledVector(axis, shoulder), event) <= 31
          let best
          let failure
          for (const direction of directions) {
            if (displacement && direction * alignment < 0) continue
            for (const entry of entries) {
              const entersAtShaftEnd = (entry === 'start') === (direction > 0)
              if (!movingShaft && entersAtShaftEnd !== (side === 'end')) continue
              const signedDepth = movingShaft ? (entry === 'start' ? depth : -depth) : (side === 'start' ? -direction : direction) * depth
              let offsets
              if (along === undefined) {
                offsets = candidateOffsets(male, female, direction, entry, signedDepth)
              } else {
                const inset = Math.min(socketWidth, span) / 2
                const center = Math.max(inset, Math.min(span - inset, along))
                offsets = [socketWidth / 2 - direction * (center + depth)]
                if (nearShoulder) offsets.unshift(socketWidth / 2 - direction * shoulder)
              }
              if (ownWorld) {
                const fixedAxis = movingShaft ? axis : axis.clone().multiplyScalar(direction)
                const offset = ownWorld.start.clone().sub(start).dot(fixedAxis) * (movingShaft ? 1 : -1)
                if (mode.axialRange) {
                  const depthFromCenter = offset - centeredOffset(male, female, direction)
                  offsets.push(...candidateOffsets(male, female, direction, entry, depthFromCenter))
                } else offsets.push(offset)
              }
              for (const offset of offsets) {
                if (displacement && Math.abs(offset - (movingShaft ? axial : -direction * axial)) > 12.01) continue
                const placement = { direction, side: entry, offset, roll }
                const fit = assembly.previewInsertion(shaft, socket, placement)
                if (!fit.ok) {
                  if (!failure || fit.reason.includes('occupied')) failure = fit.reason
                  continue
                }
                let pose = joinedPose(moving, own, fixed, fixedPort, fit.placement)
                if (acceptPose && !acceptPose(pose)) {
                  const alternatives = fit.placement.detents ?? (fit.placement.keyStep
                    ? [1, 2, 3].map(step => fit.placement.roll + step * fit.placement.keyStep) : [])
                  const matchingRoll = alternatives.find(roll => {
                    const placement = { ...fit.placement, roll }
                    pose = joinedPose(moving, own, fixed, fixedPort, placement)
                    return acceptPose(pose)
                  })
                  if (matchingRoll === undefined) continue
                  fit.placement.roll = matchingRoll
                }
                const bounds = fit.occupancy.shaft
                const endpoint = nearShoulder ? shoulder : along ?? (side === 'end' ? span : 0)
                const reach = movingShaft ? 0 : Math.abs((bounds[0] + bounds[1]) / 2 - endpoint)
                // At the tip of a molded pin, prefer the full seat to a shallower fit.
                const partialPinSeat = pin && !coversPinBore(fit) ? span : 0
                const turn = orientation.angleTo(new Quaternion().fromArray(pose.rotation))
                const shift = acceptPose ? Math.hypot(...pose.position.map((value, i) => value - moving.position[i])) : 0
                const pinSeat = Boolean(acceptPose && pin && shift <= pinSeatRadius + .01 &&
                  Math.abs(offset - Math.round(offset / pinPitch) * pinPitch) < .01)
                const seats = stack.length ? Number(coversPinBore(fit)) + seatedPinNeighbors(assembly, stack, shaft, pose, male) : 0
                // An extra fully seated bore takes precedence over the pin's free roll.
                const score = acceptPose ? shift - (pinSeat ? pinSeatRadius + .01 : 0)
                  : movingShaft ? turn - seats * 2 * Math.PI : reach + partialPinSeat
                if (!best || score <= best.score) {
                  if (!best || score < best.score || (!mode.axialRange && turn < best.turn)) {
                    best = { key, point, distance, fit, pose, shaft, socket, score, turn, pinSeat }
                  }
                }
                if (movingShaft && !acceptPose && !stack.length) break
              }
            }
          }
          if (best) candidates.push(best)
          else if (failure && failure !== 'incompatible-family') candidates.push({ key, point, distance, failure })
        }
      }
    }
  }
  const contacts = new Map()
  for (const candidate of candidates) {
    if (!candidate.fit) continue
    const { position, rotation } = candidate.pose
    // q and -q describe the same orientation. Ignore roundoff between coincident seats.
    const sign = Math.sign(rotation.find(value => Math.abs(value) > 1e-6))
    const poseKey = [...position, ...rotation.map(value => sign * value)].map(value => Math.round(value * 1e4)).join(',')
    if (!contacts.has(poseKey)) contacts.set(poseKey, new Set())
    const ownPort = candidate.shaft.part === moving.id ? candidate.shaft.port : candidate.socket.port
    candidate.contacts = contacts.get(poseKey)
    candidate.contacts.add(ownPort)
  }
  for (const candidate of candidates) {
    // Give depth a vote only within a narrow band around the pointer.
    candidate.depth = ray ? candidate.point.clone().sub(ray.origin).dot(ray.direction) : 0
  }
  candidates.sort((a, b) =>
    Number(Boolean(b.pose)) - Number(Boolean(a.pose)) ||
    Math.floor(a.distance / 2) - Math.floor(b.distance / 2) ||
    Math.floor(a.depth / 2) - Math.floor(b.depth / 2) || (b.contacts?.size ?? 0) - (a.contacts?.size ?? 0) ||
    a.depth - b.depth || a.distance - b.distance || (a.turn ?? 0) - (b.turn ?? 0) || a.key.localeCompare(b.key))
  // Multiple samples of one sliding seat must occupy only one Tab slot.
  const seen = new Set()
  return candidates.filter(candidate => {
    if (seen.has(candidate.key)) return false
    seen.add(candidate.key)
    return true
  })
}

// Placement records are replaced on transform. Cache the world-space connector
// envelope for stationary parts across pointer events.
const envelopes = new WeakMap()
function connectorEnvelope(part) {
  if (envelopes.has(part)) return envelopes.get(part)
  const box = new Box3()
  let margin = 0
  for (const port of portsFor(part.design)) {
    const { start, axis } = worldPort(part, port)
    box.expandByPoint(start)
    for (const offset of port.stroke ?? []) box.expandByPoint(start.clone().addScaledVector(axis, offset))
    box.expandByPoint(start.addScaledVector(axis, portLength(port)))
    if (port.role === 'gear') margin = Math.max(margin, port.sections[0].radius)
  }
  const rack = gearRacks[part.design]
  if (rack) {
    const { start, axis } = worldPort(part, rack)
    box.expandByPoint(start)
    box.expandByPoint(start.addScaledVector(axis, rack.length))
  }
  box.expandByScalar(margin)
  envelopes.set(part, box)
  return box
}

export function translationSnaps(members, parts, assembly, scene, axes, insertionDepth) {
  const ids = new Set(members.map(member => member.id))
  const targets = parts.filter(part => !ids.has(part.id))
  const project = scene.snapProjector?.()
  const options = members.flatMap(member => {
    const envelope = members.length > 1 && connectorEnvelope(member).clone().expandByScalar(12.01)
    const nearby = envelope ? targets.filter(target => envelope.intersectsBox(connectorEnvelope(target))) : targets
    if (!nearby.length) return []

    const ownPorts = portsFor(member.design)
    const points = ownPorts.flatMap(port => {
      const { start, axis } = worldPort(member, port)
      const length = portLength(port)
      const end = start.clone().addScaledVector(axis, length)
      return port.gender === 'F' || port.role === 'selector-spline'
        ? [start, start.clone().addScaledVector(axis, length / 2), end] : [start, end]
    }).map(project ?? scene.project).filter(point => point.visible)
    const snapScene = { pixelDistance(point) {
      if (!project) return Math.min(...points.map(screen => scene.pixelDistance(point, screen)))
      const screen = project(point)
      if (!screen.visible) return Infinity
      let nearest = Infinity
      for (const target of points) {
        const dx = target.clientX - screen.clientX, dy = target.clientY - screen.clientY
        nearest = Math.min(nearest, dx * dx + dy * dy)
      }
      return Math.sqrt(nearest)
    } }
    const acceptPose = pose => {
      const delta = pose.position.map((value, i) => value - member.position[i])
      const aligned = samePose(member, { ...pose, position: member.position }) ||
        members.length === 1 && new Quaternion().fromArray(member.rotation)
          .angleTo(new Quaternion().fromArray(pose.rotation)) <= Math.PI / 24
      return aligned &&
        delta.every((value, i) => axes.includes('XYZ'[i]) || Math.abs(value) < (members.length > 1 ? 3 : .01)) &&
        Math.hypot(...delta) <= 12
    }
    return nearbyConnections({ scene: snapScene, assembly, parts: nearby, translationOnly: members.length > 1,
      moving: member, depth: insertionDepth, roll: 0, acceptPose }).filter(option => option.pose).map(option => {
      const delta = option.pose.position.map((value, i) => value - member.position[i])
      return { ...option, key: JSON.stringify([member.id, option.key]), shift: Math.hypot(...delta),
        pose: { position: members[0].position.map((value, i) => value + delta[i]),
          rotation: members.length === 1 ? option.pose.rotation : members[0].rotation } }
    })
  })
  return options.sort((a, b) => Number(b.pinSeat ?? false) - Number(a.pinSeat ?? false) ||
    a.shift - b.shift || a.distance - b.distance)
}
