import { Matrix4, Quaternion, Vector3 } from 'three'

export const sprockets = { 57519: { teeth: 10, pitch: 30 } }
export const isTread = design => /^(57518|88323)(c\d+)?$/.test(design)
const vec = a => new Vector3().fromArray(a)
const quat = a => new Quaternion().fromArray(a)
const step = spec => 2 * Math.PI / spec.teeth
const centerOf = part => vec([0, 0, -15]).applyQuaternion(quat(part.rotation)).add(vec(part.position))

// The 57519 tooth gaps start on +Y. A tread spans two gaps, with its
// crossbars at the polygon vertices and its raised outer face toward -Y.
function relativeSeat(spec, i, sign) {
  const half = step(spec) / 2
  const a = (i + .5) * step(spec)
  const radial = new Vector3(-Math.sin(a), Math.cos(a), 0)
  const x = new Vector3(0, 0, sign), y = radial.clone().negate()
  const z = x.clone().cross(y)
  const rotation = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x, y, z))
  const center = radial.multiplyScalar(spec.pitch / (2 * Math.tan(half)))
  return { center, rotation, position: center.clone().addScaledVector(z, spec.pitch / 2) }
}

export function treadSeats(wheel, tread, wheelMoves = false) {
  const spec = sprockets[wheel.design]
  const seats = []
  for (let i = 0; i < spec.teeth; i++) {
    for (const sign of [1, -1]) {
      const seat = relativeSeat(spec, i, sign)
      const rotation = wheelMoves ? quat(tread.rotation).multiply(seat.rotation.clone().invert())
        : quat(wheel.rotation).multiply(seat.rotation)
      const position = wheelMoves ? vec(tread.position).sub(seat.position.applyQuaternion(rotation))
        : seat.position.applyQuaternion(quat(wheel.rotation)).add(vec(wheel.position))
      const point = wheelMoves ? centerOf(tread) : seat.center.applyQuaternion(quat(wheel.rotation)).add(vec(wheel.position))
      seats.push({ i, sign, point, pose: { position: position.toArray(), rotation: rotation.toArray() } })
    }
  }
  return seats
}

export function treadCandidates(moving, fixed, parts, scene, event, acceptPose) {
  const wheelMoves = Boolean(sprockets[moving.design])
  const [wheel, tread] = wheelMoves ? [moving, fixed] : [fixed, moving]
  if (!sprockets[wheel.design] || !isTread(tread.design)) return []
  const others = parts.filter(p => p.id !== tread.id && isTread(p.design)).map(p => ({
    center: centerOf(p), pivot: vec(p.position), clip: vec([0, 0, -30]).applyQuaternion(quat(p.rotation)).add(vec(p.position)),
  }))
  const options = []
  for (const { i, sign, point, pose } of treadSeats(wheel, tread, wheelMoves)) {
    const distance = scene.pixelDistance(point, event)
    if (!Number.isFinite(distance) || distance > 25 || acceptPose && !acceptPose(pose)) continue
    if (!wheelMoves && others.some(other => other.center.distanceToSquared(point) < 9)) continue
    if (!wheelMoves) {
      const pivot = vec(pose.position), clip = vec([0, 0, -30]).applyQuaternion(quat(pose.rotation)).add(pivot)
      if (others.some(other => other.pivot.distanceToSquared(pivot) < .04 || other.clip.distanceToSquared(clip) < .04)) continue
    } else if (parts.some(p => p.id !== wheel.id && sprockets[p.design] && vec(p.position).distanceToSquared(vec(pose.position)) < 9)) continue
    options.push({ key: JSON.stringify(['sprocket', fixed.id, i, sign]), point, pose, distance,
      turn: quat(moving.rotation).angleTo(quat(pose.rotation)), mesh: { ok: true, kind: 'tread' } })
  }
  return options
}

