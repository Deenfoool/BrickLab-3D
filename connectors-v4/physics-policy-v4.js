import { approveConstraintV4, proposeConstraintV4 } from './constraints-v4.js'
import { validateConnectedGeometryV4 } from './validity-v4.js'

export const PHYSICS_POLICY_VERSION_V4 = 'connector-physics-policy-v4.2.3'

const MIN_DISTINCT_STUD_DISTANCE = 0.45

function familyOf(connection) {
  return connection?.activation?.family || connection?.metadata?.activation?.family || null
}

function pairKey(a, b) {
  return [String(a || ''), String(b || '')].sort().join('<>')
}

function clone(value) {
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value))
}

function groupName(...connectors) {
  return connectors.map(connector => String(connector?.group || '')).filter(Boolean).join('|').toLowerCase()
}

function resistanceFor(family, match) {
  // These are deliberately normalized simulation parameters, not claimed LEGO
  // measurements. They only damp free axial motion; geometry/DOF remain exact.
  if (family === 'technic-pin-hole') return { axialDamping:2.4, maxAxialForce:3.2, model:'normalized-friction-fit' }
  if (family === 'bar-clip') return { axialDamping:1.25, maxAxialForce:1.7, model:'normalized-clip-retention' }
  if (family === 'bar-round-hole') return { axialDamping:0.35, maxAxialForce:0.55, model:'normalized-light-slide' }
  if (family === 'technic-axle-round-hole' || family === 'technic-axle-keyed-hole' || family === 'keyed-shaft-interface') {
    return { axialDamping:0.18, maxAxialForce:0.35, model:'normalized-free-slide' }
  }
  if (match?.frictionHint === 'friction-fit') return { axialDamping:1.5, maxAxialForce:2, model:'normalized-friction-fit' }
  return null
}

function ruleFor(entry, studBundleSize = 1) {
  const family = entry.family
  const match = entry.validity.match
  const group = groupName(entry.connectorA, entry.connectorB)

  if (family === 'stud-anti-stud') {
    return studBundleSize >= 2
      ? { supported:true, kind:'fixed', retention:'captured', release:null, bundle:'multi-stud-rigid' }
      : { supported:true, kind:'revolute', retention:'captured', release:null, bundle:'single-stud-twist' }
  }

  if (family === 'technic-axle-keyed-hole' || family === 'keyed-shaft-interface') {
    return { supported:true, kind:'prismatic', retention:'open-profile', release:'axial-profile', resistance:resistanceFor(family, match) }
  }
  if (family === 'technic-axle-round-hole' || family === 'bar-round-hole' || family === 'round-cylindrical-interface') {
    return { supported:true, kind:'cylindrical', retention:'open-profile', release:'axial-profile', resistance:resistanceFor(family, match) }
  }
  if (family === 'round-revolute-interface') {
    return { supported:true, kind:'revolute', retention:'captured', release:null }
  }
  if (family === 'technic-pin-hole') {
    return { supported:true, kind:'cylindrical', retention:'friction-profile', release:'axial-profile', resistance:resistanceFor(family, match) }
  }
  if (family === 'bar-clip') {
    const sliding = Boolean(match?.editorMotion?.axialSlide)
    return sliding
      ? { supported:true, kind:'cylindrical', retention:'clip-friction', release:'axial-profile', resistance:resistanceFor(family, match) }
      : { supported:true, kind:'revolute', retention:'clip-captured', release:null }
  }
  if (family === 'ball-socket') {
    return { supported:true, kind:'spherical', retention:'captured', release:null }
  }
  if (family === 'hinge-fingers') {
    if (/(^|\|)lckhng($|\|)/i.test(group) || /lock|click|detent/.test(group)) {
      return { supported:false, reason:'locking-hinge-detent-policy-not-proven' }
    }
    return { supported:true, kind:'revolute', retention:'captured', release:null }
  }

  // Generic groups can represent electrical plugs, special couplings, click
  // mechanisms, magnets, etc. Shape compatibility alone is not physics evidence.
  if (family === 'generic-group') return { supported:false, reason:'generic-group-requires-explicit-physics-override' }

  return { supported:false, reason:`unsupported-family:${family || 'unknown'}` }
}

function approvedConstraint(entry, rule) {
  const candidate = proposeConstraintV4(entry.validity.match)
  return approveConstraintV4(candidate, {
    source:`${PHYSICS_POLICY_VERSION_V4}:${entry.family}`,
    kind:rule.kind,
    friction:rule.resistance ? clone(rule.resistance) : null,
    retention:rule.retention,
    notes:rule.bundle || rule.release || 'shape-and-live-geometry-certified',
  })
}

