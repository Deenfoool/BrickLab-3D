import { Matrix4, Quaternion, Vector3 } from 'three'
import { isTread, sprockets, treadSeats, trackLine } from './treads.js?v=track-builder'

const epsilon = .001
const maxLinks = 160
// Pitch-line radii for the two Technic support rims in the Volvo chassis.
const guideRadii = { 13971: 26, 42610: 17.5 }
const vec = values => new Vector3().fromArray(values)
const gap = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1])

function segmentDistance(point, a, b) {
  const x = b[0] - a[0], y = b[1] - a[1]
  const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * x + (point[1] - a[1]) * y) / (x * x + y * y)))
  return Math.hypot(point[0] - a[0] - t * x, point[1] - a[1] - t * y)
}

function upperHull(points) {
  const hull = []
  for (const point of points.sort((a, b) => a[0] - b[0] || b[1] - a[1])) {
    if (hull.at(-1)?.[0] === point[0]) continue
    while (hull.length > 1) {
      const [a, b] = hull.slice(-2)
      if ((b[0] - a[0]) * (point[1] - b[1]) < (b[1] - a[1]) * (point[0] - b[0])) break
      hull.pop()
    }
    hull.push(point)
  }
  return hull
}

// Advance to the first exit from a pitch-radius circle along a piecewise linear guide.
function followGuide(guide, count, pitch) {
  const pivots = [guide[0]]
  let segment = 1
  for (let i = 0; i < count; i++) {
    const current = pivots.at(-1)
    while (gap(current, guide[segment]) < pitch - 1e-9) segment++
    const a = guide[segment - 1], b = guide[segment]
    const dx = b[0] - a[0], dy = b[1] - a[1]
    const x = a[0] - current[0], y = a[1] - current[1]
    const dot = x * dx + y * dy
    const lengthSq = dx * dx + dy * dy
    const t = (-dot + Math.sqrt(Math.max(0, dot * dot + lengthSq * (pitch * pitch - x * x - y * y)))) / lengthSq
    pivots.push([a[0] + t * dx, a[1] + t * dy])
  }
  return pivots
}

// Absorb excess pitch in the end transitions and keep the run under the rollers straight.
function levelRun(start, end, height, count, pitch, innerGuides, valid) {
  const width = end[0]
  let best
  for (let entry = 0; entry <= 2; entry++) for (let exit = 0; exit <= 2; exit++) {
    const middle = count - entry - exit
    if (middle < 1 || height - start[1] > entry * pitch + epsilon ||
        height - end[1] > exit * pitch + epsilon) continue
    const first = Math.sqrt(Math.max(0, (entry * pitch) ** 2 - (height - start[1]) ** 2))
    const last = Math.sqrt(Math.max(0, (exit * pitch) ** 2 - (height - end[1]) ** 2))
    const available = width - middle * pitch
    const extra = first + last - available
    if (extra < -epsilon || extra > pitch) continue
    for (const split of [0, .25, .5, .75, 1]) {
      const a = first - extra * split
      const b = last - extra * (1 - split)
      if (a < -epsilon || b < -epsilon ||
          (entry < 2 && Math.abs(a - first) > epsilon) ||
          (exit < 2 && Math.abs(b - last) > epsilon)) continue
      const startRun = [a, height], endRun = [width - b, height]
      if (innerGuides.some(point => point[0] < a - epsilon || point[0] > width - b + epsilon)) continue
      const left = approach(start, startRun, entry, pitch)
      const right = approach(endRun, end, exit, pitch)
      if (!left || !right) continue
      const straight = Array.from({ length: middle + 1 }, (_, i) => [a + i * pitch, height])
      const path = [...(entry ? [start, ...left] : []), ...straight, ...(exit ? [...right, end] : [])]
      path[0] = start
      path[path.length - 1] = end
      if (!valid(path)) continue
      const cost = left.reduce((sum, p) => sum + height - p[1], 0) +
        right.reduce((sum, p) => sum + height - p[1], 0) + height - Math.min(start[1], end[1])
      if (!best || cost < best.cost) best = { path, cost, flat: true }
    }
  }
  return best
}

function approach(start, end, count, pitch) {
  if (count < 2) return []
  const x = end[0] - start[0], y = end[1] - start[1]
  const length = Math.hypot(x, y)
  if (length < epsilon) return
  // The intersection closer to the wheels keeps the bend above the ground line.
  const bend = Math.sqrt(Math.max(0, pitch * pitch - length * length / 4))
  const joint = [(start[0] + end[0]) / 2 + bend * y / length,
    (start[1] + end[1]) / 2 - bend * x / length]
  if (joint[0] >= start[0] && joint[0] <= end[0]) return [joint]
}

