import {test} from 'node:test'
import assert from 'node:assert/strict'
import {achievements,achievementProgress,activeAchievements} from '../src/menu/achievement-catalog.js'
import {validateProfile} from '../server/profile.js'
import {readFileSync} from 'node:fs'
test('catalog identifiers, thresholds and localization are consistent',()=>{
 assert.equal(new Set(achievements.map(a=>a.id)).size,achievements.length)
 assert.equal(achievements.length,60)
 const sql=readFileSync(new URL('../server/db/migrations/110_achievements.sql',import.meta.url),'utf8')
 for(const a of achievements){assert.ok(a.ru&&a.en&&a.descRu&&a.descEn);assert.ok(sql.includes("'"+a.id+"'"));if(a.metric&&!['cloud','founder'].includes(a.metric))assert.ok(sql.includes("('"+a.id+"','"+a.metric+"',"+a.target+")"))}
 assert.ok(activeAchievements.every(a=>a.metric!==null))
})
test('experience deduplicates awards and ignores fabricated IDs and client XP',()=>{
 const p=achievementProgress([{award:'firstCloudSave',xp:999999},{award:'firstCloudSave'},{award:'parts100'},{award:'fake',xp:99999}])
 assert.equal(p.xp,55);assert.equal(p.awards.length,2);assert.equal(p.level,4)
})
test('showcase payload limits and whitelists IDs',()=>{
 assert.deepEqual(validateProfile({bio:'',cover:'amber',showcase:['firstCloudSave']}).showcase,['firstCloudSave'])
 for(const showcase of [['fake'],['firstCloudSave','firstCloudSave'],Array(7).fill('firstCloudSave'),null])assert.throws(()=>validateProfile({bio:'',cover:'amber',showcase}),{message:'invalid_showcase'})
})
