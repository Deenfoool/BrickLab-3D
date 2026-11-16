import * as THREE from 'three'
import { LDrawLoader } from 'three/addons/loaders/LDrawLoader.js'
import { LDrawConditionalLineMaterial } from 'three/addons/materials/LDrawConditionalLineMaterial.js'
import { technic } from '../mechanics/catalog.js?v=axle-length'

export const parts = {
  3700: { ru: 'Кирпич Technic 1×2', en: 'Technic brick 1×2', color: '#bfc5cc', glyph: 'brick' },
  3737: { ru: 'Крестовая ось 10L', en: 'Cross axle 10L', color: '#6b7480', glyph: 'axle' },
  3705: { ru: 'Крестовая ось 4L', en: 'Cross axle 4L', color: '#aeb7c2', glyph: 'axle' },
  3706: { ru: 'Крестовая ось 6L', en: 'Cross axle 6L', color: '#aeb7c2', glyph: 'axle' },
  3707: { ru: 'Крестовая ось 8L', en: 'Cross axle 8L', color: '#aeb7c2', glyph: 'axle' },
  3673: { ru: 'Гладкий штифт', en: 'Frictionless pin', color: '#aeb7c2', glyph: 'pin' },
  2780: { ru: 'Штифт с трением', en: 'Friction pin', color: '#626975', glyph: 'pin' },
  3713: { ru: 'Втулка 1L', en: 'Bush 1L', color: '#e4b047', glyph: 'bush' },
  6538: { ru: 'Соединитель осей', en: 'Axle connector', color: '#aeb7c2', glyph: 'bush' },
  10928: { ru: 'Шестерня 8T', en: '8T gear', color: '#e7ac3c', glyph: 'gear' },
  3648: { ru: 'Шестерня 24T', en: '24T gear', color: '#b6bfca', glyph: 'gear' },
}
export const partOrder = ['3700', '3705', '3706', '3707', '3737', '3673', '2780', '3713', '6538', '10928', '3648']
const fileURL = new URL('../../assets/ldraw/technic.mpd?v=axle-length', import.meta.url)
const material = new THREE.MeshStandardMaterial({ roughness: .47, metalness: .08 })
let palette

export function loadPalette() {
  return palette ??= new Promise((resolve, reject) => {
    new LDrawLoader().setConditionalLineMaterial(LDrawConditionalLineMaterial).load(fileURL.href, group => {
      const models = new Map()
      for (const child of group.children) {
        const design = child.name.toLowerCase().replace(/\.dat$/, '')
        if (!Object.hasOwn(technic, design)) continue
        const meshes = []
        child.updateMatrixWorld(true)
        const inverse = child.matrixWorld.clone().invert()
        child.traverse(node => {
          if (node.isMesh) meshes.push(node.geometry.clone().applyMatrix4(inverse.clone().multiply(node.matrixWorld)))
        })
        const bounds = new THREE.Box3()
        for (const geometry of meshes) {
          geometry.computeBoundingBox()
          bounds.union(geometry.boundingBox)
        }
        if (meshes.length) models.set(design, { meshes, bounds })
      }
      if (models.size !== partOrder.length) reject(Error(`LDraw palette: ${models.size}/${partOrder.length}`))
      else resolve(models)
    }, undefined, reject)
  }).catch(error => {
    palette = undefined
    throw error
  })
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
