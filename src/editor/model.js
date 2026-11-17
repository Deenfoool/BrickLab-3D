import { Quaternion, Vector3 } from 'three'
import { connectionMode } from '../mechanics/axial.js?v=8845'
import { Assembly } from '../mechanics/assembly.js?v=8845'
import { gearAt, portsFor, rotationPort, technic } from '../mechanics/catalog.js?v=8845'
import { baseRotation, joinedPose, retainedPlacement, worldPort } from './placement.js?v=8845'

const valid = (value, size) => Array.isArray(value) && value.length === size && value.every(Number.isFinite)
export const snapGrid = 10

export function loadParts(document, models) {
  const records = []
  const seen = new Set()
  const reserved = new Set(document.parts.map(entry => entry?.id).filter(id => typeof id === 'string' && id.trim()))
  for (const [index, entry] of document.parts.entries()) {
    const design = String(entry?.design ?? '')
    if (!models.has(design)) continue
    let id = entry.id
    if (typeof id !== 'string' || !id.trim() || seen.has(id)) {
      id = `imported-part-${index + 1}`
      while (reserved.has(id) || seen.has(id)) id += '-'
    }
    seen.add(id)
    const old = !valid(entry.position, 3)
    const q = valid(entry.rotation, 4) && entry.rotation.some(Boolean) ? new Quaternion().fromArray(entry.rotation).normalize().toArray() : baseRotation
    const defaultY = models.get(design).bounds.max.y
    records.push({ ...entry, id, design, position: old ? [index * 45, defaultY, 0] : entry.position, rotation: q })
  }
  const exampleIds = ['drive', 'driven', 'bearing', 'bush', 'gear8', 'gear24']
  if (exampleIds.every(id => seen.has(id) && !valid(document.parts.find(entry => entry?.id === id)?.position, 3))) {
    const byId = new Map(records.map(part => [part.id, part]))
    if (byId.get('drive').design === '3737' && byId.get('driven').design === '3705') {
      byId.get('drive').position = [40, 34, -20]
      byId.get('driven').position = [0, 34, 20]
      for (const link of document.connections) {
        if (!link) continue
        const { shaft, socket, placement } = link
        const a = byId.get(shaft?.part)
        const b = byId.get(socket?.part)
        const male = technic[a?.design]?.find(port => port.id === shaft?.port)
        const female = technic[b?.design]?.find(port => port.id === socket?.port)
        if (!exampleIds.includes(a?.id) || !exampleIds.includes(b?.id) || !male || !female || !Number.isFinite(placement?.offset)) continue
        const roll = placement.roll ?? 0
        Object.assign(b, joinedPose(b, female, a, male, { direction: 1, ...placement, roll, keyStep: female.role === 'bearing' ? null : Math.PI / 2 }))
      }
    }
  }
  return records
}

export function createAssembly(parts, links) {
  const catalog = Object.create(null)
  const assembly = new Assembly(catalog)
  const byId = new Map(parts.map(part => [part.id, part]))
  for (const part of parts) {
    const ports = portsFor(part.design)
    if (!ports.length) continue
    catalog[part.design] = ports
    assembly.addPart(part.id, part.design)
  }
  for (const link of links) {
    const a = byId.get(link?.shaft?.part)
    const b = byId.get(link?.socket?.part)
    if (a && b && link.placement) connectPlaced(assembly, a, b, link, true)
  }
  return assembly
}

export function connectPlaced(assembly, a, b, { shaft, socket, placement }, checkSaved = false) {
  const male = assembly.port(a.id, shaft.port)
  const female = assembly.port(b.id, socket.port)
  if (!male || !female) return { ok: false, reason: 'invalid-endpoint' }
  const measured = retainedPlacement(a, male, b, female, placement)
  if (!measured) return { ok: false, reason: 'non-coaxial-ports' }
  const options = { world: measured.world, seated: true }
  if (checkSaved && (!Number.isFinite(placement.offset) ||
      Math.abs(placement.offset - measured.placement.offset) > .01 ||
      (placement.direction ?? 1) !== measured.placement.direction)) {
    return { ok: false, reason: 'placement-pose-mismatch' }
  }
  const sides = [...new Set([placement?.side, ...female.openings])].filter(Boolean)
  let failure
  for (const side of sides) {
    const entry = { ...measured.placement, side }
    const fit = assembly.previewInsertion(shaft, socket, entry, options)
    if (!fit.ok) {
      failure ??= fit
      continue
    }
    if ((fit.placement.keyStep || fit.motion.detents.length) &&
        Math.abs(Math.sin((fit.placement.roll - measured.placement.roll) / 2)) > .001) {
      return { ok: false, reason: 'invalid-rotation' }
    }
    return assembly.connect(shaft, socket, fit.placement, options)
  }
  return failure ?? { ok: false, reason: 'closed-entry' }
}

