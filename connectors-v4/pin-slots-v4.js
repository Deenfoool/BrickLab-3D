import { cylinderAxialWindowsV4 } from './axial-fit-v4.js'
import { axialSpanV4 } from './schema-v4.js'

export const PIN_SLOTS_VERSION_V4 = 'pin-slots-v4.3.0'
export const TECHNIC_MODULE_LDU_V4 = 20
const EPS = 1e-4
const RADIUS_EPS = .55

const rigidShape = shape => ['L_', '_L'].includes(shape) ? 'R' : shape
const sectionLength = section => Math.max(0, Number(section?.lengthLdu) || 0)
const near = (value, target, epsilon = RADIUS_EPS) => Math.abs((Number(value) || 0) - target) <= epsilon

function moduleCount(length) {
  const count = Math.max(1, Math.round(length / TECHNIC_MODULE_LDU_V4))
  return Math.abs(length - count * TECHNIC_MODULE_LDU_V4) <= 1 ? count : 0
}

function profile(sections = []) {
  const shapes = sections.map(section => rigidShape(section?.shape))
  const radii = sections.map(section => Number(section?.radiusLdu)).filter(Number.isFinite)
  return {
    shapes,
    length: sections.reduce((sum, section) => sum + sectionLength(section), 0),
    hasAxle: shapes.includes('A'),
    hasRound: shapes.includes('R'),
    hasElastic: sections.some(section => ['L_', '_L'].includes(section?.shape)),
    hasShoulder: sections.some(section => rigidShape(section?.shape) === 'R' && near(section?.radiusLdu, 8)),
    technicRadius: radii.length > 0 && radii.every(radius => radius >= 5.5 && radius <= 8.6),
  }
}

function maleTechnicProfile(male) {
  if (male?.family !== 'cylinder' || male?.gender !== 'male') return null
  const sections = male.geometry?.sections ?? []
  if (!sections.length) return null
  const value = profile(sections)
  if (!value.technicRadius || !moduleCount(value.length) || value.shapes.some(shape => !['A', 'R'].includes(shape))) return null

  const pureAxle = value.hasAxle && !value.hasRound && sections.every(section => near(section?.radiusLdu, 6))
  const hybrid = value.hasAxle && value.hasRound
  const pin = !value.hasAxle && value.hasRound && (value.hasElastic || value.hasShoulder)
  if (pureAxle) return { ...value, sections, kind:'axle' }
  if (hybrid) return { ...value, sections, kind:'hybrid' }
  if (pin) return { ...value, sections, kind:'pin' }
  return null
}

function receiverProfile(female) {
  if (female?.family !== 'cylinder' || female?.gender !== 'female') return null
  const sections = female.geometry?.sections ?? []
  if (!sections.length) return null
  const value = profile(sections)
  if (!value.technicRadius || value.shapes.some(shape => !['A', 'R'].includes(shape))) return null
  if (value.shapes.every(shape => shape === 'A')) return 'axle'
  if (value.shapes.every(shape => shape === 'R')) return 'round'
  return null
}

// Technic pins have discrete physical retention bands, so the runtime may retry
// another free 1L pin band when the requested one is occupied. Axles are the
// opposite: an A-profile is a continuous sliding rail along its full usable
// length. Never quantize a pure axle, and never turn the A section of an
// axle-pin into fake 1L snap points. Continuous axle placement is handled by
// axial-fit-v4; this helper only supplies fallback positions for R pin bands.
export function technicPinSlotOffsetsV4(moving, target) {
  const male = moving?.gender === 'male' ? moving : target?.gender === 'male' ? target : null
  const female = moving?.gender === 'female' ? moving : target?.gender === 'female' ? target : null
  const maleProfile = maleTechnicProfile(male)
  const receiver = receiverProfile(female)
  if (!maleProfile || !receiver) return []

  // Axle holes can only engage A-profile material, which is continuous. Pure
  // axles are also continuous even when the receiver is a round Technic bore.
  if (receiver === 'axle' || maleProfile.kind === 'axle') return []

  const fit = cylinderAxialWindowsV4(moving, target)
  if (!fit.valid) return []

  const [maleStart] = axialSpanV4(male)
  let cursor = maleStart
  const selected = []
  for (const section of maleProfile.sections) {
    const start = cursor
    const end = start + sectionLength(section)
    cursor = end
    // Only round pin material gets discrete retry slots. A-profile material in
    // a hybrid axle-pin remains continuously usable by the primary axial solver.
    if (rigidShape(section?.shape) === 'R') selected.push([start, end])
  }

  const runs = []
  for (const interval of selected) {
    const last = runs.at(-1)
    if (last && Math.abs(last[1] - interval[0]) <= EPS) last[1] = interval[1]
    else runs.push([...interval])
  }

  const offsets = runs.flatMap(([start, end]) => {
    const count = moduleCount(end - start)
    if (!count) return []
    return Array.from({ length: count }, (_, index) => start + (index + .5) * TECHNIC_MODULE_LDU_V4)
  })
    .map(offset => fit.movingIsMale ? -offset : offset)
    .filter(offset => fit.movingWindows.some(([start, end]) => offset >= start - EPS && offset <= end + EPS))
    .map(offset => Math.abs(offset) < EPS ? 0 : offset)
    .sort((a, b) => a - b)

  return [...new Set(offsets)]
}

export function nearestTechnicPinSlotOffsetsV4(moving, target, requestedOffsetLdu = 0) {
  const requested = Number.isFinite(requestedOffsetLdu) ? requestedOffsetLdu : 0
  return technicPinSlotOffsetsV4(moving, target)
    .sort((a, b) => Math.abs(a - requested) - Math.abs(b - requested) || a - b)
}
