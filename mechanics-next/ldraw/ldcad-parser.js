export const LDCAD_PARSER_VERSION = 'mechanics-ldcad-parser-1.0.0'

const IDENTITY_3 = Object.freeze([1,0,0,0,1,0,0,0,1])
const ZERO_3 = Object.freeze([0,0,0])
const SNAP_PREFIX = /^\s*0\s+!LDCAD\s+(SNAP_[A-Z0-9_]+)\b(.*)$/i
const SECTION_SHAPES = new Set(['R','A','S','_L','L_'])

const tokens = value => String(value ?? '').trim().split(/\s+/).filter(Boolean)

function number(value, fallback = null) {
  if (value == null || String(value).trim() === '') return fallback
  const result = Number(value)
  if (!Number.isFinite(result)) throw new Error('invalid number')
  return result
}

function bool(value, fallback = false) {
  if (value == null || String(value).trim() === '') return fallback
  if (typeof value === 'boolean') return value
  const normalized = String(value).trim().toLowerCase()
  if (['true','1','yes'].includes(normalized)) return true
  if (['false','0','no'].includes(normalized)) return false
  throw new Error('invalid boolean')
}

function numbers(value) {
  const result = tokens(value).map(Number)
  if (!result.every(Number.isFinite)) throw new Error('non-finite numeric token')
  return result
}

function vector(value, length, fallback) {
  if (value == null) return [...fallback]
  const result = numbers(value)
  if (result.length !== length) throw new Error(`expected ${length} numeric components`)
  return result
}

function gender(value, fallback = 'male') {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (['m','male'].includes(normalized)) return 'male'
  if (['f','female'].includes(normalized)) return 'female'
  if (!normalized) return fallback
  throw new Error('invalid gender')
}

export function parseOptionBlocks(tail = '') {
  const options = Object.create(null)
  const duplicates = []
  const re = /\[\s*([^\]=\s]+)\s*=\s*([^\]]*)\]/g
  let match
  while ((match = re.exec(String(tail)))) {
    const key = match[1].trim().toLowerCase()
    if (Object.hasOwn(options, key)) duplicates.push(key)
    options[key] = match[2].trim()
  }
  const residue = String(tail).replace(re, '').trim()
  return { options, duplicates, residue }
}

function parseGridVariant(input, dimensions) {
  let cursor = 0
  const axisCount = () => {
    let centered = false
    if (String(input[cursor] ?? '').toUpperCase() === 'C') {
      centered = true
      cursor += 1
    }
    const count = Number(input[cursor++])
    if (!Number.isInteger(count) || count < 1) throw new Error('grid count must be positive integer')
    return { count, centered }
  }

  const x = axisCount()
  const y = dimensions === 3 ? axisCount() : { count:1, centered:false }
  const z = axisCount()
  const stepX = Number(input[cursor++])
  const stepY = dimensions === 3 ? Number(input[cursor++]) : 0
  const stepZ = Number(input[cursor++])
  if (![stepX, stepY, stepZ].every(Number.isFinite) || cursor !== input.length) {
    throw new Error('grid token count mismatch')
  }
  return {
    dimensions,
    xCount:x.count, yCount:y.count, zCount:z.count,
    centerX:x.centered, centerY:y.centered, centerZ:z.centered,
    stepX, stepY, stepZ,
  }
}

export function parseGrid(value) {
  if (!String(value ?? '').trim()) return null
  const input = tokens(value)
  try { return parseGridVariant(input, 3) }
  catch {
    try { return parseGridVariant(input, 2) }
    catch { throw new Error('invalid SNAP grid') }
  }
}

export function expandGrid(grid) {
  if (!grid) return [[0,0,0]]
  const total = grid.xCount * grid.yCount * grid.zCount
  if (!Number.isSafeInteger(total) || total < 1 || total > 4096) throw new Error('grid expansion budget exceeded')
  const start = (count, step, centered) => centered ? -((count - 1) * step) / 2 : 0
  const x0 = start(grid.xCount, grid.stepX, grid.centerX)
  const y0 = start(grid.yCount, grid.stepY, grid.centerY)
  const z0 = start(grid.zCount, grid.stepZ, grid.centerZ)
  const result = []
  for (let x = 0; x < grid.xCount; x += 1) {
    for (let y = 0; y < grid.yCount; y += 1) {
      for (let z = 0; z < grid.zCount; z += 1) {
        result.push([
          x0 + x * grid.stepX,
          y0 + y * grid.stepY,
          z0 + z * grid.stepZ,
        ])
      }
    }
  }
  return result
}

