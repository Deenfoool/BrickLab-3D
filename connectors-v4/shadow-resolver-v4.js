import { cloneConnectorV4, SHADOW_SOURCE_V4 } from './schema-v4.js'
import { expandGridV4, parseShadowTextV4 } from './ldcad-parser-v4.js'

export const SHADOW_RESOLVER_VERSION_V4 = 'shadow-resolver-v4.0.0'

const SCALE_EPS = 1e-5
const ORTHO_EPS = 2e-4
const DEFAULT_MAX_DEPTH = 10
const DEFAULT_MAX_NODES = 256

const normalizePath = value => String(value || '').replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+/g, '/').trim()
const lowerPath = value => normalizePath(value).toLowerCase()

function mul3(a, b) {
  return [
    a[0]*b[0]+a[1]*b[3]+a[2]*b[6], a[0]*b[1]+a[1]*b[4]+a[2]*b[7], a[0]*b[2]+a[1]*b[5]+a[2]*b[8],
    a[3]*b[0]+a[4]*b[3]+a[5]*b[6], a[3]*b[1]+a[4]*b[4]+a[5]*b[7], a[3]*b[2]+a[4]*b[5]+a[5]*b[8],
    a[6]*b[0]+a[7]*b[3]+a[8]*b[6], a[6]*b[1]+a[7]*b[4]+a[8]*b[7], a[6]*b[2]+a[7]*b[5]+a[8]*b[8],
  ]
}

function mul3v(m, v) {
  return [m[0]*v[0]+m[1]*v[1]+m[2]*v[2], m[3]*v[0]+m[4]*v[1]+m[5]*v[2], m[6]*v[0]+m[7]*v[1]+m[8]*v[2]]
}

function add3(a, b) { return [a[0]+b[0], a[1]+b[1], a[2]+b[2]] }
function scale3v(a, s) { return [a[0]*s, a[1]*s, a[2]*s] }
function dot3(a, b) { return a[0]*b[0]+a[1]*b[1]+a[2]*b[2] }
function len3(a) { return Math.hypot(a[0], a[1], a[2]) }
function norm3(a) { const n=len3(a); return n > 1e-12 ? scale3v(a, 1/n) : [0,0,0] }
function cross3(a,b){return[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]}
function det3(m){return m[0]*(m[4]*m[8]-m[5]*m[7])-m[1]*(m[3]*m[8]-m[5]*m[6])+m[2]*(m[3]*m[7]-m[4]*m[6])}
function col3(m,index){return[m[index],m[3+index],m[6+index]]}
function fromCols(x,y,z){return[x[0],y[0],z[0],x[1],y[1],z[1],x[2],y[2],z[2]]}

function transformPoint(transform, point) { return add3(mul3v(transform.linear, point), transform.translation) }

function orientationScale(orientation, linear) {
  const raw = mul3(linear, orientation)
  const x = col3(raw, 0), y = col3(raw, 1), z = col3(raw, 2)
  const sx = len3(x), sy = len3(y), sz = len3(z)
  const nx = norm3(x), ny = norm3(y), nz = norm3(z)
  const shear = Math.max(Math.abs(dot3(nx,ny)), Math.abs(dot3(nx,nz)), Math.abs(dot3(ny,nz)))
  return { raw, sx, sy, sz, nx, ny, nz, shear, mirrored: det3(raw) < 0 }
}

function approx(a, b = 1, eps = SCALE_EPS) { return Math.abs(a - b) <= eps }

function scaleAllowed(policy, metrics) {
  const kind = String(policy || 'none').toLowerCase()
  if (metrics.shear > ORTHO_EPS) return false
  if (kind === 'none') return approx(metrics.sx) && approx(metrics.sy) && approx(metrics.sz)
  if (kind === 'yonly') return approx(metrics.sx) && approx(metrics.sz)
  if (kind === 'ronly') return approx(metrics.sy) && approx(metrics.sx, metrics.sz)
  if (kind === 'yandr') return approx(metrics.sx, metrics.sz)
  return false
}

