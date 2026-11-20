import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { registerHooks } from 'node:module'
import { test } from 'node:test'
import buggy from '../examples/dune-buggy.json' with { type: 'json' }

registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'three') return next(new URL('../vendor/three/build/three.module.min.js', import.meta.url).href, context)
  if (specifier.startsWith('three/addons/')) {
    return next(new URL(specifier.replace('three/addons/', '../vendor/three/examples/jsm/'), import.meta.url).href, context)
  }
  return next(specifier, context)
} })

const { connectAligned, connectPlaced, createAssembly, assemblyJoints } = await import('../src/editor/model.js')
const { componentBundle } = await import('../src/editor/components.js')
const { driveSettings, newDriveState, prepareTestDrive, resizeKinematicDrive, stepTestDrive } = await import('../src/editor/vehicle-drive.js')
const { loadPartModel, parts: catalog } = await import('../src/editor/parts.js')
const { parseProject } = await import('../src/projects/documents.js')
const { Quaternion, Vector3 } = await import('three')
const models = new Map()
const originalFetch = globalThis.fetch
try {
  globalThis.fetch = async url => new Response(await readFile(url))
  for (const id of ['3482', '3634', '4288']) models.set(id, await loadPartModel(catalog[id]))
} finally {
  globalThis.fetch = originalFetch
}

function prepare(options = {}, connections = buggy.connections, parts = buggy.parts) {
  return prepareTestDrive(parts, createAssembly(parts, connections), models, { ...buggy.testDrive, ...options }, catalog)
}

function run(vehicle, state = newDriveState(vehicle), input = {}, frames = 90) {
  let result
  for (let i = 0; i < frames; i++) {
    result = stepTestDrive(vehicle, state, { throttle: 0, steer: 0, brake: false, ...input }, 1 / 60)
  }
  return result
}

test('8845 rolls on four catalogue tyres in both directions and stops under braking', () => {
  const base = structuredClone(buggy.parts)
  const vehicle = prepare()
  assert.equal(vehicle.ready, true)
  assert.equal(vehicle.initial.length, 4)
  assert.deepEqual(vehicle.steered, ['8845-172', '8845-178'])
  const forward = newDriveState(vehicle)
  const rollout = run(vehicle, forward, { throttle: 1 })
  assert.ok(forward.position.z > 250)
  assert.equal(forward.yaw, 0)
  assert.equal(rollout.radius, Infinity)
  const tyre = rollout.poses.find(pose => pose.id === '8845-172')
  assert.notDeepEqual(tyre.rotation, base.find(part => part.id === tyre.id).rotation)
  run(vehicle, forward, { throttle: 1, brake: true }, 25)
  assert.equal(forward.speed, 0)
  const reverse = newDriveState(vehicle)
  run(vehicle, reverse, { throttle: -1 })
  assert.ok(reverse.position.z < -150)
  assert.deepEqual(buggy.parts, base)
})

test('physical wheel angles determine the turn and inversion also applies when reversing', () => {
  for (const invert of [false, true]) {
    const vehicle = prepare({ invert })
    for (const throttle of [1, -1]) {
      const state = newDriveState(vehicle)
      const turning = run(vehicle, state, { throttle, steer: -1 })
      assert.equal(Math.sign(state.yaw), (invert ? 1 : -1) * throttle)
      assert.ok(Number.isFinite(turning.radius) && turning.radius > 0)
      for (const id of ['8845-42', '8845-43', '8845-60', '8845-99']) {
        assert.ok(turning.poses.some(part => part.id === id), id)
      }
      const centered = run(vehicle, state, { brake: true })
      assert.equal(centered.radius, Infinity)
      const restoredRack = centered.poses.find(part => part.id === '8845-60')
      const originalRack = buggy.parts.find(part => part.id === restoredRack.id)
      assert.ok(new Vector3().fromArray(restoredRack.position).distanceTo(new Vector3().fromArray(originalRack.position)) < 1e-8)
    }
  }
})

test('powered drive requires a shaft connected to wheels and reports lost steering', () => {
  const unassigned = prepare({ mode: 'powered', driveParts: ['8845-101', 'missing'] })
  assert.equal(unassigned.ready, false)
  assert.equal(run(unassigned, undefined, { throttle: 1 }).speed, 0)
  const powered = prepare({ mode: 'powered', driveParts: ['8845-5', '8845-6'] })
  assert.deepEqual(powered.driven, ['8845-174', '8845-176'])
  assert.ok(run(powered, undefined, { throttle: 1 }).speed > 0)
  const cut = buggy.connections.filter(({ shaft, socket }) => !(shaft.part === '8845-99' && socket.part === '8845-98'))
  const disconnected = prepare({}, cut)
  assert.deepEqual(disconnected.steered, [])
  assert.equal(run(disconnected, undefined, { throttle: 1, steer: 1 }).yaw, 0)
})

