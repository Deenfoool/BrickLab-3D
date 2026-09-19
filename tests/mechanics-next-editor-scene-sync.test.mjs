import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const appSource=await readFile(new URL('../app.js',import.meta.url),'utf8')
const runtimeSource=await readFile(new URL('../mechanics-next/runtime.js',import.meta.url),'utf8')

test('editor structural edits synchronize Mechanics Next scene membership before snap UI continues',()=>{
  assert.match(appSource,/function syncMechanicsSceneMutation\(reason = 'editor-structure-change', partIds = \[\]\)/)
  assert.match(appSource,/BrickLabMechanicsNext\?\.syncScene\?\.\(\)/)
  assert.match(appSource,/syncMechanicsSceneMutation\('part-added'\)/)
  assert.match(appSource,/syncMechanicsSceneMutation\('parts-removed'\)/)
  assert.match(appSource,/syncMechanicsSceneMutation\('parts-duplicated'\)/)
  assert.match(
    appSource,
    /function syncMechanicsSceneMutation[\s\S]{0,1800}scheduleMechanicsNextBuildHandoff/,
  )
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


test('native BUILD keeps gear placement snapping after legacy runtime purge',()=>{
  assert.match(appSource,/findGearSnapCandidate/)
  assert.match(
    appSource,
    /mechanicsNextBuildActive\(\)[\s\S]{0,1600}findGearSnapCandidate\(selected, buildRoot\.children\)/,
  )
  assert.match(appSource,/owner:'mechanics-next-gear'/)
  assert.match(
    appSource,
    /snapCandidate\.owner === 'mechanics-next-gear'[\s\S]{0,700}applySnap\(selected, snapCandidate\)[\s\S]{0,350}BrickLabMechanicsNext\?\.syncScene\?\.\(\)/,
  )
})


test('inserted parts warm their native connectivity before relying on BUILD snap',()=>{
  assert.match(
    appSource,
    /syncMechanicsSceneMutation\(reason = 'editor-structure-change', partIds = \[\]\)[\s\S]{0,1000}ensurePartConnectivity/,
  )
  assert.match(appSource,/syncMechanicsSceneMutation\('part-added',\[partId\]\)/)
  assert.match(
    appSource,
    /syncMechanicsSceneMutation\('parts-duplicated',copies\.map\(object=>object\.userData\.partId\)\)/,
  )
  assert.match(
    runtimeSource,
    /async ensurePartConnectivity\(partId\)[\s\S]{0,900}connectivity\.hydrate\(id\)[\s\S]{0,900}syncScene\(\)/,
  )
})


test('native BUILD project state never dual-writes legacy connections',()=>{
  assert.doesNotMatch(
    appSource,
    /if \(connection && !connections\.some\([\s\S]{0,180}connections\.push\(cloneState\(connection\)\)/,
  )
  assert.match(
    appSource,
    /connections:\s*mechanicsNextBuildActive\(\) \? \[\] : cloneState\(connections\)/,
  )
  assert.match(
    appSource,
    /const compatibilityConnections = data\.mechanicsNext\s*\? \[\]\s*:\s*\(Array\.isArray\(data\.connections\)/,
  )
})


test('native BUILD movement revalidates DOF before detaching',()=>{
  assert.match(
    appSource,
    /transform\.addEventListener\('objectChange'[\s\S]{0,700}mechanicsNextBuildActive\(\)[\s\S]{0,350}scheduleNativeConnectionRevalidation\('transform-controls'\)/,
  )
  assert.match(
    appSource,
    /transform\.addEventListener\('mouseUp'[\s\S]{0,700}flushNativeConnectionRevalidation\('transform-release'\)[\s\S]{0,700}retainedConnection/,
  )
  assert.match(
    appSource,
    /function detachPartConnectionsForEdit\(object\)[\s\S]{0,220}if \(mechanicsNextBuildActive\(\)\) return 0/,
  )
  assert.match(appSource,/revalidateNativeConnectionsNow\('quarter-rotate'\)/)
  assert.match(appSource,/revalidateNativeConnectionsNow\('inspector-position'\)/)
  assert.match(appSource,/revalidateNativeConnectionsNow\('inspector-rotation'\)/)
})
