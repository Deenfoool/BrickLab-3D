import { cloneMechanical } from '../core/model.js'

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.freeze(value)
  for (const nested of Object.values(value)) deepFreeze(nested)
  return value
}

function snapshot(value) {
  return deepFreeze(cloneMechanical(value))
}

function safeArray(value) {
  return Array.isArray(value) ? value : []
}

export function observePartDefinition(definition) {
  if (!definition?.id) return null
  return snapshot({
    id:String(definition.id),
    name:definition.name ?? null,
    description:definition.description ?? null,
    category:definition.category ?? null,
    tags:safeArray(definition.tags).map(String),
    defaultColor:definition.defaultColor ?? null,
    builtinConnectors:safeArray(definition.connectors).map(connector=>({
      id:connector.id??null,
      type:connector.type??null,
      position:Array.isArray(connector.position)?connector.position.slice(0,3).map(Number):null,
      axis:Array.isArray(connector.axis)?connector.axis.slice(0,3).map(Number):null,
    })),
    ldraw:definition.ldraw ? {
      code:definition.ldraw.code ?? null,
      file:definition.ldraw.file ?? null,
      level:definition.ldraw.level ?? null,
      mechanicalClass:definition.ldraw.mechanicalClass ?? null,
      mechanicalConfidence:definition.ldraw.mechanicalConfidence ?? null,
      mechanicalSource:definition.ldraw.mechanicalSource ?? null,
    } : null,
    rackVisualMetrics:definition.rackVisualMetrics ?? null,
    legacyMechanicalIntelligence:definition.mechanicalIntelligence ? {
      class:definition.mechanicalIntelligence.class ?? null,
      confidence:definition.mechanicalIntelligence.confidence ?? null,
      source:definition.mechanicalIntelligence.source ?? null,
      evidence:safeArray(definition.mechanicalIntelligence.evidence),
      properties:definition.mechanicalIntelligence.properties ?? {},
    } : null,
    legacyMechanics:definition.mechanics ? {
      gear:definition.mechanics.gear ?? null,
      shaft:definition.mechanics.shaft === true,
      wheel:definition.mechanics.wheel ?? null,
      motor:definition.mechanics.motor ?? null,
      differential:definition.mechanics.differential ?? null,
      transmission:definition.mechanics.transmission ?? null,
      wormDrive:definition.mechanics.wormDrive ?? null,
      rackGear:definition.mechanics.rackGear ?? null,
      steeringRack:definition.mechanics.steeringRack ?? null,
      steeringKnuckle:definition.mechanics.steeringKnuckle ?? null,
      steeringBase:definition.mechanics.steeringBase ?? null,
      articulatedCoupler:definition.mechanics.articulatedCoupler ?? null,
      classification:definition.mechanics.classification ?? null,
    } : null,
  })
}

export function createCatalogObservationProvider(subsystems) {
  const parts = subsystems?.parts
  if (!parts || typeof parts.list !== 'function' || typeof parts.get !== 'function') {
    throw new TypeError('Catalog observation provider requires BrickLabSubsystems.parts')
  }

  return Object.freeze({
    get(partId) {
      const definition = parts.get(partId)
      return definition ? observePartDefinition(definition) : null
    },
    listIds() {
      return Object.freeze(parts.list().map(definition => String(definition?.id || '')).filter(Boolean))
    },
  })
}
