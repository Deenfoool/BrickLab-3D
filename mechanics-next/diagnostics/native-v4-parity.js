import { deterministicId } from '../core/model.js'
import { legacyV4ConnectorToEndpoint } from '../adapters/legacy-v4-readonly.js'
import { ldcadConnectorToEndpoint } from '../ldraw/connector-adapter.js'
import { enrichEndpointSemantics, endpointSemanticKind } from '../intelligence/endpoint-semantics.js'
import { canonicalMechanicalJson } from '../intelligence/fingerprint.js'

function round(value, digits = 5) {
  if (!Number.isFinite(Number(value))) return null
  const factor = 10 ** digits
  return Math.round(Number(value) * factor) / factor
}

function rawGeometrySignature(endpoint) {
  const frame = endpoint?.frame || {}
  const profile = endpoint?.profile || {}
  const sections = Array.isArray(profile.sections)
    ? profile.sections.map(section => ({
        shape:section?.shape ?? null,
        radiusLdu:round(section?.radiusLdu),
        lengthLdu:round(section?.lengthLdu),
        elastic:section?.elastic === true,
      }))
    : null

  return {
    family:endpoint?.family || 'unknown',
    gender:endpoint?.gender ?? null,
    group:endpoint?.metadata?.group ?? null,
    positionLdu:Array.isArray(frame.positionLdu) ? frame.positionLdu.map(value => round(value)) : null,
    orientation:Array.isArray(frame.orientation) ? frame.orientation.map(value => round(value)) : null,
    profile:{
      caps:profile.caps ?? null,
      centered:profile.centered === true,
      radiusLdu:round(profile.radiusLdu),
      lengthLdu:round(profile.lengthLdu),
      sections,
      sequenceLdu:Array.isArray(profile.sequenceLdu) ? profile.sequenceLdu.map(value => round(value)) : null,
      bounding:profile.bounding ?? null,
    },
  }
}

function normalizedEndpoint(endpoint) {
  const enriched = enrichEndpointSemantics(endpoint)
  return Object.freeze({
    semantic:endpointSemanticKind(enriched),
    family:enriched.family,
    gender:enriched.gender ?? null,
    group:enriched.metadata?.group ?? null,
    signature:rawGeometrySignature(enriched),
  })
}

function sortedMultiset(items) {
  return items.map(item => canonicalMechanicalJson(item)).sort()
}

function difference(left, right) {
  const counts = new Map()
  for (const item of right) counts.set(item, (counts.get(item) || 0) + 1)
  const result = []
  for (const item of left) {
    const remaining = counts.get(item) || 0
    if (remaining > 0) counts.set(item, remaining - 1)
    else result.push(item)
  }
  return result
}

export function compareNativeToLegacyConnectivity({
  partId = 'unknown',
  nativeConnectors = [],
  legacyConnectors = [],
} = {}) {
  const nativeBody = deterministicId('parity-native-body', partId)
  const legacyBody = deterministicId('parity-legacy-body', partId)

  const native = nativeConnectors.map((connector, index) =>
    normalizedEndpoint(ldcadConnectorToEndpoint(connector, {
      bodyId:nativeBody,
      partId,
      index,
    }))
  )
  const legacy = legacyConnectors.map((connector, index) =>
    normalizedEndpoint(legacyV4ConnectorToEndpoint(connector, {
      bodyId:legacyBody,
      partId,
      index,
    }))
  )

  const nativeSemantic = sortedMultiset(native.map(item => ({
    semantic:item.semantic,
    family:item.family,
    gender:item.gender,
    group:item.group,
  })))
  const legacySemantic = sortedMultiset(legacy.map(item => ({
    semantic:item.semantic,
    family:item.family,
    gender:item.gender,
    group:item.group,
  })))

  const semanticMissingFromNative = difference(legacySemantic, nativeSemantic)
  const semanticExtraInNative = difference(nativeSemantic, legacySemantic)

  // Geometry parity is intentionally stricter and can fail when sources differ only
  // in stable IDs. It is a migration gate, not a production requirement.
  const nativeGeometry = sortedMultiset(native.map(item => item.signature))
  const legacyGeometry = sortedMultiset(legacy.map(item => item.signature))
  const geometryMissingFromNative = difference(legacyGeometry, nativeGeometry)
  const geometryExtraInNative = difference(nativeGeometry, legacyGeometry)

  return Object.freeze({
    partId:String(partId),
    nativeCount:native.length,
    legacyCount:legacy.length,
    semanticParity:semanticMissingFromNative.length === 0 && semanticExtraInNative.length === 0,
    geometryParity:geometryMissingFromNative.length === 0 && geometryExtraInNative.length === 0,
    semanticMissingFromNative:Object.freeze(semanticMissingFromNative),
    semanticExtraInNative:Object.freeze(semanticExtraInNative),
    geometryMissingFromNative:Object.freeze(geometryMissingFromNative),
    geometryExtraInNative:Object.freeze(geometryExtraInNative),
  })
}

export class ConnectivityParityLedger {
  #results = new Map()

  record(result) {
    if (!result?.partId) throw new TypeError('Parity result requires partId')
    this.#results.set(String(result.partId), result)
    return result
  }

  get(partId) {
    return this.#results.get(String(partId || '')) ?? null
  }

  summary() {
    let semanticPass = 0
    let geometryPass = 0
    for (const result of this.#results.values()) {
      if (result.semanticParity) semanticPass += 1
      if (result.geometryParity) geometryPass += 1
    }
    return Object.freeze({
      parts:this.#results.size,
      semanticPass,
      geometryPass,
      semanticFail:this.#results.size - semanticPass,
      geometryFail:this.#results.size - geometryPass,
    })
  }
}
