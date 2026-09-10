import * as THREE from 'three'
import { LDrawLoader } from 'three/addons/loaders/LDrawLoader.js'
import { LDrawConditionalLineMaterial } from 'three/addons/materials/LDrawConditionalLineMaterial.js'
import { PARTS } from '../parts.js'

export const LDRAW_SOURCE = Object.freeze({
  repository: 'pybricks/ldraw',
  branch: 'master',
  rawRoot: 'https://raw.githubusercontent.com/pybricks/ldraw/master/',
  apiRoot: 'https://api.github.com/repos/pybricks/ldraw',
  librarySite: 'https://library.ldraw.org',
})
export const LDRAW_RUNTIME_VERSION = 'ldraw-runtime-v3.2.0'

export const LDU_TO_STUD = 1 / 20
const PARTS_ROOT = `${LDRAW_SOURCE.rawRoot}parts/`
const CONFIG_URL = `${LDRAW_SOURCE.rawRoot}LDConfig.ldr`
const MAX_SUBPART_DEPTH = 8
const textCache = new Map()
const metadataCache = new Map()
const prototypeCache = new Map()
const resolvedPrototypeCache = new Map()
const inferenceCache = new Map()
let indexPromise = null
let loaderPromise = null

const normalizeFile = value => String(value || '').replace(/^parts\//i, '').replace(/\\/g, '/').trim()
const partCode = file => normalizeFile(file).replace(/\.dat$/i, '')
const rawUrl = (root, file) => `${root}${normalizeFile(file).split('/').map(encodeURIComponent).join('/')}`

async function fetchOk(url, options = {}) {
  const response = await fetch(url, { mode: 'cors', cache: 'force-cache', ...options })
  if (!response.ok) throw new Error(`LDraw HTTP ${response.status}: ${url}`)
  return response
}

export async function fetchLDrawText(file) {
  const normalized = normalizeFile(file)
  if (textCache.has(normalized)) return textCache.get(normalized)
  const promise = fetchOk(rawUrl(PARTS_ROOT, normalized)).then(response => response.text())
  textCache.set(normalized, promise)
  try { return await promise } catch (error) { textCache.delete(normalized); throw error }
}

function parseHeader(text, file) {
  const lines = String(text || '').split(/\r?\n/)
  let description = ''
  let category = ''
  let keywords = []
  let license = ''
  let type = ''
  let name = ''
  for (const line of lines) {
    if (!line.startsWith('0 ')) continue
    if (!description && !/^0\s+(?:Name:|Author:|!|BFC|\/\/)/i.test(line)) description = line.slice(2).trim()
    const nameMatch = line.match(/^0\s+Name:\s*(.+)$/i)
    if (nameMatch) name = normalizeFile(nameMatch[1])
    const categoryMatch = line.match(/^0\s+!CATEGORY\s+(.+)$/i)
    if (categoryMatch) category = categoryMatch[1].trim()
    const keywordMatch = line.match(/^0\s+!KEYWORDS\s+(.+)$/i)
    if (keywordMatch) keywords.push(...keywordMatch[1].split(',').map(value => value.trim()).filter(Boolean))
    const licenseMatch = line.match(/^0\s+!LICENSE\s+(.+)$/i)
    if (licenseMatch) license = licenseMatch[1].trim()
    const typeMatch = line.match(/^0\s+!LDRAW_ORG\s+([^\s]+)/i)
    if (typeMatch) type = typeMatch[1]
  }
  return {
    file: normalizeFile(file), code: partCode(file), name,
    description: description || `LDraw part ${partCode(file)}`,
    category, keywords: [...new Set(keywords)], license, type,
  }
}

function type1References(text) {
  const result = []
  for (const line of String(text || '').split(/\r?\n/)) {
    const tokens = line.trim().split(/\s+/)
    if (tokens[0] !== '1' || tokens.length < 15) continue
    const values = tokens.slice(2, 14).map(Number)
    if (!values.every(Number.isFinite)) continue
    const [x, y, z, a, b, c, d, e, f, g, h, i] = values
    result.push({
      file: normalizeFile(tokens.slice(14).join(' ')).toLowerCase(),
      matrix: new THREE.Matrix4().set(
        a, b, c, x,
        d, e, f, y,
        g, h, i, z,
        0, 0, 0, 1,
      ),
    })
  }
  return result
}

function convertedPoint(matrix, local = new THREE.Vector3()) {
  const value = local.clone().applyMatrix4(matrix)
  return new THREE.Vector3(value.x, -value.y, -value.z).multiplyScalar(LDU_TO_STUD)
}

function convertedAxis(matrix, local = new THREE.Vector3(0, 1, 0)) {
  const value = local.clone().applyMatrix3(new THREE.Matrix3().setFromMatrix4(matrix))
  value.set(value.x, -value.y, -value.z)
  return value.lengthSq() > 1e-8 ? value.normalize() : new THREE.Vector3(0, 1, 0)
}

function primitiveKind(file) {
  const basename = normalizeFile(file).split('/').pop() || ''
  if (/^stud/i.test(basename)) {
    return /^(?:stud3|stud4|stud8|stud11)/i.test(basename) ? 'tube' : 'stud'
  }
  if (/^(?:peghole|pinhol|pin-hole)/i.test(basename)) return 'pin-hole'
  if (/^axlehol(?:e|\d|[a-z]|-)/i.test(basename)) return 'axle-hole'
  return null
}

function featureFromPrimitive(kind, matrix) {
  if (kind === 'stud') return { kind, position: convertedPoint(matrix), axis: convertedAxis(matrix, new THREE.Vector3(0, -1, 0)) }
  if (kind === 'tube') {
    return { kind, position: convertedPoint(matrix, new THREE.Vector3(0, -4, 0)), axis: convertedAxis(matrix, new THREE.Vector3(0, -1, 0)) }
  }
  return { kind, position: convertedPoint(matrix), axis: convertedAxis(matrix) }
}

function isSubpartReference(file) {
  return /^s\//i.test(normalizeFile(file))
}

function dedupePoints(items, tolerance = .10) {
  const result = []
  for (const item of items) {
    const duplicate = result.find(other => other.kind === item.kind && other.position.distanceTo(item.position) <= tolerance && Math.abs(other.axis.dot(item.axis)) > .78)
    if (!duplicate) result.push(item)
  }
  return result
}

function pairOpenings(items, maxDistance = 1.25) {
  const used = new Set()
  const result = []
  for (let i = 0; i < items.length; i += 1) {
    if (used.has(i)) continue
    let best = -1
    let bestDistance = Infinity
    for (let j = i + 1; j < items.length; j += 1) {
      if (used.has(j)) continue
      const distance = items[i].position.distanceTo(items[j].position)
      if (distance > maxDistance || Math.abs(items[i].axis.dot(items[j].axis)) < .55) continue
      const delta = items[j].position.clone().sub(items[i].position)
      if (delta.lengthSq() && Math.abs(delta.normalize().dot(items[i].axis)) < .55) continue
      if (distance < bestDistance) { best = j; bestDistance = distance }
    }
    if (best >= 0) {
      used.add(i); used.add(best)
      const delta = items[best].position.clone().sub(items[i].position)
      const axis = items[i].axis.clone()
      if (delta.lengthSq() && axis.dot(delta) < 0) axis.negate()
      result.push({ kind: items[i].kind, position: items[i].position.clone().add(items[best].position).multiplyScalar(.5), axis })
    } else {
      used.add(i)
      result.push({ kind: items[i].kind, position: items[i].position.clone(), axis: items[i].axis.clone() })
    }
  }
  return dedupePoints(result, .16)
}

async function scanFeatures(text, parentMatrix, depth, stack, output) {
  const subparts = []
  for (const ref of type1References(text)) {
    const matrix = parentMatrix.clone().multiply(ref.matrix)
    const kind = primitiveKind(ref.file)
    if (kind) {
      output.push(featureFromPrimitive(kind, matrix))
      continue
    }
    if (depth < MAX_SUBPART_DEPTH && isSubpartReference(ref.file)) subparts.push({ file: normalizeFile(ref.file), matrix })
  }

  await Promise.all(subparts.map(async child => {
    if (stack.has(child.file)) return
    try {
      const childText = await fetchLDrawText(child.file)
      const next = new Set(stack)
      next.add(child.file)
      await scanFeatures(childText, child.matrix, depth + 1, next, output)
    } catch (error) {
      console.debug?.(`[BrickLab LDraw] connector subpart skipped: ${child.file}`, error)
    }
  }))
}

async function inferFeatures(file, text) {
  const normalized = normalizeFile(file)
  if (inferenceCache.has(normalized)) return inferenceCache.get(normalized)
  const promise = (async () => {
    const output = []
    await scanFeatures(text, new THREE.Matrix4(), 0, new Set([normalized]), output)
    const unique = dedupePoints(output)
    return {
      studs: unique.filter(item => item.kind === 'stud'),
      tubes: unique.filter(item => item.kind === 'tube'),
      pinHoles: pairOpenings(unique.filter(item => item.kind === 'pin-hole')),
      axleHoles: pairOpenings(unique.filter(item => item.kind === 'axle-hole')),
    }
  })()
  inferenceCache.set(normalized, promise)
  try { return await promise } catch (error) { inferenceCache.delete(normalized); throw error }
}

function connectorArray(raw, offset) {
  const result = []
  const append = (type, items) => items.forEach((item, index) => {
    const point = item.position.clone().add(offset)
    result.push({ id: `ldraw-${type}-${index}`, type, position: [point.x, point.y, point.z], axis: [item.axis.x, item.axis.y, item.axis.z] })
  })
  append('stud', raw.studs)
  append('tube', raw.tubes)
  append('pin-hole', raw.pinHoles)
  append('axle-hole', raw.axleHoles)
  return result
}

function inferMechanics(metadata, connectors) {
  const description = String(metadata.description || '')
  const lower = description.toLowerCase()
  const mechanics = {}
  const spur = description.match(/\bGear\s+(\d+)\s+Tooth\b/i)
  if (spur && !/bevel|worm|rack|crown|clutch|differential|knob|turntable/.test(lower)) {
    const teeth = Number(spur[1])
    if (Number.isFinite(teeth) && teeth >= 6 && teeth <= 80 && connectors.some(connector => connector.type === 'axle-hole')) {
      mechanics.gear = { teeth, pitchRadius: teeth / 16, efficiency: .92 }
    }
  }
  if (/^technic axle\s+\d/i.test(lower) && !/connector|hole|joiner|coupler/.test(lower)) mechanics.shaft = true
  return Object.keys(mechanics).length ? mechanics : null
}

async function createLoader() {
  const loader = new LDrawLoader()
  loader.setConditionalLineMaterial(LDrawConditionalLineMaterial)
  loader.setPartsLibraryPath(LDRAW_SOURCE.rawRoot)
  try { await loader.preloadMaterials(CONFIG_URL) } catch (error) { console.warn('[BrickLab LDraw] colour config unavailable', error) }
  return loader
}

async function getLoader() {
  loaderPromise ??= createLoader()
  return loaderPromise
}

function markSharedGeometry(root) {
  root.traverse(object => {
    if (!object.geometry) return
    object.geometry.userData ??= {}
    object.geometry.userData.bricklabSharedVisual = true
  })
}

function cloneMaterials(root, color) {
  const hex = Number(color)
  root.traverse(object => {
    if (!object.isMesh && !object.isLineSegments) return
    const source = Array.isArray(object.material) ? object.material : [object.material]
    const cloned = source.map(material => {
      if (!material) return material
      const copy = material.clone()
      if (copy.name === 'Main_Colour' && copy.color && Number.isFinite(hex)) copy.color.setHex(hex)
      return copy
    })
    object.material = Array.isArray(object.material) ? cloned : cloned[0]
    if (object.isMesh) { object.castShadow = true; object.receiveShadow = true }
  })
}

function legacyLevel(payload) {
  return payload.mechanics ? 'mechanical' : payload.connectors.length ? 'snap' : 'visual'
}

function applyLegacyPayload(def, payload, root = null, announce = false) {
  def.connectors.splice(0, def.connectors.length, ...payload.connectors)
  if (payload.mechanics) def.mechanics = payload.mechanics
  const level = legacyLevel(payload)
  def.ldraw = {
    ...def.ldraw,
    connectorCount:payload.connectors.length,
    recursiveSubparts:payload.metadata.recursiveSubparts,
    legacyReady:payload.metadata.recursiveSubparts === true,
    legacyError:payload.metadata.legacyError || null,
    level,
  }
  if (root) root.userData.ldraw = {
    ...root.userData.ldraw,
    connectorCount:payload.connectors.length,
    legacyReady:def.ldraw.legacyReady,
    level,
  }
  if (announce && !payload.legacyAnnounced) {
    payload.legacyAnnounced = true
    window.dispatchEvent(new CustomEvent('bricklab:ldrawlegacyready', { detail:{ id:def.id, file:def.ldraw.file, connectors:payload.connectors.length, level } }))
    window.dispatchEvent(new CustomEvent('bricklab:partcatalogchange'))
  }
}

function startLegacyInference(normalized, text, offset, metadata, payload) {
  payload.legacyReady = inferFeatures(normalized, text).then(rawFeatures => {
    const connectors = connectorArray(rawFeatures, offset)
    payload.connectors.splice(0, payload.connectors.length, ...connectors)
    payload.mechanics = inferMechanics(metadata, payload.connectors)
    payload.metadata.connectorCount = payload.connectors.length
    payload.metadata.recursiveSubparts = true
    payload.metadata.legacyError = null
    return payload
  }).catch(error => {
    payload.metadata.recursiveSubparts = false
    payload.metadata.legacyError = String(error?.message || error)
    console.debug?.(`[BrickLab LDraw] Legacy connector inference unavailable for ${normalized}`, error)
    return payload
  })
  return payload.legacyReady
}

async function loadPrototype(file) {
  const normalized = normalizeFile(file)
  const resolved = resolvedPrototypeCache.get(normalized)
  if (resolved) return resolved
  if (prototypeCache.has(normalized)) return prototypeCache.get(normalized)
  const promise = (async () => {
    // Start the independent top-level text request immediately. As soon as the shared
    // LDrawLoader (including its one-time colour config) is ready, start geometry too;
    // neither request waits for the other before doing useful network work.
    const textTask = fetchLDrawText(normalized)
    const loaderTask = getLoader()
    const loader = await loaderTask
    const modelTask = loader.loadAsync(rawUrl(PARTS_ROOT, normalized))
    const [model, text] = await Promise.all([modelTask, textTask])
    model.rotation.x = Math.PI
    model.scale.setScalar(LDU_TO_STUD)
    model.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(model)
    if (box.isEmpty()) throw new Error(`Empty LDraw geometry: ${normalized}`)
    const center = box.getCenter(new THREE.Vector3())
    const offset = new THREE.Vector3(-center.x, -box.min.y, -center.z)
    model.position.add(offset)
    model.updateMatrixWorld(true)
    markSharedGeometry(model)
    const finalBox = new THREE.Box3().setFromObject(model)
    const size = finalBox.getSize(new THREE.Vector3())
    const metadata = parseHeader(text, normalized)
    const connectors = []
    const payload = {
      model,
      metadata: { ...metadata, size: [size.x, size.y, size.z], connectorCount: 0, recursiveSubparts: 'loading', legacyError:null },
      connectors,
      mechanics: inferMechanics(metadata, connectors),
      legacyReady:null,
      legacyAnnounced:false,
    }
    resolvedPrototypeCache.set(normalized, payload)
    void startLegacyInference(normalized, text, offset, metadata, payload)
    return payload
  })()
  prototypeCache.set(normalized, promise)
  try { return await promise } catch (error) { prototypeCache.delete(normalized); throw error }
}

export async function preloadLDrawPrototype(file) {
  return loadPrototype(normalizeFile(file))
}

export function isLDrawPrototypeReady(file) {
  return resolvedPrototypeCache.has(normalizeFile(file))
}

export async function getLDrawMetadata(file) {
  const normalized = normalizeFile(file)
  if (metadataCache.has(normalized)) return metadataCache.get(normalized)
  const promise = fetchLDrawText(normalized).then(text => parseHeader(text, normalized))
  metadataCache.set(normalized, promise)
  try { return await promise } catch (error) { metadataCache.delete(normalized); throw error }
}

export async function getLDrawIndex() {
  if (indexPromise) return indexPromise
  indexPromise = (async () => {
    const root = await fetchOk(`${LDRAW_SOURCE.apiRoot}/git/trees/${LDRAW_SOURCE.branch}`, { headers: { Accept: 'application/vnd.github+json' } }).then(response => response.json())
    const partsTree = root.tree?.find(item => item.type === 'tree' && item.path === 'parts')
    if (!partsTree?.sha) throw new Error('LDraw parts tree was not found')
    const data = await fetchOk(`${LDRAW_SOURCE.apiRoot}/git/trees/${partsTree.sha}?recursive=1`, { headers: { Accept: 'application/vnd.github+json' } }).then(response => response.json())
    if (!Array.isArray(data.tree)) throw new Error('Invalid LDraw tree response')
    return data.tree
      .filter(item => item.type === 'blob' && /^[^/]+\.dat$/i.test(item.path))
      .map(item => ({ file: item.path, code: partCode(item.path), size: item.size || 0 }))
  })()
  try { return await indexPromise } catch (error) { indexPromise = null; throw error }
}

function fallbackSize(description = '') {
  const match = String(description).match(/(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)(?:\s*x\s*(\d+(?:\.\d+)?))?/i)
  if (!match) return [2, 1.2, 2]
  return [Math.max(.5, Number(match[1]) || 1), Math.max(.4, Number(match[3]) || 1.2), Math.max(.5, Number(match[2]) || 1)]
}

function placeholder(size, color) {
  const [x, y, z] = size
  const geometry = new THREE.BoxGeometry(Math.max(.4, x - .08), Math.max(.3, y), Math.max(.4, z - .08))
  const material = new THREE.MeshStandardMaterial({ color, roughness: .5, transparent: true, opacity: .42 })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.y = Math.max(.3, y) / 2
  mesh.userData.ldrawPlaceholder = true
  const group = new THREE.Group()
  group.add(mesh)
  group.userData.disposePlaceholder = () => { geometry.dispose(); material.dispose() }
  return group
}

function categoryFor(metadata) {
  const value = `${metadata.category || ''} ${metadata.description || ''}`.toLowerCase()
  if (value.includes('technic') && value.includes('gear')) return 'Gears'
  if (value.includes('wheel') || value.includes('tyre') || value.includes('tire')) return 'Wheels'
  if (value.includes('technic') && (value.includes('axle') || value.includes('pin'))) return 'Axles'
  if (value.includes('technic') || value.includes('beam') || value.includes('liftarm')) return 'Beams'
  if (value.includes('brick') || value.includes('plate') || value.includes('tile')) return 'Bricks'
  return 'LDraw'
}

function attachPrototype(root, def, payload, color, fallback = null, announce = false) {
  if (fallback) {
    root.remove(fallback)
    fallback.userData.disposePlaceholder?.()
  }
  const visual = payload.model.clone(true)
  cloneMaterials(visual, color)
  visual.traverse(child => {
    child.userData = { ...child.userData, instanceRoot: root, ldrawVisual: true }
    if (child.isMesh) { child.castShadow = true; child.receiveShadow = true }
  })
  root.add(visual)
  def.connectors.splice(0, def.connectors.length, ...payload.connectors)
  def.name = payload.metadata.description || def.name
  def.description = `${payload.metadata.description || def.description}${payload.metadata.license ? ` · ${payload.metadata.license}` : ''}`
  def.category = categoryFor(payload.metadata)
  def.tags = [...new Set([...def.tags, ...(payload.metadata.keywords || []), payload.metadata.category].filter(Boolean))]
  if (payload.mechanics) def.mechanics = payload.mechanics
  def.ldraw = {
    ...def.ldraw,
    ...payload.metadata,
    ready: true,
    legacyReady:payload.metadata.recursiveSubparts === true,
    level: legacyLevel(payload),
  }
  root.userData.ldraw = {
    ...root.userData.ldraw,
    status: 'ready',
    connectorCount: payload.connectors.length,
    legacyReady:def.ldraw.legacyReady,
    level: def.ldraw.level,
  }
  if (payload.legacyReady) void payload.legacyReady.then(() => applyLegacyPayload(def, payload, root, true))
  if (announce) {
    window.dispatchEvent(new CustomEvent('bricklab:ldrawloaded', { detail: { id: def.id, file: def.ldraw.file, code: def.ldraw.code, connectors: payload.connectors.length, level: def.ldraw.level, legacyReady:def.ldraw.legacyReady } }))
    window.dispatchEvent(new CustomEvent('bricklab:partcatalogchange'))
  }
}

export function registerLDrawPart(entry = {}) {
  const file = normalizeFile(entry.file || `${entry.code}.dat`)
  const code = partCode(file)
  const id = `ldraw-${code}`
  const existing = PARTS.find(part => part.id === id)
  if (existing) return existing
  const initialName = entry.description || entry.name || `LDraw ${code}`
  const connectors = []
  const def = {
    id,
    name: initialName,
    category: categoryFor({ description: initialName, category: entry.category }),
    icon: 'LD',
    description: entry.description || `LDraw part ${code} · geometry loads on demand`,
    defaultColor: entry.defaultColor ?? 0xd7263d,
    tags: ['ldraw', code, file, ...(entry.keywords || [])],
    connectors,
    ldraw: { file, code, source: LDRAW_SOURCE.repository, ready: false, legacyReady:false, level: 'visual' },
    create(color = def.defaultColor) {
      const root = new THREE.Group()
      root.userData.partId = id
      root.userData.color = color
      root.userData.ldraw = { file, code, status: 'loading' }
      const ready = resolvedPrototypeCache.get(file)
      if (ready) {
        attachPrototype(root, def, ready, color)
        return root
      }
      const fallback = placeholder(fallbackSize(def.name), color)
      root.add(fallback)
      void loadPrototype(file).then(payload => attachPrototype(root, def, payload, color, fallback, !def.ldraw.ready)).catch(error => {
        console.warn(`[BrickLab LDraw] Could not load ${file}`, error)
        root.userData.ldraw = { ...root.userData.ldraw, status: 'error', error: String(error?.message || error) }
      })
      return root
    },
  }
  PARTS.push(def)
  window.dispatchEvent(new CustomEvent('bricklab:partcatalogchange'))
  return def
}

export async function registerLDrawPartByFile(file) {
  return registerLDrawPart(await getLDrawMetadata(file))
}

export const BrickLabLDraw = Object.freeze({
  version:LDRAW_RUNTIME_VERSION,
  source: LDRAW_SOURCE,
  lduToStud: LDU_TO_STUD,
  getIndex: getLDrawIndex,
  getMetadata: getLDrawMetadata,
  register: registerLDrawPart,
  registerByFile: registerLDrawPartByFile,
  preload: preloadLDrawPrototype,
  isPrepared: isLDrawPrototypeReady,
  stats:()=>Object.freeze({
    textCache:textCache.size,
    metadataCache:metadataCache.size,
    prototypeCache:prototypeCache.size,
    resolvedPrototypeCache:resolvedPrototypeCache.size,
    inferenceCache:inferenceCache.size,
  }),
})

globalThis.BrickLabLDraw = BrickLabLDraw
