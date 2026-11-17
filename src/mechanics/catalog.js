import technic from '../../catalog/technic.json?v=connector-coverage' with { type: 'json' }

export { technic }

const noPorts = Object.freeze([])
export const portsFor = design => Object.hasOwn(technic, design) ? technic[design] : noPorts

export const rotationPort = ports => ports.find(port => port.role === 'gear') ?? ports[0]

export function gearAt(part, design, center, axis) {
  const section = technic[design]?.find(port => port.role === 'gear')?.sections[0]
  if (!section) throw new Error(`Design has no supported spur gear: ${design}`)
  return { part, center, axis, teeth: section.teeth, radius: section.radius, width: section.length }
}
