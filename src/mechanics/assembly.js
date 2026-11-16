import { evaluateInsertion, overlap, portLength } from './axial.js'
import { evaluateSpurMesh } from './gears.js'
import { dot } from './vector.js'

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

  previewInsertion(shaft, socket, placement) {
    const male = this.port(shaft.part, shaft.port)
    const female = this.port(socket.part, socket.port)
    if (!male || !female || shaft.part === socket.part) return { ok: false, reason: 'invalid-endpoint' }
    const fit = evaluateInsertion(male, female, placement)
    if (!fit.ok) return fit
    const onShaft = this.#connections.filter(link => samePort(link.shaft, shaft))
    if (this.#connections.some(link => samePort(link.socket, socket))) {
      return { ok: false, reason: 'socket-occupied' }
    }
    const span = portLength(male)
    const [lo, hi] = fit.occupancy.shaft
    const socketEntersAtShaftEnd = (fit.placement.side === 'start') === (fit.placement.direction > 0)
    // A socket placed past another socket on the shaft cannot pass through it.
    const sweep = socketEntersAtShaftEnd ? [lo, span] : [0, hi]
    if (onShaft.some(link => overlap(link.fit.occupancy.shaft, sweep) > 1e-6)) {
      return { ok: false, reason: 'shaft-path-occupied' }
    }
    return fit
  }

  connect(shaft, socket, placement) {
    const fit = this.previewInsertion(shaft, socket, placement)
    if (fit.ok) this.#connections.push(structuredClone({ shaft, socket, fit }))
    return fit
  }

  axialTravel(shaft, socket) {
    const links = this.#connections.filter(link => samePort(link.shaft, shaft))
    const current = links.find(link => samePort(link.socket, socket))
    if (!current) return null
    const [lo, hi] = current.fit.occupancy.shaft
    const { direction } = current.fit.placement
    let [min, max] = current.fit.motion.travel
    for (const link of links) {
      if (link === current || link.fit.motion.travel.some(distance => distance !== 0)) continue
      const [otherLo, otherHi] = link.fit.occupancy.shaft
      if (otherHi <= lo + 1e-6) {
        const distance = Math.max(0, lo - otherHi)
        if (direction > 0) max = Math.min(max, distance)
        else min = Math.max(min, distance === 0 ? 0 : -distance)
      }
      if (otherLo >= hi - 1e-6) {
        const distance = Math.max(0, otherLo - hi)
        if (direction > 0) min = Math.max(min, distance === 0 ? 0 : -distance)
        else max = Math.min(max, distance)
      }
    }
    return [min, max]
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
    for (const { shaft, socket, fit } of this.#connections) {
      if (fit.motion.rotation !== 'locked') continue
      const shaftPorts = this.#parts.get(shaft.part)
      const socketPorts = this.#parts.get(socket.part)
      const shaftAlignment = dot(shaftPorts[0].axis, this.port(shaft.part, shaft.port).axis)
      const socketAlignment = dot(socketPorts[0].axis, this.port(socket.part, socket.port).axis)
      if (Math.abs(shaftAlignment) < 0.999 || Math.abs(socketAlignment) < 0.999) {
        return { ok: false, reason: 'non-coaxial-shaft', meshes: [] }
      }
      link(shaft.part, socket.part, fit.placement.direction * Math.sign(shaftAlignment * socketAlignment))
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
    for (const [part, ratio] of ratios) {
      for (const [next, gain] of neighbors.get(part) ?? []) {
        const predicted = ratio * gain
        if (!ratios.has(next)) {
          ratios.set(next, predicted)
        } else if (Math.abs(ratios.get(next) - predicted) > 1e-8 * Math.max(1, Math.abs(predicted))) {
          return { ok: false, reason: 'inconsistent-transmission', meshes }
        }
      }
    }
    return { ok: true, ratios: Object.fromEntries(ratios), meshes }
  }
}
