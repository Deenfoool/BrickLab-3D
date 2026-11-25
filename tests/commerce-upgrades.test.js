import {test} from 'node:test'
import assert from 'node:assert/strict'
import postgres from 'postgres'
import {connectAuthStore} from '../server/db/auth-store.js'
import {validateProfile} from '../server/profile.js'
const enabled=process.env.BRICKLAB_COMMERCE_INTEGRATION==='1'
test('support badge profile input only accepts known supporter products',()=>{
 const base={bio:'',cover:'blueprint'}
 assert.equal(validateProfile({...base,supportBadge:'supporter'}).supportBadge,'supporter')
 assert.equal(validateProfile({...base,supportBadge:null}).supportBadge,null)
 assert.throws(()=>validateProfile({...base,supportBadge:'plus-1'}),/invalid_profile/)
})
test('real PostgreSQL enforces extended quota, collection ownership and badge privacy',{skip:!enabled},async()=>{
 // Deliberately refuse the production database name.
 assert.equal(process.env.PGDATABASE,'bricklab_commerce_check')
 assert.ok(process.env.COMMERCE_ADMIN_PASSWORD)
 const db=postgres({host:process.env.PGHOST,port:Number(process.env.PGPORT||5432),database:process.env.PGDATABASE,username:'bricklab_admin',password:process.env.COMMERCE_ADMIN_PASSWORD,max:1})
 const store=connectAuthStore()
 try{
  await store.ready()
  const uid='30000000-0000-4000-8000-000000000001',other='30000000-0000-4000-8000-000000000002'
  for(const [id,email] of [[uid,'upgrade-a@example.invalid'],[other,'upgrade-b@example.invalid']]){
   await db`insert into bricklab.users(id,email,display_name,password_hash) values(${id},${email},'Commerce fixture',${'scrypt$'+'0'.repeat(32)+'$'+'0'.repeat(128)})`
  }
  const doc=n=>({format:'bricklab-3d',version:1,name:'Fixture '+n,parts:[],connections:[]})
  let first
  for(let i=0;i<20;i++){const p=await store.createProject(uid,doc(i));if(!first)first=p}
  await assert.rejects(store.createProject(uid,doc(20)),/project_limit/)
  async function grant(sku,kind,target='',expiry=null,environment='live'){
   const [o]=await db`insert into bricklab.commerce_orders(user_id,sku,title,amount_kopecks,provider,environment,status,payment_id,paid_at)
    values(${uid},${sku},${sku},100,'yookassa',${environment},'succeeded',gen_random_uuid()::text,now()) returning id`
   await db`insert into bricklab.commerce_grants(order_id,user_id,kind,sku,target,expires_at)
    values(${o.id},${uid},${kind},${sku},${target},${expiry})`
   return o.id
  }
  await grant('slots-100','storage','',null,'test')
  await assert.rejects(store.createProject(uid,doc(20)),/project_limit/)
  await grant('slots-20','storage')
  await store.createProject(uid,doc(20))
  assert.equal((await store.listProjects(uid)).length,21)
  assert.equal((await store.listProjects(other)).length,0)
  assert.equal((await store.getActivity(uid)).limits.projects,40)
  for(let i=1;i<20;i++)first=await store.saveProject(uid,first.id,first.revision,doc('revision '+i))
  await assert.rejects(store.saveProject(uid,first.id,first.revision,doc('blocked')),/revision_limit/)
  const plus=await grant('plus-1','subscription','',new Date(Date.now()+86400000))
  first=await store.saveProject(uid,first.id,first.revision,doc('plus revision'))
  assert.equal(first.revision,21)
  assert.equal((await store.listRevisions(uid,first.id)).length,21)
  assert.equal((await store.getActivity(uid)).limits.projects,80)
  await db`update bricklab.commerce_grants set revoked_at=now() where order_id=${plus}`
  assert.equal((await store.getActivity(uid)).limits.versions,20)
  assert.equal((await store.listRevisions(uid,first.id)).length,21)
  assert.equal((await store.getProject(uid,first.id,21)).revision,21)
  await assert.rejects(store.saveProject(uid,first.id,first.revision,doc('after plus')),/revision_limit/)
  const base={bio:'',cover:'blueprint'}
  await assert.rejects(store.saveProfile(uid,{...base,background:'carbon'}),/background_locked/)
  await assert.rejects(store.saveProfile(uid,{...base,supportBadge:'supporter'}),/badge_locked/)
  await assert.rejects(store.saveProfile(uid,{...base,plusTheme:'carbon'}),/plus_required/)
  const secondPlus=await grant('plus-1','subscription','',new Date(Date.now()+86400000))
  await store.saveProfile(uid,{...base,plusTheme:'carbon'})
  assert.equal((await store.getProfile(uid)).plusTheme.chosen,'carbon')
  await assert.rejects(store.saveProfile(uid,{...base,plusTheme:'neon'}),/plus_theme_cooldown/)
  await store.saveProfile(uid,{...base,background:'carbon'})
  await store.publishCard(uid,{displayName:'Commerce fixture',bio:'',showBackground:true})
  const publicId=(await store.getOwnCard(uid)).id
  assert.equal((await store.getPublicCard(publicId)).backgroundTheme,'carbon')
  await db`update bricklab.commerce_grants set revoked_at=now() where order_id=${secondPlus}`
  assert.equal((await store.getProfile(uid)).background,'default')
  assert.equal((await store.getPublicCard(publicId)).backgroundTheme,'default')
  await grant('theme-collection','themeBundle')
  assert.equal((await store.getProfile(uid)).inventory.filter(x=>x.source==='purchase'&&x.owned).length,6)
  await store.saveProfile(uid,{...base,background:'carbon'})
  assert.equal((await store.getProfile(uid)).background,'carbon')
  const badge=await grant('supporter','badge')
  await store.publishCard(uid,{displayName:'Commerce fixture',bio:'',showBackground:true})
  const card=await store.getOwnCard(uid)
  assert.equal((await store.getPublicCard(card.id)).supportBadge,null)
  await store.saveProfile(uid,{...base,supportBadge:'supporter'})
  assert.equal((await store.getPublicCard(card.id)).supportBadge,'supporter')
  assert.equal((await store.getProfile(other)).supportBadges.length,0)
  await db`update bricklab.commerce_grants set revoked_at=now() where order_id=${badge}`
  assert.equal((await store.getPublicCard(card.id)).supportBadge,null)
  assert.equal((await store.getProfile(uid)).supportBadge,null)
  // Test payments are verified by adapter; this exercises the actual DB
  // transaction independently of an external payment provider.
  async function pendingTest(sku,amount){
   const [o]=await db`insert into bricklab.commerce_orders(user_id,sku,title,amount_kopecks,provider,environment)
    values(${uid},${sku},${sku},${amount},'yookassa','test') returning id`
   const payment=crypto.randomUUID()
   assert.equal(await store.attachCommercePayment(o.id,payment,'live'),false)
   assert.equal(await store.attachCommercePayment(o.id,payment,'test'),true)
   assert.equal(await store.fulfillCommercePayment(o.id,payment,'test',amount+1),false)
   assert.equal(await store.fulfillCommercePayment(o.id,payment,'test',amount),true)
   assert.equal(await store.fulfillCommercePayment(o.id,payment,'test',amount),true)
   const [g]=await db`select count(*)::int as n from bricklab.commerce_grants where order_id=${o.id}`
   assert.equal(g.n,1)
   return o.id
  }
  const p1=await pendingTest('plus-1',24900),p2=await pendingTest('plus-3',64900)
  const [g1]=await db`select expires_at from bricklab.commerce_grants where order_id=${p1}`
  const [g2]=await db`select granted_at,expires_at from bricklab.commerce_grants where order_id=${p2}`
  assert.equal(+g1.expires_at,+g2.granted_at)
  assert.ok(+g2.expires_at>+g1.expires_at)
  await pendingTest('slots-100',34900)
  assert.equal((await store.getActivity(uid)).limits.projects,40)
  assert.equal((await store.getProfile(uid)).plus,false)
 }finally{await store.close();await db.end()}
})
