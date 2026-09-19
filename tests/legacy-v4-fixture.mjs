import { cloneMechanical, createEndpointDescriptor, deterministicId, evidence } from '../mechanics-next/core/model.js'
import { createConstraint, dofEntry } from '../mechanics-next/constraints/dof.js'

const LEGACY_CONFIDENCE = Object.freeze({
  source:'legacy-connector-v4',
  confidence:'strong',
  reason:'temporary read-only migration evidence',
})

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.freeze(value)
  for (const child of Object.values(value)) deepFreeze(child)
  return value
}

function readonlyClone(value) {
  return deepFreeze(cloneMechanical(value))
}

export function legacyV4ConnectorToEndpoint(connector, {
  bodyId,
  partId = null,
} = {}) {
  if (!connector?.endpointId || !bodyId) throw new TypeError('Legacy connector conversion requires endpointId and bodyId')
  return createEndpointDescriptor({
    id:deterministicId('endpoint', bodyId, connector.endpointId),
    bodyId,
    family:connector.family || 'unknown',
    gender:connector.gender || null,
    frame:connector.frame || null,
    profile:connector.geometry || null,
    capabilities:[
      connector.snap?.slide ? 'slide' : null,
      connector.snap?.match ? `match:${connector.snap.match}` : null,
      connector.snap?.placement ? `placement:${connector.snap.placement}` : null,
    ].filter(Boolean),
    metadata:{
      legacyEndpointId:connector.endpointId,
      legacyPartId:partId,
      group:connector.group ?? connector.snap?.group ?? null,
      sourceSchema:connector.schemaVersion ?? 4,
    },
    evidence:evidence(LEGACY_CONFIDENCE),
  })
}

export function legacyV4ConstraintToNext(candidate, {
  id,
  bodyA,
  bodyB,
} = {}) {
  if (!candidate?.dof) return null
  const dof = {}
  for (const key of ['tx', 'ty', 'tz', 'rx', 'ry', 'rz']) {
    const entry = candidate.dof[key] || { state:'locked' }
    if (entry.state === 'limited') dof[key] = dofEntry('limited', { limits:entry.limits, source:'legacy-v4' })
    else if (entry.state === 'free') dof[key] = dofEntry('free', { source:'legacy-v4' })
    else dof[key] = dofEntry('locked', { source:'legacy-v4' })
  }
  return createConstraint({
    id:id || deterministicId('constraint', bodyA, bodyB, candidate.kindHint || 'legacy'),
    bodyA,
    bodyB,
    kind:['fixed','revolute','prismatic','cylindrical','spherical'].includes(candidate.kindHint)
      ? candidate.kindHint
      : 'custom',
    dof,
    metadata:{
      migrationOnly:true,
      legacySystemVersion:candidate.systemVersion ?? null,
      legacyStatus:candidate.status ?? null,
      legacyPhysicsReady:candidate.physicsReady === true,
    },
    evidence:evidence(LEGACY_CONFIDENCE),
  })
}

export function snapshotLegacyV4(provider) {
  if (!provider || typeof provider !== 'object') {
    return Object.freeze({
      available:false,
      systemVersion:null,
      connections:Object.freeze([]),
      stats:null,
    })
  }

  let connections = []
  try {
    if (typeof provider.connectionGraph?.list === 'function') connections = provider.connectionGraph.list()
  } catch {
    connections = []
  }

  let stats = null
  try {
    if (typeof provider.stats === 'function') stats = provider.stats()
    else if (typeof provider.connectionGraph?.stats === 'function') stats = provider.connectionGraph.stats()
  } catch {
    stats = null
  }

  return Object.freeze({
    available:true,
    systemVersion:provider.systemVersion ?? null,
    schemaVersion:provider.schemaVersion ?? null,
    mode:provider.mode ?? null,
    connections:Object.freeze(connections.map(readonlyClone)),
    stats:stats == null ? null : readonlyClone(stats),
  })
}

export function assertLegacyReadOnly(snapshot) {
  if (!snapshot || snapshot.available !== true) return true
  if (!Object.isFrozen(snapshot) || !Object.isFrozen(snapshot.connections)) {
    throw new Error('Legacy adapter snapshot must be immutable')
  }
  return true
}


export function snapshotLegacyPartConnectivity(provider, partId) {
  if (!provider || typeof provider.get !== 'function' || !partId) {
    return Object.freeze({
      available:false,
      status:'unavailable',
      partId:partId ?? null,
      connectors:Object.freeze([]),
    })
  }

  try {
    const value = provider.get(partId)
    if (!value) {
      return Object.freeze({
        available:true,
        status:'missing',
        partId:String(partId),
        connectors:Object.freeze([]),
      })
    }
    const frozen = readonlyClone(value)
    return Object.freeze({
      available:true,
      partId:String(partId),
      status:frozen.status ?? 'unknown',
      schemaVersion:frozen.schemaVersion ?? null,
      systemVersion:frozen.systemVersion ?? null,
      connectors:Object.freeze(Array.isArray(frozen.connectors) ? frozen.connectors : []),
      warnings:Object.freeze(Array.isArray(frozen.warnings) ? frozen.warnings : []),
      visualOffsetStud:Object.freeze(Array.isArray(frozen.visualOffsetStud) ? [...frozen.visualOffsetStud] : [0,0,0]),
      stats:frozen.stats ?? null,
      health:frozen.health ?? null,
    })
  } catch (error) {
    return Object.freeze({
      available:false,
      status:'error',
      partId:String(partId),
      connectors:Object.freeze([]),
      error:String(error?.message || error),
    })
  }
}

export function createLegacyConnectivityObservationProvider(provider) {
  return Object.freeze({
    get(partId) {
      return snapshotLegacyPartConnectivity(provider, partId)
    },
    toEndpoint(connector, options) {
      return legacyV4ConnectorToEndpoint(connector, options)
    },
    available() {
      return Boolean(provider && typeof provider.get === 'function')
    },
  })
}
