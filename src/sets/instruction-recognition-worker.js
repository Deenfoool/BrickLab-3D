// Page text locates the callouts. Compare the composited part artwork with
// labeled drawings from the illustrated inventory of the same set.
const quantity = /^[1-9]\d{0,2}[x×]$/i
const element = /^\d{6,8}$/
const size = 24
const widthOf = box => box[2] - box[0]
const heightOf = box => box[3] - box[1]
const overlaps = (a, b) => Math.min(a[2], b[2]) - Math.max(a[0], b[0]) > .5 &&
  Math.min(a[3], b[3]) - Math.max(a[1], b[1]) > .5

function anchors(captions, images, inventory) {
  const matches = []
  for (const [i, caption] of captions.entries()) {
    for (const [j, box] of images.entries()) {
      const dx = Math.abs(caption.box[0] - box[0]), dy = caption.box[1] - box[3]
      // Some PDFs paint a caption as an image and place searchable text over it.
      if (dy < 0 && heightOf(box) <= heightOf(caption.box) + 2 &&
          widthOf(box) <= widthOf(caption.box) + 3) continue
      if (dx <= 5 && dy >= -4 && dy <= (inventory ? 20 : 5)) {
        matches.push({ i, j, score: dx * 2 + Math.abs(dy) })
      }
    }
  }
  const assigned = new Map(), used = new Set()
  for (const { i, j } of matches.sort((a, b) => a.score - b.score)) {
    if (!assigned.has(i) && !used.has(j)) {
      assigned.set(i, j)
      used.add(j)
    }
  }
  return [...assigned].map(([i, j]) => {
    const anchor = images[j]
    const box = [...anchor]
    for (const [index, fragment] of images.entries()) {
      if (used.has(index) || !overlaps(anchor, fragment) || fragment[3] > anchor[3] + 1 ||
          widthOf(fragment) * heightOf(fragment) > 2 * widthOf(anchor) * heightOf(anchor)) continue
      // Consecutive rows sometimes overlap by one raster pixel.
      if (fragment[1] < anchor[1] && fragment[3] - anchor[1] < .15 * heightOf(fragment)) continue
      if (Math.abs(fragment[0] - anchor[0]) <= 2 ||
          (Math.abs(fragment[3] - anchor[3]) <= 2 && fragment[0] >= anchor[0])) {
        box[0] = Math.min(box[0], fragment[0])
        box[1] = Math.min(box[1], fragment[1])
        box[2] = Math.max(box[2], fragment[2])
      }
    }
    return { caption: captions[i], box, embedded: true }
  })
}

function inventoryCaptions(elements, quantities) {
  return elements.map(element => {
    const [x, y] = element.box
    let closest, distance = Infinity
    for (const quantity of quantities) {
      const dx = Math.abs(quantity.box[0] - x), dy = y - quantity.box[1]
      if (dx > 3 || dy < 3 || dy > 15 || quantity.box[3] > y + 2) continue
      const score = dx * 2 + dy
      if (score < distance) {
        closest = quantity
        distance = score
      }
    }
    return closest ? { ...element, box: closest.box } : element
  })
}

function assignBadges(candidates, badges) {
  const pairs = []
  for (const [index, badge] of badges.entries()) {
    for (const part of candidates) {
      const dx = badge.box[0] - part.box[2], dy = badge.box[1] - part.box[1]
      if (dx >= -3 && dx <= 7 && Math.abs(dy) <= 8)
        pairs.push({ index, part, key: badge.key, distance: Math.abs(dx) + Math.abs(dy) })
    }
  }
  const used = new Set()
  for (const pair of pairs.sort((a, b) => a.distance - b.distance)) {
    if (used.has(pair.index) || pair.part.badge) continue
    pair.part.badge = pair.key
    used.add(pair.index)
  }
}

function pixelBox(box, raster) {
  return [
    Math.max(0, Math.floor(box[0] * raster.x)),
    Math.max(0, Math.floor(box[1] * raster.y)),
    Math.min(raster.width, Math.ceil(box[2] * raster.x)),
    Math.min(raster.height, Math.ceil(box[3] * raster.y)),
  ]
}

