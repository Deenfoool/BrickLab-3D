import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Window } from 'happy-dom'
import * as THREE from 'three'

const dom = new Window()
for (const key of ['window', 'document', 'localStorage', 'CustomEvent', 'MutationObserver', 'CSS']) {
  globalThis[key] = key === 'window' ? dom : dom[key]
}
globalThis.requestAnimationFrame = callback => { callback(0); return 0 }

await import('../technic-parts-pack-v2.js')
await import('../parts3/mechanical-parts-pack-v3.js')
await import('../parts3/parts-3-extra-v1.js')
await import('../parts3/parts-3-wheel-dimensions.js')
await import('../parts4/mechanical-driveline-v1.js')
await import('../parts5/visual-overhaul-v1.js')

const { findPart } = await import('../parts.js')
const { findSnapCandidate, applySnap, connectorWorldPosition } = await import('../snapping-v3.js')
const { isEndpointOccupied } = await import('../connections-v3.js')
const { evaluateSpurMesh } = await import('../parts5/gear-mesh-math-v1.js')

function makeGear(partId, instanceId) {
  const part = findPart(partId)
  const object = part.create(part.defaultColor)
  object.userData.partId = partId
  object.userData.instanceId = instanceId
  return object
}

function descriptor(object) {
  const part = findPart(object.userData.partId)
  const connector = part.connectors.find(item => item.type === 'axle-hole')
  return {
    center: connectorWorldPosition(object, connector),
    axis: new THREE.Vector3(...connector.axis).applyQuaternion(object.getWorldQuaternion(new THREE.Quaternion())).normalize(),
    pitchRadius: part.mechanics.gear.pitchRadius,
  }
}

test('12T dragged near 20T gets exact placement snap and no persistent connector occupancy', () => {
  const fixed = makeGear('gear-20', 'fixed-20')
  const moving = makeGear('gear-12', 'moving-12')
  fixed.position.set(0, 0, 0)
  moving.position.set(2.18, 0.04, 0.04)
  fixed.updateMatrixWorld(true)
  moving.updateMatrixWorld(true)

  const candidate = findSnapCandidate(moving, [fixed, moving], { isAvailable: () => true })
  assert.ok(candidate)
  assert.equal(candidate.kind, 'gear-mesh')
  assert.equal(candidate.placementOnly, true)
  assert.equal(candidate.movingGear.teeth, 12)
  assert.equal(candidate.fixedGear.teeth, 20)

  applySnap(moving, candidate)
  moving.updateMatrixWorld(true)
  const result = evaluateSpurMesh(descriptor(moving), descriptor(fixed), {
    minAlignment: 0.999999,
    axialTolerance: 1e-8,
    distanceTolerance: 1e-8,
  })
  assert.equal(result.valid, true)
  assert.ok(result.distanceError < 1e-8)
  assert.ok(result.axialOffset < 1e-8)

  // The app checks endpoint occupancy before creating a connector. The placement
  // layer vetoes exactly that one call, then leaves the endpoint free because
  // a gear mesh is not a connector or a Rapier joint.
  assert.equal(isEndpointOccupied([], moving.userData.instanceId, candidate.source.id), true)
  assert.equal(isEndpointOccupied([], moving.userData.instanceId, candidate.source.id), false)
})

await dom.happyDOM.close()