// Rebuild engagement from the world poses, including after project import.
// A sliding tooth contact never consumes either end of the tread hinge.
export function trackDrives(parts, connections) {
  const wheels = parts.filter(part => sprockets[part.design])
  if (!wheels.length) return []
  const treads = parts.filter(part => isTread(part.design))
  const byId = new Map(treads.map(part => [part.id, part]))
  const contacts = new Map(), next = new Map(), previous = new Map(), blocked = new Set()
  for (const wheel of wheels) {
    if (!treads.length) break
    const seats = treadSeats(wheel, treads[0])
    for (const tread of treads) {
      const match = seats.find(({ pose }) => vec(pose.position).distanceToSquared(vec(tread.position)) < .04 &&
        quat(pose.rotation).angleTo(quat(tread.rotation)) < .005)
      if (match) contacts.set(tread.id, { wheel, sign: match.sign })
    }
  }
  const rigid = new Map()
  function neighbor(a, b) {
    if (!rigid.has(a)) rigid.set(a, [])
    rigid.get(a).push(b)
  }
  for (const { socket, shaft, fit } of connections) {
    if (socket.port === 'tread-clip' && shaft.port === 'tread-pivot') {
      next.set(socket.part, shaft.part)
      previous.set(shaft.part, socket.part)
    } else if (['fixed', 'locked'].includes(fit.motion.rotation)) {
      neighbor(socket.part, shaft.part)
      neighbor(shaft.part, socket.part)
    } else {
      blocked.add(socket.part)
      blocked.add(shaft.part)
    }
  }
  const seen = new Set(), tracks = []
  for (const part of [...treads.filter(p => !previous.has(p.id)), ...treads]) {
    const links = []
    let id = part.id
    while (byId.has(id) && !seen.has(id)) {
      links.push(byId.get(id))
      seen.add(id)
      id = next.get(id)
    }
    if (!links.length || links.some(p => blocked.has(p.id))) continue
    const closed = id === part.id
    const seats = links.map(p => contacts.get(p.id))
    const drives = [...new Map(seats.filter(Boolean).map(s => [s.wheel.id, s])).values()]
    if (!drives.length || !closed && (drives.length !== 1 || seats.some(s => !s))) continue
    const attachments = new Map()
    let constrained = false
    for (const link of links) {
      const body = new Set([link.id])
      for (const member of body) {
        if (blocked.has(member) || member !== link.id && (byId.has(member) || wheels.some(w => w.id === member))) {
          constrained = true
          break
        }
        for (const adjacent of rigid.get(member) ?? []) body.add(adjacent)
      }
      body.delete(link.id)
      if (body.size) attachments.set(link.id, parts.filter(p => body.has(p.id)))
    }
    if (!constrained) tracks.push({ links, seats, drives, closed, attachments })
  }
  return tracks
}

const axle = wheel => vec([0, 0, 1]).applyQuaternion(quat(wheel.rotation))
export const trackLine = wheel => ({ start: wheel.position, axis: axle(wheel).toArray() })

function fitTreadRun(points, reference, first, last, pitch, axis, center) {
  const n = points.length
  const count = (last - first + n) % n
  if (count < 2) return
  const start = points[first], end = points[last]
  const chord = end.clone().sub(start)
  const distance = chord.length()
  if (distance > count * pitch + .001) return
  const original = reference[last].clone().sub(reference[first]).normalize()
  let bends = Array.from({ length: count }, (_, i) => {
    const a = reference[(first + i) % n], b = reference[(first + i + 1) % n]
    const tangent = b.clone().sub(a).normalize()
    return Math.atan2(axis.dot(original.clone().cross(tangent)), original.dot(tangent))
  })
  if (Math.max(...bends.map(Math.abs)) < .001) {
    const outward = Math.sign(axis.dot(chord.clone().cross(start.clone().sub(center)))) || 1
    bends = bends.map((_, i) => outward * .2 * Math.cos(Math.PI * (i + .5) / count))
  }
  const resultant = scale => {
    let x = 0, y = 0
    for (const bend of bends) {
      x += pitch * Math.cos(scale * bend)
      y += pitch * Math.sin(scale * bend)
    }
    return { x, y, length: Math.hypot(x, y) }
  }
  let low = 0, high = 1
  while (high < 16 && resultant(high).length > distance) high *= 2
  if (resultant(high).length > distance + .001) return
  for (let i = 0; i < 25; i++) {
    const scale = (low + high) / 2
    if (resultant(scale).length > distance) low = scale
    else high = scale
  }
  const { x, y } = resultant(high)
  const correction = Math.atan2(y, x)
  const direction = chord.normalize()
  let at = start.clone()
  for (let i = 0; i < count - 1; i++) {
    at = at.clone().addScaledVector(direction.clone().applyAxisAngle(axis, high * bends[i] - correction), pitch)
    points[(first + i + 1) % n] = at
  }
}

