import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source=await readFile(new URL('../ldraw/runtime-v3.js',import.meta.url),'utf8')
const body=source.slice(source.indexOf('export async function fetchLDrawText(file) {')+'export '.length,source.indexOf('\nfunction parseHeader('))

test('public LDraw text reader preserves library primitive paths and shares bare part cache',async()=>{
  const requests=[]
  const reader=new Function('textTransport','textCache',`${body};return fetchLDrawText`)({read:async path=>{requests.push(path);return `0 ${path}`}},new Map())
  assert.equal(await reader('p/axlehol5.dat'),'0 p/axlehol5.dat')
  assert.equal(await reader('p/48/5-24cylo.dat'),'0 p/48/5-24cylo.dat')
  assert.equal(await reader('parts/s/32269s01.dat'),'0 parts/s/32269s01.dat')
  assert.equal(await reader('18575.dat'),'0 parts/18575.dat')
  assert.equal(await reader('parts/18575.dat'),'0 parts/18575.dat')
  assert.deepEqual(requests,['p/axlehol5.dat','p/48/5-24cylo.dat','parts/s/32269s01.dat','parts/18575.dat'])
})

test('LDraw text reader evicts failed requests so native connectivity can retry',async()=>{
  let attempts=0
  const reader=new Function('textTransport','textCache',`${body};return fetchLDrawText`)({read:async()=>{if(++attempts===1)throw Error('offline');return '0 primitive'}},new Map())
  await assert.rejects(reader('p/axlehol5.dat'),/offline/)
  assert.equal(await reader('p/axlehol5.dat'),'0 primitive')
  assert.equal(attempts,2)
})
