import * as THREE from 'three'
import { LDrawLoader } from 'three/addons/loaders/LDrawLoader.js'
import { LDrawConditionalLineMaterial } from 'three/addons/materials/LDrawConditionalLineMaterial.js'
import { linearActuators, actuatorOffset, actuatorPhase } from '../mechanics/actuators.js'
import { curated, partOrder, parts, sections } from './parts-data.js?v=system-complete'

export { parts, sections }

const packCache = new Map()
const filesRoot = new URL('../../assets/ldraw/', import.meta.url)

const fileURL = new URL('../../assets/ldraw/technic.mpd?v=connector-coverage', import.meta.url)
const material = new THREE.MeshStandardMaterial({ roughness: .47, metalness: .08, fog: false })
let palette
let fallbackMaterials

export function loadCoreModels() {
  return palette ??= new Promise((resolve, reject) => {
    newLoader().then(loader => loader.load(fileURL.href, group => {
      const models = new Map()
      for (const child of group.children) {
        const design = child.name.toLowerCase().replace(/\.dat$/, '')
        if (!Object.hasOwn(curated, design)) continue
        const model = extractModel(child)
        if (model) models.set(design, model)
      }
      if (models.size !== partOrder.length) reject(Error(`LDraw palette: ${models.size}/${partOrder.length}`))
      else resolve(models)
    }, undefined, reject), reject)
  }).catch(error => {
    palette = undefined
    throw error
  })
}

async function newLoader() {
  const loader = new LDrawLoader().setConditionalLineMaterial(LDrawConditionalLineMaterial)
  fallbackMaterials ??= fetch(new URL('material-fallbacks.ldr?v=full-palette', filesRoot)).then(response => {
    if (!response.ok) throw Error(`LDraw materials: HTTP ${response.status}`)
    return response.text()
  }).catch(error => {
    fallbackMaterials = undefined
    throw error
  })
  loader.parseMaterials(await fallbackMaterials)
  return loader
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

export async function loadPartModel(part, { smoothNormals = part.group !== 'baseplates' } = {}) {
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
  const loader = (await newLoader()).setFileMap(fileMap)
  // Repeated baseplate studs make edge smoothing expensive; flat faces keep their normals.
  loader.smoothNormals = smoothNormals
  loader.addDefaultMaterials()
  const preserveColors = !!linearActuators[part.design] || ['99499', '99499c01', '10089c01', '10095', '58124c01', '23816a',
    '58119', '64228c01', '84599', '22127', '85824'].includes(part.design)
  const system = part.assetPath === 'system'
  const palette = system ? common['ldconfig.ldr'].split('\n').filter(line => line.startsWith('0 !COLOUR ')).join('\n')
    : preserveColors ? Object.entries(electricColors).map(([code, color]) =>
    `0 !COLOUR Electric_${code} CODE ${code} VALUE ${color} EDGE #333333`).join('\n') : ''
  if (linearActuators[part.design]) {
    const refs=(pack[modelFile]??common[modelFile]).split('\n').filter(line=>/^\s*1\s/.test(line))
    const rotor=refs.find(line=>/\s47157\.dat\s*$/i.test(line)),rod=refs.find(line=>/\s62274c01\.dat\s*$/i.test(line))
    if (refs.length!==3||!rotor||!rod) throw Error(`Unexpected LDraw actuator structure: ${part.design}`)
    const model={meshes:[],bounds:new THREE.Box3()}
    for (const [section,line] of [['housing',refs.find(line=>line!==rotor&&line!==rod)],['input',rotor],['rod',rod]]) {
      const content=`0 FILE bricklab-actuator-${section}.ldr\n${palette}\n${line}\n${embedded.join('')}`
      const sectionLoader=(await newLoader()).setFileMap(fileMap);sectionLoader.smoothNormals=smoothNormals;sectionLoader.addDefaultMaterials()
      const group=await new Promise((resolve,reject)=>sectionLoader.parse(content,resolve,reject))
      const segment=extractModel(group,preserveColors,system)
      if(!segment)throw Error(`Missing actuator ${section}: ${part.design}`)
      for(const mesh of segment.meshes)mesh.userData.actuatorSection=section
      model.meshes.push(...segment.meshes);model.bounds.union(segment.bounds)
    }
    return model
  }
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

// Actuator parts retain their original mesh positions; only the screw input and rod move in preview.
export function previewActuatorMesh(group,part){
  const rod=actuatorOffset(part)+(part.previewActuatorRod??0),phase=actuatorPhase(part)+(part.previewActuatorInput??0)
  group.userData.actuatorRodOffset=rod
  for(const mesh of group.children){
    const section=mesh.geometry?.userData?.actuatorSection
    if(section==='rod')mesh.position.z=rod
    if(section==='input')mesh.rotation.z=phase
  }
}
