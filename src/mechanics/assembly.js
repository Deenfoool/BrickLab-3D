import { connectionMode, evaluateInsertion, overlap, portLength } from './axial.js?v=selector-guide'
import { evaluateSpurMesh } from './gears.js'
import { rotationPort } from './catalog.js?v=selector-guide'
import { cross, dot, isVector, length, subtract, unit } from './vector.js?v=connector-coverage'

const LINEAR_TOLERANCE = .01
const AXIS_TOLERANCE = 1e-5

export function measureInsertion(shaft, socket, anchor) {
  if (anchor === 'sphere') {
    return isVector(shaft?.start) && isVector(socket?.start) &&
      length(subtract(shaft.start, socket.start)) <= LINEAR_TOLERANCE ? { offset: 0, direction: 1 } : null
  }
  const a = unit(shaft?.axis)
  const b = unit(socket?.axis)
  if (!a || !b || !isVector(shaft.start) || !isVector(socket.start)) return null
  const alignment = dot(a, b)
  const delta = subtract(shaft.start, socket.start)
  if (1 - Math.abs(alignment) > AXIS_TOLERANCE || length(cross(delta, b)) > LINEAR_TOLERANCE) return null
  return { offset: dot(delta, b), direction: Math.sign(alignment) }
}

const samePort = (a, b) => a.part === b.part && a.port === b.port

export class Assembly {
  #parts = new Map()
  #connections = []

  constructor(catalog) {
    this.catalog = catalog
  }

