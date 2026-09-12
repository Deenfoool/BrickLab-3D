import { FrameBudgetScheduler } from '../performance/work-queue-v1.js'
import { buildPhysicsPlanV4, drivetrainSemanticLinksV4 } from '../connectors-v4/physics-policy-v4.js'
import { hardenPhysicsPlanV4 } from '../connectors-v4/physics-plan-safety-v4.js'
import {
  bestAssemblyChoice,
  isCompatibleAssemblyPresent,
} from './assembly-compatibility-v1.js?v=smart-assembly-20260911-v6'

export const DESIGN_DOCTOR_ENGINE_VERSION = 'design-doctor-engine-v1.0.1'

export const DESIGN_DOCTOR_SEVERITY = Object.freeze({
  ERROR:'error',
  WARNING:'warning',
  INFO:'info',
})

const severityRank = Object.freeze({ error:0, warning:1, info:2 })

function humanizeReason(value = '') {
  return String(value || 'unknown')
    .replace(/^live-geometry:/, '')
    .replace(/^physics-override-/, '')
    .replace(/^unsupported-family:/, 'unsupported family: ')
    .replace(/[-_:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function issueId(...parts) {
  return parts.map(value => String(value ?? '')).join('::')
}

function issue({ id, severity='warning', family, title, message, reason=null, source, object=null, instanceId=null, partId=null, connectionId=null, connectorId=null, details=null } = {}) {
  return Object.freeze({
    id,
    severity,
    family,
    title,
    message,
    reason,
    source,
    object,
    instanceId:instanceId ?? object?.userData?.instanceId ?? null,
    partId:partId ?? object?.userData?.partId ?? null,
    connectionId,
    connectorId,
    details:details ? Object.freeze({ ...details }) : null,
  })
}

function connectionInstanceIds(connection) {
  return [connection?.a?.instanceId, connection?.b?.instanceId].filter(Boolean)
}

function definitionHasConnectors(definition) {
  return Boolean(
    definition?.connectors?.length ||
    (definition?.connectivityV4?.status === 'ready' && definition?.connectivityV4?.connectors?.length),
  )
}

function buildConnectionContext(objects, projectState, v4Records) {
  const connected = new Set()
  const legacy = Array.isArray(projectState?.connections) ? projectState.connections : []
  for (const connection of [...legacy, ...v4Records]) {
    for (const instanceId of connectionInstanceIds(connection)) connected.add(instanceId)
  }

  const endpointUse = new Map()
  for (const connection of v4Records) {
    for (const side of ['a','b']) {
      const endpoint = connection?.[side]
      if (!endpoint?.instanceId || !endpoint?.endpointId) continue
      const key = `${endpoint.instanceId}::${endpoint.endpointId}`
      const bucket = endpointUse.get(key) ?? []
      bucket.push({ connection, side, endpoint })
      endpointUse.set(key, bucket)
    }
  }

  const byId = new Map(objects.map(object => [object?.userData?.instanceId, object]))
  const duplicateInstanceIds = new Map()
  for (const object of objects) {
    const id = object?.userData?.instanceId
    if (!id) continue
    const bucket = duplicateInstanceIds.get(id) ?? []
    bucket.push(object)
    duplicateInstanceIds.set(id, bucket)
  }

  return { connected, endpointUse, byId, duplicateInstanceIds, legacy }
}

function physicsPreview(objects, v4Records, subsystems) {
  const v4 = globalThis.BrickLabConnectorV4
  if (!v4 || !v4Records.length) return { status:'empty', pass:true, blockers:[], joints:[] }

  const notReady = new Set()
  for (const connection of v4Records) {
    for (const side of ['a','b']) {
      const partId = connection?.[side]?.partId
      if (!partId) continue
      const def = subsystems.parts.get(partId)
      if (def?.connectivityV4?.status !== 'ready') notReady.add(partId)
    }
  }
  if (notReady.size) {
    return { status:'pending', pass:null, blockers:[], joints:[], pendingPartIds:[...notReady] }
  }

  try {
    const raw = buildPhysicsPlanV4({
      objects,
      connections:v4Records,
      getConnector:(partId, endpointId) => v4.getConnector?.(partId, endpointId) ?? null,
    })
    return { status:'ready', ...hardenPhysicsPlanV4(raw) }
  } catch (error) {
    return {
      status:'error',
      pass:false,
      joints:[],
      blockers:[{ connectionId:null, family:null, reason:`preflight-error:${error?.message || error}` }],
    }
  }
}

function drivetrainPreview(objects, connectionContext, v4Records, subsystems) {
  try {
    const semantic = drivetrainSemanticLinksV4(v4Records)
    const connections = [...connectionContext.legacy, ...semantic]
    return subsystems.mechanics.analyze(objects, connections)
  } catch (error) {
    return { error:String(error?.message || error), shafts:[], motors:[], conflicts:[], stats:{ conflicts:0 } }
  }
}

function objectIssueChecks(object, context) {
  const issues = []
  const { subsystems, objects, connectionContext } = context
  const instanceId = object?.userData?.instanceId ?? null
  const partId = object?.userData?.partId ?? null
  const def = subsystems.parts.get(partId)

  if (!instanceId) {
    issues.push(issue({
      id:issueId('integrity','missing-instance-id',partId),
      severity:'error', family:'project-integrity', title:'Part has no instance identity',
      message:'This scene object cannot participate safely in project graph diagnostics until it has a stable instance ID.',
      reason:'missing-instance-id', source:'project-integrity-v1', object, partId,
    }))
  }

  if (!def) {
    issues.push(issue({
      id:issueId('integrity','missing-definition',instanceId,partId),
      severity:'error', family:'project-integrity', title:'Part definition is missing',
      message:`The placed object references ${partId || 'an unknown part'}, but the live PARTS registry has no matching definition.`,
      reason:'missing-part-definition', source:'project-integrity-v1', object, instanceId, partId,
    }))
    return issues
  }

  if (instanceId && (connectionContext.duplicateInstanceIds.get(instanceId)?.length ?? 0) > 1) {
    issues.push(issue({
      id:issueId('integrity','duplicate-instance',instanceId),
      severity:'error', family:'project-integrity', title:'Duplicate instance ID',
      message:'Two or more placed parts share one project identity, which can corrupt graph references and saved state.',
      reason:'duplicate-instance-id', source:'project-integrity-v1', object, instanceId, partId,
    }))
  }

  if (objects.length > 1 && definitionHasConnectors(def) && instanceId && !connectionContext.connected.has(instanceId)) {
    issues.push(issue({
      id:issueId('connectivity','floating',instanceId),
      severity:'warning', family:'floating-part', title:'Part is not connected',
      message:'This part exposes connector capability but is not referenced by the current BUILD connection graph.',
      reason:'no-project-connection', source:'connector-project-state', object, instanceId, partId,
    }))
  }

  if (def?.id?.startsWith?.('ldraw-')) {
    const intelligence = def.mechanicalIntelligence
    if (!intelligence || intelligence.confidence === 'unknown') {
      issues.push(issue({
        id:issueId('mechanical','unknown',instanceId),
        severity:'info', family:'mechanical-metadata', title:'Mechanical role is unresolved',
        message:'The LDraw part is available visually, but BrickLab has no verified or conservative mechanical classification for it yet.',
        reason:'mechanical-confidence-unknown', source:intelligence?.source || 'ldraw-mechanical-intelligence', object, instanceId, partId,
      }))
    }

    if (def.connectivityV4?.status === 'ready') {
      const audit = subsystems.connectivity.build.audit(partId)
      if (audit?.status === 'ready' && audit.pass === false) {
        const hard = Boolean(audit.duplicateEndpointIds?.length || audit.missingEndpointIds?.length || audit.validationErrors?.length)
        issues.push(issue({
          id:issueId('connector-audit',instanceId),
          severity:hard ? 'error' : 'warning', family:'connector-audit', title:'Connector definition needs attention',
          message:hard
            ? 'Connector V4 found invalid or ambiguous endpoint data on this part.'
            : 'Connector V4 coverage does not fully agree with the legacy connector representation.',
          reason:'connector-v4-audit-failed', source:'connector-v4-audit', object, instanceId, partId,
          details:{
            unmatchedLegacy:audit.unmatchedLegacy?.length ?? 0,
            duplicateEndpointIds:audit.duplicateEndpointIds?.length ?? 0,
            missingEndpointIds:audit.missingEndpointIds?.length ?? 0,
            validationErrors:audit.validationErrors?.length ?? 0,
          },
        }))
      }
    }
  }

  const choice = bestAssemblyChoice(def, subsystems.parts.list())
  if (choice && !isCompatibleAssemblyPresent(object, def, objects, value => subsystems.parts.get(value))) {
    issues.push(issue({
      id:issueId('assembly',choice.familyId,instanceId),
      severity:'warning', family:'incomplete-assembly',
      title:choice.targetRole === 'rim' ? 'Tire is missing a compatible rim' : 'Rim is missing a compatible tire',
      message:`BrickLab has verified compatibility data for ${choice.targetCode}, but no compatible counterpart is assembled at this part.`,
      reason:`missing-${choice.targetRole}`, source:'smart-assembly-compatibility', object, instanceId, partId,
      details:{ familyId:choice.familyId, suggestedPartId:choice.targetPartId, confidence:choice.confidence },
    }))
  }

  return issues
}

function endpointConflictIssues(context) {
  const issues = []
  for (const [key, uses] of context.connectionContext.endpointUse) {
    if (uses.length <= 1) continue
    const first = uses[0]
    const object = context.connectionContext.byId.get(first.endpoint.instanceId) ?? null
    issues.push(issue({
      id:issueId('endpoint-conflict',key),
      severity:'error', family:'endpoint-occupancy', title:'Connector endpoint is occupied more than once',
      message:`${uses.length} V4 connection records reference the same physical endpoint. The graph should never require one endpoint to satisfy multiple independent occupations.`,
      reason:'duplicate-endpoint-occupancy', source:'connector-v4-graph', object,
      instanceId:first.endpoint.instanceId, partId:object?.userData?.partId ?? null,
      connectorId:first.endpoint.endpointId, connectionId:first.connection?.id ?? null,
      details:{ connectionIds:uses.map(use => use.connection?.id).filter(Boolean) },
    }))
  }
  return issues
}

function physicsIssues(context) {
  const issues = []
  const { physics, v4Records, connectionContext } = context
  if (physics?.status === 'pending') {
    for (const partId of physics.pendingPartIds ?? []) {
      const object = context.objects.find(item => item?.userData?.partId === partId) ?? null
      issues.push(issue({
        id:issueId('physics','pending',partId), severity:'info', family:'physics-preflight',
        title:'Physics certification is still pending',
        message:'Connector V4 has not finished hydrating every endpoint required for a deterministic SIMULATE preflight.',
        reason:'connector-hydration-pending', source:'physics-policy-v4', object, partId,
      }))
    }
    return issues
  }

  const byConnection = new Map(v4Records.map(record => [record.id, record]))
  for (const blocker of physics?.blockers ?? []) {
    const connection = byConnection.get(blocker.connectionId) ?? null
    const object = connection ? connectionContext.byId.get(connection.a?.instanceId) ?? null : null
    const reasonText = humanizeReason(blocker.reason)
    const constraintConflict = /over|conflict|locked|constraint/i.test(blocker.reason || '')
    const geometryConflict = /^live-geometry:/i.test(blocker.reason || '')
    issues.push(issue({
      id:issueId('physics-blocker',blocker.connectionId,blocker.reason),
      severity:'error',
      family:constraintConflict ? 'constraint-conflict' : geometryConflict ? 'collision-or-alignment' : 'simulate-blocker',
      title:constraintConflict ? 'Mechanism constraint conflict' : geometryConflict ? 'Connected geometry is invalid' : 'Connection blocks SIMULATE',
      message:`Connector V4 physics safety will fail closed for this relationship: ${reasonText}.`,
      reason:blocker.reason, source:'connector-v4-physics-policy', object,
      instanceId:object?.userData?.instanceId ?? null, partId:object?.userData?.partId ?? null,
      connectionId:blocker.connectionId ?? null, details:{ family:blocker.family ?? null },
    }))
  }
  return issues
}

function drivetrainConflictIssues(context) {
  const issues = []
  const shafts = new Map((context.drivetrain?.shafts ?? []).map(shaft => [shaft.id, shaft]))
  for (const conflict of context.drivetrain?.conflicts ?? []) {
    const shaft = shafts.get(conflict.shaftId)
    const instanceId = shaft?.memberIds?.[0] ?? null
    const object = instanceId ? context.connectionContext.byId.get(instanceId) ?? null : null
    issues.push(issue({
      id:issueId('drivetrain-conflict',conflict.type,conflict.shaftId,conflict.meshId),
      severity:'error', family:'drivetrain', title:'Drivetrain speed conflict',
      message:'Two independent drivetrain paths predict incompatible rotational speed for the same shaft.',
      reason:conflict.type, source:'drivetrain-analyzer', object, instanceId,
      partId:object?.userData?.partId ?? null,
      details:{ expectedRpm:conflict.expectedRpm ?? null, incomingRpm:conflict.incomingRpm ?? null, meshId:conflict.meshId ?? null },
    }))
  }
  if (context.drivetrain?.error) {
    issues.push(issue({
      id:'drivetrain-analysis-error', severity:'info', family:'drivetrain', title:'Drivetrain analysis was unavailable',
      message:'Design Doctor left drivetrain-specific conclusions unresolved instead of guessing.',
      reason:context.drivetrain.error, source:'drivetrain-analyzer', object:context.objects[0] ?? null,
    }))
  }
  return issues
}

function motorOutputIssues(context) {
  const issues = []
  const connected = new Set((context.drivetrain?.motors ?? []).map(item => item.id))
  for (const object of context.objects) {
    const def = context.subsystems.parts.get(object?.userData?.partId)
    if (!def?.mechanics?.motor || connected.has(object?.userData?.instanceId)) continue
    issues.push(issue({
      id:issueId('drivetrain','motor-output',object?.userData?.instanceId),
      severity:'warning', family:'drivetrain', title:'Motor has no useful driven output',
      message:'The drivetrain analyzer cannot seed a shaft from this motor output in the current connection graph.',
      reason:'motor-output-not-connected', source:'drivetrain-analyzer', object,
    }))
  }
  return issues
}

function comIssue(context) {
  const weighted = []
  const wheels = []
  for (const object of context.objects) {
    const def = context.subsystems.parts.get(object?.userData?.partId)
    const mass = Number(def?.physics?.massKg)
    if (!Number.isFinite(mass) || mass <= 0) return null
    weighted.push({ object, mass })
    if (def?.physics?.collisionClass === 'wheel' || def?.mechanics?.wheel) wheels.push(object)
  }
  if (weighted.length < 4 || wheels.length < 4) return null

  let total = 0, x = 0, y = 0, z = 0
  for (const entry of weighted) {
    total += entry.mass
    x += (entry.object.position?.x ?? 0) * entry.mass
    y += (entry.object.position?.y ?? 0) * entry.mass
    z += (entry.object.position?.z ?? 0) * entry.mass
  }
  if (!(total > 0)) return null
  const com = { x:x/total, y:y/total, z:z/total }
  const xs = wheels.map(object => object.position?.x ?? 0)
  const zs = wheels.map(object => object.position?.z ?? 0)
  const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs)
  const margin = .25
  if (com.x >= minX-margin && com.x <= maxX+margin && com.z >= minZ-margin && com.z <= maxZ+margin) return null

  const anchor = weighted.slice().sort((a,b) => b.mass-a.mass)[0]?.object ?? context.objects[0] ?? null
  return issue({
    id:'vehicle-com-outside-support', severity:'warning', family:'vehicle-com', title:'Center of mass is outside the wheel support footprint',
    message:'Using explicit part masses, the projected center of mass falls outside the rectangle spanned by four or more known wheels. This can indicate extreme weight distribution.',
    reason:'com-outside-wheel-support', source:'explicit-part-mass-and-wheel-layout', object:anchor,
    details:{ com, wheelBounds:{ minX,maxX,minZ,maxZ }, totalMassKg:total },
  })
}

export function buildDesignDoctorContext(subsystems, { includeSubsystemDiagnostics=false } = {}) {
  const objects = subsystems.editor.objects()
  const projectState = subsystems.editor.projectState?.() ?? { connections:[] }
  const v4Records = subsystems.connectivity.build.records?.() ?? []
  const connectionContext = buildConnectionContext(objects, projectState, v4Records)
  const context = { subsystems, objects, projectState, v4Records, connectionContext, physics:null, drivetrain:null }
  if (includeSubsystemDiagnostics) {
    context.physics = physicsPreview(objects, v4Records, subsystems)
    context.drivetrain = drivetrainPreview(objects, connectionContext, v4Records, subsystems)
  }
  return context
}

export function sortDesignDoctorIssues(issues) {
  return [...issues].sort((a,b) => {
    const severity = (severityRank[a.severity] ?? 9) - (severityRank[b.severity] ?? 9)
    if (severity) return severity
    return String(a.id).localeCompare(String(b.id))
  })
}

function yieldFrame() {
  return new Promise(resolve => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve())
    else setTimeout(resolve, 0)
  })
}

