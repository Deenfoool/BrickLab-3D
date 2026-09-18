import {
  createBodyDescriptor,
  createEndpointDescriptor,
  deterministicId,
  evidence,
} from '../core/model.js'
import { classifyEndpointSemantics, enrichEndpointSemantics } from './endpoint-semantics.js'
import { classifyPartFamily } from './family-classifier.js'
import { buildMechanicalFingerprint } from './fingerprint.js'

export const PART_DESCRIPTOR_VERSION = 'mechanics-part-descriptor-0.1.0'

function transmissionHints(classification) {
  const role = classification?.role
  const properties = classification?.properties || {}
  const hints = []

  if (['spur-gear','bevel-gear','crown-gear','clutch-gear'].includes(role)) {
    hints.push(Object.freeze({
      kind:role === 'bevel-gear' ? 'bevel-gear' : role,
      toothCount:properties.toothCount ?? null,
      pitchRadius:properties.gearGeometry?.pitchRadius ?? (properties.toothCount ? properties.toothCount/16 : null),
      gearGeometry:properties.gearGeometry ?? null,
      equationFamily:'gear-mesh',
    }))
  } else if (role === 'worm') {
    hints.push(Object.freeze({ kind:'worm', equationFamily:'worm', defaultBackdrive:false }))
  } else if (role === 'rack') {
    hints.push(Object.freeze({ kind:'rack', equationFamily:'rack-pinion' }))
  } else if (role === 'differential') {
    if (Number.isFinite(properties.toothCount) && properties.toothCount > 0) {
      hints.push(Object.freeze({
        kind:'bevel-gear',
        toothCount:properties.toothCount,
        pitchRadius:properties.gearGeometry?.pitchRadius ?? properties.toothCount/16,
        gearGeometry:properties.gearGeometry ?? null,
        equationFamily:'gear-mesh',
        mechanicalRole:'carrier-input-gear',
      }))
    }
    hints.push(Object.freeze({
      kind:'differential',
      equationFamily:'three-port-differential',
      mechanicalRole:'carrier',
    }))
  } else if (role === 'pulley') {
    hints.push(Object.freeze({ kind:'pulley', equationFamily:'belt', slipPossible:true }))
  } else if (role === 'universal-joint') {
    hints.push(Object.freeze({ kind:'universal-joint', equationFamily:'angular-coupling' }))
  } else if (role === 'cv-joint') {
    hints.push(Object.freeze({ kind:'cv-joint', equationFamily:'constant-velocity-coupling' }))
  } else if (role === 'linear-actuator') {
    hints.push(Object.freeze({ kind:'linear-actuator', equationFamily:'screw-linear' }))
  }

  return Object.freeze(hints)
}

function endpointTemplateKey(endpoint, index) {
  return String(
    endpoint?.metadata?.legacyEndpointId ??
    endpoint?.metadata?.sourceEndpointId ??
    endpoint?.id ??
    `endpoint-${index}`
  )
}

export function createPartMechanicalDescriptor({
  observation,
  endpoints = [],
} = {}) {
  if (!observation?.id) throw new TypeError('Part descriptor requires catalog observation')

  const normalizedEndpoints = Object.freeze(endpoints.map(enrichEndpointSemantics))
  const classification = classifyPartFamily(observation, normalizedEndpoints)
  const fingerprint = buildMechanicalFingerprint({ classification, endpoints:normalizedEndpoints })
  const templateBodyId = deterministicId('body-template', observation.id, fingerprint.id)

  const endpointTemplates = Object.freeze(normalizedEndpoints.map((endpoint, index) => {
    const semantic = classifyEndpointSemantics(endpoint)
    return Object.freeze({
      ...endpoint,
      bodyId:templateBodyId,
      templateKey:endpointTemplateKey(endpoint, index),
      metadata:Object.freeze({
        ...(endpoint.metadata || {}),
        semantics:semantic,
      }),
    })
  }))

  return Object.freeze({
    version:PART_DESCRIPTOR_VERSION,
    partId:String(observation.id),
    code:observation?.ldraw?.code ?? null,
    file:observation?.ldraw?.file ?? null,
    name:observation?.name ?? observation?.description ?? observation.id,
    classification,
    bodyPolicy:classification.bodyPolicy,
    templateBodyId,
    endpoints:endpointTemplates,
    fingerprint,
    transmissionHints:transmissionHints(classification),
    evidence:evidence({
      source:'mechanics-next:part-intelligence',
      confidence:classification.confidence,
      reason:'catalog + normalized connector semantics',
      detail:{
        endpointCount:endpointTemplates.length,
        fingerprint:fingerprint.id,
      },
    }),
  })
}

export function instantiatePartMechanicalDescriptor(descriptor, {
  instanceId,
  metadata = null,
} = {}) {
  if (!descriptor?.partId || !instanceId) throw new TypeError('Part instance requires descriptor and instanceId')
  const bodyId = deterministicId('body', descriptor.partId, instanceId)

  const body = createBodyDescriptor({
    id:bodyId,
    instanceId,
    partId:descriptor.partId,
    family:descriptor.classification.family,
    role:descriptor.classification.role,
    metadata:{
      bodyPolicy:descriptor.bodyPolicy,
      fingerprint:descriptor.fingerprint.id,
      classification:descriptor.classification,
      ...(metadata || {}),
    },
    evidence:descriptor.evidence,
  })

  const endpoints = Object.freeze(descriptor.endpoints.map((template, index) =>
    createEndpointDescriptor({
      id:deterministicId('endpoint', bodyId, template.templateKey || endpointTemplateKey(template, index)),
      bodyId,
      family:template.family,
      gender:template.gender,
      frame:template.frame,
      profile:template.profile,
      capabilities:template.capabilities,
      metadata:{
        ...(template.metadata || {}),
        templateKey:template.templateKey || endpointTemplateKey(template, index),
      },
      evidence:template.evidence,
    })
  ))

  return Object.freeze({
    descriptor,
    body,
    endpoints,
    transmissions:descriptor.transmissionHints,
  })
}
