import * as THREE from 'three'
import { partMesh, parts, loadPartModel } from './parts.js?v=turntable-parts'
import { loadParts } from './model.js?v=track-builder'
import { expandComponents } from './components.js?v=belt-drive'
import { upgradeInlineEngineFan } from './inline-engine.js'
import { hiddenSceneParts, readSceneLayers } from './scene-layers.js?v=scene-parts'
import { createBeltScene } from './belt-scene.js?v=belt-drive'
import { assembleBelts, promoteLegacyBelts } from '../mechanics/belts.js?v=belt-drive'

const width = 768
const height = 448
const view = new THREE.Vector3(1.35, .92, 1.6).normalize()

function fitCamera(camera, bounds) {
  const size = bounds.getSize(new THREE.Vector3())
  const center = bounds.getCenter(new THREE.Vector3())
  camera.position.copy(center).addScaledVector(view, Math.max(1, size.length()) * 2)
  camera.lookAt(center)
  camera.updateMatrixWorld(true)
  const projection = new THREE.Box3()
  for (const x of [bounds.min.x, bounds.max.x]) {
    for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) {
        projection.expandByPoint(new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse))
      }
    }
  }
  projection.getSize(size)
  const frame = Math.max(1, size.x, size.y * width / height) * .53
  camera.left = -frame
  camera.right = frame
  camera.top = frame * height / width
  camera.bottom = -camera.top
  camera.far = Math.max(10, 1 - projection.min.z)
  camera.updateProjectionMatrix()
}

export function createProjectPreviewRenderer() {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
  renderer.setSize(width, height, false)
  renderer.setClearColor(0, 0)
  const world = new THREE.Scene()
  world.add(new THREE.HemisphereLight(0xe3efff, 0x4c5260, 2.15))
  for (const [color, intensity, position] of [[0xffe5ca, 2.6, [1, 2.7, 1.6]], [0xaacbff, 1.8, [-2, 1.3, -1.5]]]) {
    const light = new THREE.DirectionalLight(color, intensity)
    light.position.fromArray(position)
    world.add(light)
  }
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .01, 100)
  const models = new Map()

  return {
    async render(document, signal) {
      const source = upgradeInlineEngineFan(promoteLegacyBelts(expandComponents(document, parts)))
      const designs = [...new Set(source.parts.map(part => String(part?.design ?? '')))]
        .filter(design => !models.has(design) && Object.hasOwn(parts, design))
      for (let start = 0; start < designs.length; start += 4) {
        signal.throwIfAborted()
        await Promise.allSettled(designs.slice(start, start + 4).map(async design => {
          const model = await loadPartModel(parts[design])
          if (model) models.set(design, model)
        }))
      }
      signal.throwIfAborted()
      const poses = loadParts(source, models)
      const layers = readSceneLayers(source.sceneLayers, new Set(poses.map(part => part.id)))
      const hidden = hiddenSceneParts(layers, poses)
      const visible = poses.filter(part => !hidden.has(part.id))
      if (!visible.length) return null

      const solids = new THREE.Group()
      world.add(solids)
      for (const part of visible) {
        const object = partMesh(models.get(part.design), part.color ?? parts[part.design].color)
        object.position.fromArray(part.position)
        object.quaternion.fromArray(part.rotation)
        object.scale.x = part.mirrored ? -1 : 1
        solids.add(object)
      }
      const byId = new Map(visible.map(part => [part.id, part]))
      const belts = createBeltScene(world, id => byId.get(id), () => {})
      try {
        belts.set(assembleBelts(byId, source.belts).map(({ record }) => record))
        const bounds = new THREE.Box3().setFromObject(solids)
        if (bounds.isEmpty()) return null
        fitCamera(camera, bounds)
        renderer.render(world, camera)
        return await new Promise(resolve => renderer.domElement.toBlob(resolve, 'image/webp', .87))
      } finally {
        belts.dispose()
        for (const object of solids.children) object.userData.finish.dispose()
        world.remove(solids)
      }
    },
    dispose() {
      for (const [design, model] of models) {
        if (parts[design].pack) {
          for (const geometry of model.meshes) geometry.dispose()
        }
      }
      renderer.dispose()
      renderer.forceContextLoss()
    },
  }
}
