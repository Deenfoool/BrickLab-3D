import { rotationMotion, rotationPoses } from './model.js?v=belt-drive'
import { wheelContact } from './vehicle-drive.js?v=belt-drive'

function readTravel(vehicle, motion, wheel, spring, restLength, angle) {
  const poses = rotationPoses(vehicle.parts, motion, angle)
  const tyre = poses?.find(part => part.id === wheel.wheel.id)
  const coil = poses?.find(part => part.id === spring)
  if (!tyre || !coil?.previewScale) return
  const center = wheelContact(wheel.wheel, tyre, vehicle.forward).position
  return { angle, offset: center.y - wheel.position.y, length: coil.previewScale[1] * restLength }
}

function followBranch(at, min, max) {
  const neutral = at(0)
  if (!neutral) return
  const paths = [min, max].map(limit => {
    const samples = []
    let last = neutral
    const count = Math.ceil(Math.abs(limit) / (Math.PI / 180))
    for (let i = 1; i <= count; i++) {
      const point = at(limit * i / count)
      if (!point) break
      const dy = point.offset - last.offset
      const dl = point.length - last.length
      if (Math.abs(dy) < 1e-4 || dy * dl >= 0 ||
          (last !== neutral && Math.sign(dy) !== Math.sign(last.offset))) break
      samples.push(point)
      last = point
    }
    return samples
  })
  const points = paths.flat().concat(neutral).sort((a, b) => a.offset - b.offset)
  if (points.at(-1).offset - points[0].offset < .5) return
  return points
}

export function suspensionValue(points, offset) {
  const last = points.at(-1)
  if (offset >= last.offset) return last
  const index = points.findIndex(point => point.offset >= offset)
  if (!index) return points[0]
  const a = points[index - 1]
  const b = points[index]
  const t = (offset - a.offset) / (b.offset - a.offset)
  return { offset, angle: a.angle + (b.angle - a.angle) * t, length: a.length + (b.length - a.length) * t }
}

export function findSuspension(vehicle, assembly) {
  const supported = new Map()
  for (const { shaft, fit } of assembly.connections) {
    if (fit.motion.rotation !== 'spring') continue
    const spring = shaft.part
    const { restLength } = assembly.port(spring, shaft.port)
    if (typeof restLength !== 'number') continue
    const motion = rotationMotion(spring, vehicle.parts, assembly)
    if (!motion?.ok || motion.kind !== 'suspension' || motion.unit === 'linear') continue
    for (const wheel of vehicle.initial) {
      const at = angle => readTravel(vehicle, motion, wheel, spring, restLength, angle)
      const points = followBranch(at, ...motion.range.map(degrees => degrees * Math.PI / 180))
      if (!points || supported.has(wheel.wheel.id)) continue
      const max = points.at(-1).offset
      const min = points[0].offset
      supported.set(wheel.wheel.id, { spring, motion, points, min, max })
    }
  }
  return supported
}
