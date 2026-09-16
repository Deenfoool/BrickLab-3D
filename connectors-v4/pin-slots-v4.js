import { cylinderAxialWindowsV4 } from './axial-fit-v4.js'
import { technicPinPairV4 } from './pin-semantics-v4.js'
import { axialSpanV4 } from './schema-v4.js'

export const PIN_SLOTS_VERSION_V4 = 'pin-slots-v4.0.0'
export const TECHNIC_MODULE_LDU_V4 = 20
const EPS = 1e-4

// LDCad describes a pin as one continuous axial profile. LEGO parts, however,
// settle on 1-module centres. Enumerating those centres lets the runtime retry a
// neighbouring free band instead of treating the whole long pin as occupied.
export function technicPinSlotOffsetsV4(moving, target) {
  const semantic = technicPinPairV4(moving, target)
  if (!semantic) return []
  const fit = cylinderAxialWindowsV4(moving, target)
  if (!fit.valid) return []

  const male = moving?.gender === 'male' ? moving : target
  const length = (male?.geometry?.sections ?? []).reduce((sum, section) => sum + Math.max(0, Number(section?.lengthLdu) || 0), 0)
  const slotCount = Math.max(1, Math.round(length / TECHNIC_MODULE_LDU_V4))
  if (Math.abs(length - slotCount * TECHNIC_MODULE_LDU_V4) > 1) return []

  const [maleStart] = axialSpanV4(male)
  return Array.from({length:slotCount}, (_, index) => maleStart + (index + 0.5) * TECHNIC_MODULE_LDU_V4)
    .map(offset => fit.movingIsMale ? -offset : offset)
    .filter(offset => fit.movingWindows.some(([start,end]) => offset >= start - EPS && offset <= end + EPS))
    .sort((a,b) => a-b)
}

export function nearestTechnicPinSlotOffsetsV4(moving, target, requestedOffsetLdu = 0) {
  const requested = Number.isFinite(requestedOffsetLdu) ? requestedOffsetLdu : 0
  return technicPinSlotOffsetsV4(moving, target)
    .sort((a, b) => Math.abs(a - requested) - Math.abs(b - requested) || a - b)
}
