import test from 'node:test'
import assert from 'node:assert/strict'
import {
  SMART_ASSEMBLY_COMPATIBILITY_VERSION,
  smartAssemblyRole,
  smartAssemblyFamilyFor,
  compatibleAssemblyChoices,
} from '../guidance/assembly-compatibility-v1.js'

test('curated tire/rim ids work before Mechanical Intelligence hydration', () => {
  const tire = {
    id:'ldraw-6578',
    ldraw:{ code:'6578', file:'6578.dat' },
    mechanicalIntelligence:{ class:'unknown', confidence:'unknown', source:'none', properties:{} },
  }
  assert.match(SMART_ASSEMBLY_COMPATIBILITY_VERSION, /^smart-assembly-compatibility-v1\./)
  assert.equal(smartAssemblyRole(tire), 'tire')
  assert.equal(smartAssemblyFamilyFor(tire)?.id, 'tire-rim-30.4x14')
  const choices = compatibleAssemblyChoices(tire, [tire])
  assert.equal(choices.length, 1)
  assert.equal(choices[0].targetCode, '2994')
  assert.equal(choices[0].confidence, 'verified')
})

test('uncurated unknown ids stay unknown', () => {
  const unknown = {
    id:'ldraw-not-curated',
    name:'Tyre looking thing',
    ldraw:{ code:'not-curated' },
    mechanicalIntelligence:{ class:'unknown', confidence:'unknown', source:'none', properties:{} },
  }
  assert.equal(smartAssemblyRole(unknown), null)
  assert.deepEqual(compatibleAssemblyChoices(unknown, []), [])
})
