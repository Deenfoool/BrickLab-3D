import { cloneConnectorV4 } from './schema-v4.js?v=connector-v4-20260910-v1'

export const CONNECTOR_IDENTITY_VERSION_V4 = 'connector-identity-v4.0.0'

function rounded(value, digits = 6) {
  if (!Number.isFinite(value)) return value
  const scale = 10 ** digits
  return Math.round(value * scale) / scale
}

function stableObject(value) {
  if (Array.isArray(value)) return value.map(stableObject)
  if (!value || typeof value !== 'object') return typeof value === 'number' ? rounded(value) : value
  return Object.fromEntries(Object.keys(value).sort().filter(key => !['source','provenance','key','endpointId','clearIds'].includes(key)).map(key => [key,stableObject(value[key])]))
}

export function connectorSignatureV4(connector) {
  const stable = stableObject({
    family:connector?.family,
    gender:connector?.gender,
    group:connector?.group || null,
    frame:connector?.frame,
    geometry:connector?.geometry,
    snap:connector?.snap,
    inheritance:connector?.inheritance,
  })
  return JSON.stringify(stable)
}

export function hashConnectorSignatureV4(text) {
  // FNV-1a 32-bit. Endpoint identity is not a security boundary; the canonical
  // signature is also retained for collision diagnostics.
  let hash = 0x811c9dc5
  for (let i=0; i<text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash,0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8,'0')
}

export function finalizeConnectorIdentitiesV4(file,connectors,{dedupe=true}={}) {
  const normalizedFile = String(file || '').replace(/\\/g,'/').toLowerCase()
  const seen = new Map()
  const result = []
  const duplicates = []
  const collisions = []
  const hashes = new Map()

  for (const connector of connectors ?? []) {
    const signature = connectorSignatureV4(connector)
    if (dedupe && seen.has(signature)) {
      duplicates.push({ kept:seen.get(signature).endpointId, source:connector.source ?? null })
      continue
    }
    const hash = hashConnectorSignatureV4(signature)
    const previousHashSignature = hashes.get(hash)
    if (previousHashSignature && previousHashSignature !== signature) collisions.push({ hash, a:previousHashSignature, b:signature })
    else hashes.set(hash,signature)

    const copy = cloneConnectorV4(connector)
    copy.endpointId = `v4:${normalizedFile}:${hash}`
    copy.identityVersion = CONNECTOR_IDENTITY_VERSION_V4
    copy.identitySignature = signature
    seen.set(signature,copy)
    result.push(copy)
  }

  if (collisions.length) {
    // A hash collision is extraordinarily unlikely, but silently merging endpoint
    // identity would corrupt saved projects. Fail closed and make the problem loud.
    throw new Error(`Connector V4 endpoint hash collision in ${normalizedFile}: ${collisions.map(item=>item.hash).join(', ')}`)
  }

  return { connectors:result, duplicates, collisions, stats:{ input:(connectors??[]).length, output:result.length, deduplicated:duplicates.length } }
}
