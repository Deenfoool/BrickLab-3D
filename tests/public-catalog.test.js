import test from 'node:test'
import assert from 'node:assert/strict'
import { createRebrickableHandler } from '../server/rebrickable.js'
import { createCspReportHandler } from '../server/csp-report.js'
import { Readable } from 'node:stream'

function response(){return {headers:{},setHeader(k,v){this.headers[k]=v},writeHead(status,headers){this.status=status;Object.assign(this.headers,headers)},end(body){this.body=body}}}
async function call(handler,path,method='GET',body=''){
  const req=Readable.from([Buffer.from(body)])
  Object.assign(req,{url:path,method,headers:{}})
  const res=response()
  assert.equal(await handler(req,res,path.split('?')[0]),true)
  return res
}
test('catalog is disabled without server key',async()=>{
  const h=createRebrickableHandler()
  assert.deepEqual(JSON.parse((await call(h,'/api/rebrickable/config')).body),{enabled:false})
  assert.equal((await call(h,'/api/rebrickable/lego/sets/')).status,503)
})
test('catalog limits routes and never forwards arbitrary parameters',async()=>{
  const h=createRebrickableHandler({apiKey:'test',fetcher:()=>assert.fail('unexpected fetch')})
  for(const p of ['users/','lego/sets/?key=secret','lego/sets/?page_size=1001','lego/sets/?page=1&page=2'])assert.equal((await call(h,'/api/rebrickable/'+p)).status,400)
  assert.equal((await call(h,'/api/rebrickable/lego/sets/','POST')).status,405)
})
test('catalog authenticates upstream, rewrites pagination, caches repeated requests',async()=>{
  let n=0
  const h=createRebrickableHandler({apiKey:'private-test-key',spacing:0,fetcher:async(url,opts)=>{
    n++;assert.equal(url.origin,'https://rebrickable.com');assert.equal(opts.headers.Authorization,'key private-test-key');assert.equal(opts.redirect,'error')
    return Response.json({results:[],next:'https://rebrickable.com/api/v3/lego/sets/?page=2&key=private-test-key',previous:null})
  }})
  const p='/api/rebrickable/lego/sets/?page=1'
  const a=await call(h,p),b=await call(h,p)
  assert.equal(a.status,200);assert.equal(a.body,b.body);assert.equal(n,1)
  assert.equal(JSON.parse(a.body).next,'/api/rebrickable/lego/sets/?page=2')
  assert.ok(!a.body.includes('private-test-key'))
})
test('CSP reports log only the allowed directive',async()=>{
  const log=[]
  const h=createCspReportHandler({logger:{warn:(...args)=>log.push(args)}})
  const r=await call(h,'/api/csp-report','POST',JSON.stringify({'csp-report':{'effective-directive':'img-src','document-uri':'https://example.test/?secret=1'}}))
  assert.equal(r.status,204);assert.deepEqual(log,[['CSP violation:','img-src']])
})
