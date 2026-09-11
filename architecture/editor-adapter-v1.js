export const EDITOR_ADAPTER_VERSION = 'editor-adapter-v1.1.0'

function safeParse(value) {
  if (!value) return null
  try { return JSON.parse(value) } catch { return null }
}

function storedProject(storage) {
  if (!storage?.getItem) return null
  try {
    return safeParse(storage.getItem('bricklab.project.v2'))
      ?? safeParse(storage.getItem('bricklab.project.v1'))
  } catch {
    return null
  }
}

function serializePart(object) {
  return {
    instanceId:object?.userData?.instanceId ?? null,
    partId:object?.userData?.partId ?? null,
    color:object?.userData?.color ?? null,
    groupId:object?.userData?.groupId ?? null,
    position:object?.position?.toArray?.() ?? [0,0,0],
    rotation:[object?.rotation?.x ?? 0, object?.rotation?.y ?? 0, object?.rotation?.z ?? 0],
  }
}

function multiplyMatrixVector(matrix, vector) {
  const e = matrix?.elements
  if (!e || e.length < 16) return null
  const [x, y, z, w = 1] = vector
  return [
    e[0] * x + e[4] * y + e[8] * z + e[12] * w,
    e[1] * x + e[5] * y + e[9] * z + e[13] * w,
    e[2] * x + e[6] * y + e[10] * z + e[14] * w,
    e[3] * x + e[7] * y + e[11] * z + e[15] * w,
  ]
}

function editorCameraFor(object) {
  if (!object) return null
  let root = object
  while (root?.parent) root = root.parent
  let found = null
  const inspect = node => {
    if (found || !node) return
    const candidates = [node.camera, node.controls?.camera, node._controls?.camera, node.object]
    for (const candidate of candidates) {
      if (candidate?.isCamera) {
        found = candidate
        return
      }
    }
  }
  inspect(root)
  root?.traverse?.(inspect)
  return found
}

