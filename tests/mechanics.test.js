import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildDrivetrain } from '../examples/drivetrain.js'
import { Assembly } from '../src/mechanics/assembly.js'
import { evaluateInsertion } from '../src/mechanics/axial.js'
import { gearAt, technic } from '../src/mechanics/catalog.js'
import { evaluateSpurMesh } from '../src/mechanics/gears.js'

const shaft = technic['3737'][0]
const bearing = technic['3700'][0]
const [blindA, blindB] = technic['6538']

test('a through bore accepts an axle from either side in either orientation', () => {
  for (const [direction, offset] of [[1, -80], [-1, 100]]) {
    for (const side of ['start', 'end']) {
      const fit = evaluateInsertion(shaft, bearing, { direction, offset, side })
      assert.equal(fit.ok, true)
      assert.deepEqual(fit.occupancy.shaft, [80, 100])
      assert.equal(fit.motion.rotation, 'continuous')
    }
  }
})

test('the opposed blind bores of an axle joiner retain their independent stops', () => {
  for (const socket of [blindA, blindB]) {
    const fit = evaluateInsertion(shaft, socket, { offset: -180, roll: 1.5 })
    assert.equal(fit.ok, true)
    assert.equal(fit.motion.rotation, 'locked')
    assert.equal(fit.placement.roll, Math.PI / 2)
    assert.equal(fit.motion.travel[1], 0)
    assert.equal(evaluateInsertion(shaft, socket, { offset: -179 }).reason, 'closed-end')
    assert.equal(evaluateInsertion(shaft, socket, { offset: -180, side: 'end' }).reason, 'closed-entry')
  }
})

test('a stepped shaft cannot pass a narrow section even when its final pose fits', () => {
  const stepped = { ...shaft, sections: [
    { shape: 'R', radius: 8, length: 2 },
    { shape: 'A', radius: 6, length: 30 },
  ] }
  assert.equal(evaluateInsertion(stepped, bearing, { offset: -5, side: 'end' }).reason, 'profile-interference')
  assert.equal(evaluateInsertion(stepped, bearing, { offset: -5, side: 'start' }).ok, true)
})

test('both standard pin types engage the bore and only the friction pin reports resistance', () => {
  for (const [part, friction] of [['3673', false], ['2780', true]]) {
    const fit = evaluateInsertion(technic[part][0], bearing, { offset: 0, side: 'end' })
    assert.equal(fit.ok, true)
    assert.equal(fit.motion.rotation, 'continuous')
    assert.equal(fit.motion.friction, friction)
    assert.deepEqual(fit.motion.travel, [0, 0])
  }
})

test('shaft occupancy blocks passage and a rejected connection leaves the graph intact', () => {
  const assembly = new Assembly(technic)
  for (const [part, design] of [['a', '3737'], ['b', '3700'], ['c', '3700']]) assembly.addPart(part, design)
  const axle = { part: 'a', port: 'shaft' }
  const first = { part: 'b', port: 'bore' }
  const second = { part: 'c', port: 'bore' }
  assert.equal(assembly.connect(axle, first, { offset: -80 }).ok, true)
  assert.equal(assembly.connect(axle, second, { offset: -50 }).reason, 'shaft-path-occupied')
  assert.equal(assembly.connections.length, 1)
  assert.equal(assembly.connect(axle, second, { offset: -50, side: 'end' }).ok, true)
})

test('the drivetrain uses separate shaft intervals, limits travel and transfers rotation', () => {
  const result = buildDrivetrain()
  assert.deepEqual(result.occupancy.slice(0, 3), [[80, 100], [50, 70], [100, 120]])
  assert.equal(result.bearingTravel[0], 0)
  assert.equal(result.bearingMotion, 'continuous')
  assert.equal(result.transmission.ratios.gear8, -1)
  assert.equal(result.transmission.ratios.driven, -1 / 3)
  assert.equal(result.transmission.ratios.bearing, undefined)
})

test('spur gears require matching pitch, parallel axes and overlapping tooth faces', () => {
  const a = gearAt('a', '10928', [0, 0, 0], [1, 0, 0])
  const b = gearAt('b', '3648', [0, 40, 0], [1, 0, 0])
  assert.deepEqual(evaluateSpurMesh(a, b), { ok: true, ratio: -1 / 3 })
  assert.deepEqual(evaluateSpurMesh(a, { ...b, axis: [-1, 0, 0] }), { ok: true, ratio: 1 / 3 })
  assert.equal(evaluateSpurMesh(a, { ...b, axis: [0, 0, 1] }).reason, 'non-parallel-axes')
  assert.equal(evaluateSpurMesh(a, { ...b, center: [10, 40, 0] }).reason, 'no-tooth-overlap')
  assert.equal(evaluateSpurMesh(a, { ...b, center: [0, 44, 0] }).reason, 'pitch-distance')
  assert.equal(evaluateSpurMesh(a, { ...b, teeth: 25 }).reason, 'tooth-pitch')
})