function paper(raster, box) {
  const [left, top, right, bottom] = box
  const bins = new Uint16Array(32)
  const totals = new Uint32Array(32 * 3)
  function add(x, y) {
    const offset = (y * raster.width + x) * 4
    const bin = (raster.data[offset] + raster.data[offset + 1] + raster.data[offset + 2]) >> 5
    bins[bin]++
    for (let channel = 0; channel < 3; channel++) totals[bin * 3 + channel] += raster.data[offset + channel]
  }
  for (let x = left; x < right; x += 2) {
    add(x, top)
    add(x, bottom - 1)
  }
  for (let y = top; y < bottom; y += 2) {
    add(left, y)
    add(right - 1, y)
  }
  const mode = bins.reduce((best, count, i) => count > bins[best] ? i : best, 0)
  return Array.from({ length: 3 }, (_, ch) => totals[mode * 3 + ch] / bins[mode])
}

function isInk(data, offset, background) {
  const red = data[offset] - background[0]
  const green = data[offset + 1] - background[1]
  const blue = data[offset + 2] - background[2]
  return red * red + green * green + blue * blue > 44 * 44
}

function scanArt(captions, words, raster, inventory) {
  const boxes = new Map()
  for (const { box } of captions) {
    const [x, y] = box
    const margin = inventory ? 18 : 8
    const area = pixelBox([x - 6, y - 70, x + 100, y + 2], raster)
    const [left, top, right, bottom] = area
    const width = widthOf(area), height = heightOf(area)
    if (width < 2 || height < 2) continue
    const background = paper(raster, area)
    if (Math.min(...background) < 155) continue
    const mask = new Uint8Array(width * height)
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const offset = ((top + row) * raster.width + left + col) * 4
        mask[row * width + col] = Number(isInk(raster.data, offset, background))
      }
    }
    for (const token of words) {
      const [a, b, c, d] = pixelBox(token.box, raster)
      for (let row = Math.max(top, b - 2); row < Math.min(bottom, d + 2); row++) {
        const start = Math.max(left, a - 2), end = Math.min(right, c + 2)
        if (start < end) mask.fill(0, (row - top) * width + start - left, (row - top) * width + end - left)
      }
    }
    const queue = new Int32Array(mask.length)
    for (let start = 0; start < mask.length; start++) {
      if (!mask[start]) continue
      let head = 0, tail = 1
      mask[start] = 0
      queue[0] = start
      let x0 = width, y0 = height, x1 = 0, y1 = 0
      while (head < tail) {
        const pos = queue[head++], row = Math.trunc(pos / width), col = pos % width
        x0 = Math.min(x0, col); x1 = Math.max(x1, col)
        y0 = Math.min(y0, row); y1 = Math.max(y1, row)
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (row + dy < 0 || row + dy >= height || col + dx < 0 || col + dx >= width) continue
            const next = pos + dy * width + dx
            if (mask[next]) {
              mask[next] = 0
              queue[tail++] = next
            }
          }
        }
      }
      const drawing = [(left + x0) / raster.x, (top + y0) / raster.y,
        (left + x1 + 1) / raster.x, (top + y1 + 1) / raster.y]
      const dy = y - drawing[3]
      if (x0 && y0 && x1 < width - 1 && tail >= 14 && widthOf(drawing) >= 5 &&
          heightOf(drawing) >= 3 && Math.abs(x - drawing[0]) <= 5 && dy >= -2 && dy <= margin) {
        boxes.set(drawing.map(Math.round).join('/'), drawing)
      }
    }
  }
  return [...boxes.values()]
}

// A bounding rectangle can also contain the previous row's caption or drawing.
function largestDrawing(pixels, width, height) {
  const seen = new Uint8Array(width * height)
  const queue = new Int32Array(seen.length)
  let largest = []
  for (let start = 0; start < seen.length; start++) {
    if (seen[start] || pixels[start * 4 + 3] === 0) continue
    let tail = 1
    queue[0] = start
    seen[start] = 1
    for (let head = 0; head < tail; head++) {
      const pos = queue[head], x = pos % width, y = Math.floor(pos / width)
      for (let row = Math.max(0, y - 1); row <= Math.min(height - 1, y + 1); row++) {
        for (let col = Math.max(0, x - 1); col <= Math.min(width - 1, x + 1); col++) {
          const index = row * width + col
          if (seen[index] || !pixels[index * 4 + 3]) continue
          seen[index] = 1
          queue[tail++] = index
        }
      }
    }
    if (tail > largest.length) largest = queue.slice(0, tail)
  }
  return largest
}

