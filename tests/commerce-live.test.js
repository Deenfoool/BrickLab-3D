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
 const adapter=createYookassaAdapter({config:{enabled:true,environment:'live',shopId:'1',secret:'live_example_secret'},origin:'https://bricklab.test',store:{settleVerifiedCommercePayment:async(...args)=>{calls.push(args);return true}},fetcher:async()=>Response.json(actual)})
 await adapter.notification({event:'payment.succeeded',object:{id:payment}})
 assert.deepEqual(calls,[[order,payment,'live',9900,false]])
 actual={...data,test:true};await assert.rejects(adapter.notification({event:'payment.succeeded',object:{id:payment}}))
 assert.equal(calls.length,1)
})

test('live refund polling verifies provider state and settles lost webhook without creating another refund',async()=>{
 const payment='40000000-0000-4000-8000-000000000001',order='30000000-0000-4000-8000-000000000001',refund='50000000-0000-4000-8000-000000000001';
 const paid={id:payment,test:false,status:'succeeded',paid:true,amount:{value:'99.00',currency:'RUB'},refunded_amount:{value:'99.00',currency:'RUB'},metadata:{order_id:order}};
 const returned={id:refund,payment_id:payment,status:'succeeded',amount:{currency:'RUB',value:'99.00'}};
 let current=returned,source=paid;const calls=[];
 const adapter=createYookassaAdapter({origin:'https://bricklab.test',config:{enabled:true,environment:'live',shopId:'1',secret:'live_example_secret'},store:{refundCommercePayment:async(...a)=>{calls.push(a);return true}},fetcher:async(url,opts)=>{assert.equal(opts.method,'GET');return Response.json(url.endsWith(refund)?current:source)}});
 const row={id:order,paymentId:payment,refundId:refund,amountKopecks:9900};
 current={...returned,status:'pending'};assert.equal(await adapter.pollRefund(row),'pending');assert.equal(calls.length,0);
 current={...returned,payment_id:order};await assert.rejects(adapter.pollRefund(row));
 current=returned;source={...paid,test:true};await assert.rejects(adapter.pollRefund(row));
 source=paid;assert.equal(await adapter.pollRefund(row),'succeeded');assert.deepEqual(calls,[[payment,'live',9900]]);
 await assert.rejects(adapter.pollTestRefund(row));
});

test('provider-confirmed full refund settles atomically and lost refund response is recovered read-only',async()=>{
 const id='30000000-0000-4000-8000-000000000001',payment='40000000-0000-4000-8000-000000000001',refund='50000000-0000-4000-8000-000000000001'
 const paid={id:payment,test:false,status:'succeeded',paid:true,amount:{value:'99.00',currency:'RUB'},metadata:{order_id:id},refunded_amount:{value:'99.00',currency:'RUB'}}
 let current=paid,existing=false;const calls=[]
 const adapter=createYookassaAdapter({origin:'https://bricklab.test',config:{enabled:true,environment:'live',shopId:'1',secret:'live_example_secret'},store:{
  settleVerifiedCommercePayment:async(...a)=>{calls.push(['settle',...a]);return true},
  refundCommercePayment:async(...a)=>{calls.push(['refund',...a]);return existing}
 },fetcher:async(url,opts)=>{assert.equal(opts.method,'GET');return Response.json(url.endsWith(refund)?{id:refund,payment_id:payment,status:'succeeded',amount:paid.amount}:current)}})
 await adapter.notification({event:'payment.succeeded',object:{id:payment}})
 assert.deepEqual(calls.pop(),['settle',id,payment,'live',9900,true])
 await adapter.notification({event:'refund.succeeded',object:{id:refund}})
 assert.deepEqual(calls.splice(0),[['refund',payment,'live',9900],['settle',id,payment,'live',9900,true]])
 existing=true;const row={id,paymentId:payment,amountKopecks:9900,refundId:null}
 current={...paid,refunded_amount:{value:'0.00',currency:'RUB'}};assert.equal(await adapter.pollRefund(row),'pending')
 current={...paid,refunded_amount:{value:'1.00',currency:'RUB'}};await assert.rejects(adapter.pollRefund(row),/partial_refund/)
 current=paid;assert.equal(await adapter.pollRefund(row),'succeeded')
 assert.deepEqual(calls,[['refund',payment,'live',9900]])
})

