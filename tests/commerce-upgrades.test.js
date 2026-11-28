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
  assert.equal((await store.getPublicCard(publicId)).plus,true)
  await db`update bricklab.commerce_grants set revoked_at=now() where order_id=${secondPlus}`
  assert.equal((await store.getProfile(uid)).background,'default')
  assert.equal((await store.getPublicCard(publicId)).backgroundTheme,'default')
  assert.equal((await store.getPublicCard(publicId)).plus,false)
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
  const [queued]=await db`insert into bricklab.commerce_orders(user_id,sku,title,amount_kopecks,provider,environment,payment_id)
    values(${uid},'aurora','Aurora',19900,'yookassa','test',gen_random_uuid()::text) returning id,payment_id`
  const batch=await store.claimCommerceTestPayments()
  assert.deepEqual(batch.map(x=>[x.id,x.paymentId,x.amountKopecks]),[[queued.id,queued.payment_id,19900]])
  assert.equal((await store.claimCommerceTestPayments()).length,0)
  assert.equal(await store.cancelCommercePayment(queued.id,queued.payment_id,'test',19900),true)
  assert.equal((await store.claimCommerceTestPayments()).length,0)
  const p1=await pendingTest('plus-1',24900),p2=await pendingTest('plus-3',64900)
  const [g1]=await db`select expires_at from bricklab.commerce_grants where order_id=${p1}`
  const [g2]=await db`select granted_at,expires_at from bricklab.commerce_grants where order_id=${p2}`
  assert.equal(+g1.expires_at,+g2.granted_at)
  assert.ok(+g2.expires_at>+g1.expires_at)
  await pendingTest('slots-100',34900)
  assert.equal((await store.getActivity(uid)).limits.projects,40)
  assert.equal((await store.getProfile(uid)).plus,false)
  await db`update bricklab.users set email_verified_at=now() where id=${uid}`
  const terms='a'.repeat(64)
  const quote=await store.quoteCommerceLive(uid,'slots-20',terms)
  assert.equal(quote.amountKopecks,9900)
  await assert.rejects(store.createCommerceLiveOrder(uid,'slots-20',1,terms),/quote_changed/)
  const live=await store.createCommerceLiveOrder(uid,'slots-20',quote.amountKopecks,terms)
  const payment=crypto.randomUUID()
  assert.equal(await store.attachCommercePayment(live.id,payment,'live'),true)
  assert.equal(await store.fulfillCommercePayment(live.id,payment,'test',9900),false)
  assert.equal(await store.fulfillCommercePayment(live.id,payment,'live',9900),true)
  assert.equal(await store.fulfillCommercePayment(live.id,payment,'live',9900),true)
  assert.equal((await store.getActivity(uid)).limits.projects,60)
  const [receipt]=await db`select receipt_status,offer_version from bricklab.commerce_orders where id=${live.id}`
  assert.equal(receipt.receipt_status,'pending');assert.equal(receipt.offer_version,terms)
  // Exercise the real checkout function for every SKU, not merely inserted grants.
  await db`insert into bricklab.admin_accounts(user_id) values(${uid}) on conflict do nothing`
  const skus=['carbon','neon','blueprint','titanium','ember','aurora','theme-collection','slots-20','slots-30','slots-100','supporter','bronze-builder','silver-builder','gold-builder','diamond-patron','founders-club','plus-1','plus-3','plus-12','instruction-42215-1']
  const purchased=new Map()
  for(const sku of skus){
   const o=await store.createCommerceTestOrder(uid,sku)
   const replay=await store.createCommerceTestOrder(uid,sku);assert.equal(o.id,replay.id)
   const payment=crypto.randomUUID()
   assert.equal(await store.attachCommercePayment(o.id,payment,'test'),true)
   assert.equal(await store.fulfillCommercePayment(o.id,payment,'test',o.amountKopecks),true)
   assert.equal(await store.fulfillCommercePayment(o.id,payment,'test',o.amountKopecks),true)
   purchased.set(sku,{...o,payment})
  }
  const sandbox=await store.commerceTestAccount(uid)
  assert.equal(sandbox.themes.length,6);assert.equal(sandbox.badges.length,6);assert.equal(sandbox.plus,true)
  assert.ok(sandbox.instructions.includes('42215-1'))
  assert.equal((await store.commerceAccount(uid)).plus,false)
  assert.equal((await store.getActivity(uid)).limits.projects,60)
  const future=purchased.get('plus-12'),refund=crypto.randomUUID()
  const requested=await store.requestCommerceTestRefund(uid,future.id)
  assert.equal(requested.paymentId,future.payment)
  assert.equal(await store.attachCommerceTestRefund(future.id,refund),true)
  assert.equal(await store.refundCommercePayment(future.payment,'live',future.amountKopecks),false)
  assert.equal(await store.refundCommercePayment(future.payment,'test',future.amountKopecks-1),false)
  assert.equal(await store.refundCommercePayment(future.payment,'test',future.amountKopecks),true)
  assert.equal(await store.refundCommercePayment(future.payment,'test',future.amountKopecks),true)
  const [revoked]=await db`select revoked_at from bricklab.commerce_grants where order_id=${future.id}`
  assert.ok(revoked.revoked_at)
  const events=await db`select event from bricklab.commerce_events where order_id=${future.id} order by id`
  assert.deepEqual(events.map(e=>e.event),['succeeded','refunded'])
  const claimed=await store.claimCommerceEvents()
  assert.ok(claimed.length>0&&claimed.length<=5)
  assert.ok(claimed.every(e=>e.order_number!=null&&typeof e.buyer_name==='string'&&typeof e.day==='string'))
  assert.ok(claimed.every(e=>!Object.hasOwn(e,'email')))

  assert.equal(await store.ackCommerceEvent(claimed[0].id),true)
  const [ack]=await db`select sent_at from bricklab.commerce_events where id=${claimed[0].id}`
  assert.ok(ack.sent_at)
  assert.ok((await store.commerceAdminLedger(uid,'test')).some(o=>o.id===future.id))
  assert.equal(await store.confirmCommerceReceipt(uid,live.id,'fixture-receipt'),true)
  assert.equal(await store.confirmCommerceReceipt(uid,live.id,'second'),false)
  assert.equal(await store.confirmCommerceReceipt(uid,future.id,'invalid-test'),false)
  // Both environments now create orders through the same priced consent path.
  const sku='slots-20',testQuote=await store.quoteCommerce(uid,sku,terms,true,'test')
  assert.equal(testQuote.amountKopecks,8910)
  const common=await store.createCommerceOrder(uid,sku,testQuote.amountKopecks,terms,true,'test')
  assert.equal((await store.createCommerceOrder(uid,sku,testQuote.amountKopecks,terms,true,'test')).id,common.id)
  const [testTerms]=await db`select environment,offer_version,accepted_at from bricklab.commerce_orders where id=${common.id}`
  assert.equal(testTerms.environment,'test');assert.equal(testTerms.offer_version,terms);assert.ok(testTerms.accepted_at)
  await assert.rejects(store.quoteCommerce(other,sku,terms,true,'test'),/admin_required/)
  const previewStore=connectAuthStore({...process.env,BRICKLAB_COMMERCE_MODE:'test',BRICKLAB_YOOKASSA_TEST_ENABLED:'true'})
  try{
   assert.equal((await previewStore.getProfile(uid)).plus,true)
   assert.equal((await previewStore.getActivity(uid)).limits.projects,(await previewStore.commerceTestAccount(uid)).limits.projects)
   await previewStore.saveProfile(uid,{...base,supportBadge:'diamond-patron'})
   assert.equal((await previewStore.getProfile(uid)).supportBadge,'diamond-patron')
   assert.equal((await store.getPublicCard(card.id)).supportBadge,null)
   assert.equal((await previewStore.getProfile(other)).plus,false)
   assert.equal((await store.getProfile(uid)).plus,false)
  }finally{await previewStore.close()}
  const liveQuote2=await store.quoteCommerce(uid,'slots-30',terms,true,'live')
  const commonLive=await store.createCommerceOrder(uid,'slots-30',liveQuote2.amountKopecks,terms,true,'live')
  const livePayment=crypto.randomUUID()
  assert.equal(await store.attachCommercePayment(commonLive.id,livePayment,'live'),true)
  assert.equal(await store.fulfillCommercePayment(commonLive.id,livePayment,'live',liveQuote2.amountKopecks),true)
  // Official-looking fixture only: no mail or fiscal provider is contacted.
  const receiptUrl='https://lknpd.nalog.ru/api/v1/receipt/000000000000/testreceipt/print'
  assert.equal(await store.registerCommerceReceipt(uid,future.id,receiptUrl),false)
  await assert.rejects(store.registerCommerceReceipt(other,commonLive.id,receiptUrl),/admin_required/)
  assert.equal(await store.registerCommerceReceipt(uid,commonLive.id,'https://evil.example/receipt'),false)
  assert.equal(await store.registerCommerceReceipt(uid,commonLive.id,receiptUrl),true)
  assert.equal(await store.registerCommerceReceipt(uid,commonLive.id,receiptUrl),false)
  const receiptJobs=await store.claimCommerceReceiptDeliveries()
  assert.equal(receiptJobs.length,1)
  assert.equal(receiptJobs[0].id,commonLive.id)
  assert.equal(receiptJobs[0].receipt_url,receiptUrl)
  assert.equal((await store.claimCommerceReceiptDeliveries()).length,0)
  assert.equal(await store.ackCommerceReceiptDelivery(commonLive.id,'https://evil.example'),false)
  assert.equal(await store.ackCommerceReceiptDelivery(commonLive.id,receiptUrl),true)
  assert.equal((await store.claimCommerceReceiptDeliveries()).length,0)
  const ownReceipt=(await store.commerceAccount(uid)).orders.find(x=>x.id===commonLive.id)
  assert.equal(ownReceipt.receiptUrl,receiptUrl);assert.ok(ownReceipt.receiptSentAt)
  assert.equal(String(ownReceipt.orderNumber),String(receiptJobs[0].order_number))
  assert.ok(!(await store.commerceAccount(other)).orders.some(x=>x.id===commonLive.id))
  const refundRequest=await store.requestCommerceRefund(uid,commonLive.id,'live')
  assert.equal(refundRequest.paymentId,livePayment)
  assert.equal(await store.attachCommerceRefund(commonLive.id,crypto.randomUUID(),'live'),true)
  assert.equal(await store.refundCommercePayment(livePayment,'live',liveQuote2.amountKopecks),true)
  const [correction]=await db`select receipt_correction_pending from bricklab.commerce_orders where id=${commonLive.id}`
  assert.equal(correction.receipt_correction_pending,true)
  assert.equal((await store.commerceAccount(uid)).orders.find(x=>x.id===commonLive.id).receiptUrl,null)
  const liveTotals=await store.commerceAdminDayTotals(uid,'live')
  const testTotals=await store.commerceAdminDayTotals(uid,'test')
  assert.equal(Number(liveTotals.refunded_kopecks),liveQuote2.amountKopecks)
  assert.equal(Number(testTotals.refunded_kopecks),future.amountKopecks)
  assert.ok(Number(liveTotals.paid_kopecks)>=9900+liveQuote2.amountKopecks)
  assert.ok(Number(testTotals.paid_kopecks)>Number(testTotals.refunded_kopecks))
  await assert.rejects(store.commerceAdminDayTotals(other,'test'),/admin_required/)
  const ledger=(await store.commerceAdminLedger(uid,'live')).find(x=>x.id===commonLive.id)
  assert.equal(String(ledger.order_number),String(ownReceipt.orderNumber))
  assert.equal(ledger.receipt_delivery_url,receiptUrl)
  const numbers=await db`select count(*)::int as n,count(distinct order_number)::int as unique_n from bricklab.commerce_orders`
  assert.equal(numbers[0].n,numbers[0].unique_n)
  // Isolated database only: claim, ambiguous write, replay and full correction.
  const qFiscal=await store.quoteCommerce(uid,'plus-1',terms,true,'live')
  const fiscal=await store.createCommerceOrder(uid,'plus-1',qFiscal.amountKopecks,terms,true,'live')
  const fiscalPayment=crypto.randomUUID()
  assert.equal(await store.attachCommercePayment(fiscal.id,fiscalPayment,'live'),true)
  assert.equal(await store.fulfillCommercePayment(fiscal.id,fiscalPayment,'live',qFiscal.amountKopecks),true)
  const since=new Date(Date.now()-60000)
  const [job]=await db`select * from bricklab.commerce_claim_fiscal(${since})`
  assert.equal(job.id,fiscal.id);assert.equal(job.action,'issue')
  assert.equal((await db`select * from bricklab.commerce_claim_fiscal(${since})`).length,0)
  await assert.rejects(store.registerCommerceReceipt(uid,fiscal.id,'https://lknpd.nalog.ru/api/v1/receipt/000000000000/manual/print'),/fiscal_reconciliation_required/)
  await db`update bricklab.commerce_orders set fiscal_next_at=now() where id=${fiscal.id}`
  const [replay]=await db`select * from bricklab.commerce_claim_fiscal(${since})`
  assert.equal(replay.action,'reconcile_issue')
  const url='https://lknpd.nalog.ru/api/v1/receipt/000000000000/autoReceipt/print'
  const [done]=await db`select bricklab.commerce_fiscal_finish(${fiscal.id}::uuid,'issue','autoReceipt',${url},now()) as ok`
  assert.equal(done.ok,true)
  assert.equal((await store.commerceAccount(uid)).orders.find(o=>o.id===fiscal.id).receiptUrl,url)
  assert.equal(await store.refundCommercePayment(fiscalPayment,'live',qFiscal.amountKopecks),true)
  const [cancel]=await db`select * from bricklab.commerce_claim_fiscal(${since})`
  assert.equal(cancel.id,fiscal.id);assert.equal(cancel.action,'cancel')
  await db`update bricklab.commerce_orders set fiscal_next_at=now() where id=${fiscal.id}`
  const [cancelReplay]=await db`select * from bricklab.commerce_claim_fiscal(${since})`
  assert.equal(cancelReplay.action,'reconcile_cancel')
  const [cancelDone]=await db`select bricklab.commerce_fiscal_finish(${fiscal.id}::uuid,'cancel','autoReceipt',${url},now()) as ok`
  assert.equal(cancelDone.ok,true)
  const [fiscalFinal]=await db`select fiscal_state,receipt_correction_pending from bricklab.commerce_orders where id=${fiscal.id}`
  assert.equal(fiscalFinal.fiscal_state,'canceled');assert.equal(fiscalFinal.receipt_correction_pending,false)
  const [rights]=await db`select has_function_privilege('bricklab_app','bricklab.commerce_claim_fiscal(timestamptz)','EXECUTE') as allowed`
  assert.equal(rights.allowed,false)


  assert.equal((await store.getActivity(uid)).limits.projects,60)


 }finally{await store.close();await db.end()}
})

