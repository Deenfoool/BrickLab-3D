export const CONSTRAINT_SCHEMA_VERSION_V4 = 4
export const CONSTRAINT_SYSTEM_VERSION_V4 = 'constraint-system-v4.0.0'

export const DOF_KEYS_V4 = Object.freeze(['tx', 'ty', 'tz', 'rx', 'ry', 'rz'])
export const DOF_STATES_V4 = Object.freeze(['locked', 'free', 'limited'])

const LOCKED = Object.freeze({ state: 'locked' })
const FREE = Object.freeze({ state: 'free' })

function axisEntry(state = 'locked', limits = null) {
  if (!DOF_STATES_V4.includes(state)) throw new TypeError(`Unsupported DOF state: ${state}`)
  if (state !== 'limited') return { state }
  if (!Array.isArray(limits) || limits.length !== 2 || !limits.every(Number.isFinite) || limits[0] > limits[1]) throw new TypeError('limited DOF requires finite [min,max] limits')
  return { state, limits: [...limits] }
}

export function constraintTemplateV4(kind = 'fixed') {
  const dof = Object.fromEntries(DOF_KEYS_V4.map(key => [key, { ...LOCKED }]))
  if (kind === 'revolute') dof.ry = { ...FREE }
  else if (kind === 'prismatic') dof.ty = { ...FREE }
  else if (kind === 'cylindrical') { dof.ty = { ...FREE }; dof.ry = { ...FREE } }
  else if (kind === 'spherical') { dof.rx = { ...FREE }; dof.ry = { ...FREE }; dof.rz = { ...FREE } }
  else if (kind !== 'fixed') throw new TypeError(`Unknown constraint template: ${kind}`)
  return dof
}

export function validateConstraintV4(constraint) {
  const errors = []
  if (!constraint || typeof constraint !== 'object') return { valid:false, errors:['constraint must be an object'] }
  if (constraint.schemaVersion !== CONSTRAINT_SCHEMA_VERSION_V4) errors.push('schemaVersion must be 4')
  if (!constraint.dof || typeof constraint.dof !== 'object') errors.push('dof is required')
  else {
    for (const key of DOF_KEYS_V4) {
      const entry = constraint.dof[key]
      if (!entry || !DOF_STATES_V4.includes(entry.state)) { errors.push(`${key} has invalid state`); continue }
      if (entry.state === 'limited') {
        if (!Array.isArray(entry.limits) || entry.limits.length !== 2 || !entry.limits.every(Number.isFinite) || entry.limits[0] > entry.limits[1]) errors.push(`${key} has invalid limits`)
      }
    }
  }
  if (constraint.physicsReady === true) {
    if (!constraint.evidence?.source) errors.push('physicsReady requires evidence.source')
    if (constraint.status !== 'approved') errors.push('physicsReady requires approved status')
  }
  return { valid:errors.length===0, errors }
}

export function proposeConstraintV4(match) {
  if (!match?.compatible) return null
  const hint = ['fixed','revolute','prismatic','cylindrical','spherical'].includes(match.kinematicHint) ? match.kinematicHint : null
  return {
    schemaVersion: CONSTRAINT_SCHEMA_VERSION_V4,
    systemVersion: CONSTRAINT_SYSTEM_VERSION_V4,
    status: 'candidate',
    kindHint: hint,
    frameConvention: 'connector-local-negative-Y-axis',
    dof: hint ? constraintTemplateV4(hint) : constraintTemplateV4('fixed'),
    physicsReady: false,
    evidence: {
      source: 'connector-v4-geometry-match',
      strength: 'editor-hint-only',
      reason: match.reason || null,
    },
    unresolved: [
      'retention',
      'friction',
      'axial-limits',
      'angular-limits',
      'collision-clearance',
    ],
  }
}

export function approveConstraintV4(candidate, { source, kind = candidate?.kindHint, dof = null, friction = null, retention = null, notes = null } = {}) {
  if (!candidate || candidate.schemaVersion !== CONSTRAINT_SCHEMA_VERSION_V4) throw new TypeError('A V4 constraint candidate is required')
  if (!source || typeof source !== 'string') throw new TypeError('Explicit evidence source is required before physics approval')
  const approvedDof = dof ? Object.fromEntries(DOF_KEYS_V4.map(key => {
    const value = dof[key]
    if (!value) throw new TypeError(`Missing explicit DOF ${key}`)
    return [key, axisEntry(value.state, value.limits)]
  })) : constraintTemplateV4(kind || 'fixed')
  const result = {
    ...candidate,
    status: 'approved',
    kindHint: kind || candidate.kindHint || null,
    dof: approvedDof,
    physicsReady: true,
    evidence: {
      source,
      strength: 'explicit-physics-rule',
      inheritedGeometryEvidence: candidate.evidence ?? null,
      notes,
    },
    physics: { friction, retention },
    unresolved: [],
  }
  const validation = validateConstraintV4(result)
  if (!validation.valid) throw new Error(`Invalid approved V4 constraint: ${validation.errors.join('; ')}`)
  return result
}

export function limitDofV4(dof, key, min, max) {
  if (!DOF_KEYS_V4.includes(key)) throw new TypeError(`Unknown DOF key: ${key}`)
  const copy = typeof structuredClone === 'function' ? structuredClone(dof) : JSON.parse(JSON.stringify(dof))
  copy[key] = axisEntry('limited', [min, max])
  return copy
}