function feature(raster, box, neighbors) {
  const area = pixelBox([box[0] - .75, box[1] - .75, box[2] + .75, box[3] + .2], raster)
  const [left, top, right, bottom] = area
  if (right - left < 2 || bottom - top < 2) return
  const background = paper(raster, area)
  if (Math.min(...background) < 140) return
  const exclude = neighbors.map(other => pixelBox(other, raster))
  const width = right - left, height = bottom - top
  const image = new OffscreenCanvas(width, height)
  const ctx = image.getContext('2d')
  const pixels = ctx.createImageData(width, height)
  pixels.data.fill(0)
  let x0 = width, y0 = height, x1 = -1, y1 = -1, count = 0
  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) {
      const source = (y * raster.width + x) * 4
      if (!isInk(raster.data, source, background) ||
          exclude.some(([a, b, c, d]) => x >= a && x < c && y >= b && y < d)) continue
      const row = y - top, col = x - left
      x0 = Math.min(x0, col); x1 = Math.max(x1, col)
      y0 = Math.min(y0, row); y1 = Math.max(y1, row)
      count++
      const destination = (row * width + col) * 4
      pixels.data.set(raster.data.subarray(source, source + 4), destination)
    }
  }
  if (count < 12) return
  ctx.putImageData(pixels, 0, 0)
  const thumb = new OffscreenCanvas(size, size).getContext('2d')
  thumb.imageSmoothingQuality = 'high'
  thumb.fillStyle = 'white'
  thumb.fillRect(0, 0, size, size)
  const w = x1 - x0 + 1, h = y1 - y0 + 1
  thumb.drawImage(image, x0, y0, w, h, 0, 0, size, size)
  const sample = { pixels: thumb.getImageData(0, 0, size, size).data, aspect: Math.log(w / h) }
  const component = largestDrawing(pixels.data, width, height)
  if (component.length < count * .5 || component.length >= count * .995) return sample
  const isolated = ctx.createImageData(width, height)
  x0 = width; y0 = height; x1 = -1; y1 = -1
  for (const pos of component) {
    const x = pos % width, y = Math.floor(pos / width)
    x0 = Math.min(x0, x); x1 = Math.max(x1, x)
    y0 = Math.min(y0, y); y1 = Math.max(y1, y)
    isolated.data.set(pixels.data.subarray(pos * 4, pos * 4 + 4), pos * 4)
  }
  ctx.putImageData(isolated, 0, 0)
  thumb.fillRect(0, 0, size, size)
  thumb.drawImage(image, x0, y0, x1 - x0 + 1, y1 - y0 + 1, 0, 0, size, size)
  sample.drawing = { pixels: thumb.getImageData(0, 0, size, size).data, aspect: Math.log((x1 - x0 + 1) / (y1 - y0 + 1)) }
  return sample
}

function extract({ bitmap, geometry, labels, inventory }) {
  const surface = new OffscreenCanvas(bitmap.width, bitmap.height)
  const ctx = surface.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()
  const pixels = ctx.getImageData(0, 0, surface.width, surface.height)
  const { width, height, words } = geometry
  const raster = { data: pixels.data, width: surface.width, height: surface.height,
    x: surface.width / width, y: surface.height / height }
  const elements = words.filter(({ text }) => element.test(text))
  const quantities = words.filter(({ text }) => quantity.test(text))
  const labeled = inventoryCaptions(elements, quantities)
  const inventoryPage = labeled.filter((entry, i) => entry !== elements[i]).length >= 2
  const readInventory = inventory || inventoryPage
  const captions = readInventory ? labeled : quantities
  if (inventory && !inventoryPage) return []
  const images = geometry.images.filter(box => widthOf(box) >= 5 && heightOf(box) >= 3 &&
    widthOf(box) < .45 * width && heightOf(box) < .35 * height)
  const candidates = anchors(captions, images, readInventory)
  const assigned = new Set(candidates.map(candidate => candidate.caption))
  if (assigned.size < captions.length) {
    const missing = captions.filter(caption => !assigned.has(caption))
    const fallback = scanArt(missing, words, raster, readInventory)
    candidates.push(...anchors(missing, fallback, readInventory).map(part => ({ ...part, embedded: false })))
  }
  assignBadges(candidates, geometry.badges ?? [])
  return candidates.flatMap(({ box, caption, embedded, badge }) => {
    const neighbors = candidates.map(part => part.box).filter(other => other !== box &&
      widthOf(other) * heightOf(other) < .65 * widthOf(box) * heightOf(box) && overlaps(other, box))
    const sample = feature(raster, box, neighbors)
    if (!sample && (inventory || !readInventory)) return []
    const item = readInventory ? [...(labels[caption.text] ?? [null, null]), caption.text] : undefined
    if (inventory) return [{ ...sample, item, embedded, badge }]
    const coordinates = [box[0] - 1.5, box[1] - 1.5, box[2] + 1.5, box[3] + 1.5]
    const [x, y, right, bottom] = coordinates.map((value, index) =>
      Math.max(0, Math.min(10000, Math.round(value * 10000 / (index % 2 ? height : width)))))
    return [{ ...sample, item, embedded, badge, region: [x, y, right - x, bottom - y] }]
  })
}

