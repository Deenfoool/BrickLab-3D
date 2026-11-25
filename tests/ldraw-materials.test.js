import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { gunzipSync } from 'node:zlib'
import { registerHooks } from 'node:module'

registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'three') return next(new URL('../vendor/three/build/three.module.min.js', import.meta.url).href, context)
  if (specifier.startsWith('three/addons/')) return next(new URL(specifier.replace('three/addons/', '../vendor/three/examples/jsm/'), import.meta.url).href, context)
  return next(specifier, context)
} })

const { loadPartModel, parts } = await import('../src/editor/parts.js')
const root = new URL('../', import.meta.url)

test('fallback palette includes every bundled LDraw colour definition', async () => {
  const common = JSON.parse(gunzipSync(await readFile(new URL('assets/ldraw/system/common.json.gz', root))))
  const fallback = await readFile(new URL('assets/ldraw/material-fallbacks.ldr', root), 'utf8')
  for (const line of common['ldconfig.ldr'].split(/\r?\n/).filter(line => line.startsWith('0 !COLOUR '))) {
    assert.ok(fallback.includes(line.trimEnd()), line)
  }
})

test('Technic and example models load without missing-material warnings', async () => {
  const originalFetch = globalThis.fetch
  const originalProgressEvent = globalThis.ProgressEvent
  const originalWarn = console.warn
  const warnings = []
  globalThis.ProgressEvent ??= class ProgressEvent extends Event {
    constructor(type, options) { super(type); Object.assign(this, options) }
  }
  globalThis.fetch = async url => {
    const file = new URL(url instanceof Request ? url.url : url)
    file.search = ''
    return new Response(await readFile(file))
  }
  console.warn = (...args) => warnings.push(args.join(' '))
  try {
    for (const design of ['u9479c01', '3652', '3713', '99499c01']) {
      assert.ok(parts[design], `catalog part ${design}`)
      const model = await loadPartModel(parts[design])
      assert.ok(model?.meshes.length, `geometry ${design}`)
      for (const geometry of model.meshes) geometry.dispose()
    }
    assert.deepEqual(warnings.filter(message => message.includes('Material properties')), [])
  } finally {
    globalThis.fetch = originalFetch
    if (originalProgressEvent) globalThis.ProgressEvent = originalProgressEvent
    else delete globalThis.ProgressEvent
    console.warn = originalWarn
  }
})
