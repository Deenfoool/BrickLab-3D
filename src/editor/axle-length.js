import { Vector3 } from 'three'
import { portLength } from '../mechanics/axial.js?v=linkages'
import { technic } from '../mechanics/catalog.js?v=inline-engine'
import { worldPort } from './placement.js?v=inline-engine'

const family = ['3705', '3706', '3707', '3737']

export function axleOptions(part) {
  return family.includes(part?.design)
    ? family.map(design => ({ design, length: portLength(technic[design][0]) }))
    : []
}

export function axleEnds(part) {
  const port = technic[part.design][0]
  const { start, axis } = worldPort(part, port)
  return [start, start.clone().addScaledVector(axis, portLength(port))]
}

export function resizeAxle(part, end, delta) {
  const options = axleOptions(part)
  const original = options.find(option => option.design === part.design)
  if (!original) return part
  const requested = original.length + delta
  const replacement = options.reduce((best, option) =>
    Math.abs(option.length - requested) < Math.abs(best.length - requested) ? option : best, original)
  if (replacement === original) return part
  const anchor = axleEnds(part)[1 - end]
  const next = { ...part, design: replacement.design }
  const shift = anchor.sub(axleEnds(next)[1 - end])
  return { ...next, position: new Vector3().fromArray(part.position).add(shift).toArray() }
}
