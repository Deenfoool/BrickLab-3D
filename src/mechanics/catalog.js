import technic from '../../catalog/technic.json?v=connector-coverage' with { type: 'json' }
import profiles from '../../catalog/snap-profiles.json?v=technic-seats' with { type: 'json' }
import designs from '../../catalog/snap-parts.json?v=technic-seats' with { type: 'json' }

import support from '../../catalog/dune-buggy-parts.json?v=8845' with { type: 'json' }

export { technic }

const noPorts = Object.freeze([])
const openings = [[], ['start'], ['end'], ['start', 'end']]
const definitions = profiles.types.map(([role, gender, ends, sections, group, slot, pneumatic, legacy]) => ({
  role, gender, openings: openings[ends], ...(group && { group }), ...(slot && { slot }), ...(pneumatic && { pneumatic }), ...(legacy && { legacy }),
  sections: sections.map(([shape, radius, length, teeth]) =>
    teeth === null ? { shape, radius, length } : { shape, radius, length, teeth }),
}))
const locations = profiles.locations.map(([point, reference]) => ({
  start: point.slice(0, 3), axis: point.slice(3), ...(reference && { reference }),
}))
const imported = new Map()

export function hasConnectors(design) {
  return Object.hasOwn(technic, design) || Object.hasOwn(designs, design) || Boolean(support[design]?.ports?.length)
}

export function portsFor(design) {
  if (Object.hasOwn(technic, design)) return technic[design]
  if (!Object.hasOwn(designs, design)) return support[design]?.ports ?? noPorts
  if (!imported.has(design)) {
    imported.set(design, designs[design].map(([key, type, point]) => ({
      id: `shadow-${key}`, ...definitions[type], ...locations[point],
      ...(definitions[type].role === 'rim-seat' && { mates: profiles.rimMates[design] }),
      ...(definitions[type].role === 'tyre-seat' && { design }),
    })))
  }
  return imported.get(design)
}

const shaftRoles = new Set(['axle', 'axle-pin', 'friction-axle-pin', 'duplo-axle', 'clutch-driver'])
const socketRoles = new Set(['key', 'blind-key', 'duplo-key', 'bush'])
export const rotationPort = ports => ports.find(port => port.role === 'gear') ??
  ports.find(port => shaftRoles.has(port.role)) ?? ports.find(port => socketRoles.has(port.role)) ??
  ports.find(port => port.role === 'rim-seat' || port.role === 'tyre-seat') ?? ports[0]

export function gearAt(part, design, center, axis) {
  const section = portsFor(design).find(port => port.role === 'gear')?.sections[0]
  if (!section) throw new Error(`Design has no supported spur gear: ${design}`)
  return { part, center, axis, teeth: section.teeth, radius: section.radius, width: section.length }
}
