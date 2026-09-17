import test from 'node:test'
import assert from 'node:assert/strict'
import { canonicalLDrawCode, canonicalLDrawFile } from '../ldraw/part-aliases-v1.js'
import { recoverLDrawDesignId } from '../ldraw/direct-id-recovery-v1.js'
import { createLDrawTextTransport } from '../ldraw/text-transport-v1.js'

test('BrickLink 62821b resolves to the current official LDraw 62821',()=>{
  assert.equal(canonicalLDrawCode('62821b'),'62821')
  assert.equal(canonicalLDrawFile('62821b.dat'),'62821.dat')
  assert.equal(canonicalLDrawFile('parts/62821b.dat'),'parts/62821.dat')
})

test('direct ID recovery keeps the requested alias searchable but loads canonical geometry',async()=>{
  const calls=[]
  const result=await recoverLDrawDesignId('62821b',{
    currentIndex:[],
    getIndex:async()=>[{code:'62821',file:'62821.dat',description:'Technic Differential with One Gear 28 Tooth Bevel',category:'Technic'}],
    getMetadata:async file=>{
      calls.push(file)
      return{file:'62821.dat',code:'62821',description:'Technic Differential with One Gear 28 Tooth Bevel',category:'Technic',type:'Part'}
    },
  })
  assert.deepEqual(calls,['62821.dat'])
  assert.equal(result.code,'62821b')
  assert.equal(result.canonicalCode,'62821')
  assert.equal(result.aliasOf,'62821')
  assert.equal(result.file,'62821.dat')
  assert.equal(result.unofficial,false)
  assert.equal(result.recoveredBy,'design-id-alias')
})

test('text transport never probes flattened unofficial 62821b when alias is requested',async()=>{
  const urls=[]
  const official='https://official.example/'
  const unofficial='https://unofficial.example/'
  const fetcher=async url=>{
    urls.push(String(url))
    if(String(url)===`${official}parts/62821.dat`)return new Response('0 Technic Differential with One Gear 28 Tooth Bevel\n0 Name: 62821.dat\n0 !LDRAW_ORG Part',{status:200})
    return new Response('not found',{status:404})
  }
  const transport=createLDrawTextTransport({fetcher,mirrors:[official,unofficial],timeoutMs:1000})
  const text=await transport.read('parts/62821b.dat')
  assert.match(text,/Name: 62821\.dat/)
  assert.deepEqual(urls,[`${official}parts/62821.dat`])
  assert.equal(transport.stats().aliasHits,1)
})
