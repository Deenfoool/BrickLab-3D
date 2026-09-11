import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  BRICKLAB_SUBSYSTEM_API_VERSION,
  createBrickLabSubsystemApi,
} from '../architecture/subsystem-api-v1.js'
import { createLegacyEditorAdapter } from '../architecture/editor-adapter-v1.js'

function fixturePart() {
  return {
    id:'fixture-gear',
    defaultColor:0xabcdef,
    mechanics:{ gear:{ teeth:16 }, shaft:true },
    physics:{ massKg:0.001, collisionClass:'mechanical' },
    connectors:[{ id:'axle-hole', type:'axle-hole' }],
    create(color) {
      const root = {
        userData:{ created:true },
        children:[{ userData:{} }],
        traverse(callback) {
          callback(this)
          for (const child of this.children) callback(child)
        },
      }
      root.userData.color = color
      return root
    },
  }
}

test('Architecture API centralizes part metadata and object identity without exposing mutable metadata', () => {
  const part = fixturePart()
  const api = createBrickLabSubsystemApi({
    listParts:() => [part],
    findPart:id => id === part.id ? part : null,
    uuid:() => 'fixture-instance',
  })

  assert.match(BRICKLAB_SUBSYSTEM_API_VERSION, /^architecture-v1\./)
  assert.equal(api.parts.get(part.id), part)
  assert.deepEqual(api.parts.capabilities(part.id), { visual:true, snap:true, mechanical:true })

  const mechanics = api.parts.mechanical(part.id)
  assert.equal(mechanics.gear.teeth, 16)
  assert.throws(() => { mechanics.gear.teeth = 99 }, TypeError)
  assert.equal(part.mechanics.gear.teeth, 16)

  const object = api.parts.instantiate(part.id)
  assert.equal(object.userData.instanceId, 'fixture-instance')
  assert.equal(object.userData.partId, part.id)
  assert.equal(object.children[0].userData.instanceRoot, object)
})

test('BUILD and SIMULATE authority remain delegated to Connector V4 and its fail-closed physics guard', async () => {
  const calls = []
  const globals = {
    BrickLabConnectorV4:{
      objects:() => [{ userData:{ instanceId:'a' } }],
      projectConnections:() => [{ id:'v4-1', physicsReady:false }],
      reconcileGraph:(objects, options) => ({ kept:1, objectCount:objects.length, persist:options.persist }),
      removePartConnections:id => { calls.push(['remove', id]); return 2 },
      restoreConnections:records => ({ restored:records.length, rejected:0 }),
      clearGraph:() => calls.push(['clear']),
      audit:id => ({ partId:id, pass:true }),
    },
    BrickLabConnectorV4PhysicsGuard:{
      version:'guard-v4', safetyVersion:'safe-v4', policyVersion:'policy-v4', adapterVersion:'adapter-v4',
      errorCode:'BLOCKED', active:true, createOwner:'guard-v4',
      lastPlan:() => ({ pass:false, blockers:[{ reason:'uncertified' }] }),
      lastFailure:() => null,
    },
  }
  const api = createBrickLabSubsystemApi({
    globals,
    createPhysicsSession:async (objects, connections) => ({ objects, connections, guarded:true }),
  })

  assert.equal(api.connectivity.authority.build, 'connector-v4-with-legacy-bridge')
  assert.equal(api.connectivity.authority.simulate, 'connector-v4-physics-guard')
  assert.equal(api.connectivity.build.records()[0].id, 'v4-1')
  assert.deepEqual(api.connectivity.build.reconcile(undefined, { persist:false }), { kept:1, objectCount:1, persist:false })
  assert.equal(api.connectivity.build.removePart('a'), 2)
  assert.equal(api.connectivity.simulate.ready(), true)
  assert.equal(api.physics.guard().createOwner, 'guard-v4')
  assert.equal(api.physics.lastPlan().blockers[0].reason, 'uncertified')

  const session = await api.physics.createSession([{ id:1 }], [{ id:2 }])
  assert.equal(session.guarded, true)
  assert.deepEqual(calls, [['remove','a']])
})

