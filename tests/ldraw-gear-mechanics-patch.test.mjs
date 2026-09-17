import assert from 'node:assert/strict'
import { gearMechanicsForLDrawDefinition } from '../ldraw/gear-mechanics-patch-v1.js'

const differential=gearMechanicsForLDrawDefinition({
  id:'ldraw-2d8da3a1',
  ldraw:{code:'62821',file:'62821.dat'},
  name:'Technic Differential with One Gear 28 Tooth Bevel',
})
assert.equal(differential?.teeth,28)
assert.equal(differential?.kind,'bevel')
assert.equal(differential?.pitchRadius,28/16)
assert.equal(differential?.differentialHousing,true)

const reinforced=gearMechanicsForLDrawDefinition({
  id:'ldraw-d4c9cb61',
  ldraw:{code:'18575',file:'18575.dat'},
  name:'Technic Gear 20 Tooth Double Bevel Reinforced',
})
assert.equal(reinforced?.teeth,20)
assert.equal(reinforced?.kind,'bevel')
assert.equal(reinforced?.pitchRadius,20/16)
assert.equal(reinforced?.doubleBevel,true)
assert.equal(reinforced?.reinforced,true)

const generic=gearMechanicsForLDrawDefinition({
  id:'ldraw-example',
  ldraw:{code:'example'},
  name:'Technic Gear 24 Tooth Double Bevel',
})
assert.equal(generic?.teeth,24)
assert.equal(generic?.kind,'bevel')

console.log('LDraw bevel gear mechanics patch regression: ok')
