import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createBrickLabSubsystemApi } from '../architecture/subsystem-api-v1.js'
import { createLegacyEditorAdapter } from '../architecture/editor-adapter-v1.js'
import {
  SMART_ASSEMBLY_FAMILIES,
  smartAssemblyRole,
  smartAssemblyFamilyFor,
  compatibleAssemblyChoices,
  bestAssemblyChoice,
  isCompatibleAssemblyPresent,
  smartAssemblyDismissalKey,
  centeredAssemblyPosition,
  smartAssemblyPlacement,
} from '../guidance/assembly-compatibility-v1.js'

function ldrawDef(code, mechanicalClass, confidence = 'verified') {
  return {
    id:`ldraw-${code}`,
    name:`Fixture ${code}`,
    ldraw:{ code, file:`${code}.dat` },
    mechanicalIntelligence:{ class:mechanicalClass, confidence, source:'fixture', properties:{} },
  }
}

function sceneObject(partId, position = [0,0,0], rotation = [0,0,0]) {
  return {
    userData:{ instanceId:`instance-${partId}-${Math.random()}`, partId },
    position:{ x:position[0], y:position[1], z:position[2], toArray:() => [...position] },
    rotation:{ x:rotation[0], y:rotation[1], z:rotation[2] },
  }
}

test('Smart Assembly V1 exposes only curated tire/rim compatibility families', () => {
  assert.ok(SMART_ASSEMBLY_FAMILIES.length >= 2)
  assert.ok(SMART_ASSEMBLY_FAMILIES.every(family => family.type === 'tire-rim'))
  assert.deepEqual(SMART_ASSEMBLY_FAMILIES.find(family => family.id === 'tire-rim-30.4x14')?.tireCodes, ['6578'])
  assert.deepEqual(SMART_ASSEMBLY_FAMILIES.find(family => family.id === 'tire-rim-30.4x14')?.rimCodes, ['2994'])
  assert.deepEqual(SMART_ASSEMBLY_FAMILIES.find(family => family.id === 'tire-rim-30.4x14')?.fit, {
    beadDiameterMm:20, tireWidthMm:14, rimWidthMm:12, beadProfile:'technic-vr-30.4x14',
  })
})

test('6578 tyre resolves 2994 rim and reverse flow resolves the tyre', () => {
  const tire = ldrawDef('6578', 'tire')
  const rim = ldrawDef('2994', 'rim')
  assert.equal(smartAssemblyRole(tire), 'tire')
  assert.equal(smartAssemblyFamilyFor(tire)?.id, 'tire-rim-30.4x14')

  const tireChoices = compatibleAssemblyChoices(tire, [tire, rim])
  assert.equal(tireChoices.length, 1)
  assert.equal(tireChoices[0].targetPartId, 'ldraw-2994')
  assert.equal(tireChoices[0].confidence, 'verified')
  assert.equal(bestAssemblyChoice(rim, [tire, rim])?.targetPartId, 'ldraw-6578')
})

test('curated family can offer an unregistered counterpart for on-demand LDraw loading', () => {
  const tire = ldrawDef('6579', 'tire')
  const choice = bestAssemblyChoice(tire, [tire])
  assert.equal(choice.targetCode, '6580a')
  assert.equal(choice.targetPartId, 'ldraw-6580a')
  assert.equal(choice.targetDefinition, null)
  assert.equal(choice.source, 'curated-compatibility-registry-v1')
})

test('unknown or name-only parts never receive an assembly suggestion', () => {
  const unknown = {
    id:'ldraw-fake',
    name:'Super Tire Rim Gear Combo',
    mechanicalIntelligence:{ class:'unknown', confidence:'unknown', source:'none', properties:{} },
    ldraw:{ code:'fake' },
  }
  assert.equal(smartAssemblyRole(unknown), null)
  assert.deepEqual(compatibleAssemblyChoices(unknown, []), [])

  const inferredButUnsupported = ldrawDef('999999', 'tire', 'inferred')
  inferredButUnsupported.name = 'Tyre 43.2 x 28 lookalike'
  assert.deepEqual(compatibleAssemblyChoices(inferredButUnsupported, []), [])
})

