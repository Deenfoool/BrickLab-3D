import technic from '../../catalog/technic.json?v=connector-coverage' with { type: 'json' }
import profiles from '../../catalog/snap-profiles.json?v=technic-seats' with { type: 'json' }
import designs from '../../catalog/snap-parts.json?v=half-pin-seats' with { type: 'json' }
import plates from '../../catalog/system-plate-connectors.json' with { type: 'json' }
import slopes from '../../catalog/system-slope-connectors.json' with { type: 'json' }
import tiles from '../../catalog/system-tile-connectors.json' with { type: 'json' }

import buggyParts from '../../catalog/dune-buggy-parts.json?v=rotation' with { type: 'json' }
import engineParts from '../../catalog/inline-engine-parts.json' with { type: 'json' }

export { technic }

const support = { ...engineParts, ...buggyParts }
const noPorts = Object.freeze([])
const openings = [[], ['start'], ['end'], ['start', 'end']]
const unpackTypes = types => types.map(([role, gender, ends, sections, group, slot, pneumatic, legacy]) => ({
  role, gender, openings: openings[ends], ...(group && { group }), ...(slot && { slot }), ...(pneumatic && { pneumatic }), ...(legacy && { legacy }),
  sections: sections.map(([shape, radius, length, teeth]) =>
    teeth === null ? { shape, radius, length } : { shape, radius, length, teeth }),
}))
const unpackLocations = locations => locations.map(([point, reference]) => ({
  start: point.slice(0, 3), axis: point.slice(3), ...(reference && { reference }),
}))
const catalogs = [{ ...profiles, parts: designs }, plates, slopes, tiles].map(({ parts, types, locations }) => ({
  parts, definitions: unpackTypes(types), locations: unpackLocations(locations),
}))
const catalogFor = design => catalogs.find(catalog => Object.hasOwn(catalog.parts, design))
const imported = new Map()
const roundPlateAxleHole = {
  id: 'axle-hole', role: 'key', gender: 'F', openings: ['start', 'end'],
  start: [0, 0, 0], axis: [0, 1, 0], reference: [1, 0, 0],
  sections: [{ shape: 'A', radius: 6, length: 8 }],
}

// The ridged exterior and the driving ring bore share the Z axis in the LDraw models.
const selectorGuides = {
  18948: { id: 'selector-spline', role: 'selector-spline', gender: 'M', length: 60 },
  18947: { id: 'selector-guide', role: 'selector-guide', gender: 'F', length: 56 },
}

const turntables = {
  18938: [60, 'M'], 88738: [60, 'M'], 18939: [60, 'F'],
  99010: [28, 'M'], 99009: [28, 'F'],
}

const shockPort = (id, role, gender, start, axis, extra) => ({
  id, role, gender, start, axis, openings: ['start'], reference: [0, 0, 1],
  sections: [{ shape: 'Q', radius: 1, length: 1 }], ...extra,
})

// Eye spacing and spring seats from the extended and compressed LDraw assemblies.
const shockFamilies = [
  { group: 'shock-6.5', rod: '4254', cylinder: '4255', eye: 0, stroke: [84, 105],
    coilSeat: 56, rodSeat: -10, coils: ['8845-spring'] },
  { group: 'shock-9', rod: '2910', cylinder: '2909', eye: -50, stroke: [130, 170],
    coilSeat: -10, rodSeat: -30, coils: ['41355-f1', '41355-f2', 'u9409-f1', 'u9409-f2', 'u9410-f1', 'u9410-f2', 'u9411-f1', 'u9411-f2'] },
  { group: 'shock-9-thick', rod: '80021', cylinder: '80022', eye: 0, stroke: [140, 160],
    coilSeat: 41, rodSeat: -19, coils: ['u9562-f1', 'u9562-f2'] },
  { group: 'shock-10-damped', rod: '32183c02', cylinder: '32181c05', eye: 0, stroke: [120, 180],
    coilSeat: 84, rodSeat: -10, coils: ['22020-f1', '22020-f2'] },
]

