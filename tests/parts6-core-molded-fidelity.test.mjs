import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
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
await import('../parts6/hero-mechanical-fidelity-v2.js')
await import('../parts6/fine-mechanical-detail-v3.js')

const { findPart } = await import('../parts.js')
const { gearMetrics } = await import('../parts5/part-geometry-metrics-v1.js')

const PIN_IDS = ['pin', 'pin-half', 'pin-long', 'pin-frictionless']
const CORE_SAMPLE_IDS = [
  ...PIN_IDS,
  'technic-brick-1x4',
  'beam-7',
  'beam-l-3x3',
  'axle-9',
  'bush',
  'half-bush',
  'axle-coupler',
  'gear-12',
  'gear-24',
  'technic-frame-5x7',
]

function metadata(part) {
  return JSON.stringify({ connectors: part?.connectors ?? null, mechanics: part?.mechanics ?? null, physics: part?.physics ?? null })
}
const before = new Map(CORE_SAMPLE_IDS.map(id => [id, metadata(findPart(id))]))
const source = await readFile(new URL('../parts6/core-molded-fidelity-v4.js', import.meta.url), 'utf8')
const coreModule = await import('../parts6/core-molded-fidelity-v4.js')

function coreFeatures(object, name = null) {
  const nodes = []
  object.traverse(node => {
    const feature = node.userData?.parts6CoreFeature
    if (feature && (!name || feature === name)) nodes.push(node)
  })
  return nodes
}

function finiteGeometry(object) {
  let meshCount = 0
  let finite = true
  object.traverse(node => {
    if (!node.isMesh) return
    meshCount += 1
    const position = node.geometry?.getAttribute?.('position')
    if (!position) { finite = false; return }
    for (const value of position.array) {
      if (!Number.isFinite(value)) { finite = false; break }
    }
  })
  return { meshCount, finite }
}

test('core molded pass leaves connector, mechanics and physics metadata untouched', () => {
  for (const id of CORE_SAMPLE_IDS) {
    const part = findPart(id)
    assert.ok(part, `${id} exists`)
    assert.equal(metadata(part), before.get(id), `${id} metadata unchanged`)
  }
})

test('friction and frictionless pins use actual split cylinder lobes instead of painted slot marks', () => {
  for (const id of PIN_IDS) {
    const part = findPart(id)
    const object = part.create(part.defaultColor)
    let splitLobes = 0
    object.traverse(node => {
      const thetaLength = node.geometry?.parameters?.thetaLength
      if (node.isMesh && Number.isFinite(thetaLength) && thetaLength < Math.PI * 1.9) splitLobes += 1
    })
    assert.ok(splitLobes >= 4, `${id} has separate elastic lobe geometry at both ends`)
    assert.ok(coreFeatures(object, 'pin-elastic-slot-shadow').length >= 2, `${id} slot cavities remain readable`)
    assert.equal(object.userData.pinFidelity?.splitEnds, true)
    assert.equal(finiteGeometry(object).finite, true)
  }

  const friction = findPart('pin').create(findPart('pin').defaultColor)
  const free = findPart('pin-frictionless').create(findPart('pin-frictionless').defaultColor)
  assert.ok(coreFeatures(friction, 'pin-friction-ridge-arc').length >= 4)
  assert.equal(coreFeatures(free, 'pin-friction-ridge-arc').length, 0)
})

test('Technic bricks expose connector-aligned open underside tubes', () => {
  const part = findPart('technic-brick-1x4')
  const object = part.create(part.defaultColor)
  const expected = part.connectors.filter(item => item.type === 'tube').length
  assert.equal(coreFeatures(object, 'technic-brick-underside-tube').length, expected)
  assert.ok(coreFeatures(object, 'technic-brick-underside-bridge').length >= expected - 1)
})

test('liftarms, frame, axles, bushes and coupler receive restrained molded finish', () => {
  const beam = findPart('beam-7').create(findPart('beam-7').defaultColor)
  assert.ok(coreFeatures(beam, 'liftarm-face-mold-lane').length >= 2)

  const frame = findPart('technic-frame-5x7').create(findPart('technic-frame-5x7').defaultColor)
  assert.ok(coreFeatures(frame, 'frame-face-mold-lane').length >= 4)
  assert.ok(coreFeatures(frame, 'frame-inner-gusset').length >= 4)

  const axle = findPart('axle-9').create(findPart('axle-9').defaultColor)
  assert.equal(coreFeatures(axle, 'axle-end-chamfer-cap').length, 4)

  for (const id of ['bush', 'half-bush']) {
    const object = findPart(id).create(findPart(id).defaultColor)
    assert.equal(coreFeatures(object, 'bush-face-shoulder').length, 2)
    assert.equal(coreFeatures(object, 'bush-center-groove').length, 1)
  }

  const coupler = findPart('axle-coupler').create(findPart('axle-coupler').defaultColor)
  assert.equal(coreFeatures(coupler, 'coupler-end-shoulder').length, 2)
  assert.equal(coreFeatures(coupler, 'coupler-longitudinal-rib').length, 8)
})

test('spur gears preserve canonical pitch while adding molded face relief', () => {
  for (const teeth of [8, 12, 16, 20, 24, 36, 40]) {
    const part = findPart(`gear-${teeth}`)
    const object = part.create(part.defaultColor)
    assert.equal(part.mechanics.gear.pitchRadius, gearMetrics(teeth).pitchRadius)
    assert.equal(coreFeatures(object, 'spur-hub-face-shoulder').length, 2)
    if (teeth >= 16) assert.equal(coreFeatures(object, 'spur-root-face-relief').length, 2)
    if (teeth >= 20) assert.ok(coreFeatures(object, 'spur-mold-witness').length >= 3)
  }
})

test('every additive core finish remains collider-independent', () => {
  for (const id of CORE_SAMPLE_IDS) {
    const object = findPart(id).create(findPart(id).defaultColor)
    for (const node of coreFeatures(object)) assert.equal(node.userData.physicsIgnore, true, `${id}:${node.userData.parts6CoreFeature}`)
  }
})

test('core molded source is visual-only and keeps canonical mechanics outside the layer', () => {
  assert.equal(coreModule.PARTS6_CORE_MOLDED_FIDELITY_VERSION, 'parts-6-core-molded-fidelity-v4')
  assert.doesNotMatch(source, /mechanics\s*:/)
  assert.doesNotMatch(source, /connectors\s*:/)
  assert.doesNotMatch(source, /colliderProfile\s*:/)
  assert.match(source, /pinLobeGeometry/)
  assert.match(source, /technic-brick-underside-tube/)
  assert.match(source, /spur-root-face-relief/)
  assert.ok(globalThis.BrickLabParts6CoreMoldedFidelity.upgraded.length > 20)
})

await dom.happyDOM.close()
