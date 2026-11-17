import { measureInsertion } from './assembly.js?v=rotation'
import { evaluateSpurMesh } from './gears.js'
import { dot } from './vector.js?v=connector-coverage'

const rigid = motion => motion === 'fixed' || motion === 'locked'
const sameAxis = (a, b) => measureInsertion(a, b)?.direction

// Each rigid component moves as one body, including parts located off the spin axis.
export function rotationalDrive(driver, ids, joints, gears, preferred) {
  const groups = new Map(Array.from(ids, id => [id, { members: [id], joints: [], gears: [] }]))
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

  const jointLine = (joint, body) => groups.get(joint.a) === body ? joint.shaftLine : joint.socketLine
  const source = groups.get(driver)
  const bearings = source.joints.filter(joint => joint.motion === 'continuous').map(joint => jointLine(joint, source))
  const candidates = bearings.length ? bearings : preferred ? [preferred] : []
  if (!candidates.length) return null
  const axis = candidates.find(line => bearings.every(bearing => sameAxis(line, bearing)))
  if (!axis) return { ok: false, reason: 'multiple-joint-axes' }
  const alignment = preferred ? dot(axis.axis, preferred.axis) : 1
  const spins = new Map([[source, { ...axis, ratio: alignment < -1e-6 ? -1 : 1 }]])
  const pending = [source]
  const meshes = []
  const seenMeshes = new Set()
  for (const body of pending) {
    const spin = spins.get(body)
    for (const gear of body.gears) {
      for (const other of gears) {
        if (gear.part === other.part) continue
        const mesh = evaluateSpurMesh(gear, other)
        if (!mesh.ok) continue
        const gain = sameAxis(spin, { start: gear.center, axis: gear.axis })
        if (!gain) return { ok: false, reason: 'off-axis-gear' }
        const next = groups.get(other.part)
        const line = { start: other.center, axis: other.axis }
        const ratio = spin.ratio * gain * mesh.ratio
        if (!Number.isFinite(ratio) || ratio === 0) return { ok: false, reason: 'ratio-out-of-range' }
        const prior = spins.get(next)
        if (prior) {
          const direction = sameAxis(prior, line)
          if (!direction || Math.abs(prior.ratio * direction - ratio) > 1e-8 * Math.max(Math.abs(ratio), Math.abs(prior.ratio))) {
            return { ok: false, reason: 'inconsistent-transmission' }
          }
        } else {
          spins.set(next, { ...line, ratio })
          pending.push(next)
        }
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
      if (sharedAxis && Math.abs(a.ratio - b.ratio * sharedAxis) < 1e-8) continue
      const valid = (spin, line) => !spin || (joint.motion === 'continuous' && sameAxis(spin, line)) ||
        (joint.motion === 'ball' && sameAxis(spin, { start: line.start, axis: spin.axis }))
      if (!valid(a, joint.shaftLine) || !valid(b, joint.socketLine)) return { ok: false, reason: 'constrained-joint' }
    }
  }
  return { ok: true, meshes, spins: new Map(pending.flatMap(body => body.members.map(id => [id, spins.get(body)]))) }
}
