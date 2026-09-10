import { PARTS, findPart } from '../parts.js'
import { CONNECTOR_SCHEMA_VERSION_V4, CONNECTOR_SYSTEM_VERSION_V4, SHADOW_SOURCE_V4 } from './schema-v4.js?v=connector-v4-20260910-v1'
import { matchConnectorV4 } from './matcher-v4.js?v=connector-v4-20260910-v1'
import { connectorToBrickLabV4, createShadowResolverV4 } from './shadow-resolver-v4.js?v=connector-v4-20260910-v1'
import { finalizeConnectorIdentitiesV4 } from './identity-v4.js?v=connector-v4-20260910-v2'
import { applyPlacementV4, solvePlacementV4 } from './placement-solver-v4.js?v=connector-v4-20260910-v2'
import { auditConnectorDefinitionV4 } from './audit-v4.js?v=connector-v4-20260910-v2'
import { proposeConstraintV4 } from './constraints-v4.js?v=connector-v4-20260910-v1'
import { createAxialOccupancyV4 } from './occupancy-v4.js?v=connector-v4-20260910-v1'

const LDRAW_RAW_ROOT = 'https://raw.githubusercontent.com/pybricks/ldraw/master/'
const SHADOW_RAW_ROOT = `https://raw.githubusercontent.com/${SHADOW_SOURCE_V4.repository}/${SHADOW_SOURCE_V4.commit}/`
const SHADOW_TREE_URL = `https://api.github.com/repos/${SHADOW_SOURCE_V4.repository}/git/trees/${SHADOW_SOURCE_V4.commit}?recursive=1`
const hydration = new Map()
const status = new Map()
const lastRoots = new Map()
const wrappedDefinitions = new WeakSet()
const occupancy = createAxialOccupancyV4()
let shadowManifestPromise = null
let manifestFallbackWarned = false

const normalizedPath = value => String(value || '').replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase()
const encodedPath = value => String(value || '').split('/').map(encodeURIComponent).join('/')

