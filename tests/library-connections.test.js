import assert from 'node:assert/strict'
import { test } from 'node:test'
import { registerHooks } from 'node:module'
import library from '../catalog/parts-library.json' with { type: 'json' }
import buggy from '../examples/dune-buggy.json' with { type: 'json' }

const three = new URL('../vendor/three/build/three.module.min.js', import.meta.url).href
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'three') return next(three, context)
  if (specifier.startsWith('three/addons/')) {
    return next(new URL(specifier.replace('three/addons/', '../vendor/three/examples/jsm/'), import.meta.url).href, context)
  }
  return next(specifier, context)
} })
const { createAssembly, connectAligned, rotationMotion, rotationPoses } = await import('../src/editor/model.js')
const { rotationalDrive } = await import('../src/mechanics/rotation.js')
const { nearbyConnections } = await import('../src/editor/snap.js')
const { portsFor } = await import('../src/mechanics/catalog.js')
const { evaluateInsertion, portLength } = await import('../src/mechanics/axial.js')
const { parts: availableParts } = await import('../src/editor/parts.js')

const part = (id, design) => ({ id, design, position: [0, 0, 0], rotation: [0, 0, 0, 1] })
const scene = { pixelDistance: () => 0 }
const beams = library.sections.find(section => section.id === 'technic').parts.filter(row => row[1] === 'beams')
const mates = ['2780', '3705', '3700', '30374', '43093', '75349', '6524', '6526']

function options(moving, fixed) {
  return nearbyConnections({ scene, moving, parts: [fixed], assembly: createAssembly([moving, fixed], []),
    depth: 0, roll: 0 })
}

function restore(snap, moving, fixed) {
  return createAssembly([{ ...moving, ...snap.pose }, fixed],
    [{ shaft: snap.shaft, socket: snap.socket, placement: snap.fit.placement }]).connections
}

test('each beam and frame has a compatible physical counterpart in both placement orders', () => {
  for (const [design, , name] of beams) {
    const beam = part('beam', design)
    const mate = mates.find(design => {
      const other = part('mate', design)
      return [[beam, other], [other, beam]].every(([moving, fixed]) =>
        options(moving, fixed).some(snap => snap.fit && restore(snap, moving, fixed).length === 1))
    })
    assert.ok(mate, `${name} (${design}) has no working counterpart`)
  }
})

test('the imported frames keep separate holes and allow round pin fits, including 64179', () => {
  const beam = part('frame', '64179')
  const pin = part('pin', '2780')
  const ports = portsFor(beam.design).filter(port => port.role === 'bearing')
  assert.equal(ports.length, 20)
  assert.equal(portsFor('64178').filter(port => port.role === 'bearing').length, 28)
  assert.deepEqual(new Set(ports.map(port => port.axis.join(','))), new Set(['1,0,0', '0,1,0', '0,0,1']))
  for (const port of ports) {
    assert.deepEqual(port.openings, ['start', 'end'])
    assert.equal(portLength(port), 20)
  }
  const fits = options(pin, beam).filter(candidate => candidate.fit)
  assert.equal(new Set(fits.map(snap => snap.socket.port)).size, ports.length)
  assert.ok(fits.every(snap => snap.fit.motion.rotation === 'continuous'))
  const seated = fits[0]
  const placed = { ...pin, ...seated.pose }
  assert.equal(connectAligned(createAssembly([beam, placed], []), [placed], [beam]).length, 1)
})

test('an angular keyed joiner stops a pin and accepts the axle only through its open end', () => {
  const port = portsFor('32013').find(port => port.role === 'blind-key')
  const pin = portsFor('2780').find(port => port.role === 'friction-pin')
  const axle = portsFor('3705')[0]
  assert.deepEqual(port.openings, ['start'])
  assert.ok(port.reference)
  assert.equal(evaluateInsertion(pin, port, { offset: -60 }).reason, 'incompatible-family')
  assert.equal(evaluateInsertion(axle, port, { side: 'end', offset: 20 }).reason, 'closed-entry')
  const snap = options(part('axle', '3705'), part('socket', '32013'))
    .find(candidate => candidate.fit && candidate.socket.port === port.id)
  assert.ok(snap)
  assert.equal(snap.fit.motion.rotation, 'locked')
})

