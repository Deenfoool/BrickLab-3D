export const CONNECTOR_SCHEMA_VERSION_V4 = 4
export const CONNECTOR_SYSTEM_VERSION_V4 = 'connector-system-v4.1.0'
export const LDRAW_LDU_PER_STUD = 20

export const SHADOW_SOURCE_V4 = Object.freeze({
  repository: 'RolandMelkert/LDCadShadowLibrary',
  commit: 'f2fb70c55521e0dfdf2af4d26a87167d4d0d9eec',
  license: 'CC BY-SA 4.0',
})

export const CONNECTOR_FAMILIES_V4 = Object.freeze(['cylinder', 'clip', 'fingers', 'generic', 'sphere'])
export const CYLINDER_SECTION_SHAPES_V4 = Object.freeze(['R', 'A', 'S', '_L', 'L_'])
export const CONNECTOR_GENDERS_V4 = Object.freeze(['male', 'female'])
export const GENERIC_MATCH_MODES_V4 = Object.freeze(['group', 'shape', 'size'])
export const GENERIC_PLACEMENT_MODES_V4 = Object.freeze(['aligned', 'retain', 'free'])

const finite = value => Number.isFinite(value)
const finiteArray = (value, length) => Array.isArray(value) && value.length === length && value.every(finite)

export function totalProfileLengthV4(connector) {
  if (connector?.family === 'cylinder') {
    return (connector.geometry?.sections ?? []).reduce((sum, section) => sum + Math.max(0, Number(section.lengthLdu) || 0), 0)
  }
  if (connector?.family === 'clip') return Math.max(0, Number(connector.geometry?.lengthLdu) || 0)
  if (connector?.family === 'fingers') return (connector.geometry?.sequenceLdu ?? []).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0)
  return 0
}

export function axialSpanV4(connector) {
  const length = totalProfileLengthV4(connector)
  if (!length) return [0, 0]
  return connector?.geometry?.centered ? [-length / 2, length / 2] : [0, length]
}

export function validateConnectorV4(connector) {
  const errors = []
  if (!connector || typeof connector !== 'object') return { valid: false, errors: ['connector must be an object'] }
  if (connector.schemaVersion !== CONNECTOR_SCHEMA_VERSION_V4) errors.push('schemaVersion must be 4')
  if (!CONNECTOR_FAMILIES_V4.includes(connector.family)) errors.push(`unsupported family: ${connector.family}`)
  if (!finiteArray(connector.frame?.positionLdu, 3)) errors.push('frame.positionLdu must be 3 finite numbers')
  if (!finiteArray(connector.frame?.orientation, 9)) errors.push('frame.orientation must be 9 finite numbers')

  if (connector.family === 'cylinder') {
    if (!CONNECTOR_GENDERS_V4.includes(connector.gender)) errors.push('cylinder gender must be male or female')
    const sections = connector.geometry?.sections
    if (!Array.isArray(sections) || !sections.length) errors.push('cylinder requires at least one section')
    else for (const [index, section] of sections.entries()) {
      if (!CYLINDER_SECTION_SHAPES_V4.includes(section.shape)) errors.push(`invalid cylinder section shape at ${index}`)
      if (!(finite(section.radiusLdu) && section.radiusLdu >= 0)) errors.push(`invalid cylinder radius at ${index}`)
      if (!(finite(section.lengthLdu) && section.lengthLdu > 0)) errors.push(`invalid cylinder length at ${index}`)
    }
  } else if (connector.family === 'clip') {
    if (!(finite(connector.geometry?.radiusLdu) && connector.geometry.radiusLdu > 0)) errors.push('clip radiusLdu must be positive')
    if (!(finite(connector.geometry?.lengthLdu) && connector.geometry.lengthLdu > 0)) errors.push('clip lengthLdu must be positive')
  } else if (connector.family === 'fingers') {
    if (!['male', 'female'].includes(connector.geometry?.firstGender)) errors.push('fingers firstGender must be male or female')
    if (!Array.isArray(connector.geometry?.sequenceLdu) || !connector.geometry.sequenceLdu.length || !connector.geometry.sequenceLdu.every(value => finite(value) && value > 0)) errors.push('fingers sequenceLdu must contain positive values')
    if (!(finite(connector.geometry?.radiusLdu) && connector.geometry.radiusLdu > 0)) errors.push('fingers radiusLdu must be positive')
  } else if (connector.family === 'generic') {
    if (!CONNECTOR_GENDERS_V4.includes(connector.gender)) errors.push('generic gender must be male or female')
    const match = String(connector.snap?.match || 'shape').toLowerCase()
    const placement = String(connector.snap?.placement || 'aligned').toLowerCase()
    if (!GENERIC_MATCH_MODES_V4.includes(match)) errors.push(`unsupported generic match mode: ${match}`)
    if (!GENERIC_PLACEMENT_MODES_V4.includes(placement)) errors.push(`unsupported generic placement mode: ${placement}`)
    // `group` is intentionally optional. The pinned Shadow Library contains many
    // generic ball/socket pairs without a group and disambiguates them by shape/size.
  } else if (connector.family === 'sphere') {
    if (!CONNECTOR_GENDERS_V4.includes(connector.gender)) errors.push('sphere gender must be male or female')
    if (!(finite(connector.geometry?.radiusLdu) && connector.geometry.radiusLdu > 0)) errors.push('sphere radiusLdu must be positive')
  }

  return { valid: errors.length === 0, errors }
}

export function cloneConnectorV4(connector) {
  return typeof structuredClone === 'function' ? structuredClone(connector) : JSON.parse(JSON.stringify(connector))
}

export function normalizeGenderV4(value, fallback = 'male') {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (normalized === 'm' || normalized === 'male') return 'male'
  if (normalized === 'f' || normalized === 'female') return 'female'
  return fallback
}
