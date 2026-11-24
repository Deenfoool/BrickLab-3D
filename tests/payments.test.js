import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {createServer} from 'node:http'
import {paymentConfig,amountKopecks,makeTestCheckout,verifyTestResult,createPaymentsHandler} from '../server/payments.js'
const env={BRICKLAB_PAYMENTS_ENABLED:'true',BRICKLAB_ROBOKASSA_TEST:'true',BRICKLAB_ROBOKASSA_LOGIN:'bricklab-test',BRICKLAB_ROBOKASSA_HASH:'sha256',BRICKLAB_ROBOKASSA_TEST_PASSWORD1:'test_password_1',BRICKLAB_ROBOKASSA_TEST_PASSWORD2:'test_password_2'}
const cfg=paymentConfig(env)
const hash=s=>createHash('sha256').update(s).digest('hex')
const result=(sum='99.000000',id='1',pass=cfg.p2)=>new URLSearchParams({OutSum:sum,InvId:id,SignatureValue:hash(sum+':'+id+':'+pass)})
test('test-only configuration and exact decimal amounts',()=>{
 assert.equal(cfg.enabled,true)
 for(const overrides of [{BRICKLAB_PAYMENTS_ENABLED:'false'},{BRICKLAB_ROBOKASSA_TEST:'false'},{BRICKLAB_ROBOKASSA_TEST_PASSWORD2:''},{BRICKLAB_ROBOKASSA_HASH:'md5'},{BRICKLAB_ROBOKASSA_PASSWORD1:cfg.p2}])assert.equal(paymentConfig({...env,...overrides}).enabled,false)
 for(const [input,value] of [['99',9900],['99.00',9900],['99.000000',9900],['1.09',109],['0.01',1]])assert.equal(amountKopecks(input),value)
 for(const input of ['0','-99','99.001','1e2','NaN','99,00',' 99','99.','100000.01'])assert.equal(amountKopecks(input),null)
})
test('checkout signs fixed test parameters, callback rejects bad and duplicate values',()=>{
 const u=new URL(makeTestCheckout(cfg,{invoice:1,amountKopecks:9900,status:'pending'},'Carbon'))
 assert.equal(u.origin,'https://auth.robokassa.ru');assert.equal(u.searchParams.get('IsTest'),'1');assert.equal(u.searchParams.get('OutSum'),'99.00')
 assert.equal(u.searchParams.get('SignatureValue'),hash('bricklab-test:99.00:1:'+cfg.p1))
 assert.deepEqual(verifyTestResult(result(),cfg),{invoice:1,amount:9900})
 assert.equal(verifyTestResult(result('99.00','1',cfg.p1),cfg),null)
 const duplicate=result();duplicate.append('OutSum','149.00');assert.equal(verifyTestResult(duplicate,cfg),null)
 const custom=result();custom.set('Shp_item','neon');assert.equal(verifyTestResult(custom,cfg),null)
 assert.equal(verifyTestResult(result('99.001'),cfg),null)
 assert.equal(verifyTestResult(result('99','2147483648'),cfg),null)
 assert.equal(verifyTestResult(result(),{...cfg,enabled:false}),null)
})
test('HTTP checkout is admin-only, CSRF protected and never trusts return page or customer price',async t=>{
 const calls=[],adminToken='a'.repeat(64),userToken='b'.repeat(64),uid='owner'
 const store={storeCatalog:async()=>[{sku:'carbon',title:'Carbon',amountKopecks:9900}],getSession:async key=>key===hash(adminToken)?{id:uid,admin:true}:key===hash(userToken)?{id:'reader'}:null,
 createTestOrder:async (owner,sku)=>{calls.push(['order',owner,sku]);return {invoice:1,sku,amountKopecks:9900,status:'pending'}},
 confirmTestOrder:async(invoice,amount)=>{calls.push(['confirm',invoice,amount]);return invoice===1&&amount===9900},testOrders:async()=>[],testFinance:async()=>({stats:{},orders:[]})}
 const origin='https://bricklab.example'
 const handler=createPaymentsHandler({store,origin,config:cfg})
 const server=createServer(async(req,res)=>{if(!await handler(req,res,new URL(req.url,origin).pathname)){res.writeHead(404);res.end()}})
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>{server.closeAllConnections();server.close()})
 const base='http://127.0.0.1:'+server.address().port
 const post=(data,token=adminToken,from=origin)=>fetch(base+'/api/store/orders',{method:'POST',headers:{Origin:from,Cookie:'__Host-bricklab_session='+token,'Content-Type':'application/json'},body:JSON.stringify(data)})
 assert.equal((await fetch(base+'/api/store/catalog')).status,200)
 assert.equal((await post({sku:'carbon',testConsent:true},userToken)).status,403)
 assert.equal((await post({sku:'carbon',testConsent:true},adminToken,'https://evil.example')).status,403)
 assert.equal((await post({sku:'carbon',testConsent:true,amountKopecks:1})).status,400)
 assert.equal((await post({sku:'carbon',testConsent:true})).status,200)
 assert.deepEqual(calls,[['order',uid,'carbon']])
 assert.equal((await fetch(base+'/api/store/finance',{headers:{Cookie:'__Host-bricklab_session='+userToken}})).status,403)
 const notify=p=>fetch(base+'/api/payments/robokassa/result',{method:'POST',body:p})
 assert.equal((await notify(result('1.00'))).status,409)
 const r=await notify(result());assert.equal(r.status,200);assert.equal(await r.text(),'OK1')
 assert.equal((await notify(result('99','1',cfg.p1))).status,400)
 assert.equal((await fetch(base+'/api/payments/robokassa/result?'+result())).status,405)
 assert.equal((await fetch(base+'/payment/success?'+result())).status,404)
})
