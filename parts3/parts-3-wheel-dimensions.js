import { PARTS } from '../parts.js'

export const PARTS3_WHEEL_DIMENSIONS_VERSION = 'parts-3-wheel-dimensions-v1'

// Wheel radius has always been mechanical metadata, but older parts predate an
// explicit tyre width. Keep one authoritative width table so Rapier and the
// procedural wheel mesh describe the same physical footprint.
const WIDTHS = Object.freeze({
  wheel: 0.76,
  'wheel-small': 0.58,
  'wheel-medium': 0.66,
  'wheel-road': 0.62,
  'wheel-narrow': 0.42,
  'wheel-offroad-large': 0.92,
  'wheel-tractor': 1.12,
})

for (const part of PARTS) {
  const width = WIDTHS[part.id]
  if (!(width > 0) || !part.mechanics?.wheel) continue
  part.mechanics = {
    ...part.mechanics,
    wheel: {
      ...part.mechanics.wheel,
      width,
    },
  }
  part.dimensions = {
    ...(part.dimensions ?? {}),
    radiusStud: part.mechanics.wheel.radius,
    widthStud: width,
  }
}

globalThis.BrickLabParts3WheelDimensions = Object.freeze({
  version: PARTS3_WHEEL_DIMENSIONS_VERSION,
  widths: WIDTHS,
})
