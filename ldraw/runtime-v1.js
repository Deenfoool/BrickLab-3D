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

export const LDU_TO_STUD = 1 / 20
const PARTS_ROOT = `${LDRAW_SOURCE.rawRoot}parts/`
const CONFIG_URL = `${LDRAW_SOURCE.rawRoot}LDConfig.ldr`
const textCache = new Map()
const metadataCache = new Map()
const prototypeCache = new Map()
let indexPromise = null
let loaderPromise = null

const normalizeFile = value => String(value || '').replace(/^parts\//i, '').replace(/\\/g, '/').trim()
const partCode = file => normalizeFile(file).replace(/\.dat$/i, '')

async function fetchOk(url, options = {}) {
  const response = await fetch(url, { mode: 'cors', cache: 'force-cache', ...options })
  if (!response.ok) throw new Error(`LDraw HTTP ${response.status}: ${url}`)
  return response
}

export async function fetchLDrawText(file) {
  const normalized = normalizeFile(file)
  if (textCache.has(normalized)) return textCache.get(normalized)
  const promise = fetchOk(`${PARTS_ROOT}${normalized.split('/').map(encodeURIComponent).join('/')}`).then(response => response.text())
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
  for (const line of lines) {
    if (!line.startsWith('0 ')) continue
    if (!description && !/^0\s+(?:Name:|Author:|!|BFC|\/\/)/i.test(line)) description = line.slice(2).trim()
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
    file: normalizeFile(file),
    code: partCode(file),
    description: description || `LDraw part ${partCode(file)}`,
    category,
    keywords: [...new Set(keywords)],
    license,
    type,
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
    result.push({ x, y, z, a, b, c, d, e, f, g, h, i, file: tokens.slice(14).join(' ').toLowerCase() })
  }
  return result
}

const convertPoint = point => new THREE.Vector3(point.x, -point.y, -point.z).multiplyScalar(LDU_TO_STUD)
function convertAxis(ref, localAxis = new THREE.Vector3(0, 1, 0)) {
  const matrix = new THREE.Matrix3().set(ref.a, ref.b, ref.c, ref.d, ref.e, ref.f, ref.g, ref.h, ref.i)
  const axis = localAxis.clone().applyMatrix3(matrix)
  axis.set(axis.x, -axis.y, -axis.z)
  return axis.lengthSq() > 1e-8 ? axis.normalize() : new THREE.Vector3(0, 1, 0)
}

function dedupePoints(items, tolerance = 0.12) {
  const result = []
  for (const item of items) {
    const existing = result.find(other => other.position.distanceTo(item.position) <= tolerance && Math.abs(other.axis.dot(item.axis)) > 0.75)
    if (!existing) result.push(item)
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
      if (distance > maxDistance) continue
      const delta = items[j].position.clone().sub(items[i].position)
      if (delta.lengthSq() && Math.abs(delta.normalize().dot(items[i].axis)) < 0.55) continue
      if (distance < bestDistance) { best = j; bestDistance = distance }
    }
    if (best >= 0) {
      used.add(i); used.add(best)
      result.push({ position: items[i].position.clone().add(items[best].position).multiplyScalar(.5), axis: items[i].axis.clone() })
    } else {
      used.add(i)
      result.push({ position: items[i].position.clone(), axis: items[i].axis.clone() })
    }
  }
  return dedupePoints(result, .18)
}

function inferRawFeatures(text) {
  const refs = type1References(text)
  const studs = []
  const pinOpenings = []
  const axleOpenings = []
  for (const ref of refs) {
    const basename = ref.file.split('/').pop() || ''
    if (/^stud(?:\d|[a-z]|-)*\.dat$/i.test(basename)) {
      studs.push({ position: convertPoint(ref), axis: convertAxis(ref) })
    }
    if (/^(?:peghole|pinhol|pin-hole).*\.dat$/i.test(basename)) {
      pinOpenings.push({ position: convertPoint(ref), axis: convertAxis(ref) })
    }
    if (/^axlehol(?:e|\d|[a-z]|-)*\.dat$/i.test(basename)) {
      axleOpenings.push({ position: convertPoint(ref), axis: convertAxis(ref) })
    }
  }
  return { studs: dedupePoints(studs), pinHoles: pairOpenings(pinOpenings), axleHoles: pairOpenings(axleOpenings) }
}

