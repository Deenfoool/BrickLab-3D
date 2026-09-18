import { deterministicId, evidence } from '../core/model.js'
import { createConstraint } from '../constraints/dof.js'
import { endpointSemanticKind } from './endpoint-semantics.js'
import { mechanicalInterfaceRule } from './interface-rules.js'

function evidenceConfidence(tier) {
  if (tier === 'A') return 'verified'
  if (tier === 'B') return 'strong'
  if (tier === 'C') return 'inferred'
  return 'weak'
}

function endpointByLegacyId(instance, endpointId) {
  return instance?.endpoints?.find(endpoint =>
    endpoint?.metadata?.legacyEndpointId === endpointId ||
    endpoint?.metadata?.sourceEndpointId === endpointId ||
    endpoint?.metadata?.templateKey === endpointId
  ) ?? null
}

function variants(kind, legacyMatch = null) {
  if (kind === 'technic-axle') return ['axle']
  if (kind === 'technic-axle-hole') return ['axle-hole']
  if (kind === 'technic-round-hole') return ['round-hole']
  if (kind === 'technic-pin') return ['technic-pin']
  if (kind === 'technic-pin-hole') return ['technic-hole','round-hole']
  if (kind === 'bar') return ['bar']
  if (kind === 'bar-hole') return ['round-hole']
  if (kind === 'stud') return ['stud']
  if (kind === 'anti-stud') return ['anti-stud']
  if (kind === 'ball') return ['ball']
  if (kind === 'socket') return ['socket']
  if (kind === 'ball-socket') return ['ball','socket']
  if (kind === 'clip') return ['clip']
  if (kind === 'hinge-fingers') return ['hinge','fingers']
  if (kind === 'click-hinge') return ['click-hinge','fingers']
  if (kind === 'turntable-bearing') return ['turntable']
  if (kind === 'steering-pivot') return ['steering-pivot']
  if (kind === 'linear-guide' || kind === 'rack-guide') return ['linear-guide']
  if (kind === 'linear-actuator-guide') return ['linear-actuator-guide']
  if (kind === 'pneumatic-cylinder-guide') return ['pneumatic-cylinder-guide']
  if (kind === 'engine-slider') return ['engine-slider']
  if (kind === 'wheel-retainer') return ['wheel-retainer']
  if (kind === 'driving-ring') return ['driving-ring']
  if (kind === 'wheel-axle-interface') return ['axle-hole']

  if (kind === 'technic-axle-pin') {
    const family = String(legacyMatch?.family || '')
    if (/keyed|axle-keyed/.test(family)) return ['axle']
    if (/pin-hole/.test(family)) return ['technic-pin']
    if (/round-hole/.test(family)) return ['axle']
    return ['axle','technic-pin']
  }
  return [kind]
}

function specialRelation(kindA, kindB) {
  const pair = new Set([kindA, kindB])
  if (pair.has('differential-internal-interface')) {
    return Object.freeze({
      kind:'differential-port',
      structural:false,
      transmission:true,
      reason:'LDCad differential internal interface',
    })
  }
  if (pair.has('universal-joint-port')) {
    return Object.freeze({
      kind:'universal-joint-port',
      structural:false,
      transmission:true,
      reason:'LDCad universal joint compound port',
    })
  }
  if (pair.has('flex-system-end')) {
    return Object.freeze({
      kind:'flex-system-port',
      structural:false,
      transmission:false,
      deformable:true,
      reason:'flexible system endpoint',
    })
  }
  return null
}

function resolveRule(endpointA, endpointB, {
  match = null,
  partRoleA = null,
  partRoleB = null,
} = {}) {
  const kindA = endpointSemanticKind(endpointA)
  const kindB = endpointSemanticKind(endpointB)
  const special = specialRelation(kindA, kindB)
  if (special) return { special, kindA, kindB, rule:null, interfacePair:null }

  if (kindA === 'rim-tire-interface' && kindB === 'rim-tire-interface') {
    if (partRoleA === 'tire' && partRoleB === 'rim') {
      return { kindA, kindB, rule:mechanicalInterfaceRule('tyre','rim'), interfacePair:['tyre','rim'] }
    }
    if (partRoleA === 'rim' && partRoleB === 'tire') {
      return { kindA, kindB, rule:mechanicalInterfaceRule('rim','tyre'), interfacePair:['rim','tyre'] }
    }
  }

  for (const a of variants(kindA, match)) {
    for (const b of variants(kindB, match)) {
      const rule = mechanicalInterfaceRule(a, b)
      if (rule) return { kindA, kindB, rule, interfacePair:[a,b] }
    }
  }
  return { kindA, kindB, rule:null, interfacePair:null, special:null }
}

