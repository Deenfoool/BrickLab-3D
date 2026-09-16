import test from 'node:test'
import assert from 'node:assert/strict'
import { FAMILIES, classifyPart, libraryItems, filterLibrary, normalizeSearch, readPreference, writePreference } from '../ldraw/library-model-v1.js'

test('Seven families and real nested gear/wheel categories',()=>{
  assert.equal(FAMILIES.length,7)
  assert.equal(FAMILIES.find(f=>f.id==='technic').tree.find(n=>n.id==='gears').children.length,4)
  assert.equal(FAMILIES.find(f=>f.id==='technic').tree.find(n=>n.id==='pins').children.length,3)
})
for (const [description,family,category] of [
  ['Technic Axle 5','technic','axles/standard'],['Technic Brick 1 x 6','technic','bricks'],['Technic Gear 24 Tooth','technic','gears/spur'],['Technic Gear 12 Tooth Bevel','technic','gears/bevel'],['Tyre 30.4 x 14','technic','wheels/tires'],['Wheel Rim','technic','wheels/rims'],['Plate 2 x 4','system','plates'],['Duplo Train Wheel','duplo','vehicles'],['Train Track Straight','trains','tracks'],['Electric Technic Motor','power','motors'],['Bionicle Mask','bionicle','heads'],['Unidentified','other','unclassified'],
]) test(`Classifies ${description}`,()=>assert.deepEqual(classifyPart({description}),{family,category}))

for (const [description,sourceCategory,family,category] of [
  ['Minifig Hair with Pin','Minifig Headwear','system','minifig'],
  ['Plant Flower Stem with Pin','Plant','system','decorative'],
  ['Vehicle Mudguard 3 x 4 with Pin Holes','Vehicle','system','vehicles'],
  ['Technic Pin with Friction Ridges','Technic','technic','pins/friction'],
  ['Technic Pin without Friction','Technic','technic','pins/frictionless'],
  ['Technic Axle Pin 3L with Friction','Technic','technic','pins/axle'],
  ['Technic Axle 5 with Stop','Technic','technic','axles/stop'],
  ['Technic Axle Flexible 11','Technic','technic','axles/flexible'],
  ['Technic Liftarm Bent 3 x 5 L-Shape','Technic','technic','beams/angled'],
  ['Technic Frame 5 x 7','Technic','technic','frames'],
  ['Technic Panel Fairing #21','Technic','technic','panels'],
  ['Technic Axle Connector Angled #1','Technic','technic','connectors/angled'],
]) test(`Classifies ${description} without leaking unrelated pins`,()=>assert.deepEqual(classifyPart({description,category:sourceCategory}),{family,category}))

test('Search handles Russian, code, tooth counts and dimension separators',()=>{
  const items=libraryItems([{file:'32073.dat',code:'32073',description:'Technic Axle 5',category:'Technic'},{file:'3648.dat',code:'3648',description:'Technic Gear 24 Tooth',category:'Technic'},{file:'3020.dat',code:'3020',description:'Plate 2 x 4',category:'Plate'}],[])
  for (const query of ['ось 5','axle','32073','ldraw-32073.dat']) assert.equal(filterLibrary(items,{family:'technic',query})[0].code,'32073')
  assert.equal(filterLibrary(items,{family:'technic',query:'gear 24T'})[0].code,'3648')
  assert.equal(filterLibrary(items,{family:'system',query:'plate 2x4'})[0].code,'3020')
  assert.equal(normalizeSearch('пластина 2 × 4'),'plate 2x4')
})
test('Registered LDraw definitions are not duplicated; native parts remain available',()=>{
  const list=libraryItems([{file:'3001.dat',code:'3001',description:'Brick'}],[{id:'ldraw-3001',ldraw:{file:'3001.dat'}},{id:'axle-5',name:'Ось 5',category:'Technic'}])
  assert.equal(list.length,2); assert.equal(list[1].source,'BrickLab')
})
test('Sections and subtree filters preserve family boundaries and recent order',()=>{
  const items=libraryItems([{file:'8.dat',code:'8',description:'Technic Gear 8'},{file:'12.dat',code:'12',description:'Technic Gear 12 Bevel'},{file:'1.dat',code:'1',description:'Brick'}],[])
  assert.equal(filterLibrary(items,{family:'technic',category:'gears'}).length,2)
  assert.equal(filterLibrary(items,{family:'technic',category:'gears/bevel'}).length,1)
  for(const tab of ['favorites','project','compatible']) assert.equal(filterLibrary(items,{family:'technic',tab,[tab]:['ldraw-1','ldraw-8']}).length,1)
  assert.deepEqual(filterLibrary(items,{family:'technic',tab:'recent',recents:['ldraw-12','ldraw-8']}).map(x=>x.code),['12','8'])
})
test('An exact design ID is found across families while browsing Technic',()=>{
  const items=libraryItems([{file:'3024.dat',code:'3024',description:'Plate 1 x 1',category:'Plate'},{file:'32073.dat',code:'32073',description:'Technic Axle 5',category:'Technic'}],[])
  assert.deepEqual(filterLibrary(items,{family:'technic',query:'3024'}).map(item=>item.code),['3024'])
})
test('Storage corruption and disabled storage fail open',()=>{
  assert.equal(readPreference({getItem(){return '{'}},'key','system'),'system')
  assert.doesNotThrow(()=>writePreference({setItem(){throw Error('disabled')}},'key','technic'))
})
