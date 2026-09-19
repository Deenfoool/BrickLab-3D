import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createCachedShadowTextFetcher,
  NATIVE_SHADOW_SOURCE,
} from '../mechanics-next/ldraw/native-connectivity-provider.js'

function response(text,{status=200}={}){
  return{
    status,
    ok:status>=200&&status<300,
    async text(){return text},
    clone(){return response(text,{status})},
  }
}

test('pinned Shadow fetcher persists successful metadata and reuses it without network',async()=>{
  const store=new Map()
  const cache={
    async match(url){return store.get(String(url))??null},
    async put(url,value){store.set(String(url),value)},
  }
  const cacheNames=[]
  const cachesImpl={
    async open(name){
      cacheNames.push(name)
      return cache
    },
  }
  let networkCalls=0
  const fetchImpl=async url=>{
    networkCalls+=1
    return response('0 !LDCAD SNAP_CYL [gender=M] [caps=none] [secs=A 6 40]')
  }
  const first=createCachedShadowTextFetcher({fetchImpl,cachesImpl})
  const url='https://example.invalid/parts/3705.dat'
  assert.match(await first(url),/SNAP_CYL/)
  assert.equal(networkCalls,1)
  assert.equal(store.size,1)
  assert.ok(cacheNames[0].includes(NATIVE_SHADOW_SOURCE.commit))

  const offline=createCachedShadowTextFetcher({
    fetchImpl:async()=>{throw new Error('network must not be used after cache warmup')},
    cachesImpl,
  })
  assert.match(await offline(url),/SNAP_CYL/)
  assert.equal(networkCalls,1)
})

test('Shadow cache never turns a 404 into fabricated connector metadata',async()=>{
  const cache={async match(){return null},async put(){throw new Error('404 must not be cached')}}
  const fetcher=createCachedShadowTextFetcher({
    fetchImpl:async()=>response('',{status:404}),
    cachesImpl:{async open(){return cache}},
  })
  assert.equal(await fetcher('https://example.invalid/missing.dat'),null)
})

test('Shadow network errors remain fail-closed when no persistent cache exists',async()=>{
  const fetcher=createCachedShadowTextFetcher({
    fetchImpl:async()=>{throw new Error('offline')},
    cachesImpl:{async open(){return{async match(){return null}}}},
  })
  await assert.rejects(
    ()=>fetcher('https://example.invalid/uncached.dat'),
    /offline/,
  )
})