test('welcome activations are permanent, idempotent, capped at one plus one earned and isolated from payments',{skip:!enabled},async()=>{
 assert.equal(process.env.PGDATABASE,'bricklab_commerce_check')
 const db=postgres({host:process.env.PGHOST,port:Number(process.env.PGPORT||5432),database:process.env.PGDATABASE,username:'bricklab_admin',password:process.env.COMMERCE_ADMIN_PASSWORD,max:1})
 const store=connectAuthStore(),uid='31000000-0000-4000-8000-000000000001',other='31000000-0000-4000-8000-000000000002'
 try{
  for(const [id,email] of [[uid,'welcome-a@example.invalid'],[other,'welcome-b@example.invalid']]){
   await db`insert into bricklab.users(id,email,display_name,password_hash) values(${id},${email},'Welcome fixture',${'scrypt$'+'0'.repeat(32)+'$'+'0'.repeat(128)})`
  }
  assert.equal((await store.commerceAccount(uid)).welcomeRemaining,1)
  await assert.rejects(store.claimInstructionWelcome(uid,'12341-1'),/verified_account_required/)
  await db`update bricklab.users set email_verified_at=now() where id=${uid}`
  const repeats=await Promise.all(Array.from({length:5},()=>store.claimInstructionWelcome(uid,'12341-1')))
  assert.ok(repeats.every(a=>a.welcomeRemaining===0&&a.instructions.includes('12341-1')))
  await assert.rejects(store.claimInstructionWelcome(uid,'12342-1'),/welcome_exhausted/)
  const project=await store.createProject(uid,{format:'bricklab-3d',version:1,name:'Welcome project',parts:[],connections:[]})
  await assert.rejects(store.earnFirstBuilder(other,project.id,()=> '12341-1'),/build_not_complete/)
  await assert.rejects(store.earnFirstBuilder(uid,project.id,()=>null),/build_not_complete/)
  const earned=await store.earnFirstBuilder(uid,project.id,()=> '12341-1')
  assert.equal(earned.firstBuilder,true);assert.equal(earned.welcomeRemaining,1)
  assert.equal((await store.earnFirstBuilder(uid,project.id,()=> '12341-1')).welcomeRemaining,1)
  const attempts=await Promise.allSettled(['12342-1','12343-1','12344-1'].map(set=>store.claimInstructionWelcome(uid,set)))
  assert.equal(attempts.filter(a=>a.status==='fulfilled').length,1)
  assert.equal(attempts.filter(a=>a.status==='rejected'&&/welcome_exhausted/.test(a.reason.message)).length,2)
  const account=await store.commerceAccount(uid)
  assert.equal(account.welcomeRemaining,0);assert.equal(account.welcomeInstructions.length,2);assert.equal(account.orders.length,0)
  assert.deepEqual((await store.commerceAccount(other)).instructions,[])
  assert.equal((await store.commerceTestAccount(uid)).instructions.length,0)
  await assert.rejects(store.quoteCommerce(uid,'instruction-12341-1','a'.repeat(64),false,'live',{setId:'12341-1',title:'Fixture',partCount:601}),/already_owned/)
  await store.recordInstructionActivity(uid,'12341-1','set_open')
  await store.recordInstructionActivity(uid,'12341-1','set_open')
  await assert.rejects(store.instructionAnalytics(uid),/admin_required/)
  await db`insert into bricklab.admin_accounts(user_id) values(${other}) on conflict do nothing`
  const analytics=await store.instructionAnalytics(other)
  assert.equal(analytics.events.find(e=>e.event==='set_open').interactions,1)
  assert.equal(analytics.popular[0].set_id,'12341-1')
  const [r]=await db`select has_table_privilege('bricklab_app','bricklab.instruction_welcome_grants','INSERT') as allowed`
  assert.equal(r.allowed,false)
 }finally{await store.close();await db.end()}
})

