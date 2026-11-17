import * as THREE from 'three'
import { LDrawLoader } from 'three/addons/loaders/LDrawLoader.js'
import { LDrawConditionalLineMaterial } from 'three/addons/materials/LDrawConditionalLineMaterial.js'
import library from '../../catalog/parts-library.json?v=parts-library' with { type: 'json' }
import { sectionsFor } from './library-data.js?v=parts-library'
import buggyParts from '../../catalog/dune-buggy-parts.json?v=8845' with { type: 'json' }
import engineParts from '../../catalog/inline-engine-parts.json' with { type: 'json' }

const curated = {
  32316: { ru: 'Балка 5L', en: 'Beam 5L', color: '#8094ac' },
  32278: { ru: 'Балка 15L', en: 'Beam 15L', color: '#8094ac' },
  43093: { ru: 'Штифт-ось 2L с трением', en: 'Friction axle pin 2L', color: '#626975' },
  6558: { ru: 'Длинный штифт 3L с трением', en: 'Long friction pin 3L', color: '#626975' },
  11214: { ru: 'Длинный штифт-ось 3L', en: 'Long axle pin 3L', color: '#626975' },
  30374: { ru: 'Стержень 4L', en: 'Bar 4L', color: '#aeb7c2' },
  3700: { ru: 'Кирпич Technic 1×2', en: 'Technic brick 1×2', color: '#bfc5cc' },
  3737: { ru: 'Крестовая ось 10L', en: 'Cross axle 10L', color: '#6b7480' },
  3705: { ru: 'Крестовая ось 4L', en: 'Cross axle 4L', color: '#aeb7c2' },
  3706: { ru: 'Крестовая ось 6L', en: 'Cross axle 6L', color: '#aeb7c2' },
  3707: { ru: 'Крестовая ось 8L', en: 'Cross axle 8L', color: '#aeb7c2' },
  3673: { ru: 'Гладкий штифт', en: 'Frictionless pin', color: '#aeb7c2' },
  2780: { ru: 'Штифт с трением', en: 'Friction pin', color: '#626975' },
  41679: { ru: 'Балка шарнира с фиксацией', en: 'Detent hinge arm', color: '#8094ac' },
  41680: { ru: 'Кольцо шарнира с фиксацией', en: 'Detent hinge ring', color: '#626975' },
  3713: { ru: 'Втулка 1L', en: 'Bush 1L', color: '#e4b047' },
  6538: { ru: 'Соединитель осей', en: 'Axle connector', color: '#aeb7c2' },
  10928: { ru: 'Шестерня 8T', en: '8T gear', color: '#e7ac3c' },
  3648: { ru: 'Шестерня 24T', en: '24T gear', color: '#b6bfca' },
}
const partOrder = ['3700', '3705', '3706', '3707', '3737', '3673', '2780', '3713', '6538', '10928', '3648', '41679', '41680', '30374', '32316', '32278', '43093', '6558', '11214']
export const sections = sectionsFor(library, curated, partOrder)
export const parts = Object.assign(Object.create(null), ...sections.map(section =>
  Object.fromEntries(section.parts.map(part => [part.design, part]))))
// Supplementary designs needed to edit the complete downloadable examples.
for (const [assetPath, registry, revision] of [
  ['dune-buggy', buggyParts, '8845'],
  ['inline-engine', engineParts, '858'],
]) {
  for (const [design, { en, ru }] of Object.entries(registry)) {
    if (parts[design]) continue
    parts[design] = { design, en, ru, assetPath, pack: 'common', revision, color: '#9ba3ad' }
  }
}
const technicSection = sections.find(section => section.id === 'technic')
for (const design of ['4254', '4255', '8845-spring']) {
  if (technicSection.parts.some(part => part.design === design)) continue
  parts[design].group = 'joints'
  technicSection.parts.push(parts[design])
}
const packCache = new Map()
const filesRoot = new URL('../../assets/ldraw/', import.meta.url)

const fileURL = new URL('../../assets/ldraw/technic.mpd?v=connector-coverage', import.meta.url)
const material = new THREE.MeshStandardMaterial({ roughness: .47, metalness: .08, fog: false })
let palette

