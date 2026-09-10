import {
  CONNECTOR_SCHEMA_VERSION_V4,
  CYLINDER_SECTION_SHAPES_V4,
  normalizeGenderV4,
  validateConnectorV4,
} from './schema-v4.js'

const IDENTITY_3 = Object.freeze([1, 0, 0, 0, 1, 0, 0, 0, 1])
const ZERO_3 = Object.freeze([0, 0, 0])
const SNAP_PREFIX = /^\s*0\s+!LDCAD\s+(SNAP_[A-Z0-9_]+)\b(.*)$/i

function number(value, fallback = null) {
  const result = Number(value)
  return Number.isFinite(result) ? result : fallback
}

function bool(value, fallback = false) {
  if (typeof value === 'boolean') return value
  const normalized = String(value ?? '').trim().toLowerCase()
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true
  if (normalized === 'false' || normalized === '0' || normalized === 'no') return false
  return fallback
}

function tokens(value) {
  return String(value ?? '').trim().split(/\s+/).filter(Boolean)
}

function numbers(value) {
  return tokens(value).map(Number).filter(Number.isFinite)
}

function vector(value, length, fallback) {
  const parsed = numbers(value)
  return parsed.length === length ? parsed : [...fallback]
}

export function parseOptionBlocksV4(tail = '') {
  const options = Object.create(null)
  const duplicates = []
  const malformed = []
  const re = /\[\s*([^\]=\s]+)\s*=\s*([^\]]*)\]/g
  let match
  let consumed = ''
  while ((match = re.exec(tail))) {
    const key = match[1].trim().toLowerCase()
    const value = match[2].trim()
    if (Object.prototype.hasOwnProperty.call(options, key)) duplicates.push(key)
    options[key] = value
    consumed += match[0]
  }
  const residue = String(tail).replace(re, '').trim()
  if (residue) malformed.push(residue)
  return { options, duplicates, malformed, consumed }
}

function parseGridAttempt(input, dimensions) {
  let cursor = 0
  const axisCount = () => {
    let centered = false
    if (String(input[cursor] ?? '').toUpperCase() === 'C') { centered = true; cursor += 1 }
    const count = Number(input[cursor++])
    if (!Number.isInteger(count) || count < 1) throw new Error('grid count must be a positive integer')
    return { count, centered }
  }

  const x = axisCount()
  let y = { count:1, centered:false }
  let z
  if (dimensions === 3) {
    y = axisCount()
    z = axisCount()
  } else {
    z = axisCount()
  }

  const stepX = Number(input[cursor++])
  let stepY = 0
  let stepZ
  if (dimensions === 3) {
    stepY = Number(input[cursor++])
    stepZ = Number(input[cursor++])
  } else {
    stepZ = Number(input[cursor++])
  }
  if (![stepX, stepY, stepZ].every(Number.isFinite) || cursor !== input.length) throw new Error('grid token count does not match variant')

  return {
    dimensions,
    xCount:x.count,
    yCount:y.count,
    zCount:z.count,
    centerX:x.centered,
    centerY:y.centered,
    centerZ:z.centered,
    stepX,
    stepY,
    stepZ,
  }
}

export function parseGridV4(value) {
  if (!String(value ?? '').trim()) return null
  const input = tokens(value)
  // LDCad supports both the documented X/Z form and a later X/Y/Z form. Try the
  // longer grammar first because optional C tokens make length-only detection unsafe.
  try { return parseGridAttempt(input, 3) }
  catch (threeError) {
    try { return parseGridAttempt(input, 2) }
    catch (twoError) {
      throw new Error(`grid must be [C] Xcount [C] Zcount Xstep Zstep or [C] Xcount [C] Ycount [C] Zcount Xstep Ystep Zstep`)
    }
  }
}

