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
const part = findPart('suspension-arm-5')
const before = JSON.stringify({ connectors: part.connectors, mechanics: part.mechanics, physics: part.physics })
const source = await readFile(new URL('../parts6/suspension-arm-fidelity-v7.js', import.meta.url), 'utf8')
const module = await import('../parts6/suspension-arm-fidelity-v7.js')

function features(object) {
  const names = []
  object.traverse(node => {
    if (node.userData?.parts6SuspensionArmFeature) names.push(node.userData.parts6SuspensionArmFeature)
  })
  return names
}

test('suspension-arm fidelity preserves connector, mechanics and explicit physics proxy', () => {
  const current = findPart('suspension-arm-5')
  assert.equal(JSON.stringify({ connectors: current.connectors, mechanics: current.mechanics, physics: current.physics }), before)
  assert.equal(current.physics?.colliderProfile?.version, 'parts-5-explicit-v1')
  assert.equal(current.visualQuality, 'parts-6-tapered-suspension-arm-v7')
})

test('suspension arm uses a tapered bored control-arm silhouette', () => {
  const current = findPart('suspension-arm-5')
  const object = current.create(current.defaultColor)
  assert.equal(object.userData.suspensionArmFidelity.taperedWaist, true)
  assert.equal(object.userData.suspensionArmFidelity.pivotBoss, true)
  assert.equal(object.userData.suspensionArmFidelity.boredEyes, 4)
  assert.equal(object.userData.suspensionArmFidelity.facePockets, 3)
  assert.equal(object.userData.partId, 'suspension-arm-5')
})

test('suspension-arm holes and face finish are real visual features and stay collider-independent', () => {
  const object = findPart('suspension-arm-5').create(findPart('suspension-arm-5').defaultColor)
  const names = features(object)
  assert.equal(names.filter(name => name === 'suspension-arm-bore-liner').length, 4)
  assert.equal(names.filter(name => name === 'suspension-arm-counterbore').length, 8)
  assert.equal(names.filter(name => name === 'suspension-arm-face-pocket').length, 6)
  assert.equal(names.filter(name => name === 'suspension-pivot-retaining-washer').length, 2)
  object.traverse(node => {
    if (!node.userData?.parts6SuspensionArmFeature) return
    assert.equal(node.userData.physicsIgnore, true, node.userData.parts6SuspensionArmFeature)
  })
})

test('suspension-arm v7 is a visual owner only', () => {
  assert.equal(module.PARTS6_SUSPENSION_ARM_FIDELITY_VERSION, 'parts-6-suspension-arm-fidelity-v7')
  assert.match(source, /armOutline/)
  assert.match(source, /quadraticCurveTo/)
  assert.match(source, /tapered neck/i)
  assert.match(source, /PARTS-5 explicit suspension-arm compound collider/)
  assert.doesNotMatch(source, /colliderProfile\s*:/)
  assert.doesNotMatch(source, /mechanics\s*:/)
  assert.doesNotMatch(source, /connectors\s*:/)
})

await dom.happyDOM.close()