test('provider income is optional, validated and never taken from webhook payload',async()=>{
 const order='30000000-0000-4000-8000-000000000001',payment='40000000-0000-4000-8000-000000000001';
 const paid={id:payment,test:false,status:'succeeded',paid:true,amount:{value:'100.00',currency:'RUB'},metadata:{order_id:order}};
 let value={...paid,income_amount:{value:'95.73',currency:'RUB'}};const calls=[];
 const adapter=createYookassaAdapter({origin:'https://bricklab.test',config:{enabled:true,environment:'live',shopId:'1',secret:'live_example_secret'},store:{settleVerifiedCommercePayment:async(...a)=>{calls.push(a);return true},settleVerifiedCommerceIncome:async(...a)=>{calls.push(a);return true}},fetcher:async()=>Response.json(value)});
 const notify=()=>adapter.notification({event:'payment.succeeded',object:{id:payment,income_amount:{value:'1.00',currency:'RUB'}}});
 await notify();assert.deepEqual(calls.pop(),[order,payment,'live',10000,false,9573]);
 for(const invalid of [undefined,{value:'101.00',currency:'RUB'},{value:'95.731',currency:'RUB'},{value:'95.73',currency:'USD'}]){value={...paid,income_amount:invalid};await notify();assert.deepEqual(calls.pop(),[order,payment,'live',10000,false])}
 value={...paid,income_amount:{value:'0.00',currency:'RUB'}};await notify();assert.deepEqual(calls.pop(),[order,payment,'live',10000,false,0]);
});
test('existing price rules preserve actual badge credit, collection discount and fixed subscription price',()=>{
 const partial={...account,plus:true,badges:['bronze-builder','silver-builder'],themes:['carbon','neon']};
 assert.equal(commerceQuote('gold-builder',partial,[{sku:'bronze-builder',amountKopecks:14900},{sku:'silver-builder',amountKopecks:15000}]).amountKopecks,27000);
 assert.equal(commerceQuote('plus-12',partial).amountKopecks,249000);
 assert.ok(commerceQuote('theme-collection',partial).amountKopecks<69900);
 assert.throws(()=>commerceQuote('carbon',partial),/already_owned/);
});

test('operator recovery cannot attach unrelated provider payments and uses GET only',async()=>{
 const order='30000000-0000-4000-8000-000000000001',payment='40000000-0000-4000-8000-000000000001';
 const pending={id:payment,test:false,status:'pending',paid:false,amount:{value:'99.00',currency:'RUB'},metadata:{order_id:order}};
 let value=pending;const calls=[];
 const adapter=createYookassaAdapter({origin:'https://bricklab.test',config:{enabled:true,environment:'live',shopId:'1',secret:'live_example_secret'},store:{
 attachCommercePayment:async(...a)=>{calls.push(['attach',...a]);return true},
 settleVerifiedCommercePayment:async(...a)=>{calls.push(['settle',...a]);return true},
 cancelVerifiedCommercePayment:async(...a)=>{calls.push(['cancel',...a]);return true}
 },fetcher:async(url,opts)=>{assert.equal(opts.method,'GET');assert.ok(url.endsWith(payment));return Response.json(value)}});
 const row={id:order,amountKopecks:9900,status:'pending',paymentId:null};
 for(const bad of [{...pending,test:true},{...pending,metadata:{order_id:payment}},{...pending,amount:{value:'1.00',currency:'RUB'}}]){value=bad;await assert.rejects(adapter.recoverPayment(row,payment))}
 assert.equal(calls.length,0);
 value=pending;assert.equal(await adapter.recoverPayment(row,payment),'pending');assert.deepEqual(calls.pop(),['attach',order,payment,'live']);
 value={...pending,status:'succeeded',paid:true};assert.equal(await adapter.recoverPayment(row,payment),'succeeded');assert.deepEqual(calls.pop(),['settle',order,payment,'live',9900,false]);
 value={...pending,status:'canceled'};assert.equal(await adapter.recoverPayment(row,payment),'canceled');assert.deepEqual(calls.pop(),['cancel',order,payment,'live',9900]);
 await assert.rejects(adapter.recoverPayment({...row,paymentId:order},payment));
});
