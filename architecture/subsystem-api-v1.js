export const BRICKLAB_SUBSYSTEM_API_VERSION = 'architecture-v1.2.0'

function cloneValue(value) {
  if (value == null) return value
  if (typeof structuredClone === 'function') {
    try { return structuredClone(value) } catch {}
  }
  return JSON.parse(JSON.stringify(value))
}

function freezeSnapshot(value) {
  if (!value || typeof value !== 'object') return value
  for (const nested of Object.values(value)) freezeSnapshot(nested)
  return Object.freeze(value)
}

function snapshot(value) {
  return freezeSnapshot(cloneValue(value))
}

function normalizePartId(value) {
  if (typeof value === 'string') return value
  return value?.id ?? value?.userData?.partId ?? null
}

function makeAdapterSlot(name, required = []) {
  let adapter = null

  return Object.freeze({
    bind(next) {
      if (!next || typeof next !== 'object') throw new TypeError(`${name} adapter must be an object`)
      const missing = required.filter(method => typeof next[method] !== 'function')
      if (missing.length) throw new TypeError(`${name} adapter is missing: ${missing.join(', ')}`)
      adapter = next
      return adapter
    },
    ready() { return Boolean(adapter) },
    get() { return adapter },
    require() {
      if (!adapter) throw new Error(`${name} subsystem is not bound yet`)
      return adapter
    },
  })
}

