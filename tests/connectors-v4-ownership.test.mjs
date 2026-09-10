import test from 'node:test'
import assert from 'node:assert/strict'
import { Window } from 'happy-dom'

const dom = new Window()
for (const key of ['window','document','localStorage','CustomEvent','MutationObserver','CSS','HTMLElement','Storage']) {
  globalThis[key] = key === 'window' ? dom : dom[key]
}
globalThis.requestAnimationFrame = () => 0

// Guard installation itself does not need a live V4 graph. The runtime object only
// supplies the expected active-mode contract if PhysicsSession.create is invoked.
globalThis.BrickLabConnectorV4 = Object.freeze({
  mode:'hybrid-pilot',
  selfTest:{pass:true},
  projectConnections(){ return [] },
})

const { PhysicsSession } = await import('../physics.js')
const guard = await import('../connectors-v4/physics-guard-v4.js')
const ownership = await import('../physics-ownership-v1.js')

test('Connector V4 guard owns the final PhysicsSession.create entrypoint', () => {
  assert.equal(PhysicsSession.create.__bricklabOwner, guard.PHYSICS_GUARD_VERSION_V4)
  assert.equal(globalThis.BrickLabConnectorV4PhysicsGuard.createOwner, guard.PHYSICS_GUARD_VERSION_V4)
  const snapshot = ownership.getPhysicsOwnershipSnapshot()
  assert.equal(snapshot.create.owner, guard.PHYSICS_GUARD_VERSION_V4)
  assert.equal(snapshot.create.expected, guard.PHYSICS_GUARD_VERSION_V4)
})

test('physics ownership contract detects a later replacement of the guarded create entrypoint', () => {
  const guarded = PhysicsSession.create
  const replacement = async function unsafeReplacement() { return null }
  PhysicsSession.create = replacement
  assert.throws(() => ownership.assertPhysicsRuntimeContract(), /create owner/)
  PhysicsSession.create = guarded
})