export function connectAligned(assembly, changed, fixed) {
  const added = []
  for (const a of changed) {
    for (const b of fixed) {
      for (const portA of portsFor(a.design)) {
        for (const portB of portsFor(b.design)) {
          if (portA.legacy || portB.legacy) continue
          const movingShaft = portA.gender === 'M'
          const male = movingShaft ? portA : portB
          const female = movingShaft ? portB : portA
          if (!connectionMode(male, female)) continue
          const shaftPart = movingShaft ? a : b
          const socketPart = movingShaft ? b : a
          const shaft = { part: shaftPart.id, port: male.id }
          const socket = { part: socketPart.id, port: female.id }
          const fit = connectPlaced(assembly, shaftPart, socketPart, { shaft, socket })
          if (fit.ok) added.push({ shaft, socket, placement: fit.placement })
        }
      }
    }
  }
  return added
}

export function partRotationPort(part) {
  return rotationPort(portsFor(part.design))
}

export function gearPoses(parts) {
  return parts.flatMap(part => {
    const ports = portsFor(part.design)
    const gear = ports.find(port => port.role === 'gear')
    if (!gear) return []
    const { start, axis } = worldPort(part, gear)
    const center = start.addScaledVector(axis, gear.sections[0].length / 2).toArray()
    return [gearAt(part.id, part.design, center, worldPort(part, partRotationPort(part)).axis.toArray())]
  })
}

export function hingeMotion(selected, parts, links) {
  const joint = links.find(({ shaft, socket, fit }) =>
    fit.motion.detents.length && (shaft.part === selected || socket.part === selected))
  if (!joint) return undefined
  const movingShaft = joint.shaft.part === selected
  const other = movingShaft ? joint.socket.part : joint.shaft.part
  const neighbors = new Map()
  for (const link of links) {
    if (link === joint) continue
    for (const [a, b] of [[link.shaft.part, link.socket.part], [link.socket.part, link.shaft.part]]) {
      if (!neighbors.has(a)) neighbors.set(a, [])
      neighbors.get(a).push(b)
    }
  }
  const moving = new Set([selected])
  const pending = [selected]
  for (let index = 0; index < pending.length; index++) {
    for (const id of neighbors.get(pending[index]) ?? []) {
      if (moving.has(id)) continue
      moving.add(id)
      pending.push(id)
    }
  }
  if (moving.has(other)) return { ok: false }
  const socket = parts.find(part => part.id === joint.socket.part)
  const port = portsFor(socket.design).find(port => port.id === joint.socket.port)
  const { start, axis } = worldPort(socket, port)
  return { ok: true, moving, axis, start, sign: movingShaft ? 1 : -1, roll: joint.fit.placement.roll,
    detents: [...joint.fit.motion.detents].sort((a, b) => a - b) }
}

export function hingePoses(parts, hinge, angle) {
  const spin = new Quaternion().setFromAxisAngle(hinge.axis, hinge.sign * (angle - hinge.roll))
  return parts.map(part => hinge.moving.has(part.id) ? {
    ...part,
    position: new Vector3().fromArray(part.position).sub(hinge.start).applyQuaternion(spin).add(hinge.start).toArray(),
    rotation: new Quaternion().fromArray(part.rotation).premultiply(spin).toArray(),
  } : part)
}

export function raisedPose(part, model, point) {
  const matrix = new Quaternion().fromArray(part.rotation)
  const bounds = model.bounds
  let min = Infinity
  for (const x of [bounds.min.x, bounds.max.x]) {
    for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) {
        min = Math.min(min, new Vector3(x, y, z).applyQuaternion(matrix).y)
      }
    }
  }
  const grid = v => Math.round(v / snapGrid) * snapGrid
  return { ...part, position: [grid(point.x), -min, grid(point.z)] }
}
