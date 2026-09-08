import { PARTS } from '../parts.js'

export const PARTS3_PHYSICS_VERSION = 'parts-3-physics-v1'

const PHYSICAL = Object.freeze({
  'axle-2': { massKg: 0.00035, material: 'abs', collisionClass: 'mechanical' },
  'axle-9': { massKg: 0.00142, material: 'abs', collisionClass: 'mechanical' },
  bush: { massKg: 0.00036, material: 'abs', collisionClass: 'mechanical' },
  'half-bush': { massKg: 0.00021, material: 'abs', collisionClass: 'mechanical' },
  'steering-tie-rod-5': { massKg: 0.00115, material: 'mixed', collisionClass: 'mechanical' },
  'wheel-hub': { massKg: 0.00220, material: 'mixed', collisionClass: 'mechanical' },
  'wheel-narrow': { massKg: 0.0055, material: 'rubber', collisionClass: 'wheel' },
  'wheel-offroad-large': { massKg: 0.0140, material: 'rubber', collisionClass: 'wheel' },
  'wheel-tractor': { massKg: 0.0210, material: 'rubber', collisionClass: 'wheel' },
})

for (const part of PARTS) {
  const physical = PHYSICAL[part.id]
  if (!physical) continue
  part.physics = { ...(part.physics ?? {}), ...physical, parts3: true }
}

globalThis.BrickLabParts3Physics = Object.freeze({
  version: PARTS3_PHYSICS_VERSION,
  definitions: PHYSICAL,
})
