import test from 'node:test'
import assert from 'node:assert/strict'
import {
  classifyLDrawDefinition,
  getLDrawMechanicalOverride,
  ldrawMechanicalCoverage,
  registerLDrawMechanicalOverride,
  syncLDrawMechanicalDefinition,
} from '../ldraw/mechanical-intelligence-v1.js'

const fake = (code, description, category = '', connectors = []) => ({
  id:`ldraw-${code}`,
  name:description,
  description,
  category,
  ldraw:{ code, file:`${code}.dat`, level:connectors.length ? 'snap' : 'visual' },
  connectors,
  create(){},
})

test('curated IDs classify as verified even before full LDraw metadata loads', () => {
  const axle = classifyLDrawDefinition(fake('3708', 'LDraw 3708'))
  assert.equal(axle.class, 'axle')
  assert.equal(axle.confidence, 'verified')
  assert.equal(axle.source, 'bricklab-registry-v1')
  assert.equal(axle.properties.lengthL, 12)
})

test('metadata inference covers target mechanical families without inventing physics', () => {
  assert.equal(classifyLDrawDefinition(fake('x1', 'Tyre 81.6 x 44 R', 'Tyre')).class, 'tire')
  assert.equal(classifyLDrawDefinition(fake('x2', 'Wheel 43.2 x 26 Technic', 'Wheel')).class, 'rim')
  assert.equal(classifyLDrawDefinition(fake('x3', 'Technic Universal Joint 3L')).class, 'universal-joint')
  assert.equal(classifyLDrawDefinition(fake('x4', 'Technic Shock Absorber 9.5L')).class, 'shock-absorber')
  assert.equal(classifyLDrawDefinition(fake('x5', 'Technic Steering Hub')).class, 'steering-hub')
  assert.equal(classifyLDrawDefinition(fake('x6', 'Technic Suspension Arm')).class, 'suspension-arm')
  assert.equal(classifyLDrawDefinition(fake('x7', 'Technic Differential Housing')).class, 'differential-like')
  assert.equal(classifyLDrawDefinition(fake('x8', 'Technic Gearbox Housing')).class, 'gearbox-like')
  assert.equal(classifyLDrawDefinition(fake('x9', 'Electric Motor 9V', 'Electric')).class, 'power-unit')
  assert.equal(classifyLDrawDefinition(fake('x10', 'Technic Gear Rack 1 x 10')).class, 'rack')
})

test('spur/bevel/axle inference exposes class evidence while unknown parts stay unknown', () => {
  const spur = classifyLDrawDefinition(fake('g1', 'Technic Gear 24 Tooth', 'Technic'))
  assert.equal(spur.class, 'spur-gear')
  assert.equal(spur.confidence, 'inferred')
  assert.equal(spur.properties.toothCount, 24)
  assert.equal(spur.properties.pitchStuds, 1.5)

  const bevel = classifyLDrawDefinition(fake('g2', 'Technic Bevel Gear 12 Tooth'))
  assert.equal(bevel.class, 'bevel-gear')
  assert.equal(bevel.properties.toothCount, 12)

  const axle = classifyLDrawDefinition(fake('a1', 'Technic Axle 7L'))
  assert.equal(axle.class, 'axle')
  assert.equal(axle.properties.lengthL, 7)

  const brick = classifyLDrawDefinition(fake('3001', 'Brick 2 x 4', 'Brick'))
  assert.equal(brick.class, 'unknown')
  assert.equal(brick.confidence, 'unknown')
  assert.equal(brick.source, 'none')
})

test('sync adds classification metadata but does not invent unsupported physics behavior', () => {
  const diff = fake('custom-diff', 'Technic Differential 3 x 5')
  syncLDrawMechanicalDefinition(diff)
  assert.equal(diff.mechanics.classification.class, 'differential-like')
  assert.equal(diff.mechanics.differential, undefined)
  assert.equal(diff.mechanics.motor, undefined)

  const axle = fake('custom-axle', 'Technic Axle 5L')
  syncLDrawMechanicalDefinition(axle)
  assert.equal(axle.mechanics.shaft, true)

  const unknown = fake('custom-brick', 'Brick 2 x 4', 'Brick')
  syncLDrawMechanicalDefinition(unknown)
  assert.equal(unknown.mechanics, undefined)
})

test('runtime registry override is explicit and verified', () => {
  registerLDrawMechanicalOverride('zz-test-wheel', { class:'wheel-assembly', properties:{ note:'fixture' }, evidence:['unit-test'] })
  const override = getLDrawMechanicalOverride('zz-test-wheel.dat')
  assert.equal(override.class, 'wheel-assembly')
  assert.equal(override.source, 'bricklab-runtime-override')
  const classified = classifyLDrawDefinition(fake('zz-test-wheel', 'Opaque custom part'))
  assert.equal(classified.confidence, 'verified')
  assert.deepEqual(classified.properties, { note:'fixture' })
})

test('coverage reports the visual/snap/mechanical capability ladder and confidence', () => {
  const visual = fake('u1', 'Brick 2 x 4', 'Brick')
  const snap = fake('u2', 'Plate 2 x 4', 'Plate', [{ type:'stud' }])
  const mechanical = fake('3708', 'LDraw 3708', '', [{ type:'axle' }])
  syncLDrawMechanicalDefinition(visual)
  syncLDrawMechanicalDefinition(snap)
  syncLDrawMechanicalDefinition(mechanical)

  const report = ldrawMechanicalCoverage([visual, snap, mechanical, { id:'native-part', create(){} }])
  assert.equal(report.total, 3)
  assert.deepEqual(report.capabilities, { visual:3, snap:2, mechanical:1 })
  assert.equal(report.confidence.verified, 1)
  assert.equal(report.confidence.unknown, 2)
  assert.equal(report.classes.axle, 1)
})

test('LDraw bootstrap installs intelligence before registering persisted dynamic definitions', async () => {
  const { readFile } = await import('node:fs/promises')
  const source = await readFile(new URL('../ldraw/bootstrap-v1.js', import.meta.url), 'utf8')
  const install = source.indexOf('installLDrawMechanicalIntelligence(PARTS)')
  const persisted = source.lastIndexOf('registerPersistedLDrawParts()')
  assert.ok(install >= 0, 'mechanical intelligence is installed by the LDraw bootstrap')
  assert.ok(persisted > install, 'persisted LDraw definitions are registered only after the classifier is active')
})