test('sandbox pack atomically grants and refunds exactly three sets',{skip:!enabled},async()=>{
 assert.equal(process.env.PGDATABASE,'bricklab_commerce_check')
 const db=postgres({host:process.env.PGHOST,port:Number(process.env.PGPORT||5432),database:process.env.PGDATABASE,username:'bricklab_admin',password:process.env.COMMERCE_ADMIN_PASSWORD,max:1})
 const store=connectAuthStore(),uid='32000000-0000-4000-8000-000000000001',other='32000000-0000-4000-8000-000000000002'
 const products=[{setId:'12351-1',title:'Fixture A',partCount:601},{setId:'12352-1',title:'Fixture B',partCount:1500},{setId:'12353-1',title:'Fixture C',partCount:4001}]
 const ids=products.map(p=>p.setId),terms='a'.repeat(64),payment='sandbox-pack-fixture'
 try{
  for(const [id,email] of [[uid,'pack-a@example.invalid'],[other,'pack-b@example.invalid']])await db`insert into bricklab.users(id,email,display_name,password_hash,email_verified_at) values(${id},${email},'Pack fixture',${'scrypt$'+'0'.repeat(32)+'$'+'0'.repeat(128)},now())`
  await db`insert into bricklab.admin_accounts(user_id) values(${uid})`
  await assert.rejects(store.quoteSandboxPack(other,ids,products,terms),/admin_required/)
  const q=await store.quoteSandboxPack(uid,ids,products,terms)
  assert.equal(q.lines.length,3);assert.equal(q.lines.reduce((n,l)=>n+l.amount,0),q.amountKopecks)
  await assert.rejects(store.createSandboxPack(uid,ids,products,q.amountKopecks-1,terms),/quote_changed/)
  const orders=await Promise.all([store.createSandboxPack(uid,ids,products,q.amountKopecks,terms),store.createSandboxPack(uid,[...ids].reverse(),products,q.amountKopecks,terms)])
  assert.equal(orders[0].id,orders[1].id)
  const order=orders[0]
  await assert.rejects(store.createCommerceOrder(uid,'instruction-'+ids[0],7900,terms,true,'test',products[0]),/checkout_pending/)
  assert.equal(await store.attachCommercePayment(order.id,payment,'test'),true)
  assert.equal(await store.fulfillCommercePayment(order.id,payment,'live',q.amountKopecks),false)
  assert.equal(await store.fulfillCommercePayment(order.id,payment,'test',q.amountKopecks-1),false)
  assert.equal(await store.fulfillCommercePayment(order.id,payment,'test',q.amountKopecks),true)
  assert.equal(await store.fulfillCommercePayment(order.id,payment,'test',q.amountKopecks),true)
  assert.deepEqual((await store.commerceTestAccount(uid)).instructions.sort(),ids)
  assert.deepEqual((await store.commerceAccount(uid)).instructions,[])
  assert.deepEqual((await store.commerceTestAccount(other)).instructions,[])
  await assert.rejects(store.quoteSandboxPack(uid,ids,products,terms),/bundle_set_unavailable/)
  assert.equal(await store.refundCommercePayment(payment,'test',q.amountKopecks),true)
  assert.deepEqual((await store.commerceTestAccount(uid)).instructions,[])
  const [r]=await db`select count(*)::integer as n from bricklab.commerce_grants where order_id=${order.id} and revoked_at is not null`
  assert.equal(r.n,3)
 }finally{await store.close();await db.end()}
})

