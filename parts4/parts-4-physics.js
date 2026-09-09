import { PARTS } from '../parts.js'

export const PARTS4_PHYSICS_VERSION = 'parts-4-physics-v1'

const PHYSICAL = Object.freeze({
  'universal-joint-30': { massKg: 0.0038, material: 'mixed', collisionClass: 'mechanical' },
  'cv-joint-30': { massKg: 0.0046, material: 'mixed', collisionClass: 'mechanical' },
  'worm-drive-8': { massKg: 0.0180, material: 'mixed', collisionClass: 'structure' },
  'bevel-gear-12': { massKg: 0.00085, material: 'pom', collisionClass: 'mechanical' },
  'bevel-gear-20': { massKg: 0.00145, material: 'pom', collisionClass: 'mechanical' },
  'steering-rack-guide': { massKg: 0.0065, material: 'abs', collisionClass: 'structure' },
  'steering-rack-7': { massKg: 0.0042, material: 'mixed', collisionClass: 'mechanical' },
  'shock-body-5': { massKg: 0.0037, material: 'mixed', collisionClass: 'mechanical' },
  'shock-rod-5': { massKg: 0.0026, material: 'mixed', collisionClass: 'mechanical' },
})

for (const part of PARTS) {
  const physical = PHYSICAL[part.id]
  if (!physical) continue
  part.physics = { ...(part.physics ?? {}), ...physical, parts4: true }
}

globalThis.BrickLabParts4Physics = Object.freeze({
  version: PARTS4_PHYSICS_VERSION,
  definitions: PHYSICAL,
})
