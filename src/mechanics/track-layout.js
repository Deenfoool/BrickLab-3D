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

function spanChoices(first, last, side, guides, wheels, pitch) {
  const direction = side < 0 ? 1 : -1
  const width = direction * (last[0] - first[0])
  if (width < pitch * .5) return []
  const toSpan = point => [direction * (point[0] - first[0]), side * point[1]]
  const fromSpan = point => [first[0] + direction * point[0], side * point[1]]
  const start = toSpan(first), end = toSpan(last)
  const relevant = guides.map(({ point, radius }) => ({ point: toSpan(point), radius }))
    .filter(({ point, radius }) => point[0] > 0 && point[0] < width &&
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
  for (let count = min; count <= Math.min(maxLinks, min + 2); count++) {
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
    if (path.slice(1).some((p, i) => Math.abs(gap(p, path[i]) - pitch) > .003 ||
      obstacles.some(({ point, radius }) => segmentDistance(point, path[i], p) < radius - .025))) continue
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
    if (!cache.has(key)) cache.set(key, spanChoices(start, end, side, guides, obstacles, spec.pitch))
    return cache.get(key)
  }
  let best
  for (const left of arcsA) for (const right of arcsB) {
    const lower = span(left.last, right.first, -1)
    const upper = span(right.last, left.first, 1)
    for (const bottom of lower) for (const top of upper) {
      const total = left.run.length + right.run.length + bottom.count + top.count
      if (total > maxLinks || count !== undefined && total !== count) continue
      const cost = (total * spec.pitch) + bottom.cost + top.cost
      if (!best || cost < best.cost) best = { left, right, bottom, top, cost }
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
    guides: guides.length, cost: best.cost }
}