test('username migration and coauthor credit resolve only published profiles; code attempts persist',{skip:!enabled},async()=>{
 assert.equal(process.env.PGDATABASE,'bricklab_commerce_check')
 const db=postgres({host:process.env.PGHOST,port:Number(process.env.PGPORT||5432),database:process.env.PGDATABASE,username:'bricklab_admin',password:process.env.COMMERCE_ADMIN_PASSWORD,max:1})
 const store=connectAuthStore()
 try{
  const uid='39000000-0000-4000-8000-000000000001',other='39000000-0000-4000-8000-000000000002'
  for(const [id,email,name] of [[uid,'polish-a@example.invalid','PolishAlice'],[other,'polish-b@example.invalid','PolishBob']])await db`insert into bricklab.users(id,email,display_name,password_hash) values(${id},${email},${name},'fixture')`
  assert.equal((await store.findUser('polishalice')).id,uid)
  assert.equal((await store.findUser('polish-a@example.invalid')).username,'polishalice')
  for(const id of [uid,other])await store.publishCard(id,{displayName:'Builder',bio:''})
  const bob=await store.getOwnCard(other);assert.equal((await store.getPublicCard('polishbob')).id,bob.id)
  const p=await store.createProject(uid,{format:'bricklab-3d',version:1,name:'Coauthor fixture',parts:[{id:'a',design:'32316',position:[0,0,0],rotation:[0,0,0,1]}],connections:[]})
  await store.publishBuild(uid,p.id,{revision:p.revision,description:'',coauthors:['polishbob']})
  const [published]=await store.listOwnBuilds(uid)
  assert.equal(published.coauthors[0].username,'polishbob')
  assert.equal((await store.getPublicBuild(published.id)).coauthors[0].id,bob.id)
  await assert.rejects(store.publishBuild(uid,p.id,{revision:p.revision,description:'',coauthors:['polishalice']}),/unknown_coauthor/)
  const email='polish-code@example.invalid',hash='a'.repeat(64)
  assert.equal(await store.issueAccountToken(email,'register',hash),true)
  for(let i=0;i<5;i++)assert.equal(await store.finishAccountToken(email,'register','b'.repeat(64),'fixture','NewBuilder','newbuilder'),false)
  assert.equal(await store.finishAccountToken(email,'register',hash,'fixture','NewBuilder','newbuilder'),false)
  const [token]=await db`select failed_attempts from bricklab.account_tokens where email=${email}`
  assert.equal(token.failed_attempts,5)
 }finally{await store.close();await db.end()}
})