test('the same setup works for renamed vehicles placed at a different heading', () => {
  const turn = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2)
  const id = id => 'renamed-' + id
  const parts = buggy.parts.map(part => ({ ...part, id: id(part.id),
    position: new Vector3().fromArray(part.position).applyQuaternion(turn).toArray(),
    rotation: new Quaternion().fromArray(part.rotation).premultiply(turn).toArray() }))
  const connections = buggy.connections.map(link => ({ ...link,
    shaft: { ...link.shaft, part: id(link.shaft.part) }, socket: { ...link.socket, part: id(link.socket.part) } }))
  const steering = id(buggy.testDrive.steering)
  assert.equal(prepare({ steering, heading: 0 }, connections, parts).ready, false)
  const vehicle = prepare({ steering, heading: 90 }, connections, parts)
  const state = newDriveState(vehicle)
  assert.equal(vehicle.ready, true)
  run(vehicle, state, { throttle: 1 })
  assert.ok(state.position.x > 250 && Math.abs(state.position.z) < .01)
})

test('integral wheels can use their mounted axle bore as the running axis', () => {
  const wheel = (id, z) => ({ id, design: '4288', position: [0, 24, z], rotation: [0, Math.SQRT1_2, 0, Math.SQRT1_2] })
  const wheels = [wheel('front', 100), wheel('rear', -100)]
  const axles = wheels.map(part => ({ id: 'axle-' + part.id, design: '3705',
    position: part.position, rotation: [0, 0, 0, 1] }))
  const pieces = [...wheels, ...axles]
  const assembly = createAssembly(pieces, [])
  connectAligned(assembly, wheels, axles)
  assert.equal(assembly.connections.length, 2)
  const vehicle = prepareTestDrive(pieces, assembly, models, { mode: 'push' }, catalog)
  assert.equal(vehicle.initial.length, 2)
})

test('drive assignments preserve file round-tripping and invalid settings stay safe', () => {
  const testDrive = driveSettings({ heading: 90, mode: 'powered', driveParts: ['one', 'one', 2], steering: 'two', invert: true })
  const reopened = parseProject(JSON.stringify({ ...buggy, testDrive }))
  assert.deepEqual(reopened.testDrive, { simulation: 'physical', scale: 1, venue: 'sketchbook', heading: 90, mode: 'powered', driveParts: ['one'], steering: 'two', invert: true })
  assert.deepEqual(driveSettings({ mode: 'unexpected', heading: NaN }), driveSettings(undefined))
  assert.equal(driveSettings({ scale: .738 }).scale, .75)
  assert.equal(driveSettings({ scale: 5 }).scale, 2)
  assert.equal(driveSettings({ scale: 0 }).scale, .25)
})

test('a drive starts facing along its terrain and follows the ground under the wheels', () => {
  const vehicle = prepare()
  const terrain = {
    start: new Vector3(1000, 50, 2000),
    heading: Math.PI / 2,
    heightAt(x, _z, top, bottom) {
      const height = 50 + Math.max(0, x - 1400) * .22
      return height >= bottom && height <= top ? height : undefined
    },
  }
  const state = newDriveState(vehicle, terrain)
  assert.deepEqual(state.position.clone().add(vehicle.origin).toArray(),
    [1000, 50 + vehicle.lift, 2000])
  assert.ok(Math.abs(state.yaw - Math.PI / 2) < 1e-8)
  let result
  for (let i = 0; i < 180; i++) {
    result = stepTestDrive(vehicle, state, { throttle: 1, steer: 0, brake: false }, 1 / 60, terrain)
    assert.equal(result.blocked, false)
  }
  const point = state.position.clone().add(vehicle.origin)
  assert.ok(point.x > 1700 && Math.abs(point.z - 2000) < 1e-6)
  assert.ok(point.y > 50 + vehicle.lift + 60)
  const normal = new Vector3(0, 1, 0).applyQuaternion(result.tilt)
  assert.ok(Math.abs(normal.x / normal.y + .22) < .025)
})

