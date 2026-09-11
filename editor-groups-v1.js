const NativeSet = globalThis.Set
const NativeMap = globalThis.Map

export const EDITOR_GROUPS_VERSION = 'editor-groups-v1.2.0'

let captureArmed = false
let captureCount = 0
let restoreSet = null
let capturedSelection = null
let primarySelection = null
let selectionEventQueued = false

function isEditorPart(value) {
  return Boolean(value?.isObject3D && value?.userData?.instanceId)
}

export function interactionGroupMembers(object) {
  if (!isEditorPart(object)) return object ? [object] : []
  const groupId = object.userData.groupId
  const parent = object.parent
  if (!groupId || !parent?.children) return [object]
  const members = parent.children.filter(child =>
    isEditorPart(child) && child.userData.groupId === groupId,
  )
  return members.length ? members : [object]
}

export function isEditorGroup(object) {
  return Boolean(object?.userData?.groupId && interactionGroupMembers(object).length > 1)
}

export function editorSelection() {
  return capturedSelection ? [...capturedSelection] : []
}

export function editorPrimarySelection() {
  return primarySelection && capturedSelection?.has(primarySelection) ? primarySelection : null
}

function randomGroupId() {
  return globalThis.crypto?.randomUUID?.() ?? `group-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

export function normalizeDuplicatedGroupIds(values) {
  const parts = [...(values ?? [])].filter(isEditorPart)
  if (!parts.length) return parts

  const copied = new NativeSet(parts)
  const byGroup = new NativeMap()
  for (const part of parts) {
    const groupId = part.userData.groupId
    if (!groupId) continue
    const bucket = byGroup.get(groupId) ?? []
    bucket.push(part)
    byGroup.set(groupId, bucket)
  }

  for (const [groupId, members] of byGroup) {
    const parent = members[0]?.parent
    if (!parent) continue
    const hasOriginalOutsideCopy = parent.children.some(child =>
      isEditorPart(child) && child.userData.groupId === groupId && !copied.has(child),
    )
    if (!hasOriginalOutsideCopy) continue
    const freshId = randomGroupId()
    for (const member of members) member.userData.groupId = freshId
  }
  return parts
}

function addInteractionUnit(set, value) {
  if (!isEditorPart(value)) {
    NativeSet.prototype.add.call(set, value)
    return
  }
  for (const member of interactionGroupMembers(value)) NativeSet.prototype.add.call(set, member)
}

function deleteInteractionUnit(set, value) {
  if (!isEditorPart(value)) return NativeSet.prototype.delete.call(set, value)
  let changed = false
  for (const member of interactionGroupMembers(value)) {
    changed = NativeSet.prototype.delete.call(set, member) || changed
  }
  return changed
}

function queueSelectionEvent() {
  if (selectionEventQueued) return
  selectionEventQueued = true
  const enqueue = typeof globalThis.queueMicrotask === 'function'
    ? globalThis.queueMicrotask.bind(globalThis)
    : callback => Promise.resolve().then(callback)
  enqueue(() => {
    selectionEventQueued = false
    if (typeof globalThis.dispatchEvent !== 'function' || typeof globalThis.CustomEvent !== 'function') return
    const detail = {
      version:EDITOR_GROUPS_VERSION,
      captureCount,
      count:capturedSelection?.size ?? 0,
      primaryInstanceId:editorPrimarySelection()?.userData?.instanceId ?? null,
    }
    globalThis.dispatchEvent(new globalThis.CustomEvent('bricklab:editorselectionchange', { detail }))
    globalThis.dispatchEvent(new globalThis.CustomEvent('bricklab:editorgroupselection', { detail }))
  })
}

function promoteSelection(set, primary = null) {
  if (!set?.__bricklabGroupAwareSelection) {
    set.__bricklabGroupAwareSelection = true
    captureCount += 1
  }
  capturedSelection = set
  if (isEditorPart(primary)) primarySelection = primary
  else if (!set.size) primarySelection = null
  queueSelectionEvent()
}

function shellReady() {
  return Boolean(globalThis.document?.querySelector?.('.shell'))
}

export function armSelectionCapture() {
  if (captureArmed) return
  captureArmed = true
  const PreviousSet = globalThis.Set

  class BrickLabSelectionCaptureSet extends PreviousSet {
    constructor(iterable) {
      const values = iterable == null ? [] : [...iterable]
      super()
      this.__bricklabSelectionCandidate = shellReady() && (
        values.length === 0 || values.every(isEditorPart)
      )
      this.__bricklabGroupAwareSelection = false

      if (this.__bricklabSelectionCandidate && values.length && values.every(isEditorPart)) {
        normalizeDuplicatedGroupIds(values)
        promoteSelection(this, values.at(-1) ?? null)
        for (const value of values) addInteractionUnit(this, value)
        queueSelectionEvent()
        return
      }

      for (const value of values) NativeSet.prototype.add.call(this, value)
    }

    add(value) {
      if (!this.__bricklabGroupAwareSelection) {
        if (this.__bricklabSelectionCandidate && isEditorPart(value)) {
          promoteSelection(this, value)
        } else {
          if (this.__bricklabSelectionCandidate && !isEditorPart(value)) this.__bricklabSelectionCandidate = false
          NativeSet.prototype.add.call(this, value)
          return this
        }
      }
      addInteractionUnit(this, value)
      if (isEditorPart(value)) primarySelection = value
      queueSelectionEvent()
      return this
    }

    delete(value) {
      if (!this.__bricklabGroupAwareSelection) return NativeSet.prototype.delete.call(this, value)
      const changed = deleteInteractionUnit(this, value)
      if (changed && primarySelection && !this.has(primarySelection)) primarySelection = [...this].at(-1) ?? null
      if (changed) queueSelectionEvent()
      return changed
    }

    clear() {
      if (!this.__bricklabGroupAwareSelection) return NativeSet.prototype.clear.call(this)
      if (!this.size) return
      NativeSet.prototype.clear.call(this)
      primarySelection = null
      queueSelectionEvent()
    }
  }

  restoreSet = () => {
    if (globalThis.Set === BrickLabSelectionCaptureSet) globalThis.Set = PreviousSet
    captureArmed = false
    restoreSet = null
  }
  globalThis.Set = BrickLabSelectionCaptureSet
}

export function cancelSelectionCapture() {
  restoreSet?.()
}

function armForSynchronousEditorAction() {
  armSelectionCapture()
  const enqueue = typeof globalThis.queueMicrotask === 'function'
    ? globalThis.queueMicrotask.bind(globalThis)
    : callback => Promise.resolve().then(callback)
  enqueue(() => cancelSelectionCapture())
}

function shortcutNeedsSelectionRebuild(event) {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return false
  return event.code === 'KeyA' || event.code === 'KeyD'
}

// selectedObjects is reassigned by Select All and Duplicate. Keep the constructor
// wrapper armed only for the synchronous editor action; the created Set promotes
// itself to the authoritative selection as soon as it receives real editor parts.
globalThis.addEventListener?.('keydown', event => {
  if (shortcutNeedsSelectionRebuild(event)) armForSynchronousEditorAction()
}, true)

globalThis.document?.addEventListener?.('click', event => {
  if (event.target?.closest?.('#duplicateBtn')) armForSynchronousEditorAction()
}, true)

export const BrickLabEditorGroups = Object.freeze({
  version:EDITOR_GROUPS_VERSION,
  armSelectionCapture,
  cancelSelectionCapture,
  members:interactionGroupMembers,
  isGroup:isEditorGroup,
  selection:editorSelection,
  primary:editorPrimarySelection,
  normalizeDuplicatedGroupIds,
  get captureCount(){ return captureCount },
})

globalThis.BrickLabEditorGroups = BrickLabEditorGroups