function scaledGeometry(connector, radialScale, axialScale) {
  const geometry = cloneConnectorV4(connector).geometry
  if (connector.family === 'cylinder') {
    geometry.sections = geometry.sections.map(section => ({...section, radiusLdu: section.radiusLdu * radialScale, lengthLdu: section.lengthLdu * axialScale}))
  } else if (connector.family === 'clip') {
    geometry.radiusLdu *= radialScale
    geometry.lengthLdu *= axialScale
  } else if (connector.family === 'fingers') {
    geometry.radiusLdu *= radialScale
    geometry.sequenceLdu = geometry.sequenceLdu.map(value => value * axialScale)
  } else if (connector.family === 'sphere') {
    if (!approx(radialScale, axialScale, ORTHO_EPS)) return null
    geometry.radiusLdu *= (radialScale + axialScale) / 2
  } else if (connector.family === 'generic' && geometry.bounding) {
    const bound = geometry.bounding
    if (bound.kind === 'sphere') {
      if (!approx(radialScale, axialScale, ORTHO_EPS)) return null
      bound.radiusLdu *= (radialScale + axialScale) / 2
    } else if (bound.kind === 'cylinder') {
      bound.radiusLdu *= radialScale
      bound.lengthLdu *= axialScale
    } else if (bound.kind === 'cube') {
      if (!approx(radialScale, axialScale, ORTHO_EPS)) return null
      bound.halfSizeLdu *= (radialScale + axialScale) / 2
    } else if (bound.kind === 'box') {
      if (!(approx(radialScale) && approx(axialScale))) return null
    }
  }
  return geometry
}

function transformConnector(connector, transform, warnings, context) {
  const metrics = orientationScale(connector.frame.orientation, transform.linear)
  if (!scaleAllowed(connector.inheritance?.scale, metrics)) {
    warnings.push({ code:'inheritance-scale-rejected', file:context, connector:connector.source?.raw || '', detail:`scale=${connector.inheritance?.scale || 'none'} sx=${metrics.sx.toFixed(5)} sy=${metrics.sy.toFixed(5)} sz=${metrics.sz.toFixed(5)} shear=${metrics.shear.toExponential(2)}` })
    return null
  }
  if (metrics.mirrored && String(connector.inheritance?.mirror || 'none').toLowerCase() !== 'cor') {
    warnings.push({ code:'inheritance-mirror-rejected', file:context, connector:connector.source?.raw || '' })
    return null
  }

  let x = metrics.nx, y = metrics.ny, z = metrics.nz
  if (metrics.mirrored) x = scale3v(x, -1)
  y = norm3(y)
  x = norm3(add3(x, scale3v(y, -dot3(x,y))))
  z = norm3(cross3(x, y))
  if (dot3(z, metrics.nz) < 0) { x = scale3v(x,-1); z = scale3v(z,-1) }

  const geometry = scaledGeometry(connector, (metrics.sx + metrics.sz) / 2, metrics.sy)
  if (!geometry) {
    warnings.push({ code:'inheritance-geometry-scale-rejected', file:context, connector:connector.source?.raw || '' })
    return null
  }

  const result = cloneConnectorV4(connector)
  result.frame.positionLdu = transformPoint(transform, connector.frame.positionLdu)
  result.frame.orientation = fromCols(x,y,z)
  result.geometry = geometry
  result.provenance = [...(result.provenance || []), { type:'transform', context }]
  return result
}

function connectorWithGrid(connector, grid, file) {
  return expandGridV4(grid).map((offset, index) => {
    const copy = cloneConnectorV4(connector)
    const delta = mul3v(copy.frame.orientation, offset)
    copy.frame.positionLdu = add3(copy.frame.positionLdu, delta)
    copy.key = `${file}:${copy.source?.line || 0}:${index}`
    copy.clearIds = [...new Set([...(copy.clearIds || []), copy.id].filter(Boolean))]
    copy.provenance = [...(copy.provenance || []), { type:'grid', index, offsetLdu:offset }]
    return copy
  })
}

function clearConnectors(connectors, id) {
  if (!id) return []
  return connectors.filter(connector => !(connector.clearIds || []).includes(id))
}

function includeTransform(operation, offset) {
  const scaled = [...operation.frame.orientation]
  scaled[0]*=operation.scale[0]; scaled[3]*=operation.scale[0]; scaled[6]*=operation.scale[0]
  scaled[1]*=operation.scale[1]; scaled[4]*=operation.scale[1]; scaled[7]*=operation.scale[1]
  scaled[2]*=operation.scale[2]; scaled[5]*=operation.scale[2]; scaled[8]*=operation.scale[2]
  return {
    linear: scaled,
    translation: add3(operation.frame.positionLdu, mul3v(operation.frame.orientation, offset)),
  }
}

export function parseType1ReferencesV4(text) {
  const result = []
  for (const raw of String(text || '').split(/\r?\n/)) {
    const values = raw.trim().split(/\s+/)
    if (values[0] !== '1' || values.length < 15) continue
    const nums = values.slice(2, 14).map(Number)
    if (!nums.every(Number.isFinite)) continue
    const [x,y,z,a,b,c,d,e,f,g,h,i] = nums
    result.push({
      ref: normalizePath(values.slice(14).join(' ')),
      transform: { linear:[a,b,c,d,e,f,g,h,i], translation:[x,y,z] },
      raw,
    })
  }
  return result
}