test('a vehicle cannot drive beyond the last supported wheel position', () => {
  const vehicle = prepare()
  const terrain = {
    start: new Vector3(),
    heading: 0,
    heightAt(_x, z) { return z < 500 ? 0 : undefined },
  }
  const state = newDriveState(vehicle, terrain)
  let result
  for (let i = 0; i < 150; i++) {
    result = stepTestDrive(vehicle, state, { throttle: 1, steer: 0, brake: false }, 1 / 60, terrain)
    if (result.blocked) break
  }
  assert.equal(result.blocked, true)
  assert.equal(result.speed, 0)
  assert.equal(result.distance, 0)
  const front = Math.max(...vehicle.initial.map(wheel => wheel.position.z))
  for (let i = 0; i < 30; i++) {
    stepTestDrive(vehicle, state, { throttle: 1, steer: 0, brake: false }, 1 / 60, terrain)
    assert.ok(front + state.position.z < 500)
  }
  const position = state.position.clone()
  const reverse = stepTestDrive(vehicle, state, { throttle: -1, steer: 0, brake: false }, 1 / 60, terrain)
  assert.equal(reverse.blocked, false)
  assert.ok(state.position.z < position.z)
})

test('Sketchbook shares in-flight and successful loads for the page and can retry a failed fetch', async () => {
  const { loadSketchbookTrack } = await import('../src/editor/sketchbook-track.js')
  const vertices = Buffer.from(new Float32Array([-10, 0, -10, 0, 0, 10, 10, 0, -10]).buffer)
  const gltf = {
    asset: { version: '2.0' }, scenes: [{ nodes: [0, 1] }],
    nodes: [{ name: 'ground', mesh: 0, extras: { data: 'physics', type: 'trimesh' } },
      { name: 'Spawn016', translation: [0, 1, 0] }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [-10, 0, -10], max: [10, 0, 10] }],
    bufferViews: [{ buffer: 0, byteLength: vertices.length }],
    buffers: [{ byteLength: vertices.length }],
  }
  const json = Buffer.from(JSON.stringify(gltf))
  const jsonSize = Math.ceil(json.length / 4) * 4
  const binOffset = 20 + jsonSize
  const glb = Buffer.alloc(binOffset + 8 + vertices.length)
  glb.write('glTF')
  glb.writeUInt32LE(2, 4)
  glb.writeUInt32LE(glb.length, 8)
  glb.writeUInt32LE(jsonSize, 12)
  glb.write('JSON', 16)
  glb.fill(0x20, 20, binOffset)
  json.copy(glb, 20)
  glb.writeUInt32LE(vertices.length, binOffset)
  glb.write('BIN\0', binOffset + 4)
  vertices.copy(glb, binOffset + 8)

  let requests = 0
  globalThis.fetch = async () => {
    if (++requests === 1) return new Response(null, { status: 503 })
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(glb.subarray(0, 12))
        controller.enqueue(glb.subarray(12))
        controller.close()
      },
    })
    return new Response(body, { headers: { 'content-length': String(glb.length) } })
  }
  try {
    const failed = loadSketchbookTrack()
    assert.equal(loadSketchbookTrack(), failed)
    await assert.rejects(failed, /503/)
    const updates = []
    const retry = loadSketchbookTrack({ onProgress: next => updates.push(next) })
    assert.equal(loadSketchbookTrack(), retry)
    const track = await retry
    assert.deepEqual(track.start.toArray(), [0, 0, 0])
    assert.equal(await loadSketchbookTrack(), track)
    assert.equal(requests, 2)
    assert.deepEqual(updates.slice(-4), [
      { stage: 'download', loaded: 12, total: glb.length },
      { stage: 'download', loaded: glb.length, total: glb.length },
      { stage: 'prepare' },
      { stage: 'ready' },
    ])
  } finally {
    globalThis.fetch = originalFetch
  }
})

const { default: rapier } = await import('@dimforge/rapier3d-compat')
const { createPhysicalDrive } = await import('../src/editor/physical-drive.js')
const { createPhysicalAssembly } = await import('../src/mechanics/physical-assembly.js')
const { findSuspension } = await import('../src/editor/suspension.js')
const { rotationMotion, rotationPoses } = await import('../src/editor/model.js')
const { Box3, BoxGeometry, Mesh, MeshBasicMaterial } = await import('three')

const neutralInput = { throttle: 0, steer: 0, brake: false }
const sampleFrames = (simulation, frames, input = {}) => {
  let frame
  for (let i = 0; i < frames; i++) frame = simulation.advance({ ...neutralInput, ...input }, 1 / 60)
  return frame
}