test('Editor-facing contract is bindable incrementally and supplies identity/group/history access through one boundary', () => {
  const objects = [{ userData:{ instanceId:'a', partId:'fixture', groupId:'g' } }]
  const selection = [objects[0]]
  const api = createBrickLabSubsystemApi({
    groupMembers:object => object ? [object] : [],
    isGroup:object => object?.userData?.groupId === 'g',
  })

  assert.equal(api.editor.ready(), false)
  assert.throws(() => api.editor.bind({ objects:() => objects }), /missing/)
  api.editor.bind({
    objects:() => objects,
    selection:() => selection,
    primarySelection:() => selection[0],
    projectState:() => ({ version:2, parts:[{ instanceId:'a' }] }),
    history:() => ({ index:2, length:4 }),
  })

  assert.equal(api.editor.ready(), true)
  assert.equal(api.editor.identity.instanceId(objects[0]), 'a')
  assert.equal(api.editor.identity.partId(objects[0]), 'fixture')
  assert.equal(api.editor.objectById('a'), objects[0])
  assert.deepEqual(api.editor.history(), { index:2, length:4 })
  assert.equal(api.editor.groups.isGroup(objects[0]), true)
})



test('legacy editor adapter binds live editor state without making app internals a public dependency', () => {
  const clicks = []
  const elements = {
    projectName:{ textContent:'Adapter Build' },
    undoBtn:{ disabled:false, click:() => clicks.push('undo') },
    redoBtn:{ disabled:true, click:() => clicks.push('redo') },
    saveBtn:{ click:() => clicks.push('save') },
    newBtn:{ click:() => clicks.push('new') },
    importBtn:{ click:() => clicks.push('import') },
    exportBtn:{ click:() => clicks.push('export') },
  }
  const object = {
    userData:{ instanceId:'live-a', partId:'fixture-gear', color:0x123456, groupId:'group-a' },
    position:{ toArray:() => [4,5,6] },
    rotation:{ x:0.1, y:0.2, z:0.3 },
  }
  const reconciles = []
  const subsystems = {
    editor:{},
    connectivity:{
      build:{
        reconcile:(objects, options) => { reconciles.push([objects, options]); return { kept:1 } },
        records:() => [{ id:'live-v4' }],
      },
    },
  }
  const adapter = createLegacyEditorAdapter({
    subsystems,
    connectorRuntime:{ objects:() => [object] },
    groups:{ selection:() => [object], primary:() => object },
    documentRef:{ querySelector:selector => elements[selector.slice(1)] ?? null },
    storage:{ getItem:key => key === 'bricklab.project.v2' ? JSON.stringify({
      version:2,
      name:'Stored Build',
      parts:[{ instanceId:'stale' }],
      connections:[{ id:'legacy-link' }],
      connectionsV4:[{ id:'stale-v4' }],
    }) : null },
  })

  assert.deepEqual(adapter.selection(), [object])
  assert.equal(adapter.primarySelection(), object)
  assert.equal(adapter.objectById('live-a'), object)
  assert.deepEqual(adapter.history(), { canUndo:true, canRedo:false })

  const state = adapter.projectState()
  assert.equal(state.name, 'Adapter Build')
  assert.deepEqual(state.parts[0].position, [4,5,6])
  assert.deepEqual(state.connections, [{ id:'legacy-link' }])
  assert.deepEqual(state.connectionsV4, [{ id:'live-v4' }])
  assert.equal(reconciles.length, 1)
  assert.deepEqual(reconciles[0][1], { persist:false })

  adapter.undo(); adapter.redo(); adapter.save(); adapter.createNew(); adapter.requestImport(); adapter.exportProject()
  assert.deepEqual(clicks, ['undo','redo','save','new','import','export'])
})

test('production bootstrap installs Architecture API after the V4 physics guard and before app.js', async () => {
  const source = await readFile(new URL('../bootstrap.js', import.meta.url), 'utf8')
  const guard = source.indexOf("await import('./connectors-v4/physics-guard-v4.js')")
  const architecture = source.indexOf("await import('./architecture/runtime-v1.js?v=architecture-20260911-v1')")
  const app = source.indexOf("await import('./app.js')")
  const editorAdapter = source.indexOf("await import('./architecture/editor-adapter-v1.js?v=architecture-20260911-v1')")

  assert.ok(guard >= 0, 'Connector V4 physics guard is installed')
  assert.ok(architecture > guard, 'Architecture API is loaded after the guard')
  assert.ok(app > architecture, 'editor starts only after stable subsystem facade exists')
  assert.ok(editorAdapter > app, 'legacy editor state is bound only after app.js creates it')
})
