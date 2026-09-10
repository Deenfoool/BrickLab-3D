import { approveConstraintV4, proposeConstraintV4 } from './constraints-v4.js'
import { validateConnectedGeometryV4 } from './validity-v4.js'

export const PHYSICS_POLICY_VERSION_V4 = 'connector-physics-policy-v4.3.0'

const MIN_DISTINCT_STUD_DISTANCE = 0.45
const PARALLEL_STUD_AXIS_DOT = 0.9995
const ROTATION_TRANSMITTING_FAMILIES = new Set([
  'technic-axle-keyed-hole',
  'keyed-shaft-interface',
])

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
    // Two or more independent stud contacts can fully constrain the rigid relative
    // pose and are represented by one fixed joint. A single stud still permits twist,
    // but LDraw parts currently use coarse collider envelopes: disabling contacts lets
    // parts rotate through each other, while enabling them can start from overlapping
    // stud/underside Box3 bounds and inject an impulse. Until a connector-aware collider
    // envelope exists, single-stud SIMULATE must fail closed instead of guessing.
    return studBundleSize >= 2
      ? { supported:true, kind:'fixed', retention:'captured', release:null, contacts:'disabled', bundle:'multi-stud-rigid' }
      : { supported:false, reason:'single-stud-collider-envelope-not-proven' }
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

function localConnectorAxis(connector) {
  const o=connector?.frame?.orientationBrickLab
  if (!Array.isArray(o) || o.length!==9 || !o.every(Number.isFinite)) return null
  // Canonical V4 connector axis is local -Y; orientationBrickLab is row-major.
  const axis=[-o[1],-o[4],-o[7]]
  const length=Math.hypot(...axis)
  if (!(length>1e-9)) return null
  return axis.map(value=>value/length)
}

function multiStudBundleIsRigid(entries) {
  if (entries.length < 2) return false
  // Compare contacts on one consistent physical part even if serialization reverses
  // a/b. Two contact axes that are not parallel independently constrain rotation.
  // For parallel axes, only their separation perpendicular to that axis removes the
  // remaining twist. Two contacts merely displaced along one common axis do NOT.
  const referenceInstance=[entries[0].connection.a.instanceId,entries[0].connection.b.instanceId].sort()[0]
  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      const ca=connectorOnInstance(entries[i],referenceInstance)
      const cb=connectorOnInstance(entries[j],referenceInstance)
      const pa=ca?.frame?.positionStud
      const pb=cb?.frame?.positionStud
      const aa=localConnectorAxis(ca)
      const ab=localConnectorAxis(cb)
      if (!Array.isArray(pa) || !Array.isArray(pb) || pa.length!==3 || pb.length!==3 || !aa || !ab) continue

      const axisDot=Math.abs(aa[0]*ab[0]+aa[1]*ab[1]+aa[2]*ab[2])
      if (axisDot < PARALLEL_STUD_AXIS_DOT) return true

      const dx=pb[0]-pa[0],dy=pb[1]-pa[1],dz=pb[2]-pa[2]
      const along=dx*aa[0]+dy*aa[1]+dz*aa[2]
      const lateralSq=Math.max(0,dx*dx+dy*dy+dz*dz-along*along)
      if (Math.sqrt(lateralSq) >= MIN_DISTINCT_STUD_DISTANCE) return true
    }
  }
  return false
}

function axialBundleKey(entry, rule) {
  if (rule?.release !== 'axial-profile' || !['prismatic','cylindrical'].includes(rule?.kind)) return null
  // Occupancy channelKey is the stable identity of the continuous male profile
  // (for example one long axle). Reusing that channel against the same opposite
  // object/family means several graph records describe one physical shaft DOF and
  // must not become competing Rapier joints.
  const channelKey=entry.connection?.occupancy?.channelKey
  if (!channelKey) return null
  const bodies=pairKey(entry.connection.a.instanceId,entry.connection.b.instanceId)
  return `${entry.family}|${rule.kind}|${bodies}|${channelKey}`
}