test('physical test drive compresses one shock over a single-wheel bump and settles after it', async () => {
  await rapier.init()
  const rig = prepare()
  const assembly = createAssembly(buggy.parts, buggy.connections)
  const shapes = []
  function box(width, height, length, x, y, z) {
    const geometry = new BoxGeometry(width, height, length)
    geometry.computeBoundingBox()
    const mesh = new Mesh(geometry, new MeshBasicMaterial())
    mesh.userData.type = 'box'
    mesh.position.set(x, y, z)
    mesh.updateMatrixWorld(true)
    shapes.push(mesh)
  }
  box(3200, 80, 10000, 0, -40, 0)
  box(90, 30, 100, 110, 15, 165)
  const sim = createPhysicalDrive(rapier, rig, models, assembly,
    { start: new Vector3(), heading: 0, collisionMeshes: shapes })
  try {
    const rested = sampleFrames(sim, 150)
    assert.equal(rested.grounded, 4)
    assert.equal(rested.suspension.length, 2)
    assert.ok(rested.suspension.every(shock => shock.length < 38 && shock.length > 20))
    let greatestDifference = 0
    for (let i = 0; i < 150; i++) {
      const frame = sim.advance({ ...neutralInput, throttle: 1 }, 1 / 60)
      const [right, left] = frame.suspension
      greatestDifference = Math.max(greatestDifference, left.length - right.length)
      assert.ok(frame.poses.find(part => part.id === right.spring).previewScale[1] > 0)
    }
    assert.ok(greatestDifference > 1.4, `shock travel difference was ${greatestDifference}`)
    const stopped = sampleFrames(sim, 210, { brake: true })
    assert.equal(stopped.grounded, 4)
    assert.ok(Math.abs(stopped.speed) < .09)
    assert.ok(Math.abs(stopped.suspension[0].length - stopped.suspension[1].length) < 1)
  } finally {
    sim.dispose()
    for (const shape of shapes) { shape.geometry.dispose(); shape.material.dispose() }
  }
})

test('a different installed ride height is detected from its joints with unrelated part IDs', async () => {
  const original = createAssembly(buggy.parts, buggy.connections)
  const motion = rotationMotion('8845-106', buggy.parts, original)
  const reposed = new Map(rotationPoses(buggy.parts, motion, -.28).map(part => [part.id, part]))
  const id = name => 'alternate-' + name
  const pieces = buggy.parts.map(part => {
    const { previewScale, ...pose } = reposed.get(part.id) ?? part
    return { ...pose, id: id(part.id) }
  })
  const byId = new Map(pieces.map(part => [part.id, part]))
  const assembly = createAssembly(pieces, [])
  for (const { shaft, socket, placement } of buggy.connections) {
    const a = byId.get(id(shaft.part))
    const b = byId.get(id(socket.part))
    const result = connectPlaced(assembly, a, b, { placement,
      shaft: { ...shaft, part: a.id }, socket: { ...socket, part: b.id } })
    assert.ok(result.ok, result.reason)
  }
  const rig = prepareTestDrive(pieces, assembly, models, { heading: 0, steering: id(buggy.testDrive.steering) }, catalog)
  assert.equal(rig.ready, true)
  const springs = findSuspension(rig, assembly)
  assert.equal(springs.size, 2)
  const adjusted = springs.get(id('8845-174'))
  const unchanged = springs.get(id('8845-176'))
  assert.ok(adjusted.min < unchanged.min - 10)
  await rapier.init()
  const sim = createPhysicalDrive(rapier, rig, models, assembly)
  try {
    const settled = sampleFrames(sim, 180)
    assert.equal(settled.grounded, 4)
    assert.equal(settled.suspension.length, 2)
    assert.ok(settled.suspension.every(shock => shock.length > 20 && shock.length < 38))
    assert.ok(sampleFrames(sim, 80, { throttle: 1 }).speed > .7)
  } finally { sim.dispose() }
})

