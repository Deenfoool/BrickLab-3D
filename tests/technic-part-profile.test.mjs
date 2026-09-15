import test from 'node:test'
import assert from 'node:assert/strict'
import { technicPartProfileV1 } from '../technic/part-profile-v1.js'

test('Verified Technic ids expose trusted gear, axle and retainer properties', () => {
  assert.deepEqual(
    { role:technicPartProfileV1({ id:'ldraw-3648' }).role, teeth:technicPartProfileV1({ id:'ldraw-3648' }).toothCount },
    { role:'spur-gear', teeth:24 },
  )
  assert.equal(technicPartProfileV1({ id:'ldraw-3707' }).lengthL, 8)
  assert.equal(technicPartProfileV1({ id:'ldraw-3713' }).retainer, true)
})

test('Metadata classification adds semantics without inventing unknown dimensions', () => {
  const rack = technicPartProfileV1({ id:'ldraw-x', name:'Technic Gear Rack 1 x 10' })
  const beam = technicPartProfileV1({ id:'ldraw-y', name:'Technic Liftarm Beam 1 x 7' })
  assert.equal(rack.role, 'rack')
  assert.equal(rack.transmission, true)
  assert.equal(rack.toothCount, null)
  assert.equal(beam.role, 'beam')
  assert.equal(beam.structural, true)
})