export function createLegacyEditorAdapter({
  subsystems,
  connectorRuntime = globalThis.BrickLabConnectorV4,
  groups = globalThis.BrickLabEditorGroups,
  documentRef = globalThis.document,
  storage = globalThis.localStorage,
} = {}) {
  if (!subsystems?.editor || !subsystems?.connectivity?.build) {
    throw new Error('BrickLab subsystem facade is required before binding the editor adapter')
  }

  const objects = () => [...(connectorRuntime?.objects?.() ?? [])]
  const selection = () => [...(groups?.selection?.() ?? [])]
  const primarySelection = () => groups?.primary?.() ?? selection().at(-1) ?? null
  const element = id => documentRef?.querySelector?.(`#${id}`) ?? null
  const click = id => element(id)?.click?.()

  function projectState() {
    const liveObjects = objects()
    subsystems.connectivity.build.reconcile(liveObjects, { persist:false })
    const stored = storedProject(storage) ?? {}
    const name = element('projectName')?.textContent?.trim() || stored.name || 'Untitled Build'
    return {
      ...stored,
      version:2,
      name,
      parts:liveObjects.map(serializePart),
      connections:Array.isArray(stored.connections) ? stored.connections : [],
      connectorSystemV4:{version:4},
      connectionsV4:subsystems.connectivity.build.records(),
    }
  }

  function mode() {
    return documentRef?.querySelector?.('.mode.active')?.dataset?.mode ?? null
  }

  function viewportPoint(object, { offsetY = .65 } = {}) {
    if (!object) return null
    const camera = editorCameraFor(object)
    const viewport = element('viewport')
    const rect = viewport?.getBoundingClientRect?.()
    if (!camera || !rect?.width || !rect?.height) return null

    object.updateMatrixWorld?.(true)
    camera.updateMatrixWorld?.(true)
    const world = object.matrixWorld?.elements
      ? [object.matrixWorld.elements[12], object.matrixWorld.elements[13] + offsetY, object.matrixWorld.elements[14], 1]
      : [object.position?.x ?? 0, (object.position?.y ?? 0) + offsetY, object.position?.z ?? 0, 1]
    const view = multiplyMatrixVector(camera.matrixWorldInverse, world)
    const clip = view && multiplyMatrixVector(camera.projectionMatrix, view)
    if (!clip || Math.abs(clip[3]) < 1e-8) return null
    const ndcX = clip[0] / clip[3]
    const ndcY = clip[1] / clip[3]
    const ndcZ = clip[2] / clip[3]
    return {
      x:(ndcX * .5 + .5) * rect.width,
      y:(-.5 * ndcY + .5) * rect.height,
      width:rect.width,
      height:rect.height,
      ndcZ,
      visible:clip[3] > 0 && ndcZ >= -1 && ndcZ <= 1 && ndcX >= -1.2 && ndcX <= 1.2 && ndcY >= -1.2 && ndcY <= 1.2,
    }
  }

  function refreshExternalMutationUi() {
    const count = objects().length
    const stats = element('projectStats')
    if (stats?.textContent) stats.textContent = stats.textContent.replace(/^\d+\s+parts/, `${count} parts`)
    const status = element('statusText')
    if (mode() === 'build' && status?.textContent) status.textContent = status.textContent.replace(/BUILD MODE\s*·\s*\d+\s+parts/i, `BUILD MODE · ${count} parts`)
  }

  function insertPart(partId, options = {}) {
    if (mode() !== 'build') throw new Error('Parts can only be inserted while BUILD mode is active')
    const nearObject = options.nearObject ?? primarySelection()
    const parent = options.parent ?? nearObject?.parent ?? objects()[0]?.parent ?? null
    if (!parent?.add) throw new Error('Editor build root is unavailable')

    const object = subsystems.parts.instantiate(partId, options.color, {
      instanceId:options.instanceId,
      groupId:options.groupId,
    })
    if (Array.isArray(options.position)) {
      if (object.position?.fromArray) object.position.fromArray(options.position)
      else object.position?.set?.(...options.position)
    } else if (nearObject?.position && object.position?.copy) {
      object.position.copy(nearObject.position)
    }
    if (Array.isArray(options.rotation)) object.rotation?.set?.(...options.rotation)
    else if (nearObject?.rotation && object.rotation?.copy) object.rotation.copy(nearObject.rotation)
    if (options.groupId != null) object.userData.groupId = options.groupId

    parent.add(object)
    object.updateMatrixWorld?.(true)
    connectorRuntime?.updateEditor?.(globalThis.performance?.now?.() ?? Date.now())
    refreshExternalMutationUi()
    if (options.persist !== false) click('saveBtn')
    globalThis.dispatchEvent?.(new CustomEvent('bricklab:editorexternalmutation', {
      detail:{ type:'insert-part', partId, instanceId:object.userData?.instanceId ?? null },
    }))
    return object
  }

  return Object.freeze({
    version:EDITOR_ADAPTER_VERSION,
    objects,
    selection,
    primarySelection,
    objectById(instanceId) {
      return objects().find(object => object?.userData?.instanceId === instanceId) ?? null
    },
    projectState,
    mode,
    viewportPoint,
    insertPart,
    history() {
      const undo = element('undoBtn')
      const redo = element('redoBtn')
      return {
        canUndo:Boolean(undo && !undo.disabled),
        canRedo:Boolean(redo && !redo.disabled),
      }
    },
    undo() { return click('undoBtn') },
    redo() { return click('redoBtn') },
    save() { return click('saveBtn') },
    createNew() { return click('newBtn') },
    requestImport() { return click('importBtn') },
    exportProject() { return click('exportBtn') },
  })
}

export function bindLegacyEditorAdapter(options = {}) {
  const subsystems = options.subsystems ?? globalThis.BrickLabSubsystems
  if (!subsystems) throw new Error('BrickLabSubsystems is not installed')

  const existing = globalThis.BrickLabEditorAdapterV1
  if (existing?.version === EDITOR_ADAPTER_VERSION) return existing

  const adapter = createLegacyEditorAdapter({ ...options, subsystems })
  subsystems.editor.bind(adapter)
  subsystems.projects.bind({
    current:adapter.projectState,
    save:adapter.save,
    createNew:adapter.createNew,
    requestImport:adapter.requestImport,
    exportProject:adapter.exportProject,
  })

  globalThis.BrickLabEditorAdapterV1 = adapter
  globalThis.dispatchEvent?.(new CustomEvent('bricklab:editorcontractready', {
    detail:{ version:EDITOR_ADAPTER_VERSION, subsystemVersion:subsystems.version },
  }))
  return adapter
}

if (globalThis.BrickLabSubsystems) bindLegacyEditorAdapter()
