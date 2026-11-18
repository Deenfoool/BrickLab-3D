import assert from 'node:assert/strict'
import { test } from 'node:test'
import { registerHooks } from 'node:module'
import library from '../catalog/parts-library.json' with { type: 'json' }
import buggy from '../examples/dune-buggy.json' with { type: 'json' }
import engine from '../examples/inline-engine.json' with { type: 'json' }

const three = new URL('../vendor/three/build/three.module.min.js', import.meta.url).href
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'three') return next(three, context)
  if (specifier.startsWith('three/addons/')) {
    return next(new URL(specifier.replace('three/addons/', '../vendor/three/examples/jsm/'), import.meta.url).href, context)
  }
  return next(specifier, context)
} })
const { createAssembly, connectAligned, connectPlaced, rotationMotion, rotationPoses } = await import('../src/editor/model.js')
const { assembleBelts, beltLayout, beltPath, beltTravel, grooveOf, promoteLegacyBelts } = await import('../src/mechanics/belts.js')
const { rotationalDrive } = await import('../src/mechanics/rotation.js')
const { upgradeInlineEngineFan } = await import('../src/editor/inline-engine.js')
const { componentBundle, expandComponents } = await import('../src/editor/components.js')
const { jointBodies, linkageDrive } = await import('../src/mechanics/linkage.js')
const { Quaternion, Ray, Vector3 } = await import('three')
const { worldPort } = await import('../src/editor/placement.js')
const { nearbyConnections } = await import('../src/editor/snap.js')
const { portsFor } = await import('../src/mechanics/catalog.js')
const { connectionMode, evaluateInsertion, portLength } = await import('../src/mechanics/axial.js')
const { parts: availableParts } = await import('../src/editor/parts.js')

const part = (id, design) => ({ id, design, position: [0, 0, 0], rotation: [0, 0, 0, 1] })
const scene = { pixelDistance: () => 0 }
const technicParts = library.sections.find(section => section.id === 'technic').parts
const structuralParts = technicParts.filter(([, group, name]) => ['pins', 'beams'].includes(group) ||
  /^(?:Beam |Cross Block |Connector |Brick |Steering Portal Axle Frame)/.test(name))
const activePorts = design => portsFor(design).filter(port => !port.legacy && port.role !== 'gear')

function options(moving, fixed) {
  return nearbyConnections({ scene, moving, parts: [fixed], assembly: createAssembly([moving, fixed], []),
    depth: 0, roll: 0 })
}

function restore(snap, moving, fixed) {
  return createAssembly([{ ...moving, ...snap.pose }, fixed],
    [{ shaft: snap.shaft, socket: snap.socket, placement: snap.fit.placement }]).connections
}

test('each structural connector mates through its accessible ends and survives reopening', () => {
  const profiles = new Map()
  for (const [design] of technicParts) {
    for (const port of activePorts(design)) {
      const { id, start, axis, reference, ...profile } = port
      const key = JSON.stringify(profile)
      if (!profiles.has(key)) profiles.set(key, [])
      const representatives = profiles.get(key)
      if (representatives.length < 2 && !representatives.some(mate => mate.design === design)) {
        representatives.push({ design, port })
      }
    }
  }
  const mates = [...profiles.values()].flat()
  const results = new Map()
  function usableSnaps(moving, fixed) {
    const key = JSON.stringify([moving.id, moving.design, fixed.design])
    if (!results.has(key)) {
      const snaps = options(moving, fixed).filter(snap => snap.fit)
      for (const snap of snaps) {
        assert.equal(restore(snap, moving, fixed).length, 1, `Preview cannot reopen: ${moving.design} + ${fixed.design}`)
      }
      results.set(key, snaps)
    }
    return results.get(key)
  }

  for (const [design, , name] of structuralParts) {
    const ports = activePorts(design)
    assert.ok(ports.length, `${name} (${design}) has no connectors`)
    for (const port of ports) {
      const usable = mates.some(mate => {
        const [male, female] = port.gender === 'M' ? [port, mate.port] : [mate.port, port]
        const mode = connectionMode(male, female)
        if (!mode) return false
        const [shaftDesign, socketDesign] = port.gender === 'M' ? [design, mate.design] : [mate.design, design]
        const shaft = part('shaft', shaftDesign)
        const socket = part('socket', socketDesign)
        const match = snap => snap.shaft.port === male.id && snap.socket.port === female.id
        const shaftMoves = usableSnaps(shaft, socket).filter(match)
        const socketMoves = usableSnaps(socket, shaft).filter(match)
        if (!shaftMoves.length || !socketMoves.length) return false
        if (mode.anchor || mode.clutch || mode.rimSeat || mode.tube || mode.seat) return true
        const shaftEntries = socketMoves.map(({ fit: { placement } }) =>
          (placement.side === 'start') === (placement.direction > 0) ? 'end' : 'start')
        return male.openings.every(side => shaftEntries.includes(side)) &&
          female.openings.every(side => shaftMoves.some(snap => snap.fit.placement.side === side))
      })
      assert.ok(usable, `${name} (${design}) has an unavailable ${port.role} at ${port.start} (${port.id})`)
    }
  }
})

