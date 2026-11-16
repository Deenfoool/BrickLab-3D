import { Quaternion, Vector3 } from 'three'
import { Assembly } from '../mechanics/assembly.js'
import { gearAt, technic } from '../mechanics/catalog.js'
import { baseRotation, joinedPose, worldPort } from './placement.js'

const valid = (value, size) => Array.isArray(value) && value.length === size && value.every(Number.isFinite)
export const snapGrid = 10

export function loadParts(document, models) {
  const records = []
  const seen = new Set()
  for (const [index, entry] of document.parts.entries()) {
    const design = String(entry?.design ?? '')
    if (!models.has(design) || typeof entry.id !== 'string' || seen.has(entry.id)) continue
    seen.add(entry.id)
    const old = !valid(entry.position, 3)
    const q = valid(entry.rotation, 4) && entry.rotation.some(Boolean) ? new Quaternion().fromArray(entry.rotation).normalize().toArray() : baseRotation
    const defaultY = models.get(design).bounds.max.y
    records.push({ ...entry, design, position: old ? [index * 45, defaultY, 0] : entry.position, rotation: q })
  }
  if (records.length === 6 && records.every(part => !document.parts.find(entry => entry?.id === part.id)?.position) &&
      ['drive', 'driven', 'bearing', 'bush', 'gear8', 'gear24'].every(id => seen.has(id))) {
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
        if (!male || !female || !Number.isFinite(placement?.offset)) continue
        const roll = placement.roll ?? 0
        Object.assign(b, joinedPose(b, female, a, male, { direction: 1, ...placement, roll, keyStep: female.role === 'bearing' ? null : Math.PI / 2 }))
      }
    }
  }
  return records
}

export function createAssembly(parts, links) {
  const assembly = new Assembly(technic)
  for (const part of parts) assembly.addPart(part.id, part.design)
  for (const link of links) {
    if (link?.shaft && link?.socket && link.placement) {
      assembly.connect(link.shaft, link.socket, link.placement)
    }
  }
  return assembly
}

export function gearPoses(parts) {
  return parts.flatMap(part => {
    const ports = technic[part.design]
    const gear = ports.find(port => port.role === 'gear')
    if (!gear) return []
    const { start, axis } = worldPort(part, gear)
    const center = start.addScaledVector(axis, gear.sections[0].length / 2).toArray()
    return [gearAt(part.id, part.design, center, worldPort(part, ports[0]).axis.toArray())]
  })
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
