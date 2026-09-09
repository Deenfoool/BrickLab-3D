import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Window } from 'happy-dom'
import * as THREE from 'three'

const dom = new Window()
for (const key of ['window', 'document', 'localStorage', 'CustomEvent', 'MutationObserver', 'CSS', 'Event']) {
  globalThis[key] = key === 'window' ? dom : dom[key]
}
globalThis.requestAnimationFrame = callback => { callback(0); return 0 }

await import('../basic-parts-pack.js')
await import('../technic-parts-pack-v2.js')
await import('../lab-parts.js')
await import('../vehicle-parts-v1.js')
await import('../parts3/mechanical-parts-pack-v3.js')
await import('../parts3/parts-3-extra-v1.js')
await import('../parts3/parts-3-wheel-dimensions.js')
await import('../parts3/parts-3-steering-upgrade.js')
await import('../parts4/mechanical-driveline-v1.js')
await import('../parts4/steering-suspension-v1.js')
await import('../parts5/visual-overhaul-v1.js')
await import('../parts5/visual-refinement-v2.js')
await import('../parts5/driveline-refinement-v2.js')
await import('../parts5/structural-refinement-v2.js')
await import('../parts5/detail-refinement-v3.js')
await import('../parts6/realism-refinement-v1.js')
await import('../parts6/precision-refinement-v2.js')
await import('../parts6/mechanical-realism-v1.js')
await import('../parts6/nominal-dimension-fidelity-v1.js')
await import('../parts6/connector-fidelity-v1.js')
await import('../parts6/interface-fit-refinement-v2.js')
await import('../parts6/interface-physics-safety-v1.js')

const { findPart } = await import('../parts.js')
const { GEAR_MODULE_STUD, GEAR_PRESSURE_ANGLE_DEG, gearMetrics } = await import('../parts5/part-geometry-metrics-v1.js')

const rackBefore = findPart('steering-rack-7')
const guideBefore = findPart('steering-rack-guide')
const rackContractBefore = JSON.stringify({ connectors: rackBefore.connectors, mechanics: rackBefore.mechanics })
const guideContractBefore = JSON.stringify({ connectors: guideBefore.connectors, mechanics: guideBefore.mechanics })
const rackPhysicalBefore = { massKg: rackBefore.physics?.massKg, material: rackBefore.physics?.material, collisionClass: rackBefore.physics?.collisionClass }
const guidePhysicalBefore = { massKg: guideBefore.physics?.massKg, material: guideBefore.physics?.material, collisionClass: guideBefore.physics?.collisionClass }

const rackModule = await import('../parts6/rack-gear-fidelity-v1.js')
const rack = findPart('steering-rack-7')
const guide = findPart('steering-rack-guide')
const LINEAR_PITCH = Math.PI * GEAR_MODULE_STUD

function rackFeatures(object, feature = null) {
  const result = []
  object.traverse(child => {
    const marker = child.userData?.parts6RackFeature
    if (marker && (!feature || marker === feature)) result.push(child)
  })
  return result
}

function finiteGeometry(object) {
  let finite = true
  object.traverse(child => {
    if (!child.isMesh) return
    const positions = child.geometry?.getAttribute?.('position')
    if (!positions) { finite = false; return }
    for (const value of positions.array) {
      if (!Number.isFinite(value)) { finite = false; break }
    }
  })
  return finite
}

test('rack/guide fidelity preserves connector and steering-mechanics contracts', () => {
  assert.equal(JSON.stringify({ connectors: rack.connectors, mechanics: rack.mechanics }), rackContractBefore)
  assert.equal(JSON.stringify({ connectors: guide.connectors, mechanics: guide.mechanics }), guideContractBefore)
  assert.equal(rack.mechanics.steeringRack.maxTravelStud, 1)
  assert.ok(rack.connectors.some(item => item.id === 'slider' && item.type === 'slider'))
  assert.ok(guide.connectors.some(item => item.id === 'rail' && item.type === 'slider-rail'))
  assert.equal(rack.connectors.filter(item => item.type === 'pin').length, 2)
  assert.equal(guide.connectors.filter(item => item.type === 'tube').length, 8)
})

test('explicit rack/guide collider proxies preserve previous physical envelopes', () => {
  for (const [part, before] of [[rack, rackPhysicalBefore], [guide, guidePhysicalBefore]]) {
    assert.equal(part.physics.massKg, before.massKg)
    assert.equal(part.physics.material, before.material)
    assert.equal(part.physics.collisionClass, before.collisionClass)
    assert.equal(part.physics.colliderProfile.specs.length, 1)
    assert.equal(part.physics.colliderProfile.specs[0].type, 'box')
  }
  assert.equal(rack.physics.colliderProfile.version, 'parts-6-preserve-steering-rack-bounds-v1')
  assert.deepEqual(rack.physics.colliderProfile.specs[0].center, [0, 0.695, 0.4425])
  assert.deepEqual(rack.physics.colliderProfile.specs[0].size, [6.21, 0.43, 1.265])
  assert.equal(guide.physics.colliderProfile.version, 'parts-6-preserve-steering-rack-guide-bounds-v1')
  assert.deepEqual(guide.physics.colliderProfile.specs[0].center, [0, 0.62, 0])
  assert.deepEqual(guide.physics.colliderProfile.specs[0].size, [6.70, 1.06, 1.18])
})

