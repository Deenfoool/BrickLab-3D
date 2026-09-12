import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  PIN_EXACT_MATE_SCORE_BONUS_V4,
  PIN_FALLBACK_MATE_SCORE_BONUS_V4,
  applyPinMateScoreBonusV4,
  pinMatePreferenceV4,
} from '../connectors-v4/pin-ranking-v4.js'

const activation=(sourceRole,targetRole,overrides={})=>({
  active:true,
  family:'technic-pin-hole',
  sourceRole,
  targetRole,
  ...overrides,
})

test('pin ranking prefers a profile-verified Technic pin receiver over a generic round fallback',()=>{
  const exact=pinMatePreferenceV4(activation('technic-pin','technic-pin-hole'))
  const fallback=pinMatePreferenceV4(activation('technic-pin','technic-round-hole'))
  assert.equal(exact.kind,'exact-pin-hole')
  assert.equal(exact.tier,2)
  assert.equal(fallback.kind,'compatible-round-hole')
  assert.equal(fallback.tier,1)
  assert.equal(exact.scoreBonus,PIN_EXACT_MATE_SCORE_BONUS_V4)
  assert.equal(fallback.scoreBonus,PIN_FALLBACK_MATE_SCORE_BONUS_V4)
  assert.ok(exact.scoreBonus>fallback.scoreBonus)
})

test('pin ranking is direction-independent and bounded so geometry still dominates distant alternatives',()=>{
  const forward=pinMatePreferenceV4(activation('technic-pin','technic-pin-hole'))
  const reverse=pinMatePreferenceV4(activation('technic-pin-hole','technic-pin'))
  assert.deepEqual(reverse,forward)
  assert.ok(PIN_EXACT_MATE_SCORE_BONUS_V4<0.2)
  assert.ok(PIN_EXACT_MATE_SCORE_BONUS_V4-PIN_FALLBACK_MATE_SCORE_BONUS_V4<0.15)
  assert.equal(applyPinMateScoreBonusV4(0.5,forward),0.5-PIN_EXACT_MATE_SCORE_BONUS_V4)
})

test('non-pin activations receive no ranking advantage',()=>{
  for (const sample of [
    activation('technic-axle','technic-pin-hole',{family:'technic-axle-round-hole'}),
    activation('stud','anti-stud',{family:'stud-anti-stud'}),
    activation('technic-pin','technic-pin-hole',{active:false}),
    null,
  ]) {
    const preference=pinMatePreferenceV4(sample)
    assert.equal(preference.tier,0)
    assert.equal(preference.scoreBonus,0)
    assert.equal(applyPinMateScoreBonusV4(0.5,preference),0.5)
  }
})

test('candidate search consumes the semantic pin-mate bonus without replacing geometric scoring',async()=>{
  const source=await readFile(new URL('../connectors-v4/candidate-v4.js',import.meta.url),'utf8')
  assert.match(source,/candidate-search-v4\.7\.0/)
  assert.match(source,/pinMatePreferenceV4\(activationPreview\)/)
  assert.match(source,/pinMateBonus:candidate\.pinMatePreference\?\.scoreBonus/)
  assert.match(source,/applyPinMateScoreBonusV4\(score,\{ scoreBonus:pinMateBonus \}\)/)
  assert.match(source,/distanceScore=distance\/Math\.max\(captureDistance,1e-6\)/)
})

test('production import map cache-bumps the pin-aware candidate search',async()=>{
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8')
  const needle='"./connectors-v4/candidate-v4.js": "./connectors-v4/candidate-v4.js?v=connector-pin-ranking-20260912-v1"'
  assert.equal(html.split(needle).length-1,1)
})
