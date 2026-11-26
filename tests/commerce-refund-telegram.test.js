import {test} from 'node:test'
import assert from 'node:assert/strict'
import {startCommerceTelegram,commerceEventText} from '../server/commerce-telegram.js'
import {createYookassaAdapter} from '../server/yookassa.js'
const id='30000000-0000-4000-8000-000000000001',payment='40000000-0000-4000-8000-000000000001',refund='50000000-0000-4000-8000-000000000001'
const config={enabled:true,shopId:'123',secret:'test_example_secret'}
const paid={id:payment,test:true,status:'succeeded',paid:true,amount:{currency:'RUB',value:'249.00'},refunded_amount:{currency:'RUB',value:'249.00'},metadata:{order_id:id}}
const returned={id:refund,payment_id:payment,status:'succeeded',amount:{currency:'RUB',value:'249.00'}}
test('sandbox full refund verifies provider amount, identity and test mode before revoking access',async()=>{
 let p=paid,r=returned;const calls=[]
 const a=createYookassaAdapter({config,origin:'https://bricklab.test',store:{refundCommercePayment:async(...args)=>{calls.push(args);return true}},fetcher:async(url,opts)=>{assert.equal(opts.method,'GET');return Response.json(url.endsWith(refund)?r:p)}})
 for(const invalid of [{...paid,test:false},{...paid,refunded_amount:{currency:'RUB',value:'1.00'}},{...paid,paid:false}]){
 p=invalid;await assert.rejects(a.notification({event:'refund.succeeded',object:{id:refund}}))
 }
 assert.equal(calls.length,0);p=paid
 r={...returned,status:'pending'};await assert.rejects(a.notification({event:'refund.succeeded',object:{id:refund}}));r=returned
 await a.notification({event:'refund.succeeded',object:{id:refund}})
 assert.deepEqual(calls,[[payment,'test',24900]])
})
test('explicit sandbox refund reuses stored order idempotency key and verifies full amount',async()=>{
 const requests=[],calls=[]
 const a=createYookassaAdapter({config,origin:'https://bricklab.test',store:{
 requestCommerceTestRefund:async()=>({id,paymentId:payment,amountKopecks:24900,requestedAt:new Date()}),
 attachCommerceTestRefund:async(...args)=>{calls.push(args);return true},
 refundCommercePayment:async(...args)=>{calls.push(args);return true}
 },fetcher:async(url,opts)=>{requests.push([url,opts.method]);if(opts.method==='POST'){assert.equal(opts.headers['Idempotence-Key'],id);assert.deepEqual(JSON.parse(opts.body),{payment_id:payment,amount:{currency:'RUB',value:'249.00'}});return Response.json(returned)}return Response.json(url.endsWith(refund)?returned:requests.some(x=>x[1]==='POST')?paid:{...paid,refunded_amount:{currency:'RUB',value:'0.00'}})}})
 assert.equal((await a.requestTestRefund(id,id)).status,'succeeded')
 assert.equal(requests.filter(x=>x[1]==='POST').length,1)
 assert.deepEqual(calls,[[id,refund],[payment,'test',24900]])
})
test('Telegram sends minimal test operation details and acknowledges only successful delivery',async()=>{
 const e={id:'1',event:'succeeded',environment:'test',order_id:id,user_id:payment,title:'Plus',amount_kopecks:24900,email:'private@example.test'}
 assert.match(commerceEventText(e),/249\.00 ₽/);assert.match(commerceEventText(e),/ТЕСТ/);assert.doesNotMatch(commerceEventText(e),/private@example/)
 const acks=[];let ok=false
 const worker=startCommerceTelegram({store:{claimCommerceEvents:async()=>[e],ackCommerceEvent:async id=>acks.push(id)},config:{enabled:true,token:'12345:example',chat:'123'},logger:{warn(){}},fetcher:async(url,opts)=>{assert.equal(JSON.parse(opts.body).chat_id,'123');return Response.json({ok})}})
 try{await worker.tick();assert.deepEqual(acks,[]);ok=true;await worker.tick();assert.deepEqual(acks,['1'])}finally{await worker.stop()}
})

test('Telegram displays a stable order number, nickname and separate daily gross/refund totals',()=>{
 const e={id:'3',event:'refunded',environment:'test',order_id:id,user_id:payment,order_number:'42',buyer_name:'Builder',title:'Aurora',amount_kopecks:19900,day:'2026-11-26',paid_kopecks:'268900',refunded_kopecks:'19900',paid_count:'2',refund_count:'1',occurred_at:'2026-11-26T05:00:00Z'}
 const text=commerceEventText(e)
 for(const v of ['Builder','BL-000042','2689.00 ₽','199.00 ₽','2490.00 ₽','2026-11-26','МСК','ТЕСТ'])assert.ok(text.includes(v),v)
 assert.ok(!text.includes(payment)&&!text.includes(id))
 assert.match(commerceEventText({...e,environment:'live',event:'succeeded',receipt_status:'pending'}),/Сформируйте чек НПД/)
 assert.match(commerceEventText({...e,environment:'live',receipt_correction_pending:true}),/корректировка чека НПД/)
 assert.doesNotMatch(commerceEventText({...e,buyer_name:'private@example.test'}),/private@example/)
})