test('rack uses the exact spur-gear module, pressure angle and circular pitch', () => {
  assert.equal(rack.visualQuality, 'parts-6-module-matched-steering-rack-v4')
  assert.equal(guide.visualQuality, 'parts-6-matched-rack-guide-v1')
  assert.equal(rack.rackVisualMetrics.moduleStud, GEAR_MODULE_STUD)
  assert.equal(rack.rackVisualMetrics.pressureAngleDeg, GEAR_PRESSURE_ANGLE_DEG)
  assert.ok(Math.abs(rack.rackVisualMetrics.linearPitchStud - LINEAR_PITCH) < 1e-12)

  const reference = gearMetrics(12, 'spur')
  assert.equal(rack.rackVisualMetrics.addendumStud, reference.addendum)
  assert.equal(rack.rackVisualMetrics.dedendumStud, reference.dedendum)
})

test('rack teeth are instanced at exactly one circular pitch', () => {
  const object = rack.create(rack.defaultColor)
  const teeth = rackFeatures(object, 'module-matched-teeth')[0]
  assert.ok(teeth?.isInstancedMesh)
  assert.equal(teeth.count, 15)

  const a = new THREE.Matrix4()
  const b = new THREE.Matrix4()
  teeth.getMatrixAt(0, a)
  teeth.getMatrixAt(1, b)
  const pa = new THREE.Vector3().setFromMatrixPosition(a)
  const pb = new THREE.Vector3().setFromMatrixPosition(b)
  assert.ok(Math.abs((pb.x - pa.x) - LINEAR_PITCH) < 1e-9)
  assert.ok(Math.abs(pb.y - pa.y) < 1e-12)
  assert.ok(Math.abs(pb.z - pa.z) < 1e-12)
  assert.equal(finiteGeometry(object), true)
})

test('full-depth rack tooth envelope fits the rebuilt guide opening', () => {
  const rackObject = rack.create(rack.defaultColor)
  const guideObject = guide.create(guide.defaultColor)
  const metrics = rackObject.userData.rackGearMetrics
  const opening = guideObject.userData.rackGuideMetrics
  assert.ok(metrics.rootLineY > opening.lowerOpeningY, 'root clears guide lower shell')
  assert.ok(metrics.tipLineY < opening.upperOpeningY, 'tooth tip clears guide upper shell')
  assert.ok(metrics.rootLineY < metrics.pitchLineY)
  assert.ok(metrics.pitchLineY < metrics.tipLineY)
  assert.ok(Math.abs((metrics.pitchLineY - metrics.rootLineY) - gearMetrics(12).dedendum) < 1e-12)
  assert.ok(Math.abs((metrics.tipLineY - metrics.pitchLineY) - gearMetrics(12).addendum) < 1e-12)
  assert.equal(opening.mountTubeCount, 8)
  assert.equal(finiteGeometry(guideObject), true)
})

test('rack guide exposes real mounting tubes, wear strips and molded stiffening ribs', () => {
  const object = guide.create(guide.defaultColor)
  assert.equal(rackFeatures(object, 'guide-mount-tube').length, 8)
  assert.equal(rackFeatures(object, 'guide-wear-strip').length, 2)
  assert.equal(rackFeatures(object, 'guide-stiffening-rib').length, 7)
})

test('rack tie pins are centered on the actual hinge connector coordinates', () => {
  const object = rack.create(rack.defaultColor)
  const visiblePins = rackFeatures(object, 'tie-pin').sort((a, b) => a.position.x - b.position.x)
  const connectors = rack.connectors.filter(item => item.type === 'pin').sort((a, b) => a.position[0] - b.position[0])
  assert.equal(visiblePins.length, connectors.length)
  for (let i = 0; i < connectors.length; i += 1) {
    const expected = connectors[i].position
    const actual = visiblePins[i].position
    assert.ok(Math.abs(actual.x - expected[0]) < 1e-12)
    assert.ok(Math.abs(actual.y - expected[1]) < 1e-12)
    assert.ok(Math.abs(actual.z - expected[2]) < 1e-12)
  }
})

test('rack/guide detail meshes cannot enlarge preserved collider proxies', () => {
  for (const part of [rack, guide]) {
    const object = part.create(part.defaultColor)
    const features = rackFeatures(object)
    assert.ok(features.length >= 5)
    for (const node of features) assert.equal(node.userData.physicsIgnore, true)
  }
})

test('rack exports pitch-line diagnostics for visual pinion review', () => {
  const state = globalThis.BrickLabParts6RackGearFidelity
  assert.equal(rackModule.PARTS6_RACK_GEAR_FIDELITY_VERSION, 'parts-6-rack-gear-fidelity-v4')
  assert.equal(state.moduleStud, GEAR_MODULE_STUD)
  assert.equal(state.pressureAngleDeg, GEAR_PRESSURE_ANGLE_DEG)
  assert.ok(Math.abs(state.linearPitchStud - LINEAR_PITCH) < 1e-12)
  assert.deepEqual(state.upgraded.sort(), ['steering-rack-7', 'steering-rack-guide'].sort())
  const object = rack.create(rack.defaultColor)
  assert.ok(object.userData.rackGearMetrics.pitchLineY > 0.75)
  assert.ok(object.userData.rackGearMetrics.pitchLineY < 0.82)
})

await dom.happyDOM.close()