function physicsItem(entry, rule, { id = null, entries = null, connectionIds = null } = {}) {
  const bundledEntries=Array.isArray(entries) && entries.length ? entries : [entry]
  const ids=Array.isArray(connectionIds) && connectionIds.length ? connectionIds : bundledEntries.map(value=>value.connection.id)
  return {
    id:id || `v4physics:${entry.connection.id}`,
    family:entry.family,
    connectionIds:[...ids],
    entry,
    entries:bundledEntries,
    rule,
    constraint:approvedConstraint(entry, rule),
  }
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
    const rigid = multiStudBundleIsRigid(bundle)
    const representative = bundle[0]
    const rule = ruleFor(representative, rigid ? bundle.length : 1)
    if (!rule.supported) {
      for (const entry of bundle) blockers.push({connectionId:entry.connection.id,family:entry.family,reason:rule.reason})
      continue
    }
    const used = rigid ? bundle : [representative]
    used.forEach(entry => consumed.add(entry.connection.id))
    joints.push(physicsItem(representative,{...rule,bundle:'multi-stud-rigid'}, {
      id:`v4physics:${key}:studs`,
      entries:used,
      connectionIds:used.map(entry=>entry.connection.id),
    }))
  }

  const axialGroups=new Map()
  for (const entry of entries) {
    if (consumed.has(entry.connection.id)) continue
    // Stud entries are handled exclusively by the bundle pass above. If a stud bundle
    // is not proven rigid, do not revisit an entry here and accidentally create a joint.
    if (entry.family === 'stud-anti-stud') continue
    const rule = ruleFor(entry, 1)
    if (!rule.supported) {
      blockers.push({connectionId:entry.connection.id,family:entry.family,reason:rule.reason})
      continue
    }
    const key=axialBundleKey(entry,rule)
    if (!key) {
      joints.push(physicsItem(entry,rule))
      continue
    }
    if (!axialGroups.has(key)) axialGroups.set(key,[])
    axialGroups.get(key).push({entry,rule})
  }

  for (const [key,bundle] of axialGroups) {
    const representative=bundle[0]
    const bundledEntries=bundle.map(value=>value.entry)
    const rule=bundle.length>1
      ? {...representative.rule,bundle:'coaxial-axial-profile'}
      : representative.rule
    joints.push(physicsItem(representative.entry,rule,{
      id:bundle.length>1?`v4physics:${key}:bundle`:null,
      entries:bundledEntries,
      connectionIds:bundledEntries.map(entry=>entry.connection.id),
    }))
  }

  return {
    version:PHYSICS_POLICY_VERSION_V4,
    pass:blockers.length === 0,
    joints,
    blockers,
    stats:{
      connections:connections.length,
      joints:joints.length,
      blockers:blockers.length,
      axialBundles:[...axialGroups.values()].filter(bundle=>bundle.length>1).length,
      bundledAxialConnections:[...axialGroups.values()].filter(bundle=>bundle.length>1).reduce((sum,bundle)=>sum+bundle.length,0),
    },
  }
}

export function drivetrainSemanticLinksV4(connections = [], releasedConnectionIds = new Set()) {
  const released = releasedConnectionIds instanceof Set ? releasedConnectionIds : new Set(releasedConnectionIds ?? [])
  const groups=new Map()
  for (const connection of connections) {
    if (!connection?.id || released.has(connection.id) || !ROTATION_TRANSMITTING_FAMILIES.has(familyOf(connection))) continue
    const family=familyOf(connection)
    const key=`${family}|${pairKey(connection.a.instanceId,connection.b.instanceId)}`
    if (!groups.has(key)) groups.set(key,[])
    groups.get(key).push(connection)
  }
  return [...groups.values()].map(group=>{
    const connection=group[0]
    const ids=group.map(value=>value.id)
    return {
      id:`v4semantic:${pairKey(connection.a.instanceId,connection.b.instanceId)}:${familyOf(connection)}`,
      kind:'axle',
      a:{ instanceId:connection.a.instanceId, connectorId:null },
      b:{ instanceId:connection.b.instanceId, connectorId:null },
      metadata:{
        v4SemanticOnly:true,
        v4ConnectionId:connection.id,
        v4ConnectionIds:ids,
        v4Family:familyOf(connection),
      },
    }
  })
}

export function physicsRulePreviewV4(family, { match = null, connectorA = null, connectorB = null, studBundleSize = 1 } = {}) {
  const entry = { family, validity:{match:match || {}}, connectorA, connectorB }
  return clone(ruleFor(entry, studBundleSize))
}

export const CONNECTOR_V4_ROTATION_TRANSMITTING_FAMILIES = Object.freeze([...ROTATION_TRANSMITTING_FAMILIES])