export function parseCylinderSections(value) {
  const input = tokens(value)
  if (!input.length || input.length % 3 !== 0) {
    throw new Error('secs must contain shape/radius/length triplets')
  }
  const result = []
  for (let index = 0; index < input.length; index += 3) {
    const shape = input[index].toUpperCase()
    const radiusLdu = Number(input[index + 1])
    const lengthLdu = Number(input[index + 2])
    if (!SECTION_SHAPES.has(shape)) throw new Error(`unsupported section shape ${shape}`)
    if (!Number.isFinite(radiusLdu) || radiusLdu < 0 ||
        !Number.isFinite(lengthLdu) || lengthLdu <= 0) {
      throw new Error('invalid cylinder section dimensions')
    }
    result.push(Object.freeze({
      shape,
      radiusLdu,
      lengthLdu,
      elastic:shape === '_L' || shape === 'L_',
    }))
  }
  return Object.freeze(result)
}

function parseBounding(value) {
  const input = tokens(value)
  if (!input.length) return null
  const kind = input.shift().toLowerCase()
  const values = input.map(Number)
  if (!values.every(Number.isFinite) || values.some(value => value < 0)) {
    throw new Error('invalid bounding values')
  }
  if (kind === 'pnt' && values.length === 0) return { kind:'point' }
  if (kind === 'box' && values.length === 3) return { kind:'box', halfExtentsLdu:values }
  if (kind === 'cube' && values.length === 1) return { kind:'cube', halfSizeLdu:values[0] }
  if (kind === 'cyl' && values.length === 2) return { kind:'cylinder', radiusLdu:values[0], lengthLdu:values[1] }
  if (kind === 'sph' && values.length === 1) return { kind:'sphere', radiusLdu:values[0] }
  throw new Error(`unsupported bounding shape ${kind}`)
}

function frame(options) {
  return {
    positionLdu:vector(options.pos, 3, ZERO_3),
    orientation:vector(options.ori, 9, IDENTITY_3),
  }
}

function source(context, line, raw, meta) {
  return Object.freeze({
    kind:'ldcad-shadow',
    file:String(context?.file || ''),
    line,
    meta,
    raw,
  })
}

function inheritance(options, defaults = {}) {
  return {
    scale:String(options.scale || defaults.scale || 'none').toLowerCase(),
    mirror:String(options.mirror || defaults.mirror || 'none').toLowerCase(),
  }
}

function connector(meta, options, context, line, raw) {
  const common = {
    id:options.id || null,
    group:options.group || null,
    frame:frame(options),
    source:source(context, line, raw, meta),
  }

  if (meta === 'SNAP_CYL') return {
    ...common,
    family:'cylinder',
    gender:gender(options.gender),
    geometry:{
      sections:parseCylinderSections(options.secs),
      caps:String(options.caps || 'one').toLowerCase(),
      centered:bool(options.center, false),
    },
    snap:{ slide:bool(options.slide, false) },
    inheritance:inheritance(options, { mirror:'cor' }),
  }

  if (meta === 'SNAP_CLP') return {
    ...common,
    family:'clip',
    gender:'female',
    geometry:{
      radiusLdu:number(options.radius, 4),
      lengthLdu:number(options.length, 8),
      centered:bool(options.center, false),
    },
    snap:{ slide:bool(options.slide, false) },
    inheritance:inheritance(options),
  }

  if (meta === 'SNAP_FGR') {
    const sequenceLdu = numbers(options.seq)
    if (!sequenceLdu.length || sequenceLdu.some(value => value <= 0)) {
      throw new Error('SNAP_FGR seq must contain positive lengths')
    }
    return {
      ...common,
      family:'fingers',
      gender:'mixed',
      geometry:{
        firstGender:gender(options.genderofs),
        sequenceLdu,
        radiusLdu:number(options.radius, null),
        centered:bool(options.center, true),
      },
      snap:{ slide:false },
      inheritance:inheritance(options),
    }
  }

  if (meta === 'SNAP_GEN') return {
    ...common,
    family:'generic',
    gender:gender(options.gender),
    geometry:{ bounding:parseBounding(options.bounding) },
    snap:{
      placement:String(options.placement || 'aligned').toLowerCase(),
      match:String(options.match || 'shape').toLowerCase(),
      slide:false,
    },
    inheritance:inheritance(options),
  }

  if (meta === 'SNAP_SPH') return {
    ...common,
    family:'sphere',
    gender:gender(options.gender),
    geometry:{ radiusLdu:number(options.radius, null) },
    snap:{ placement:'free', match:'size', slide:false },
    inheritance:inheritance(options),
  }

  return null
}

