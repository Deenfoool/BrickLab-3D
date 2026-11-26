import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {createPaymentsHandler} from '../server/payments.js'
import {createReceiptMailer,startReceiptDelivery,validNpdReceiptUrl} from '../server/receipt-delivery.js'
const receipt='https://lknpd.nalog.ru/api/v1/receipt/000000000000/fixture123/print'
const order={id:'order',order_number:'42',title:'Plus',amount_kopecks:24900,email:'buyer@example.test',receipt_url:receipt}
test('receipt links accept only the public FNS receipt format',()=>{
 assert.equal(validNpdReceiptUrl(receipt),true)
 for(const invalid of ['https://evil.example/api/v1/receipt/000000000000/fixture123/print','https://lknpd.nalog.ru.evil.example/api/v1/receipt/000000000000/fixture123/print','https://lknpd.nalog.ru@evil.example/api/v1/receipt/000000000000/fixture123/print','http://lknpd.nalog.ru/api/v1/receipt/000000000000/fixture123/print',receipt+'?extra=1','https://lknpd.nalog.ru/',null])assert.equal(validNpdReceiptUrl(invalid),false)
})
test('receipt email sends an externally issued FNS link, not a fabricated tax receipt',async()=>{
 const sent=[]
 const mail=createReceiptMailer({BRICKLAB_MAIL_USER:'user',BRICKLAB_MAIL_KEY:'secret',BRICKLAB_MAIL_FROM:'shop@example.test'},async d=>sent.push(d))
 await mail(order)
 assert.equal(sent.length,1);assert.equal(sent[0].to,order.email)
 assert.match(sent[0].subject,/BL-000042/);assert.ok(sent[0].text.includes(receipt));assert.match(sent[0].text,/249\.00 ₽/)
 await assert.rejects(mail({...order,receipt_url:'https://evil.example'}))
 assert.equal(sent.length,1)
 assert.equal(createReceiptMailer({}),null)
})
test('receipt worker acknowledges only accepted messages and retries after failure',async()=>{
 const ack=[];let fail=true
 const worker=startReceiptDelivery({store:{claimCommerceReceiptDeliveries:async()=>[order],ackCommerceReceiptDelivery:async(...args)=>{ack.push(args);return true}},mailer:async()=>{if(fail)throw Error('mail_failure')},logger:{warn(){}}})
 try{await worker.tick();assert.deepEqual(ack,[]);fail=false;await worker.tick();assert.deepEqual(ack,[[order.id,receipt]])}finally{await worker.stop()}
})

test('receipt registration requires admin, same origin and explicit confirmation',async t=>{
 let admin=true;const calls=[]
 const origin='https://bricklab.test',uid='30000000-0000-4000-8000-000000000001'
 const store={getSession:async()=>({id:uid,admin}),registerCommerceReceipt:async(...args)=>{calls.push(args);return true},commerceAdminLedger:async()=>[],commerceAdminDayTotals:async()=>({paid_kopecks:'0'})}
 const handler=createPaymentsHandler({store,origin,config:{enabled:false}})
 const server=createServer((req,res)=>handler(req,res,new URL(req.url,origin).pathname))
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)))
 const base='http://127.0.0.1:'+server.address().port
 const headers={cookie:'__Host-bricklab_session='+'a'.repeat(64),origin,'Content-Type':'application/json'}
 const post=(data,extra={})=>fetch(base+'/api/commerce/admin-register-receipt',{method:'POST',headers:{...headers,...extra},body:JSON.stringify(data)})
 const d={orderId:uid,url:receipt,confirm:true}
 assert.equal((await post({...d,confirm:false})).status,400)
 assert.equal((await post({...d,url:'https://evil.example'})).status,400)
 assert.equal((await post(d,{origin:'https://evil.example'})).status,403)
 admin=false;assert.equal((await post(d)).status,403);admin=true
 assert.equal((await post(d)).status,200);assert.deepEqual(calls,[[uid,uid,receipt]])
 const finance=await (await fetch(base+'/api/commerce/admin-ledger?environment=live',{headers})).json()
 assert.deepEqual(finance,{orders:[],totals:{paid_kopecks:'0'}})
})
