import { Vector3 } from 'three'
import { worldPort } from '../editor/placement.js?v=belt-drive'

const halfWidth = .9
const halfDepth = .75
const axle = [0, 0, 1]
// Local axes and contact diameters from LDraw. The original 3713 was also used as a belt drum.
const wedgeWheel = { id: 'rim', start: [0, 0, 0], axis: axle, surface: 27.5, outer: 30, width: 3.25 }
const grooves = {
  '4185': wedgeWheel, '4185a': wedgeWheel, '4185b': { ...wedgeWheel, width: 2.5 },
  '3713': { id: 'rim', start: [0, 0, 0], axis: axle, surface: 7, outer: 9, width: 12 },
}

const hasPose = part => [part.position, part.rotation].every((v, i) =>
  Array.isArray(v) && v.length === 3 + i && v.every(Number.isFinite))

export function grooveOf(part, id = 'rim') {
  const groove = part && Object.hasOwn(grooves, part.design) && grooves[part.design]
  if (!groove || groove.id !== id || !hasPose(part)) return null
  const { start, axis } = worldPort(part, groove)
  return { id, start, axis, radius: groove.surface + halfDepth, outer: groove.outer, width: groove.width }
}

export const grooveKey = endpoint => JSON.stringify([endpoint?.part, endpoint?.groove])

export function beltLayout(a, b) {
  if (!a || !b) return { ok: false, reason: 'groove' }
  const direction = a.axis.dot(b.axis)
  if (Math.abs(direction) < .99999) return { ok: false, reason: 'axes' }
  const delta = b.start.clone().sub(a.start)
  const shift = delta.dot(a.axis)
  const halfA = a.width / 2 - halfWidth
  const halfB = b.width / 2 - halfWidth
  const lo = Math.max(-halfA, shift - halfB)
  const hi = Math.min(halfA, shift + halfB)
  if (lo > hi + .001) return { ok: false, reason: 'plane' }
  const centerA = a.start.clone().addScaledVector(a.axis, (lo + hi) / 2)
  const centerB = b.start.clone().addScaledVector(a.axis, (lo + hi) / 2 - shift)
  const inPlane = centerB.clone().sub(centerA)
  const distance = inPlane.length()
  if (distance < a.outer + b.outer + .05) return { ok: false, reason: 'clearance' }
  const along = inPlane.divideScalar(distance)
  const normal = a.axis
  const across = normal.clone().cross(along)
  const tangent = Math.acos((a.radius - b.radius) / distance)
  const ratio = Math.sign(direction) * a.radius / b.radius
  const length = 2 * distance * Math.sin(tangent) + (2 * Math.PI - 2 * tangent) * a.radius + 2 * tangent * b.radius
  return { ok: true, centerA, centerB, radiusA: a.radius, radiusB: b.radius, along, across, normal,
    ratio, tangent, length, halfWidth, halfDepth }
}

export function assembleBelts(parts, records) {
  const belts = []
  const occupied = new Set()
  const ids = new Set()
  if (!Array.isArray(records)) return belts
  for (const record of records) {
    if (typeof record?.id !== 'string' || !record.id.trim() || ids.has(record.id) ||
        record.a?.part === record.b?.part || typeof record.a?.groove !== 'string' || typeof record.b?.groove !== 'string') continue
    const first = grooveKey(record.a)
    const second = grooveKey(record.b)
    if (occupied.has(first) || occupied.has(second)) continue
    const a = grooveOf(parts.get(record.a.part), record.a.groove)
    const b = grooveOf(parts.get(record.b.part), record.b.groove)
    const layout = beltLayout(a, b)
    if (!layout.ok) continue
    belts.push({ record, layout, a: record.a.part, b: record.b.part,
      lineA: { start: a.start.toArray(), axis: a.axis.toArray() },
      lineB: { start: b.start.toArray(), axis: b.axis.toArray() }, ratio: layout.ratio })
    ids.add(record.id)
    occupied.add(first)
    occupied.add(second)
  }
  return belts
}

// These are local LDCad path circles in the two legacy fallback meshes.
const oldBeltCenters = { '858-belt-1': [0, -80, 0], '858-belt-2': [-60, -32, 0] }

export function promoteLegacyBelts(document) {
  const parts = new Map(document.parts.filter(Boolean).map(part => [part.id, part]))
  const records = Array.isArray(document.belts) ? [...document.belts] : []
  const converted = new Set()
  for (const part of parts.values()) {
    const end = Object.hasOwn(oldBeltCenters, part.design) && oldBeltCenters[part.design]
    if (!end || !hasPose(part)) continue
    const { start, axis } = worldPort(part, { start: [0, 0, 0], axis: axle })
    const destination = worldPort(part, { start: end, axis: axle }).start
    const endpoint = center => {
      const matches = []
      for (const pulley of parts.values()) {
        const groove = grooveOf(pulley)
        if (!groove || Math.abs(groove.axis.dot(axis)) < .99999) continue
        const offset = groove.start.clone().sub(center)
        const depth = offset.dot(axis)
        if (offset.addScaledVector(axis, -depth).length() < .02 && Math.abs(depth) <= groove.width / 2 + .01) {
          matches.push({ part: pulley.id, groove: groove.id })
        }
      }
      return matches.length === 1 ? matches[0] : null
    }
    const first = endpoint(start)
    const second = endpoint(destination)
    if (!first || !second) continue
    const record = { id: 'belt-' + part.id, a: first, b: second, color: part.color }
    if (assembleBelts(parts, [...records, record]).at(-1)?.record !== record) continue
    records.push(record)
    converted.add(part.id)
  }
  return converted.size ? { ...document, parts: document.parts.filter(part => !converted.has(part.id)), belts: records } : document
}

// The outside tangents join the two pulley arcs to make a closed open-belt loop.
export function beltPath(layout) {
  const { centerA, centerB, radiusA, radiusB, along, across, tangent } = layout
  const result = []
  const addArc = (center, radius, from, angle) => {
    const steps = Math.max(12, Math.ceil(angle * 12))
    for (let step = 0; step <= steps; step++) {
      const theta = from + angle * step / steps
      const outward = along.clone().multiplyScalar(Math.cos(theta)).addScaledVector(across, Math.sin(theta))
      result.push({ point: center.clone().addScaledVector(outward, radius), outward })
    }
  }
  addArc(centerA, radiusA, tangent, 2 * Math.PI - 2 * tangent)
  addArc(centerB, radiusB, -tangent, 2 * tangent)
  return result
}

export function beltTravel(belt, spins, angle) {
  const spin = spins?.get(belt.a)
  if (!spin) return 0
  const turns = spin.angleAt ? spin.angleAt(angle) : spin.ratio * angle
  return turns * belt.layout.normal.dot(new Vector3().fromArray(spin.axis)) * belt.layout.radiusA
}
