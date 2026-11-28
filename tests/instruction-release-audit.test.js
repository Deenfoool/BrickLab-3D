import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {createServer} from 'node:http'
import {validateReviewedInstructionAudit} from '../server/instruction-audit.js'
import {createInstructionPolicy} from '../server/instruction-access.js'
import {createPaymentsHandler} from '../server/payments.js'
const setId='12345-1',terms='a'.repeat(64),origin='https://bricklab.test',region=[10,20,100,100,'3001','0']
function fixture(){
 return {schema:2,sets:{[setId]:{title:'Model',partCount:601,reviewed:true,volumes:[
  {id:'111',pdfSha256:'b'.repeat(64),pageCount:2,pages:[{step:1,regions:[region],review:'verified'},{step:11,regions:[region],review:'verified'}]},
  {id:'222',pdfSha256:'c'.repeat(64),pageCount:2,pages:[{step:0,regions:[],review:'no-parts'},{step:12,regions:[region],review:'verified'}]}
 ]}}}
}
function verify(d,extra={}){
 const raw=JSON.stringify(d),approval={schema:1,approved:true,auditSha256:createHash('sha256').update(raw).digest('hex'),offerVersion:terms,rightsReviewed:true,reviewer:'Fixture',reviewedAt:'2026-11-28T00:00:00Z',...extra}
 return validateReviewedInstructionAudit(raw,approval)
}
test('paid audit refuses drafts, missing pages, reset steps, unapproved rights and mutated hashes',()=>{
 const approved=verify(fixture());assert.equal(approved.audit[setId].metadata.finalBook,'222')
 for(const change of [
  d=>d.sets[setId].reviewed=false,
  d=>d.sets[setId].volumes[0].pages.pop(),
  d=>d.sets[setId].volumes[1].pages[1].step=2,
  d=>d.sets[setId].volumes[1].pages[0].regions=[region],
  d=>d.sets[setId].volumes[1].pages[1].review='pending',
  d=>d.sets[setId].volumes[1].id='111',
  d=>d.sets[setId].partCount=600,
  d=>d.sets[setId].volumes[0].pages[0].regions=[[9999,0,20,10,'3001']]
 ]){const d=fixture();change(d);assert.throws(()=>verify(d))}
 assert.throws(()=>verify(fixture(),{rightsReviewed:false}))
 assert.throws(()=>verify(fixture(),{auditSha256:'f'.repeat(64)}))
})
test('paid book access is independent of payment and legal readiness and blocks alternate IDs',async t=>{
 const verified=verify(fixture()),policy={...createInstructionPolicy(verified.audit),offerVersion:terms}
 let account={plus:false,instructions:[],orders:[],welcomeRemaining:0}
 const store={getSession:async()=>({id:'fixture',admin:false}),commerceAccount:async()=>account,storeCatalog:async()=>[]}
 const handler=createPaymentsHandler({store,origin,config:{enabled:false},instructionPolicy:policy,instructionRelease:true,commerceMode:'live',fullCatalog:false,legal:null,liveCheckoutReady:false,regions:async()=>{throw Error('legacy fallback forbidden')}})
 const server=createServer((req,res)=>handler(req,res,new URL(req.url,origin).pathname));await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)))
 const base='http://127.0.0.1:'+server.address().port,headers={cookie:'__Host-bricklab_session='+'a'.repeat(64)}
 const url=(set=setId,pdf='111',page=2)=>base+'/api/commerce/instruction-regions?'+new URLSearchParams({set,pdf,page:String(page)})
 assert.equal((await fetch(url())).status,403)
 assert.equal((await fetch(url(setId,'111',1))).status,200)
 assert.equal((await fetch(url('12346-1'))).status,403)
 assert.equal((await fetch(url(setId,'999'))).status,403)
 assert.equal((await fetch(url(setId,'222',2))).status,403)
 account={...account,instructions:[setId]}
 assert.equal((await fetch(url(),{headers})).status,200)
 account={...account,instructions:[],plus:true}
 assert.equal((await fetch(url(setId,'222',2),{headers})).status,200)
 account={...account,plus:false}
 assert.equal((await fetch(url(),{headers})).status,403)
 const offer=await(await fetch(base+'/api/commerce/instruction-offer?set='+setId,{headers})).json()
 assert.equal(offer.canBuy,false)
 assert.equal(policy.access({setId:'12346-1',book:'https://www.lego.com/biassets/bi/999.pdf',page:2,release:true}).interactive,true)
})
