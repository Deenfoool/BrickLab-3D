import test from 'node:test'
import assert from 'node:assert/strict'
import {registerHooks} from 'node:module'
import {matchCommands} from '../src/editor/command-palette.js'
import {instructionPdf} from '../src/editor/instruction-export.js'
import {normalizeSteps} from '../src/editor/instruction-steps.js'
import {readSceneLayers} from '../src/editor/scene-layers.js'
import {mergeShared,sharedDelta} from '../src/editor/shared-document.js'
const three=new URL('../vendor/three/build/three.module.min.js',import.meta.url).href
registerHooks({resolve(specifier,context,next){return next(specifier==='three'?three:specifier,context)}})
const {smartConnections}=await import('../src/editor/smart-connect.js')
const {createAssembly}=await import('../src/editor/model.js')
const {inventoryCsv,ldrawText}=await import('../src/editor/project-exports.js')
const part=(id,design,position=[0,0,0])=>({id,design,position,rotation:[0,0,0,1],color:'#aabbcc'})
test('command search combines labels, categories and keywords',()=>{
 const commands=[{label:'Power Flow',group:'Механика',keywords:'передача вращения'},{label:'Фото',group:'Студия'}]
 assert.deepEqual(matchCommands(commands,'механика вращения'),[commands[0]])
 assert.equal(matchCommands(commands,'нет').length,0)
})
test('instruction steps retain every part exactly once, remove deleted parts and share metadata',()=>{
 const parts=[part('a','3700'),part('b','3700'),part('c','3705')]
 const steps=normalizeSteps([{ids:['a','a','deleted'],note:'First',angle:'front'},{ids:['b','a'],angle:'bad'}],parts)
 assert.deepEqual(steps.map(s=>s.ids),[['a'],['b'],['c']])
 assert.equal(steps[0].note,'First');assert.equal(steps[1].angle,'iso')
 const doc={parts,connections:[],belts:[],gears:[]}
 assert.deepEqual(mergeShared(doc,sharedDelta(doc,{...doc,customInstructions:steps})).customInstructions,steps)
 assert.deepEqual(readSceneLayers({lockedPartIds:['a','a','missing']},new Set(['a','b'])).lockedPartIds,['a'])
})
test('Smart Connect validates axle/bush geometry without breaking an existing link',()=>{
 const moving=part('axle','3705',[100,0,0]),fixed=part('bush','3713'),all=[moving,fixed]
 const choices=smartConnections(moving,fixed,all,[])
 assert.ok(choices.length>0)
 for(const c of choices){const placed=[c.pose,fixed];assert.equal(createAssembly(placed,[c.link]).connections.length,1);assert.deepEqual(placed[1],fixed)}
 const best=choices[0];assert.deepEqual(smartConnections(best.pose,fixed,[best.pose,fixed],[best.link]),[])
})
test('project inventory groups identical parts and LDraw uses valid type 1 rows',()=>{
 const build={name:'Test',parts:[part('a','3700'),part('b','3700')]}
 assert.match(inventoryCsv(build,{}),/"3700","#aabbcc","2"/)
 const ldr=ldrawText(build,{});assert.equal(ldr.split('\r\n').filter(l=>l.startsWith('1 ')).length,2)
 assert.match(ldr,/1 0x2AABBCC .* 3700\.dat/)
})
test('PDF writer builds correct object offsets and page tree',async()=>{
 const jpeg=Uint8Array.from([255,216,255,217])
 const pdf=instructionPdf([{jpeg,width:1240,height:1754},{jpeg,width:1240,height:1754}])
 assert.equal(pdf.type,'application/pdf')
 const value=Buffer.from(await pdf.arrayBuffer()),ascii=value.toString('latin1')
 assert.ok(ascii.startsWith('%PDF-1.4'))
 assert.match(ascii,/\/Count 2/)
 const offset=Number(/startxref\n(\d+)/.exec(ascii)[1]);assert.equal(value.subarray(offset,offset+4).toString(),'xref')
 const lines=ascii.slice(offset).split('\n');for(let id=1;id<=8;id++){const start=Number(lines[id+2].slice(0,10));assert.equal(value.subarray(start,start+7).toString(),id+' 0 obj')}
 assert.throws(()=>instructionPdf([]),/invalid_pages/)
})
