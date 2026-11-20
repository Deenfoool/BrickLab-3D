import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { registerHooks } from 'node:module'
import { test } from 'node:test'
import buggy from '../examples/dune-buggy.json' with { type: 'json' }

const three = new URL('../vendor/three/build/three.module.min.js', import.meta.url).href
registerHooks({ resolve(specifier, context, next) {
  return next(specifier === 'three' ? three : specifier, context)
} })

const { Quaternion, Vector3 } = await import('three')
const { portsFor } = await import('../src/mechanics/catalog.js')
const { connectAligned, createAssembly, rotationMotion } = await import('../src/editor/model.js')
const { joinedPose, samePose } = await import('../src/editor/placement.js')
const { snapScene } = await import('../src/editor/scene-snap.js')

const brick = (id, position) => ({ id, design: '3700', position, rotation: [0, 0, 0, 1] })
const axisTurn = (axis, angle) =>
  new Quaternion().setFromAxisAngle(new Vector3().fromArray(axis), angle * Math.PI / 180)

test('scene snap closes both studs of a slightly displaced and tilted brick', () => {
  const base = brick('base', [0, 0, 0])
  const target = brick('top', [0, -24, 0])
  const crooked = { ...target, position: [1, -26, 1], rotation: axisTurn([1, 0, 0], 5).toArray() }
  const incoming = [base, crooked]
  const result = snapScene(incoming, [])
  assert.equal(result.added, 2)
  assert.equal(result.adjusted, 1)
  assert.equal(result.parts[0], base)
  assert.ok(samePose(result.parts[1], target))
  assert.equal(incoming[1], crooked)
  assert.equal(createAssembly(result.parts, result.links).connections.length, 2)
  assert.equal(snapScene(result.parts, result.links).added, 0)
})

test('scene snap corrects the roll of an axle in a keyed bore', () => {
  const bush = { ...brick('bush', [0, 0, 0]), design: '3713' }
  const axle = { ...brick('axle', [0, 0, 0]), design: '3705' }
  const male = portsFor(axle.design).find(port => port.gender === 'M')
  const female = portsFor(bush.design).find(port => port.gender === 'F')
  const installed = {
    ...axle, ...joinedPose(axle, male, bush, female, {
      offset: -20, direction: 1, roll: 0, keyStep: Math.PI / 2,
    }),
  }
  const skew = axisTurn(female.axis, 6).multiply(new Quaternion().fromArray(installed.rotation))
  const result = snapScene([bush, { ...installed, rotation: skew.toArray() }], [])
  assert.equal(result.added, 1)
  assert.ok(samePose(result.parts[1], installed))
  assert.equal(createAssembly(result.parts, result.links).connections.length, 1)
})

test('scene snap moves a joined group together and leaves hidden anchors in place', () => {
  const a = brick('a', [0, 0, 0])
  const b = brick('b', [0, -24, 0])
  const c = brick('c', [1, -50, 0])
  const d = brick('d', [1, -74, 0])
  const parts = [a, b, c, d]
  const assembly = createAssembly(parts, [])
  const links = [...connectAligned(assembly, [b], [a]), ...connectAligned(assembly, [d], [c])]
  const result = snapScene(parts, links)
  assert.equal(result.added, 2)
  assert.equal(result.adjusted, 2)
  assert.deepEqual(result.parts.map(part => part.position), [[0, 0, 0], [0, -24, 0], [0, -48, 0], [0, -72, 0]])
  assert.deepEqual(result.links.slice(0, links.length), links)
  assert.equal(createAssembly(result.parts, result.links).connections.length, 6)

  const hidden = snapScene(parts, links, { hidden: new Set(['d']), fixed: new Set(['a']) })
  assert.equal(hidden.added, 0)
  assert.equal(hidden.adjusted, 0)
})

test('scene snap skips large offsets, large angles, and tied corrective seats', () => {
  const base = brick('base', [0, 0, 0])
  const far = brick('far', [0, -34, 0])
  const angled = { ...brick('angle', [0, -24, 0]), rotation: axisTurn([1, 0, 0], 30).toArray() }
  for (const part of [far, angled]) {
    const result = snapScene([base, part], [])
    assert.equal(result.added, 0)
    assert.equal(result.adjusted, 0)
  }
  const left = brick('left', [-1, 0, 0])
  const right = brick('right', [1, 0, 0])
  const top = brick('top', [0, -25, 0])
  const tied = snapScene([left, right, top], [], { fixed: new Set(['left', 'right']) })
  assert.equal(tied.added, 0)
  assert.equal(tied.adjusted, 0)

  const seated = brick('seated', [0, -24, 0])
  const conflicting = brick('conflicting', [1, -25, 0])
  const crowded = [base, seated, conflicting]
  const assembly = createAssembly(crowded, [])
  const installed = connectAligned(assembly, [seated], [base])
  const occupied = snapScene(crowded, installed)
  assert.equal(occupied.added, 0)
  assert.equal(occupied.adjusted, 0)
})

test('scene snap recovers every existing gearbox joint from unlinked geometry', async () => {
  const file = new URL('../examples/5-plus-r-gearbox.bricklab', import.meta.url)
  const gearbox = JSON.parse(await readFile(file, 'utf8'))
  const result = snapScene(gearbox.parts, [])
  assert.equal(result.added, gearbox.connections.length)
  assert.equal(result.adjusted, 0)
  assert.equal(createAssembly(result.parts, result.links).connections.length, gearbox.connections.length)
})

test('scene snap preserves the dune buggy steering and suspension', () => {
  const result = snapScene(buggy.parts, buggy.connections)
  const connected = createAssembly(result.parts, result.links)
  assert.equal(connected.connections.length, result.links.length)
  assert.equal(rotationMotion('8845-42', result.parts, connected)?.kind, 'linkage')
  assert.equal(rotationMotion('8845-106', result.parts, connected)?.kind, 'suspension')
})
