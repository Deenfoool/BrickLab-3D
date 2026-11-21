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
const { connectAligned, createAssembly, gearPoses, rotationMotion } = await import('../src/editor/model.js')
const { nearbyConnections, translationSnaps } = await import('../src/editor/snap.js')

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

test('the Volvo 20T gear meshes with the clutch 16T at a diagonal Technic grid position', () => {
  // Relative poses from the saved Volvo 42215 build, including the opposite local axes.
  const clutch = { ...part('clutch', '18946'), rotation: [1, 0, 0, 0] }
  const driver = part('driver', '69779', [-40, -20, -.104])
  const parts = [clutch, driver]
  const assembly = createAssembly(parts, [])
  const [gear16, gear20] = gearPoses(parts)
  assert.equal(gear20.teeth, 20)
  assert.equal(gear20.width, 9.5)
  assert.deepEqual(evaluateSpurMesh(gear20, gear16), { ok: true, ratio: 1.25 })
  assert.equal(evaluateSpurMesh({ ...gear20, center: [-40, -20, 10] }, gear16).reason, 'no-tooth-overlap')
  assert.equal(evaluateSpurMesh({ ...gear20, center: [-45, -20, 0] }, gear16).reason, 'pitch-distance')

  const motion = rotationMotion(driver.id, parts, assembly)
  assert.equal(motion.ok, true)
  assert.deepEqual(motion.meshes, [{ a: driver.id, b: clutch.id, ratio: 1.25 }])

  for (const [moving, fixed] of [parts, [...parts].reverse()]) {
    const snap = nearbyConnections({ scene, assembly, parts: [fixed], moving, depth: 0, roll: 0 })
      .find(option => option.mesh?.ok)
    assert.ok(snap, `Moving ${moving.design} towards ${fixed.design}`)
    assert.ok(Math.abs(new Vector3().fromArray(snap.pose.position).distanceTo(
      new Vector3().fromArray(fixed.position)) - 45) < 1e-6)
  }
})

test('the Volvo red 20T and 12T spur gears mesh at their saved axle spacing', () => {
  const gear20 = part('red-20', '69779')
  const gear12 = { ...part('red-12', '69778', [0, 41.264, -.23]),
    rotation: [Math.SQRT1_2, -Math.SQRT1_2, 0, 0] }
  const [large, small] = gearPoses([gear20, gear12])
  assert.equal(small.teeth, 12)
  assert.equal(small.width, 9.5)
  assert.deepEqual(evaluateSpurMesh(large, small), { ok: true, ratio: 5 / 3 })
  assert.equal(evaluateSpurMesh(large, { ...small, center: [0, 42, 0] }).reason, 'pitch-distance')
  assert.equal(evaluateSpurMesh(large, { ...small, center: [0, 40, 10] }).reason, 'no-tooth-overlap')

  const parts = [gear20, gear12]
  const assembly = createAssembly(parts, [])
  assert.equal(rotationMotion(gear20.id, parts, assembly).spins.get(gear12.id).ratio, 5 / 3)
  for (const [moving, fixed] of [parts, [...parts].reverse()]) {
    const snap = nearbyConnections({ scene, assembly, parts: [fixed], moving, depth: 0, roll: 0 })
      .find(option => option.mesh?.ok)
    assert.ok(snap)
    assert.equal(Math.abs(snap.pose.position[1] - fixed.position[1]), 40)
  }
})

test('the Volvo black 24T and 12T gear snap can correct a diagonal mesh along the gizmo axis', () => {
  const fixed = part('black-24', '3648b')
  const moving = { ...part('black-12', '69778', [40, -18.687, -.373]),
    rotation: [Math.SQRT1_2, -Math.SQRT1_2, 0, 0] }
  const parts = [fixed, moving]
  const assembly = createAssembly(parts, [])
  assert.equal(evaluateSpurMesh(...gearPoses(parts)).reason, 'pitch-distance')
  const projection = { project: p => ({ visible: true, clientX: p.x, clientY: p.y }),
    pixelDistance: (p, event) => Math.hypot(p.x - event.clientX, p.y - event.clientY) }

  for (const [member, target] of [[moving, fixed], [fixed, moving]]) {
    const snap = translationSnaps([member], [target], assembly, projection, 'Y', 0)
      .find(option => option.mesh?.ok)
    assert.ok(snap)
    assert.equal(snap.pose.position[0], member.position[0])
    assert.equal(snap.pose.position[2], member.position[2])
    assert.ok(Math.abs(Math.abs(snap.pose.position[1] - target.position[1]) - Math.sqrt(45 ** 2 - 40 ** 2)) < 1e-6)
    const placed = [target, { ...member, ...snap.pose }]
    assert.equal(rotationMotion(fixed.id, placed, assembly).spins.get(moving.id).ratio, 2)
  }
  assert.deepEqual(translationSnaps([moving], [fixed], assembly, projection, 'Z', 0), [])
})