function localPosition(endpoint) {
  const frame = endpoint?.frame || {}
  if (Array.isArray(frame.positionStud) && frame.positionStud.length === 3) {
    return frame.positionStud.map(Number)
  }
  if (Array.isArray(frame.positionLdu) && frame.positionLdu.length === 3) {
    return frame.positionLdu.map(value => Number(value) / 20)
  }
  return [0,0,0]
}

function localAxis(endpoint) {
  const frame = endpoint?.frame || {}
  const orientation = frame.orientationBrickLab ?? frame.orientation
  if (!Array.isArray(orientation) || orientation.length !== 9) return [0,1,0]
  const axis = [-Number(orientation[1]), -Number(orientation[4]), -Number(orientation[7])]
  const length = Math.hypot(...axis)
  return length > 1e-9 ? axis.map(value => value / length) : [0,1,0]
}

function worldFrame(object, endpoint) {
  const position = localPosition(endpoint)
  const axis = localAxis(endpoint)
  object?.updateMatrixWorld?.(true)
  const m = object?.matrixWorld?.elements
  if (!m || m.length !== 16) {
    const offset = object?.position
      ? [Number(object.position.x) || 0, Number(object.position.y) || 0, Number(object.position.z) || 0]
      : [0,0,0]
    return {
      position:position.map((value, index) => value + offset[index]),
      axis,
      degraded:true,
    }
  }

  const p = [
    m[0]*position[0] + m[4]*position[1] + m[8]*position[2] + m[12],
    m[1]*position[0] + m[5]*position[1] + m[9]*position[2] + m[13],
    m[2]*position[0] + m[6]*position[1] + m[10]*position[2] + m[14],
  ]
  const transformedAxis = [
    m[0]*axis[0] + m[4]*axis[1] + m[8]*axis[2],
    m[1]*axis[0] + m[5]*axis[1] + m[9]*axis[2],
    m[2]*axis[0] + m[6]*axis[1] + m[10]*axis[2],
  ]
  const length = Math.hypot(...transformedAxis)
  return {
    position:p,
    axis:length > 1e-9 ? transformedAxis.map(value => value / length) : axis,
    degraded:false,
  }
}

export function interpretObservedConnection(record, {
  sceneObserver,
  objectById = () => null,
} = {}) {
  if (!record?.a?.instanceId || !record?.b?.instanceId) {
    return Object.freeze({ valid:false, reason:'connection-instance-identity-missing', recordId:record?.id ?? null })
  }

  const instanceA = sceneObserver?.instance?.(record.a.instanceId)
  const instanceB = sceneObserver?.instance?.(record.b.instanceId)
  if (!instanceA || !instanceB) {
    return Object.freeze({ valid:false, reason:'mechanical-instance-missing', recordId:record.id ?? null })
  }

  const endpointA = endpointByLegacyId(instanceA, record.a.endpointId)
  const endpointB = endpointByLegacyId(instanceB, record.b.endpointId)
  if (!endpointA || !endpointB) {
    return Object.freeze({
      valid:false,
      reason:'normalized-endpoint-missing',
      recordId:record.id ?? null,
      missing:{
        a:!endpointA ? record.a.endpointId : null,
        b:!endpointB ? record.b.endpointId : null,
      },
    })
  }

  const resolved = resolveRule(endpointA, endpointB, {
    match:record.match,
    partRoleA:instanceA.descriptor.classification.role,
    partRoleB:instanceB.descriptor.classification.role,
  })

  if (resolved.special) {
    return Object.freeze({
      valid:true,
      type:'relation',
      recordId:record.id ?? null,
      relation:Object.freeze({
        id:deterministicId('mechanical-relation', record.id, resolved.special.kind),
        ...resolved.special,
        bodyA:instanceA.body.id,
        bodyB:instanceB.body.id,
        endpointA:endpointA.id,
        endpointB:endpointB.id,
      }),
      diagnostics:Object.freeze({
        semanticA:resolved.kindA,
        semanticB:resolved.kindB,
      }),
    })
  }

  if (!resolved.rule) {
    return Object.freeze({
      valid:false,
      reason:'interface-rule-unresolved',
      recordId:record.id ?? null,
      semanticA:resolved.kindA,
      semanticB:resolved.kindB,
      legacyMatchFamily:record?.match?.family ?? null,
    })
  }

  const objectA = objectById(record.a.instanceId)
  const referenceFrame = worldFrame(objectA, endpointA)
  const tier = resolved.rule.evidence?.tier || 'D'
  const constraint = createConstraint({
    id:deterministicId('constraint', record.id, instanceA.body.id, instanceB.body.id),
    bodyA:instanceA.body.id,
    bodyB:instanceB.body.id,
    kind:resolved.rule.kind,
    dof:resolved.rule.topology.dof,
    frameA:endpointA.frame,
    frameB:endpointB.frame,
    referenceFrame,
    metadata:{
      observedConnectionId:record.id ?? null,
      instanceAId:String(record.a.instanceId),
      instanceBId:String(record.b.instanceId),
      endpointAId:endpointA.id,
      endpointBId:endpointB.id,
      observedEndpointAId:record.a.endpointId??null,
      observedEndpointBId:record.b.endpointId??null,
      interfacePair:resolved.interfacePair,
      semanticA:resolved.kindA,
      semanticB:resolved.kindB,
      dynamics:resolved.rule.dynamics,
      topology:resolved.rule.topology,
      legacyMatchFamily:record?.match?.family ?? null,
      occupancy:record?.occupancy ?? null,
    },
    evidence:evidence({
      source:'mechanics-next:connection-interpreter',
      confidence:evidenceConfidence(tier),
      reason:resolved.rule.evidence?.source || 'mechanical interface rule',
      detail:{ tier },
    }),
  })

  return Object.freeze({
    valid:true,
    type:'constraint',
    recordId:record.id ?? null,
    constraint,
    diagnostics:Object.freeze({
      semanticA:resolved.kindA,
      semanticB:resolved.kindB,
      interfacePair:Object.freeze(resolved.interfacePair),
      referenceFrameDegraded:referenceFrame.degraded,
    }),
  })
}

