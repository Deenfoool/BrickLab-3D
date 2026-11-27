import {test} from 'node:test'
import assert from 'node:assert/strict'
import {randomBytes,randomUUID} from 'node:crypto'
import {createDefaultWorkshop} from '../server/db/default-workshop.js'
import {connectAuthStore} from '../server/db/auth-store.js'
test('default workshop publishes only the new account handle and safe defaults',async()=>{
 const calls=[],tx=async(parts,...args)=>{calls.push({sql:parts.join('?'),args});return calls.length===2?[{username:'technic_test'}]:[]};tx.json=v=>v
 await createDefaultWorkshop(tx,'account-id')
 assert.match(calls[0].sql,/set_config/)
 assert.equal(calls[2].args[1],'technic_test')
 assert.equal(calls[2].args[2].blocks.find(b=>b.key==='awards').visible,true)
 assert.equal(calls[2].args[2].blocks.find(b=>b.key==='activity').visible,false)
 assert.doesNotMatch(calls[2].sql,/email|password|document/)
})
test('both account registration flows create a public workshop; hiding removes it from ranking',{skip:process.env.BRICKLAB_COMMERCE_INTEGRATION!=='1'},async()=>{
 assert.equal(process.env.PGDATABASE,'bricklab_commerce_check')
 const store=connectAuthStore(),handle='test_'+randomBytes(6).toString('hex'),verifiedHandle='test_'+randomBytes(6).toString('hex'),email=randomUUID()+'@example.invalid',token=randomBytes(32).toString('hex')
 try{
  const owner=await store.register({email:randomUUID()+'@example.invalid',displayName:handle,passwordHash:'test-hash',tokenHash:token,expiresAt:new Date(Date.now()+3600000)})
  const card=await store.getPublicCard(handle);assert.equal(card.username,handle);assert.equal(card.unified,true);assert.equal(card.portfolio.blocks.find(b=>b.key==='awards').visible,true)
  assert.equal((await store.getOwnCard(owner.id)).id,card.id)
  assert.ok((await store.getAchievementRankings(0)).some(r=>r.id===card.id&&r.username===handle))
  await store.unpublishCard(owner.id)
  assert.equal(await store.getPublicCard(handle),undefined)
  assert.ok(!(await store.getAchievementRankings(0)).some(r=>r.id===card.id))
  assert.ok(await store.getProfile(owner.id))
  assert.equal(await store.issueAccountToken(email,'register',token),true)
  assert.equal(await store.finishAccountToken(email,'register',token,'test-hash',verifiedHandle,verifiedHandle),true)
  assert.equal((await store.getPublicCard(verifiedHandle)).username,verifiedHandle)
 }finally{await store.close()}
})