test('the thin 4586 beam has round seats at its two ends without fabricated slots', () => {
  const ports = portsFor('4586')
  assert.deepEqual(ports.map(port => port.start), [[0, -5, -80], [0, -5, 80]])
  assert.deepEqual(ports.map(portLength), [10, 10])
})

test('a rim accepts only its documented tyre and retains that seating when reopened', () => {
  const rim = part('rim', '44772')
  const tyre = part('tyre', '23798')
  const unrelated = part('tyre', '41897')
  const seat = design => portsFor(design).find(port => port.role.endsWith('-seat'))
  const wrongSize = evaluateInsertion(seat(rim.design), seat(unrelated.design), { offset: 13 })
  assert.equal(wrongSize.reason, 'incompatible-family')
  for (const [moving, fixed] of [[rim, tyre], [tyre, rim]]) {
    const candidate = options(moving, fixed).find(snap => snap.fit)
    assert.ok(candidate, `moving ${moving.design}`)
    assert.equal(candidate.fit.placement.offset, 13)
    assert.equal(candidate.fit.placement.keyStep, null)
    const [link] = restore(candidate, moving, fixed)
    assert.ok(link)
    assert.equal(link.fit.motion.rotation, 'locked')
  }
})

test('towballs snap at the center and stay connected when the joint changes angle', async () => {
  const { Quaternion, Vector3 } = await import('three')
  const { worldPort } = await import('../src/editor/placement.js')
  const ball = part('ball', '2736')
  const socket = part('socket', '2739a')
  const snap = options(ball, socket).find(item => item.fit?.motion.rotation === 'ball')
  assert.ok(snap)
  const placed = { ...ball, ...snap.pose }
  const end = portsFor(ball.design).find(port => port.id === snap.shaft.port)
  const center = worldPort(placed, end).start
  const q = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 4)
  placed.rotation = q.toArray()
  placed.position = center.clone().sub(new Vector3().fromArray(end.start).applyQuaternion(q)).toArray()
  assert.equal(createAssembly([placed, socket], [{ shaft: snap.shaft, socket: snap.socket,
    placement: snap.fit.placement }]).connections.length, 1)
  placed.position[0] += .1
  assert.equal(createAssembly([placed, socket], [{ shaft: snap.shaft, socket: snap.socket,
    placement: snap.fit.placement }]).connections.length, 0)
})

test('the universal joint has two independent centered pivots and keeps legacy endpoint IDs', () => {
  const cross = part('cross', '62519')
  const yoke = part('yoke', '62520')
  const candidates = options(yoke, cross).filter(item => item.fit?.placement.anchor === 'pivot')
  assert.equal(new Set(candidates.map(snap => snap.shaft.port)).size, 2)
  assert.ok(candidates.every(snap => restore(snap, yoke, cross).length === 1))
  const old = portsFor(yoke.design).find(port => port.id === 'shadow-556faf92f9c6')
  assert.ok(old?.legacy)
  assert.equal(options(part('axle', '3705'), yoke).some(snap => snap.socket?.port === old.id), false)
})

test('NXT and Powered Up use their separate keyed plug groups', () => {
  const cable = part('cable', '11145')
  const receiver = part('nxt', '53787')
  const plugs = options(cable, receiver).filter(item => item.fit?.placement.anchor === 'keyed')
  assert.equal(new Set(plugs.map(snap => snap.shaft.port)).size, 2)
  assert.ok(plugs.every(snap => restore(snap, cable, receiver).length === 1))
  assert.equal(options(part('wrong', '23816a'), receiver).some(snap => snap.fit?.placement.anchor === 'keyed'), false)
})

test('the non-bulged pneumatic tube seats both ends on real nipples', () => {
  const tube = part('tube', '103671-f1')
  const valve = part('valve', '4694c01-f1')
  const seats = new Set(portsFor(tube.design).filter(port => port.role === 'tube-end').map(port => port.id))
  const fits = options(tube, valve).filter(snap => seats.has(snap.socket?.port))
  assert.equal(seats.size, 2)
  assert.deepEqual(new Set(fits.map(snap => snap.socket.port)), seats)
  assert.ok(fits.every(snap => snap.fit.placement.offset === 0 && restore(snap, tube, valve).length === 1))
  assert.equal(options(tube, part('bar', '30374')).some(snap => snap.fit), false)
})

