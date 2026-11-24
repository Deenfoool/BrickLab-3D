import {test} from 'node:test'
import assert from 'node:assert/strict'
import {publicationInput,savePublicationRevision} from '../src/menu/publish-dialog.js'
const owner='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const doc={name:'Test build',parts:[{id:'p',design:'3001'}],connections:[]}
const record={id:'local',document:doc}
const valid={description:' Working gearbox ',category:'mechanisms',downloadAllowed:true,rightsConfirmed:true}
test('publishing requires rights confirmation and supports view-only access',()=>{
 assert.deepEqual(publicationInput(2,valid),{revision:2,description:'Working gearbox',category:'mechanisms',consent:true,rightsConfirmed:true,allowDownload:true,allowComments:true,allowRemix:false,difficulty:'unspecified',tags:[],workType:'original',attribution:''})
 assert.equal(publicationInput(2,{...valid,downloadAllowed:false}).allowDownload,false)
 for(const input of [{...valid,downloadAllowed:false,allowRemix:true},{...valid,rightsConfirmed:false},{...valid,category:'invalid'},{...valid,description:'a'.repeat(1001)}])assert.throws(()=>publicationInput(2,input),/invalid_publication/)
 assert.throws(()=>publicationInput(0,valid),/invalid_publication/)
})
test('new builds save a private revision before publication and link the local record',async()=>{
 const calls=[]
 const result=await savePublicationRevision({record,user:{id:owner},cloud:{create:async value=>{calls.push(value);return{id,revision:1}}},linkLocal:(local,link,expected)=>{assert.equal(local,'local');assert.deepEqual(link,{id,ownerId:owner,revision:1});assert.equal(expected,undefined);return true}})
 assert.deepEqual(calls,[doc]);assert.deepEqual(result,{id,revision:1,linked:true})
})
test('linked builds retain optimistic revision checks and reject shared copies',async()=>{
 const linked={...record,cloud:{id,ownerId:owner,revision:3}}
 let writes=0
 const cloud={save:async(project,revision,value)=>{writes++;assert.equal(project,id);assert.equal(revision,3);assert.equal(value,doc);throw Object.assign(Error('conflict'),{code:'revision_conflict'})}}
 await assert.rejects(savePublicationRevision({record:linked,user:{id:owner},cloud,linkLocal:()=>assert.fail('must not link on conflict')}),{code:'revision_conflict'})
 assert.equal(writes,1)
 await assert.rejects(savePublicationRevision({record:{...linked,cloud:{...linked.cloud,kind:'bureau'}},user:{id:owner},cloud,linkLocal:()=>assert.fail()}),/shared/)
 await assert.rejects(savePublicationRevision({record:{...linked,cloud:{...linked.cloud,ownerId:id}},user:{id:owner},cloud,linkLocal:()=>assert.fail()}),/shared/)
 assert.equal(writes,1)
})
