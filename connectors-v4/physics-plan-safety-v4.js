import { resolvePhysicsOverrideV4, PHYSICS_OVERRIDES_VERSION_V4 } from './physics-overrides-v4.js'

export const PHYSICS_PLAN_SAFETY_VERSION_V4 = 'connector-physics-plan-safety-v4.0.2'

const HARD_BLOCKED = new Map([
  ['ball-socket', 'ball-socket-angular-envelope-not-implemented'],
])
const OVERRIDE_REQUIRED = new Map([
  ['hinge-fingers', 'hinge-angular-envelope-not-proven'],
  ['round-revolute-interface', 'generic-revolute-angular-envelope-not-proven'],
])

function reasonFor(item) {
  if (HARD_BLOCKED.has(item?.family)) return { reason:HARD_BLOCKED.get(item.family), overridable:false }
  if (OVERRIDE_REQUIRED.has(item?.family)) return { reason:OVERRIDE_REQUIRED.get(item.family), overridable:true }
  if (item?.family === 'bar-clip' && item?.rule?.kind === 'revolute') return { reason:'captured-clip-angular-envelope-not-proven', overridable:true }
  return null
}

function finiteLimitPair(limits) {
  return limits != null && Number.isFinite(limits?.min) && Number.isFinite(limits?.max) && limits.min <= limits.max
}

function applyOverride(item, override) {
  const rule = override.rule
  if (rule.kind !== item.rule.kind) {
    return { ok:false, reason:`physics-override-kind-mismatch:${override.id}` }
  }
  // Today only revolute overrides have a tested limit application path. Generic
  // prismatic/cylindrical and spherical angular limits remain deliberately blocked.
  if (rule.kind !== 'revolute' || !finiteLimitPair(rule.limits)) {
    return { ok:false, reason:`physics-override-revolute-limits-required:${override.id}` }
  }
  return {
    ok:true,
    item:{
      ...item,
      rule:{
        ...item.rule,
        retention:rule.retention || item.rule.retention,
        release:rule.release ?? item.rule.release,
        resistance:rule.resistance ?? item.rule.resistance,
        contacts:rule.contacts || 'disabled',
        limits:{ min:rule.limits.min, max:rule.limits.max },
        override:{
          id:override.id,
          version:override.version,
          evidence:rule.evidence,
        },
      },
    },
  }
}

export function hardenPhysicsPlanV4(plan) {
  if (!plan || !Array.isArray(plan.joints) || !Array.isArray(plan.blockers)) {
    throw new TypeError('Connector V4 physics safety gate requires a physics plan')
  }

  const joints=[]
  const blockers=[...plan.blockers]
  let overridden=0

  for (const item of plan.joints) {
    const policy=reasonFor(item)
    if (!policy) {
      joints.push(item)
      continue
    }

    if (!policy.overridable) {
      for (const connectionId of item.connectionIds ?? [null]) blockers.push({connectionId,family:item.family,reason:policy.reason})
      continue
    }

    const override=resolvePhysicsOverrideV4(item.entry)
    if (!override) {
      for (const connectionId of item.connectionIds ?? [null]) blockers.push({connectionId,family:item.family,reason:policy.reason})
      continue
    }

    const applied=applyOverride(item,override)
    if (!applied.ok) {
      for (const connectionId of item.connectionIds ?? [null]) blockers.push({connectionId,family:item.family,reason:applied.reason})
      continue
    }
    joints.push(applied.item)
    overridden+=1
  }

  return {
    ...plan,
    safetyVersion:PHYSICS_PLAN_SAFETY_VERSION_V4,
    overridesVersion:PHYSICS_OVERRIDES_VERSION_V4,
    pass:blockers.length===0,
    joints,
    blockers,
    stats:{
      ...(plan.stats ?? {}),
      joints:joints.length,
      blockers:blockers.length,
      overrides:overridden,
    },
  }
}

export function physicsSafetyReasonV4(family, kind = null) {
  if (HARD_BLOCKED.has(family)) return HARD_BLOCKED.get(family)
  if (OVERRIDE_REQUIRED.has(family)) return OVERRIDE_REQUIRED.get(family)
  if (family === 'bar-clip' && kind === 'revolute') return 'captured-clip-angular-envelope-not-proven'
  return null
}

export const CONNECTOR_V4_HARD_BLOCKED_PHYSICS_FAMILIES = Object.freeze([...HARD_BLOCKED.keys()])
export const CONNECTOR_V4_OVERRIDE_REQUIRED_FAMILIES = Object.freeze([...OVERRIDE_REQUIRED.keys()])
