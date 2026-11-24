import {test} from 'node:test'
import assert from 'node:assert/strict'
import {validateProfile,awardProgress} from '../server/profile.js'
import {createProfileClient} from '../src/menu/profile-client.js'
test('profile whitelist and size limits',()=>{
 assert.deepEqual(validateProfile({bio:'  Builder 🧱 ',cover:'amber',xp:999}),{bio:'Builder 🧱',cover:'amber'})
 for(const p of [{bio:'x'.repeat(501),cover:'amber'},{bio:'ok',cover:'url(...)'},{bio:String.fromCharCode(0),cover:'blueprint'}])assert.throws(()=>validateProfile(p),{message:'invalid_profile'})
})
test('server awards are finite and idempotent',()=>{
 assert.equal(awardProgress([]).xp,0)
 assert.equal(awardProgress([{award:'firstCloudSave'},{award:'firstCloudSave'},{award:'fake',xp:999}]).xp,30)
})
test('profile client does not submit XP or user ID',async()=>{
 let body
 const api=createProfileClient({location:{protocol:'https:',hostname:'bricklab-3d.ru'},fetcher:async(url,o)=>{assert.equal(url,'/api/profile');body=JSON.parse(o.body);return{ok:true,status:200,json:async()=>({profile:{bio:'Hello',cover:'amber'},progress:{xp:30,awards:[]}})}}})
 assert.equal((await api.save({bio:'Hello',cover:'amber',xp:999,userId:'x'})).progress.xp,30)
 assert.deepEqual(body,{bio:'Hello',cover:'amber'})
})
