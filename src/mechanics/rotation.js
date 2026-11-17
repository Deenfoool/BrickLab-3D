import { measureInsertion } from './assembly.js?v=belt-drive'
import { evaluateSpurMesh } from './gears.js'
import { dot } from './vector.js?v=connector-coverage'

const rigid = motion => motion === 'fixed' || motion === 'locked'
const sameAxis = (a, b) => measureInsertion(a, b)?.direction

// Each rigid component moves as one body, including parts located off the spin axis.
export function rotationalDrive(driver, ids, joints, gears, preferred, couplings = [], belts = []) {
  const groups = new Map(Array.from(ids, id => [id, { members: [id], joints: [], gears: [], couplings: [], belts: [] }]))
  if (!groups.has(driver)) return null
  for (const { a, b, motion } of joints) {
    if (!rigid(motion)) continue
    let first = groups.get(a)
    let second = groups.get(b)
    if (first === second) continue
    if (first.members.length < second.members.length) [first, second] = [second, first]
    for (const id of second.members) {
      groups.set(id, first)
      first.members.push(id)
    }
  }
  for (const joint of joints) {
    const a = groups.get(joint.a)
    const b = groups.get(joint.b)
    if (a === b) continue
    a.joints.push(joint)
    b.joints.push(joint)
  }
  for (const gear of gears) groups.get(gear.part).gears.push(gear)

  for (const coupling of couplings) {
    groups.get(coupling.a).couplings.push(coupling)
    groups.get(coupling.b).couplings.push(coupling)
  }

  for (const belt of belts) {
    groups.get(belt.a).belts.push(belt)
    if (groups.get(belt.a) !== groups.get(belt.b)) groups.get(belt.b).belts.push(belt)
  }

  const jointLine = (joint, body) => groups.get(joint.a) === body ? joint.shaftLine : joint.socketLine
  const source = groups.get(driver)
  const bearings = source.joints.filter(joint => joint.motion === 'continuous').map(joint => jointLine(joint, source))
  const couplingLines = [...source.couplings, ...source.belts].map(coupling => groups.get(coupling.a) === source ? coupling.lineA : coupling.lineB)
  const guides = [...bearings, ...couplingLines]
  const candidates = guides.length ? guides : preferred ? [preferred] : []
  if (!candidates.length) return null
  const axis = candidates.find(line => guides.every(guide => sameAxis(line, guide)))
  if (!axis) return { ok: false, reason: 'multiple-joint-axes' }
  const alignment = preferred ? dot(axis.axis, preferred.axis) : 1
  const spins = new Map([[source, { ...axis, ratio: alignment < -1e-6 ? -1 : 1 }]])
  const angleAt = (spin, angle) => spin.angleAt ? spin.angleAt(angle) : angle * spin.ratio
  const assign = (next, line, ratio, mapping) => {
    const prior = spins.get(next)
    if (prior) {
      const direction = sameAxis(prior, line)
      if (!direction) return false
      if (!prior.angleAt && !mapping) return Math.abs(prior.ratio * direction - ratio) <= 1e-8 * Math.max(Math.abs(ratio), Math.abs(prior.ratio))
      return [.13, .41, 1.17, 2.37].every(angle => {
        const target = mapping ? mapping(angle) : angle * ratio
        return Math.abs(angleAt(prior, angle) * direction - target) < 1e-6
      })
    }
    spins.set(next, { ...line, ratio, ...(mapping && { angleAt: mapping }) })
    pending.push(next)
    return true
  }
  const pending = [source]
  function transferLinear(spin, next, from, to, gain, invalidAxis) {
    const direction = sameAxis(spin, from)
    if (!direction) return invalidAxis
    const scale = direction * gain
    const ratio = spin.ratio === undefined ? undefined : spin.ratio * scale
    if (ratio !== undefined && (!Number.isFinite(ratio) || ratio === 0)) return 'ratio-out-of-range'
    const mapping = spin.angleAt && (angle => angleAt(spin, angle) * scale)
    if (!assign(next, to, ratio, mapping)) return 'inconsistent-transmission'
    return null
  }

  const activeBelts = new Set()
  const meshes = []
  const seenMeshes = new Set()
  const cardans = new Map()
  for (const body of pending) {
    const spin = spins.get(body)
    for (const coupling of body.couplings) {
      if (cardans.has(coupling.cross)) continue
      const forward = groups.get(coupling.a) === body
      const from = forward ? coupling.lineA : coupling.lineB
      const to = forward ? coupling.lineB : coupling.lineA
      const next = groups.get(forward ? coupling.b : coupling.a)
      const direction = sameAxis(spin, from)
      if (!direction) return { ok: false, reason: 'off-axis-cardan' }
      const transfer = forward ? coupling.forward : coupling.reverse
      const inputAngle = angle => direction * angleAt(spin, angle)
      const outputAngle = angle => transfer(inputAngle(angle))
      if (!assign(next, to, undefined, outputAngle)) return { ok: false, reason: 'inconsistent-transmission' }
      cardans.set(coupling.cross, angle => coupling.crossPose(
        forward ? inputAngle(angle) : outputAngle(angle), forward ? outputAngle(angle) : inputAngle(angle)))
    }
    for (const belt of body.belts) {
      const forward = groups.get(belt.a) === body
      const from = forward ? belt.lineA : belt.lineB
      const to = forward ? belt.lineB : belt.lineA
      const next = groups.get(forward ? belt.b : belt.a)
      const failure = transferLinear(spin, next, from, to, forward ? belt.ratio : 1 / belt.ratio, 'off-axis-belt')
      if (failure) return { ok: false, reason: failure }
      activeBelts.add(belt)
    }
    for (const gear of body.gears) {
      for (const other of gears) {
        if (gear.part === other.part) continue
        const mesh = evaluateSpurMesh(gear, other)
        if (!mesh.ok) continue
        const failure = transferLinear(spin, groups.get(other.part), { start: gear.center, axis: gear.axis },
          { start: other.center, axis: other.axis }, mesh.ratio, 'off-axis-gear')
        if (failure) return { ok: false, reason: failure }
        const key = JSON.stringify([gear.part, other.part].sort())
        if (!seenMeshes.has(key)) {
          seenMeshes.add(key)
          meshes.push({ a: gear.part, b: other.part, ratio: mesh.ratio })
        }
      }
    }
  }

  const checked = new Set()
  for (const body of pending) {
    for (const joint of body.joints) {
      if (checked.has(joint)) continue
      checked.add(joint)
      const a = spins.get(groups.get(joint.a))
      const b = spins.get(groups.get(joint.b))
      const sharedAxis = a && b && sameAxis(a, b)
      if (sharedAxis && [.13, .41, 1.17, 2.37].every(angle => Math.abs(angleAt(a, angle) - angleAt(b, angle) * sharedAxis) < 1e-8)) continue
      const valid = (spin, line) => !spin || (joint.motion === 'continuous' && sameAxis(spin, line)) ||
        (joint.motion === 'ball' && sameAxis(spin, { start: line.start, axis: spin.axis }))
      if (!valid(a, joint.shaftLine) || !valid(b, joint.socketLine)) return { ok: false, reason: 'constrained-joint' }
    }
  }
  return { ok: true, meshes, cardans, belts: [...activeBelts], spins: new Map(pending.flatMap(body => body.members.map(id => [id, spins.get(body)]))) }
}
