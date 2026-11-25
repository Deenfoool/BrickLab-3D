import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'

test('offline OCR assets match their pinned manifest and both WASM variants are valid', async () => {
  const root = new URL('../vendor/tesseract/', import.meta.url)
  const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'))
  for (const [name, hash] of Object.entries(manifest)) {
    const bytes = await readFile(new URL(name, root))
    assert.equal(createHash('sha256').update(bytes).digest('hex'), hash, name)
    if (name.endsWith('.wasm')) assert.ok(WebAssembly.validate(bytes), name)
  }
  assert.ok(manifest['lang/eng.traineddata.gz'])
  assert.ok(manifest['worker.min.js'])
})