export function expandGridV4(grid) {
  if (!grid) return [[0, 0, 0]]
  const x0 = grid.centerX ? -((grid.xCount - 1) * grid.stepX) / 2 : 0
  const y0 = grid.centerY ? -((grid.yCount - 1) * grid.stepY) / 2 : 0
  const z0 = grid.centerZ ? -((grid.zCount - 1) * grid.stepZ) / 2 : 0
  const result = []
  for (let ix = 0; ix < grid.xCount; ix += 1) {
    for (let iy = 0; iy < grid.yCount; iy += 1) {
      for (let iz = 0; iz < grid.zCount; iz += 1) {
        result.push([x0 + ix * grid.stepX, y0 + iy * grid.stepY, z0 + iz * grid.stepZ])
      }
    }
  }
  return result
}

export function parseCylinderSectionsV4(value) {
  const input = tokens(value)
  if (!input.length || input.length % 3 !== 0) throw new Error('secs must contain shape/radius/length triplets')
  const sections = []
  for (let i = 0; i < input.length; i += 3) {
    const shape = input[i].toUpperCase()
    const radiusLdu = Number(input[i + 1])
    const lengthLdu = Number(input[i + 2])
    if (!CYLINDER_SECTION_SHAPES_V4.includes(shape)) throw new Error(`unsupported section shape ${shape}`)
    if (!Number.isFinite(radiusLdu) || radiusLdu < 0 || !Number.isFinite(lengthLdu) || lengthLdu <= 0) throw new Error('section radius/length must be finite and length > 0')
    sections.push({ shape, radiusLdu, lengthLdu, elastic: shape === '_L' || shape === 'L_' })
  }
  return sections
}

export function parseBoundingV4(value) {
  const input = tokens(value)
  if (!input.length) return null
  const kind = input.shift().toLowerCase()
  const values = input.map(Number)
  if (!values.every(Number.isFinite)) throw new Error('bounding values must be finite')
  if (kind === 'pnt' && values.length === 0) return { kind: 'point' }
  if (kind === 'box' && values.length === 3) return { kind: 'box', halfExtentsLdu: values }
  if (kind === 'cube' && values.length === 1) return { kind: 'cube', halfSizeLdu: values[0] }
  if (kind === 'cyl' && values.length === 2) return { kind: 'cylinder', radiusLdu: values[0], lengthLdu: values[1] }
  if (kind === 'sph' && values.length === 1) return { kind: 'sphere', radiusLdu: values[0] }
  throw new Error(`unsupported bounding shape ${kind}`)
}

function commonFrame(options) {
  return {
    positionLdu: vector(options.pos, 3, ZERO_3),
    orientation: vector(options.ori, 9, IDENTITY_3),
  }
}

function commonPolicy(options, defaults = {}) {
  return {
    scale: options.scale || defaults.scale || 'none',
    mirror: options.mirror || defaults.mirror || 'none',
  }
}

function commonSource(context, lineNumber, raw, meta) {
  return {
    kind: 'ldcad-shadow',
    file: context.file || '',
    line: lineNumber,
    meta,
    raw,
  }
}

