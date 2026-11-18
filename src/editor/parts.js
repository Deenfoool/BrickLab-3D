import * as THREE from 'three'
import { LDrawLoader } from 'three/addons/loaders/LDrawLoader.js'
import { LDrawConditionalLineMaterial } from 'three/addons/materials/LDrawConditionalLineMaterial.js'
import { curated, partOrder, parts, sections } from './parts-data.js?v=catalog-page'

export { parts, sections }

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

export function extractModel(group) {
  const meshes = []
  const bounds = new THREE.Box3()
  group.updateMatrixWorld(true)
  const inverse = group.matrixWorld.clone().invert()
  group.traverse(node => {
    if (!node.isMesh) return
    const transform = inverse.clone().multiply(node.matrixWorld)
    const geometry = node.geometry.clone().applyMatrix4(transform)
    // Once a reflection is baked, the renderer cannot correct winding using object scale.
    if (transform.determinant() < 0) {
      if (!geometry.index) geometry.setIndex(Array.from({ length: geometry.attributes.position.count }, (_, i) => i))
      const indices = geometry.index.array
      for (let i = 0; i < indices.length; i += 3) {
        const first = indices[i]
        indices[i] = indices[i + 2]
        indices[i + 2] = first
      }
      geometry.index.needsUpdate = true
    }
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
