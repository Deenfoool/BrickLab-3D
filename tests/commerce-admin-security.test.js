import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {createPaymentsHandler} from '../server/payments.js'
import {financeCsv,validExportRange} from '../server/commerce-export.js'
const origin='https://bricklab.test',uid='10000000-0000-4000-8000-000000000001',order='20000000-0000-4000-8000-000000000001'
test('finance export validates actual dates and escapes spreadsheet formulas',()=>{
 assert.equal(validExportRange('2026-02-29','2026-03-01'),false)
 assert.equal(validExportRange('2026-01-01','2026-02-01'),false)
 assert.equal(validExportRange('2026-01-01','2026-01-31'),true)
 const csv=financeCsv([{sku:' =2+2',payment_id:'a"b',amount_kopecks:-100,provider_income_kopecks:null}],'live')
 assert.ok(csv.includes("\"' =2+2\""));assert.ok(csv.includes('"a""b"'));assert.ok(csv.includes('"-100"'));assert.ok(!csv.includes('null'))
})
test('admin export and refund require authorization, origin and durable start audit',async t=>{
 let admin=false,fail=false,failProvider=false,refunds=0,exports=0,large=false;const audit=[]
 const store={getSession:async()=>({id:uid,admin}),commerceAdminAudit:async(...a)=>{if(fail)throw Error('audit unavailable');audit.push(a)},commerceAdminExport:async()=>{exports++;return large?Array(10001).fill({}):[]},commerceAdminAuditList:async()=>[]}
 const adapter={enabled:true,requestRefund:async()=>{refunds++;if(failProvider)throw Error('provider failed');return {status:'pending'}}}
 const handler=createPaymentsHandler({store,origin,config:{enabled:false},commerceMode:'live',liveYookassa:adapter,logger:{error(){}}})
 const server=createServer((req,res)=>handler(req,res,new URL(req.url,origin).pathname));await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)))
 const base='http://127.0.0.1:'+server.address().port,headers={cookie:'__Host-bricklab_session='+'a'.repeat(64),origin,'Content-Type':'application/json'}
 const post=(path,data,extra={})=>fetch(base+path,{method:'POST',headers:{...headers,...extra},body:JSON.stringify(data)})
 const exp={environment:'live',from:'2026-11-01',to:'2026-11-28'},refund={orderId:order,confirm:true,mode:'live'}
 assert.equal((await post('/api/commerce/admin-export',exp)).status,403)
 assert.equal((await fetch(base+'/api/commerce/admin-audit?environment=live',{headers})).status,403)
 admin=true;assert.equal((await post('/api/commerce/admin-export',exp,{origin:'https://evil.invalid'})).status,403)
 assert.equal((await post('/api/commerce/refund',refund,{origin:'https://evil.invalid'})).status,403)
 assert.equal((await post('/api/commerce/admin-export',{...exp,to:'2027-01-01'})).status,400)
 fail=true;assert.equal((await post('/api/commerce/refund',refund)).status,503);assert.equal(refunds,0)
 fail=false;assert.equal((await post('/api/commerce/refund',refund)).status,200)
 assert.deepEqual(audit.map(a=>a[5]),['started','succeeded']);assert.equal(audit[0][1],audit[1][1])
 failProvider=true;assert.equal((await post('/api/commerce/refund',refund)).status,503);assert.deepEqual(audit.slice(-2).map(a=>a[5]),['started','failed'])
 const response=await post('/api/commerce/admin-export',exp);assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/text\/csv/);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(exports,1)
 large=true;assert.equal((await post('/api/commerce/admin-export',exp)).status,409);assert.deepEqual(audit.slice(-2).map(a=>a[5]),['started','failed'])
})

test('browser congestion leaves capacity for provider notifications',async t=>{
 let release,enteredAll,entered=0,notifications=0
 const held=new Promise(r=>release=r),ready=new Promise(r=>enteredAll=r)
 const store={storeCatalog:async()=>{if(++entered===8)enteredAll();await held;return []}}
 const adapter={enabled:true,notification:async()=>{notifications++;return {ok:true}}}
 const handler=createPaymentsHandler({store,origin,config:{enabled:false},liveYookassa:adapter})
 const server=createServer((req,res)=>handler(req,res,new URL(req.url,origin).pathname))
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)))
 const base='http://127.0.0.1:'+server.address().port
 const requests=Array.from({length:8},()=>fetch(base+'/api/store/catalog'))
 try{
  await ready
  assert.equal((await fetch(base+'/api/store/catalog')).status,429)
  const callback=await fetch(base+'/api/payments/yookassa/live-result',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})
  assert.equal(callback.status,200);assert.equal(notifications,1)
 }finally{release();await Promise.all(requests)}
})