function spanChoices(first, last, side, guides, wheels, pitch, ground) {
  const direction = side < 0 ? 1 : -1
  const width = direction * (last[0] - first[0])
  if (width < pitch * .5) return []
  const toSpan = point => [direction * (point[0] - first[0]), side * point[1]]
  const fromSpan = point => [first[0] + direction * point[0], side * point[1]]
  const start = toSpan(first), end = toSpan(last)
  const spanGuides = guides.map(({ point, radius }) => ({ point: toSpan(point), radius }))
    .filter(({ point }) => point[0] > 0 && point[0] < width)
  const relevant = spanGuides.filter(({ point, radius }) =>
    point[1] + radius > start[1] + (end[1] - start[1]) * point[0] / width - .1)
  const hullPoints = [start, end]
  for (const { point: [x, y], radius } of relevant) {
    for (let i = 0; i <= 12; i++) {
      const a = Math.PI * i / 12
      const reach = radius + .5
      const u = x + Math.cos(a) * reach
      if (u > 0 && u < width) hullPoints.push([u, y + Math.sin(a) * reach])
    }
  }
  const hull = upperHull(hullPoints)
  let length = 0
  for (let i = 1; i < hull.length; i++) length += gap(hull[i - 1], hull[i])
  const samples = []
  for (let i = 1; i < hull.length; i++) {
    const a = hull[i - 1], b = hull[i]
    const steps = Math.ceil(gap(a, b) / (pitch / 3))
    for (let j = 0; j < steps; j++) samples.push(a.map((v, k) => v + (b[k] - v) * j / steps))
  }
  samples.push(end)
  const obstacles = [...guides, ...wheels]
  const choices = []
  const min = Math.ceil(gap(start, end) / pitch - 1e-8)
  const valid = path => path.slice(1).every((p, i) => Math.abs(gap(p, path[i]) - pitch) <= .003 &&
    obstacles.every(({ point, radius }) => segmentDistance(point, path[i], p) >= radius - .025))
  const lowerGuides = spanGuides.filter(({ point }) => point[1] > 0)
  const groundHeight = Math.max(start[1], end[1], wheels[0].radius,
    ...lowerGuides.map(({ point, radius }) => point[1] + radius))
  for (let count = min; count <= Math.min(maxLinks, min + 2); count++) {
    if (ground) {
      const level = levelRun(start, end, groundHeight, count, pitch, lowerGuides.map(g => g.point),
        path => valid(path.map(fromSpan)))
      if (level) {
        choices.push({ count, ...level, path: level.path.map(fromSpan) })
        continue
      }
    }
    if (length > pitch * (count + 1)) continue
    function trace(height) {
      const guide = samples.map(([x, y]) => [x, y + Math.sin(Math.PI * x / width) * height])
      guide.push([width + pitch * (count + 1), end[1]])
      return followGuide(guide, count, pitch)
    }
    let low = 0, high = pitch * 1.75
    let path = trace(0)
    if (path.at(-1)[0] < width - epsilon) continue
    if (Math.abs(path.at(-1)[0] - width) > epsilon) {
      if (trace(high).at(-1)[0] > width + epsilon) continue
      for (let i = 0; i < 30; i++) {
        const height = (low + high) / 2
        path = trace(height)
        if (path.at(-1)[0] > width) low = height
        else high = height
      }
    } else high = 0
    path = path.map(fromSpan)
    path[path.length - 1] = last
    if (!valid(path)) continue
    choices.push({ count, path, cost: high * 2 + Math.max(0, length - gap(start, end)) })
  }
  return choices
}

function outsideArcs(wheel, design, normal, project, side, radius) {
  const sign = Math.sign(vec(trackLine(wheel).axis).dot(normal))
  const center = project(vec(wheel.position))
  const seats = treadSeats(wheel, { design }).filter(seat => seat.sign === sign)
    .map(({ pose }) => ({
      pose, start: project(vec(pose.position)),
      end: project(new Vector3(0, 0, -sprockets[wheel.design].pitch)
        .applyQuaternion(new Quaternion().fromArray(pose.rotation)).add(vec(pose.position))),
    }))
  seats.sort((a, b) => Math.atan2(a.start[1] - center[1], a.start[0] - center[0]) -
    Math.atan2(b.start[1] - center[1], b.start[0] - center[0]))
  const arcs = []
  for (let start = 0; start < seats.length; start++) {
    const first = seats[start].start
    if (side * first[1] < radius * .52) continue
    for (let count = 3; count <= 7; count++) {
      const run = Array.from({ length: count }, (_, i) => seats[(start + i) % seats.length])
      const last = run.at(-1).end
      if (side * last[1] > -radius * .52 || run.some((s, i) => i && gap(s.start, run[i - 1].end) > .005)) continue
      const middle = run[Math.floor(count / 2)].start
      if (side * (middle[0] - center[0]) > -.4 * radius) continue
      arcs.push({ first, last, run })
    }
  }
  return arcs
}

