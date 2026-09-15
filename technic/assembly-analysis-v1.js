import { classifyTechnicConnectionV1 } from './interface-semantics-v1.js'
import { technicPartProfileV1 } from './part-profile-v1.js'

export const TECHNIC_ASSEMBLY_ANALYSIS_VERSION = 'technic-assembly-analysis-v1.1.0'

const ROTARY_SUPPORT_ROLES = new Set(['axle','axle-coupler','spur-gear','bevel-gear','crown-gear','clutch-gear','knob-wheel','worm','sprocket','pulley','rim','wheel-hub','driving-ring'])
const ARTICULATION_KINDS = new Set(['pin-joint','hinge-joint','ball-joint'])
const RIGID_CONNECTION_KINDS = new Set(['stud-structural-contact','technic-structural-special','fixed-structural-contact'])

function unionFind(ids) {
  const parent = new Map(ids.map(id => [id, id]))
  const find = id => {
    if (!parent.has(id)) return null
    let root = id
    while (parent.get(root) !== root) root = parent.get(root)
    let cursor = id
    while (cursor !== root) {
      const next = parent.get(cursor)
      parent.set(cursor, root)
      cursor = next
    }
    return root
  }
  const union = (a, b) => {
    const aa = find(a), bb = find(b)
    if (aa && bb && aa !== bb) parent.set(bb, aa)
  }
  return { parent, find, union }
}

function clone(value) {
  if (value == null) return value
  if (typeof structuredClone === 'function') {
    try { return structuredClone(value) } catch {}
  }
  return JSON.parse(JSON.stringify(value))
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  for (const nested of Object.values(value)) deepFreeze(nested)
  return Object.freeze(value)
}

function snapshot(value) { return deepFreeze(clone(value)) }

function profileRecord(object, getDefinition) {
  const instanceId = object?.userData?.instanceId ?? null
  const partId = object?.userData?.partId ?? null
  const definition = partId ? getDefinition?.(partId) : null
  const profile = technicPartProfileV1(definition || { id:partId })
  return { instanceId, partId, profile }
}

function familyOf(connection) {
  return connection?.activation?.family || connection?.metadata?.activation?.family || null
}

function endpointConnector(connection, side, getConnector) {
  const endpoint = connection?.[side]
  if (!endpoint?.partId || !endpoint?.endpointId) return null
  return getConnector?.(endpoint.partId, endpoint.endpointId) ?? null
}

function classifyRecord(connection, getConnector) {
  const connectorA = endpointConnector(connection, 'a', getConnector)
  const connectorB = endpointConnector(connection, 'b', getConnector)
  if (!connectorA || !connectorB) {
    return {
      connectionId:connection?.id ?? null,
      family:familyOf(connection),
      kind:'unresolved-endpoint',
      constraint:null,
      transmitsTorque:false,
      supportRole:false,
    }
  }
  const semantic = classifyTechnicConnectionV1(connectorA, connectorB, {
    activationFamily:familyOf(connection),
  })
  return {
    connectionId:connection?.id ?? null,
    family:familyOf(connection),
    kind:semantic.kind,
    constraint:semantic.constraint ?? null,
    transmission:semantic.transmission ?? null,
    transmitsTorque:semantic.transmitsTorque ?? false,
    supportRole:semantic.supportRole ?? false,
    group:semantic.group ?? null,
  }
}

function diagnostic(code, severity, instanceIds, message, evidence = {}) {
  return { code, severity, instanceIds:[...new Set((instanceIds || []).filter(Boolean))], message, evidence }
}

function pairKey(a, b) { return [String(a || ''), String(b || '')].sort().join('|') }

