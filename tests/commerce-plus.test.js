import {test} from 'node:test'
import assert from 'node:assert/strict'
import {plusLoyalty,plusThemeState,PLUS_THEME_CHANGE_MS} from '../src/menu/commerce-catalog.js'
import {instructionAccess} from '../server/instruction-access.js'
import {validateProfile} from '../server/profile.js'
import {createBrickLabServer} from '../server/http.js'
import {fileURLToPath} from 'node:url'
test('Plus loyalty counts elapsed distinct days only, including expired grants',()=>{
 const d=86400000,t=1000
 const g=[{sku:'plus-1',grantedAt:t,expiresAt:t+30*d},{sku:'plus-3',grantedAt:t+20*d,expiresAt:t+120*d},{sku:'plus-12',grantedAt:t,expiresAt:t+365*d,revoked:true}]
 assert.deepEqual(plusLoyalty(g,t+90*d),{days:90,milestones:[1,3]})
 assert.deepEqual(plusLoyalty(g,t+150*d),{days:120,milestones:[1,3]})
})
test('Plus theme is temporary and has 30-day change cooldown',()=>{
 const choice={theme:'carbon',changedAt:new Date(1000)}
 assert.deepEqual(plusThemeState({plus:true},choice),{chosen:'carbon',nextChangeAt:1000+PLUS_THEME_CHANGE_MS})
 assert.deepEqual(plusThemeState({plus:false},choice),{chosen:null,nextChangeAt:0})
 assert.throws(()=>validateProfile({bio:'',cover:'blueprint',plusTheme:'constructor'}),/invalid_profile/)
})
test('no unaudited instruction is locked in beta or release',()=>{
 for(const release of [true,false])assert.deepEqual(instructionAccess({setId:'42215-1',book:'https://www.lego.com/biassets/bi/123.pdf',page:200,release}),{mode:release?'release':'beta',supported:false,step:null,interactive:true})
})
test('legal drafts are accessible without authentication and visibly not approved',async t=>{
 const root=fileURLToPath(new URL('../',import.meta.url))
 const server=createBrickLabServer({root})
 await new Promise(r=>server.listen(0,'127.0.0.1',r))
 t.after(()=>new Promise(r=>server.close(r)))
 for(const path of ['/offer','/privacy','/refund']){
  const response=await fetch('http://127.0.0.1:'+server.address().port+path)
  assert.equal(response.status,200);assert.match(await response.text(),/ПРОЕКТ · НЕ УТВЕРЖДЕНО/)
 }
})
