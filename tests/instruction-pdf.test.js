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
