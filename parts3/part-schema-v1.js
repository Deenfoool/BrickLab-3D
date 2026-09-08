export const PART_SCHEMA_VERSION = 'part-schema-v1'

const finite3 = value => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite)

export function normalizeConnector(connector, index = 0) {
  if (!connector || typeof connector !== 'object') throw new TypeError(`Connector ${index} must be an object`)
  if (!connector.id) throw new Error(`Connector ${index} is missing id`)
  if (!connector.type) throw new Error(`Connector ${connector.id} is missing type`)
  if (!finite3(connector.position)) throw new Error(`Connector ${connector.id} has invalid position`)
  if (!finite3(connector.axis)) throw new Error(`Connector ${connector.id} has invalid axis`)
  const axisLength = Math.hypot(...connector.axis)
  if (axisLength < 1e-8) throw new Error(`Connector ${connector.id} has a zero axis`)
  return {
    ...connector,
    position: [...connector.position],
    axis: connector.axis.map(value => value / axisLength),
  }
}

export function definePart(spec) {
  const identity = spec?.identity ?? {}
  const id = identity.id ?? spec?.id
  const name = identity.name ?? spec?.name
  const category = identity.category ?? spec?.category
  if (!id || !name || !category) throw new Error('Part identity requires id, name and category')
  if (typeof spec?.create !== 'function') throw new Error(`Part ${id} requires create(color)`)

  const connectors = (spec.connectors ?? []).map(normalizeConnector)
  const duplicate = connectors.find((connector, index) => connectors.findIndex(item => item.id === connector.id) !== index)
  if (duplicate) throw new Error(`Part ${id} has duplicate connector id ${duplicate.id}`)

  return {
    id,
    name,
    category,
    icon: identity.icon ?? spec.icon ?? '◇',
    description: identity.description ?? spec.description ?? '',
    defaultColor: spec.visual?.defaultColor ?? spec.defaultColor ?? 0xadb5bd,
    tags: [...new Set(spec.tags ?? [])],
    connectors,
    create: spec.create,
    ...(spec.dimensions ? { dimensions: { ...spec.dimensions } } : {}),
    ...(spec.visual ? { visual: { ...spec.visual } } : {}),
    ...(spec.physics ? { physics: { ...spec.physics } } : {}),
    ...(spec.mechanics ? { mechanics: structuredCloneSafe(spec.mechanics) } : {}),
    schemaVersion: PART_SCHEMA_VERSION,
  }
}

function structuredCloneSafe(value) {
  if (typeof structuredClone === 'function') return structuredClone(value)
  return JSON.parse(JSON.stringify(value))
}

export function installPart(parts, spec, { replace = false } = {}) {
  const part = definePart(spec)
  const index = parts.findIndex(item => item.id === part.id)
  if (index < 0) parts.push(part)
  else if (replace) parts[index] = { ...parts[index], ...part }
  return parts.find(item => item.id === part.id)
}

export function patchPart(parts, id, patch = {}) {
  const part = parts.find(item => item.id === id)
  if (!part) return null
  Object.assign(part, patch)
  part.schemaVersion ??= PART_SCHEMA_VERSION
  return part
}