function connectorArray(raw, offset, height) {
  const result = []
  const add = (type, item, index) => {
    const p = item.position.clone().add(offset)
    const a = item.axis.clone()
    result.push({ id: `ldraw-${type}-${index}`, type, position: [p.x, p.y, p.z], axis: [a.x, a.y, a.z] })
  }
  raw.studs.forEach((item, index) => add(item.position.y + offset.y > height * .55 ? 'stud' : 'tube', item, index))
  raw.pinHoles.forEach((item, index) => add('pin-hole', item, index))
  raw.axleHoles.forEach((item, index) => add('axle-hole', item, index))
  return result
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

function cloneMaterials(root, color) {
  const hex = Number(color)
  root.traverse(object => {
    if (!object.isMesh && !object.isLineSegments) return
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    const cloned = materials.map(material => {
      if (!material) return material
      const copy = material.clone()
      if (copy.name === 'Main_Colour' && copy.color && Number.isFinite(hex)) copy.color.setHex(hex)
      return copy
    })
    object.material = Array.isArray(object.material) ? cloned : cloned[0]
    if (object.isMesh) { object.castShadow = true; object.receiveShadow = true }
  })
}

async function loadPrototype(file) {
  const normalized = normalizeFile(file)
  if (prototypeCache.has(normalized)) return prototypeCache.get(normalized)
  const promise = (async () => {
    const [loader, text] = await Promise.all([getLoader(), fetchLDrawText(normalized)])
    const model = await loader.loadAsync(`${PARTS_ROOT}${normalized.split('/').map(encodeURIComponent).join('/')}`)
    model.rotation.x = Math.PI
    model.scale.setScalar(LDU_TO_STUD)
    model.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(model)
    if (box.isEmpty()) throw new Error(`Empty LDraw geometry: ${normalized}`)
    const center = box.getCenter(new THREE.Vector3())
    const offset = new THREE.Vector3(-center.x, -box.min.y, -center.z)
    model.position.add(offset)
    model.updateMatrixWorld(true)
    const finalBox = new THREE.Box3().setFromObject(model)
    const size = finalBox.getSize(new THREE.Vector3())
    const metadata = parseHeader(text, normalized)
    const rawFeatures = inferRawFeatures(text)
    const connectors = connectorArray(rawFeatures, offset, size.y)
    return { model, metadata: { ...metadata, size: [size.x, size.y, size.z], connectorCount: connectors.length }, connectors }
  })()
  prototypeCache.set(normalized, promise)
  try { return await promise } catch (error) { prototypeCache.delete(normalized); throw error }
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
    const root = await fetchOk(`${LDRAW_SOURCE.apiRoot}/git/trees/${LDRAW_SOURCE.branch}`, { headers: { Accept: 'application/vnd.github+json' } }).then(r => r.json())
    const partsTree = root.tree?.find(item => item.type === 'tree' && item.path === 'parts')
    if (!partsTree?.sha) throw new Error('LDraw parts tree was not found')
    const data = await fetchOk(`${LDRAW_SOURCE.apiRoot}/git/trees/${partsTree.sha}?recursive=1`, { headers: { Accept: 'application/vnd.github+json' } }).then(r => r.json())
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
  const a = Math.max(.5, Number(match[1]) || 1)
  const b = Math.max(.5, Number(match[2]) || 1)
  const h = Math.max(.4, Number(match[3]) || 1.2)
  return [a, h, b]
}

function placeholder(size, color) {
  const [x, y, z] = size
  const group = new THREE.Group()
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(Math.max(.4, x - .08), Math.max(.3, y), Math.max(.4, z - .08)),
    new THREE.MeshStandardMaterial({ color, roughness: .5, transparent: true, opacity: .42 }),
  )
  mesh.position.y = Math.max(.3, y) / 2
  mesh.userData.ldrawPlaceholder = true
  group.add(mesh)
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
    ldraw: { file, code, source: LDRAW_SOURCE.repository, level: 'visual' },
    create(color = def.defaultColor) {
      const root = new THREE.Group()
      root.userData.partId = id
      root.userData.color = color
      root.userData.ldraw = { file, code, status: 'loading' }
      const fallback = placeholder(fallbackSize(def.name), color)
      root.add(fallback)
      void loadPrototype(file).then(({ model, metadata, connectors: inferred }) => {
        root.remove(fallback)
        const visual = model.clone(true)
        cloneMaterials(visual, color)
        visual.traverse(child => {
          child.userData = { ...child.userData, instanceRoot: root, ldrawVisual: true }
          if (child.isMesh) { child.castShadow = true; child.receiveShadow = true }
        })
        root.add(visual)
        connectors.splice(0, connectors.length, ...inferred)
        def.name = metadata.description || def.name
        def.description = `${metadata.description || def.description}${metadata.license ? ` · ${metadata.license}` : ''}`
        def.category = categoryFor(metadata)
        def.tags = [...new Set([...def.tags, ...(metadata.keywords || []), metadata.category].filter(Boolean))]
        def.ldraw = { ...def.ldraw, ...metadata, level: inferred.length ? 'snap' : 'visual' }
        root.userData.ldraw = { ...root.userData.ldraw, status: 'ready', connectorCount: inferred.length }
        window.dispatchEvent(new CustomEvent('bricklab:ldrawloaded', { detail: { id, file, code, connectors: inferred.length } }))
        window.dispatchEvent(new CustomEvent('bricklab:partcatalogchange'))
      }).catch(error => {
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
  const metadata = await getLDrawMetadata(file)
  return registerLDrawPart(metadata)
}

export const BrickLabLDraw = Object.freeze({
  source: LDRAW_SOURCE,
  lduToStud: LDU_TO_STUD,
  getIndex: getLDrawIndex,
  getMetadata: getLDrawMetadata,
  register: registerLDrawPart,
  registerByFile: registerLDrawPartByFile,
})

globalThis.BrickLabLDraw = BrickLabLDraw
