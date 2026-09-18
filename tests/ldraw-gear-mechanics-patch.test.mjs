import assert from 'node:assert/strict'
import { technicMechanicalHintsV1 } from '../technic/mechanical-hints-v1.js'

const differential=technicMechanicalHintsV1({
  id:'ldraw-2d8da3a1',
  ldraw:{code:'62821',file:'62821.dat'},
  name:'Technic Differential with One Gear 28 Tooth Bevel',
}).mechanics.gear
assert.equal(differential?.teeth,28)
assert.equal(differential?.kind,'bevel')
assert.equal(differential?.pitchRadius,28/16)
assert.equal(differential?.differentialHousing,true)
assert.equal(differential?.authoritative,true)
assert.deepEqual(differential?.meshAnchorLdu,[0,0,27])
assert.deepEqual(differential?.meshAxisLdu,[0,0,1])
assert.deepEqual(differential?.bevelApexSigns,[-1])
assert.equal(differential?.meshApexToleranceStud,.16)
assert.equal(differential?.meshCaptureDistanceStud,1.15)

const reinforced=technicMechanicalHintsV1({
  id:'ldraw-d4c9cb61',
  ldraw:{code:'18575',file:'18575.dat'},
  name:'Technic Gear 20 Tooth Double Bevel Reinforced',
}).mechanics.gear
assert.equal(reinforced?.teeth,20)
assert.equal(reinforced?.kind,'bevel')
assert.equal(reinforced?.pitchRadius,20/16)
assert.equal(reinforced?.doubleBevel,true)
assert.equal(reinforced?.reinforced,true)
assert.equal(reinforced?.authoritative,true)
assert.deepEqual(reinforced?.meshAnchorLdu,[0,0,0])
assert.deepEqual(reinforced?.meshAxisLdu,[0,0,1])
assert.deepEqual(reinforced?.bevelApexSigns,[-1,1])
assert.equal(reinforced?.meshCaptureDistanceStud,1.15)

console.log('LDraw differential/bevel gear mechanics regression: ok')
