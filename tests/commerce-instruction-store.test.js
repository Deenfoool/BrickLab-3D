import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {createInstructionPolicy} from '../server/instruction-access.js'
import {createPaymentsHandler} from '../server/payments.js'
import {instructionOrderQuote} from '../server/db/commerce-store.js'
import {instructionProduct} from '../src/menu/commerce-catalog.js'
const pages=[{step:11,regions:[[1,2,10,10,'3001']]}]
const audit=createInstructionPolicy({
 '12345-1':{metadata:{title:'New large model',partCount:601,complete:true},'111':pages},
 '12346-1':{metadata:{title:'Small model',partCount:600,complete:true},'111':pages},
 '12347-1':{metadata:{title:'Incomplete',partCount:1000,complete:false},'111':pages},
 '12348-1':{'111':pages}
})
test('private metadata determines eligible sets and the free threshold',()=>{
 assert.deepEqual(audit.products.map(p=>p.setId),['12345-1'])
 for(const setId of ['12346-1','12347-1','12348-1']){
  assert.equal(audit.access({setId,book:'https://www.lego.com/biassets/bi/111.pdf',page:1,release:true}).interactive,true)
 }
 assert.equal(audit.access({setId:'12345-1',book:'https://www.lego.com/biassets/bi/111.pdf',page:1,release:true}).interactive,false)
})
test('instruction quote recomputes price and rejects wrong SKU, small sets and duplicate access',()=>{
 const p=instructionProduct('12345-1','Large model',601),account={instructions:[],plus:false}
 assert.equal(instructionOrderQuote(p.id,account,{...p,priceKopecks:1}).amountKopecks,7900)
 assert.equal(instructionOrderQuote(p.id,{...account,plus:true},p).amountKopecks,7110)
 assert.throws(()=>instructionOrderQuote('instruction-12346-1',account,p),/unknown_product/)
 assert.throws(()=>instructionOrderQuote(p.id,account,{...p,partCount:600}),/unknown_product/)
 assert.throws(()=>instructionOrderQuote(p.id,{...account,instructions:[p.setId]},p),/already_owned/)
})
test('sandbox lists multiple SKUs; live checkout accepts completed large audit only',async t=>{
 const origin='https://bricklab.test',terms='a'.repeat(64)
 for(const [mode,release] of [['test',false],['live',false],['live',true]]){
  const calls=[],account={instructions:[],plus:false}
  const store={storeCatalog:async()=>[],getSession:async()=>({id:'fixture',admin:true}),commerceAccount:async()=>account,quoteCommerce:async(uid,sku,version,beta,environment,p)=>({...instructionOrderQuote(sku,account,p),offerVersion:version})}
  const adapter={enabled:true,checkout:async(...args)=>{calls.push(args);return {mode,status:'pending'}}}
  const handler=createPaymentsHandler({store,origin,config:{enabled:false},legal:{version:terms},fullCatalog:true,commerceMode:mode,instructionRelease:release,instructionPolicy:audit,yookassa:adapter,liveYookassa:adapter})
  const server=createServer((req,res)=>handler(req,res,new URL(req.url,origin).pathname))
  await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)))
  const base='http://127.0.0.1:'+server.address().port,headers={cookie:'__Host-bricklab_session='+'a'.repeat(64),origin,'Content-Type':'application/json'}
  const get=path=>fetch(base+path,{headers}),post=data=>fetch(base+'/api/commerce/checkout',{method:'POST',headers,body:JSON.stringify(data)})
  const catalog=await(await get('/api/store/catalog')).json()
  assert.ok(catalog.instructions.length>=14);assert.ok(catalog.instructions.every(p=>p.partCount>600))
  const status=await(await get('/api/commerce/status')).json()
  assert.equal(status.skus.includes('instruction-42154-1'),mode==='test')
  assert.equal(status.skus.includes('instruction-12345-1'),mode==='test'||release)
  assert.ok(!status.skus.includes('instruction-12346-1'))
  const sku='instruction-12345-1',payload={sku,amountKopecks:7900,offerVersion:terms,accepted:true,mode}
  assert.equal((await get('/api/commerce/quote?sku='+sku)).status,mode==='test'||release?200:404)
  assert.equal((await post({...payload,partCount:601})).status,400)
  assert.equal((await post({...payload,sku:'instruction-12346-1'})).status,400)
  assert.equal((await post(payload)).status,mode==='test'||release?200:400)
  if(mode==='test'||release)assert.equal(calls[0][2].instructionProduct.setId,'12345-1')
 }
})
