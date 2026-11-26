import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {createPaymentsHandler} from '../server/payments.js'
import {createYookassaAdapter} from '../server/yookassa.js'
const origin='https://bricklab.test',terms='a'.repeat(64),uid='30000000-0000-4000-8000-000000000001',pid='40000000-0000-4000-8000-000000000001'
test('same quote, checkout and refund routes switch modes only on the server',async t=>{
 for(const mode of ['test','live']){
  let admin=true;const calls=[]
  const store={getSession:async()=>({id:uid,admin}),quoteCommerce:async(...args)=>{calls.push(args);return {sku:'plus-1',amountKopecks:24900,offerVersion:terms}},commerceTestAccount:async()=>({mode:'test'}),commerceAccount:async()=>({mode:'live'})}
  const adapter={enabled:true,checkout:async(...args)=>{calls.push(args);return {mode,status:'pending'}},requestRefund:async(...args)=>{calls.push(args);return {mode,status:'succeeded'}}}
  const handler=createPaymentsHandler({store,origin,config:{enabled:false},legal:{version:terms},fullCatalog:true,commerceMode:mode,yookassa:mode==='test'?adapter:null,liveYookassa:mode==='live'?adapter:null})
  const server=createServer((req,res)=>handler(req,res,new URL(req.url,origin).pathname))
  await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)))
  const base='http://127.0.0.1:'+server.address().port,headers={cookie:'__Host-bricklab_session='+'a'.repeat(64),origin,'Content-Type':'application/json'}
  const get=path=>fetch(base+path,{headers}),post=(path,data)=>fetch(base+path,{method:'POST',headers,body:JSON.stringify(data)})
  const status=await (await get('/api/commerce/status')).json();assert.equal(status.mode,mode);assert.ok(status.skus.includes('plus-1'))
  const quote=await (await get('/api/commerce/quote?sku=plus-1')).json();assert.equal(quote.mode,mode)
  const payload={sku:'plus-1',amountKopecks:24900,offerVersion:terms,accepted:true,mode}
  assert.equal((await post('/api/commerce/checkout',{...payload,mode:mode==='test'?'live':'test'})).status,400)
  assert.equal((await post('/api/commerce/checkout',payload)).status,200)
  assert.deepEqual(calls[1],[uid,'plus-1',{unified:true,amountKopecks:24900,offerVersion:terms,beta:true}])
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
