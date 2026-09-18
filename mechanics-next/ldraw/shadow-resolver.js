import { expandGrid, parseLdcadShadowText } from './ldcad-parser.js'

export const NATIVE_SHADOW_RESOLVER_VERSION = 'mechanics-shadow-resolver-0.1.0'
const DEFAULT_MAX_DEPTH = 12
const DEFAULT_MAX_NODES = 256
const EPS = 2e-4

const clone = value => typeof structuredClone === 'function'
  ? structuredClone(value)
  : JSON.parse(JSON.stringify(value))

const normalizePath = value => String(value || '')
  .replace(/\\/g, '/')
  .replace(/^\.\//, '')
  .replace(/\/+/g, '/')
  .toLowerCase()
  .trim()

const add3 = (a,b) => [a[0]+b[0],a[1]+b[1],a[2]+b[2]]
const scale3 = (a,s) => [a[0]*s,a[1]*s,a[2]*s]
const dot3 = (a,b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2]
const length3 = a => Math.hypot(...a)
const normalize3 = a => {
  const length = length3(a)
  return length > 1e-12 ? scale3(a, 1 / length) : [0,0,0]
}
const cross3 = (a,b) => [
  a[1]*b[2]-a[2]*b[1],
  a[2]*b[0]-a[0]*b[2],
  a[0]*b[1]-a[1]*b[0],
]
const mul3v = (m,v) => [
  m[0]*v[0]+m[1]*v[1]+m[2]*v[2],
  m[3]*v[0]+m[4]*v[1]+m[5]*v[2],
  m[6]*v[0]+m[7]*v[1]+m[8]*v[2],
]
const mul3 = (a,b) => [
  a[0]*b[0]+a[1]*b[3]+a[2]*b[6], a[0]*b[1]+a[1]*b[4]+a[2]*b[7], a[0]*b[2]+a[1]*b[5]+a[2]*b[8],
  a[3]*b[0]+a[4]*b[3]+a[5]*b[6], a[3]*b[1]+a[4]*b[4]+a[5]*b[7], a[3]*b[2]+a[4]*b[5]+a[5]*b[8],
  a[6]*b[0]+a[7]*b[3]+a[8]*b[6], a[6]*b[1]+a[7]*b[4]+a[8]*b[7], a[6]*b[2]+a[7]*b[5]+a[8]*b[8],
]
const column = (m,i) => [m[i],m[3+i],m[6+i]]
const determinant = m =>
  m[0]*(m[4]*m[8]-m[5]*m[7]) -
  m[1]*(m[3]*m[8]-m[5]*m[6]) +
  m[2]*(m[3]*m[7]-m[4]*m[6])

function orientationScale(orientation, linear) {
  const raw = mul3(linear, orientation)
  const x = column(raw,0), y = column(raw,1), z = column(raw,2)
  const sx = length3(x), sy = length3(y), sz = length3(z)
  const nx = normalize3(x), ny = normalize3(y), nz = normalize3(z)
  return {
    sx, sy, sz, nx, ny, nz,
    shear:Math.max(Math.abs(dot3(nx,ny)),Math.abs(dot3(nx,nz)),Math.abs(dot3(ny,nz))),
    mirrored:determinant(raw) < 0,
  }
}

function geometryScaleAllowed(connector, m) {
  if (m.shear > EPS) return false
  if (['cylinder','clip','fingers'].includes(connector.family)) return Math.abs(m.sx - m.sz) <= EPS
  if (connector.family === 'sphere') {
    return Math.abs(m.sx - m.sy) <= EPS && Math.abs(m.sy - m.sz) <= EPS
  }
  const bounding = connector?.geometry?.bounding
  if (connector.family === 'generic' && ['sphere','cube'].includes(bounding?.kind)) {
    return Math.abs(m.sx - m.sy) <= EPS && Math.abs(m.sy - m.sz) <= EPS
  }
  if (connector.family === 'generic' && bounding?.kind === 'cylinder') {
    return Math.abs(m.sx - m.sz) <= EPS
  }
  return true
}

function scaledGeometry(connector, m) {
  const geometry = clone(connector.geometry || {})
  const radial = (m.sx + m.sz) / 2
  const axial = m.sy

  if (connector.family === 'cylinder') {
    geometry.sections = (geometry.sections || []).map(section => ({
      ...section,
      radiusLdu:section.radiusLdu * radial,
      lengthLdu:section.lengthLdu * axial,
    }))
  } else if (connector.family === 'clip') {
    geometry.radiusLdu *= radial
    geometry.lengthLdu *= axial
  } else if (connector.family === 'fingers') {
    geometry.radiusLdu *= radial
    geometry.sequenceLdu = geometry.sequenceLdu.map(value => value * axial)
  } else if (connector.family === 'sphere') {
    geometry.radiusLdu *= radial
  } else if (connector.family === 'generic' && geometry.bounding) {
    const b = geometry.bounding
    if (b.kind === 'sphere') b.radiusLdu *= radial
    else if (b.kind === 'cylinder') {
      b.radiusLdu *= radial
      b.lengthLdu *= axial
    } else if (b.kind === 'cube') b.halfSizeLdu *= radial
    else if (b.kind === 'box') {
      b.halfExtentsLdu = [
        b.halfExtentsLdu[0] * m.sx,
        b.halfExtentsLdu[1] * m.sy,
        b.halfExtentsLdu[2] * m.sz,
      ]
    }
  }
  return geometry
}

export function transformNativeConnector(connector, transform, warnings = [], context = 'native-transform') {
  const m = orientationScale(connector.frame.orientation, transform.linear)
  if (!geometryScaleAllowed(connector, m)) {
    warnings.push({
      code:'geometry-scale-rejected',
      detail:`${context}: sx=${m.sx} sy=${m.sy} sz=${m.sz} shear=${m.shear}`,
    })
    return null
  }

  let x = m.nx
  const y = normalize3(m.ny)
  if (m.mirrored && String(connector?.inheritance?.mirror || 'cor').toLowerCase() !== 'corz') {
    x = scale3(x, -1)
  }
  x = normalize3(add3(x, scale3(y, -dot3(x,y))))
  const z = normalize3(cross3(x,y))
  if ([x,y,z].some(axis => length3(axis) < .99)) {
    warnings.push({ code:'orientation-rejected', detail:context })
    return null
  }

  const result = clone(connector)
  const localPosition = connector.frame.positionLdu
  result.frame.positionLdu = add3(mul3v(transform.linear, localPosition), transform.translation)
  result.frame.orientation = [
    x[0],y[0],z[0],
    x[1],y[1],z[1],
    x[2],y[2],z[2],
  ]
  result.geometry = scaledGeometry(connector, m)
  result.provenance = [...(result.provenance || []), { type:'native-include-transform', context }]
  return result
}

function gridConnectors(connector, grid, file) {
  return expandGrid(grid).map((offset, index) => {
    const result = clone(connector)
    result.frame.positionLdu = add3(
      result.frame.positionLdu,
      mul3v(result.frame.orientation, offset),
    )
    result.resolutionKey = `${file}:${result.source?.line || 0}:${index}`
    result.clearIds = [...new Set([...(result.clearIds || []), result.id].filter(Boolean))]
    result.provenance = [...(result.provenance || []), { type:'grid', index, offsetLdu:offset }]
    return result
  })
}

function includeTransform(operation, offset) {
  const linear = [...operation.frame.orientation]
  linear[0] *= operation.scale[0]; linear[3] *= operation.scale[0]; linear[6] *= operation.scale[0]
  linear[1] *= operation.scale[1]; linear[4] *= operation.scale[1]; linear[7] *= operation.scale[1]
  linear[2] *= operation.scale[2]; linear[5] *= operation.scale[2]; linear[8] *= operation.scale[2]
  return {
    linear,
    translation:add3(operation.frame.positionLdu, mul3v(operation.frame.orientation, offset)),
  }
}

function clearConnectors(connectors, id) {
  if (!id) return []
  return connectors.filter(connector => !(connector.clearIds || []).includes(id))
}

function includeCandidates(ref, parentPath) {
  const value = normalizePath(ref)
  if (/^(?:parts|p)\//.test(value)) return [value]
  if (/^s\//.test(value)) return [`parts/${value}`, value]
  const directory = parentPath.includes('/') ? parentPath.slice(0, parentPath.lastIndexOf('/') + 1) : ''
  return [...new Set([normalizePath(directory + value), value, `parts/${value}`])]
}

export function createNativeShadowResolver({
  fetchShadowText,
  maxDepth = DEFAULT_MAX_DEPTH,
  maxNodes = DEFAULT_MAX_NODES,
} = {}) {
  if (typeof fetchShadowText !== 'function') throw new TypeError('Native Shadow resolver requires fetchShadowText')

  const cache = new Map()

  async function findInclude(ref, parentPath) {
    for (const candidate of includeCandidates(ref, parentPath)) {
      const text = await fetchShadowText(candidate)
      if (text != null) return { path:candidate, text }
    }
    return null
  }

  async function resolvePath(path, {
    depth = 0,
    stack = [],
    traversal = { nodes:0 },
    suppliedText = null,
    seedConnectors = [],
  } = {}) {
    const key = normalizePath(path)
    if (depth > maxDepth) {
      return { connectors:[], warnings:[{code:'max-depth',detail:key}], found:false }
    }
    if (stack.includes(key)) {
      return { connectors:[], warnings:[{code:'include-cycle',detail:[...stack,key].join(' -> ')}], found:false }
    }

    const useCache = suppliedText == null && seedConnectors.length === 0
    if (useCache && cache.has(key)) return clone(await cache.get(key))

    const promise = (async () => {
      traversal.nodes += 1
      if (traversal.nodes > maxNodes) {
        return { connectors:[], warnings:[{code:'node-budget',detail:String(maxNodes)}], found:false }
      }

      const text = suppliedText == null ? await fetchShadowText(key) : suppliedText
      if (text == null) return { connectors:[...seedConnectors], warnings:[], found:false }

      const parsed = parseLdcadShadowText(text, { file:key })
      const warnings = [...parsed.warnings]
      let connectors = [...seedConnectors]
      const nextStack = [...stack, key]

      for (const operation of parsed.operations) {
        if (operation.type === 'clear') {
          connectors = clearConnectors(connectors, operation.id)
          continue
        }
        if (operation.type === 'connector') {
          connectors.push(...gridConnectors(operation.connector, operation.grid, key))
          continue
        }
        if (operation.type !== 'include') continue

        const included = await findInclude(operation.ref, key)
        if (!included) {
          warnings.push({ code:'include-not-found', file:key, detail:operation.ref })
          continue
        }
        const resolved = await resolvePath(included.path, {
          depth:depth + 1,
          stack:nextStack,
          traversal,
          suppliedText:included.text,
        })
        warnings.push(...resolved.warnings.map(warning => ({ ...warning, includedFrom:key })))

        for (const offset of expandGrid(operation.grid)) {
          const transform = includeTransform(operation, offset)
          for (const connector of resolved.connectors) {
            const transformed = transformNativeConnector(
              connector,
              transform,
              warnings,
              `${key} -> ${included.path}`,
            )
            if (!transformed) continue
            if (operation.id) {
              transformed.clearIds = [...new Set([...(transformed.clearIds || []), operation.id])]
            }
            transformed.provenance = [
              ...(transformed.provenance || []),
              { type:'native-include', from:key, ref:included.path },
            ]
            connectors.push(transformed)
          }
        }
      }

      return {
        connectors,
        warnings,
        found:true,
      }
    })()

    if (useCache) cache.set(key, promise)
    try {
      return clone(await promise)
    } catch (error) {
      if (useCache) cache.delete(key)
      throw error
    }
  }

  return Object.freeze({
    version:NATIVE_SHADOW_RESOLVER_VERSION,
    capabilities:Object.freeze({
      directShadow:true,
      includes:true,
      clear:true,
      grid:true,
      officialInheritance:false,
    }),
    async resolve(path) {
      const traversal = { nodes:0 }
      const result = await resolvePath(path, { traversal })
      return Object.freeze({
        version:NATIVE_SHADOW_RESOLVER_VERSION,
        file:normalizePath(path),
        connectors:Object.freeze(result.connectors),
        warnings:Object.freeze(result.warnings),
        found:result.found,
        stats:Object.freeze({
          connectors:result.connectors.length,
          warnings:result.warnings.length,
          nodes:traversal.nodes,
          maxDepth,
          maxNodes,
        }),
      })
    },
    async apply(path, baseConnectors = [], suppliedText = null) {
      const traversal = { nodes:0 }
      const result = await resolvePath(path, {
        traversal,
        suppliedText,
        seedConnectors:[...(baseConnectors || [])],
      })
      return Object.freeze({
        version:NATIVE_SHADOW_RESOLVER_VERSION,
        file:normalizePath(path),
        connectors:Object.freeze(result.connectors),
        warnings:Object.freeze(result.warnings),
        found:result.found,
        stats:Object.freeze({
          connectors:result.connectors.length,
          warnings:result.warnings.length,
          nodes:traversal.nodes,
          maxDepth,
          maxNodes,
        }),
      })
    },
    clearCache() {
      cache.clear()
    },
  })
}
