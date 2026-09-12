import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createBrickLabSubsystemApi } from '../architecture/subsystem-api-v1.js'
import { createDesignDoctorScanner, sortDesignDoctorIssues } from '../guidance/design-doctor-engine-v1.js'

class ImmediateScheduler {
  constructor(){ this.aborted = [] }
  schedule(items, worker, { key='default' }={}) {
    const list = [...items]
    list.forEach((item,index) => worker(item,index,1))
    return Promise.resolve({ aborted:false, generation:1, processed:list.length, total:list.length, key })
  }
  abort(key, reason){ this.aborted.push([key,reason]); return true }
}

function partObject(instanceId, partId, position=[0,0,0]) {
  return {
    userData:{ instanceId, partId },
    position:{ x:position[0], y:position[1], z:position[2] },
    updateWorldMatrix(){},
  }
}

function ldrawDef(code, { connectors=[], confidence='unknown', mechanicalClass='unknown' }={}) {
  return {
    id:`ldraw-${code}`,
    name:`Fixture ${code}`,
    connectors,
    ldraw:{ code, file:`${code}.dat`, ready:true },
    mechanicalIntelligence:{ class:mechanicalClass, confidence, source:confidence === 'unknown' ? 'none' : 'fixture', properties:{} },
  }
}

function makeApi({ parts, objects, legacyConnections=[], v4Records=[], drivetrain=null }={}) {
  const byId = new Map(parts.map(part => [part.id,part]))
  const connectorRuntime = {
    projectConnections:() => v4Records,
    audit:() => null,
    getConnector:() => null,
    reconcileGraph:() => ({}),
    objects:() => objects,
  }
  const globals = { BrickLabConnectorV4:connectorRuntime }
  const api = createBrickLabSubsystemApi({
    listParts:() => parts,
    findPart:id => byId.get(id) ?? null,
    analyzeDrivetrain:() => drivetrain ?? { shafts:[], motors:[], conflicts:[], stats:{ conflicts:0 } },
    globals,
  })
  api.editor.bind({
    objects:() => objects,
    selection:() => [],
    primarySelection:() => null,
    projectState:() => ({ version:2, parts:[], connections:legacyConnections }),
    mode:() => 'build',
  })
  return api
}

test('Design Doctor reports an incomplete curated tyre assembly and unresolved LDraw metadata', async () => {
  const tire = ldrawDef('6578')
  const object = partObject('tire-1', tire.id)
  const api = makeApi({ parts:[tire], objects:[object] })
  const scanner = createDesignDoctorScanner({ subsystems:api, scheduler:new ImmediateScheduler() })
  const result = await scanner.scan()
  assert.equal(result.aborted, false)
  assert.ok(result.issues.some(issue => issue.family === 'incomplete-assembly' && issue.details?.suggestedPartId === 'ldraw-2994'))
  assert.ok(result.issues.some(issue => issue.family === 'mechanical-metadata' && issue.severity === 'info'))
})

test('Design Doctor reports connector-capable floating parts only when the build has other parts', async () => {
  const defA = { id:'part-a', name:'A', connectors:[{id:'a',type:'pin'}] }
  const defB = { id:'part-b', name:'B', connectors:[] }
  const a = partObject('a-1', defA.id)
  const b = partObject('b-1', defB.id)
  const api = makeApi({ parts:[defA,defB], objects:[a,b] })
  const result = await createDesignDoctorScanner({ subsystems:api, scheduler:new ImmediateScheduler() }).scan()
  const floating = result.issues.filter(issue => issue.family === 'floating-part')
  assert.equal(floating.length, 1)
  assert.equal(floating[0].instanceId, 'a-1')
})

test('Design Doctor detects duplicate V4 endpoint occupancy without reproducing connector matching rules', async () => {
  const defA = { id:'part-a', name:'A', connectors:[] }
  const defB = { id:'part-b', name:'B', connectors:[] }
  const defC = { id:'part-c', name:'C', connectors:[] }
  const a = partObject('a', defA.id)
  const b = partObject('b', defB.id)
  const c = partObject('c', defC.id)
  const records = [
    { id:'r1', a:{instanceId:'a',partId:'part-a',endpointId:'ep'}, b:{instanceId:'b',partId:'part-b',endpointId:'b1'} },
    { id:'r2', a:{instanceId:'a',partId:'part-a',endpointId:'ep'}, b:{instanceId:'c',partId:'part-c',endpointId:'c1'} },
  ]
  const api = makeApi({ parts:[defA,defB,defC], objects:[a,b,c], v4Records:records })
  const result = await createDesignDoctorScanner({ subsystems:api, scheduler:new ImmediateScheduler() }).scan()
  const conflict = result.issues.find(issue => issue.family === 'endpoint-occupancy')
  assert.ok(conflict)
  assert.equal(conflict.severity, 'error')
  assert.deepEqual(conflict.details.connectionIds, ['r1','r2'])
})