test('a real 41679 and 41680 hinge seats and snaps to catalog detents', () => {
  const pin = technic['41679'].find(port => port.id === 'hinge-pin')
  const ring = technic['41680'].find(port => port.id === 'hinge-ring')
  const fit = evaluateInsertion(pin, ring, { offset: 5, direction: -1, roll: 0.3 })
  assert.equal(fit.ok, true)
  assert.equal(fit.placement.roll, Math.PI / 12)
  assert.equal(fit.motion.rotation, 'detented')
  assert.deepEqual(fit.motion.travel, [0, 0])
  assert.deepEqual(fit.motion.detents, ring.detents)
  assert.equal(evaluateInsertion(pin, ring, { offset: 3 }).reason, 'hinge-seat')
  assert.equal(evaluateInsertion(pin, { ...ring, detents: [] }, { offset: 5 }).reason, 'missing-detents')
})

test('a contradictory gear loop is rejected in every order from every driver', () => {
  const gears = [
    gearAt('a', '10928', [0, 0, 0], [1, 0, 0]),
    gearAt('b', '10928', [0, 20, 0], [1, 0, 0]),
    gearAt('c', '10928', [0, 10, 10 * Math.sqrt(3)], [1, 0, 0]),
  ]
  for (const [a, b, c] of [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]]) {
    const input = [gears[a], gears[b], gears[c]]
    const assembly = new Assembly(technic)
    for (const { part } of input) assembly.addPart(part, '10928')
    for (const { part } of input) {
      const result = assembly.rotationFrom(part, input)
      assert.equal(result.reason, 'inconsistent-transmission')
      assert.equal(result.meshes.length, 3)
    }
  }
})

test('world validation rejects perpendicular and offset ports before connecting', () => {
  const assembly = new Assembly(technic)
  assembly.addPart('axle', '3705')
  assembly.addPart('gear', '3648')
  const a = { part: 'axle', port: 'shaft' }
  const b = { part: 'gear', port: 'bore' }
  const shaft = { start: [-30, 0, 0], axis: [1, 0, 0] }
  const socket = { start: [0, 0, 0], axis: [1, 0, 0] }
  for (const bad of [{ ...socket, axis: [0, 0, 1] }, { ...socket, start: [0, 2, 0] }]) {
    assert.equal(assembly.connect(a, b, { offset: -30 }, { world: { shaft, socket: bad } }).reason, 'non-coaxial-ports')
  }
  assert.equal(assembly.connect(a, b, { offset: -29 }, { world: { shaft, socket } }).reason, 'placement-pose-mismatch')
  assert.equal(assembly.rotationFrom('axle').ratios.gear, undefined)
  assert.equal(assembly.connect(a, b, { offset: -30 }, { world: { shaft, socket } }).ok, true)
  assert.equal(assembly.rotationFrom('axle').ratios.gear, 1)
})

test('axial travel uses gaps for fixed neighbors and intersects travel for co-moving sockets', () => {
  const assembly = new Assembly(technic)
  assembly.addPart('axle', '3737')
  const shaft = { part: 'axle', port: 'shaft' }
  for (const [part, offset, direction, side] of [
    ['bearing', -80, 1, 'start'], ['left', -52, 1, 'end'], ['right', 122, -1, 'end'],
  ]) {
    assembly.addPart(part, '3700')
    assert.equal(assembly.connect(shaft, { part, port: 'bore' }, { offset, direction, side }).ok, true)
  }
  const socket = { part: 'bearing', port: 'bore' }
  assert.deepEqual(assembly.axialTravel(shaft, socket), [-2, 8])
  assert.deepEqual(assembly.axialTravel(shaft, socket, { coMovingSockets: [
    { part: 'left', port: 'bore' },
  ] }), [-2, 69])
  assert.deepEqual(assembly.axialTravel(shaft, socket, { coMovingSockets: [
    { part: 'left', port: 'bore' }, { part: 'right', port: 'bore' },
  ] }), [-95, 69])
})

test('seated connections restore without requiring a second insertion path', () => {
  const assembly = new Assembly(technic)
  assembly.addPart('a', '3737')
  const shaft = { part: 'a', port: 'shaft' }
  for (const [part, offset, ok] of [['outer', -50, true], ['inner', -80, true], ['overlap', -81, false]]) {
    assembly.addPart(part, '3700')
    const fit = assembly.connect(shaft, { part, port: 'bore' }, { offset, side: 'end' }, { seated: true })
    assert.equal(fit.ok, ok)
    if (!ok) assert.equal(fit.reason, 'shaft-occupied')
  }
  assert.equal(assembly.connections.length, 2)
})
