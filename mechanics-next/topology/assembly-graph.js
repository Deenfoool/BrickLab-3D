import { EDGE_KINDS, cloneMechanical } from '../core/model.js'
import { solveBodyPairConstraintBundles } from '../constraints/bundle-solver.js'

class DisjointSet {
  constructor(values) {
    this.parent = new Map(values.map(value => [value, value]))
    this.rank = new Map(values.map(value => [value, 0]))
  }
  find(value) {
    const parent = this.parent.get(value)
    if (parent == null) return null
    if (parent !== value) this.parent.set(value, this.find(parent))
    return this.parent.get(value)
  }
  union(a, b) {
    let rootA = this.find(a)
    let rootB = this.find(b)
    if (rootA == null || rootB == null || rootA === rootB) return
    const rankA = this.rank.get(rootA)
    const rankB = this.rank.get(rootB)
    if (rankA < rankB) [rootA, rootB] = [rootB, rootA]
    this.parent.set(rootB, rootA)
    if (rankA === rankB) this.rank.set(rootA, rankA + 1)
  }
}

export class AssemblyGraph {
  #bodies = new Map()
  #edges = new Map()
  #adjacency = new Map()
  #dirty = new Set()
  #revision = 0

  get revision() { return this.#revision }
  get size() { return this.#bodies.size }

  addBody(body) {
    if (!body?.id) throw new TypeError('Body requires id')
    if (this.#bodies.has(body.id)) throw new Error(`Duplicate body: ${body.id}`)
    this.#bodies.set(body.id, body)
    this.#adjacency.set(body.id, new Set())
    this.#markDirty(body.id)
    return body
  }

  upsertBody(body) {
    if (!body?.id) throw new TypeError('Body requires id')
    const existed = this.#bodies.has(body.id)
    this.#bodies.set(body.id, body)
    if (!this.#adjacency.has(body.id)) this.#adjacency.set(body.id, new Set())
    this.#markDirty(body.id)
    return { body, replaced:existed }
  }

  removeBody(bodyId) {
    if (!this.#bodies.has(bodyId)) return false
    for (const edgeId of [...(this.#adjacency.get(bodyId) || [])]) this.removeEdge(edgeId)
    this.#adjacency.delete(bodyId)
    this.#bodies.delete(bodyId)
    this.#markDirty(bodyId)
    return true
  }

  addEdge(edge) {
    if (!edge?.id || !EDGE_KINDS.includes(edge.kind)) throw new TypeError('Edge requires valid id and kind')
    if (this.#edges.has(edge.id)) throw new Error(`Duplicate edge: ${edge.id}`)
    const bodies = this.#edgeBodies(edge)
    if (bodies.length < 2 || bodies.some(bodyId => !this.#bodies.has(bodyId))) {
      throw new Error(`Edge ${edge.id} references missing bodies`)
    }
    this.#edges.set(edge.id, edge)
    for (const bodyId of bodies) this.#adjacency.get(bodyId).add(edge.id)
    for (const bodyId of bodies) this.#markDirty(bodyId)
    return edge
  }

  addConstraint(constraint) {
    return this.addEdge({ ...constraint, kind:'constraint', constraintKind:constraint.kind })
  }

  addTransmission(transmission) {
    return this.addEdge({ ...transmission, kind:'transmission', transmissionKind:transmission.kind })
  }

  addContact(contact) {
    return this.addEdge({ ...contact, kind:'contact' })
  }

  removeEdge(edgeId) {
    const edge = this.#edges.get(edgeId)
    if (!edge) return false
    const bodies = this.#edgeBodies(edge)
    this.#edges.delete(edgeId)
    for (const bodyId of bodies) this.#adjacency.get(bodyId)?.delete(edgeId)
    for (const bodyId of bodies) this.#markDirty(bodyId)
    return true
  }

  body(bodyId) { return this.#bodies.get(bodyId) ?? null }
  edge(edgeId) { return this.#edges.get(edgeId) ?? null }
  bodies() { return [...this.#bodies.values()] }
  edges(kind = null) {
    const all = [...this.#edges.values()]
    return kind == null ? all : all.filter(edge => edge.kind === kind)
  }

  neighbors(bodyId, { kind = null } = {}) {
    const result = []
    for (const edgeId of this.#adjacency.get(bodyId) || []) {
      const edge = this.#edges.get(edgeId)
      if (!edge || (kind && edge.kind !== kind)) continue
      for (const other of this.#edgeBodies(edge)) {
        if (other !== bodyId) result.push({ bodyId:other, edge })
      }
    }
    return result
  }

  component(startBodyId, { edgeKinds = EDGE_KINDS } = {}) {
    if (!this.#bodies.has(startBodyId)) return Object.freeze([])
    const allowed = new Set(edgeKinds)
    const seen = new Set([startBodyId])
    const queue = [startBodyId]
    while (queue.length) {
      const current = queue.shift()
      for (const { bodyId, edge } of this.neighbors(current)) {
        if (!allowed.has(edge.kind) || seen.has(bodyId)) continue
        seen.add(bodyId)
        queue.push(bodyId)
      }
    }
    return Object.freeze([...seen].sort())
  }

  rigidIslands() {
    const bodyIds = [...this.#bodies.keys()]
    const sets = new DisjointSet(bodyIds)
    const constraints = [...this.#edges.values()].filter(edge => edge.kind === 'constraint')

    // Rigidity is solved from the whole contact bundle between two bodies. Two
    // individually revolute pins/studs on distinct axes can therefore eliminate all
    // relative motion without either contact being mislabeled as "fixed".
    for (const bundle of solveBodyPairConstraintBundles(constraints)) {
      if (!bundle.solution.rigid) continue
      sets.union(bundle.bodyIds[0], bundle.bodyIds[1])
    }

    const grouped = new Map()
    for (const bodyId of bodyIds) {
      const root = sets.find(bodyId)
      const list = grouped.get(root) || []
      list.push(bodyId)
      grouped.set(root, list)
    }

    return Object.freeze([...grouped.values()]
      .map(bodies => Object.freeze(bodies.sort()))
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))))
  }

  consumeDirty() {
    const dirty = Object.freeze([...this.#dirty].sort())
    this.#dirty.clear()
    return dirty
  }

  snapshot() {
    return Object.freeze({
      revision:this.#revision,
      bodies:Object.freeze(this.bodies().map(cloneMechanical)),
      edges:Object.freeze(this.edges().map(cloneMechanical)),
      rigidIslands:this.rigidIslands(),
    })
  }

  #edgeBodies(edge) {
    if (Array.isArray(edge?.bodies)) return [...new Set(edge.bodies.map(String))]
    return [...new Set([edge?.bodyA, edge?.bodyB].filter(Boolean).map(String))]
  }

  #markDirty(bodyId) {
    this.#dirty.add(String(bodyId))
    this.#revision += 1
  }
}

export function createAssemblyGraph() {
  return new AssemblyGraph()
}
