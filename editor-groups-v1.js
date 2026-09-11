const NativeSet = globalThis.Set
const NativeMap = globalThis.Map

export const EDITOR_GROUPS_VERSION = 'editor-groups-v1.0.1'

let captureArmed = false
let captureCount = 0
let restoreSet = null

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

function qualifiesAsSelectionConstruction(values) {
  if (!globalThis.document?.querySelector?.('.shell')) return false
  if (values == null) return true
  return values.length > 0 && values.every(isEditorPart)
}

export function armSelectionCapture() {
  if (captureArmed) return
  captureArmed = true
  const PreviousSet = globalThis.Set

  class BrickLabSelectionCaptureSet extends PreviousSet {
    constructor(iterable) {
      const values = iterable == null ? null : [...iterable]
      if (!qualifiesAsSelectionConstruction(values)) {
        super(iterable)
        return
      }

      super()
      this.__bricklabGroupAwareSelection = true
      if (values) normalizeDuplicatedGroupIds(values)
      for (const value of values ?? []) this.add(value)

      captureArmed = false
      captureCount += 1
      globalThis.Set = PreviousSet
      restoreSet = null
      queueMicrotask(() => {
        globalThis.dispatchEvent?.(new CustomEvent('bricklab:editorgroupselection', {
          detail:{ version:EDITOR_GROUPS_VERSION, captureCount },
        }))
      })
    }

    add(value) {
      if (!this.__bricklabGroupAwareSelection) return super.add(value)
      addInteractionUnit(this, value)
      return this
    }

    delete(value) {
      if (!this.__bricklabGroupAwareSelection) return super.delete(value)
      return deleteInteractionUnit(this, value)
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
  queueMicrotask(() => cancelSelectionCapture())
}

function shortcutNeedsSelectionRebuild(event) {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return false
  return event.code === 'KeyA' || event.code === 'KeyD'
}

// selectedObjects is reassigned only by Select All and Duplicate after the initial
// editor bootstrap. Arm the one-shot constructor before those existing handlers run
// and cancel it in a microtask if the action returned early without creating a Set.
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
  normalizeDuplicatedGroupIds,
  get captureCount(){ return captureCount },
})

globalThis.BrickLabEditorGroups = BrickLabEditorGroups