export function createBrickLabSubsystemApi({
  listParts = () => [],
  findPart = () => null,
  createPhysicsSession = null,
  analyzeDrivetrain = null,
  groupMembers = object => object ? [object] : [],
  isGroup = () => false,
  globals = globalThis,
  uuid = () => globalThis.crypto?.randomUUID?.() ?? `part-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
} = {}) {
  const editorSlot = makeAdapterSlot('Editor', ['objects', 'selection', 'projectState'])
  const projectsSlot = makeAdapterSlot('Projects')
  const testLabSlot = makeAdapterSlot('TEST Lab')
  const guidanceSlot = makeAdapterSlot('Guidance')
  const telemetrySlot = makeAdapterSlot('Telemetry')

  const definitionFor = value => findPart(normalizePartId(value)) ?? null
  const connectorRuntime = () => globals?.BrickLabConnectorV4 ?? null
  const physicsGuard = () => globals?.BrickLabConnectorV4PhysicsGuard ?? null

  const parts = Object.freeze({
    list() { return [...listParts()] },
    get(value) { return definitionFor(value) },
    require(value) {
      const definition = definitionFor(value)
      if (!definition) throw new Error(`Unknown BrickLab part: ${normalizePartId(value) ?? '<missing id>'}`)
      return definition
    },
    mechanical(value) { return snapshot(definitionFor(value)?.mechanics ?? null) },
    physical(value) { return snapshot(definitionFor(value)?.physics ?? null) },
    connectors(value) { return snapshot(definitionFor(value)?.connectors ?? []) },
    connectivity(value) { return snapshot(definitionFor(value)?.connectivityV4 ?? null) },
    capabilities(value) {
      const definition = definitionFor(value)
      if (!definition) return Object.freeze({ visual:false, snap:false, mechanical:false })
      const v4 = definition.connectivityV4
      return Object.freeze({
        visual: typeof definition.create === 'function',
        snap: Boolean((v4?.status === 'ready' && v4.connectors?.length) || definition.connectors?.length),
        mechanical: Boolean(definition.mechanics && Object.keys(definition.mechanics).length),
      })
    },
    instantiate(value, color, options = {}) {
      const definition = parts.require(value)
      if (typeof definition.create !== 'function') throw new Error(`Part ${definition.id} has no geometry factory`)
      const actualColor = color ?? definition.defaultColor
      const object = definition.create(actualColor)
      if (!object) throw new Error(`Part ${definition.id} factory returned no object`)
      object.userData = {
        ...object.userData,
        partId:definition.id,
        color:actualColor,
        instanceId:options.instanceId || uuid(),
        groupId:options.groupId ?? object.userData?.groupId ?? null,
      }
      object.traverse?.(child => {
        child.userData = child.userData ?? {}
        child.userData.instanceRoot = object
      })
      return object
    },
  })

  const editor = Object.freeze({
    bind: editorSlot.bind,
    ready: editorSlot.ready,
    objects() {
      const bound = editorSlot.get()
      if (bound) return [...(bound.objects() ?? [])]
      return [...(connectorRuntime()?.objects?.() ?? [])]
    },
    selection() { return [...(editorSlot.get()?.selection?.() ?? [])] },
    primarySelection() { return editorSlot.get()?.primarySelection?.() ?? null },
    objectById(instanceId) {
      if (!instanceId) return null
      const bound = editorSlot.get()
      if (bound?.objectById) return bound.objectById(instanceId) ?? null
      return editor.objects().find(object => object?.userData?.instanceId === instanceId) ?? null
    },
    projectState() {
      const bound = editorSlot.get()
      return bound ? snapshot(bound.projectState()) : null
    },
    history() {
      const value = editorSlot.get()?.history?.()
      return value == null ? null : snapshot(value)
    },
    mode() { return editorSlot.get()?.mode?.() ?? null },
    viewportPoint(object, options = {}) {
      const value = editorSlot.get()?.viewportPoint?.(object, options) ?? null
      return value == null ? null : snapshot(value)
    },
    insertPart(value, options = {}) {
      const bound = editorSlot.require()
      if (typeof bound.insertPart !== 'function') throw new Error('Editor insertPart capability is unavailable')
      return bound.insertPart(normalizePartId(value), options)
    },
    commitHistory(...args) { return editorSlot.require().commitHistory?.(...args) },
    undo(...args) { return editorSlot.require().undo?.(...args) },
    redo(...args) { return editorSlot.require().redo?.(...args) },
    groups:Object.freeze({
      members(object) { return [...groupMembers(object)] },
      isGroup,
    }),
    identity:Object.freeze({
      instanceId(object) { return object?.userData?.instanceId ?? null },
      partId(object) { return object?.userData?.partId ?? null },
      objectById(instanceId) { return editor.objectById(instanceId) },
    }),
  })

  const connectivity = Object.freeze({
    authority:Object.freeze({ build:'connector-v4-with-legacy-bridge', simulate:'connector-v4-physics-guard' }),
    build:Object.freeze({
      ready() { return Boolean(connectorRuntime()) },
      records() { return snapshot(connectorRuntime()?.projectConnections?.() ?? []) },
      reconcile(objects = editor.objects(), options = {}) {
        return connectorRuntime()?.reconcileGraph?.(objects, options) ?? { removed:0, updated:0, kept:0, unavailable:true }
      },
      findCandidate(movingObject, targetObjects, options = {}) {
        return connectorRuntime()?.findActiveCandidate?.(movingObject, targetObjects, options) ?? null
      },
      commitCandidate(candidate) { return connectorRuntime()?.commitActiveCandidate?.(candidate) ?? { accepted:false, reason:'connector-v4-unavailable' } },
      removePart(instanceId) { return connectorRuntime()?.removePartConnections?.(instanceId) ?? 0 },
      restore(records, options = {}) { return connectorRuntime()?.restoreConnections?.(records, options) ?? { restored:0, rejected:(records ?? []).length } },
      clear() { return connectorRuntime()?.clearGraph?.() },
      audit(partId) { return snapshot(connectorRuntime()?.audit?.(partId) ?? null) },
      update(now) { return connectorRuntime()?.updateEditor?.(now) },
    }),
    simulate:Object.freeze({
      ready() {
        const guard = physicsGuard()
        return Boolean(guard?.active && guard?.createOwner)
      },
      guard() {
        const guard = physicsGuard()
        return guard ? Object.freeze({
          version:guard.version,
          safetyVersion:guard.safetyVersion,
          policyVersion:guard.policyVersion,
          adapterVersion:guard.adapterVersion,
          errorCode:guard.errorCode,
          active:Boolean(guard.active),
          createOwner:guard.createOwner ?? null,
        }) : null
      },
      lastPlan() { return snapshot(physicsGuard()?.lastPlan?.() ?? null) },
      lastFailure() { return snapshot(physicsGuard()?.lastFailure?.() ?? null) },
    }),
  })

  const mechanics = Object.freeze({
    metadata(value) { return parts.mechanical(value) },
    analyze(objects = editor.objects(), connections = []) {
      if (typeof analyzeDrivetrain !== 'function') throw new Error('Mechanics analyzer is unavailable')
      return analyzeDrivetrain(objects, connections)
    },
  })

  const physics = Object.freeze({
    async createSession(objects = editor.objects(), connections = [], ...rest) {
      if (typeof createPhysicsSession !== 'function') throw new Error('Physics subsystem is unavailable')
      return createPhysicsSession(objects, connections, ...rest)
    },
    guard: connectivity.simulate.guard,
    lastPlan: connectivity.simulate.lastPlan,
    lastFailure: connectivity.simulate.lastFailure,
  })

  const projects = Object.freeze({
    bind:projectsSlot.bind,
    ready:projectsSlot.ready,
    current() {
      const value = projectsSlot.get()?.current?.() ?? editor.projectState()
      return value == null ? null : snapshot(value)
    },
    save(...args) { return projectsSlot.require().save?.(...args) },
    createNew(...args) { return projectsSlot.require().createNew?.(...args) },
    requestImport(...args) { return projectsSlot.require().requestImport?.(...args) },
    exportProject(...args) { return projectsSlot.require().exportProject?.(...args) },
  })

  const adapters = Object.freeze({
    testLab:Object.freeze({ bind:testLabSlot.bind, ready:testLabSlot.ready, get:testLabSlot.get }),
    guidance:Object.freeze({ bind:guidanceSlot.bind, ready:guidanceSlot.ready, get:guidanceSlot.get }),
    telemetry:Object.freeze({ bind:telemetrySlot.bind, ready:telemetrySlot.ready, get:telemetrySlot.get }),
  })

  return Object.freeze({
    version:BRICKLAB_SUBSYSTEM_API_VERSION,
    editor,
    parts,
    connectivity,
    mechanics,
    physics,
    projects,
    testLab:adapters.testLab,
    guidance:adapters.guidance,
    telemetry:adapters.telemetry,
    status() {
      return Object.freeze({
        version:BRICKLAB_SUBSYSTEM_API_VERSION,
        editor:editor.ready(),
        connectorBuild:connectivity.build.ready(),
        connectorSimulate:connectivity.simulate.ready(),
        projects:projects.ready(),
        testLab:adapters.testLab.ready(),
        guidance:adapters.guidance.ready(),
        telemetry:adapters.telemetry.ready(),
      })
    },
  })
}
