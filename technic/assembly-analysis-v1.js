import { classifyTechnicConnectionV1 } from './interface-semantics-v1.js'
import { technicPartProfileV1 } from './part-profile-v1.js'

export const TECHNIC_ASSEMBLY_ANALYSIS_VERSION = 'technic-assembly-analysis-v1.0.0'

const ROTARY_SUPPORT_ROLES = new Set(['axle','axle-coupler','spur-gear','bevel-gear','crown-gear','clutch-gear','knob-wheel','worm','sprocket','pulley','rim','wheel-hub','driving-ring'])

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

export function analyzeTechnicAssemblyV1({
  objects = [],
  connections = [],
  getDefinition = () => null,
  getConnector = () => null,
  classifyConnection = null,
} = {}) {
  const profileById = new Map()
  const objectById = new Map()
  for (const object of objects || []) {
    const record = profileRecord(object, getDefinition)
    if (!record.instanceId) continue
    objectById.set(record.instanceId, object)
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
  const articulationCounts = new Map([...shaftGroups.keys()].map(root => [root, 0]))
  for (const entry of classified) {
    if (entry.kind === 'shaft-bearing') {
      for (const instanceId of [entry.a, entry.b]) {
        const root = uf.find(instanceId)
        if (root) supportCounts.set(root, (supportCounts.get(root) || 0) + 1)
      }
    }
    if (['pin-joint','hinge-joint','ball-joint'].includes(entry.kind)) {
      for (const instanceId of [entry.a, entry.b]) {
        const root = uf.find(instanceId)
        if (root) articulationCounts.set(root, (articulationCounts.get(root) || 0) + 1)
      }
    }
  }

  const diagnostics = []
  const shafts = []
  let shaftIndex = 1
  for (const [root, memberIds] of shaftGroups) {
    const members = memberIds.map(id => profileById.get(id)).filter(Boolean)
    const profiles = members.map(item => item.profile)
    const bearingSupports = supportCounts.get(root) || 0
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
        'shaft-single-bearing-support', 'info', memberIds,
        'Rotary Technic group has only one certified bearing support; a second separated support improves axis stability.',
        { bearingSupports, retainers:retainers.length },
      ))
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
      retainers,
      articulationContacts:articulationCounts.get(root) || 0,
      gearMembers:gears.map(item => item.instanceId),
    })
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
    shafts,
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
      articulations:classified.filter(item => ['pin-joint','hinge-joint','ball-joint'].includes(item.kind)).length,
      warnings:diagnostics.filter(item => item.severity === 'warning').length,
      info:diagnostics.filter(item => item.severity === 'info').length,
    },
  })
}