const suspensionPorts = Object.fromEntries(shockFamilies.flatMap(({ group, rod, cylinder, eye, stroke, coilSeat, rodSeat, coils }) => [
  [rod, [shockPort('piston-guide', 'piston', 'M', [0, 0, 0], [0, 1, 0], { group, springSeat: [0, rodSeat, 0] })]],
  [cylinder, [
    shockPort('cylinder-guide', 'damper-cylinder', 'F', [0, eye, 0], [0, 1, 0], { group, stroke }),
    shockPort('coil-seat', 'coil-seat', 'F', [0, coilSeat, 0], [0, 1, 0], { group, slot: 'coil' }),
  ]],
  ...coils.map(design => [design, [shockPort('coil-base', 'coil', 'M', [0, 0, 0], [0, 1, 0],
    { group, slot: 'coil', restLength: design === '8845-spring' ? 38 : stroke[design.endsWith('-f2') ? 0 : 1] - (coilSeat - eye) + rodSeat })]]),
]))

export function hasConnectors(design) {
  return Object.hasOwn(technic, design) || Object.hasOwn(turntables, design) ||
    Boolean(catalogFor(design) || support[design]?.ports?.length || suspensionPorts[design])
}

export function portsFor(design) {
  if (Object.hasOwn(technic, design)) return technic[design]
  if (!imported.has(design)) {
    // BrickLab's 88738 body uses the same hole datums and pitch circle as 18938.
    const profileDesign = design === '88738' && !catalogFor(design) ? '18938' : design
    const catalog = catalogFor(profileDesign)
    const base = catalog?.parts[profileDesign].map(([key, type, point]) => ({
      id: `shadow-${key}`, ...catalog.definitions[type], ...catalog.locations[point],
      ...(catalog.definitions[type].role === 'rim-seat' && { mates: profiles.rimMates[design] }),
      ...(catalog.definitions[type].role === 'tyre-seat' && { design }),
      ...(suspensionPorts[design] && /:(?:fake-)?spring-[01]$/.test(catalog.definitions[type].group ?? '') && { legacy: true }),
    })) ?? support[design]?.ports ?? noPorts
    const supported = suspensionPorts[design] ? [...base, ...suspensionPorts[design]] : base
    if (design === '88738' && profileDesign === '18938') {
      const gear = supported.find(port => port.role === 'gear')
      gear.sections = gear.sections.map(section => ({ ...section, length: 15 }))
    }
    if (design === '69779') {
      // LDraw 69779s01.dat places the teeth at Z = -4.75…4.75, around the existing axle bore.
      supported.push({ id: 'spur-teeth', role: 'gear', gender: 'M', openings: [],
        start: [0, 0, -4.75], axis: [0, 0, 1], sections: [{ shape: 'G', radius: 25, length: 9.5, teeth: 20 }] })
    }
    if (Object.hasOwn(turntables, design)) {
      const [teeth, gender] = turntables[design]
      supported.push({
        id: 'turntable-bearing', role: gender === 'M' ? 'turntable-top' : 'turntable-base',
        group: `turntable-${teeth}`, gender, openings: ['start'],
        start: [0, 0, 0], axis: [0, -1, 0], sections: [{ shape: 'Q', radius: 1, length: 1 }],
      })
    }
    if (['u9479c01', '40940', '10089c01', '10095'].includes(design)) supported.push({
      id: 'control-plus-output', role: ['40940', '10095'].includes(design) ? 'clip' : 'pivot',
      gender: ['40940', '10095'].includes(design) ? 'F' : 'M', group: ['10095', '10089c01'].includes(design) ? 'pf-l-output' : 'control-plus-l-output',
      start: [0, 0, design === 'u9479c01' ? -10 : 0], axis: [0, 0, 1],
      openings: ['start', 'end'], reference: [1, 0, 0],
      sections: [{ shape: 'Q', radius: 1, length: 1 }],
    })
    if (design === '2909') supported.push({
      id: 'damper-eye', role: 'bearing', gender: 'F', openings: ['start', 'end'],
      start: [0, -50, -10], axis: [0, 0, 1], sections: [{ shape: 'R', radius: 8, length: 2 },
        { shape: 'R', radius: 6, length: 16 }, { shape: 'R', radius: 8, length: 2 }],
    })
    if (Object.hasOwn(selectorGuides, design)) {
      const { length, ...guide } = selectorGuides[design]
      supported.push({ ...guide, group: 'selector-3l-ridged', openings: ['start', 'end'],
        start: [0, 0, -length / 2], axis: [0, 0, 1], reference: [1, 0, 0],
        sections: [{ shape: 'K', radius: 9.5, length }] })
    }
    if (design === '32187') {
      // The four dogs also mate with the 3L ring and its two-sided clutch gear.
      for (const port of supported) port.extension = true
      supported.push({ id: 'extension-bore', role: 'bearing', gender: 'F', openings: ['start', 'end'],
        start: [0, 0, -10], axis: [0, 0, 1], sections: [{ shape: 'R', radius: 6, length: 20 }] })
    }
    if (design === '18947') supported.push(shockPort('shift-groove', 'shift-groove', 'F',
      [0, 0, 0], [0, 0, 1], { group: 'changeover', slot: 'shift-groove', reference: [1, 0, 0] }))
    if (design === '6641') {
      // Local X pivot at Z=-20. The rounded selector tip is 22 LDU from the pivot.
      for (const shift of [0, -6, 6, -8, 8, -10, 10]) {
        const angle = Math.asin(shift / 22)
        const c = Math.cos(angle), s = Math.sin(angle)
        supported.push(shockPort('shift-tip-' + shift, 'shift-tip', 'M',
          [0, shift * c - 40 * s, -20 - shift * s - 40 * c], [0, c, -s],
          { group: 'changeover', slot: 'shift-tip', shift, reference: [1, 0, 0] }))
      }
    }
    if (/^(57518|88323)(c\d+)?$/.test(design)) {
      // Both clips capture the same crossbar, forming one hinge across the tread.
      for (const [role, gender, z] of [['pivot', 'M', 0], ['clip', 'F', -30]]) {
        supported.push({ id: 'tread-' + role, role, gender, group: 'tread-5-wide',
          openings: ['start'], start: [0, 0, z], axis: [1, 0, 0], reference: [0, 1, 0],
          sections: [{ shape: 'R', radius: 4, length: 28 }] })
      }
    }
    imported.set(design, design === '4032a' ? [...supported, roundPlateAxleHole] : supported)
  }
  return imported.get(design)
}

const shaftRoles = new Set(['axle', 'axle-pin', 'friction-axle-pin', 'duplo-axle', 'clutch-driver', 'selector-spline'])
const socketRoles = new Set(['key', 'blind-key', 'duplo-key', 'bush'])
export const rotationPort = ports => ports.find(port => port.role === 'gear') ??
  ports.find(port => shaftRoles.has(port.role)) ?? ports.find(port => socketRoles.has(port.role)) ??
  ports.find(port => port.role === 'rim-seat' || port.role === 'tyre-seat') ?? ports[0]

export function gearAt(part, design, center, axis) {
  const section = portsFor(design).find(port => port.role === 'gear')?.sections[0]
  if (!section) throw new Error(`Design has no supported spur gear: ${design}`)
  return { part, center, axis, teeth: section.teeth, radius: section.radius, width: section.length,
    ...(['94925', '18946'].includes(design) && { pressureAngle: Math.PI / 9 }) }
}

// Local engagement datum and tooth span of the original Technic rack.
export const gearRacks = {
  3743: { start: [0, 4, 0], axis: [1, 0, 0], normal: [0, -1, 0], length: 80, width: 20, pitch: 8 },
}
