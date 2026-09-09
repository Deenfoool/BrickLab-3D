import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { Window } from 'happy-dom'

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
await import('../parts6/core-molded-fidelity-v4.js')

const { findPart } = await import('../parts.js')
const IDS = ['beam-l-3x3', 'beam-angle-4x2']

function snapshot(part) {
  return JSON.stringify({ connectors: part.connectors, mechanics: part.mechanics, physics: part.physics })
}

const before = new Map(IDS.map(id => [id, snapshot(findPart(id))]))
const source = await readFile(new URL('../parts6/bent-liftarm-fidelity-v6.js', import.meta.url), 'utf8')
const module = await import('../parts6/bent-liftarm-fidelity-v6.js')

function featureNames(object) {
  const names = []
  object.traverse(node => {
    if (node.userData?.parts6BentLiftarmFeature) names.push(node.userData.parts6BentLiftarmFeature)
  })
  return names
}

test('bent liftarm visual owner preserves all connector, mechanics and physics metadata', () => {
  for (const id of IDS) {
    const part = findPart(id)
    assert.equal(snapshot(part), before.get(id), `${id} metadata changed`)
    assert.equal(part.physics?.colliderProfile?.version, 'parts-5-explicit-v1', `${id} keeps explicit collider`)
    assert.equal(part.visualQuality, 'parts-6-rounded-bent-liftarm-v6')
  }
})

test('bent liftarms expose real nominal bores and rounded molded contour metadata', () => {
  for (const id of IDS) {
    const part = findPart(id)
    const pinHoles = part.connectors.filter(item => item.type === 'pin-hole').length
    const object = part.create(part.defaultColor)
    assert.equal(object.userData.bentLiftarmFidelity.roundedOuterElbow, true)
    assert.equal(object.userData.bentLiftarmFidelity.roundedEndCaps, true)
    assert.equal(object.userData.bentLiftarmFidelity.truePinBores, pinHoles)
    const names = featureNames(object)
    assert.equal(names.filter(name => name === 'bent-liftarm-bore-liner').length, pinHoles)
    assert.equal(names.filter(name => name === 'bent-liftarm-counterbore').length, pinHoles * 2)
  }
})

test('bent liftarm decorative finish is excluded from physics bounds', () => {
  for (const id of IDS) {
    const object = findPart(id).create(findPart(id).defaultColor)
    let count = 0
    object.traverse(node => {
      if (!node.userData?.parts6BentLiftarmFeature) return
      count += 1
      assert.equal(node.userData.physicsIgnore, true, `${id}:${node.userData.parts6BentLiftarmFeature}`)
    })
    assert.ok(count > 0)
  }
})

test('bent liftarm source contains rounded elbow construction and never authors physics metadata', () => {
  assert.equal(module.PARTS6_BENT_LIFTARM_FIDELITY_VERSION, 'parts-6-bent-liftarm-fidelity-v6')
  assert.match(source, /quadraticCurveTo\(cornerX \+ half, minY - half, cornerX, minY - half\)/)
  assert.match(source, /pinCounterboreRadius/)
  assert.match(source, /physics: 'PARTS-5 explicit bent-liftarm collider profiles remain authoritative/)
  assert.doesNotMatch(source, /colliderProfile\s*:/)
  assert.doesNotMatch(source, /mechanics\s*:/)
  assert.doesNotMatch(source, /connectors\s*:/)
})

await dom.happyDOM.close()
