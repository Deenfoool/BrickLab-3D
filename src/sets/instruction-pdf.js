// Lazy-load the pinned legacy build for browsers with older PDF rendering APIs.
const distribution = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.5.438/'
let library

function loadPdfJs() {
  library ??= import('../../vendor/pdfjs/pdf.min.mjs').then(pdf => {
    pdf.GlobalWorkerOptions.workerSrc = new URL('../../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href
    return pdf
  }).catch(error => {
    library = undefined
    throw error
  })
  return library
}

export function createInstructionPdfReader(load = loadPdfJs) {
  let active
  function close() {
    const previous = active
    active = undefined
    previous?.task?.destroy().catch(() => {})
  }

  function documentFor(source) {
    if (active?.source === source) return active.promise
    close()
    const session = { source }
    active = session
    session.promise = (async () => {
      const pdf = await load()
      const input = typeof source === 'string'
        ? { url: source, withCredentials: false }
        : { data: new Uint8Array(await source.arrayBuffer()) }
      if (active !== session) throw new DOMException('PDF closed', 'AbortError')
      session.task = pdf.getDocument({
        ...input,
        cMapUrl: `${distribution}cmaps/`,
        cMapPacked: true,
        standardFontDataUrl: `${distribution}standard_fonts/`,
        wasmUrl: `${distribution}wasm/`,
        iccUrl: `${distribution}iccs/`,
        enableXfa: false,
      })
      return session.task.promise
    })().catch(error => {
      if (active === session) close()
      throw error
    })
    return session.promise
  }

  async function render(source, number, canvas, signal) {
    signal.throwIfAborted()
    const pdf = await documentFor(source)
    signal.throwIfAborted()
    const pageNumber = Math.min(number, pdf.numPages)
    const page = await pdf.getPage(pageNumber)
    signal.throwIfAborted()
    const size = page.getViewport({ scale: 1 })
    const viewport = page.getViewport({ scale: 1600 / Math.max(size.width, size.height) })
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    const task = page.render({ canvas, viewport })
    const cancel = () => task.cancel()
    signal.addEventListener('abort', cancel, { once: true })
    try {
      await task.promise
      return { pageNumber, pages: pdf.numPages }
    } finally {
      signal.removeEventListener('abort', cancel)
      page.cleanup()
    }
  }

  return { render, close }
}