export function loadCoreModels() {
  return palette ??= new Promise((resolve, reject) => {
    newLoader().load(fileURL.href, group => {
      const models = new Map()
      for (const child of group.children) {
        const design = child.name.toLowerCase().replace(/\.dat$/, '')
        if (!Object.hasOwn(curated, design)) continue
        const model = extractModel(child)
        if (model) models.set(design, model)
      }
      if (models.size !== partOrder.length) reject(Error(`LDraw palette: ${models.size}/${partOrder.length}`))
      else resolve(models)
    }, undefined, reject)
  }).catch(error => {
    palette = undefined
    throw error
  })
}

function newLoader() {
  return new LDrawLoader().setConditionalLineMaterial(LDrawConditionalLineMaterial)
}

function extractModel(group) {
  const meshes = []
  const bounds = new THREE.Box3()
  group.updateMatrixWorld(true)
  const inverse = group.matrixWorld.clone().invert()
  group.traverse(node => {
    if (!node.isMesh) return
    const geometry = node.geometry.clone().applyMatrix4(inverse.clone().multiply(node.matrixWorld))
    geometry.computeBoundingBox()
    bounds.union(geometry.boundingBox)
    meshes.push(geometry)
  })
  if (meshes.length && !bounds.isEmpty()) return { meshes, bounds }
}

function getPack(assetPath, pack, revision) {
  const key = `${assetPath}/${pack}.json.gz?v=${revision}`
  let request = packCache.get(key)
  if (request) packCache.delete(key)
  else {
    request = (async () => {
      const response = await fetch(new URL(key, filesRoot))
      if (!response.ok) throw new Error(`LDraw pack ${key}: HTTP ${response.status}`)
      const bytes = new Uint8Array(await response.arrayBuffer())
      if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return JSON.parse(new TextDecoder().decode(bytes))
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))
      return new Response(stream).json()
    })().catch(error => {
      if (packCache.get(key) === request) packCache.delete(key)
      throw error
    })
  }
  packCache.set(key, request)
  if (packCache.size > 8) packCache.delete(packCache.keys().next().value)
  return request
}

export async function loadPartModel(part) {
  if (!part.pack) return (await loadCoreModels()).get(part.design)
  const commonRequest = getPack(part.assetPath, 'common', part.revision)
  const [common, pack] = await Promise.all([commonRequest,
    part.pack === 'common' ? commonRequest : getPack(part.assetPath, part.pack, part.revision)])
  const fileMap = Object.create(null)
  const modelFile = `${part.design}.dat`
  const files = new Set()
  const embedded = []
  const pending = [modelFile]
  while (pending.length) {
    const name = pending.pop()
    if (files.has(name)) continue
    files.add(name)
    const text = pack[name] ?? common[name]
    if (!text) throw new Error(`LDraw file missing from pack: ${name}`)
    embedded.push(`0 FILE ${name}\n${text}\n`)
    for (const line of text.split('\n')) {
      const match = /^\s*1(?:\s+\S+){13}\s+(.+?)\s*$/.exec(line)
      if (!match) continue
      const ref = match[1].replaceAll('\\', '/')
      const lower = ref.toLowerCase()
      const resolved = lower.startsWith('s/') ? `parts/${lower}` : lower.startsWith('48/') ? `p/${lower}` : lower
      fileMap[ref] = resolved
      if (!files.has(resolved)) pending.push(resolved)
    }
  }
  const loader = newLoader().setFileMap(fileMap)
  loader.addDefaultMaterials()
  const content = `0 FILE bricklab-part.ldr\n1 16 0 0 0 1 0 0 0 1 0 0 0 1 ${modelFile}\n${embedded.join('')}`
  const group = await new Promise((resolve, reject) => loader.parse(content, resolve, reject))
  const model = extractModel(group)
  if (!model) throw new Error(`LDraw part has no geometry: ${part.design}`)
  return model
}

export function partMesh(model, color, ghost = false) {
  const group = new THREE.Group()
  const finish = material.clone()
  finish.color.set(color)
  if (ghost) {
    finish.transparent = true
    finish.opacity = .46
    finish.depthWrite = false
  }
  for (const mesh of model.meshes) group.add(new THREE.Mesh(mesh, finish))
  group.userData.finish = finish
  return group
}
