import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Window } from 'happy-dom'

const dom = new Window()
for (const key of ['window', 'document', 'localStorage', 'CustomEvent', 'MutationObserver', 'CSS', 'Event']) {
  globalThis[key] = key === 'window' ? dom : dom[key]
}
globalThis.requestAnimationFrame = callback => { callback(0); return 0 }

await import('../basic-parts-pack.js')
await import('../technic-parts-pack-v2.js')
await import('../parts5/detail-refinement-v3.js')
await import('../parts6/interface-fit-refinement-v2.js')
await import('../parts6/interface-physics-safety-v1.js')
const safety = await import('../collider-hole-clearance.js')
const { findPart } = await import('../parts.js')

function pointInsideBox(point, spec, eps = 1e-9) {
  if (spec?.type !== 'box') return false
  return point.every((value, index) => Math.abs(value - spec.center[index]) < spec.size[index] / 2 - eps)
}

function corridorSamples(connector, radius = 0.30) {
  const axis = connector.axis.map(Math.abs)
  const axisIndex = axis.indexOf(Math.max(...axis))
  const plane = [0, 1, 2].filter(index => index !== axisIndex)
  const base = [...connector.position]
  const samples = [base]
  for (const planeIndex of plane) {
    for (const sign of [-1, 1]) {
      const point = [...base]
      point[planeIndex] += sign * radius
      samples.push(point)
    }
  }
  return samples
}

test('legacy PARTS-5 explicit hole boxes are carved to current Technic clearance', () => {
  const staleTopRail = { type:'box', center:[0, .81, 0], size:[3, .16, .72] }
  const hole = { position:[0, .45, 0], axis:'z' }
  const carved = safety.carveExplicitBoxAroundPinHole(staleTopRail, hole)

  assert.equal(safety.TECHNIC_COLLIDER_HOLE_CLEARANCE_STUD, .3125)
  assert.ok(carved.length >= 1)
  assert.equal(carved.some(spec => pointInsideBox([0, .75, 0], spec)), false,
    'a point 0.30 stud from the bore centre stays inside the physical opening')
})

test('both built-in bent liftarms keep every pin-hole corridor physically empty', () => {
  for (const id of ['beam-l-3x3', 'beam-angle-4x2']) {
    const part = findPart(id)
    assert.ok(part, `${id} exists`)
    const before=JSON.stringify(part.physics)
    const profile=safety.explicitPinHoleClearanceProfile(part)
    assert.equal(profile.version, 'parts-6-explicit-hole-clearance-v1')
    assert.equal(profile.sourceVersion, 'parts-5-explicit-v1')
    assert.equal(profile.holeClearanceStud, .3125)
    assert.equal(JSON.stringify(part.physics),before,'physical profile derivation must not mutate catalog metadata')

    const specs = profile.specs
    const holes = part.connectors.filter(connector => connector.type === 'pin-hole')
    assert.ok(holes.length >= 5, `${id} exposes its real pin-hole set`)

    for (const connector of holes) {
      for (const point of corridorSamples(connector)) {
        assert.equal(
          specs.some(spec => pointInsideBox(point, spec)),
          false,
          `${id}:${connector.id} leaves the 0.30-stud pin corridor empty`,
        )
      }
    }
  }
})

test('visual safety remains read-only while the collider layer supplies clearance', () => {
  const diagnostics = globalThis.BrickLabParts6InterfacePhysicsSafety
  assert.equal(diagnostics?.version, 'parts-6-interface-physics-safety-v3')
  assert.equal(diagnostics?.hardenedColliderParts,undefined)
  for(const id of ['beam-l-3x3','beam-angle-4x2']){
    assert.equal(findPart(id).physics.colliderProfile.version,'parts-5-explicit-v1')
  }
  assert.equal(diagnostics?.technicHoleClearanceStud, .3125)
})

await dom.happyDOM.close()
