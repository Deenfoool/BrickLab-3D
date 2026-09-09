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

const { findPart } = await import('../parts.js')

const protectedIds = [
  'wheel-small', 'wheel-narrow', 'wheel-road', 'wheel-medium', 'wheel', 'wheel-offroad-large', 'wheel-tractor',
  'bevel-gear-12', 'bevel-gear-20',
  'gearbox-fnr', 'open-differential', 'universal-joint-30', 'cv-joint-30', 'worm-drive-8',
  'rpm-sensor', 'torque-sensor', 'bearing-block', 'steering-base', 'steering-tie-rod-5',
  'shock-body-5', 'shock-rod-5', 'connector-triple', 'suspension-arm-5',
  'connector-angle', 'connector-perpendicular', 'motor', 'wheel-hub', 'steering-knuckle', 'axle-pin',
]

const metadataBefore = new Map(protectedIds.map(id => {
  const part = findPart(id)
  return [id, JSON.stringify({ connectors: part?.connectors ?? null, mechanics: part?.mechanics ?? null })]
}))

await import('../parts6/interface-fit-refinement-v2.js')
await import('../parts6/interface-physics-safety-v1.js')

function featureNodes(object, feature = null) {
  const nodes = []
  object.traverse(child => {
    const value = child.userData?.parts6InterfaceFeature
    if (value && (!feature || value === feature)) nodes.push(child)
  })
  return nodes
}

function finiteGeometry(object) {
  let meshes = 0
  let finite = true
  object.traverse(child => {
    if (!child.isMesh) return
    meshes += 1
    const position = child.geometry?.getAttribute?.('position')
    if (!position) { finite = false; return }
    for (const value of position.array) {
      if (!Number.isFinite(value)) { finite = false; break }
    }
  })
  return { meshes, finite }
}

test('interface-fit pass preserves connector and mechanics metadata byte-for-byte', () => {
  for (const id of protectedIds) {
    const part = findPart(id)
    assert.ok(part, `${id} exists`)
    assert.equal(
      JSON.stringify({ connectors: part.connectors, mechanics: part.mechanics }),
      metadataBefore.get(id),
      `${id} connector/mechanics metadata unchanged`,
    )
  }
})

test('all wheel families expose the same nominal cross axle opening on both rim faces', () => {
  for (const id of ['wheel-small', 'wheel-narrow', 'wheel-road', 'wheel-medium', 'wheel', 'wheel-offroad-large', 'wheel-tractor']) {
    const part = findPart(id)
    assert.match(part.interfaceFidelity, /parts-6-interface-fit-refinement-v2/)
    const object = part.create(part.defaultColor)
    const faces = featureNodes(object, 'axle-socket-face')
    const bosses = featureNodes(object, 'axle-socket-boss')
    assert.ok(faces.length >= 2, `${id} has two keyed axle faces`)
    assert.ok(bosses.length >= 2, `${id} has two keyed axle bosses`)
    assert.equal(finiteGeometry(object).finite, true)
  }
})

test('gearbox, differential and articulated driveline ports are derived from axle-hole connectors', () => {
  for (const [id, minFaces] of [
    ['gearbox-fnr', 2],
    ['open-differential', 3],
    ['universal-joint-30', 2],
    ['cv-joint-30', 2],
    ['worm-drive-8', 2],
  ]) {
    const part = findPart(id)
    const expectedPorts = part.connectors.filter(connector => connector.type === 'axle-hole').length
    const object = part.create(part.defaultColor)
    assert.equal(expectedPorts, minFaces, `${id} expected axle-hole count`)
    assert.ok(featureNodes(object, 'axle-socket-face').length >= minFaces, `${id} visible keyed ports`)
    assert.equal(finiteGeometry(object).finite, true)
  }
})

test('pin-hole families receive nominal counterbore finishes without becoming fake connectors', () => {
  for (const id of ['bearing-block', 'steering-base', 'steering-tie-rod-5', 'shock-body-5', 'shock-rod-5', 'connector-triple', 'suspension-arm-5']) {
    const part = findPart(id)
    const pinHoles = part.connectors.filter(connector => connector.type === 'pin-hole').length
    const object = part.create(part.defaultColor)
    assert.ok(featureNodes(object, 'pin-hole-counterbore').length >= pinHoles, `${id} counterbore finish follows pin-hole metadata`)
  }
})

test('solid axle and pin connector semantics are visible on motor, hub, knuckle and axle-pin', () => {
  const expectations = [
    ['motor', 'nominal-cross-axle-stub', 1],
    ['wheel-hub', 'nominal-cross-axle-stub', 2],
    ['steering-knuckle', 'nominal-pin-stub', 1],
    ['axle-pin', 'nominal-cross-axle-stub', 1],
    ['axle-pin', 'nominal-pin-stub', 1],
  ]
  for (const [id, feature, count] of expectations) {
    const part = findPart(id)
    const object = part.create(part.defaultColor)
    assert.ok(featureNodes(object, feature).length >= count, `${id} exposes ${feature}`)
  }
})

test('every interface-detail mesh is excluded from bounds-derived colliders', () => {
  for (const id of protectedIds) {
    const part = findPart(id)
    const object = part.create(part.defaultColor)
    let interfaceMeshes = 0
    let unsafe = 0
    function walk(node, inherited = false) {
      const active = inherited || Boolean(node.userData?.parts6InterfaceFeature)
      if (active && node.isMesh) {
        interfaceMeshes += 1
        if (!node.userData.physicsIgnore) unsafe += 1
      }
      for (const child of node.children ?? []) walk(child, active)
    }
    walk(object)
    assert.ok(interfaceMeshes > 0, `${id} has interface detail meshes`)
    assert.equal(unsafe, 0, `${id} interface details cannot change collider bounds`)
  }
})

test('nominal dimensions are shared by fit pass diagnostics', () => {
  const fit = globalThis.BrickLabParts6InterfaceFit
  assert.ok(fit)
  assert.equal(fit.nominal.pinHoleDiameterStud, 0.6)
  assert.ok(fit.nominal.axleTipWidthStud > 0.58 && fit.nominal.axleTipWidthStud < 0.61)
  assert.ok(fit.nominal.pinBodyDiameterStud > 0.57 && fit.nominal.pinBodyDiameterStud < 0.60)
  assert.equal(globalThis.BrickLabParts6InterfacePhysicsSafety?.protectedParts.length > 0, true)
})

await dom.happyDOM.close()
