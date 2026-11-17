import assert from 'node:assert/strict'
import { test } from 'node:test'
import { registerHooks } from 'node:module'
import library from '../catalog/parts-library.json' with { type: 'json' }

const three = new URL('../vendor/three/build/three.module.min.js', import.meta.url).href
registerHooks({ resolve(specifier, context, next) {
  return next(specifier === 'three' ? three : specifier, context)
} })
const { createAssembly, connectAligned } = await import('../src/editor/model.js')
const { nearbyConnections } = await import('../src/editor/snap.js')
const { portsFor } = await import('../src/mechanics/catalog.js')
const { evaluateInsertion, portLength } = await import('../src/mechanics/axial.js')

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
