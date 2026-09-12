import test from 'node:test'
import assert from 'node:assert/strict'
import { LDrawLoader } from 'three/addons/loaders/LDrawLoader.js'
import { LDrawConditionalLineMaterial } from 'three/addons/materials/LDrawConditionalLineMaterial.js'
import { installLDrawCacheRecovery,retryLoad,withLoadDeadline,parseCompleteLDraw } from '../ldraw/load-recovery-v1.js'
import { createLDrawTextTransport } from '../ldraw/text-transport-v1.js'
const part='0 Test part\n0 !LDRAW_ORG Part\n3 16 0 0 0 20 0 0 0 20 0\n'
test('Transport falls back to the same library mirror and deduplicates requests',async()=>{
  let calls=0
  const transport=createLDrawTextTransport({mirrors:['primary/','mirror/'],fetcher:async url=>{calls++;return url.startsWith('primary')?new Response('',{status:503}):new Response(part)}})
  const [a,b]=await Promise.all([transport.read('parts/test.dat'),transport.read('parts/test.dat')])
  assert.equal(a,part);assert.equal(a,b);assert.equal(calls,2)
  await transport.read('parts/test.dat');assert.equal(calls,2)
})
test('Timeout aborts stalled requests and permits a subsequent retry',async()=>{
  let hanging=true
  const transport=createLDrawTextTransport({mirrors:['test/'],timeoutMs:10,fetcher:async(_,options)=>hanging?new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(Error('aborted')))):new Response(part)})
  await assert.rejects(transport.read('parts/test.dat'),/aborted/)
  hanging=false;assert.equal(await transport.read('parts/test.dat'),part)
})
test('404 and HTML responses are not permanently cached or parsed as geometry',async()=>{
  let body='<html>error</html>'
  const transport=createLDrawTextTransport({mirrors:['test/'],fetcher:async()=>new Response(body)})
  await assert.rejects(transport.read('parts/test.dat'),/Invalid LDraw response/)
  body=part;assert.equal(await transport.read('parts/test.dat'),part)
  await assert.rejects(transport.read('parts/../secret.dat'),/traversal/)
})
test('Known subpart and hi-res primitive prefixes avoid speculative directory searches',async()=>{
  const paths=[];const transport=createLDrawTextTransport({mirrors:['test/'],fetcher:async url=>{paths.push(url);return new Response(part)}})
  await transport.subpart('s\\test.dat');await transport.subpart('48/test.dat')
  assert.deepEqual(paths,['test/parts/s/test.dat','test/p/48/test.dat'])
})
test('Actual Three LDraw parser recovers from a rejected child cache entry',async()=>{
  const loader=installLDrawCacheRecovery(new LDrawLoader());loader.setConditionalLineMaterial(LDrawConditionalLineMaterial);loader.addDefaultMaterials()
  let failures=1,calls=0
  loader.partsCache.parseCache.fetchData=async()=>{calls++;if(failures-- >0)throw Error('temporary network loss');return part}
  const root='0 Parent\n0 !LDRAW_ORG Part\n1 16 0 0 0 1 0 0 0 1 0 0 0 1 child.dat\n'
  const parse=()=>parseCompleteLDraw(loader,root)
  const model=await retryLoad(parse)
  let meshes=0;model.traverse(node=>{if(node.isMesh)meshes++})
  assert.ok(meshes>0);assert.equal(calls,2)
  await parse();assert.equal(calls,2,'successful child cache survives recovery')
})
test('Geometry cache evicts rejected promises but keeps successful entries',async()=>{
  const cache={_cache:{good:{value:1}},async loadModel(file){this._cache[file]??=Promise.reject(Error('broken'));return this._cache[file]}}
  installLDrawCacheRecovery({partsCache:Object.assign(cache,{parseCache:{_cache:{},async ensureDataLoaded(){}}})})
  await assert.rejects(cache.loadModel('bad'));await Promise.resolve()
  assert.equal(cache._cache.bad,undefined);assert.deepEqual(cache._cache.good,{value:1})
})
test('Missing nested geometry cannot silently produce a partial model',async()=>{
  const loader=installLDrawCacheRecovery(new LDrawLoader());loader.setConditionalLineMaterial(LDrawConditionalLineMaterial);loader.addDefaultMaterials()
  const nested='0 Nested\n0 !LDRAW_ORG Part\n1 16 0 0 0 1 0 0 0 1 0 0 0 1 missing.dat\n'
  loader.partsCache.parseCache.fetchData=async file=>{if(file==='nested.dat')return nested;throw Error('Missing nested geometry')}
  const root=part+'1 16 0 0 0 1 0 0 0 1 0 0 0 1 nested.dat\n'
  await assert.rejects(parseCompleteLDraw(loader,root),/Missing nested geometry/)
})
test('Deadline rejects placement wait without allowing a late completion to insert',async()=>{
  let resolve,placed=0
  const task=new Promise(r=>{resolve=r})
  await assert.rejects(withLoadDeadline(task,5).then(()=>placed++),/timed out/)
  resolve();await Promise.resolve();assert.equal(placed,0)
})
