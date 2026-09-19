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

test('BUILD without native takeover fails closed and leaves SIMULATE unavailable', async () => {
  const globals = {}
  const api = createBrickLabSubsystemApi({
    globals,
    createPhysicsSession:async (objects, connections) => ({ objects, connections, guarded:true }),
  })

  assert.equal(api.connectivity.authority.build, 'unavailable')
  assert.equal(api.connectivity.authority.simulate, 'unavailable')
  assert.deepEqual(api.connectivity.build.records(), [])
  assert.equal(api.connectivity.build.reconcile().unavailable, true)
  assert.equal(api.connectivity.build.removePart('a'), 0)
  assert.equal(api.connectivity.simulate.ready(), false)
  assert.equal(api.physics.guard(), null)

  const session = await api.physics.createSession([{ id:1 }], [{ id:2 }])
  assert.equal(session.guarded, true)
})

test('Architecture does not claim native SIMULATE before BUILD authority is published', () => {
  const globals = {
    BrickLabMechanicsNextPhysicsOwner:{
      active:true,
      createOwner:'mechanics-next-physics-owner-0.1.0',
    },
  }
  const api=createBrickLabSubsystemApi({globals})
  assert.equal(api.connectivity.authority.build,'unavailable')
  assert.equal(api.connectivity.authority.simulate,'unavailable')
})

test('Architecture authority reports Mechanics Next after native BUILD and physics handoff', () => {
  const globals = {
    BrickLabMechanicsNextBuildOwner:{
      active:true,
      authoritative:() => true,
    },
    BrickLabMechanicsNextPhysicsOwner:{
      active:true,
      createOwner:'mechanics-next-physics-owner-0.1.0',
    },
  }
  const api=createBrickLabSubsystemApi({globals})
  assert.equal(api.connectivity.authority.build,'mechanics-next-build-owner')
  assert.equal(api.connectivity.authority.simulate,'mechanics-next-physics-owner')
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
  assert.equal(state.connectionsV4, undefined)
  assert.equal(state.connectorSystemV4, undefined)
  assert.equal(reconciles.length, 1)
  assert.deepEqual(reconciles[0][1], { persist:false })

  adapter.undo(); adapter.redo(); adapter.save(); adapter.createNew(); adapter.requestImport(); adapter.exportProject()
  assert.deepEqual(clicks, ['undo','redo','save','new','import','export'])
})

test('production bootstrap installs Architecture API before app.js without a legacy physics guard', async () => {
  const source = await readFile(new URL('../bootstrap.js', import.meta.url), 'utf8')
  const guard = source.indexOf("await import('./connectors-v4/physics-guard-v4.js')")
  const architecture = source.indexOf("await import('./architecture/runtime-v1.js")
  const app = source.indexOf("await import('./app.js')")
  const editorAdapter = source.indexOf("await import('./architecture/editor-adapter-v1.js?v=architecture-20260911-v1')")

  assert.equal(guard, -1, 'Connector V4 physics guard is retired')
  assert.ok(architecture >= 0, 'Architecture API is installed')
  assert.ok(app > architecture, 'editor starts only after stable subsystem facade exists')
  assert.ok(editorAdapter > app, 'legacy editor state is bound only after app.js creates it')
})
