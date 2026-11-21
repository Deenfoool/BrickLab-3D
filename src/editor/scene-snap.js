import { Quaternion, Vector3 } from 'three'
import { candidateOffsets, joinedPose, retainedPlacement, samePose, worldPort } from './placement.js?v=torque-clutch'
import { connectorEnvelope } from './snap.js?v=torque-clutch'
import { connectAligned, connectPlaced, createAssembly, gearPoses } from './model.js?v=torque-clutch'
import { centeredOffset, connectionMode, portLength } from '../mechanics/axial.js?v=torque-clutch'
import { portsFor } from '../mechanics/catalog.js?v=torque-clutch'
import { evaluateSpurMesh } from '../mechanics/gears.js'
import { movePose } from '../mechanics/linkage.js'

const maxMove = 4
const maxTurn = 8 * Math.PI / 180
const minAlignment = Math.cos(maxTurn)
const nearTie = .15
const vector = value => new Vector3().fromArray(value)
const rotation = value => new Quaternion().fromArray(value).normalize()

function nearbyPairs(parts, margin) {
  const entries = parts.map(part => ({ part, box: connectorEnvelope(part).clone().expandByScalar(margin) }))
    .filter(({ box }) => !box.isEmpty()).sort((a, b) => a.box.min.x - b.box.min.x)
  const pairs = []
  for (let i = 0; i < entries.length; i++) {
    const a = entries[i]
    for (let j = i + 1; j < entries.length && entries[j].box.min.x <= a.box.max.x; j++) {
      const b = entries[j]
      if (a.box.intersectsBox(b.box)) pairs.push([a.part, b.part])
    }
  }
  return pairs
}

function components(parts, fixed) {
  const bodies = new Map(parts.map((part, order) => [part.id, { ids: [part.id], fixed: fixed.has(part.id), order }]))
  const join = (idA, idB) => {
    let a = bodies.get(idA), b = bodies.get(idB)
    if (!a || !b || a === b) return
    if (b.ids.length > a.ids.length) [a, b] = [b, a]
    for (const id of b.ids) bodies.set(id, a)
    a.ids.push(...b.ids)
    a.fixed ||= b.fixed
    a.order = Math.min(a.order, b.order)
  }
  return { bodyOf: id => bodies.get(id), join }
}

function proposedSeats(moving, fixed, assembly, accept) {
  const movers = portsFor(moving.design).filter(port => !port.legacy && port.role !== 'gear')
  const targets = portsFor(fixed.design).filter(port => !port.legacy && port.role !== 'gear')
  const movingPosition = vector(moving.position)
  const movingRotation = rotation(moving.rotation)
  for (const own of movers) {
    const ownWorld = worldPort(moving, own)
    const movingShaft = own.gender === 'M'
    for (const target of targets) {
      const male = movingShaft ? own : target
      const female = movingShaft ? target : own
      const mode = connectionMode(male, female)
      // Selector contacts change with the mechanism's state, not with assembly pose.
      if (!mode || own.shift !== undefined || target.shift !== undefined) continue
      const targetWorld = worldPort(fixed, target)
      const shaftWorld = movingShaft ? ownWorld : targetWorld
      const socketWorld = movingShaft ? targetWorld : ownWorld
      const alignment = shaftWorld.axis.dot(socketWorld.axis)
      const sphere = mode.anchor === 'sphere'
      if (!sphere && Math.abs(alignment) < minAlignment) continue
      const direction = sphere ? 1 : Math.sign(alignment)
      const delta = shaftWorld.start.clone().sub(socketWorld.start)
      const projected = sphere ? 0 : delta.dot(socketWorld.axis)
      const lateral = sphere ? delta.length() : delta.addScaledVector(socketWorld.axis, -projected).length()
      const reach = ownWorld.start.distanceTo(movingPosition) + (movingShaft ? 0 : Math.abs(projected))
      if (lateral > maxMove + reach * Math.sin(maxTurn)) continue
      const shaftLength = portLength(male), socketLength = portLength(female)
      if (!mode.anchor && !mode.rimSeat &&
          (projected + Math.max(0, direction * shaftLength) < -maxMove ||
           projected + Math.min(0, direction * shaftLength) > socketLength + maxMove)) continue

      const shaftPart = movingShaft ? moving : fixed
      const socketPart = movingShaft ? fixed : moving
      const shaft = { part: shaftPart.id, port: male.id }
      const socket = { part: socketPart.id, port: female.id }
      const aligned = { ...moving, ...joinedPose(moving, own, fixed, target, {
        offset: projected, direction, roll: 0, anchor: mode.anchor,
      }) }
      const roll = (movingShaft
        ? retainedPlacement(aligned, male, fixed, female)
        : retainedPlacement(fixed, male, aligned, female))?.placement.roll ?? 0

      for (const side of female.openings) {
        const depth = mode.axialRange ? projected - centeredOffset(male, female, direction)
          : mode.anchor === 'slide' ? projected - mode.stroke[1] : 0
        const offsets = new Set([projected, ...candidateOffsets(male, female, direction, side, depth)])
        for (const offset of offsets) {
          if (Math.abs(offset - projected) > maxMove + reach * Math.sin(maxTurn)) continue
          const fit = assembly.previewInsertion(shaft, socket, { offset, direction, side, roll }, { seated: true })
          if (!fit.ok) continue
          const { placement } = fit
          const pose = {
            ...moving,
            ...joinedPose(moving, own, fixed, target, {
              ...placement, roll: placement.keyStep || placement.detents?.length ? placement.roll : 0,
            }),
          }
          const shift = movingPosition.distanceTo(vector(pose.position))
          const turn = movingRotation.angleTo(rotation(pose.rotation))
          if (shift > maxMove || turn > maxTurn || samePose(moving, pose)) continue
          accept({ moving, fixed, pose, link: { shaft, socket, placement }, score: shift + turn * maxMove / maxTurn })
        }
      }
    }
  }
}

