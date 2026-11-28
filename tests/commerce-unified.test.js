import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {createPaymentsHandler} from '../server/payments.js'
import {createYookassaAdapter} from '../server/yookassa.js'
const origin='https://bricklab.test',terms='a'.repeat(64),uid='30000000-0000-4000-8000-000000000001',pid='40000000-0000-4000-8000-000000000001'
test('same quote, checkout and refund routes switch modes only on the server',async t=>{
 for(const mode of ['test','live']){
  let admin=true;const calls=[]
  const store={commerceAdminAudit:async()=>{},getSession:async()=>({id:uid,admin}),quoteCommerce:async(...args)=>{calls.push(args);return {sku:'plus-1',amountKopecks:24900,offerVersion:terms}},commerceTestAccount:async()=>({mode:'test'}),commerceAccount:async()=>({mode:'live'})}
  const adapter={enabled:true,checkout:async(...args)=>{calls.push(args);return {mode,status:'pending'}},requestRefund:async(...args)=>{calls.push(args);return {mode,status:'succeeded'}}}
  const handler=createPaymentsHandler({store,origin,config:{enabled:false},legal:{version:terms},fullCatalog:true,commerceMode:mode,liveCheckoutScope:'public',yookassa:mode==='test'?adapter:null,liveYookassa:mode==='live'?adapter:null})
  const server=createServer((req,res)=>handler(req,res,new URL(req.url,origin).pathname))
  await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)))
  const base='http://127.0.0.1:'+server.address().port,headers={cookie:'__Host-bricklab_session='+'a'.repeat(64),origin,'Content-Type':'application/json'}
  const get=path=>fetch(base+path,{headers}),post=(path,data)=>fetch(base+path,{method:'POST',headers,body:JSON.stringify(data)})
  const status=await (await get('/api/commerce/status')).json();assert.equal(status.mode,mode);assert.ok(status.skus.includes('plus-1'))
  const quote=await (await get('/api/commerce/quote?sku=plus-1')).json();assert.equal(quote.mode,mode)
  const payload={sku:'plus-1',amountKopecks:24900,offerVersion:terms,accepted:true,mode,...(mode==='live'?{checkoutKey:pid}:{})}
  assert.equal((await post('/api/commerce/checkout',{...payload,mode:mode==='test'?'live':'test'})).status,400)
  assert.equal((await post('/api/commerce/checkout',payload)).status,200)
  assert.deepEqual(calls[1],[uid,'plus-1',{unified:true,amountKopecks:24900,offerVersion:terms,beta:true,...(mode==='live'?{checkoutKey:pid}:{})}])
  assert.equal((await post('/api/commerce/refund',{orderId:uid,confirm:true,mode})).status,200)
  assert.equal((await (await get('/api/commerce/account')).json()).mode,mode)
  admin=false;assert.equal((await post('/api/commerce/refund',{orderId:uid,confirm:true,mode})).status,403)
  if(mode==='test')assert.equal((await post('/api/commerce/checkout',payload)).status,403)
 }
})
test('same provider adapter persists unified quotes for sandbox and live, verifies mode before attachment',async()=>{
 for(const environment of ['test','live']){
  const calls=[]
  const adapter=createYookassaAdapter({origin,config:{enabled:true,environment,shopId:'1',secret:environment+'_example_secret'},store:{
   createCommerceOrder:async(...args)=>{calls.push(args);return {id:uid,sku:'plus-1',title:'Plus',amountKopecks:24900,createdAt:new Date(),idempotencyKey:uid}},
   attachCommercePayment:async()=>true
  },fetcher:async()=>Response.json({id:pid,test:environment==='test',status:'pending',paid:false,amount:{value:'249.00',currency:'RUB'},metadata:{order_id:uid},confirmation:{confirmation_url:'https://yoomoney.ru/checkout/example'}})})
  assert.equal((await adapter.checkout(uid,'plus-1',{unified:true,amountKopecks:24900,offerVersion:terms,beta:true})).mode,environment)
  assert.deepEqual(calls,[[uid,'plus-1',24900,terms,true,environment]])
 }
})

test('live scope fails closed, pilot allows admin only, public allows users, callbacks and refunds stay available',async t=>{
 let admin=false,scope='closed',checkout=0,refunds=0,callbacks=0;
 const store={commerceAdminAudit:async()=>{},getSession:async()=>({id:uid,admin}),storeCatalog:async()=>[],quoteCommerce:async()=>({sku:'plus-1',amountKopecks:24900,offerVersion:terms}),quoteCommerceLive:async()=>({sku:'plus-1',amountKopecks:24900,offerVersion:terms})};
 const adapter={enabled:true,checkout:async()=>{checkout++;return {mode:'live'}},requestRefund:async()=>{refunds++;return {status:'succeeded'}},notification:async()=>{callbacks++;return {ok:true}}};
 const server=createServer((req,res)=>createPaymentsHandler({store,origin,config:{enabled:false},legal:{version:terms},fullCatalog:true,commerceMode:'live',liveCheckoutScope:scope,liveYookassa:adapter})(req,res,new URL(req.url,origin).pathname));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const base='http://127.0.0.1:'+server.address().port,headers={cookie:'__Host-bricklab_session='+'a'.repeat(64),origin,'Content-Type':'application/json'};
 const get=path=>fetch(base+path,{headers}),post=(path,data)=>fetch(base+path,{method:'POST',headers,body:JSON.stringify(data)});
 const payload={sku:'plus-1',amountKopecks:24900,offerVersion:terms,accepted:true,checkoutKey:pid};
 for(const value of ['closed','pilot','public']){
  scope=value;
  for(const isAdmin of [false,true]){
   admin=isAdmin;const allowed=scope==='public'||scope==='pilot'&&admin;
   assert.equal((await (await get('/api/commerce/status')).json()).enabled,allowed);
   assert.equal((await (await get('/api/commerce/live-status')).json()).enabled,scope==='public');
   assert.equal((await (await get('/api/store/catalog')).json()).live,scope==='public');
   assert.equal((await get('/api/commerce/quote?sku=plus-1')).status,allowed?200:503);
   assert.equal((await get('/api/commerce/live-quote?sku=plus-1')).status,allowed?200:503);
   assert.equal((await post('/api/commerce/checkout',{...payload,mode:'live'})).status,allowed?200:503);
   assert.equal((await post('/api/commerce/live-checkout',payload)).status,allowed?200:503);
  }
  assert.equal((await post('/api/payments/yookassa/live-result',{event:'refund.succeeded'})).status,200);
  assert.equal((await post('/api/commerce/refund',{orderId:uid,confirm:true,mode:'live'})).status,200);
 }
 assert.equal(checkout,6);assert.equal(refunds,3);assert.equal(callbacks,3);
});