test('assembly physics compiles rigid groups, rotational/linear constraints and a bounded spring damper', async () => {
  await rapier.init()
  const pieces = [
    partWithPose('anchor', [0, 200, 0]),
    partWithPose('bracket', [-30, 200, 0]),
    partWithPose('rod', [80, 200, 0]),
    partWithPose('coil', [10, 200, 0]),
    partWithPose('arm', [-70, 200, 0]),
  ]
  const line = start => ({ start, axis: [1, 0, 0] })
  const fixedLine = line([0, 200, 0])
  const joints = [
    { a: 'anchor', b: 'bracket', motion: 'locked', shaftLine: fixedLine, socketLine: fixedLine },
    { a: 'arm', b: 'bracket', motion: 'continuous', shaftLine: line([-50, 200, 0]), socketLine: line([-50, 200, 0]) },
    { a: 'rod', b: 'anchor', motion: 'slider', shaftLine: line([80, 200, 0]), socketLine: fixedLine,
      stroke: [60, 100], springSeat: [72, 200, 0] },
    { a: 'coil', b: 'anchor', motion: 'spring', shaftLine: line([10, 200, 0]), socketLine: line([10, 200, 0]),
      restLength: 65 },
  ]
  const bounds = new Box3(new Vector3(-7, -7, -7), new Vector3(7, 7, 7))
  const sim = createPhysicalAssembly(rapier, pieces, joints, new Map([['probe', { bounds }]]), { pinned: ['anchor'] })
  try {
    assert.equal(sim.bodies, 3)
    assert.equal(sim.constraints, 2)
    assert.equal(sim.unsupported, 0)
    sim.push('arm', new Vector3(0, 0, 1))
    sim.push('rod', new Vector3(1, 0, 0))
    let poses
    for (let i = 0; i < 150; i++) poses = new Map(sim.advance(1 / 60).map(part => [part.id, part]))
    assert.ok(new Vector3().fromArray(poses.get('anchor').position).distanceTo(new Vector3(0, 200, 0)) < .001)
    const extension = poses.get('rod').position[0]
    assert.ok(extension >= 59.9 && extension <= 100.1, `damper extension was ${extension}`)
    assert.ok(Math.abs(extension - 83) < .5, `damper did not return to rest length: ${extension}`)
    assert.ok(poses.get('coil').previewScale[1] > 0)
  } finally {
    sim.dispose()
  }
})

function partWithPose(id, position) {
  return { id, design: 'probe', position, rotation: [0, 0, 0, 1] }
}

test('powered Control+ L applies bounded torque to its rotor while the mounted housing stays fixed', async () => {
  await rapier.init()
  const bundle = componentBundle({ id: 'motor', design: '22169', position: [0, 200, 0], rotation: [0, 0, 0, 1] },
    catalog, () => 'rotor')
  assert.ok(bundle)
  const hub = { id: 'hub', design: '22127', position: [200, 200, 0], rotation: [0, 0, 0, 1], electric: { on: true, battery: 100 } }
  const bounds = new Box3(new Vector3(-5, -5, -5), new Vector3(5, 5, 5))
  const motorModels = new Map(['u9479c01', '40940', '22127'].map(design => [design, { bounds }]))
  const run = (power, on, locked = false) => {
    const pieces = [{ ...bundle.anchor, electric: { hubId: 'hub', port: 0, power } }, ...bundle.items,
      { ...hub, electric: { ...hub.electric, on } }]
    const assembly = createAssembly(pieces, bundle.links)
    const sim = createPhysicalAssembly(rapier, pieces, assemblyJoints(pieces, assembly), motorModels,
      { pinned: ['motor', 'hub', ...(locked ? ['rotor'] : [])] })
    try {
      let poses
      for (let i = 0; i < 120; i++) poses = sim.advance(1 / 120)
      const housing = poses.find(part => part.id === 'motor')
      assert.ok(new Vector3().fromArray(housing.position).distanceTo(new Vector3(0, 200, 0)) < 1e-6)
      const result = sim.motors[0]
      if (power === 100 && on && !locked) {
        sim.controlMotor('motor', 0, 'brake')
        for (let i = 0; i < 120; i++) sim.advance(1 / 120)
        assert.ok(Math.abs(sim.motors[0].rpm) < Math.abs(result.rpm) / 2)
        sim.controlMotor('motor', -100, 'coast')
        for (let i = 0; i < 120; i++) sim.advance(1 / 120)
        assert.ok(sim.motors[0].rpm < 0)
      }
      return result
    } finally { sim.dispose() }
  }
  assert.ok(run(100, true).rpm > 0)
  assert.ok(run(-100, true).rpm < 0)
  assert.ok(Math.abs(run(100, false).rpm) < .01)
  const blocked = run(100, true, true)
  assert.ok(Math.abs(blocked.rpm) < .01)
  assert.equal(blocked.stalled, true)
})

