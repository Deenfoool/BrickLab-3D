export const EDITOR_ADAPTER_VERSION = 'editor-adapter-v1.0.0'

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

  return Object.freeze({
    version:EDITOR_ADAPTER_VERSION,
    objects,
    selection,
    primarySelection,
    objectById(instanceId) {
      return objects().find(object => object?.userData?.instanceId === instanceId) ?? null
    },
    projectState,
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