test('a completed checkout attempt is returned without creating or reading another provider payment',async()=>{
 const adapter=createYookassaAdapter({origin,config:{enabled:true,environment:'live',shopId:'1',secret:'live_example_secret'},store:{createCommerceOrder:async(...a)=>{
 assert.deepEqual(a.slice(-2),[undefined,{key:pid,returnToSets:true}]);return {id:uid,status:'succeeded',paymentId:pid}
 }},fetcher:async()=>{throw Error('must not call provider')}})
 assert.deepEqual(await adapter.checkout(uid,'plus-1',{unified:true,amountKopecks:24900,offerVersion:terms,beta:true,checkoutKey:pid,returnToSets:true}),{orderId:uid,status:'succeeded',checkoutUrl:null,mode:'live'})
})

test('operator recovery is admin-only and available in closed live scope',async t=>{
 let admin=false,lookups=0,checks=0;
 const store={commerceAdminAudit:async()=>{},getSession:async()=>({id:uid,admin}),commerceAdminRecoveryOrder:async(...a)=>{lookups++;assert.deepEqual(a,[uid,uid,'live']);return {id:uid,paymentId:null,amountKopecks:24900,status:'pending'}}};
 const adapter={enabled:true,recoverPayment:async(row,id)=>{checks++;assert.equal(row.id,uid);assert.equal(id,pid);return 'succeeded'}};
 const handler=createPaymentsHandler({store,origin,config:{enabled:false},legal:{version:terms},fullCatalog:true,commerceMode:'live',liveCheckoutScope:'closed',liveYookassa:adapter});
 const server=createServer((req,res)=>handler(req,res,new URL(req.url,origin).pathname));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const base='http://127.0.0.1:'+server.address().port,headers={cookie:'__Host-bricklab_session='+'a'.repeat(64),origin,'Content-Type':'application/json'},payload={orderId:uid,paymentId:pid,mode:'live'};
 const post=(data,extra={})=>fetch(base+'/api/commerce/admin-reconcile',{method:'POST',headers:{...headers,...extra},body:JSON.stringify(data)});
 assert.equal((await post(payload)).status,403);admin=true;
 assert.equal((await post(payload,{origin:'https://other.invalid'})).status,403);
 assert.equal((await post({...payload,mode:'test'})).status,400);
 assert.equal((await post({...payload,paymentId:'invalid'})).status,400);
 assert.equal(lookups,0);assert.equal(checks,0);
 assert.deepEqual(await (await post(payload)).json(),{status:'succeeded',mode:'live'});
 assert.equal(lookups,1);assert.equal(checks,1);
});

test('closed or unready checkout does not prevent verified callbacks or an owner reading an existing order',async t=>{
 let admin=false;const calls=[]
 const store={commerceAdminAudit:async()=>{},getSession:async()=>({id:uid,admin}),commerceOwnOrder:async(...a)=>{calls.push(a);return a[1]===pid?{id:pid,status:'pending',amountKopecks:24900}:null}}
 const adapter={enabled:true,notification:async()=>({ok:true})}
 const handler=createPaymentsHandler({store,origin,config:{enabled:false},legal:{version:terms},fullCatalog:true,commerceMode:'live',liveCheckoutScope:'public',liveCheckoutReady:false,liveYookassa:adapter})
 const server=createServer((req,res)=>handler(req,res,new URL(req.url,origin).pathname))
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)))
 const base='http://127.0.0.1:'+server.address().port,headers={cookie:'__Host-bricklab_session='+'a'.repeat(64),origin,'Content-Type':'application/json'}
 const get=path=>fetch(base+path,{headers})
 assert.equal((await (await get('/api/commerce/status')).json()).enabled,false)
 assert.equal((await get('/api/commerce/quote?sku=plus-1')).status,503)
 assert.equal((await get('/api/commerce/order-status?id='+pid+'&mode=test')).status,403)
 assert.equal((await get('/api/commerce/order-status?id='+uid+'&mode=live')).status,404)
 assert.deepEqual(await (await get('/api/commerce/order-status?id='+pid+'&mode=live')).json(),{id:pid,status:'pending',amountKopecks:24900,mode:'live'})
 assert.deepEqual(calls,[[uid,uid,'live'],[uid,pid,'live']])
 assert.equal((await fetch(base+'/api/payments/yookassa/live-result',{method:'POST',headers,body:'{}'})).status,200)
})