test('the two torque-clutch halves snap together and transmit rotation through separate axles', () => {
  const inner = part('inner', '46835')
  const outer = part('outer', '46834')
  const input = { ...part('input', '32062', [0, 0, 32]), rotation: [0, -Math.SQRT1_2, 0, Math.SQRT1_2] }
  const output = { ...input, ...part('output', '32062', [0, 0, -33]), rotation: input.rotation }
  for (const [moving, fixed] of [[inner, outer], [outer, inner]]) {
    const options = nearbyConnections({ scene, assembly: createAssembly([inner, outer], []),
      parts: [fixed], moving, depth: 0, roll: 0 })
    const snap = options.find(option => option.fit?.motion.torqueLimit)
    assert.ok(snap)
    assert.deepEqual(snap.pose.position, [0, 0, 0])
  }

  const parts = [inner, outer, input, output]
  const assembly = createAssembly(parts, [])
  const links = connectAligned(assembly, [inner, outer], [input, output])
  links.push(...connectAligned(assembly, [inner], [outer]))
  assert.equal(links.length, 3)
  const restored = createAssembly(parts, links)
  assert.equal(restored.connections.length, 3)
  const motion = rotationMotion(input.id, parts, restored)
  assert(motion.ok)
  assert.equal(motion.spins.get(output.id).ratio, 1)
  const through = { ...input, id: 'through', position: [0, 0, 0] }
  assert.equal(connectAligned(createAssembly([inner, outer, through], []), [through], [inner, outer]).length, 0)
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

test('a long pin picks a reachable seat that joins both aligned beams', () => {
  const moving = part('pin', '6558', [-10, 0, 0])
  const beams = [-20, 0].map(x => ({ ...part(`beam-${x}`, '32316', [x, 0, 0]),
    rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] }))
  for (const approach of [-1, 1]) {
    const ray = new Ray(new Vector3(approach * 120, 0, 0), new Vector3(-approach, 0, 0))
    const [snap] = nearbyConnections({ scene: { pixelDistance: p => Math.hypot(p.y, p.z) * 5 },
      assembly: createAssembly([moving, ...beams], []), parts: beams, moving, ray, depth: 0, roll: 0 })
    assert.ok(snap?.fit)
    const placed = { ...moving, ...snap.pose }
    const members = [placed, ...beams]
    const links = connectAligned(createAssembly(members, []), [placed], beams)
    assert.equal(links.length, 2)
    assert.equal(createAssembly(members, links).connections.length, 2)
  }
})

test('the translation gizmo seats a long pin flush across all three beams', () => {
  const pin = part('pin', '6558', [-1.9, 0, 0])
  const beams = [-20, 0, 20].map(x => ({ ...part(`beam-${x}`, '32316', [x, 0, 0]),
    rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] }))
  const projection = { project: point => Object.assign(point.clone(), { visible: true }),
    pixelDistance: (point, screen) => point.distanceTo(screen) * 2 }
  const assembly = createAssembly([pin, ...beams], [])
  const [snap] = translationSnaps([pin], beams, assembly, projection, 'X', 0)
  assert.ok(snap?.fit)
  assert.ok(Math.abs(snap.pose.position[0]) < 1e-6)
  const placed = { ...pin, ...snap.pose }
  const parts = [placed, ...beams]
  const links = connectAligned(createAssembly(parts, []), [placed], beams)
  assert.equal(links.length, 3)
  assert.equal(createAssembly(parts, links).connections.length, 3)
})

test('the 13971 rim can target all three seats on both 3L friction pins', () => {
  const rim = { ...part('rim', '13971'), rotation: [0, Math.SQRT1_2, 0, Math.SQRT1_2] }
  for (const design of ['6558', '42924']) {
    for (const reverse of [false, true]) {
      const pin = { ...part('pin', design), rotation: reverse ? [0, 1, 0, 0] : [0, 0, 0, 1] }
      const assembly = createAssembly([pin, rim], [])
      for (const [index, center] of [-20, 0, 20].entries()) {
        const x = reverse ? -center : center
        const [snap] = nearbyConnections({ scene: { pixelDistance: point => Math.hypot(point.x - x, point.y) * 7 },
          parts: [pin], moving: rim, assembly, ray: new Ray(new Vector3(x, 0, 100), new Vector3(0, 0, -1)),
          depth: 0, roll: 0 })
        assert.ok(snap?.fit, `No rim snap on ${design} at x=${x}`)
        assert.ok(Math.abs(snap.pose.position[0] - x) < 1e-6)
        assert.deepEqual(snap.fit.occupancy.shaft.map(value => Math.round(value) || 0), [20 * index, 20 * (index + 1)])
      }
    }
  }
})