function structuralPairs(classified, profileById) {
  const pairs = new Map()
  for (const entry of classified) {
    const a = profileById.get(entry.a)
    const b = profileById.get(entry.b)
    if (!a?.profile?.structural || !b?.profile?.structural) continue
    const key = pairKey(entry.a, entry.b)
    const pair = pairs.get(key) ?? {
      key,
      a:entry.a,
      b:entry.b,
      connections:[],
      pinContacts:0,
      fixedContacts:0,
      articulationContacts:0,
      effectiveRigid:false,
      reason:null,
    }
    pair.connections.push(entry.connectionId)
    if (entry.kind === 'pin-joint') pair.pinContacts += 1
    if (ARTICULATION_KINDS.has(entry.kind)) pair.articulationContacts += 1
    if (entry.constraint === 'fixed' || RIGID_CONNECTION_KINDS.has(entry.kind)) pair.fixedContacts += 1
    pairs.set(key, pair)
  }

  for (const pair of pairs.values()) {
    if (pair.fixedContacts > 0) {
      pair.effectiveRigid = true
      pair.reason = 'fixed-contact'
    } else if (pair.pinContacts >= 2) {
      // Two separate connector records are strong evidence for a rigid beam-to-beam
      // relationship. Exact rank/collinearity still belongs to the geometric V4 layer,
      // so this is an assembly-level rigidity classification rather than a new joint.
      pair.effectiveRigid = true
      pair.reason = 'multi-pin-contact'
    } else if (pair.pinContacts === 1) {
      pair.reason = 'single-pin-revolute'
    } else if (pair.articulationContacts > 0) {
      pair.reason = 'articulated'
    } else {
      pair.reason = 'unclassified-structural-contact'
    }
  }
  return [...pairs.values()]
}

function adjacencyForRigidPairs(ids, pairs) {
  const adjacency = new Map(ids.map(id => [id, new Set()]))
  for (const pair of pairs) {
    if (!pair.effectiveRigid || !adjacency.has(pair.a) || !adjacency.has(pair.b)) continue
    adjacency.get(pair.a).add(pair.b)
    adjacency.get(pair.b).add(pair.a)
  }
  return adjacency
}

function hasRigidPath(adjacency, start, target) {
  if (!start || !target || !adjacency.has(start) || !adjacency.has(target)) return false
  if (start === target) return true
  const seen = new Set([start])
  const queue = [start]
  while (queue.length) {
    const current = queue.shift()
    for (const next of adjacency.get(current) ?? []) {
      if (next === target) return true
      if (seen.has(next)) continue
      seen.add(next)
      queue.push(next)
    }
  }
  return false
}