test('verified callbacks recover unattached live payments, reject wrong amounts and never regrant refunded orders',{skip:!enabled},async()=>{
 assert.equal(process.env.PGDATABASE,'bricklab_commerce_check')
 const db=postgres({host:process.env.PGHOST,port:Number(process.env.PGPORT||5432),database:process.env.PGDATABASE,username:'bricklab_admin',password:process.env.COMMERCE_ADMIN_PASSWORD,max:1})
 const store=connectAuthStore(),uid='33000000-0000-4000-8000-000000000001',terms='a'.repeat(64)
 try{
  await db`insert into bricklab.users(id,email,display_name,password_hash,email_verified_at) values(${uid},'recovery@example.invalid','Recovery fixture','fixture',now())`
  const order=await store.createCommerceOrder(uid,'aurora',19900,terms,true,'live'),pid=crypto.randomUUID()
  assert.equal(await store.settleVerifiedCommercePayment(order.id,pid,'live',19899),false)
  assert.equal(await store.settleVerifiedCommercePayment(order.id,pid,'test',19900),false)
  assert.equal((await store.commerceAccount(uid)).orders[0].paymentId,null)
  assert.equal(await store.settleVerifiedCommercePayment(order.id,pid,'live',19900,true),true)
  assert.equal(await store.attachCommercePayment(order.id,pid,'live'),true)
  assert.equal(await store.settleVerifiedCommercePayment(order.id,pid,'live',19900,false),true)
  assert.equal(await store.settleVerifiedCommercePayment(order.id,crypto.randomUUID(),'live',19900),false)
  assert.equal((await store.commerceAccount(uid)).orders[0].status,'refunded')
  assert.deepEqual((await store.commerceAccount(uid)).themes,[])
  await db`insert into bricklab.admin_accounts(user_id) values(${uid})`
  const health=await store.commerceAdminHealth(uid,'live');assert.ok(Number(health.early_refund)>=1)
  assert.equal(await store.confirmCommerceReceiptCorrection(uid,order.id,'unverified fixture'),false)
  assert.equal(await store.registerCommerceReceipt(uid,order.id,'https://lknpd.nalog.ru/api/v1/receipt/000000000000/earlyFixture/print'),true)
  assert.equal(await store.confirmCommerceReceiptCorrection(uid,order.id,'fixture corrected'),true)
  const early=(await store.commerceAdminLedger(uid,'live')).find(x=>x.id===order.id)
  assert.equal(early.receipt_status,'issued');assert.equal(early.receipt_correction_pending,false);assert.equal(early.receipt_delivery_sent_at,null)
  const next=await store.createCommerceOrder(uid,'aurora',19900,terms,true,'live'),pid2=crypto.randomUUID()
  assert.equal(await store.cancelVerifiedCommercePayment(next.id,pid2,'live',19900),true)
  assert.equal(await store.cancelVerifiedCommercePayment(next.id,pid2,'live',19900),true)
  assert.equal(await store.settleVerifiedCommercePayment(next.id,pid2,'live',19900),false)
  const third=await store.createCommerceOrder(uid,'aurora',19900,terms,true,'live'),pid3=crypto.randomUUID()
  assert.equal(await store.settleVerifiedCommercePayment(third.id,pid3,'live',19900),true)
  await db`update bricklab.commerce_orders set refund_requested_at=now(),next_payment_check_at=now()-interval '1 day' where id=${third.id}`
  const claimed=await store.claimCommerceRefunds('live')
  assert.ok(claimed.some(o=>o.id===third.id&&o.refundId===null))
 }finally{await store.close();await db.end()}
})

