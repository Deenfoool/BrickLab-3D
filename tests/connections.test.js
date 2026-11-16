import assert from 'node:assert/strict'
import { test } from 'node:test'
import { registerHooks } from 'node:module'

const three = new URL('../vendor/three/build/three.module.min.js', import.meta.url).href
registerHooks({ resolve(specifier, context, next) {
  return next(specifier === 'three' ? three : specifier, context)
} })
const { Vector3, Ray } = await import('three')
const { Assembly } = await import('../src/mechanics/assembly.js')
const { connectionMode } = await import('../src/mechanics/axial.js')
const { gearAt, technic } = await import('../src/mechanics/catalog.js')
const { evaluateSpurMesh } = await import('../src/mechanics/gears.js')
const { connectAligned, createAssembly, gearPoses } = await import('../src/editor/model.js')
const { nearbyConnections } = await import('../src/editor/snap.js')

const part = (id, design, position = [0, 0, 0]) => ({ id, design, position, rotation: [0, 0, 0, 1] })
const end = (part, port) => ({ part, port })
const scene = { pixelDistance: () => 0 }

test('every compatible catalog port pair can snap in both assembly orders and reload', () => {
  const ports = Object.entries(technic).flatMap(([design, ports]) => ports.map(port => ({ design, port })))
  const covered = new Set()
  for (const { design: m, port: male } of ports) for (const { design: f, port: female } of ports) {
    if (!connectionMode(male, female)) continue
    const shaft = end('shaft', male.id)
    const socket = end('socket', female.id)
    const label = `${m}:${male.id} → ${f}:${female.id}`
    const parts = [part('shaft', m), part('socket', f)]
    for (const [moving, fixed] of [parts, [...parts].reverse()]) {
      const options = nearbyConnections({ scene, assembly: createAssembly(parts, []),
        parts: [fixed], moving, depth: 0, roll: 0 })
      const match = options.find(option => option.fit && option.shaft.part === shaft.part &&
        option.socket.part === socket.part && option.shaft.port === shaft.port && option.socket.port === socket.port)
      assert.ok(match, `${label}, moving ${moving.design}`)
      const restored = createAssembly([{ ...moving, ...match.pose }, fixed], [{ shaft, socket, placement: match.fit.placement }])
      assert.equal(restored.connections.length, 1, label)
    }
    covered.add(`${m}:${male.id}`)
    covered.add(`${f}:${female.id}`)
  }
  for (const { design, port } of ports) {
    if (port.role !== 'gear') assert.ok(covered.has(`${design}:${port.id}`), `Unreachable port ${design}:${port.id}`)
  }
})

test('stacking two 3700 bricks records both studs without moving either brick', () => {
  const fixed = part('bottom', '3700')
  const moving = part('top', '3700', [0, -24, 0])
  const assembly = createAssembly([fixed, moving], [])
  const links = connectAligned(assembly, [moving], [fixed])
  assert.deepEqual(links.map(link => [link.shaft.port, link.socket.port]),
    [['stud-left', 'anti-stud-left'], ['stud-right', 'anti-stud-right']])
  assert.equal(createAssembly([fixed, moving], links).connections.length, 2)
  assert.deepEqual(connectAligned(assembly, [moving], [fixed]), [])
  assert.equal(assembly.connections[0].fit.motion.rotation, 'fixed')
})

test('the hollow core of a Technic pin accepts rods from opposite ends until they overlap', () => {
  const barPair = new Assembly(technic)
  for (const id of ['left', 'right', 'overlap']) barPair.addPart(id, '30374')
  barPair.addPart('pin', '2780')
  const core = end('pin', 'core')
  assert.equal(barPair.connect(end('left', 'shaft'), core, { offset: -65, side: 'start' }).ok, true)
  assert.equal(barPair.connect(end('right', 'shaft'), core, { offset: 25, side: 'end' }).ok, true)
  assert.equal(barPair.connect(end('overlap', 'shaft'), core, { offset: 12, side: 'end' }).reason, 'socket-occupied')
  assert.equal(barPair.connections.length, 2)
  assert.equal(barPair.axialTravel(end('left', 'shaft'), core)[1], 10)
  assert.equal(barPair.axialTravel(end('right', 'shaft'), core)[0], -10)
})

