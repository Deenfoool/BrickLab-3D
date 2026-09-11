import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import * as THREE from 'three'

import {
  EDITOR_GROUPS_VERSION,
  armSelectionCapture,
  cancelSelectionCapture,
  editorPrimarySelection,
  editorSelection,
  interactionGroupMembers,
  isEditorGroup,
  normalizeDuplicatedGroupIds,
} from '../editor-groups-v1.js'

function part(instanceId, groupId = null) {
  const object = new THREE.Object3D()
  object.userData.instanceId = instanceId
  object.userData.partId = `fixture-${instanceId}`
  object.userData.groupId = groupId
  return object
}

test('clicking one member resolves the complete editor group interaction unit', () => {
  const root = new THREE.Group()
  const a = part('a', 'group-1')
  const b = part('b', 'group-1')
  const c = part('c', null)
  root.add(a,b,c)

  assert.match(EDITOR_GROUPS_VERSION, /^editor-groups-v1\./)
  assert.equal(isEditorGroup(a), true)
  assert.deepEqual(interactionGroupMembers(a), [a,b])
  assert.deepEqual(interactionGroupMembers(b), [a,b])
  assert.deepEqual(interactionGroupMembers(c), [c])
})

test('duplicating a group assigns the copies a fresh group id without merging them with the original', () => {
  const root = new THREE.Group()
  const originalA = part('original-a', 'group-original')
  const originalB = part('original-b', 'group-original')
  const copyA = part('copy-a', 'group-original')
  const copyB = part('copy-b', 'group-original')
  root.add(originalA,originalB,copyA,copyB)

  normalizeDuplicatedGroupIds([copyA,copyB])

  assert.equal(originalA.userData.groupId, 'group-original')
  assert.equal(originalB.userData.groupId, 'group-original')
  assert.notEqual(copyA.userData.groupId, 'group-original')
  assert.equal(copyA.userData.groupId, copyB.userData.groupId)
  assert.deepEqual(interactionGroupMembers(copyA), [copyA,copyB])
  assert.deepEqual(interactionGroupMembers(originalA), [originalA,originalB])
})

test('select-all style normalization does not rewrite an existing complete group', () => {
  const root = new THREE.Group()
  const a = part('a', 'stable-group')
  const b = part('b', 'stable-group')
  root.add(a,b)

  normalizeDuplicatedGroupIds([a,b])
  assert.equal(a.userData.groupId, 'stable-group')
  assert.equal(b.userData.groupId, 'stable-group')
})

test('selection bridge is exposed without inventing selection before app capture', () => {
  assert.deepEqual(editorSelection(), [])
  assert.equal(editorPrimarySelection(), null)
  assert.equal(globalThis.BrickLabEditorGroups.selection, editorSelection)
  assert.equal(globalThis.BrickLabEditorGroups.primary, editorPrimarySelection)
})

test('empty app selection promotes on first editor part without stack-trace parsing', () => {
  const originalDocument = globalThis.document
  globalThis.document = {
    querySelector(selector) { return selector === '.shell' ? {} : null },
    addEventListener() {},
  }
  const a = part('direct-selection-a')
  try {
    armSelectionCapture()
    const selectedObjects = new globalThis.Set()
    cancelSelectionCapture()
    selectedObjects.add(a)
    assert.deepEqual(editorSelection(), [a])
    assert.equal(editorPrimarySelection(), a)
    selectedObjects.clear()
    assert.deepEqual(editorSelection(), [])
    assert.equal(editorPrimarySelection(), null)
  } finally {
    cancelSelectionCapture()
    if (originalDocument === undefined) delete globalThis.document
    else globalThis.document = originalDocument
  }
})

test('selection bridge publishes an explicit editor-selection event and has no stack heuristic', async () => {
  const source = await readFile(new URL('../editor-groups-v1.js', import.meta.url), 'utf8')
  assert.match(source, /bricklab:editorselectionchange/)
  assert.doesNotMatch(source, /new Error\(\)\.stack|directCallerIsApp/)
})