export function layoutTrack(wheels, support, { design = '57518', count } = {}) {
  const [a, b] = wheels
  const spec = sprockets[a?.design]
  if (!a || !b || a.id === b.id || !spec || a.design !== b.design || !isTread(design)) return { reason: 'pair' }
  if (count !== undefined && (!Number.isInteger(count) || count < 8 || count > maxLinks)) return { reason: 'count' }
  const origin = vec(a.position)
  const normal = vec(trackLine(a).axis).normalize()
  const other = vec(trackLine(b).axis).normalize()
  if (Math.abs(normal.dot(other)) < 1 - 1e-6) return { reason: 'parallel' }
  const delta = vec(b.position).sub(origin)
  const offset = delta.dot(normal)
  if (Math.abs(offset) > .005) return { reason: 'plane', offset, normal: normal.toArray() }
  const horizontal = delta.addScaledVector(normal, -offset)
  const distance = horizontal.length()
  const radius = spec.pitch / (2 * Math.tan(Math.PI / spec.teeth))
  if (distance < 2 * radius || distance > maxLinks * spec.pitch / 2) return { reason: 'distance' }
  horizontal.normalize()
  const vertical = normal.clone().cross(horizontal)
  const groundSide = Math.abs(vertical.y) >= .5 ? -Math.sign(vertical.y) : 0
  const project = point => {
    const p = point.sub(origin)
    return [p.dot(horizontal), p.dot(vertical)]
  }
  const guideParts = support.filter(part => Object.hasOwn(guideRadii, part.design) &&
    Math.abs(vec(part.position).sub(origin).dot(normal)) < 8 &&
    Math.abs(vec(trackLine(part).axis).dot(normal)) > .999)
  const guides = guideParts.map(part => ({ point: project(vec(part.position)), radius: guideRadii[part.design] }))
    .filter(({ point }) => point[0] > 0 && point[0] < distance)
  const obstacles = [{ point: [0, 0], radius }, { point: [distance, 0], radius }]
  const arcsA = outsideArcs(a, design, normal, project, 1, radius)
  const arcsB = outsideArcs(b, design, normal, project, -1, radius)
  const cache = new Map()
  function span(start, end, side) {
    const key = [side, ...start, ...end].map(n => n.toFixed(5)).join(',')
    if (!cache.has(key)) cache.set(key, spanChoices(start, end, side, guides, obstacles, spec.pitch, side === groundSide))
    return cache.get(key)
  }
  let best
  for (const left of arcsA) for (const right of arcsB) {
    const lower = span(left.last, right.first, -1)
    const upper = span(right.last, left.first, 1)
    for (const bottom of lower) for (const top of upper) {
      const total = left.run.length + right.run.length + bottom.count + top.count
      if (total > maxLinks || count !== undefined && total !== count) continue
      const groundFlat = groundSide === -1 ? Boolean(bottom.flat) : groundSide === 1 ? Boolean(top.flat) : undefined
      const cost = total * spec.pitch + bottom.cost + top.cost
      if (!best || (groundFlat && !best.groundFlat) || (groundFlat === best.groundFlat && cost < best.cost)) {
        best = { left, right, bottom, top, cost, groundFlat }
      }
    }
  }
  if (!best) return { reason: 'closure' }
  const unproject = ([x, y]) => origin.clone().addScaledVector(horizontal, x).addScaledVector(vertical, y)
  function freePoses({ path }) {
    return path.slice(0, -1).map((point, i) => {
      const start = unproject(point)
      const z = start.clone().sub(unproject(path[i + 1])).normalize()
      const y = z.clone().cross(normal)
      const q = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(normal, y, z))
      return { position: start.toArray(), rotation: q.toArray() }
    })
  }
  const { left, right, bottom, top } = best
  return { poses: [...left.run.map(s => s.pose), ...freePoses(bottom), ...right.run.map(s => s.pose), ...freePoses(top)],
    guides: guides.length, cost: best.cost, groundFlat: best.groundFlat }
}