test('gear snap moves to the pitch circle and gives a 3:1 transmission', () => {
  const fixed = part('small', '10928')
  const moving = part('large', '3648', [38, 0, 0])
  const assembly = createAssembly([fixed, moving], [])
  const cursorRay = new Ray(new Vector3(38, 0, 100), new Vector3(0, 0, -1))
  const options = nearbyConnections({ scene, assembly, parts: [fixed], moving, ray: cursorRay, depth: 0, roll: 0 })
  const snap = options.find(option => option.mesh)
  assert.ok(snap)
  assert.deepEqual(snap.pose.position, [40, 0, 0])
  const gears = gearPoses([fixed, { ...moving, ...snap.pose }])
  assert.equal(assembly.rotationFrom('small', gears).ratios.large, -1 / 3)
  const offset = gearAt('large', '3648', [38, 0, 0], [0, 0, 1])
  assert.equal(evaluateSpurMesh(gears[0], offset).ok, false)
})

test('a bore can snap in the middle of a long axle without pulling it toward an end', () => {
  const shaft = part('axle', '3737')
  const moving = part('bush', '3713')
  const cursorRay = new Ray(new Vector3(27, 0, 100), new Vector3(0, 0, -1))
  const scoringScene = { pixelDistance: point => Math.abs(point.x - 27) }
  const [snap] = nearbyConnections({ scene: scoringScene, assembly: createAssembly([shaft, moving], []),
    parts: [shaft], moving, ray: cursorRay, depth: 0, roll: 0 })
  assert.ok(snap?.fit)
  assert.ok(Math.abs(snap.pose.position[0] - 27) < 1e-6)
  assert.deepEqual(snap.fit.occupancy.shaft, [117, 137])
})

test('a long pin keeps three independent beam positions', () => {
  const shaft = part('pin', '6558')
  const fixed = [part('short', '32316', [-20, 0, 0]),
    part('middle', '32316', [0, 0, 0]), part('long', '32316', [20, 0, 0])]
  for (const beam of fixed) beam.rotation = [0, 0, Math.SQRT1_2, Math.SQRT1_2]
  for (const [index, moving] of fixed.entries()) {
    const prior = fixed.slice(0, index)
    const installed = createAssembly([shaft, ...prior], [])
    const priorLinks = connectAligned(installed, [shaft], prior)
    assert.equal(priorLinks.length, prior.length)
    const assembly = createAssembly([shaft, ...prior, moving], priorLinks)
    const links = connectAligned(assembly, [moving], [shaft])
    assert.equal(links.length, 1)
    assert.equal(links[0].socket.port, 'bore-3')
    assert.equal(assembly.connections.length, index + 1)
  }
})

test('a hybrid pin transmits rotation at the cross axle end and turns freely in a beam', () => {
  const assembly = new Assembly(technic)
  assembly.addPart('hybrid', '43093')
  assembly.addPart('beam', '32316')
  assembly.addPart('gear', '10928')
  const shaft = end('hybrid', 'shaft')
  const beam = assembly.connect(shaft, end('beam', 'bore-3'), { offset: 0, side: 'end' })
  const gear = assembly.connect(shaft, end('gear', 'bore'), { offset: -20, side: 'start' })
  assert.equal(beam.motion.rotation, 'continuous')
  assert.equal(beam.motion.friction, true)
  assert.equal(gear.motion.rotation, 'locked')
  assert.deepEqual(assembly.connections.map(link => link.fit.occupancy.shaft), [[0, 20], [20, 40]])
})
