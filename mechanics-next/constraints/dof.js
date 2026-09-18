import { CONSTRAINT_KINDS, DOF_KEYS, DOF_STATES, evidence } from '../core/model.js'

const EPS = 1e-9

const cloneEntry = entry => ({
  state:entry?.state || 'free',
  ...(entry?.limits ? { limits:[Number(entry.limits[0]), Number(entry.limits[1])] } : {}),
  ...(Number.isFinite(entry?.value) ? { value:Number(entry.value) } : {}),
  ...(entry?.source ? { source:String(entry.source) } : {}),
})

export function dofEntry(state = 'free', options = {}) {
  if (!DOF_STATES.includes(state)) throw new TypeError(`Unsupported DOF state: ${state}`)
  const result = { state }
  if (state === 'limited') {
    const limits = options.limits
    if (!Array.isArray(limits) || limits.length !== 2 || !limits.every(Number.isFinite) || limits[0] > limits[1]) {
      throw new TypeError('limited DOF requires finite [min,max] limits')
    }
    result.limits = [Number(limits[0]), Number(limits[1])]
  }
  if (state === 'driven') {
    if (!Number.isFinite(options.value)) throw new TypeError('driven DOF requires finite value')
    result.value = Number(options.value)
  }
  if (options.source) result.source = String(options.source)
  return Object.freeze(result)
}

export function freeDof() {
  return Object.fromEntries(DOF_KEYS.map(key => [key, dofEntry('free')]))
}

export function lockedDof() {
  return Object.fromEntries(DOF_KEYS.map(key => [key, dofEntry('locked')]))
}

export function constraintDof(kind = 'fixed') {
  if (!CONSTRAINT_KINDS.includes(kind)) throw new TypeError(`Unknown constraint kind: ${kind}`)
  const dof = lockedDof()
  if (kind === 'revolute') dof.ry = dofEntry('free')
  else if (kind === 'prismatic') dof.ty = dofEntry('free')
  else if (kind === 'cylindrical') {
    dof.ty = dofEntry('free')
    dof.ry = dofEntry('free')
  } else if (kind === 'spherical') {
    dof.rx = dofEntry('free')
    dof.ry = dofEntry('free')
    dof.rz = dofEntry('free')
  } else if (kind === 'planar') {
    dof.tx = dofEntry('free')
    dof.tz = dofEntry('free')
    dof.ry = dofEntry('free')
  } else if (kind === 'custom') {
    for (const key of DOF_KEYS) dof[key] = dofEntry('free')
  }
  return dof
}

function mergeAxis(aRaw, bRaw, key, tolerance) {
  const a = cloneEntry(aRaw)
  const b = cloneEntry(bRaw)

  if (a.state === 'free') return { entry:b }
  if (b.state === 'free') return { entry:a }

  if (a.state === 'locked' && b.state === 'locked') return { entry:a }

  if (a.state === 'locked' || b.state === 'locked') {
    const other = a.state === 'locked' ? b : a
    if (other.state === 'driven' && Math.abs(other.value) > tolerance) {
      return { entry:dofEntry('locked'), conflict:{ key, reason:'locked-vs-driven', a, b } }
    }
    if (other.state === 'limited') {
      const [min, max] = other.limits
      if (0 < min - tolerance || 0 > max + tolerance) {
        return { entry:dofEntry('locked'), conflict:{ key, reason:'locked-outside-limits', a, b } }
      }
    }
    return { entry:dofEntry('locked') }
  }

  if (a.state === 'driven' && b.state === 'driven') {
    if (Math.abs(a.value - b.value) > tolerance) {
      return { entry:a, conflict:{ key, reason:'driver-disagreement', a, b } }
    }
    return { entry:dofEntry('driven', { value:(a.value + b.value) / 2, source:a.source || b.source }) }
  }

  if (a.state === 'driven' || b.state === 'driven') {
    const driven = a.state === 'driven' ? a : b
    const other = a.state === 'driven' ? b : a
    if (other.state === 'limited') {
      const [min, max] = other.limits
      if (driven.value < min - tolerance || driven.value > max + tolerance) {
        return { entry:driven, conflict:{ key, reason:'driver-outside-limits', a, b } }
      }
    }
    return { entry:driven }
  }

  if (a.state === 'limited' && b.state === 'limited') {
    const min = Math.max(a.limits[0], b.limits[0])
    const max = Math.min(a.limits[1], b.limits[1])
    if (min > max + tolerance) {
      return { entry:dofEntry('limited', { limits:[min, min] }), conflict:{ key, reason:'disjoint-limits', a, b } }
    }
    if (Math.abs(max - min) <= tolerance) return { entry:dofEntry('driven', { value:(min + max) / 2 }) }
    return { entry:dofEntry('limited', { limits:[min, max] }) }
  }

  throw new Error(`Unhandled DOF composition for ${a.state} + ${b.state}`)
}

export function composeDof(...inputs) {
  let options = {}
  if (inputs.length && inputs.at(-1)?.__dofOptions === true) options = inputs.pop()
  const tolerance = Number.isFinite(options.tolerance) ? Math.max(EPS, options.tolerance) : EPS
  const result = freeDof()
  const conflicts = []

  for (const input of inputs.filter(Boolean)) {
    for (const key of DOF_KEYS) {
      const merged = mergeAxis(result[key], input[key] || dofEntry('free'), key, tolerance)
      result[key] = merged.entry
      if (merged.conflict) conflicts.push(merged.conflict)
    }
  }

  return Object.freeze({
    dof:Object.freeze(Object.fromEntries(DOF_KEYS.map(key => [key, Object.freeze(cloneEntry(result[key]))]))),
    conflicts:Object.freeze(conflicts.map(Object.freeze)),
    valid:conflicts.length === 0,
  })
}

export function dofOptions(options = {}) {
  return { __dofOptions:true, ...options }
}

export function createConstraint({
  id,
  bodyA,
  bodyB,
  kind = 'fixed',
  dof = constraintDof(kind),
  frameA = null,
  frameB = null,
  metadata = null,
  evidence:constraintEvidence = evidence(),
} = {}) {
  if (!id || !bodyA || !bodyB || bodyA === bodyB) throw new TypeError('Constraint requires two different bodies')
  const normalized = {}
  for (const key of DOF_KEYS) normalized[key] = cloneEntry(dof[key] || dofEntry('locked'))
  return Object.freeze({
    id:String(id),
    kind,
    bodyA:String(bodyA),
    bodyB:String(bodyB),
    dof:Object.freeze(normalized),
    frameA,
    frameB,
    metadata,
    evidence:constraintEvidence,
  })
}

export function isRigidConstraint(constraint) {
  return Boolean(constraint?.dof) && DOF_KEYS.every(key => constraint.dof[key]?.state === 'locked')
}

export function countFreeDof(dof) {
  return DOF_KEYS.reduce((sum, key) => sum + (['free', 'limited'].includes(dof?.[key]?.state) ? 1 : 0), 0)
}
