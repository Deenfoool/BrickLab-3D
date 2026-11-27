
import test from 'node:test';
import assert from 'node:assert/strict';
import {planWorldFill} from '../src/editor/world-plan.js';
const base={kind:'plate',x:-2,z:3,width:2,depth:2,level:1,rows:2,color:'#a0a5a9'};
test('world uses 20 LDU studs and 8 LDU plate levels',()=>{const cells=planWorldFill(base);assert.equal(cells.length,8);assert.deepEqual(cells[0],{design:'3024',x:-40,z:60,y:8,color:'#a0a5a9'});assert.equal(cells[4].y,16);assert.equal(planWorldFill({...base,kind:'brick'})[4].y,32)});
test('world rejects invalid or excessive operations',()=>{for(const patch of [{width:0},{width:1.5},{x:41},{rows:17},{kind:'bad'},{width:32,depth:32},{color:'red'},{level:119,rows:2}])assert.throws(()=>planWorldFill({...base,...patch}));assert.throws(()=>planWorldFill(base,2999))});