test('EV3 bottom lid and battery are exclusive alternatives at the same mounting slot', () => {
  const lid = part('lid', '99143')
  const battery = part('battery', '95656')
  const brick = part('brick', '99141c01')
  const lidSnap = options(lid, brick).find(snap => snap.fit?.placement.anchor === 'keyed')
  const batterySnap = options(battery, brick).find(snap => snap.fit?.placement.anchor === 'keyed')
  assert.ok(lidSnap && batterySnap)
  const assembly = createAssembly([brick, { ...lid, ...lidSnap.pose }, battery], [
    { shaft: lidSnap.shaft, socket: lidSnap.socket, placement: lidSnap.fit.placement },
  ])
  assert.equal(assembly.connections.length, 1)
  assert.equal(assembly.previewInsertion(batterySnap.shaft, batterySnap.socket, batterySnap.fit.placement).reason, 'socket-occupied')
})

test('the old small wheel rim uses the axis of the real assembled tyre', () => {
  const rim = part('rim', '30027a')
  const tyre = part('tyre', '30028b')
  const candidate = options(tyre, rim).find(snap => snap.fit?.motion.rotation === 'locked')
  assert.ok(candidate)
  assert.equal(restore(candidate, tyre, rim).length, 1)
})

test('two narrow Technic chain links meet at the full-width pivot', () => {
  const first = part('one', '3711')
  const second = part('two', '14696')
  const fit = options(first, second).find(snap => snap.fit?.placement.anchor === 'pivot')
  assert.ok(fit)
  assert.equal(restore(fit, first, second).length, 1)
})

test('driving rings engage the matching generation of clutch gear at the measured depth', () => {
  const ring = part('ring', '6539')
  const gear = part('gear', '6542a')
  const otherGeneration = part('gear', '2471')
  const candidate = options(ring, gear).find(snap => snap.fit?.motion.rotation === 'locked')
  assert.ok(candidate)
  assert.equal(candidate.fit.placement.direction, -1)
  assert.equal(candidate.fit.placement.offset, 5)
  assert.equal(restore(candidate, ring, gear).length, 1)
  assert.equal(options(ring, otherGeneration).some(snap => snap.fit?.motion.rotation === 'locked'), false)
})

test('8845 Dune Buggy keeps all its parts, stored connections and four mounted tyres', () => {
  assert.equal(buggy.parts.length, 178)
  assert.equal(buggy.parts.filter(part => part.design === '8845-spring').length, 2)
  assert.ok(buggy.parts.every(part => availableParts[part.design]))
  const { connections } = createAssembly(buggy.parts, buggy.connections, buggy.gears)
  assert.equal(connections.length, buggy.connections.length)
  assert.equal(connections.length, 255)
  const designs = new Map(buggy.parts.map(part => [part.id, part.design]))
  const tyres = buggy.parts.filter(part => part.design === '3634')
  assert.equal(tyres.length, 4)
  for (const tyre of tyres) {
    const mates = connections.filter(link => link.socket.part === tyre.id)
    assert.equal(mates.length, 1)
    assert.equal(designs.get(mates[0].shaft.part), '3482')
  }
})

test('existing stud fits tolerate LDraw rounding at the seat without allowing additional insertion', () => {
  const stud = portsFor('3702').find(port => port.role === 'stud')
  const socket = portsFor('3070b').find(port => port.role === 'anti-stud')
  const measured = evaluateInsertion(stud, socket, { offset: .008 }, { seated: true })
  assert.ok(measured.ok)
  assert.equal(measured.placement.offset, 0)
  assert.equal(evaluateInsertion(stud, socket, { offset: .008 }).reason, 'stud-seat')
  assert.equal(evaluateInsertion(stud, socket, { offset: .011 }, { seated: true }).reason, 'stud-seat')
})

