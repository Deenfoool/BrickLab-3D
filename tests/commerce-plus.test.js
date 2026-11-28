import {test} from 'node:test'
import assert from 'node:assert/strict'
import {plusLoyalty,plusThemeState,PLUS_THEME_CHANGE_MS} from '../src/menu/commerce-catalog.js'
import {instructionAccess,createInstructionPolicy} from '../server/instruction-access.js'
import {validateProfile} from '../server/profile.js'
import {createPaymentsHandler} from '../server/payments.js'
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

test('private audited pages enforce trial steps, matching purchase and Plus on both canonical URLs',async t=>{
 const region=[10,20,100,100,'6628',0]
 const policy=createInstructionPolicy({'42215-1':{metadata:{title:'Volvo EC500',partCount:2359,complete:true},'6592888':[{step:10,regions:[region]},{step:11,regions:[region]}]}})
 const store={getSession:async token=>({id:'fixture'}),commerceAccount:async()=>({plus:false,instructions:['42215-1']})}
 const root=fileURLToPath(new URL('../',import.meta.url))
 const server=createBrickLabServer({root,payments:createPaymentsHandler({store,origin:'https://bricklab.test',instructionRelease:true,fullCatalog:true,commerceMode:'live',liveCheckoutScope:'public',legal:{version:'a'.repeat(64)},liveYookassa:{enabled:true},instructionPolicy:policy,regions:async()=>{throw Error('must not read public fallback')}})})
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)))
 const base='http://127.0.0.1:'+server.address().port,route='/api/commerce/instruction-regions?set=42215-1&pdf=6592888&page='
 assert.equal((await fetch(base+route+'1')).status,200)
 assert.equal((await fetch(base+route+'2')).status,403)
 assert.equal((await fetch(base+route+'3')).status,403)
 const authenticated=await fetch(base+route+'2',{headers:{cookie:'__Host-bricklab_session='+'a'.repeat(64)}})
 assert.equal(authenticated.status,200);assert.deepEqual((await authenticated.json()).regions,[region])
 for(const prefix of ['biassets/bi','cdn/product-assets/product.bi.core.pdf']){
  const q=new URLSearchParams({set:'42215-1',book:'https://www.lego.com/'+prefix+'/6592888.pdf',page:'2'})
  const response=await fetch(base+'/api/commerce/instruction-access?'+q)
  assert.equal(response.status,200);assert.equal((await response.json()).interactive,false)
 }
 assert.equal(policy.access({setId:'42215-1',book:'https://www.lego.com/biassets/bi/6592888.pdf',page:2,account:{plus:true},release:true}).interactive,true)
})
