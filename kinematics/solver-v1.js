export const KINEMATICS_SOLVER_VERSION = 'kinematics-solver-v1.0.0'

const EPS = 1e-5

function finite(value) { return Number.isFinite(Number(value)) }

export function constraintDofCount(constraint) {
  if (!constraint?.dof || typeof constraint.dof !== 'object') return 0
  return Object.values(constraint.dof).reduce((sum, entry) =>
    sum + ((entry?.state === 'free' || entry?.state === 'limited') ? 1 : 0), 0)
}

export function summarizePlanDof(plan) {
  const joints = Array.isArray(plan?.joints) ? plan.joints : []
  const blockers = Array.isArray(plan?.blockers) ? plan.blockers : []
  const byKind = {}
  let total = 0
  for (const joint of joints) {
    const count = constraintDofCount(joint?.constraint)
    total += count
    const kind = joint?.rule?.kind || joint?.constraint?.kindHint || 'fixed'
    byKind[kind] = (byKind[kind] || 0) + count
  }
  return Object.freeze({
    total,
    byKind:Object.freeze({ ...byKind }),
    jointCount:joints.length,
    blockers:blockers.length,
    certified:Boolean(plan?.pass),
  })
}

function meshFactor(mesh, from, to) {
  if (!mesh) return null
  if (mesh.shaftA === from && mesh.shaftB === to && finite(mesh.ratioAB)) return Number(mesh.ratioAB)
  if (mesh.shaftB === from && mesh.shaftA === to && finite(mesh.ratioBA)) return Number(mesh.ratioBA)
  return null
}

export function solveShaftRatios(driverShaftId, meshes = [], { tolerance = EPS } = {}) {
  if (!driverShaftId) return Object.freeze({ ratios:Object.freeze({}), conflicts:Object.freeze([]), ambiguous:Object.freeze([]) })

  const adjacency = new Map()
  const ambiguous = []
  const add = (from, to, factor, mesh) => {
    if (!from || !to || !finite(factor)) return
    const list = adjacency.get(from) ?? []
    list.push({ to, factor:Number(factor), mesh })
    adjacency.set(from, list)
  }

  for (const mesh of meshes ?? []) {
    if (!mesh?.shaftA || !mesh?.shaftB || mesh.shaftA === mesh.shaftB) continue
    if (mesh.kind === 'differential') {
      ambiguous.push(Object.freeze({ meshId:mesh.id ?? null, kind:'differential', shaftA:mesh.shaftA, shaftB:mesh.shaftB }))
      continue
    }
    const ab = meshFactor(mesh, mesh.shaftA, mesh.shaftB)
    const ba = meshFactor(mesh, mesh.shaftB, mesh.shaftA)
    if (ab != null) add(mesh.shaftA, mesh.shaftB, ab, mesh)
    if (ba != null) add(mesh.shaftB, mesh.shaftA, ba, mesh)
  }

  const ratios = new Map([[driverShaftId, 1]])
  const queue = [driverShaftId]
  const conflicts = []
  const seenConflict = new Set()

  while (queue.length) {
    const from = queue.shift()
    const sourceRatio = ratios.get(from)
    for (const edge of adjacency.get(from) ?? []) {
      const expected = sourceRatio * edge.factor
      if (!ratios.has(edge.to)) {
        ratios.set(edge.to, expected)
        queue.push(edge.to)
        continue
      }
      const existing = ratios.get(edge.to)
      const scale = Math.max(1, Math.abs(existing), Math.abs(expected))
      if (Math.abs(existing - expected) <= tolerance * scale) continue
      const key = [from, edge.to, edge.mesh?.id ?? 'mesh'].join('::')
      if (seenConflict.has(key)) continue
      seenConflict.add(key)
      conflicts.push(Object.freeze({
        meshId:edge.mesh?.id ?? null,
        kind:edge.mesh?.kind ?? 'gear',
        from,
        to:edge.to,
        existing,
        expected,
      }))
    }
  }

  return Object.freeze({
    ratios:Object.freeze(Object.fromEntries(ratios)),
    conflicts:Object.freeze(conflicts),
    ambiguous:Object.freeze(ambiguous),
  })
}

export function dynamicJointKind(joint) {
  const kind = joint?.rule?.kind || joint?.constraint?.kindHint || null
  return ['revolute','prismatic','cylindrical'].includes(kind) ? kind : null
}

export function jointControlAxes(joint) {
  const kind = dynamicJointKind(joint)
  if (kind === 'revolute') return Object.freeze({ angle:true, slide:false })
  if (kind === 'prismatic') return Object.freeze({ angle:false, slide:true })
  if (kind === 'cylindrical') return Object.freeze({ angle:true, slide:true })
  return Object.freeze({ angle:false, slide:false })
}