test('8845 rotates each wheel with its tyre and axle while leaving the chassis still', () => {
  const assembly = createAssembly(buggy.parts, buggy.connections)
  for (const [rim, tyre, axle] of [[171, 172, 48], [173, 174, 5], [175, 176, 6], [177, 178, 49]]) {
    for (const driver of [rim, tyre, axle]) {
      const motion = rotationMotion(`8845-${driver}`, buggy.parts, assembly)
      assert.ok(motion.ok)
      const poses = rotationPoses(buggy.parts, motion, Math.PI / 2)
      for (const member of [rim, tyre, axle]) {
        const pose = poses.find(entry => entry.id === `8845-${member}`)
        assert.ok(pose)
        assert.notDeepEqual(pose.rotation, buggy.parts[member - 1].rotation)
      }
      assert.equal(poses.some(pose => pose.id === '8845-1'), false)
      const moved = new Map(poses.map(pose => [pose.id, pose]))
      const preview = buggy.parts.map(pose => moved.get(pose.id) ?? pose)
      assert.equal(createAssembly(preview, buggy.connections).connections.length, buggy.connections.length)
    }
  }
})

test('8845 drives both 16-tooth gears in opposite directions from either axle', () => {
  const assembly = createAssembly(buggy.parts, buggy.connections)
  for (const driver of ['8845-73', '8845-93']) {
    const motion = rotationMotion(driver, buggy.parts, assembly)
    assert.ok(motion.ok)
    const first = motion.spins.get('8845-76')
    const second = motion.spins.get('8845-94')
    const signedProjection = first.axis.reduce((sum, component, i) => sum + component * second.axis[i], 0)
    assert.ok(Math.abs(first.ratio + second.ratio * signedProjection) < 1e-8)
    assert.equal(motion.spins.size, 6)
    assert.equal(motion.meshes.length, 1)
  }
  const pulley = rotationMotion('8845-101', buggy.parts, assembly)
  assert.ok(pulley.ok)
  assert.ok(pulley.spins.has('8845-96'))
})

test('rigid offsets orbit together and a second noncoaxial support prevents spin', () => {
  const axis = { start: [0, 0, 0], axis: [0, 0, 1] }
  const joint = (a, b, motion, line = axis) => ({ a, b, motion, shaftLine: line, socketLine: line })
  const parts = [
    part('rotor', 'test'),
    { ...part('arm', 'test'), position: [8, 0, 0] },
    part('support', 'test'),
  ]
  const ids = parts.map(entry => entry.id)
  const joints = [joint('rotor', 'arm', 'fixed'), joint('rotor', 'support', 'continuous')]
  const drive = rotationalDrive('arm', ids, joints, [])
  assert.ok(drive.ok)
  const [rotor, arm] = rotationPoses(parts, drive, Math.PI / 2)
  assert.equal(rotor.id, 'rotor')
  assert.equal(arm.id, 'arm')
  arm.position.forEach((value, i) => assert.ok(Math.abs(value - [0, 8, 0][i]) < 1e-8))
  joints.push(joint('arm', 'support', 'continuous', { start: [8, 0, 0], axis: [0, 0, 1] }))
  assert.equal(rotationalDrive('arm', ids, joints, []).reason, 'multiple-joint-axes')
})

test('the editor drive propagates mixed gear ratios and rejects a contradictory loop', () => {
  const axis = [0, 0, 1]
  const gear = (part, center, teeth) => ({ part, center, axis, teeth, radius: teeth * 1.25, width: 8 })
  const driver = { start: [0, 0, 0], axis }
  const pair = [gear('input', driver.start, 8), gear('output', [30, 0, 0], 16)]
  const drive = rotationalDrive('input', ['input', 'output'], [], pair, driver)
  assert.equal(drive.spins.get('output').ratio, -.5)

  const loop = [gear('input', driver.start, 8), gear('output', [20, 0, 0], 8),
    gear('third', [10, 10 * Math.sqrt(3), 0], 8)]
  const blocked = rotationalDrive('input', ['input', 'output', 'third'], [], loop, driver)
  assert.equal(blocked.reason, 'inconsistent-transmission')
})
