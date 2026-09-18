export class SceneMechanicalObserver {
  #registry
  #graph
  #listObjects
  #instances = new Map()
  #syncCount = 0

  constructor({ registry, graph, listObjects = () => [] } = {}) {
    if (!registry?.instantiate) throw new TypeError('Scene observer requires part intelligence registry')
    if (!graph?.upsertBody || !graph?.removeBody) throw new TypeError('Scene observer requires assembly graph')
    this.#registry = registry
    this.#graph = graph
    this.#listObjects = listObjects
  }

  sync(objects = this.#listObjects()) {
    const seen = new Set()
    const added = []
    const updated = []
    const unchanged = []
    const skipped = []

    for (const object of objects || []) {
      const partId = object?.userData?.partId
      const instanceId = object?.userData?.instanceId
      if (!partId || !instanceId) {
        skipped.push({ partId:partId ?? null, instanceId:instanceId ?? null, reason:'identity-missing' })
        continue
      }

      const instance = this.#registry.instantiate(partId, instanceId)
      if (!instance) {
        skipped.push({ partId, instanceId, reason:'descriptor-unavailable' })
        continue
      }

      seen.add(String(instanceId))
      const token = `${instance.descriptor.fingerprint.id}|${instance.endpoints.length}|${instance.descriptor.version}`
      const previous = this.#instances.get(String(instanceId))
      if (previous?.token === token && previous?.bodyId === instance.body.id) {
        unchanged.push(String(instanceId))
        continue
      }

      this.#graph.upsertBody(instance.body)
      this.#instances.set(String(instanceId), Object.freeze({
        instanceId:String(instanceId),
        partId:String(partId),
        bodyId:instance.body.id,
        token,
        value:instance,
      }))
      ;(previous ? updated : added).push(String(instanceId))
    }

    const removed = []
    for (const [instanceId, record] of [...this.#instances]) {
      if (seen.has(instanceId)) continue
      this.#graph.removeBody(record.bodyId)
      this.#instances.delete(instanceId)
      removed.push(instanceId)
    }

    this.#syncCount += 1
    return Object.freeze({
      syncCount:this.#syncCount,
      objects:(objects || []).length,
      activeInstances:this.#instances.size,
      added:Object.freeze(added),
      updated:Object.freeze(updated),
      removed:Object.freeze(removed),
      unchanged:Object.freeze(unchanged),
      skipped:Object.freeze(skipped),
    })
  }

  invalidatePart(partId) {
    const affected = []
    for (const [instanceId, record] of this.#instances) {
      if (record.partId !== String(partId)) continue
      // Keep the old body until the next atomic sync. Clearing the token guarantees
      // that the refreshed descriptor replaces it even if the stable body ID is equal.
      this.#instances.set(instanceId, Object.freeze({ ...record, token:null }))
      affected.push(instanceId)
    }
    return Object.freeze(affected)
  }

  instance(instanceId) {
    return this.#instances.get(String(instanceId || ''))?.value ?? null
  }

  instances() {
    return Object.freeze([...this.#instances.values()].map(record => record.value))
  }

  stats() {
    let endpoints = 0
    const roles = {}
    for (const record of this.#instances.values()) {
      endpoints += record.value.endpoints.length
      const role = record.value.descriptor.classification.role
      roles[role] = (roles[role] || 0) + 1
    }
    return Object.freeze({
      syncCount:this.#syncCount,
      instances:this.#instances.size,
      endpoints,
      roles:Object.freeze({ ...roles }),
    })
  }
}

export function createSceneMechanicalObserver(options) {
  return new SceneMechanicalObserver(options)
}