function linkPoses(track, spin, angle) {
  const { links, seats, drives, closed } = track
  const { wheel, sign } = drives[0]
  const axis = axle(wheel)
  const radians = (spin.angleAt ? spin.angleAt(angle) : spin.ratio * angle) * axis.dot(vec(spin.axis))
  const around = (point, wheel, radians) => point.sub(vec(wheel.position)).applyAxisAngle(axle(wheel), radians).add(vec(wheel.position))
  if (!closed) {
    const q = new Quaternion().setFromAxisAngle(axis, radians)
    return links.map(p => ({ ...p, position: around(vec(p.position), wheel, radians).toArray(),
      rotation: q.clone().multiply(quat(p.rotation)).toArray() }))
  }
  // Move each pivot along its original run. Seated spans follow circular arcs.
  // Relax the intervening free pivots to preserve the rigid crossbar spacing.
  const phase = sign * radians / step(sprockets[wheel.design])
  const whole = Math.floor(phase), fraction = phase - whole, n = links.length
  const indices = links.map((_, i) => ((i + whole) % n + n) % n)
  const points = indices.map(j => {
    const p = vec(links[j].position), seat = seats[j]
    return seat ? around(p, seat.wheel, fraction * seat.sign * step(sprockets[seat.wheel.design]))
      : p.lerp(vec(links[(j + 1) % n].position), fraction)
  })
  const pitch = sprockets[wheel.design].pitch
  const reference = indices.map(j => vec(links[j].position).lerp(vec(links[(j + 1) % n].position), fraction))
  const anchors = indices.flatMap((j, i) => seats[j] ? [i] : [])
  const center = drives.reduce((sum, drive) => sum.add(vec(drive.wheel.position)), new Vector3())
    .multiplyScalar(1 / drives.length)
  for (const [i, first] of anchors.entries()) {
    fitTreadRun(points, reference, first, anchors[(i + 1) % anchors.length], pitch, axis, center)
  }
  // Fall back to relaxing free pivots for older layouts whose moving anchors are overconstrained.
  for (let pass = 0; pass < 100; pass++) {
    let error = 0
    for (let i = 0; i < n; i++) {
      const k = (i + 1) % n, delta = points[k].clone().sub(points[i]), length = delta.length()
      const adjust = length - pitch
      error = Math.max(error, Math.abs(adjust))
      const a = seats[indices[i]] ? 0 : 1, b = seats[indices[k]] ? 0 : 1
      if (a + b && length) {
        delta.multiplyScalar(adjust / (length * (a + b)))
        points[i].addScaledVector(delta, a)
        points[k].addScaledVector(delta, -b)
      }
    }
    if (error < .001) break
  }
  return links.map((part, i) => {
    const q = quat(links[indices[i]].rotation)
    const from = vec([0, 0, -1]).applyQuaternion(q)
    const to = points[(i + 1) % n].clone().sub(points[i]).normalize()
    return { ...part, position: points[i].toArray(), rotation: q.premultiply(new Quaternion().setFromUnitVectors(from, to)).toArray() }
  })
}

export function trackPoses(track, spin, angle) {
  const moved = linkPoses(track, spin, angle)
  const mounted = []
  for (let i = 0; i < moved.length; i++) {
    const from = track.links[i], to = moved[i], attachments = track.attachments.get(from.id)
    if (!attachments) continue
    const turn = quat(to.rotation).multiply(quat(from.rotation).invert())
    for (const part of attachments) mounted.push({ ...part,
      position: vec(part.position).sub(vec(from.position)).applyQuaternion(turn).add(vec(to.position)).toArray(),
      rotation: turn.clone().multiply(quat(part.rotation)).toArray(),
    })
  }
  return moved.concat(mounted)
}
