import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const appSource=await readFile(new URL('../app.js',import.meta.url),'utf8')
const runtimeSource=await readFile(new URL('../mechanics-next/runtime.js',import.meta.url),'utf8')

test('editor structural edits synchronize Mechanics Next scene membership before snap UI continues',()=>{
  assert.match(appSource,/function syncMechanicsSceneMutation\(reason = 'editor-structure-change'\)/)
  assert.match(appSource,/BrickLabMechanicsNext\?\.syncScene\?\.\(\)/)
  assert.match(appSource,/syncMechanicsSceneMutation\('part-added'\)/)
  assert.match(appSource,/syncMechanicsSceneMutation\('parts-removed'\)/)
  assert.match(appSource,/syncMechanicsSceneMutation\('parts-duplicated'\)/)
})

test('native snapping self-heals when selected instance has not entered the observer yet',()=>{
  assert.match(
    runtimeSource,
    /mechanicalInstance\(instanceId\)[\s\S]{0,420}sceneObserver\.sync\(subsystems\.editor\.objects\?\.\(\)\?\?\[\]\)/,
  )
  assert.match(
    runtimeSource,
    /findCandidate\(instanceId, targetInstanceIds = null, options = \{\}\)[\s\S]{0,700}if\(!moving&&sceneObserver&&subsystems\?\.editor\?\.ready\?\.\(\)===true\)[\s\S]{0,300}sceneObserver\.sync/,
  )
})
