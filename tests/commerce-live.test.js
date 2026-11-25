import {test} from 'node:test'
import assert from 'node:assert/strict'
import {commerceQuote} from '../server/commerce-quote.js'
import {liveCommerceConfig} from '../server/legal-release.js'
import {createYookassaAdapter} from '../server/yookassa.js'
const account={themes:[],badges:[],plus:false}
test('actual quote discounts only eligible purchases and credits paid badge amounts',()=>{
 assert.equal(commerceQuote('slots-30',{...account,plus:true}).amountKopecks,11610)
 assert.equal(commerceQuote('plus-1',{...account,plus:true}).amountKopecks,24900)
 assert.equal(commerceQuote('gold-builder',{...account,badges:['silver-builder']},[{sku:'silver-builder',amountKopecks:27000}]).amountKopecks,32900)
 assert.throws(()=>commerceQuote('carbon',{...account,themes:['carbon']}),/already_owned/)
 assert.throws(()=>commerceQuote('founders-club',account,[],{beta:false}),/unknown_product/)
 assert.throws(()=>commerceQuote('instruction-42215-1',account),/unknown_product/)
})
test('live configuration requires approval and receipt readiness',()=>{
 const env={BRICKLAB_YOOKASSA_LIVE_ENABLED:'true',BRICKLAB_YOOKASSA_LIVE_SHOP_ID:'1',BRICKLAB_YOOKASSA_LIVE_SECRET:'live_example_secret',BRICKLAB_NPD_RECEIPTS_READY:'true'}
 assert.equal(liveCommerceConfig(env,null).enabled,false)
 assert.equal(liveCommerceConfig({...env,BRICKLAB_NPD_RECEIPTS_READY:'false'},{version:'a'.repeat(64)}).enabled,false)
 assert.equal(liveCommerceConfig({...env,BRICKLAB_YOOKASSA_TEST_SHOP_ID:'1'},{version:'a'.repeat(64)}).enabled,false)
})
test('verified live callback cannot settle a sandbox payment',async()=>{
 const payment='40000000-0000-4000-8000-000000000001',order='30000000-0000-4000-8000-000000000001'
 const data={id:payment,test:false,status:'succeeded',paid:true,amount:{value:'99.00',currency:'RUB'},metadata:{order_id:order}}
 const calls=[];let actual=data
 const adapter=createYookassaAdapter({config:{enabled:true,environment:'live',shopId:'1',secret:'live_example_secret'},origin:'https://bricklab.test',store:{fulfillCommercePayment:async(...args)=>{calls.push(args);return true}},fetcher:async()=>Response.json(actual)})
 await adapter.notification({event:'payment.succeeded',object:{id:payment}})
 assert.deepEqual(calls,[[order,payment,'live',9900]])
 actual={...data,test:true};await assert.rejects(adapter.notification({event:'payment.succeeded',object:{id:payment}}))
 assert.equal(calls.length,1)
})
