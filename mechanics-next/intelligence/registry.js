import { deterministicId } from '../core/model.js'
import { createPartMechanicalDescriptor, instantiatePartMechanicalDescriptor } from './part-descriptor.js'

export class PartIntelligenceRegistry {
  #catalog
  #connectivity
  #cache = new Map()
  #hits = 0
  #misses = 0
  #invalidations = 0

  constructor({ catalog, connectivity } = {}) {
    if (!catalog?.get) throw new TypeError('Part intelligence requires catalog provider')
    if (!connectivity?.get || !connectivity?.toEndpoint) {
      throw new TypeError('Part intelligence requires normalized connectivity provider')
    }
    this.#catalog = catalog
    this.#connectivity = connectivity
  }

  describe(partId, { force = false } = {}) {
    const id = String(partId || '')
    if (!id) return null

    if (!force && this.#cache.has(id)) {
      this.#hits += 1
      return this.#cache.get(id)
    }

    const observation = this.#catalog.get(id)
    if (!observation) return null

    const connectivity = this.#connectivity.get(id)
    const templateBodyId = deterministicId('body-template-source', id)
    const rawConnectors = connectivity?.status === 'ready' && Array.isArray(connectivity.connectors)
      ? connectivity.connectors
      : []

    const endpoints = rawConnectors.map(connector =>
      this.#connectivity.toEndpoint(connector, {
        bodyId:templateBodyId,
        partId:id,
      })
    )

    const descriptor = createPartMechanicalDescriptor({ observation, endpoints })
    this.#cache.set(id, descriptor)
    this.#misses += 1
    return descriptor
  }

  instantiate(partId, instanceId, options = {}) {
    const descriptor = this.describe(partId, options)
    if (!descriptor) return null
    return instantiatePartMechanicalDescriptor(descriptor, {
      instanceId,
      metadata:options.metadata,
    })
  }

  invalidate(partId) {
    const removed = this.#cache.delete(String(partId || ''))
    if (removed) this.#invalidations += 1
    return removed
  }

  invalidateAll() {
    const count = this.#cache.size
    this.#cache.clear()
    this.#invalidations += count
    return count
  }

  cached(partId) {
    return this.#cache.get(String(partId || '')) ?? null
  }

  entries() {
    return Object.freeze([...this.#cache.entries()])
  }

  stats() {
    const roles = {}
    let endpointCount = 0
    let unknown = 0
    for (const descriptor of this.#cache.values()) {
      const role = descriptor.classification.role
      roles[role] = (roles[role] || 0) + 1
      endpointCount += descriptor.endpoints.length
      if (role === 'unknown') unknown += 1
    }
    return Object.freeze({
      cachedParts:this.#cache.size,
      endpointCount,
      unknownParts:unknown,
      roles:Object.freeze({ ...roles }),
      hits:this.#hits,
      misses:this.#misses,
      invalidations:this.#invalidations,
    })
  }
}

export function createPartIntelligenceRegistry(options) {
  return new PartIntelligenceRegistry(options)
}