test('checkout confirmation replay cannot buy another repeatable product after settlement',{skip:!enabled},async()=>{
 assert.equal(process.env.PGDATABASE,'bricklab_commerce_check')
 const db=postgres({host:process.env.PGHOST,port:Number(process.env.PGPORT||5432),database:process.env.PGDATABASE,username:'bricklab_admin',password:process.env.COMMERCE_ADMIN_PASSWORD,max:1})
 const store=connectAuthStore(),uid='34000000-0000-4000-8000-000000000001',terms='a'.repeat(64),key=crypto.randomUUID()
 try{
  await db`insert into bricklab.users(id,email,display_name,password_hash,email_verified_at) values(${uid},'attempt@example.invalid','Attempt fixture','fixture',now())`
  const create=(attempt)=>store.createCommerceOrder(uid,'plus-1',24900,terms,true,'live',undefined,attempt)
  const first=await create({key,returnToSets:true})
  const second=await create({key:crypto.randomUUID(),returnToSets:false})
  assert.equal(first.id,second.id);assert.equal(second.returnToSets,true)
  const pid=crypto.randomUUID()
  assert.equal(await store.settleVerifiedCommercePayment(first.id,pid,'live',24900),true)
  const replay=await create({key,returnToSets:false})
  assert.equal(replay.id,first.id);assert.equal(replay.status,'succeeded');assert.equal(replay.returnToSets,true)
  await assert.rejects(store.createCommerceOrder(uid,'plus-1',24800,terms,true,'live',undefined,{key}),/quote_changed/)
  const fresh=await create({key:crypto.randomUUID(),returnToSets:false})
  assert.notEqual(fresh.id,first.id);assert.equal(fresh.status,'pending')
 }finally{await store.close();await db.end()}
})