export function createDesignDoctorScanner({ subsystems = globalThis.BrickLabSubsystems, scheduler = new FrameBudgetScheduler({ budgetMs:3.5 }) } = {}) {
  if (!subsystems?.editor?.ready?.()) throw new Error('Design Doctor requires the bound editor subsystem')
  let scanGeneration = 0

  async function scan({ onProgress = null, onInspect = null, onIssue = null } = {}) {
    const generation = ++scanGeneration
    const context = buildDesignDoctorContext(subsystems)
    const issues = []
    const push = value => {
      if (!value) return
      issues.push(value)
      onIssue?.(value, { generation, issues:[...issues] })
    }

    const total = context.objects.length + 4
    let completed = 0
    const progress = phase => onProgress?.({ generation, completed, total, phase, fraction:total ? completed/total : 1 })
    progress('start')

    const objectResult = await scheduler.schedule(context.objects, object => {
      if (generation !== scanGeneration) return
      onInspect?.(object, { generation, index:completed, total })
      for (const value of objectIssueChecks(object, context)) push(value)
      completed += 1
      progress('parts')
    }, { key:'design-doctor-parts' })
    if (objectResult?.aborted || generation !== scanGeneration) return { aborted:true, generation, issues:sortDesignDoctorIssues(issues) }

    await yieldFrame()
    for (const value of endpointConflictIssues(context)) push(value)
    completed += 1
    progress('connector-integrity')
    if (generation !== scanGeneration) return { aborted:true, generation, issues:sortDesignDoctorIssues(issues) }

    await yieldFrame()
    context.physics = physicsPreview(context.objects, context.v4Records, subsystems)
    for (const value of physicsIssues(context)) push(value)
    completed += 1
    progress('physics-preflight')
    if (generation !== scanGeneration) return { aborted:true, generation, issues:sortDesignDoctorIssues(issues) }

    await yieldFrame()
    context.drivetrain = drivetrainPreview(context.objects, context.connectionContext, context.v4Records, subsystems)
    for (const value of drivetrainConflictIssues(context)) push(value)
    for (const value of motorOutputIssues(context)) push(value)
    completed += 1
    progress('drivetrain')
    if (generation !== scanGeneration) return { aborted:true, generation, issues:sortDesignDoctorIssues(issues) }

    await yieldFrame()
    push(comIssue(context))
    completed += 1
    progress('vehicle-com')

    const sorted = sortDesignDoctorIssues(issues)
    const result = {
      aborted:false,
      generation,
      issues:sorted,
      context,
      stats:Object.freeze({
        objects:context.objects.length,
        errors:sorted.filter(item => item.severity === 'error').length,
        warnings:sorted.filter(item => item.severity === 'warning').length,
        info:sorted.filter(item => item.severity === 'info').length,
      }),
    }
    onProgress?.({ generation, completed:total, total, phase:'complete', fraction:1, result })
    return result
  }

  function abort(reason='aborted') {
    scanGeneration += 1
    scheduler.abort?.('design-doctor-parts', reason)
  }

  return Object.freeze({
    version:DESIGN_DOCTOR_ENGINE_VERSION,
    scan,
    abort,
    scheduler,
  })
}

export const DesignDoctorEngineV1 = Object.freeze({
  version:DESIGN_DOCTOR_ENGINE_VERSION,
  createScanner:createDesignDoctorScanner,
  buildContext:buildDesignDoctorContext,
  sortIssues:sortDesignDoctorIssues,
})
