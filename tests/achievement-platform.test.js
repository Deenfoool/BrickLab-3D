import {test} from 'node:test'
import assert from 'node:assert/strict'
import {validateAchievement} from '../server/achievement-rules.js'
import {achievementProgress,activeAchievements} from '../src/menu/achievement-catalog.js'
import {rewardInventory} from '../src/menu/achievement-rewards.js'
import {createAchievementVerifier,validateVerification} from '../server/achievement-verifier.js'
import {validateProfile} from '../server/profile.js'
const rule={id:'custom-gear-challenge',cat:'mechanics',rarity:'rare',icon:'settings',metric:'gears',target:3,xp:125,ru:'Три механизма',en:'Three mechanisms',descRu:'Проверить три модели.',descEn:'Verify three models.'}
test('administrator rules are constrained to known server metrics, valid IDs and XP',()=>{
 const a=validateAchievement(rule)
 assert.equal(a.xp,125);assert.equal(a.hidden,false);assert.equal(activeAchievements.length,52)
 for(const bad of [{metric:'eval'},{xp:5001},{target:0},{id:'gears'},{hidden:'yes'},{metric:null,target:2}])assert.throws(()=>validateAchievement({...rule,...bad}),{message:'invalid_achievement'})
 assert.equal(validateAchievement({...rule,metric:null,target:1,hidden:true}).hidden,true)
})
test('dynamic awards grant configured XP once; cosmetics unlock by earned award only',()=>{
 const a=validateAchievement(rule)
 const p=achievementProgress([{award:a.id,xp:9999},{award:a.id},{award:'forged',xp:9999}],{},null,{},[a])
 assert.equal(p.xp,125);assert.equal(p.awards.length,1)
 assert.equal(rewardInventory([]).some(r=>r.owned),false)
 assert.equal(rewardInventory([{award:'gears'}]).find(r=>r.id==='forge').owned,true)
 assert.equal(validateProfile({bio:'',cover:'amber',achievementStyle:'forge'}).achievementStyle,'forge')
 assert.throws(()=>validateProfile({bio:'',cover:'amber',achievementStyle:'fake'}))
})
test('verification loads only exact owner revision and accepts no client award evidence',async()=>{
 const id='00000000-0000-4000-8000-000000000123',req={projectId:id,revision:2,kind:'mechanics',metrics:['gears'],xp:99999},doc={parts:[],connections:[]}
 assert.equal(validateVerification(req).metrics,undefined)
 assert.throws(()=>validateVerification({...req,revision:0}),{message:'invalid_verification'})
 let writes=0
 const store={async getProject(uid,p,r){assert.equal(p,id);assert.equal(r,2);return uid==='owner'?{revision:2,document:doc}:null},async recordAchievementEvidence(uid,p,r,metrics){writes++;assert.deepEqual([uid,p,r,metrics],['owner',id,2,['gears']])}}
 const run=async(d,r)=>{assert.equal(d,doc);assert.equal(r.metrics,undefined);return {metrics:['gears'],reason:'passed'}}
 const verify=createAchievementVerifier({store,run})
 await assert.rejects(verify('stranger',req),{message:'not_found'})
 assert.deepEqual(await verify('owner',req),{metrics:['gears'],reason:'passed'})
 assert.equal(writes,1)
 await assert.rejects(verify('owner',req),{message:'verification_busy'})
})