  addPart(id, design) {
    if (this.#parts.has(id)) throw new Error(`Duplicate part: ${id}`)
    if (!Object.hasOwn(this.catalog, design)) throw new Error(`Unknown design: ${design}`)
    this.#parts.set(id, this.catalog[design])
  }

  port(part, id) {
    return this.#parts.get(part)?.find(port => port.id === id)
  }

  get connections() {
    return structuredClone(this.#connections)
  }

  #occupies(existing, wanted, port) {
    return samePort(existing, wanted) ||
      Boolean(existing.part === wanted.part && port.slot && this.port(existing.part, existing.port)?.slot === port.slot)
  }

  shaftEntryStops(shaft) {
    const port = this.port(shaft.part, shaft.port)
    if (!port) return null
    let stops = null
    for (const link of this.#connections) {
      if (!this.#occupies(link.shaft, shaft, port)) continue
      const [lo, hi] = link.fit.occupancy.shaft
      stops ??= { start: lo, end: hi }
      stops.start = Math.min(stops.start, lo)
      stops.end = Math.max(stops.end, hi)
    }
    return stops
  }

  previewInsertion(shaft, socket, placement, { world, seated = false } = {}) {
    const male = this.port(shaft.part, shaft.port)
    const female = this.port(socket.part, socket.port)
    if (!male || !female || shaft.part === socket.part) return { ok: false, reason: 'invalid-endpoint' }
    if (world) {
      const measured = measureInsertion(world.shaft, world.socket, connectionMode(male, female)?.anchor)
      if (!measured) return { ok: false, reason: 'non-coaxial-ports' }
      if (!Number.isFinite(placement?.offset) || Math.abs(placement.offset - measured.offset) > LINEAR_TOLERANCE ||
          (placement.direction ?? 1) !== measured.direction) {
        return { ok: false, reason: 'placement-pose-mismatch' }
      }
      placement = { ...placement, ...measured }
    }
    const fit = evaluateInsertion(male, female, placement, { seated })
    if (!fit.ok) return fit
    const occupancyTolerance = seated ? LINEAR_TOLERANCE : 1e-6
    const onShaft = this.#connections.filter(link => this.#occupies(link.shaft, shaft, male))
    const socketSpan = portLength(female)
    const [socketLo, socketHi] = fit.occupancy.socket
    const socketSweep = seated ? [socketLo, socketHi]
      : fit.placement.side === 'start' ? [0, socketHi] : [socketLo, socketSpan]
    if (this.#connections.some(link => this.#occupies(link.socket, socket, female) &&
        overlap(link.fit.occupancy.socket, socketSweep) > occupancyTolerance)) {
      return { ok: false, reason: 'socket-occupied' }
    }
    const span = portLength(male)
    const [lo, hi] = fit.occupancy.shaft
    const socketEntersAtShaftEnd = (fit.placement.side === 'start') === (fit.placement.direction > 0)
    // A socket placed past another socket on the shaft cannot pass through it.
    const sweep = seated ? [lo, hi] : socketEntersAtShaftEnd ? [lo, span] : [0, hi]
    if (onShaft.some(link => overlap(link.fit.occupancy.shaft, sweep) > occupancyTolerance)) {
      return { ok: false, reason: seated ? 'shaft-occupied' : 'shaft-path-occupied' }
    }
    return fit
  }

  connect(shaft, socket, placement, options) {
    const fit = this.previewInsertion(shaft, socket, placement, options)
    if (fit.ok) this.#connections.push(structuredClone({ shaft, socket, fit }))
    return fit
  }

  axialTravel(shaft, socket, { coMovingSockets = [] } = {}) {
    const links = this.#connections.filter(link => samePort(link.shaft, shaft))
    const current = links.find(link => samePort(link.socket, socket))
    if (!current) return null
    const { direction } = current.fit.placement
    let [min, max] = current.fit.motion.travel
    const moving = []
    const fixed = []
    for (const link of links) {
      if (link === current || coMovingSockets.some(port => samePort(link.socket, port))) moving.push(link)
      else fixed.push(link)
    }
    for (const link of moving) {
      const [from, to] = link.fit.motion.travel
      const sameDirection = direction === link.fit.placement.direction
      min = Math.max(min, sameDirection ? from : -to)
      max = Math.min(max, sameDirection ? to : -from)
      const [socketLo, socketHi] = link.fit.occupancy.socket
      for (const neighbor of this.#connections) {
        if (neighbor === link || !samePort(neighbor.socket, link.socket)) continue
        const [neighborLo, neighborHi] = neighbor.fit.occupancy.socket
        // In socket coordinates a positive offset advances the shaft toward the high end.
        const minOffset = neighborHi <= socketLo + 1e-6 ? -Math.max(0, socketLo - neighborHi) : -Infinity
        const maxOffset = neighborLo >= socketHi - 1e-6 ? Math.max(0, neighborLo - socketHi) : Infinity
        min = Math.max(min, sameDirection ? minOffset : -maxOffset)
        max = Math.min(max, sameDirection ? maxOffset : -minOffset)
      }
      const [lo, hi] = link.fit.occupancy.shaft
      for (const neighbor of fixed) {
        const [otherLo, otherHi] = neighbor.fit.occupancy.shaft
        // Positive offset moves all selected occupancy intervals toward the
        // start of the shaft when its axis points in the socket direction.
        if (otherHi <= lo + 1e-6) {
          const gap = Math.max(0, lo - otherHi)
          if (direction > 0) max = Math.min(max, gap)
          else min = Math.max(min, -gap)
        }
        if (otherLo >= hi - 1e-6) {
          const gap = Math.max(0, otherLo - hi)
          if (direction > 0) min = Math.max(min, -gap)
          else max = Math.min(max, gap)
        }
      }
    }
    return [min || 0, max || 0]
  }

  rotationFrom(driver, gears = []) {
    if (!this.#parts.has(driver)) throw new Error(`Unknown part: ${driver}`)
    if (gears.some(gear => !this.#parts.has(gear.part))) {
      return { ok: false, reason: 'unknown-gear-part', meshes: [] }
    }
    const neighbors = new Map()
    const link = (a, b, ratio) => {
      if (!neighbors.has(a)) neighbors.set(a, [])
      if (!neighbors.has(b)) neighbors.set(b, [])
      neighbors.get(a).push([b, ratio])
      neighbors.get(b).push([a, 1 / ratio])
    }
    const unsupported = new Set()
    for (const { shaft, socket, fit } of this.#connections) {
      if (fit.motion.rotation !== 'locked') continue
      const shaftPorts = this.#parts.get(shaft.part)
      const socketPorts = this.#parts.get(socket.part)
      const shaftAlignment = measureInsertion(this.port(shaft.part, shaft.port), rotationPort(shaftPorts))
      const socketAlignment = measureInsertion(this.port(socket.part, socket.port), rotationPort(socketPorts))
      if (!shaftAlignment || !socketAlignment) {
        unsupported.add(shaft.part)
        unsupported.add(socket.part)
        continue
      }
      link(shaft.part, socket.part, fit.placement.direction * shaftAlignment.direction * socketAlignment.direction)
    }
    const meshes = []
    for (let i = 0; i < gears.length; i++) {
      for (let j = i + 1; j < gears.length; j++) {
        const a = gears[i]
        const b = gears[j]
        if (a.part === b.part) continue
        const mesh = evaluateSpurMesh(a, b)
        if (!mesh.ok) continue
        link(a.part, b.part, mesh.ratio)
        meshes.push({ a: a.part, b: b.part, ratio: mesh.ratio })
      }
    }
    const ratios = new Map([[driver, 1]])
    const pending = [driver]
    for (let index = 0; index < pending.length; index++) {
      const part = pending[index]
      if (unsupported.has(part)) return { ok: false, reason: 'non-coaxial-shaft', meshes }
      for (const [next, gain] of neighbors.get(part) ?? []) {
        const predicted = ratios.get(part) * gain
        if (!Number.isFinite(predicted) || predicted === 0) return { ok: false, reason: 'ratio-out-of-range', meshes }
        if (!ratios.has(next)) {
          ratios.set(next, predicted)
          pending.push(next)
          continue
        }
        const known = ratios.get(next)
        if (Math.abs(known - predicted) > 1e-8 * Math.max(Math.abs(known), Math.abs(predicted))) {
          return { ok: false, reason: 'inconsistent-transmission', meshes }
        }
      }
    }
    return { ok: true, ratios: Object.fromEntries(ratios), meshes }
  }
}