test('already centered compatible tire/rim suppresses duplicate suggestions', () => {
  const tireDef = ldrawDef('6579', 'tire')
  const rimDef = ldrawDef('6580a', 'rim')
  const tire = sceneObject(tireDef.id, [2,1,3])
  const rim = sceneObject(rimDef.id, [2.05,1.02,3.04], [0.02,0,0])
  const lookup = id => id === tireDef.id ? tireDef : id === rimDef.id ? rimDef : null
  assert.equal(isCompatibleAssemblyPresent(tire, tireDef, [tire, rim], lookup), true)

  rim.position.x = 4
  assert.equal(isCompatibleAssemblyPresent(tire, tireDef, [tire, rim], lookup), false)
})

test('LDraw bottom-normalized tire/rim placement aligns visual centres, including rotated assemblies', () => {
  const tireDef = ldrawDef('6578', 'tire')
  const source = sceneObject(tireDef.id, [5,2,-1], [0,0,Math.PI / 2])
  const centered = centeredAssemblyPosition(source, [3,4,2], [2,2,2])
  assert.ok(Math.abs(centered[0] - 4) < 1e-9, 'local +Y offset rotates into world -X')
  assert.ok(Math.abs(centered[1] - 2) < 1e-9)
  assert.ok(Math.abs(centered[2] + 1) < 1e-9)

  const choice = bestAssemblyChoice(tireDef, [tireDef])
  const placement = smartAssemblyPlacement(source, choice, 'g', { sourceSize:[3,4,2], targetSize:[2,2,2] })
  assert.deepEqual(placement.position, centered)
})

test('centre offset follows Three.js default XYZ Euler order for multi-axis wheel rotation', () => {
  const tireDef = ldrawDef('6578', 'tire')
  const source = sceneObject(tireDef.id, [5,2,-1], [Math.PI / 2, Math.PI / 2, 0])
  const centered = centeredAssemblyPosition(source, [3,4,2], [2,2,2])
  assert.ok(Math.abs(centered[0] - 5) < 1e-9)
  assert.ok(Math.abs(centered[1] - 2) < 1e-9)
  assert.ok(Math.abs(centered[2] - 0) < 1e-9, 'local +Y becomes world +Z for THREE.Euler(XYZ)')
})

test('accepted placement reuses source transform and a normal editor group id', () => {
  const tireDef = ldrawDef('6578', 'tire')
  const source = sceneObject(tireDef.id, [5,2,-1], [0,.5,0])
  source.userData.groupId = 'normal-editor-group'
  const choice = bestAssemblyChoice(tireDef, [tireDef])
  const placement = smartAssemblyPlacement(source, choice, source.userData.groupId)
  assert.deepEqual(placement.position, [5,2,-1])
  assert.deepEqual(placement.rotation, [0,.5,0])
  assert.equal(placement.groupId, 'normal-editor-group')
  assert.match(smartAssemblyDismissalKey(source, choice), /instance-.*::tire-rim-30\.4x14::rim/)
})

test('stable editor facade exposes mode, viewport projection and normal part insertion for guidance features', () => {
  const part = {
    id:'fixture-rim',
    defaultColor:0xabcdef,
    create(color) {
      return { userData:{ color }, traverse(){}, position:{}, rotation:{} }
    },
  }
  const inserted = { userData:{ instanceId:'inserted', partId:part.id } }
  const api = createBrickLabSubsystemApi({ listParts:() => [part], findPart:id => id === part.id ? part : null })
  api.editor.bind({
    objects:() => [], selection:() => [], projectState:() => ({ version:2, parts:[] }),
    mode:() => 'build',
    viewportPoint:() => ({ x:10, y:20, visible:true }),
    insertPart:(partId, options) => partId === part.id && options.groupId === 'g' ? inserted : null,
  })
  assert.equal(api.editor.mode(), 'build')
  assert.deepEqual(api.editor.viewportPoint({}), { x:10, y:20, visible:true })
  assert.equal(api.editor.insertPart(part.id, { groupId:'g' }), inserted)
})