function rootPath(file) {
  const value = normalizePath(file)
  if (/^(?:parts|p)\//i.test(value)) return lowerPath(value)
  if (/^s\//i.test(value)) return lowerPath(`parts/${value}`)
  if (/^(?:48|8)\//i.test(value)) return lowerPath(`p/${value}`)
  return lowerPath(`parts/${value}`)
}

function referenceCandidates(ref, parentPath) {
  const value = lowerPath(ref)
  if (/^(?:parts|p)\//.test(value)) return [value]
  if (/^s\//.test(value)) return [`parts/${value}`]
  if (/^(?:48|8)\//.test(value)) return [`p/${value}`]
  return parentPath.startsWith('p/') ? [`p/${value}`, `parts/${value}`] : [`parts/${value}`, `p/${value}`]
}

function shouldRecurseOfficial(ref) {
  const value = lowerPath(ref)
  return value.startsWith('s/') || value.startsWith('parts/s/')
}

export function createShadowResolverV4({ fetchOfficialText, fetchShadowText, maxDepth = DEFAULT_MAX_DEPTH, maxNodes = DEFAULT_MAX_NODES } = {}) {
  if (typeof fetchOfficialText !== 'function' || typeof fetchShadowText !== 'function') throw new Error('createShadowResolverV4 requires fetchOfficialText and fetchShadowText')
  const officialCache = new Map()
  const shadowCache = new Map()
  const directCache = new Map()
  const officialResolveCache = new Map()
  let nodeCount = 0

  const getOfficial = path => {
    const key = lowerPath(path)
    if (!officialCache.has(key)) officialCache.set(key, Promise.resolve(fetchOfficialText(key)).catch(() => null))
    return officialCache.get(key)
  }
  const getShadow = path => {
    const key = lowerPath(path)
    if (!shadowCache.has(key)) shadowCache.set(key, Promise.resolve(fetchShadowText(key)).catch(() => null))
    return shadowCache.get(key)
  }

  async function findExisting(candidates, getter) {
    for (const candidate of candidates) {
      const text = await getter(candidate)
      if (text != null) return { path:candidate, text }
    }
    return null
  }

  async function resolveDirectShadow(path, text = null) {
    const key = lowerPath(path)
    if (directCache.has(key)) return directCache.get(key)
    const promise = (async () => {
      const warnings = []
      const source = text == null ? await getShadow(key) : text
      if (source == null) return { connectors:[], warnings, found:false }
      const parsed = parseShadowTextV4(source, { file:key })
      warnings.push(...parsed.warnings.map(warning => ({...warning,file:key})))
      let connectors = []
      for (const op of parsed.operations) {
        if (op.type === 'clear') connectors = clearConnectors(connectors, op.id)
        else if (op.type === 'connector') connectors.push(...connectorWithGrid(op.connector, op.grid, key))
        else if (op.type === 'include') warnings.push({ code:'nonrecursive-include-skipped', file:key, line:op.source?.line, detail:op.ref })
      }
      return { connectors, warnings, found:true }
    })()
    directCache.set(key, promise)
    return promise
  }

  async function applyCurrentShadow(base, path, text, warnings) {
    if (text == null) return base
    const parsed = parseShadowTextV4(text, { file:path })
    warnings.push(...parsed.warnings.map(warning => ({...warning,file:path})))
    let connectors = [...base]
    for (const op of parsed.operations) {
      if (op.type === 'clear') {
        connectors = clearConnectors(connectors, op.id)
        continue
      }
      if (op.type === 'connector') {
        connectors.push(...connectorWithGrid(op.connector, op.grid, path))
        continue
      }
      if (op.type === 'include') {
        const found = await findExisting(referenceCandidates(op.ref, path), getShadow)
        if (!found) {
          warnings.push({ code:'include-not-found', file:path, line:op.source?.line, detail:op.ref })
          continue
        }
        const included = await resolveDirectShadow(found.path, found.text)
        warnings.push(...included.warnings.map(warning => ({...warning, includedFrom:path})))
        for (const offset of expandGridV4(op.grid)) {
          const transform = includeTransform(op, offset)
          for (const sourceConnector of included.connectors) {
            const transformed = transformConnector(sourceConnector, transform, warnings, `${path} -> SNAP_INCL ${found.path}`)
            if (!transformed) continue
            if (op.id) transformed.clearIds = [...new Set([...(transformed.clearIds || []), op.id])]
            transformed.provenance = [...(transformed.provenance || []), { type:'include', from:path, ref:found.path }]
            connectors.push(transformed)
          }
        }
      }
    }
    return connectors
  }

  async function resolveOfficialLocal(path, depth = 0, stack = []) {
    const key = lowerPath(path)
    if (officialResolveCache.has(key)) return officialResolveCache.get(key)
    const promise = (async () => {
      const warnings = []
      if (depth > maxDepth) return { connectors:[], warnings:[{code:'max-depth',file:key,detail:String(maxDepth)}], found:false }
      if (stack.includes(key)) return { connectors:[], warnings:[{code:'cycle',file:key,detail:stack.join(' -> ')}], found:false }
      nodeCount += 1
      if (nodeCount > maxNodes) return { connectors:[], warnings:[{code:'node-budget',file:key,detail:String(maxNodes)}], found:false }

      const official = await getOfficial(key)
      let connectors = []
      if (official != null) {
        const nextStack = [...stack, key]
        for (const reference of parseType1ReferencesV4(official)) {
          const candidates = referenceCandidates(reference.ref, key)
          if (shouldRecurseOfficial(reference.ref)) {
            const childPath = candidates[0]
            const child = await resolveOfficialLocal(childPath, depth + 1, nextStack)
            warnings.push(...child.warnings)
            for (const sourceConnector of child.connectors) {
              const transformed = transformConnector(sourceConnector, reference.transform, warnings, `${key} -> ${childPath}`)
              if (transformed) connectors.push(transformed)
            }
          } else {
            const shadow = await findExisting(candidates, getShadow)
            if (!shadow) continue
            const direct = await resolveDirectShadow(shadow.path, shadow.text)
            warnings.push(...direct.warnings)
            for (const sourceConnector of direct.connectors) {
              const transformed = transformConnector(sourceConnector, reference.transform, warnings, `${key} -> ${shadow.path}`)
              if (transformed) connectors.push(transformed)
            }
          }
        }
      }

      const shadow = await getShadow(key)
      connectors = await applyCurrentShadow(connectors, key, shadow, warnings)
      return { connectors, warnings, found: official != null || shadow != null }
    })()
    officialResolveCache.set(key, promise)
    return promise
  }

  return {
    async resolve(file) {
      nodeCount = 0
      const path = rootPath(file)
      const result = await resolveOfficialLocal(path)
      return {
        schemaVersion: 4,
        resolverVersion: SHADOW_RESOLVER_VERSION_V4,
        source: SHADOW_SOURCE_V4,
        file: path,
        connectors: result.connectors,
        warnings: result.warnings,
        stats: {
          connectors: result.connectors.length,
          warnings: result.warnings.length,
          resolvedOfficialNodes: nodeCount,
          maxDepth,
          maxNodes,
        },
      }
    },
    clearCache() {
      officialCache.clear(); shadowCache.clear(); directCache.clear(); officialResolveCache.clear(); nodeCount = 0
    },
  }
}

export function connectorToBrickLabV4(connector, visualOffsetStud = [0,0,0]) {
  const copy = cloneConnectorV4(connector)
  const [x,y,z] = connector.frame.positionLdu
  const orientation = connector.frame.orientation
  const brickOrientation = [
    orientation[0], orientation[1], orientation[2],
    -orientation[3], -orientation[4], -orientation[5],
    -orientation[6], -orientation[7], -orientation[8],
  ]
  const axis = norm3(mul3v(brickOrientation, [0,-1,0]))
  copy.unit = 'stud'
  copy.frame = {
    ...copy.frame,
    positionStud: [x/20 + (visualOffsetStud[0]||0), -y/20 + (visualOffsetStud[1]||0), -z/20 + (visualOffsetStud[2]||0)],
    orientationBrickLab: brickOrientation,
    axis,
  }
  const geometryStud = cloneConnectorV4(connector).geometry
  if (connector.family === 'cylinder') geometryStud.sections = geometryStud.sections.map(section => ({...section,radius:section.radiusLdu/20,length:section.lengthLdu/20}))
  if (connector.family === 'clip') { geometryStud.radius=geometryStud.radiusLdu/20; geometryStud.length=geometryStud.lengthLdu/20 }
  if (connector.family === 'fingers') { geometryStud.radius=geometryStud.radiusLdu/20; geometryStud.sequence=geometryStud.sequenceLdu.map(value=>value/20) }
  if (connector.family === 'sphere') geometryStud.radius=geometryStud.radiusLdu/20
  copy.geometryStud = geometryStud
  return copy
}