function pixelDistance(a, b) {
  let delta = 0
  for (let i = 0; i < a.length; i += 4) {
    delta += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])
  }
  return delta / (size * size * 3 * 255)
}

function shiftedViews(pixels) {
  const views = []
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue
      const shifted = new Uint8ClampedArray(pixels.length).fill(255)
      const column = Math.max(0, -dx), stride = (size - Math.abs(dx)) * 4
      for (let y = Math.max(0, -dy); y < Math.min(size, size - dy); y++) {
        const start = (y * size + column) * 4
        shifted.set(pixels.subarray(start, start + stride), start + (dy * size + dx) * 4)
      }
      views.push({ pixels: shifted, penalty: dx && dy ? .013 : .01 })
    }
  }
  return views
}

function bestByItem(scores) {
  const items = new Map()
  for (const result of scores.sort((a, b) => a.score - b.score)) {
    const key = result.reference.item.join('/')
    if (!items.has(key)) items.set(key, result)
  }
  return [...items.values()]
}

function confident(scores, sample) {
  const [first, second] = bestByItem([...scores])
  if (!first) return
  const gap = (second?.score ?? Infinity) - first.score
  if (first.score <= (second ? .045 : .028) && gap >= .022) return first.reference.item
  // Larger rendering differences need stronger evidence against the runner-up.
  // Scans and crops recovered from pixels keep the original, stricter limit.
  if (second && sample.embedded && first.reference.embedded && first.score <= .085 &&
      gap >= Math.max(.022, first.score * .55)) return first.reference.item
}

function badgeMatch(scores, sample) {
  if (!sample.badge || !scores.length) return
  const [first, second] = bestByItem(scores.filter(({ reference }) => reference.badge === sample.badge))
  const best = Math.min(...scores.map(({ score }) => score))
  if (first && first.score <= .095 && first.score - best <= .03 &&
      (!second || second.score - first.score >= .022)) return first.reference.item
}

function rank({ samples, templates }) {
  return samples.flatMap(sample => {
    if (sample.item) return [[...sample.region, ...sample.item]]
    const scores = []
    for (const reference of templates) {
      const aspect = .18 * Math.abs(sample.aspect - reference.aspect)
      if (aspect > .17) continue
      scores.push({ reference, aspect, score: aspect + pixelDistance(sample.pixels, reference.pixels) })
    }
    let item = badgeMatch(scores, sample) ?? confident(scores, sample)
    if (!item && sample.embedded && scores.some(({ score }) => score <= .13)) {
      const views = shiftedViews(sample.pixels)
      for (const entry of scores) {
        if (!entry.reference.embedded || entry.aspect > .13) continue
        for (const view of views) entry.score = Math.min(entry.score,
          entry.aspect + view.penalty + pixelDistance(view.pixels, entry.reference.pixels))
      }
      item = badgeMatch(scores, sample) ?? confident(scores, sample)
    }
    if (!item && sample.embedded) {
      const drawing = sample.drawing ?? sample
      const scores = templates.map(reference => {
        const other = reference.drawing ?? reference
        return { reference, score: .18 * Math.abs(drawing.aspect - other.aspect) +
          pixelDistance(drawing.pixels, other.pixels) }
      })
      const [first, second] = bestByItem(scores)
      if (first?.score <= .065 && (second?.score ?? Infinity) - first.score >= .035) item = first.reference.item
    }
    return item ? [[...sample.region, ...item]] : []
  })
}

self.onmessage = ({ data }) => {
  const { id, action, input } = data
  try {
    self.postMessage({ id, value: action === 'extract' ? extract(input) : rank(input) })
  } catch (error) {
    self.postMessage({ id, error: error.message })
  }
}
