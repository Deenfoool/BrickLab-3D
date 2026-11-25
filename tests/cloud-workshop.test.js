import {test} from 'node:test'
import assert from 'node:assert/strict'
import {workshopSummary,sections} from '../src/menu/cloud-workshop.js'
import {modelPassport,challengeReadiness,challenges} from '../src/menu/workshop-model.js'
test('workshop metrics reflect actual server revisions, without fabricated experience',()=>{
 assert.deepEqual(workshopSummary([{},{}],[{revision:1},{revision:3}]),{local:2,cloud:2,revisions:4})
})
test('passport structural checks do not certify physics',()=>{
 const p=modelPassport({parts:[{id:'a',design:'3001'},{id:'b',design:'3001'}],connections:[{shaft:{part:'a',port:'s'},socket:{part:'b',port:'t'}}]})
 assert.equal(p.structure,true);assert.equal(p.parts,2);assert.equal(p.physics,'unverified');assert.equal(p.kinematics,'unverified')
 const broken=modelPassport({parts:[{id:'a',design:'3001'}],connections:[{shaft:{part:'a',port:'s'},socket:{part:'b',port:'t'}}]})
 assert.equal(broken.structure,false);assert.equal(broken.broken,1)
 assert.equal(challengeReadiness(challenges[0],{parts:[],connections:[]}).verified,false)
})


test('production workshop includes the dedicated public profile and omits experimental sections',()=>{
 assert.ok(!sections.some(([key])=>key==='passport'))
 assert.ok(!sections.some(([key])=>['challenges','diary'].includes(key)))
 assert.deepEqual(sections.map(([key])=>key),['workshop','cloud','publicProfile','achievements','rankings','bureau','favorites','notifications','storage','settings','security','cosmetics'])
 assert.equal(new Set(sections.map(([key])=>key)).size,12)
 assert.equal(typeof modelPassport,'function')
})
