import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createYookassaAdapter,yookassaConfig} from '../server/yookassa.js'
import {createInstructionRegions} from '../server/instruction-regions.js'
import {createBrickLabServer} from '../server/http.js'
import {fileURLToPath} from 'node:url'
const id='30000000-0000-4000-8000-000000000001',payment='40000000-0000-4000-8000-000000000001'
const config={enabled:true,shopId:'12345',secret:'test_example_secret'}
const verified={id:payment,test:true,status:'succeeded',paid:true,amount:{value:'249.00',currency:'RUB'},metadata:{order_id:id}}
test('sandbox rejects live credentials and verifies payment status independently of notification',async()=>{
 assert.equal(yookassaConfig({BRICKLAB_YOOKASSA_TEST_ENABLED:'true',BRICKLAB_YOOKASSA_TEST_SHOP_ID:'12345',BRICKLAB_YOOKASSA_TEST_SECRET:'live_secret_example'}).enabled,false)
 const calls=[]
 let current=verified
 const adapter=createYookassaAdapter({config,origin:'https://bricklab.test',store:{settleVerifiedCommercePayment:async(...args)=>{calls.push(args);return true}},fetcher:async(url,opts)=>{
  assert.equal(url,'https://api.yookassa.ru/v3/payments/'+payment);assert.equal(opts.method,'GET')
  return Response.json(current)
 }})
 await adapter.notification({event:'payment.succeeded',object:{id:payment,amount:{value:'0.01'}}})
 assert.deepEqual(calls,[[id,payment,'test',24900,false]])
 for(const invalid of [{...verified,test:false},{...verified,paid:false},{...verified,status:'pending'},{...verified,amount:{value:'249.00',currency:'USD'}}]){
  current=invalid;await assert.rejects(adapter.notification({event:'payment.succeeded',object:{id:payment}}))
 }
 assert.equal(calls.length,1)
})
test('checkout uses persisted order amount and idempotency key',async()=>{
 const calls=[]
 const adapter=createYookassaAdapter({config,origin:'https://bricklab.test',store:{
  createCommerceTestOrder:async()=>({id,title:'Plus',amountKopecks:24900,idempotencyKey:id,createdAt:new Date()}),
  attachCommercePayment:async(...args)=>{calls.push(args);return true}
 },fetcher:async(url,opts)=>{
  assert.equal(url,'https://api.yookassa.ru/v3/payments');assert.equal(opts.headers['Idempotence-Key'],id)
  assert.equal(JSON.parse(opts.body).amount.value,'249.00')
  return Response.json({...verified,status:'pending',paid:false,confirmation:{confirmation_url:'https://yoomoney.ru/checkout/test'}})
 }})
 assert.equal((await adapter.checkout(id,'plus-1')).mode,'test')
 assert.deepEqual(calls,[[id,payment,'test']])
})
test('hosted region files are no longer directly public',async t=>{
 const root=fileURLToPath(new URL('../',import.meta.url))
 const server=createBrickLabServer({root})
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)))
 for(const path of ['/catalog/sets/instruction-part-index.json','/catalog/sets/42215-6592888-parts-by-page.json'])assert.equal((await fetch('http://127.0.0.1:'+server.address().port+path)).status,404)
 const regions=createInstructionRegions(root+'catalog/sets')
 assert.deepEqual(await regions('0-1','0',1),[])
 assert.ok(Array.isArray(await regions('42215-1','6592888',1)))
})

test('reconciliation uses GET only and verifies all order fields before fulfillment',async()=>{
 const calls=[];let current=verified
 const adapter=createYookassaAdapter({config,origin:'https://bricklab.test',store:{
 settleVerifiedCommercePayment:async(...args)=>{calls.push(['paid',...args]);return true},
 cancelVerifiedCommercePayment:async(...args)=>{calls.push(['cancel',...args]);return true}
 },fetcher:async(url,opts)=>{assert.equal(opts.method,'GET');assert.equal(url,'https://api.yookassa.ru/v3/payments/'+payment);return Response.json(current)}})
 const order={id,paymentId:payment,amountKopecks:24900}
 current={...verified,status:'pending',paid:false};assert.equal(await adapter.reconcileTestPayment(order),'pending')
 for(const invalid of [{...verified,test:false},{...verified,paid:false},{...verified,metadata:{order_id:payment}},{...verified,amount:{value:'1.00',currency:'RUB'}}]){
 current=invalid;await assert.rejects(adapter.reconcileTestPayment(order))
 }
 assert.equal(calls.length,0)
 current=verified;assert.equal(await adapter.reconcileTestPayment(order),'succeeded')
 current={...verified,status:'canceled',paid:false};assert.equal(await adapter.reconcileTestPayment(order),'canceled')
 assert.deepEqual(calls,[['paid',id,payment,'test',24900,false],['cancel',id,payment,'test',24900]])
})
