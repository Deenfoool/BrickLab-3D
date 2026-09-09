import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Window } from 'happy-dom'

const dom = new Window()
for (const key of ['window', 'document', 'localStorage', 'CustomEvent', 'MutationObserver', 'CSS']) {
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
await import('../parts4/mechanical-driveline-v1.js')
await import('../parts4/steering-suspension-v1.js')
await import('../parts5/visual-overhaul-v1.js')
await import('../parts5/visual-refinement-v2.js')
await import('../parts5/driveline-refinement-v2.js')
await import('../parts5/structural-refinement-v2.js')
await import('../parts5/detail-refinement-v3.js')

const { PARTS, findPart } = await import('../parts.js')
const { buildColliderProfile, COLLIDER_PROFILE_VERSION } = await import('../collider-profiles-v3.js')

function finiteGeometry(object) {
  let meshes = 0
  let finite = true
  object.traverse(child => {
    if (!child.isMesh) return
    meshes += 1
    const position = child.geometry?.getAttribute?.('position')
    if (!position) {
      finite = false
      return
    }
    for (const value of position.array) {
      if (!Number.isFinite(value)) {
        finite = false
        break
      }
    }
  })
  return { meshes, finite }
}

const expectedQuality = new Map([
  ['beam-l-3x3', 'parts-5-continuous-bent-liftarm-v3'],
  ['beam-angle-4x2', 'parts-5-continuous-bent-liftarm-v3'],
  ['pin', 'parts-5-molded-friction-pin-v3'],
  ['pin-half', 'parts-5-molded-friction-pin-v3'],
  ['pin-long', 'parts-5-molded-friction-pin-v3'],
  ['pin-frictionless', 'parts-5-smooth-hinge-pin-v3'],
  ['axle-pin', 'parts-5-hybrid-axle-pin-v3'],
  ['connector-triple', 'parts-5-true-hole-triple-v3'],
  ['connector-perpendicular', 'parts-5-orthogonal-boss-v3'],
  ['connector-angle', 'parts-5-angle-boss-v3'],
  ['bearing-block', 'parts-5-open-bearing-block-v3'],
  ['suspension-arm-5', 'parts-5-forged-suspension-arm-v3'],
  ['motor', 'parts-5-motor-shell-v3'],
  ['gearbox-fnr', 'parts-5-gearbox-shell-v3'],
  ['open-differential', 'parts-5-differential-carrier-v3'],
])

test('detail refinement installs finite high-detail factories', () => {
  for (const [id, quality] of expectedQuality) {
    const part = findPart(id)
    assert.ok(part, `${id} exists`)
    assert.equal(part.visualQuality, quality, `${id} has final PARTS-5 quality marker`)
    const object = part.create(part.defaultColor)
    const result = finiteGeometry(object)
    assert.equal(result.finite, true, `${id} geometry is finite`)
    assert.ok(result.meshes >= 1, `${id} creates visible meshes`)
  }
})

test('connector identity is preserved for representative refined parts', () => {
  assert.deepEqual(
    findPart('connector-perpendicular').connectors.map(({ id, type }) => [id, type]),
    [['axle-left', 'axle-hole'], ['axle-right', 'axle-hole'], ['pin-hole', 'pin-hole']],
  )
  assert.deepEqual(
    findPart('connector-angle').connectors.map(({ id, type }) => [id, type]),
    [['hole-a', 'pin-hole'], ['hole-b', 'pin-hole']],
  )
  assert.deepEqual(
    findPart('axle-pin').connectors.map(({ id, type }) => [id, type]),
    [['pin', 'pin'], ['axle', 'axle']],
  )
  assert.deepEqual(
    findPart('open-differential').connectors.slice(0, 3).map(({ id, type }) => [id, type]),
    [['input', 'axle-hole'], ['left', 'axle-hole'], ['right', 'axle-hole']],
  )
})

test('complex visual parts use explicit visual-independent collider profiles', () => {
  assert.equal(COLLIDER_PROFILE_VERSION, 'collider-profiles-v4')
  for (const id of [
    'beam-l-3x3', 'beam-angle-4x2', 'pin', 'axle-pin',
    'connector-perpendicular', 'connector-angle', 'bearing-block',
    'suspension-arm-5', 'motor', 'gearbox-fnr', 'open-differential',
  ]) {
    const part = findPart(id)
    assert.ok(part.physics?.colliderProfile?.specs?.length, `${id} stores an explicit collider profile`)
    const profile = buildColliderProfile(part.create(part.defaultColor), part)
    assert.equal(profile.kind, 'explicit', `${id} no longer derives physics from rendered bounds`)
    assert.ok(profile.specs.every(spec => Number.isFinite(spec.volume) && spec.volume > 0), `${id} collider volumes are valid`)
  }
})

test('bent beam collider follows both arms instead of one giant visual bounds box', () => {
  for (const id of ['beam-l-3x3', 'beam-angle-4x2']) {
    const part = findPart(id)
    const profile = buildColliderProfile(part.create(part.defaultColor), part)
    assert.equal(profile.kind, 'explicit')
    assert.ok(profile.specs.length >= 2)
    assert.ok(profile.specs.every(spec => spec.type === 'box'))
    const maxArea = Math.max(...profile.specs.map(spec => spec.size.x * spec.size.y))
    assert.ok(maxArea < 4.2, `${id} avoids a solid rectangular collider across the empty inside corner`)
  }
})

assert.equal(new Set(PARTS.map(part => part.id)).size, PARTS.length, 'detail refinement does not duplicate catalog ids')
await dom.happyDOM.close()