test('a vehicle keeps its momentum in the air and falls when none of its wheels has contact', async () => {
  await rapier.init()
  const geometry = new BoxGeometry(2200, 60, 1900)
  geometry.computeBoundingBox()
  const surface = new Mesh(geometry, new MeshBasicMaterial())
  surface.userData.type = 'box'
  surface.position.set(0, -30, -50)
  surface.updateMatrixWorld(true)
  const rig = prepare()
  const sim = createPhysicalDrive(rapier, rig, models, createAssembly(buggy.parts, buggy.connections),
    { start: new Vector3(), heading: 0, collisionMeshes: [surface] })
  try {
    assert.equal(sampleFrames(sim, 150).grounded, 4)
    let flight
    for (let i = 0; i < 450; i++) {
      const frame = sim.advance({ ...neutralInput, throttle: 1 }, 1 / 60)
      if (!frame.grounded) {
        flight = frame
        break
      }
    }
    assert.ok(flight)
    const next = sampleFrames(sim, 20, { throttle: 1 })
    assert.equal(next.grounded, 0)
    assert.ok(next.position.z > flight.position.z + 8)
    const falling = sampleFrames(sim, 60, { throttle: 1 })
    assert.equal(falling.grounded, 0)
    assert.ok(falling.position.y < next.position.y - 50)
    assert.equal(sampleFrames(sim, 170).outOfBounds, true)
  } finally {
    sim.dispose()
    geometry.dispose()
    surface.material.dispose()
  }
})

test('a live resize lets the chassis clear a low roof and blocks enlarging beneath it', async () => {
  await rapier.init()
  const shapes = [
    new BoxGeometry(1600, 60, 4200),
    new BoxGeometry(600, 65, 570),
  ].map(geometry => {
    geometry.computeBoundingBox()
    const shape = new Mesh(geometry, new MeshBasicMaterial())
    shape.userData.type = 'box'
    return shape
  })
  const [floor, roof] = shapes
  floor.position.y = -30
  roof.position.set(0, 84.5, 945)
  for (const shape of shapes) shape.updateMatrixWorld(true)
  const rig = prepare()
  const simulation = createPhysicalDrive(rapier, rig, models, createAssembly(buggy.parts, buggy.connections),
    { start: new Vector3(), heading: 0, collisionMeshes: shapes })
  const position = frame => frame.position.clone().add(rig.origin)

  try {
    assert.equal(sampleFrames(simulation, 140).grounded, 4)
    const blocked = sampleFrames(simulation, 420, { throttle: 1 })
    const oldPosition = position(blocked)
    assert.ok(oldPosition.z < 500, 'full-size vehicle advanced beneath the roof')
    assert.ok(Math.abs(blocked.speed) < .25)

    assert.equal(simulation.resize(.5), true)
    const smaller = simulation.advance(neutralInput, 0)
    assert.equal(smaller.scale, .5)
    assert.ok(Math.abs(position(smaller).z - oldPosition.z) < 1e-4)
    assert.ok(Math.abs(position(smaller).x - oldPosition.x) < 1e-4)

    let inside
    for (let i = 0; i < 360; i++) {
      const frame = simulation.advance({ ...neutralInput, throttle: 1 }, 1 / 60)
      if (position(frame).z > 760) { inside = frame; break }
    }
    assert.ok(inside, 'scaled vehicle did not reach the tunnel interior')
    assert.equal(inside.grounded, 4)
    assert.equal(simulation.resize(1.5), false)
    assert.equal(simulation.advance(neutralInput, 0).scale, .5)
    const clear = sampleFrames(simulation, 320, { throttle: 1 })
    assert.ok(position(clear).z > 1270, 'scaled vehicle did not clear the far end')
  } finally {
    simulation.dispose()
    for (const shape of shapes) { shape.geometry.dispose(); shape.material.dispose() }
  }
})


test('kinematic terrain contact uses the scaled wheel footprint', () => {
  const rig = prepare()
  const terrain = { start: new Vector3(), heading: 0, heightAt: x => Math.abs(x) <= 75 ? 0 : undefined }
  const state = newDriveState(rig, terrain)
  const input = { ...neutralInput, throttle: 1 }
  assert.equal(stepTestDrive(rig, state, input, 1 / 60, terrain).blocked, true)
  resizeKinematicDrive(rig, state, .55)
  let frame
  for (let i = 0; i < 120; i++) frame = stepTestDrive(rig, state, input, 1 / 60, terrain)
  assert.equal(frame.blocked, false)
  assert.equal(frame.scale, .55)
  assert.ok(frame.position.z + rig.origin.z > 350)
})