test('seven rims on the middle of their pins leave the outer seats available for a 15L beam', () => {
  const beamRotation = [0, 0, Math.SQRT1_2, Math.SQRT1_2]
  const rimRotation = [0, Math.SQRT1_2, 0, Math.SQRT1_2]
  const span = [-120, -80, -40, 0, 40, 80, 120]
  const support = { ...part('support', '32278', [-20, 0, 0]), rotation: beamRotation }
  const beam = { ...part('beam', '32278', [20, 0, 0]), rotation: beamRotation }
  const pins = span.map(z => part(`pin-${z}`, '6558', [0, 0, z]))
  const rims = span.map(z => ({ ...part(`rim-${z}`, '13971', [0, 0, z]), rotation: rimRotation }))
  const parts = [support, beam, ...pins, ...rims]
  const assembly = createAssembly(parts, [])
  const links = connectAligned(assembly, pins, [support])
  assert.equal(links.length, 7)
  for (const rim of rims) {
    const z = rim.position[2]
    const [snap] = nearbyConnections({ scene: { pixelDistance: point => Math.hypot(point.x, point.z - z) * 7 },
      parts: pins, moving: rim, assembly, ray: new Ray(new Vector3(0, 100, z), new Vector3(0, -1, 0)),
      depth: 0, roll: 0 })
    assert.ok(snap?.fit)
    assert.ok(Math.abs(snap.pose.position[0]) < 1e-6)
    Object.assign(rim, snap.pose)
    links.push(...connectAligned(assembly, [rim], pins))
  }
  assert.equal(links.length, 14)
  const aim = new Vector3(30, 0, 0)
  const snaps = nearbyConnections({ scene: { pixelDistance: point => point.distanceTo(aim) * 7 },
    parts: pins, moving: beam, assembly, ray: new Ray(new Vector3(30, 100, 0), new Vector3(0, -1, 0)),
    depth: 0, roll: 0 })
  const snap = snaps.find(option => option.fit && Math.hypot(...option.pose.position.map((value, i) => value - beam.position[i])) < 1e-6)
  assert.ok(snap)
  Object.assign(beam, snap.pose)
  links.push(...connectAligned(assembly, [beam], pins))
  assert.equal(links.length, 21)
  assert.equal(createAssembly(parts, links).connections.length, 21)
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

test('overlapping axle targets prefer the nearer axle regardless of insertion order', () => {
  const back = part('a-back', '3737')
  const front = part('z-front', '3737', [0, 0, 30])
  const bush = part('bush', '3713')
  const assembly = createAssembly([back, front, bush], [])
  const ray = new Ray(new Vector3(20, 0, 100), new Vector3(0, 0, -1))
  for (const parts of [[back, front], [front, back]]) {
    const options = nearbyConnections({ parts, moving: bush, assembly, ray, depth: 0, roll: 0,
      scene: { pixelDistance: point => Math.abs(point.x - 20) } })
    assert.equal(options[0].shaft.part, front.id)
    assert.ok(options.some(option => option.shaft?.part === back.id))
    assert.equal(new Set(options.map(option => option.key)).size, options.length)
  }
})

test('a side view can engage two parallel gears when the cursor ray misses their plane', () => {
  const fixed = part('pinion', '10928')
  const moving = part('gear', '3648', [38, 0, 0])
  const ray = new Ray(new Vector3(38, 100, 2), new Vector3(0, -1, 0))
  const options = nearbyConnections({ moving, parts: [fixed], ray, depth: 0, roll: 0, scene,
    assembly: createAssembly([moving, fixed], []) })
  assert.deepEqual(options.find(option => option.mesh)?.pose.position, [40, 0, 0])
})

test('ambiguous stud placement favors the pose that seats both studs', () => {
  const fixed = part('bottom', '3700')
  const moving = part('top', '3700', [0, -24, 0])
  const assembly = createAssembly([moving, fixed], [])
  const options = nearbyConnections({ moving, parts: [fixed], assembly, depth: 0, roll: 0, scene })
  const placed = { ...moving, ...options[0].pose }
  const links = connectAligned(assembly, [placed], [fixed])
  assert.equal(links.length, 2)
  assert.equal(createAssembly([placed, fixed], links).connections.length, 2)
})
