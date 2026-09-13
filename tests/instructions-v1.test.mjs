import test from 'node:test'
import assert from 'node:assert/strict'
import { buildBom, bomToCsv, buildInstructionPlan, normalizeInstructionProject } from '../instructions/core-v1.js'
import { buildJpegPdf } from '../instructions/pdf-binary-v1.js'

const defs={
  'beam-5':{id:'beam-5',name:'Beam 5',category:'Beams',connectors:[{id:'h0',axis:[0,0,1]}]},
  'axle-5':{id:'axle-5',name:'Axle 5',category:'Axles',mechanics:{shaft:true},connectors:[{id:'a0',axis:[1,0,0]}]},
  'ldraw-3001':{id:'ldraw-3001',name:'Brick 2 x 4',category:'Brick',ldraw:{code:'3001'},connectors:[{id:'stud',axis:[0,1,0]}]},
}
const def=id=>defs[id]??null
const project={name:'Rig',parts:[
  {instanceId:'base',partId:'beam-5',color:1,position:[0,0,0],rotation:[0,0,0]},
  {instanceId:'axle',partId:'axle-5',color:2,position:[0,1,0],rotation:[0,0,0]},
  {instanceId:'brick-l',partId:'ldraw-3001',color:3,position:[-2,2,0],rotation:[0,0,0]},
  {instanceId:'brick-r',partId:'ldraw-3001',color:3,position:[2,2,0],rotation:[0,0,0]},
],connectionsV4:[
  {id:'c1',a:{instanceId:'base',connectorId:'h0'},b:{instanceId:'axle',connectorId:'a0'}},
  {id:'c2',a:{instanceId:'axle',connectorId:'a0'},b:{instanceId:'brick-l',connectorId:'stud'}},
  {id:'c3',a:{instanceId:'axle',connectorId:'a0'},b:{instanceId:'brick-r',connectorId:'stud'}},
]}

test('BOM groups by design id and color',()=>{const bom=buildBom(project,def);const ldraw=bom.find(row=>row.designId==='3001');assert.equal(ldraw.quantity,2);assert.equal(ldraw.source,'LDraw');assert.match(bomToCsv(bom),/3001/)})
test('project prefers V4 connection graph',()=>{const n=normalizeInstructionProject({...project,connections:[{id:'legacy',a:{instanceId:'base'},b:{instanceId:'brick-l'}}]});assert.equal(n.connections.length,3);assert.equal(n.connections[0].id,'c1')})
test('instruction order is deterministic',()=>{const a=buildInstructionPlan(project,def),b=buildInstructionPlan({...project,parts:[...project.parts].reverse(),connectionsV4:[...project.connectionsV4].reverse()},def);assert.deepEqual(a.steps.map(s=>s.instanceIds),b.steps.map(s=>s.instanceIds));assert.equal(a.steps[0].instanceIds[0],'base');assert.ok(a.steps.find(s=>s.instanceIds.includes('axle')).index< a.steps.find(s=>s.instanceIds.includes('brick-l')).index)})
test('connector metadata yields insertion direction',()=>{const plan=buildInstructionPlan(project,def);const step=plan.steps.find(s=>s.instanceIds.includes('axle'));assert.equal(step.insertion.confidence,'verified');assert.deepEqual(step.insertion.vector,[1,0,0])})
test('disconnected components are explicit subassemblies',()=>{const p={...project,parts:[...project.parts,{instanceId:'loose',partId:'beam-5',color:4,position:[9,0,0],rotation:[0,0,0]}]};const plan=buildInstructionPlan(p,def);assert.equal(plan.componentCount,2);assert.ok(plan.warnings.some(w=>w.code==='disconnected-subassembly'))})
test('binary writer creates a PDF with xref and image object',()=>{const pdf=buildJpegPdf([{width:2,height:2,jpegBytes:new Uint8Array([0xff,0xd8,0xff,0xd9])}]);const text=new TextDecoder('latin1').decode(pdf);assert.ok(text.startsWith('%PDF-1.4'));assert.match(text,/\/Subtype \/Image/);assert.match(text,/xref/);assert.match(text,/%%EOF/)})