test('round bores omitted by the shadow profiles remain distinct from the other connectors', () => {
  for (const [design, positions] of [
    ['6614', [[-20, 0, -10], [20, 0, -10]]],
    ['44137', [[-10, 0, 20]]],
    ['2607b', [[0, 10, -10]]],
    ['2607bc01', [[0, 10, -10]]],
  ]) {
    const fixed = part('block', design)
    for (const start of positions) {
      const port = portsFor(design).find(port => port.role === 'bearing' &&
        port.start.every((value, index) => value === start[index]))
      assert.ok(port, `Missing bore in ${design} at ${start}`)
      for (const design of ['3705', '2780']) {
        const moving = part('shaft', design)
        const fits = options(moving, fixed).filter(snap => snap.fit && snap.socket.port === port.id)
        assert.deepEqual([...new Set(fits.map(snap => snap.fit.placement.side))].sort(), ['end', 'start'])
        assert.ok(fits.every(snap => snap.fit.motion.rotation === 'continuous' && restore(snap, moving, fixed).length === 1))
      }
    }
  }

  const block = part('block', '44137')
  const split = portsFor(block.design).find(port => port.id === 'shadow-f39c3b5f2da9')
  assert.deepEqual(split.openings, ['start', 'end'])
  const axle = part('shaft', '3705')
  const fits = options(axle, block).filter(snap => snap.fit && snap.socket.port === split.id)
  assert.deepEqual([...new Set(fits.map(snap => snap.fit.placement.side))].sort(), ['end', 'start'])
  assert.ok(fits.every(snap => restore(snap, axle, block).length === 1))
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

test('thin Technic liftarms snap to an axle next to either end and keep the keyed fit on reload', () => {
  const axle = part('axle', '44294')
  for (const beamDesign of ['41677', '6632']) {
    const beam = part('beam', beamDesign)
    const keyPorts = portsFor(beamDesign).filter(port => port.role === 'key')
    const axleFirst = options(axle, beam).filter(option => option.fit?.motion.rotation === 'locked' && restore(option, axle, beam).length === 1)
    assert.deepEqual(new Set(axleFirst.map(fit => fit.socket.port)), new Set(keyPorts.map(port => port.id)))
    for (const x of [-67, 67]) {
      const ray = new Ray(new Vector3(x, 0, 100), new Vector3(0, 0, -1))
      const fits = nearbyConnections({ moving: beam, parts: [axle], ray, depth: 0, roll: 0,
        assembly: createAssembly([axle, beam], []), scene: { pixelDistance: point => Math.abs(point.x - x) * 12 },
      }).filter(snap => snap.fit?.motion.rotation === 'locked')
      assert.deepEqual(new Set(fits.map(fit => fit.socket.port)), new Set(keyPorts.map(port => port.id)))
      for (const snap of fits) {
        assert.deepEqual(snap.fit.occupancy.shaft.map(value => value || 0), x < 0 ? [0, 10] : [130, 140])
        assert.equal(restore(snap, beam, axle).length, 1)
      }
    }
  }
})

test('thin liftarms slide onto a shared axle through its open end', () => {
  const axle = part('axle', '44294')
  const rotation = [0, 0, -Math.SQRT1_2, Math.SQRT1_2]
  const left = { ...part('left', '41677'), position: [-65, 0, 0], rotation }
  const right = { ...part('right', '41677'), position: [65, 0, 0], rotation }
  const moving = part('center', '6632')
  const seated = createAssembly([axle, left, right], [])
  const links = connectAligned(seated, [left, right], [axle])
  assert.equal(links.length, 2)
  const x = -55
  const ray = new Ray(new Vector3(x, 0, 100), new Vector3(0, 0, -1))
  const find = (fixed, links) => nearbyConnections({ moving, parts: [axle], ray, depth: 0, roll: 0,
    assembly: createAssembly([...fixed, moving], links), scene: { pixelDistance: point => Math.abs(point.x - x) * 12 },
  })
  const fits = find([axle, left], links.filter(link => link.socket.part === left.id))
  const [round] = fits.filter(option => option.fit?.motion.rotation === 'continuous')
  assert.ok(round)
  assert.equal(portsFor(moving.design).find(port => port.id === round.socket.port).role, 'bearing')
  assert.ok(fits.some(option => option.fit?.motion.rotation === 'locked'))
  const blocked = find([axle, left, right], links)
  assert.ok(blocked.length)
  assert.ok(blocked.every(option => option.failure === 'shaft-path-occupied'))
})

test('the 41677 shifter beam snaps flush to its neighbor on an occupied 7L axle', () => {
  const axle = part('axle', '44294')
  const bracket = { ...part('bracket', '92907'), position: [-30, -20, 0] }
  const neighbor = { ...part('upright', '6632'), position: [-5, 0, 0], rotation: [0, 0, -Math.SQRT1_2, Math.SQRT1_2] }
  const moving = part('beam', '41677')
  const installed = [axle, bracket, neighbor]
  const existing = connectAligned(createAssembly(installed, []), [bracket, neighbor], [axle])
  assert.equal(existing.length, 3)
  const assembly = createAssembly([...installed, moving], existing)
  // At close range, a small aim error overlaps the upright without a flush snap.
  const x = 4.4
  const ray = new Ray(new Vector3(x, 0, 100), new Vector3(0, 0, -1))
  const candidates = nearbyConnections({ moving, parts: installed, assembly, ray, depth: 0, roll: 0,
    scene: { pixelDistance: point => Math.hypot(point.x - x, point.y) * 12 } })
  const snap = candidates.find(option => option.fit?.motion.rotation === 'locked' && option.shaft.part === axle.id)
  assert.ok(snap)
  assert.deepEqual(snap.fit.occupancy.shaft, [70, 80])
  const saved = [...existing, { shaft: snap.shaft, socket: snap.socket, placement: snap.fit.placement }]
  assert.equal(createAssembly([...installed, { ...moving, ...snap.pose }], saved).connections.length, 4)

  const inBracket = -35
  const throughBracket = nearbyConnections({ moving, parts: installed, assembly,
    ray: new Ray(new Vector3(inBracket, 0, 100), new Vector3(0, 0, -1)), depth: 0, roll: 0,
    scene: { pixelDistance: point => Math.hypot(point.x - inBracket, point.y) * 12 } })
  assert.ok(throughBracket.some(option => option.failure === 'shaft-path-occupied'))
  assert.ok(throughBracket.every(option => !option.fit))
})

test('a correctly oriented thin liftarm can snap with the move gizmo at the middle of an axle', () => {
  const axle = part('axle', '44294')
  const beam = { ...part('beam', '6632'), position: [5, 2, 0], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] }
  const acceptPose = pose => Math.abs(pose.position[0] - 5) < .001 && Math.abs(pose.position[2]) < .001 &&
    Math.abs(new Quaternion().fromArray(pose.rotation).dot(new Quaternion().fromArray(beam.rotation))) > .999999
  const snap = nearbyConnections({ moving: beam, parts: [axle], acceptPose, depth: 0, roll: 0,
    assembly: createAssembly([axle, beam], []), scene: { pixelDistance: point => Math.abs(point.x - 5) * 12 },
  }).find(option => option.fit?.motion.rotation === 'locked')
  assert.ok(snap)
  assert.ok(new Vector3(...snap.pose.position).distanceTo(new Vector3(5, 0, 0)) < .001)
  assert.equal(restore(snap, beam, axle).length, 1)
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

test('towballs snap at the center and stay connected when the joint changes angle', () => {
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
  assert.equal(connections.length, 267)
  const designs = new Map(buggy.parts.map(part => [part.id, part.design]))
  const tyres = buggy.parts.filter(part => part.design === '3634')
  assert.equal(tyres.length, 4)
  for (const tyre of tyres) {
    const mates = connections.filter(link => link.socket.part === tyre.id)
    assert.equal(mates.length, 1)
    assert.equal(designs.get(mates[0].shaft.part), '3482')
  }
})

test('858 retains two belts, the seated fan and all three pistons on reload', () => {
  assert.equal(engine.parts.length, 185)
  assert.equal(engine.parts.filter(part => part.design === '3652').length, 3)
  assert.ok(engine.parts.every(part => availableParts[part.design]))
  const project = JSON.parse(JSON.stringify(engine))
  const assembly = createAssembly(project.parts, project.connections, { belts: project.belts })
  assert.equal(assembly.connections.length, 383)
  assert.equal(assembly.connections.length, engine.connections.length)
  assert.deepEqual(assembly.belts.map(belt => [belt.a, belt.b]),
    [['858-61', '858-112'], ['858-62', '858-54']])
  const motion = rotationMotion('858-44', project.parts, assembly)
  assert.equal(motion.kind, 'engine')
  const poses = new Map(rotationPoses(project.parts, motion, .5).map(part => [part.id, part]))
  // Both the fan blades and the other belt's horizontal axle must turn.
  for (const id of ['858-114', '858-116', '858-53']) {
    const initial = project.parts.find(part => part.id === id)
    assert.notDeepEqual(poses.get(id).rotation, initial.rotation)
  }
  const disconnected = createAssembly(project.parts, project.connections, { belts: project.belts.slice(1) })
  const withoutFan = rotationMotion('858-44', project.parts, disconnected)
  assert.equal(withoutFan.spins.has('858-114'), false)
  assert.ok(withoutFan.spins.has('858-53'))
  assert.equal(withoutFan.meshes.length, 4)
})

test('opening a saved 858 with the short fan axle restores all blade connections', () => {
  const fixturePin = engine.parts.find(part => part.id === '858-111')
  const oldPin = { ...fixturePin, design: '3749', color: '#4B8E60', position: [-120, 126, -20] }
  const parts = engine.parts.map(part => part === fixturePin ? oldPin : part)
  const retained = engine.connections.filter(link => link.shaft.part !== oldPin.id)
  const mount = parts.filter(part => ['858-100', '858-112'].includes(part.id))
  const oldLinks = connectAligned(createAssembly(parts, retained), [oldPin], mount)
  assert.equal(oldLinks.length, 2)
  const old = { ...engine, name: 'My saved engine', parts, connections: [...retained, ...oldLinks] }
  const before = createAssembly(parts, old.connections, { belts: old.belts })
  assert.ok(rotationMotion('858-44', parts, before).spins.has(oldPin.id))
  assert.equal(rotationMotion('858-44', parts, before).spins.has('858-114'), false)

  const restored = upgradeInlineEngineFan(old)
  const pin = restored.parts.find(part => part.id === oldPin.id)
  assert.equal(pin.design, '65249')
  assert.equal(pin.color, oldPin.color)
  assert.equal(oldPin.design, '3749')
  assert.equal(restored.name, old.name)
  assert.equal(restored.belts, old.belts)
  assert.equal(upgradeInlineEngineFan(restored), restored)

  const assembly = createAssembly(restored.parts, restored.connections, { belts: restored.belts })
  assert.equal(assembly.connections.length, restored.connections.length)
  assert.equal(assembly.connections.length, old.connections.length + 2)
  for (const driver of ['858-44', '858-114']) {
    const motion = rotationMotion(driver, restored.parts, assembly)
    assert.equal(motion.kind, 'engine')
    for (const id of ['858-114', '858-115', '858-116', '858-117']) {
      const original = parts.find(part => part.id === id)
      const blade = rotationPoses(restored.parts, motion, .37).find(part => part.id === id)
      assert.ok(new Quaternion().fromArray(blade.rotation).angleTo(new Quaternion().fromArray(original.rotation)) > 1)
    }
  }

  const modified = { ...old, parts: old.parts.map(part =>
    part.id === '858-118' ? { ...part, position: [-143, 126, -20] } : part) }
  assert.equal(upgradeInlineEngineFan(modified), modified, 'a repositioned blade carrier must be left alone')
})

test('an open belt transfers reversible rotation between independent pulley sizes', () => {
  const large = part('motor-wheel', '4185a')
  const small = { ...part('take-up-wheel', '3713'), position: [88, 26, 0] }
  const parts = [large, small]
  const belt = { id: 'loop', a: { part: large.id, groove: 'rim' }, b: { part: small.id, groove: 'rim' } }
  const assembly = createAssembly(parts, [], { belts: [belt] })
  const [retained] = assembly.belts
  const expected = 28.25 / 7.75
  const check = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} should equal ${b}`)
  check(retained.ratio, expected)
  const fromA = rotationMotion(large.id, parts, assembly)
  const fromB = rotationMotion(small.id, parts, assembly)
  check(fromA.spins.get(small.id).ratio, expected)
  check(fromB.spins.get(large.id).ratio, 1 / expected)
  check(beltTravel(retained, fromA.spins, .5), 28.25 * .5)
  check(beltTravel(retained, fromA.spins, -.5), -28.25 * .5)
  const path = beltPath(retained.layout)
  assert.ok(path.length > 40)
  const closedLength = path.reduce((sum, entry, i) => sum + entry.point.distanceTo(path[(i + 1) % path.length].point), 0)
  assert.ok(Math.abs(closedLength - retained.layout.length) < .1)

  assert.equal(rotationMotion(large.id, parts, createAssembly(parts, []))?.spins?.has(small.id) ?? false, false)
  const flipped = { ...small, rotation: [1, 0, 0, 0] }
  const flippedAssembly = createAssembly([large, flipped], [], { belts: [belt] })
  const reversedNormal = rotationMotion(large.id, [large, flipped], flippedAssembly).spins.get(small.id)
  check(reversedNormal.ratio, -expected)
  check(reversedNormal.axis[2], -1)
})

test('a belt requires flat seating, clearance and a free groove, and rejects a conflicting gear loop', () => {
  const first = part('first', '4185a')
  const second = { ...part('second', '3713'), position: [70, 0, 0] }
  const a = grooveOf(first)
  assert.equal(beltLayout(a, grooveOf({ ...second, position: [70, 0, 15] })).reason, 'plane')
  assert.equal(beltLayout(a, grooveOf({ ...second, rotation: [.70710678, 0, 0, .70710678] })).reason, 'axes')
  assert.equal(beltLayout(a, grooveOf({ ...second, position: [25, 0, 0] })).reason, 'clearance')
  assert.equal(beltLayout(a, grooveOf(part('plain', '3705'))).reason, 'groove')

  const belt = { id: 'drive', a: { part: first.id, groove: 'rim' }, b: { part: second.id, groove: 'rim' } }
  const index = new Map([first, second].map(part => [part.id, part]))
  const repeated = { ...belt, id: 'duplicate', a: belt.b, b: belt.a }
  const compiled = assembleBelts(index, [belt, repeated])
  assert.equal(compiled.length, 1)
  const gears = [first, second].map(part => ({ part: part.id, center: part.position, axis: [0, 0, 1], radius: 35, teeth: 28, width: 8 }))
  for (const id of index.keys()) {
    assert.equal(rotationalDrive(id, index.keys(), [], gears, undefined, [], compiled).reason, 'inconsistent-transmission')
  }
})

test('legacy 858 belt meshes are upgraded by their geometry in old saved builds', () => {
  const { belts, ...old } = engine
  const hidden = belts.map((belt, i) => {
    const origin = old.parts.find(part => part.id === belt.a.part).position
    // The original band's local +Z is +X, local -Y is +Y, local -X is -Z.
    return { ...part('legacy-' + i, '858-belt-' + (i + 1)), position: origin,
      rotation: new Quaternion().setFromAxisAngle(new Vector3(1, 0, 1).normalize(), Math.PI).toArray() }
  })
  const upgraded = promoteLegacyBelts({ ...old, parts: [...old.parts, ...hidden] })
  assert.equal(upgraded.parts.length, old.parts.length)
  assert.deepEqual(upgraded.belts.map(({ a, b }) => ({ a, b })), belts.map(({ a, b }) => ({ a, b })))
  assert.equal(promoteLegacyBelts(upgraded), upgraded)
})

test('858 links its handle, three pistons and valve gear for a complete reversible turn', () => {
  const assembly = createAssembly(engine.parts, engine.connections)
  const motion = rotationMotion(undefined, engine.parts, assembly)
  assert.equal(motion.kind, 'engine')
  assert.equal(motion.driver, '858-44')
  assert.equal(motion.meshes.length, 4)
  assert.equal(motion.periodic, true)
  assert.equal(rotationMotion('858-45', engine.parts, assembly).kind, 'engine')

  const originals = new Map(engine.parts.map(part => [part.id, part]))
  const sample = angle => new Map(rotationPoses(engine.parts, motion, angle).map(part => [part.id, part]))
  const before = sample(0)
  const quarter = sample(Math.PI / 2)
  const after = sample(2 * Math.PI)
  const close = (a, b) => assert.ok(Math.abs(a - b) < .001, `${a} expected to be near ${b}`)
  assert.equal(quarter.has('858-1'), false)
  assert.equal(quarter.has('858-173'), false)
  assert.notDeepEqual(quarter.get('858-45').position, originals.get('858-45').position)
  for (const [id, part] of before) {
    const original = originals.get(id)
    close(new Vector3().fromArray(part.position).distanceTo(new Vector3().fromArray(original.position)), 0)
    close(new Vector3().fromArray(after.get(id).position).distanceTo(new Vector3().fromArray(part.position)), 0)
    close(new Quaternion().fromArray(after.get(id).rotation).angleTo(new Quaternion().fromArray(part.rotation)), 0)
  }

  const pistonPins = new Set([14, 16, 18, 23, 27, 31].map(index => `858-${index}`))
  const bearings = new Set([21, 25, 29, 24, 28, 32].map(index => `858-${index}`))
  const pivots = assembly.connections.filter(({ shaft, socket }) =>
    pistonPins.has(shaft.part) && bearings.has(socket.part) || bearings.has(shaft.part) && pistonPins.has(socket.part))
  assert.ok(pivots.length >= 6)
  for (const angle of [.3, 1.2, 2.4, 5.6]) {
    const positions = sample(angle)
    for (const { shaft, socket } of pivots) {
      const a = worldPort(positions.get(shaft.part), assembly.port(shaft.part, shaft.port))
      const b = worldPort(positions.get(socket.part), assembly.port(socket.part, socket.port))
      close(Math.abs(a.axis.dot(b.axis)), 1)
      close(a.start.sub(b.start).cross(b.axis).length(), 0)
    }
  }

  const poses = Array.from({ length: 361 }, (_, i) => sample(i * Math.PI / 180))
  const at = (pose, index) => pose.get(`858-${index}`)
  for (const index of [24, 28, 32]) {
    const home = before.get(`858-${index}`)
    const ys = poses.map(pose => {
      const part = at(pose, index)
      close(part.position[0], home.position[0])
      close(part.position[2], home.position[2])
      close(new Quaternion().fromArray(part.rotation).angleTo(new Quaternion().fromArray(home.rotation)), 0)
      return part.position[1]
    })
    close(Math.max(...ys) - Math.min(...ys), 32)
  }
  assert.ok(at(before, 28).position[1] > at(before, 24).position[1])
  assert.ok(at(poses[180], 28).position[1] < at(poses[180], 24).position[1])
  const rot = (pose, index) => new Quaternion().fromArray(at(pose, index).rotation)
  const camTurn = rot(quarter, 33).multiply(rot(before, 33).invert())
  const crankTurn = rot(quarter, 44).multiply(rot(before, 44).invert())
  close(camTurn.angleTo(crankTurn.invert()), 0)

  for (const [rod, rocker] of [[158, 180], [161, 184], [164, 182]]) {
    const ys = poses.map(pose => at(pose, rod).position[1])
    assert.ok(Math.max(...ys) - Math.min(...ys) > 13)
    assert.ok(ys.slice(1).every((y, index) => Math.abs(y - ys[index]) < 4.6))
    const resting = rot(poses[ys.indexOf(Math.min(...ys))], rocker)
    const lifted = rot(poses[ys.indexOf(Math.max(...ys))], rocker)
    assert.ok(resting.angleTo(lifted) > .25)
  }
  const reverse = sample(-Math.PI / 2)
  for (const [id, part] of reverse) {
    close(new Vector3().fromArray(part.position).distanceTo(new Vector3().fromArray(poses[270].get(id).position)), 0)
  }
})

test('engine discovery uses the assembled geometry after changing IDs and orientation', () => {
  const turn = new Quaternion().setFromAxisAngle(new Vector3(1, 2, 3).normalize(), .73)
  const offset = new Vector3(-23, 84, 13)
  const rename = id => `test-part-${id.split('-').at(-1)}`
  const transform = part => ({
    ...part, id: rename(part.id),
    position: new Vector3().fromArray(part.position).applyQuaternion(turn).add(offset).toArray(),
    rotation: new Quaternion().fromArray(part.rotation).premultiply(turn).toArray(),
  })
  const endpoint = ({ part, port }) => ({ part: rename(part), port })
  const parts = engine.parts.map(transform)
  const connections = engine.connections.map(link => ({
    ...link, shaft: endpoint(link.shaft), socket: endpoint(link.socket),
  }))
  const assembly = createAssembly(parts, connections)
  const motion = rotationMotion(rename('858-45'), parts, assembly)
  assert.equal(motion.kind, 'engine')
  const original = rotationMotion('858-44', engine.parts, createAssembly(engine.parts, engine.connections))
  const moved = new Map(rotationPoses(parts, motion, Math.PI / 3).map(part => [part.id, part]))
  for (const part of rotationPoses(engine.parts, original, Math.PI / 3).map(transform)) {
    const result = moved.get(part.id)
    assert.ok(new Vector3().fromArray(part.position).distanceTo(new Vector3().fromArray(result.position)) < .001, part.id)
    assert.ok(new Quaternion().fromArray(part.rotation).angleTo(new Quaternion().fromArray(result.rotation)) < .001, part.id)
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
    const motion = rotationMotion(driver, buggy.parts, assembly).rotation
    assert.ok(motion.ok)
    const first = motion.spins.get('8845-76')
    const second = motion.spins.get('8845-94')
    const signedProjection = first.axis.reduce((sum, component, i) => sum + component * second.axis[i], 0)
    assert.ok(Math.abs(first.ratio + second.ratio * signedProjection) < 1e-8)
    assert.equal(motion.spins.size, 11)
    assert.equal(motion.meshes.length, 1)
  }
  const pulley = rotationMotion('8845-101', buggy.parts, assembly)
  assert.ok(pulley.ok)
  assert.ok(pulley.rotation.spins.has('8845-96'))
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

function preview(parts, motion, angle, axis) {
  assert.ok(motion?.ok)
  const poses = rotationPoses(parts, motion, angle, axis)
  assert.ok(poses)
  return new Map([...parts, ...poses].map(pose => [pose.id, pose]))
}

function countRetained(parts, links) {
  const assembly = createAssembly([...parts.values()], [])
  return links.filter(link => connectPlaced(assembly, parts.get(link.shaft.part), parts.get(link.socket.part), link).ok).length
}

test('an assembled Cardan passes motion both ways and preserves its two pivot axes', () => {
  const bundle = componentBundle(part('joint', '61903'), availableParts, (id, i) => `${id}-${i}`)
  assert.ok(bundle)
  const [a, b, cross] = [bundle.anchor, ...bundle.items]
  b.rotation = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 4)
    .multiply(new Quaternion().fromArray(b.rotation)).toArray()
  const parts = [a, b, cross]
  const assembly = createAssembly(parts, bundle.links)
  assert.equal(assembly.connections.length, 2)
  for (const driver of [a, b]) {
    const motion = rotationMotion(driver.id, parts, assembly)
    assert.ok(motion?.ok)
    assert.equal(motion.cardans.size, 1)
    for (const angle of [-4 * Math.PI - .54, -.83, .54, Math.PI + .63]) {
      const moved = preview(parts, motion, angle)
      assert.equal(countRetained(moved, bundle.links), 2)
      const receiver = driver === a ? b : a
      const spin = motion.spins.get(receiver.id)
      assert.ok(Math.abs(Math.abs(spin.angleAt(angle)) - Math.abs(angle)) > .03)
      assert.notDeepEqual(moved.get(cross.id).rotation, cross.rotation)
    }
  }
})

test('a non-parallelogram linkage keeps every joint closed in either direction', () => {
  const shaftLine = start => ({ start, axis: [0, 0, 1] })
  const joint = (a, b, start, motion = 'continuous') => ({
    a, b, shaftLine: shaftLine(start), socketLine: shaftLine(start), motion,
  })
  const ids = ['frame', 'mount', 'crank', 'coupler', 'rocker']
  const joints = [joint('frame', 'mount', [0,0,0], 'fixed'),
    joint('frame', 'crank', [0,0,0]), joint('crank', 'coupler', [1,3,0]),
    joint('coupler', 'rocker', [8,4,0], 'ball'), joint('rocker', 'frame', [10,0,0])]
  const graph = jointBodies(ids, joints)
  const motion = linkageDrive('crank', graph, [], [], null)
  assert.equal(motion?.kind, 'linkage')
  for (const angle of [-.2, .2]) {
    const transforms = motion.solve(angle)
    assert.ok(transforms)
    assert.equal(transforms.has('frame'), false)
    for (const link of joints.slice(1)) {
      const point = id => {
        const value = new Vector3().fromArray(link.socketLine.start)
        const transform = transforms.get(id)
        return transform ? value.applyQuaternion(transform.rotation).add(transform.translation) : value
      }
      assert.ok(point(link.a).distanceTo(point(link.b)) < 1e-8)
    }
  }
})

test('8845 steering moves both knuckles, the rack and the Cardan while preserving all contacts', () => {
  const assembly = createAssembly(buggy.parts, buggy.connections)
  for (const driver of ['8845-42', '8845-60', '8845-101']) {
    const motion = rotationMotion(driver, buggy.parts, assembly)
    assert.equal(motion?.kind, 'linkage')
    for (const angle of [-.25, .25]) {
      const moved = preview(buggy.parts, motion, angle)
      for (const index of [42, 43, 60, 172, 178]) assert.notDeepEqual(moved.get(`8845-${index}`), buggy.parts[index - 1])
      assert.deepEqual(moved.get('8845-72'), buggy.parts[71])
      assert.notDeepEqual(moved.get('8845-99').rotation, buggy.parts[98].rotation)
      assert.equal(countRetained(moved, buggy.connections), buggy.connections.length)
    }
  }
})

test('both 8845 shocks compress on their own swing arms within their stroke', () => {
  const assembly = createAssembly(buggy.parts, buggy.connections)
  for (const [spring, rod, cylinder, tyre, fixedTyre] of [[106,105,104,174,176], [109,108,107,176,174]]) {
    const motion = rotationMotion(`8845-${spring}`, buggy.parts, assembly)
    assert.equal(motion?.kind, 'suspension')
    const moved = preview(buggy.parts, motion, motion.range[0] * Math.PI / 360)
    const end = index => new Vector3().fromArray(moved.get(`8845-${index}`).position)
    const length = end(rod).distanceTo(end(cylinder))
    assert.ok(length >= 84 && length < 104)
    assert.ok(moved.get(`8845-${spring}`).previewScale[1] < 1)
    assert.notDeepEqual(moved.get(`8845-${tyre}`), buggy.parts[tyre - 1])
    assert.deepEqual(moved.get(`8845-${fixedTyre}`), buggy.parts[fixedTyre - 1])
    assert.equal(countRetained(moved, buggy.connections), buggy.connections.length)
  }
})

test('independent shock families expand and travel between catalog stops', () => {
  for (const [design, travel] of [['76320-f1', 60], ['41475-f1', 40], ['74741-f2', 40]]) {
    const source = { parts: [part('shock', design)], connections: [] }
    const expanded = expandComponents(source, availableParts)
    assert.equal(expanded.parts.length, 3, design)
    assert.equal(expanded.connections.length, 2, design)
    const assembly = createAssembly(expanded.parts, expanded.connections)
    const motion = rotationMotion('shock', expanded.parts, assembly)
    assert.equal(motion?.unit, 'linear')
    assert.equal(motion.range[1] - motion.range[0], travel)
    const moved = preview(expanded.parts, motion, motion.range[0] + travel / 2)
    const spring = expanded.parts[2]
    assert.ok(moved.get(spring.id).previewScale[1] > 0)
    assert.equal(countRetained(moved, expanded.connections), 2)
    assert.equal(rotationPoses(expanded.parts, motion, motion.range[1] + 1), null)
  }
})

test('a spherical joint can turn about any of the three editor axes', () => {
  const ball = part('ball', '2736')
  const socket = part('socket', '2739a')
  const snap = options(ball, socket).find(candidate => candidate.fit?.motion.rotation === 'ball')
  assert.ok(snap)
  const parts = [{ ...ball, ...snap.pose }, socket]
  const links = [{ shaft: snap.shaft, socket: snap.socket, placement: snap.fit.placement }]
  const assembly = createAssembly(parts, links)
  const motion = rotationMotion('ball', parts, assembly)
  assert.ok(motion?.spherical)
  const poses = [0, 1, 2].map(axis => preview(parts, motion, .23, axis))
  assert.equal(new Set(poses.map(moved => moved.get('ball').rotation.join())).size, 3)
  assert.ok(poses.every(moved => countRetained(moved, links) === 1))
})

test('snap places telescopic shock parts in either insertion order and pairs the rack with its pinion', () => {
  const cylinder = part('cylinder', '4255')
  const rod = part('rod', '4254')
  for (const [moving, fixed] of [[rod, cylinder], [cylinder, rod]]) {
    const snap = options(moving, fixed).find(option => option.fit?.motion.rotation === 'slider')
    assert.ok(snap)
    assert.equal(restore(snap, moving, fixed).length, 1)
  }
  const rack = part('rack', '3743')
  const gear = part('pinion', '3647')
  assert.ok(options(gear, rack).some(option => option.mesh?.ok))
  assert.ok(options(rack, gear).some(option => option.mesh?.ok))
})

test('expanding a loaded shock preserves its external mount at the piston end', () => {
  const shock = part('shock', '76320-f1')
  const pin = part('pin', '3673')
  const pinEnd = options(pin, shock).find(snap => snap.fit?.ok && snap.socket.port === 'shadow-d2028bdba67a')
  assert.ok(pinEnd)
  const source = {
    parts: [shock, { ...pin, ...pinEnd.pose }],
    connections: [{ shaft: pinEnd.shaft, socket: pinEnd.socket, placement: pinEnd.fit.placement }],
  }
  const expanded = expandComponents(source, availableParts)
  assert.equal(expanded.parts.length, 4)
  assert.equal(expanded.connections.length, 3)
  assert.equal(createAssembly(expanded.parts, expanded.connections).connections.length, 3)
  assert.equal(expanded.connections.find(link => link.shaft.part === 'pin').socket.part, 'shock:component:1')
  assert.deepEqual(expandComponents(expanded, availableParts), expanded)
})

test('33299a leaves an 8L axle available for neighboring sockets and can be seated again after removal', () => {
  const axle = part('axle', '3707')
  const beam = part('beam', '33299a')
  const boss = portsFor(beam.design).find(port => port.role === 'key' && portLength(port) === 20)
  const initial = options(beam, axle).find(snap => snap.fit && snap.socket.port === boss.id)
  assert.ok(initial)
  let installed = [axle, { ...beam, ...initial.pose }]
  let saved = [{ shaft: initial.shaft, socket: initial.socket, placement: initial.fit.placement }]
  for (const [index, design] of ['3713', '41677', '6632'].entries()) {
    const moving = part('neighbor-' + index, design)
    const assembly = createAssembly([...installed, moving], saved)
    const stops = assembly.shaftEntryStops(initial.shaft)
    // Aim four LDU into the neighbor, still within the on-screen snap radius.
    const halfWidth = design === '3713' ? 10 : 5
    const x = -80 + stops.start - halfWidth + 4
    const snaps = nearbyConnections({ moving, parts: [axle], assembly, depth: 0, roll: 0,
      ray: new Ray(new Vector3(x, 0, 100), new Vector3(0, 0, -1)),
      scene: { pixelDistance: point => Math.abs(point.x - x) * 6 },
    })
    const snap = snaps.find(option => option.fit && option.shaft.part === axle.id &&
      Math.abs(option.fit.occupancy.shaft[1] - stops.start) < 1e-6)
    assert.ok(snap, design)
    installed.push({ ...moving, ...snap.pose })
    saved.push({ shaft: snap.shaft, socket: snap.socket, placement: snap.fit.placement })
    assert.equal(createAssembly(installed, saved).connections.length, saved.length)
  }
  // Starting an existing-part move releases only that part's occupied interval.
  const retained = saved.filter(link => link.socket.part !== beam.id)
  const assembly = createAssembly(installed, retained)
  assert.ok(assembly.previewInsertion(initial.shaft, initial.socket, initial.fit.placement).ok)
  const x = -80 + initial.fit.occupancy.shaft.reduce((sum, value) => sum + value, 0) / 2
  const retry = nearbyConnections({ moving: beam, parts: [axle], assembly, depth: 0, roll: 0,
    ray: new Ray(new Vector3(x, 0, 100), new Vector3(0, 0, -1)),
    scene: { pixelDistance: point => Math.abs(point.x - x) * 6 },
  }).find(snap => snap.fit && snap.socket.port === boss.id)
  assert.ok(retry)
  assert.deepEqual(retry.fit.occupancy.shaft, initial.fit.occupancy.shaft)
  const restored = createAssembly(installed, saved)
  assert.equal(restored.connections.length, 4)
  assert.equal(assembly.connections.length, 3)
})
