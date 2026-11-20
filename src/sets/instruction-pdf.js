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
      session.ops = pdf.OPS
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

  async function fingerprint(source) {
    const ids = (await documentFor(source)).fingerprints
    return ids?.[0] && ids.filter(Boolean).join('/')
  }

  async function inspect(source, number, signal) {
    signal.throwIfAborted()
    const pending = documentFor(source)
    const session = active
    const pdf = await pending
    signal.throwIfAborted()
    const page = await pdf.getPage(number)
    const viewport = page.getViewport({ scale: 1 })
    const { items, styles } = await page.getTextContent()
    signal.throwIfAborted()
    const { words, dimensions } = pdfWords(items, styles, viewport)
    const list = await page.getOperatorList()
    signal.throwIfAborted()
    const { images, badgeShapes } = pdfArtwork(list, session.ops, viewport)
    const wideScan = images.some(([x, y, right, bottom]) =>
      right - x >= viewport.width * .7 && bottom - y >= viewport.height * .7)
    return {
      words, images, wideScan, width: viewport.width, height: viewport.height,
      badges: dimensionBadges(dimensions, badgeShapes),
    }
  }

  return { render, fingerprint, inspect, close }
}

const quantity = /^[1-9]\d{0,2}[x×]$/i
const element = /^\d{6,8}$/
const dimension = /^[1-9]\d?(?:[,.]\d)?$/

function pdfWords(items, styles, viewport) {
  const words = new Map()
  const dimensions = new Map()
  for (const item of items) {
    const text = item.str?.trim()
    const isDimension = dimension.test(text) && item.height >= 5 && item.height <= 12
    if (!isDimension && !quantity.test(text) && !element.test(text)) continue
    const [a, b, c, d, x, y] = item.transform
    const length = Math.hypot(a, b)
    if (!length || item.width <= 0) continue
    const ascent = styles[item.fontName]?.ascent ?? .8
    const top = viewport.convertToViewportPoint(x + c * ascent, y + d * ascent)
    const bottom = viewport.convertToViewportPoint(
      x + a / length * item.width, y + b / length * item.width,
    )
    const box = [
      Math.min(top[0], bottom[0]), Math.min(top[1], bottom[1]),
      Math.max(top[0], bottom[0]), Math.max(top[1], bottom[1]),
    ]
    const destination = isDimension ? dimensions : words
    destination.set(JSON.stringify([text, ...box.map(Math.round)]), { text, box })
  }
  return { words: [...words.values()], dimensions: [...dimensions.values()] }
}

function multiply([a, b, c, d, x, y], [e, f, g, h, u, v]) {
  return [a * e + c * f, b * e + d * f, a * g + c * h, b * g + d * h,
    a * u + c * v + x, b * u + d * v + y]
}

function bounds([a, b, c, d, x, y]) {
  const xs = [x, x + a, x + c, x + a + c]
  const ys = [y, y + b, y + d, y + b + d]
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
}

function pdfArtwork({ fnArray, argsArray }, ops, viewport) {
  const images = new Map(), badgeShapes = [], stack = []
  let matrix = viewport.transform
  function place(placement) {
    const box = bounds(placement)
    images.set(box.map(value => value.toFixed(1)).join('/'), box)
  }
  for (const [index, op] of fnArray.entries()) {
    const args = argsArray[index]
    if (op === ops.save || op === ops.paintFormXObjectBegin) {
      stack.push(matrix)
      if (op === ops.paintFormXObjectBegin && args[0]) matrix = multiply(matrix, args[0])
    } else if (op === ops.restore || op === ops.paintFormXObjectEnd) {
      matrix = stack.pop() ?? viewport.transform
    } else if (op === ops.transform) {
      matrix = multiply(matrix, args)
    } else if (op === ops.paintImageXObject || op === ops.paintInlineImageXObject || op === ops.paintImageMaskXObject) {
      place(matrix)
    } else if (op === ops.paintImageXObjectRepeat) {
      const [, xScale, yScale, positions] = args
      for (let i = 0; positions && i + 1 < positions.length; i += 2) {
        place(multiply(matrix, [xScale, 0, 0, yScale, positions[i], positions[i + 1]]))
      }
    } else if (op === ops.paintInlineImageXObjectGroup) {
      for (const image of args[1]) place(multiply(matrix, image.transform))
    } else if (op === ops.constructPath && args[0] === ops.fill) {
      const pathBounds = args[2]
      if (pathBounds?.length !== 4) continue
      const [left, top, right, bottom] = pathBounds
      const box = bounds(multiply(matrix, [right - left, 0, 0, bottom - top, left, top]))
      const width = box[2] - box[0], height = box[3] - box[1]
      if (width >= 10.5 && width <= 14 && height >= 10.5 && height <= 14 &&
          Math.abs(width - height) <= .7) {
        const shape = badgeShape(args[1]?.[0], pathBounds)
        if (shape) badgeShapes.push({ shape, box })
      }
    }
  }
  return { images: [...images.values()], badgeShapes }
}

// PDF.js 6 packs path commands as move/line/cubic/quadratic/close (0 through 4).
function badgeShape(path, [left, top, right, bottom]) {
  if (!path?.length) return
  let curves = 0, corners = 0
  for (let i = 0; i < path.length;) {
    const command = path[i++]
    if (command === 0 || command === 1) {
      const x = path[i++], y = path[i++]
      if (Math.min(Math.abs(x - left), Math.abs(x - right)) <= .2 &&
          Math.min(Math.abs(y - top), Math.abs(y - bottom)) <= .2) corners++
    } else if (command === 2) {
      curves++
      i += 6
    } else if (command !== 4) return
  }
  if (curves === 4 && !corners) return 'round'
  if (!curves && corners >= 4 && corners <= 5) return 'square'
}

function dimensionBadges(numbers, shapes) {
  return numbers.flatMap(({ text, box: [x, y, right, bottom] }) => {
    const centered = shapes.filter(({ box: [a, b, c, d] }) => x >= a && right <= c &&
      Math.abs(x + right - a - c) <= 3.5 && Math.abs(y + bottom - b - d) <= 5.2)
    if (!centered.length || centered.some(candidate => candidate.shape !== centered[0].shape)) return []
    const smallest = centered.reduce((best, match) =>
      match.box[2] - match.box[0] < best.box[2] - best.box[0] ? match : best)
    return [{ box: smallest.box, key: `${smallest.shape}/${text.replace(',', '.')}` }]
  })
}