function entryFor(connection, byId, getConnector) {
  const objectA = byId.get(connection?.a?.instanceId)
  const objectB = byId.get(connection?.b?.instanceId)
  if (!objectA || !objectB) return { ok:false, reason:'missing-object', connection }
  if (connection.a?.partId && objectA.userData?.partId !== connection.a.partId) return { ok:false, reason:'part-a-mismatch', connection }
  if (connection.b?.partId && objectB.userData?.partId !== connection.b.partId) return { ok:false, reason:'part-b-mismatch', connection }

  const connectorA = getConnector?.(objectA.userData.partId, connection.a.endpointId)
  const connectorB = getConnector?.(objectB.userData.partId, connection.b.endpointId)
  if (!connectorA || !connectorB) return { ok:false, reason:'missing-endpoint', connection }

  const validity = validateConnectedGeometryV4(objectA, connectorA, objectB, connectorB)
  if (!validity.valid) return { ok:false, reason:`live-geometry:${validity.reason}`, connection, validity }

  const family = familyOf(connection)
  if (!family) return { ok:false, reason:'missing-activation-family', connection, validity }
  return { ok:true, connection, family, objectA, objectB, connectorA, connectorB, validity }
}

function connectorOnInstance(entry, instanceId) {
  if (entry.connection.a.instanceId === instanceId) return entry.connectorA
  if (entry.connection.b.instanceId === instanceId) return entry.connectorB
  return null
}

function distinctStudBundle(entries) {
  if (entries.length < 2) return false
  // Always compare endpoints on the SAME physical part, even if imported records
  // have their a/b direction reversed. This makes bundle classification invariant
  // under connection serialization order.
  const referenceInstance=[entries[0].connection.a.instanceId,entries[0].connection.b.instanceId].sort()[0]
  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      const pa=connectorOnInstance(entries[i],referenceInstance)?.frame?.positionStud
      const pb=connectorOnInstance(entries[j],referenceInstance)?.frame?.positionStud
      if (!Array.isArray(pa) || !Array.isArray(pb) || pa.length !== 3 || pb.length !== 3) continue
      const d = Math.hypot(pa[0]-pb[0], pa[1]-pb[1], pa[2]-pb[2])
      if (d >= MIN_DISTINCT_STUD_DISTANCE) return true
    }
  }
  return false
}

export function buildPhysicsPlanV4({ objects = [], connections = [], getConnector } = {}) {
  const byId = new Map(objects.filter(Boolean).map(object => [object.userData?.instanceId, object]))
  const entries = []
  const blockers = []

  for (const connection of connections) {
    const entry = entryFor(connection, byId, getConnector)
    if (!entry.ok) blockers.push({ connectionId:connection?.id || null, family:familyOf(connection), reason:entry.reason })
    else entries.push(entry)
  }

  const studGroups = new Map()
  for (const entry of entries.filter(entry => entry.family === 'stud-anti-stud')) {
    const key = pairKey(entry.connection.a.instanceId, entry.connection.b.instanceId)
    if (!studGroups.has(key)) studGroups.set(key, [])
    studGroups.get(key).push(entry)
  }

  const consumed = new Set()
  const joints = []
  for (const [key, bundle] of studGroups) {
    const rigid = distinctStudBundle(bundle)
    const representative = bundle[0]
    const rule = ruleFor(representative, rigid ? bundle.length : 1)
    if (!rule.supported) {
      for (const entry of bundle) blockers.push({connectionId:entry.connection.id,family:entry.family,reason:rule.reason})
      continue
    }
    const used = rigid ? bundle : [representative]
    used.forEach(entry => consumed.add(entry.connection.id))
    joints.push({
      id:`v4physics:${key}:studs`,
      family:'stud-anti-stud',
      connectionIds:used.map(entry => entry.connection.id),
      entry:representative,
      rule,
      constraint:approvedConstraint(representative, rule),
    })
  }

  for (const entry of entries) {
    if (consumed.has(entry.connection.id)) continue
    const rule = ruleFor(entry, 1)
    if (!rule.supported) {
      blockers.push({connectionId:entry.connection.id,family:entry.family,reason:rule.reason})
      continue
    }
    joints.push({
      id:`v4physics:${entry.connection.id}`,
      family:entry.family,
      connectionIds:[entry.connection.id],
      entry,
      rule,
      constraint:approvedConstraint(entry, rule),
    })
  }

  return {
    version:PHYSICS_POLICY_VERSION_V4,
    pass:blockers.length === 0,
    joints,
    blockers,
    stats:{ connections:connections.length, joints:joints.length, blockers:blockers.length },
  }
}

export function physicsRulePreviewV4(family, { match = null, connectorA = null, connectorB = null, studBundleSize = 1 } = {}) {
  const entry = { family, validity:{match:match || {}}, connectorA, connectorB }
  return clone(ruleFor(entry, studBundleSize))
}
