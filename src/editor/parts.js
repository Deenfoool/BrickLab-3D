import * as THREE from 'three'
import { LDrawLoader } from 'three/addons/loaders/LDrawLoader.js'
import { LDrawConditionalLineMaterial } from 'three/addons/materials/LDrawConditionalLineMaterial.js'
import { curated, partOrder, parts, sections } from './parts-data.js?v=system-slopes'

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

export function extractModel(group, preserveColors = false, preserveMaterials = false) {
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
    if (preserveColors || preserveMaterials) {
      const materials = Array.isArray(node.material) ? node.material : [node.material]
      if (preserveMaterials) {
        geometry.userData.finishes = materials.map(mat => String(mat.userData.code) === '16' ? null : mat)
      } else {
        geometry.userData.codes = materials.map(mat => mat.userData.code)
      }
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
  const commonPack = part.commonPack ?? 'common'
  const commonRequest = getPack(part.assetPath, commonPack, part.revision)
  const [common, pack] = await Promise.all([commonRequest,
    part.pack === commonPack ? commonRequest : getPack(part.assetPath, part.pack, part.revision)])
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
  const preserveColors = ['99499', '99499c01', '10089c01', '10095', '58124c01', '23816a',
    '58119', '64228c01', '84599', '22127', '85824'].includes(part.design)
  const system = part.assetPath === 'system'
  const palette = system ? common['ldconfig.ldr'].split('\n').filter(line => line.startsWith('0 !COLOUR ')).join('\n')
    : preserveColors ? Object.entries(electricColors).map(([code, color]) =>
    `0 !COLOUR Electric_${code} CODE ${code} VALUE ${color} EDGE #333333`).join('\n') : ''
  const content = `0 FILE bricklab-part.ldr\n${palette}\n1 16 0 0 0 1 0 0 0 1 0 0 0 1 ${modelFile}\n${embedded.join('')}`
  const group = await new Promise((resolve, reject) => loader.parse(content, resolve, reject))
  const model = extractModel(group, preserveColors, system)
  if (!model) throw new Error(`LDraw part has no geometry: ${part.design}`)
  return model
}

const electricColors = { 0: '#202124', 1: '#16509c', 4: '#ba3028', 7: '#a6a7a1', 14: '#f3c52b',
  25: '#ed861d', 34: '#55a353', 334: '#d5ae62', 47: '#c4c7c4', 71: '#aaaead', 72: '#60615e', 79: '#777974', 256: '#262626',
  494: '#acada7', 383: '#aaaead' }
const fixedFinishes = new Map(Object.entries(electricColors).map(([code, color]) =>
  [code, new THREE.MeshStandardMaterial({ color, roughness: .52 })]))

export function partMesh(model, color, ghost = false) {
  const group = new THREE.Group()
  const finish = material.clone()
  finish.color.set(color)
  if (ghost) {
    finish.transparent = true
    finish.opacity = .46
    finish.depthWrite = false
  }
  for (const mesh of model.meshes) {
    const colors = !ghost && (mesh.userData.finishes?.map(material => material ?? finish) ??
      mesh.userData.codes?.map(code => fixedFinishes.get(String(code)) ?? finish))
    group.add(new THREE.Mesh(mesh, colors ? (colors.length === 1 ? colors[0] : colors) : finish))
  }
  group.userData.finish = finish
  return group
}