test('Design Doctor maps drivetrain analyzer conflicts back to a real scene object', async () => {
  const def = { id:'axle', name:'Axle', connectors:[] }
  const object = partObject('axle-1', def.id)
  const drivetrain = {
    shafts:[{ id:'shaft-1', memberIds:['axle-1'] }],
    motors:[],
    conflicts:[{ type:'gear-loop-conflict', shaftId:'shaft-1', expectedRpm:120, incomingRpm:-120, meshId:'g1' }],
    stats:{ conflicts:1 },
  }
  const api = makeApi({ parts:[def], objects:[object], drivetrain })
  const result = await createDesignDoctorScanner({ subsystems:api, scheduler:new ImmediateScheduler() }).scan()
  const conflict = result.issues.find(issue => issue.reason === 'gear-loop-conflict')
  assert.equal(conflict?.object, object)
  assert.equal(conflict?.severity, 'error')
})

test('Design Doctor scan is progressive and emits monotonic progress through the scheduler', async () => {
  const parts = [0,1,2].map(index => ({ id:`p${index}`, name:`P${index}`, connectors:[] }))
  const objects = parts.map((part,index) => partObject(`i${index}`, part.id))
  const scheduler = new ImmediateScheduler()
  const api = makeApi({ parts, objects })
  const values = []
  const result = await createDesignDoctorScanner({ subsystems:api, scheduler }).scan({ onProgress:progress => values.push(progress.fraction) })
  assert.equal(result.aborted, false)
  assert.ok(values.length >= objects.length + 2)
  for (let index=1; index<values.length; index += 1) assert.ok(values[index] >= values[index-1])
  assert.equal(values.at(-1), 1)
})

test('Design Doctor issue ordering prioritizes errors, then warnings, then information', () => {
  const sorted = sortDesignDoctorIssues([
    { id:'i', severity:'info' },
    { id:'w', severity:'warning' },
    { id:'e', severity:'error' },
  ])
  assert.deepEqual(sorted.map(issue => issue.id), ['e','w','i'])
})

test('production Design Doctor is scene-native, non-blocking and never adds collider-affecting helper geometry', async () => {
  const bootstrap = await readFile(new URL('../bootstrap.js', import.meta.url), 'utf8')
  const runtime = await readFile(new URL('../guidance/design-doctor-runtime-v1.js', import.meta.url), 'utf8')
  const engine = await readFile(new URL('../guidance/design-doctor-engine-v1.js', import.meta.url), 'utf8')
  const css = await readFile(new URL('../guidance/design-doctor-v1.css', import.meta.url), 'utf8')
  const index = await readFile(new URL('../index.html', import.meta.url), 'utf8')

  const adapter = bootstrap.indexOf("./architecture/editor-adapter-v1.js?v=architecture-20260911-v1")
  const doctor = bootstrap.indexOf("./guidance/design-doctor-runtime-v1.js?v=design-doctor-20260912-v1")
  const optionalUi = bootstrap.indexOf("./parts5/gear-mesh-ui-v1.js?v=parts-5-20260909-visual-v2")
  assert.ok(adapter >= 0 && doctor > adapter)
  assert.ok(doctor < optionalUi, 'later optional UI must never gate Design Doctor startup')
  assert.match(bootstrap, /void startDesignDoctor\(\)/)
  assert.doesNotMatch(bootstrap, /await startDesignDoctor\(\)/)

  const bootstrapUrls = index.match(/bootstrap\.js\?v=design-doctor-20260912-v1/g) ?? []
  assert.equal(bootstrapUrls.length, 2)
  assert.match(runtime, /design-doctor-marker/)
  assert.match(runtime, /data-doctor-next/)
  assert.match(runtime, /data-doctor-focus/)
  assert.match(runtime, /cloneObjectMaterials/)
  assert.doesNotMatch(runtime, /BoxHelper|scene\.add\(/, 'Doctor visuals must not enter the scene/collider object tree')
  assert.doesNotMatch(runtime, /setInterval/, 'Doctor must remain event-driven')
  assert.match(engine, /FrameBudgetScheduler/)
  assert.match(engine, /buildPhysicsPlanV4/)
  assert.match(engine, /hardenPhysicsPlanV4/)
  assert.match(engine, /drivetrainSemanticLinksV4/)
  assert.match(css, /severity-error/)
  assert.match(css, /severity-warning/)
  assert.match(css, /severity-info/)
})
