import test from 'node:test'
import assert from 'node:assert/strict'
import { Window } from 'happy-dom'
import * as THREE from 'three'
import { SHADOW_SOURCE_V4 } from '../connectors-v4/schema-v4.js'

const dom = new Window()
for (const key of ['window','document','localStorage','CustomEvent','MutationObserver','CSS','HTMLElement','Storage']) {
  globalThis[key] = key === 'window' ? dom : dom[key]
}
globalThis.requestAnimationFrame = () => 0

const officialText = '0 QA First Load Part\n0 Name: parts/qa-first-load.dat\n0 !LDRAW_ORG Part\n'
const shadowText = '0 !LDCAD SNAP_CYL [gender=M] [caps=none] [secs=A 6 20] [center=true] [slide=true]\n'

globalThis.fetch = async input => {
  const url = String(input)
  if (url.includes('shadow-manifest.json')) {
    return new Response(JSON.stringify({ commit:SHADOW_SOURCE_V4.commit, files:['parts/qa-first-load.dat'] }), {
      status:200,
      headers:{'content-type':'application/json'},
    })
  }
  if (url.includes('raw.githubusercontent.com/pybricks/ldraw/')) return new Response(officialText, {status:200})
  if (url.includes(SHADOW_SOURCE_V4.repository)) return new Response(shadowText, {status:200})
  return new Response('', {status:404})
}

const { PARTS } = await import('../parts.js')
const { BrickLabConnectorV4:v4 } = await import('../connectors-v4/runtime-v4.js')

test('first asynchronous LDraw load dereferences the remembered WeakRef root for hydration', async () => {
  const id = 'ldraw-qa-first-load'
  const existingIndex = PARTS.findIndex(part => part.id === id)
  if (existingIndex >= 0) PARTS.splice(existingIndex, 1)

  const def = {
    id,
    name:'QA First Load',
    connectors:[],
    ldraw:{file:'parts/qa-first-load.dat',code:'qa-first-load',ready:false,level:'visual'},
    create() {
      const root = new THREE.Group()
      root.userData.partId = id
      return root
    },
  }
  PARTS.push(def)
  window.dispatchEvent(new CustomEvent('bricklab:partcatalogchange'))

  const root = def.create()
  // Let the wrapper's own microtask observe ready=false. This forces the later
  // bricklab:ldrawloaded listener down the remembered-root path instead of passing
  // rootOverride directly to hydrateConnectorV4.
  await Promise.resolve()

  const visual = new THREE.Group()
  visual.userData.ldrawVisual = true
  visual.position.set(1.25, 0.5, -2.75)
  root.add(visual)
  def.ldraw.ready = true

  window.dispatchEvent(new CustomEvent('bricklab:ldrawloaded', { detail:{id} }))
  for (let i = 0; i < 8 && def.connectivityV4?.status === 'loading'; i += 1) {
    await new Promise(resolve => setTimeout(resolve, 0))
  }
  // The event starts asynchronously; allow at least one task even when the status
  // was not observable at the first check.
  await new Promise(resolve => setTimeout(resolve, 0))

  assert.equal(def.connectivityV4?.status, 'ready')
  assert.deepEqual(def.connectivityV4?.visualOffsetStud, [1.25, 0.5, -2.75])
  assert.ok(def.connectivityV4?.connectors?.length > 0)
  assert.notEqual(def.connectivityV4?.warnings?.[0]?.code, 'hydrate-error')
  assert.equal(v4.get(id)?.status, 'ready')

  PARTS.splice(PARTS.indexOf(def), 1)
  v4.clearCache()
})