export function analyzeTechnicAssemblyV1({
  objects = [],
  connections = [],
  getDefinition = () => null,
  getConnector = () => null,
  classifyConnection = null,
  drivetrain = null,
} = {}) {
  const profileById = new Map()
  for (const object of objects || []) {
    const record = profileRecord(object, getDefinition)
    if (!record.instanceId) continue
    profileById.set(record.instanceId, record)
  }

  const rotaryIds = [...profileById.values()]
    .filter(item => item.profile.rotary)
    .map(item => item.instanceId)
  const uf = unionFind(rotaryIds)
  const classified = []

  for (const connection of connections || []) {
    const semantic = typeof classifyConnection === 'function'
      ? classifyConnection(connection)
      : classifyRecord(connection, getConnector)
    classified.push({
      ...semantic,
      a:connection?.a?.instanceId ?? null,
      b:connection?.b?.instanceId ?? null,
    })
    if (semantic.transmitsTorque === true) {
      const a = connection?.a?.instanceId
      const b = connection?.b?.instanceId
      if (uf.parent.has(a) && uf.parent.has(b)) uf.union(a, b)
    }
  }

  const shaftGroups = new Map()
  for (const instanceId of rotaryIds) {
    const root = uf.find(instanceId)
    if (!root) continue
    const list = shaftGroups.get(root) ?? []
    list.push(instanceId)
    shaftGroups.set(root, list)
  }

  const supportCounts = new Map([...shaftGroups.keys()].map(root => [root, 0]))
  const supportParts = new Map([...shaftGroups.keys()].map(root => [root, new Set()]))
  const articulationCounts = new Map([...shaftGroups.keys()].map(root => [root, 0]))
  for (const entry of classified) {
    if (entry.kind === 'shaft-bearing') {
      const rootA = uf.find(entry.a)
      const rootB = uf.find(entry.b)
      const rotaryRoot = rootA || rootB
      if (rotaryRoot) {
        supportCounts.set(rotaryRoot, (supportCounts.get(rotaryRoot) || 0) + 1)
        const other = rootA ? entry.b : entry.a
        if (profileById.get(other)?.profile?.structural) supportParts.get(rotaryRoot)?.add(other)
      }
    }
    if (ARTICULATION_KINDS.has(entry.kind)) {
      for (const instanceId of [entry.a, entry.b]) {
        const root = uf.find(instanceId)
        if (root) articulationCounts.set(root, (articulationCounts.get(root) || 0) + 1)
      }
    }
  }

  const pairs = structuralPairs(classified, profileById)
  const structuralIds = [...profileById.values()].filter(item => item.profile.structural).map(item => item.instanceId)
  const rigidAdjacency = adjacencyForRigidPairs(structuralIds, pairs)
  const diagnostics = []

  for (const pair of pairs) {
    if (pair.reason === 'single-pin-revolute') {
      diagnostics.push(diagnostic(
        'structural-single-pin-hinge', 'info', [pair.a, pair.b],
        'Two structural Technic parts are connected by one pin only; this remains a revolute joint unless another independent contact removes the rotation.',
        { connections:pair.connections },
      ))
    }
  }

  const shafts = []
  const rootByMember = new Map()
  let shaftIndex = 1
  for (const [root, memberIds] of shaftGroups) {
    for (const id of memberIds) rootByMember.set(id, root)
    const members = memberIds.map(id => profileById.get(id)).filter(Boolean)
    const profiles = members.map(item => item.profile)
    const bearingSupports = supportCounts.get(root) || 0
    const bearingPartIds = [...(supportParts.get(root) ?? [])]
    const retainers = members.filter(item => item.profile.retainer).map(item => item.instanceId)
    const gears = members.filter(item => item.profile.transmission && /gear|worm|sprocket|pulley/.test(item.profile.role))
    const needsSupport = profiles.some(profile => ROTARY_SUPPORT_ROLES.has(profile.role))

    if (needsSupport && bearingSupports === 0) {
      diagnostics.push(diagnostic(
        'shaft-no-bearing-support', 'warning', memberIds,
        'Rotary Technic group has no certified round-bearing support.',
        { bearingSupports, retainers:retainers.length },
      ))
    } else if (needsSupport && bearingSupports === 1) {
      diagnostics.push(diagnostic(
        gears.length ? 'gear-shaft-single-bearing-support' : 'shaft-single-bearing-support',
        gears.length ? 'warning' : 'info', memberIds,
        gears.length
          ? 'A geared shaft has only one certified bearing support; add a second separated support so gear center distance cannot cantilever under load.'
          : 'Rotary Technic group has only one certified bearing support; a second separated support improves axis stability.',
        { bearingSupports, retainers:retainers.length, gearMembers:gears.map(item => item.instanceId) },
      ))
    }

    if (bearingPartIds.length >= 2) {
      const anchor = bearingPartIds[0]
      const disconnected = bearingPartIds.slice(1).filter(id => !hasRigidPath(rigidAdjacency, anchor, id))
      if (disconnected.length) {
        diagnostics.push(diagnostic(
          'shaft-support-frame-open', 'warning', [anchor, ...disconnected, ...memberIds],
          'Bearing supports for the same shaft are not connected by a verified rigid structural path. Cross-brace the beams/frames so the shaft spacing stays fixed.',
          { bearingParts:bearingPartIds, disconnected },
        ))
      }
    }

    if (profiles.some(profile => profile.role === 'axle') && retainers.length === 0) {
      diagnostics.push(diagnostic(
        'shaft-axial-retention-unverified', 'info', memberIds,
        'No explicit bush/retainer is present on this axle group; axial retention may still come from stop geometry or trapped assembly.',
        { bearingSupports },
      ))
    }

    for (const gear of gears) {
      if (!gear.profile.toothCount) {
        diagnostics.push(diagnostic(
          'gear-teeth-unknown', 'warning', [gear.instanceId],
          'Gear-like Technic part has no verified tooth count, so ratio/mesh math must remain disabled for it.',
          { partId:gear.partId, role:gear.profile.role },
        ))
      }
    }

    shafts.push({
      id:`technic-shaft-${shaftIndex++}`,
      root,
      memberIds:[...memberIds],
      partIds:members.map(item => item.partId),
      roles:profiles.map(profile => profile.role),
      bearingSupports,
      bearingPartIds,
      retainers,
      articulationContacts:articulationCounts.get(root) || 0,
      gearMembers:gears.map(item => item.instanceId),
    })
  }

  const gearMeshes = []
  for (const mesh of drivetrain?.physicalGearMeshes ?? []) {
    const aId = mesh?.a?.instanceId ?? null
    const bId = mesh?.b?.instanceId ?? null
    const rootA = rootByMember.get(aId)
    const rootB = rootByMember.get(bId)
    const supportA = rootA ? supportCounts.get(rootA) || 0 : 0
    const supportB = rootB ? supportCounts.get(rootB) || 0 : 0
    gearMeshes.push({
      id:mesh.id ?? null,
      kind:mesh.kind ?? 'gear',
      a:aId,
      b:bId,
      teethA:mesh?.a?.teeth ?? null,
      teethB:mesh?.b?.teeth ?? null,
      ratioAB:mesh.ratioAB ?? null,
      supportA,
      supportB,
    })
    if (supportA < 1 || supportB < 1) {
      diagnostics.push(diagnostic(
        'gear-mesh-unsupported-shaft', 'warning', [aId, bId],
        'Meshing gears were detected but at least one gear shaft has no certified bearing support.',
        { meshId:mesh.id ?? null, supportA, supportB },
      ))
    }
  }

  for (const item of profileById.values()) {
    if (item.profile.role === 'unknown' && String(item.partId || '').startsWith('ldraw-')) {
      diagnostics.push(diagnostic(
        'technic-role-unknown', 'info', [item.instanceId],
        'LDraw part has no trusted Technic mechanical role yet; geometry/connectors remain available without fabricated behavior.',
        { partId:item.partId },
      ))
    }
  }

  const specialConnections = classified.filter(item => item.transmission || item.kind?.includes('turntable') || item.kind?.includes('joint'))
  const profiles = [...profileById.values()].map(item => ({
    instanceId:item.instanceId,
    partId:item.partId,
    role:item.profile.role,
    confidence:item.profile.confidence,
    rotary:item.profile.rotary,
    structural:item.profile.structural,
    transmission:item.profile.transmission,
    toothCount:item.profile.toothCount,
    retainer:item.profile.retainer,
  }))

  return snapshot({
    version:TECHNIC_ASSEMBLY_ANALYSIS_VERSION,
    profiles,
    connections:classified,
    structuralPairs:pairs,
    shafts,
    gearMeshes,
    specialConnections,
    diagnostics,
    stats:{
      objects:profileById.size,
      recognizedParts:profiles.filter(item => item.role !== 'unknown').length,
      rotaryParts:profiles.filter(item => item.rotary).length,
      structuralParts:profiles.filter(item => item.structural).length,
      transmissionParts:profiles.filter(item => item.transmission).length,
      shaftGroups:shafts.length,
      bearings:classified.filter(item => item.kind === 'shaft-bearing').length,
      torqueCouplings:classified.filter(item => item.transmitsTorque === true).length,
      articulations:classified.filter(item => ARTICULATION_KINDS.has(item.kind)).length,
      rigidStructuralPairs:pairs.filter(pair => pair.effectiveRigid).length,
      singlePinStructuralPairs:pairs.filter(pair => pair.reason === 'single-pin-revolute').length,
      gearMeshes:gearMeshes.length,
      warnings:diagnostics.filter(item => item.severity === 'warning').length,
      info:diagnostics.filter(item => item.severity === 'info').length,
    },
  })
}