export class ShadowConnectionInterpreter {
  #graph
  #sceneObserver
  #objectById
  #owned = new Map()
  #relations = new Map()
  #unresolved = new Map()
  #syncCount = 0

  constructor({ graph, sceneObserver, objectById = () => null } = {}) {
    if (!graph?.addConstraint || !graph?.removeEdge) throw new TypeError('Connection interpreter requires assembly graph')
    if (!sceneObserver?.instance) throw new TypeError('Connection interpreter requires scene observer')
    this.#graph = graph
    this.#sceneObserver = sceneObserver
    this.#objectById = objectById
  }

  sync(records = []) {
    const seen = new Set()
    let added = 0
    let updated = 0
    let unchanged = 0

    for (const record of records || []) {
      const recordId = String(record?.id || deterministicId(
        'observed-connection',
        record?.a?.instanceId, record?.a?.endpointId,
        record?.b?.instanceId, record?.b?.endpointId,
      ))
      seen.add(recordId)

      const interpretation = interpretObservedConnection({ ...record, id:recordId }, {
        sceneObserver:this.#sceneObserver,
        objectById:this.#objectById,
      })

      if (!interpretation.valid) {
        const previous = this.#owned.get(recordId)
        if (previous) this.#graph.removeEdge(previous.edgeId)
        this.#owned.delete(recordId)
        this.#relations.delete(recordId)
        this.#unresolved.set(recordId, interpretation)
        continue
      }

      this.#unresolved.delete(recordId)
      if (interpretation.type === 'relation') {
        const previous = this.#owned.get(recordId)
        if (previous) this.#graph.removeEdge(previous.edgeId)
        this.#owned.delete(recordId)
        this.#relations.set(recordId, interpretation.relation)
        continue
      }

      this.#relations.delete(recordId)
      const constraint = interpretation.constraint
      const token = JSON.stringify({
        id:constraint.id,
        bodyA:constraint.bodyA,
        bodyB:constraint.bodyB,
        kind:constraint.kind,
        pair:constraint.metadata?.interfacePair,
        frame:constraint.referenceFrame,
      })
      const previous = this.#owned.get(recordId)
      if (previous?.token === token && this.#graph.edge(previous.edgeId)) {
        unchanged += 1
        continue
      }

      if (previous) {
        this.#graph.removeEdge(previous.edgeId)
        updated += 1
      } else {
        added += 1
      }

      this.#graph.addConstraint(constraint)
      this.#owned.set(recordId, Object.freeze({ edgeId:constraint.id, token }))
    }

    let removed = 0
    for (const [recordId, previous] of [...this.#owned]) {
      if (seen.has(recordId)) continue
      this.#graph.removeEdge(previous.edgeId)
      this.#owned.delete(recordId)
      removed += 1
    }
    for (const recordId of [...this.#relations.keys()]) {
      if (!seen.has(recordId)) this.#relations.delete(recordId)
    }
    for (const recordId of [...this.#unresolved.keys()]) {
      if (!seen.has(recordId)) this.#unresolved.delete(recordId)
    }

    this.#syncCount += 1
    return Object.freeze({
      syncCount:this.#syncCount,
      records:(records || []).length,
      constraints:this.#owned.size,
      relations:this.#relations.size,
      unresolved:this.#unresolved.size,
      added,
      updated,
      removed,
      unchanged,
    })
  }

  relations() {
    return Object.freeze([...this.#relations.values()])
  }

  unresolved() {
    return Object.freeze([...this.#unresolved.values()])
  }

  stats() {
    return Object.freeze({
      syncCount:this.#syncCount,
      constraints:this.#owned.size,
      relations:this.#relations.size,
      unresolved:this.#unresolved.size,
    })
  }
}

export function createShadowConnectionInterpreter(options) {
  return new ShadowConnectionInterpreter(options)
}