function sameAdjustment(a, b) {
  return vector(a.position).distanceTo(vector(b.position)) < .025 &&
    rotation(a.rotation).angleTo(rotation(b.rotation)) < Math.PI / 1800
}

export function snapScene(parts, links, { belts = [], hidden = new Set(), fixed = new Set() } = {}) {
  const original = new Map(parts.map(part => [part.id, part]))
  const current = new Map(original)
  const assembly = createAssembly(parts, links, { belts })
  const nextLinks = [...links]
  const { bodyOf, join } = components(parts, new Set([...fixed, ...hidden]))
  for (const { shaft, socket } of links) join(shaft.part, socket.part)
  for (const { a, b } of assembly.belts) join(a, b)
  const visible = () => [...current.values()].filter(part => !hidden.has(part.id))

  // Retain existing gear meshes as well as saved connector and belt links.
  const gears = new Map(gearPoses(parts).map(gear => [gear.part, gear]))
  for (const [a, b] of nearbyPairs(parts.filter(part => gears.has(part.id)), 1)) {
    if (evaluateSpurMesh(gears.get(a.id), gears.get(b.id)).ok) join(a.id, b.id)
  }

  function attachAligned() {
    for (const [a, b] of nearbyPairs(visible(), .015)) {
      for (const link of connectAligned(assembly, [a], [b])) {
        nextLinks.push(link)
        join(a.id, b.id)
      }
    }
  }

  attachAligned()
  for (;;) {
    const choices = new Map()
    for (const [a, b] of nearbyPairs(visible(), maxMove)) {
      const bodyA = bodyOf(a.id), bodyB = bodyOf(b.id)
      if (bodyA === bodyB || (bodyA.fixed && bodyB.fixed)) continue
      const moveSecond = bodyA.fixed || (!bodyB.fixed && (bodyA.ids.length > bodyB.ids.length ||
        (bodyA.ids.length === bodyB.ids.length && bodyA.order < bodyB.order)))
      const moving = moveSecond ? b : a
      const stationary = moveSecond ? a : b
      const mover = moveSecond ? bodyB : bodyA
      proposedSeats(moving, stationary, assembly, proposal => {
        const options = choices.get(mover) ?? []
        if (options.length && proposal.score > options[0].score + nearTie) return
        const turn = rotation(proposal.pose.rotation).multiply(rotation(moving.rotation).invert())
        const translation = vector(proposal.pose.position).sub(vector(moving.position).applyQuaternion(turn))
        const transform = { rotation: turn, translation }
        const poses = mover.ids.map(id => movePose(current.get(id), transform))
        if (poses.some(pose => {
          const start = original.get(pose.id)
          return vector(pose.position).distanceTo(vector(start.position)) > maxMove ||
            rotation(pose.rotation).angleTo(rotation(start.rotation)) > maxTurn
        })) return
        const duplicate = options.findIndex(option => sameAdjustment(option.poses[0], poses[0]))
        if (duplicate >= 0) {
          if (options[duplicate].score <= proposal.score) return
          options.splice(duplicate, 1)
        }
        options.push({ ...proposal, poses, mover, size: mover.ids.length })
        options.sort((a, b) => a.score - b.score)
        while (options.at(-1).score > options[0].score + nearTie) options.pop()
        choices.set(mover, options)
      })
    }

    const clear = [...choices.values()].filter(options => options.length === 1)
      .map(([proposal]) => proposal).sort((a, b) => a.score - b.score)
    let changed = false
    for (const { moving, fixed: stationary, mover, size, pose, poses, link } of clear) {
      if (current.get(moving.id) !== moving || current.get(stationary.id) !== stationary ||
          bodyOf(moving.id) !== mover || mover.ids.length !== size || mover === bodyOf(stationary.id)) continue
      const a = link.shaft.part === moving.id ? pose : stationary
      const b = link.socket.part === moving.id ? pose : stationary
      const fit = connectPlaced(assembly, a, b, link)
      if (!fit.ok) continue
      for (const member of poses) current.set(member.id, member)
      nextLinks.push({ ...link, placement: fit.placement })
      join(moving.id, stationary.id)
      changed = true
    }
    if (!changed) break
    attachAligned()
  }

  const nextParts = parts.map(part => {
    const pose = current.get(part.id)
    return samePose(part, pose) ? part : pose
  })
  return { parts: nextParts, links: nextLinks, added: nextLinks.length - links.length,
    adjusted: nextParts.filter((part, index) => part !== parts[index]).length }
}