function includeOperation(options, context, line, raw) {
  if (!options.ref) throw new Error('SNAP_INCL requires ref')
  const ref = String(options.ref).replace(/\\/g, '/')
  if (/^(?:[a-z]+:|\/)/i.test(ref) || ref.split('/').includes('..')) {
    throw new Error('non-local include ref')
  }
  return {
    type:'include',
    id:options.id || null,
    ref,
    frame:frame(options),
    scale:vector(options.scale, 3, [1,1,1]),
    grid:options.grid ? parseGrid(options.grid) : null,
    source:source(context, line, raw, 'SNAP_INCL'),
  }
}

const COMMON = ['id','group','pos','ori','scale','mirror','grid']
const OPTION_SETS = Object.freeze({
  SNAP_CYL:[...COMMON,'gender','caps','secs','center','slide'],
  SNAP_CLP:[...COMMON,'radius','length','center','slide'],
  SNAP_FGR:[...COMMON,'genderofs','seq','radius','center'],
  SNAP_GEN:[...COMMON,'gender','bounding','placement','match'],
  SNAP_SPH:[...COMMON,'gender','radius'],
  SNAP_INCL:['id','pos','ori','scale','ref','grid'],
  SNAP_CLEAR:['id'],
})

function validateOptions(meta, parsed) {
  if (parsed.duplicates.length || parsed.residue) throw new Error('ambiguous option syntax')
  const allowed = OPTION_SETS[meta]
  if (!allowed) throw new Error(`unsupported snap meta ${meta}`)
  if (meta === 'SNAP_CLEAR') return

  for (const key of Object.keys(parsed.options)) {
    if (!allowed.includes(key)) throw new Error(`unsupported ${meta} option ${key}`)
  }
  const o = parsed.options
  if (o.caps != null && !/^(none|one|two|a|b)$/i.test(o.caps)) throw new Error('invalid caps')
  if (meta !== 'SNAP_INCL' && o.scale != null && !/^(none|yonly|ronly|yandr)$/i.test(o.scale)) {
    throw new Error('invalid scale policy')
  }
  if (o.mirror != null && !/^(none|cor|corz)$/i.test(o.mirror)) throw new Error('invalid mirror policy')
  if (o.grid) expandGrid(parseGrid(o.grid))
}

export function parseLdcadShadowText(text, context = {}) {
  const operations = []
  const warnings = []
  const lines = String(text ?? '').split(/\r?\n/)

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index]
    const match = raw.match(SNAP_PREFIX)
    if (!match) continue

    const meta = match[1].toUpperCase()
    const parsed = parseOptionBlocks(match[2])
    try {
      validateOptions(meta, parsed)
      if (meta === 'SNAP_CLEAR') {
        operations.push(Object.freeze({
          type:'clear',
          id:parsed.options.id || null,
          source:source(context, index + 1, raw, meta),
        }))
        continue
      }
      if (meta === 'SNAP_INCL') {
        operations.push(Object.freeze(includeOperation(parsed.options, context, index + 1, raw)))
        continue
      }

      const value = connector(meta, parsed.options, context, index + 1, raw)
      if (!value) throw new Error(`unsupported snap meta ${meta}`)
      operations.push(Object.freeze({
        type:'connector',
        connector:Object.freeze(value),
        grid:parsed.options.grid ? parseGrid(parsed.options.grid) : null,
        source:value.source,
      }))
    } catch (error) {
      warnings.push(Object.freeze({
        line:index + 1,
        code:'invalid-snap-meta',
        detail:String(error?.message || error),
        raw,
      }))
    }
  }

  return Object.freeze({
    version:LDCAD_PARSER_VERSION,
    operations:Object.freeze(operations),
    warnings:Object.freeze(warnings),
  })
}