test('legacy editor bridge inserts a normal PARTS object into the live build root and persists only when called', () => {
  const children = []
  const parent = { add(object) { object.parent = this; children.push(object) } }
  const near = {
    parent,
    userData:{ instanceId:'source', partId:'fixture-source' },
    position:{ x:1, y:2, z:3 },
    rotation:{ x:0, y:.25, z:0 },
  }
  children.push(near)
  const saved = []
  const part = {
    id:'fixture-target', defaultColor:0xabcdef,
    create(color) {
      return {
        userData:{ color },
        position:{ fromArray(values){ this.values=[...values] }, copy(other){ this.copied=other } },
        rotation:{ set(...values){ this.values=values }, copy(other){ this.copied=other } },
        traverse(callback){ callback(this) }, updateMatrixWorld(){},
      }
    },
  }
  const connectorRuntime = { objects:() => children, projectConnections:() => [], reconcileGraph:() => ({}), updateEditor(){} }
  const api = createBrickLabSubsystemApi({ listParts:() => [part], findPart:id => id === part.id ? part : null, globals:{ BrickLabConnectorV4:connectorRuntime } })
  const elements = {
    saveBtn:{ click:() => saved.push('save') },
    projectStats:{ textContent:'1 parts · 0 links' },
    statusText:{ textContent:'BUILD MODE · 1 parts · 0 connections' },
    projectName:{ textContent:'Build' },
  }
  const documentRef = { querySelector(selector) {
    if (selector === '.mode.active') return { dataset:{ mode:'build' } }
    if (selector === '#viewport') return null
    return elements[selector.slice(1)] ?? null
  } }
  const adapter = createLegacyEditorAdapter({
    subsystems:api, connectorRuntime, groups:{ selection:() => [near], primary:() => near }, documentRef, storage:null,
  })
  api.editor.bind(adapter)
  const inserted = api.editor.insertPart(part.id, { nearObject:near, groupId:'assembly-group', position:[4,5,6], rotation:[0,.5,0] })
  assert.equal(children.at(-1), inserted)
  assert.equal(inserted.userData.partId, part.id)
  assert.equal(inserted.userData.groupId, 'assembly-group')
  assert.deepEqual(inserted.position.values, [4,5,6])
  assert.deepEqual(inserted.rotation.values, [0,.5,0])
  assert.deepEqual(saved, ['save'])
})

test('production bootstrap never blocks the established editor UI on Smart Assembly', async () => {
  const source = await readFile(new URL('../bootstrap.js', import.meta.url), 'utf8')
  const runtime = await readFile(new URL('../guidance/smart-assembly-runtime-v1.js', import.meta.url), 'utf8')
  const activation = await readFile(new URL('../guidance/smart-assembly-activation-v1.js', import.meta.url), 'utf8')
  const adapter = source.indexOf("./architecture/editor-adapter-v1.js?v=architecture-20260911-v1")
  const runtimeReady = source.indexOf('window.__bricklabRuntimeReady = true')
  const assistant = source.indexOf("./guidance/smart-assembly-activation-v1.js?v=smart-assembly-20260911-v4")
  assert.ok(adapter >= 0)
  assert.ok(runtimeReady > adapter, 'established editor runtime finishes after the stable editor adapter is bound')
  assert.ok(assistant > runtimeReady, 'optional Smart Assembly activation starts only after the editor is runtime-ready')
  assert.match(source, /setTimeout/)
  assert.doesNotMatch(source, /requestIdleCallback/, 'guidance activation should start promptly after runtimeReady')
  assert.doesNotMatch(source.slice(0, runtimeReady), /smart-assembly-(?:runtime|activation)-v1/, 'guidance must not be in the critical startup chain')
  assert.match(activation, /smart-assembly-runtime-v1\.js\?v=smart-assembly-20260911-v6/)
  assert.doesNotMatch(activation, /smart-assembly-diagnostic-v1/, 'temporary visible diagnostics must not ship in production activation')
  assert.match(runtime, /assembly-compatibility-v1\.js\?v=smart-assembly-20260911-v6/, 'runtime and compatibility logic must share one cache generation')
  assert.match(runtime, /bricklab:editorselectionchange/, 'guidance must react to the authoritative editor selection signal')
  assert.match(runtime, /subsystems\.editor\.insertPart/)
  assert.match(runtime, /const sourceDef = current\.sourceDef/, 'install flow must retain the evaluated source definition')
  assert.match(runtime, /function inspectorSelectedObject\(\)/, 'guidance keeps a live-inspector compatibility fallback')
  assert.match(runtime, /MutationObserver\(scheduleEvaluation\)/, 'guidance must observe lexical inspector selection as a fallback')
  assert.doesNotMatch(runtime, /setInterval/, 'Smart Assembly should be event-driven instead of polling the editor forever')
  assert.doesNotMatch(runtime, /commitCandidate|createConnection\(/, 'tire/rim install must not fabricate a Connector V4 relationship')
})