async function fetchTextOrNull(url) {
  const response = await fetch(url, { mode:'cors', cache:'force-cache' })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`)
  return response.text()
}

async function shadowManifest() {
  if (shadowManifestPromise) return shadowManifestPromise
  shadowManifestPromise = (async () => {
    const response = await fetch(SHADOW_TREE_URL, {
      mode:'cors', cache:'force-cache', headers:{ Accept:'application/vnd.github+json' },
    })
    if (!response.ok) throw new Error(`Shadow manifest HTTP ${response.status}`)
    const data = await response.json()
    if (!Array.isArray(data.tree) || data.truncated) throw new Error('Shadow manifest is missing or truncated')
    const map = new Map()
    for (const item of data.tree) {
      if (item.type !== 'blob' || !/\.dat$/i.test(item.path || '')) continue
      map.set(normalizedPath(item.path), item.path)
    }
    return map
  })()
  try { return await shadowManifestPromise }
  catch (error) {
    shadowManifestPromise = null
    throw error
  }
}

async function fetchShadowText(path) {
  const normalized = normalizedPath(path)
  try {
    const manifest = await shadowManifest()
    const actualPath = manifest.get(normalized)
    if (!actualPath) return null
    return fetchTextOrNull(`${SHADOW_RAW_ROOT}${encodedPath(actualPath)}`)
  } catch (error) {
    // GitHub API may be rate-limited independently from raw.githubusercontent.com.
    // Fall back to an exact raw lookup; a raw 404 is still treated as "not present",
    // while every other HTTP/network error remains a hard hydration error.
    if (!manifestFallbackWarned) {
      manifestFallbackWarned = true
      console.warn('[BrickLab Connector V4] Shadow manifest unavailable; using direct shadow lookup.', error)
    }
    return fetchTextOrNull(`${SHADOW_RAW_ROOT}${encodedPath(normalized)}`)
  }
}

const resolver = createShadowResolverV4({
  fetchOfficialText: path => fetchTextOrNull(`${LDRAW_RAW_ROOT}${encodedPath(path)}`),
  fetchShadowText,
})

function isLDrawDefinition(def) {
  return Boolean(def?.ldraw?.file && String(def.id || '').startsWith('ldraw-'))
}

function publish(def, detail = {}) {
  window.dispatchEvent(new CustomEvent('bricklab:connectorv4', {
    detail: {
      partId: def.id,
      file: def.ldraw?.file,
      schemaVersion: CONNECTOR_SCHEMA_VERSION_V4,
      systemVersion: CONNECTOR_SYSTEM_VERSION_V4,
      ...detail,
    },
  }))
}

function visualOffsetFor(def, root = lastRoots.get(def?.id)) {
  if (!root) return null
  const visual = root.children?.find?.(child => child?.userData?.ldrawVisual)
  if (!visual?.position) return null
  return [visual.position.x, visual.position.y, visual.position.z]
}

function instrumentDefinition(def) {
  if (!isLDrawDefinition(def) || wrappedDefinitions.has(def) || typeof def.create !== 'function') return
  const originalCreate = def.create
  def.create = function connectorV4ObservedCreate(...args) {
    const root = originalCreate.apply(this, args)
    if (root) {
      lastRoots.set(def.id, root)
      queueMicrotask(() => { if (def.ldraw?.ready) void hydrateConnectorV4(def, root) })
    }
    return root
  }
  wrappedDefinitions.add(def)
}

function finalizeResolved(resolved, offset) {
  const identity = finalizeConnectorIdentitiesV4(resolved.file, resolved.connectors)
  const connectors = identity.connectors.map(connector => connectorToBrickLabV4(connector, offset))
  return { connectors, identity }
}

export async function hydrateConnectorV4(defOrId, rootOverride = null) {
  const def = typeof defOrId === 'string' ? findPart(defOrId) : defOrId
  if (!isLDrawDefinition(def)) return null
  if (!def.ldraw?.ready) return null
  if (def.connectivityV4?.status === 'ready') return def.connectivityV4
  if (hydration.has(def.id)) return hydration.get(def.id)

  const promise = (async () => {
    status.set(def.id, 'loading')
    def.connectivityV4 = {
      schemaVersion: CONNECTOR_SCHEMA_VERSION_V4,
      systemVersion: CONNECTOR_SYSTEM_VERSION_V4,
      status: 'loading', source: SHADOW_SOURCE_V4, mode: 'observe', connectors: [], warnings: [],
    }
    publish(def, { status:'loading' })

    try {
      const resolved = await resolver.resolve(def.ldraw.file)
      const offset = visualOffsetFor(def, rootOverride)
      if (!offset) throw new Error('LDraw visual offset is not available yet; V4 hydration waits for an instantiated visual')
      const finalized = finalizeResolved(resolved, offset)
      def.connectivityV4 = {
        schemaVersion: CONNECTOR_SCHEMA_VERSION_V4,
        systemVersion: CONNECTOR_SYSTEM_VERSION_V4,
        status: 'ready', source: SHADOW_SOURCE_V4, mode: 'observe', connectors: finalized.connectors,
        warnings: resolved.warnings,
        stats: {
          ...resolved.stats,
          identityInput: finalized.identity.stats.input,
          identityOutput: finalized.identity.stats.output,
          deduplicated: finalized.identity.stats.deduplicated,
        },
        visualOffsetStud: [...offset],
      }
      status.set(def.id, 'ready')
      publish(def, {
        status:'ready',
        connectors:finalized.connectors.length,
        warnings:resolved.warnings.length,
        deduplicated:finalized.identity.stats.deduplicated,
      })
      return def.connectivityV4
    } catch (error) {
      const message = String(error?.message || error)
      def.connectivityV4 = {
        schemaVersion: CONNECTOR_SCHEMA_VERSION_V4,
        systemVersion: CONNECTOR_SYSTEM_VERSION_V4,
        status: 'error', source: SHADOW_SOURCE_V4, mode: 'observe', connectors: [],
        warnings: [{ code:'hydrate-error', detail:message }],
      }
      status.set(def.id, 'error')
      console.warn(`[BrickLab Connector V4] Could not resolve ${def.ldraw.file}`, error)
      publish(def, { status:'error', error:message })
      return def.connectivityV4
    } finally {
      hydration.delete(def.id)
    }
  })()
  hydration.set(def.id, promise)
  return promise
}

function scanReadyDefinitions() {
  for (const def of PARTS) {
    if (!isLDrawDefinition(def)) continue
    instrumentDefinition(def)
    if (def.ldraw?.ready && lastRoots.has(def.id) && def.connectivityV4?.status !== 'ready' && !hydration.has(def.id)) void hydrateConnectorV4(def)
  }
}

window.addEventListener('bricklab:ldrawloaded', event => {
  const def = findPart(event.detail?.id)
  if (def) { instrumentDefinition(def); void hydrateConnectorV4(def) }
})
window.addEventListener('bricklab:partcatalogchange', scanReadyDefinitions)
scanReadyDefinitions()

export const BrickLabConnectorV4 = Object.freeze({
  schemaVersion: CONNECTOR_SCHEMA_VERSION_V4,
  systemVersion: CONNECTOR_SYSTEM_VERSION_V4,
  source: SHADOW_SOURCE_V4,
  mode: 'observe',
  occupancy,
  async resolve(file, visualOffsetStud = [0,0,0]) {
    const resolved = await resolver.resolve(file)
    const finalized = finalizeResolved(resolved, visualOffsetStud)
    return {
      ...resolved,
      connectors: finalized.connectors,
      identity: finalized.identity.stats,
    }
  },
  hydrate: hydrateConnectorV4,
  get(partId) { return findPart(partId)?.connectivityV4 ?? null },
  match: matchConnectorV4,
  solvePlacement: solvePlacementV4,
  applyPlacement: applyPlacementV4,
  proposeConstraint: proposeConstraintV4,
  audit: auditConnectorDefinitionV4,
  clearCache() { resolver.clearCache(); shadowManifestPromise = null },
  stats() {
    const ready = PARTS.filter(def => def.connectivityV4?.status === 'ready')
    return {
      mode:'observe',
      readyParts: ready.length,
      connectors: ready.reduce((sum, def) => sum + (def.connectivityV4.connectors?.length || 0), 0),
      warnings: ready.reduce((sum, def) => sum + (def.connectivityV4.warnings?.length || 0), 0),
      deduplicated: ready.reduce((sum, def) => sum + (def.connectivityV4.stats?.deduplicated || 0), 0),
      loadingParts: [...status.values()].filter(value => value === 'loading').length,
      errorParts: [...status.values()].filter(value => value === 'error').length,
    }
  },
})

globalThis.BrickLabConnectorV4 = BrickLabConnectorV4
