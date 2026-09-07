import { PARTS } from './parts.js'

export const PHYSICS_UNITS = Object.freeze({
  studMeters: 0.008,
  gravity: 9.81,
  torqueUnit: 'N·m',
  forceUnit: 'N',
  massUnit: 'kg',
  speedUnit: 'm/s',
})

export const SURFACES = Object.freeze({
  concrete: { id: 'concrete', muLong: 1.05, muLat: 0.98, rollingResistance: 0.018 },
  asphalt: { id: 'asphalt', muLong: 1.12, muLat: 1.06, rollingResistance: 0.016 },
  dirt: { id: 'dirt', muLong: 0.72, muLat: 0.62, rollingResistance: 0.035 },
  gravel: { id: 'gravel', muLong: 0.58, muLat: 0.48, rollingResistance: 0.055 },
  mud: { id: 'mud', muLong: 0.38, muLat: 0.30, rollingResistance: 0.095 },
  ice: { id: 'ice', muLong: 0.09, muLat: 0.07, rollingResistance: 0.008 },
})

const DB = {
  'brick-1x2': { massKg: 0.00115, material: 'abs', collisionClass: 'structure' },
  'brick-1x4': { massKg: 0.00195, material: 'abs', collisionClass: 'structure' },
  'brick-2x2': { massKg: 0.00155, material: 'abs', collisionClass: 'structure' },
  'brick-2x4': { massKg: 0.0024, material: 'abs', collisionClass: 'structure' },
  'brick-2x6': { massKg: 0.00345, material: 'abs', collisionClass: 'structure' },
  'plate-1x2': { massKg: 0.00035, material: 'abs', collisionClass: 'structure' },
  'plate-1x4': { massKg: 0.00064, material: 'abs', collisionClass: 'structure' },
  'plate-2x2': { massKg: 0.00060, material: 'abs', collisionClass: 'structure' },
  'plate-2x4': { massKg: 0.0012, material: 'abs', collisionClass: 'structure' },
  'plate-2x6': { massKg: 0.00172, material: 'abs', collisionClass: 'structure' },
  'technic-brick-1x4': { massKg: 0.00205, material: 'abs', collisionClass: 'structure' },
  'technic-brick-1x6': { massKg: 0.0030, material: 'abs', collisionClass: 'structure' },
  'beam-3': { massKg: 0.00092, material: 'abs', collisionClass: 'structure' },
  'beam-5': { massKg: 0.0015, material: 'abs', collisionClass: 'structure' },
  'beam-7': { massKg: 0.00210, material: 'abs', collisionClass: 'structure' },
  'beam-9': { massKg: 0.0027, material: 'abs', collisionClass: 'structure' },
  'beam-11': { massKg: 0.00330, material: 'abs', collisionClass: 'structure' },
  'axle-2': { massKg: 0.00035, material: 'abs', collisionClass: 'mechanical' },
  'axle-3': { massKg: 0.00050, material: 'abs', collisionClass: 'mechanical' },
  'axle-5': { massKg: 0.00080, material: 'abs', collisionClass: 'mechanical' },
  'axle-7': { massKg: 0.00110, material: 'abs', collisionClass: 'mechanical' },
  'axle-9': { massKg: 0.00142, material: 'abs', collisionClass: 'mechanical' },
  bush: { massKg: 0.00036, material: 'abs', collisionClass: 'mechanical' },
  'half-bush': { massKg: 0.00021, material: 'abs', collisionClass: 'mechanical' },
  'axle-coupler': { massKg: 0.00070, material: 'abs', collisionClass: 'mechanical' },
  pin: { massKg: 0.00040, material: 'abs', collisionClass: 'mechanical' },
  'gear-8': { massKg: 0.00050, material: 'pom', collisionClass: 'mechanical' },
  'gear-16': { massKg: 0.00100, material: 'pom', collisionClass: 'mechanical' },
  'gear-24': { massKg: 0.00155, material: 'pom', collisionClass: 'mechanical' },
  wheel: { massKg: 0.0120, material: 'rubber', collisionClass: 'wheel' },
  motor: { massKg: 0.0450, material: 'mixed', collisionClass: 'structure' },
  'gearbox-fnr': { massKg: 0.0350, material: 'mixed', collisionClass: 'structure' },
  'open-differential': { massKg: 0.0280, material: 'mixed', collisionClass: 'structure' },
  'bearing-block': { massKg: 0.0040, material: 'abs', collisionClass: 'structure' },
  'suspension-arm-5': { massKg: 0.0025, material: 'abs', collisionClass: 'mechanical' },
  'rpm-sensor': { massKg: 0.0030, material: 'mixed', collisionClass: 'sensor' },
  'torque-sensor': { massKg: 0.0032, material: 'mixed', collisionClass: 'sensor' },
}

export function physicalDefinition(partId) {
  return DB[partId] ?? { massKg: 0.002, material: 'abs', collisionClass: 'structure' }
}

for (const part of PARTS) {
  const physical = physicalDefinition(part.id)
  part.physics = { ...(part.physics ?? {}), ...physical }

  if (part.mechanics?.wheel) {
    part.mechanics.wheel = {
      ...part.mechanics.wheel,
      tire: {
        longitudinalStiffness: 7.2,
        lateralStiffness: 5.0,
        loadSensitivity: 0.86,
        rollingResistanceScale: 1,
        ...(part.mechanics.wheel.tire ?? {}),
      },
    }
  }

  if (part.mechanics?.motor) {
    part.mechanics.motor = {
      ...part.mechanics.motor,
      stallTorque: 0.045,
      noLoadRpm: part.mechanics.motor.rpm ?? 120,
      efficiency: 0.72,
      voltage: 9,
      freeCurrent: 0.15,
      stallCurrent: 2.2,
    }
  }

  if (part.mechanics?.suspensionArm) {
    part.mechanics.suspensionArm = {
      ...part.mechanics.suspensionArm,
      stiffness: 0.12,
      damping: 0.010,
      springRate: 0.12,
      compressionDamping: 0.012,
      reboundDamping: 0.008,
      preload: 0,
      bumpStop: 0.88,
    }
  }
}
