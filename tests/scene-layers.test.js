import assert from 'node:assert/strict'
import test from 'node:test'
import { hiddenSceneParts, moveToSceneGroup, readSceneLayers } from '../src/editor/scene-layers.js'

const partIds = new Set(['shaft', 'pulley', 'frame'])
const parts = [...partIds].map(id => ({ id }))

test('scene layers open older builds and discard stale or duplicate memberships', () => {
  assert.deepEqual(readSceneLayers(undefined, partIds), { groups: [], hiddenPartIds: [] })
  assert.deepEqual(readSceneLayers({
    groups: [
      { id: 'drive', name: 'Drive', partIds: ['shaft', 'shaft', 'missing'], hidden: true },
      { id: 'body', name: 'Body', partIds: ['shaft', 'frame'] },
    ],
    hiddenPartIds: ['pulley', 'pulley', 'missing'],
  }, partIds), {
    groups: [
      { id: 'drive', name: 'Drive', partIds: ['shaft'], hidden: true },
      { id: 'body', name: 'Body', partIds: ['frame'], hidden: false },
    ],
    hiddenPartIds: ['pulley'],
  })
})

test('moving parts between groups and isolating them preserves saved visibility', () => {
  const layers = readSceneLayers({
    groups: [
      { id: 'drive', name: 'Drive', partIds: ['shaft', 'pulley'], hidden: true },
      { id: 'body', name: 'Body', partIds: ['frame'] },
    ],
    hiddenPartIds: ['frame'],
  }, partIds)
  const moved = { ...layers, groups: moveToSceneGroup(layers.groups, new Set(['pulley']), 'body') }
  assert.deepEqual(layers.groups[0].partIds, ['shaft', 'pulley'])
  assert.deepEqual(moved.groups.map(group => group.partIds), [['shaft'], ['frame', 'pulley']])
  assert.deepEqual(hiddenSceneParts(moved, parts, new Set(['shaft'])), new Set(['pulley', 'frame']))
  assert.deepEqual(hiddenSceneParts(moved, parts), new Set(['shaft', 'frame']))
})
