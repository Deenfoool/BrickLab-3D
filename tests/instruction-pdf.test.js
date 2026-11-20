import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createInstructionPdfReader } from '../src/sets/instruction-pdf.js'

test('PDF reader reuses an open book, clamps the page, and closes it when a local file replaces it', async () => {
  const opened = [], rendered = [], closed = []
  const library = {
    getDocument(options) {
      const index = opened.push(options) - 1
      const document = {
        numPages: 3,
        async getPage(page) {
          return {
            getViewport: ({ scale }) => ({ width: 400 * scale, height: 800 * scale }),
            render({ canvas }) {
              rendered.push([page, canvas.width, canvas.height])
              return { promise: Promise.resolve() }
            },
            cleanup() {},
          }
        },
      }
      return { promise: Promise.resolve(document), async destroy() { closed.push(index) } }
    },
  }
  const reader = createInstructionPdfReader(async () => library)
  const { signal } = new AbortController()
  const url = 'https://bdpinstructions.download.bricklink.info/910037.pdf'
  assert.deepEqual(await reader.render(url, 2, {}, signal), { pageNumber: 2, pages: 3 })
  assert.deepEqual(await reader.render(url, 9, {}, signal), { pageNumber: 3, pages: 3 })
  const file = new Blob(['%PDF-1.7'], { type: 'application/pdf' })
  await reader.render(file, 1, {}, signal)
  reader.close()
  assert.equal(opened.length, 2)
  assert.equal(opened[0].url, url)
  assert.equal(opened[0].withCredentials, false)
  assert.equal(new TextDecoder().decode(opened[1].data), '%PDF-1.7')
  assert.deepEqual(rendered, [[2, 800, 1600], [3, 800, 1600], [1, 800, 1600]])
  assert.deepEqual(closed, [0, 1])
})

test('leaving a page cancels the active PDF render', async () => {
  const controller = new AbortController()
  let start
  const started = new Promise(resolve => { start = resolve })
  let canceled = false
  let cleaned = false
  const reader = createInstructionPdfReader(async () => ({
    getDocument: () => ({
      promise: Promise.resolve({
        numPages: 1,
        async getPage() {
          return {
            getViewport: () => ({ width: 100, height: 200 }),
            render() {
              let reject
              const promise = new Promise((_, fail) => { reject = fail })
              start()
              return { promise, cancel() { canceled = true; reject(new Error('Canceled PDF render')) } }
            },
            cleanup() { cleaned = true },
          }
        },
      }),
      async destroy() {},
    }),
  }))
  const rendering = reader.render('https://example.invalid/book.pdf', 1, {}, controller.signal)
  const rejected = assert.rejects(rendering, /Canceled PDF render/)
  await started
  controller.abort()
  await rejected
  assert.equal(canceled, true)
  assert.equal(cleaned, true)
  reader.close()
})

test('PDF inspection projects captions and layered image placements to page coordinates', async () => {
  const ops = { save: 1, restore: 2, transform: 3, paintImageXObject: 4, paintImageXObjectRepeat: 5 }
  const caption = { str: '2x', width: 8, transform: [8, 0, 0, 8, 20, 30], fontName: 'font' }
  const reader = createInstructionPdfReader(async () => ({
    OPS: ops,
    getDocument: () => ({
      promise: Promise.resolve({
        fingerprints: ['original', 'revision'],
        async getPage() {
          return {
            getViewport: () => ({
              width: 100, height: 120, transform: [1, 0, 0, -1, 0, 120],
              convertToViewportPoint: (x, y) => [x, 120 - y],
            }),
            async getTextContent() {
              return { items: [caption, caption, { str: 'Step 16' }], styles: { font: { ascent: .75 } } }
            },
            async getOperatorList() {
              return {
                fnArray: [ops.save, ops.transform, ops.paintImageXObject, ops.restore, ops.paintImageXObjectRepeat],
                argsArray: [null, [20, 0, 0, 15, 20, 37], ['image'], null, ['tile', 3, 4, [7, 8, 9, 10]]],
              }
            },
          }
        },
      }),
      async destroy() {},
    }),
  }))
  const source = new Blob(['local PDF'])
  const { signal } = new AbortController()
  assert.equal(await reader.fingerprint(source), 'original/revision')
  assert.deepEqual(await reader.inspect(source, 1, signal), {
    words: [{ text: '2x', box: [20, 84, 28, 90] }],
    images: [[20, 68, 40, 83], [7, 108, 10, 112], [9, 106, 12, 110]],
    wideScan: false,
    width: 100,
    height: 120,
  })
  reader.close()
})
