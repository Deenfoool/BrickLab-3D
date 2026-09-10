import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseShadowTextV4, expandGridV4 } from '../connectors-v4/ldcad-parser-v4.js'
import { createShadowResolverV4 } from '../connectors-v4/shadow-resolver-v4.js'

const cyl = '0 !LDCAD SNAP_CYL [gender=M] [secs=R 6 20]'
for (const option of ['[pos=0 nope 0]','[ori=1 0 0]','[gender=unknown]','[caps=maybe]','[slide=maybe]','[newPhysics=1]','[gender=F]','junk','[grid=999999 2 20 20]']) {
  test(`parser fails closed: ${option}`, () => {
    const parsed = parseShadowTextV4(`${cyl} ${option}`)
    assert.equal(parsed.operations.length, 0)
    assert.ok(parsed.warnings.some(w => w.code === 'invalid-snap-meta'))
  })
}
test('numeric tokens cannot disappear from a finger sequence', () => {
  assert.equal(parseShadowTextV4('0 !LDCAD SNAP_FGR [radius=6] [seq=4 bad 4]').operations.length,0)
})
test('grid budget also protects callers with pre-parsed input', () => {
  assert.throws(() => expandGridV4({xCount:1e12}), /budget/)
})
test('corZ inheritance preserves X and Y and corrects reflected Z', async () => {
  const resolver=createShadowResolverV4({
    fetchOfficialText:async p=>p==='parts/root.dat'?'1 16 0 0 0 1 0 0 0 1 0 0 0 -1 probe.dat':null,
    fetchShadowText:async p=>p==='parts/probe.dat'?`${cyl} [mirror=corZ]`:null,
  })
  const result=await resolver.resolve('root.dat')
  assert.equal(result.warnings.length,0)
  assert.deepEqual(result.connectors[0].frame.orientation.map(x=>x||0),[1,0,0,0,1,0,0,0,1])
})
test('network failures are retryable, confirmed missing files are cached', async () => {
  let attempts=0
  const resolver=createShadowResolverV4({fetchOfficialText:async()=>null,fetchShadowText:async()=>{
    if (++attempts===1) throw new Error('network')
    return cyl
  }})
  await assert.rejects(()=>resolver.resolve('retry.dat'),/network/)
  assert.equal((await resolver.resolve('retry.dat')).connectors.length,1)
  await resolver.resolve('retry.dat')
  assert.equal(attempts,2)
})
test('pinned Shadow fixture lines either validate or explicitly quarantine; never silently ignore',()=>{
  const pack=JSON.parse(readFileSync(new URL('fixtures/shadow-v4.json',import.meta.url)))
  assert.equal(pack.commit,'f2fb70c55521e0dfdf2af4d26a87167d4d0d9eec')
  for(const [file,text] of Object.entries(pack.files)) {
    const parsed=parseShadowTextV4(text,{file})
    const metas=text.split(/\r?\n/).filter(l=>/^0 !LDCAD SNAP_/.test(l))
    assert.equal(parsed.operations.length+parsed.warnings.filter(w=>w.code==='invalid-snap-meta').length,metas.length,file)
  }
})