function parseConnector(meta, options, context, lineNumber, raw) {
  const id = options.id || null
  const group = options.group || null
  const base = {
    schemaVersion: CONNECTOR_SCHEMA_VERSION_V4,
    id,
    group,
    frame: commonFrame(options),
    source: commonSource(context, lineNumber, raw, meta),
  }

  if (meta === 'SNAP_CYL') {
    return {
      ...base,
      family: 'cylinder',
      gender: normalizeGenderV4(options.gender, 'male'),
      geometry: {
        sections: parseCylinderSectionsV4(options.secs),
        caps: options.caps || 'one',
        centered: bool(options.center, false),
      },
      snap: { slide: bool(options.slide, false) },
      inheritance: commonPolicy(options, { mirror: 'cor' }),
    }
  }

  if (meta === 'SNAP_CLP') {
    return {
      ...base,
      family: 'clip',
      gender: 'female',
      geometry: {
        radiusLdu: number(options.radius, 4),
        lengthLdu: number(options.length, 8),
        centered: bool(options.center, false),
      },
      snap: { slide: bool(options.slide, false) },
      inheritance: commonPolicy(options, { mirror: 'none' }),
    }
  }

  if (meta === 'SNAP_FGR') {
    const sequenceLdu = numbers(options.seq)
    if (!sequenceLdu.length || sequenceLdu.some(value => value <= 0)) throw new Error('SNAP_FGR seq must contain positive lengths')
    return {
      ...base,
      family: 'fingers',
      gender: 'mixed',
      geometry: {
        firstGender: normalizeGenderV4(options.genderofs, 'male'),
        sequenceLdu,
        radiusLdu: number(options.radius, null),
        // LDCad fingers are centered by default; cylinders are not.
        centered: bool(options.center, true),
      },
      snap: { slide: false },
      inheritance: commonPolicy(options, { mirror: 'none' }),
    }
  }

  if (meta === 'SNAP_GEN') {
    return {
      ...base,
      family: 'generic',
      gender: normalizeGenderV4(options.gender, 'male'),
      geometry: { bounding: parseBoundingV4(options.bounding) },
      snap: {
        placement: String(options.placement || 'aligned').toLowerCase(),
        // Roland Melkert confirmed `shape` is the default: group + bounding kind.
        match: String(options.match || 'shape').toLowerCase(),
        slide: false,
      },
      inheritance: commonPolicy(options, { mirror: 'none' }),
    }
  }

  if (meta === 'SNAP_SPH') {
    return {
      ...base,
      family: 'sphere',
      gender: normalizeGenderV4(options.gender, 'male'),
      geometry: { radiusLdu: number(options.radius, null) },
      snap: { placement: 'free', match: 'size', slide: false },
      inheritance: commonPolicy(options, { mirror: 'none' }),
    }
  }

  return null
}

function parseInclude(options, context, lineNumber, raw) {
  if (!options.ref) throw new Error('SNAP_INCL requires ref')
  let grid = null
  if (options.grid) grid = parseGridV4(options.grid)
  return {
    type: 'include',
    id: options.id || null,
    ref: options.ref.replace(/\\/g, '/'),
    frame: commonFrame(options),
    scale: vector(options.scale, 3, [1, 1, 1]),
    grid,
    source: commonSource(context, lineNumber, raw, 'SNAP_INCL'),
  }
}

export function parseShadowTextV4(text, context = {}) {
  const operations = []
  const warnings = []
  const lines = String(text ?? '').split(/\r?\n/)
  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index]
    const match = raw.match(SNAP_PREFIX)
    if (!match) continue
    const meta = match[1].toUpperCase()
    const parsedOptions = parseOptionBlocksV4(match[2])
    if (parsedOptions.duplicates.length) warnings.push({ line: index + 1, code: 'duplicate-option', detail: parsedOptions.duplicates.join(', '), raw })
    if (parsedOptions.malformed.length) warnings.push({ line: index + 1, code: 'malformed-tail', detail: parsedOptions.malformed.join(' '), raw })

    try {
      if (meta === 'SNAP_CLEAR') {
        operations.push({ type: 'clear', id: parsedOptions.options.id || null, source: commonSource(context, index + 1, raw, meta) })
        continue
      }
      if (meta === 'SNAP_INCL') {
        operations.push(parseInclude(parsedOptions.options, context, index + 1, raw))
        continue
      }
      const connector = parseConnector(meta, parsedOptions.options, context, index + 1, raw)
      if (!connector) {
        warnings.push({ line: index + 1, code: 'unsupported-snap-meta', detail: meta, raw })
        continue
      }
      let grid = null
      if (parsedOptions.options.grid) grid = parseGridV4(parsedOptions.options.grid)
      const validation = validateConnectorV4(connector)
      if (!validation.valid) throw new Error(validation.errors.join('; '))
      operations.push({ type: 'connector', connector, grid, source: connector.source })
    } catch (error) {
      warnings.push({ line: index + 1, code: 'invalid-snap-meta', detail: String(error?.message || error), raw })
    }
  }
  return { operations, warnings }
}
