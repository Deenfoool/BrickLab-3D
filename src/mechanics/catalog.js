import technic from '../../catalog/technic.json?v=axle-length' with { type: 'json' }

export { technic }

export function gearAt(part, design, center, axis) {
  const section = technic[design]?.find(port => port.role === 'gear')?.sections[0]
  if (!section) throw new Error(`Design has no supported spur gear: ${design}`)
  return { part, center, axis, teeth: section.teeth, radius: section.radius, width: section.length }
}
