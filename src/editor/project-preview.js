import * as THREE from 'three'
import { partMesh, parts, loadPartModel } from './parts.js?v=system-complete'
import { loadParts } from './model.js?v=track-builder'
import { expandComponents } from './components.js?v=belt-drive'
import { upgradeInlineEngineFan } from './inline-engine.js'
import { hiddenSceneParts, readSceneLayers } from './scene-layers.js?v=scene-parts'
import { createBeltScene } from './belt-scene.js?v=belt-drive'
import { assembleBelts, promoteLegacyBelts } from '../mechanics/belts.js?v=belt-drive'

const width = 768
const height = 448
const view = new THREE.Vector3(1.35, .92, 1.6).normalize()

// Soft contact shadow rendered into the transparent model thumbnail. Unlike
// card box-shadows, it follows the model and gives it a grounded appearance.
function makeContactShadow() {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 128
  const context = canvas.getContext('2d')
  const gradient = context.createRadialGradient(64, 64, 4, 64, 64, 62)
  gradient.addColorStop(0, 'rgba(0,0,0,0.64)')
  gradient.addColorStop(.38, 'rgba(0,0,0,0.4)')
  gradient.addColorStop(.76, 'rgba(0,0,0,0.12)')
  gradient.addColorStop(1, 'rgba(0,0,0,0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, 128, 128)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const geometry = new THREE.PlaneGeometry(1, 1)
  const material = new THREE.MeshBasicMaterial({
    map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    toneMapped: false,
  })
  return { geometry, material, texture }
}

function fitCamera(camera, bounds, width, height, view, padding=.53) {
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
  const frame = Math.max(1, size.x, size.y * width / height) * padding
  camera.left = -frame
  camera.right = frame
  camera.top = frame * height / width
  camera.bottom = -camera.top
  camera.far = Math.max(10, 1 - projection.min.z)
  camera.updateProjectionMatrix()
}

export function createProjectPreviewRenderer(options={}) {
  const width=Number.isInteger(options.width)?Math.max(256,Math.min(2048,options.width)):768
  const height=Number.isInteger(options.height)?Math.max(256,Math.min(2048,options.height)):448
  const directionFor=angle=>angle==='front'?new THREE.Vector3(0,.3,1).normalize():angle==='side'?new THREE.Vector3(1,.25,0).normalize():angle==='top'?new THREE.Vector3(.01,1,.01).normalize():angle==='rear'?new THREE.Vector3(-1.35,.92,-1.6).normalize():angle==='left'?new THREE.Vector3(-1,.25,0).normalize():view
  const format=options.format==='png'?'image/png':'image/webp'
  const lightPreset=options.lighting==='cool'?[[0xd5e9ff,2.8,[1,2.7,1.6]],[0xb3caff,1.6,[-2,1.3,-1.5]]]:options.lighting==='warm'?[[0xffcf99,3,[1,2.7,1.6]],[0xffe5ca,1.2,[-2,1.3,-1.5]]]:[[0xffe5ca,2.6,[1,2.7,1.6]],[0xaacbff,1.8,[-2,1.3,-1.5]]]
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
  renderer.setSize(width, height, false)
  renderer.setClearColor(0, 0)
  const world = new THREE.Scene()
  world.add(new THREE.HemisphereLight(0xe3efff, 0x4c5260, 2.15))
  for (const [color, intensity, position] of lightPreset) {
    const light = new THREE.DirectionalLight(color, intensity)
    light.position.fromArray(position)
    world.add(light)
  }
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .01, 100)
  const contactShadow = makeContactShadow()
  const models = new Map()

  return {
    async render(document, signal, shot={}) {
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
      if(options.requireAll===true&&poses.length!==source.parts.length)throw Error('incomplete_model_geometry')
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
        fitCamera(camera, bounds, width, height, directionFor(shot.angle??options.angle),options.framing==='wide'?.63:options.framing==='close'?.51:.53)
        const size = bounds.getSize(new THREE.Vector3())
        const center = bounds.getCenter(new THREE.Vector3())
        const shadow = new THREE.Mesh(contactShadow.geometry, contactShadow.material)
        shadow.rotation.x = -Math.PI / 2
        shadow.scale.set(Math.max(size.x, size.z, .5) * 1.24, Math.max(size.z, size.x * .55, .5) * 1.16, 1)
        shadow.position.set(center.x, bounds.min.y - Math.max(size.y, .5) * .035, center.z)
        shadow.renderOrder = -1
        shadow.name = 'preview-contact-shadow'
        if(options.shadow!==false)world.add(shadow)
        try {
          renderer.render(world, camera)
          return await new Promise(resolve => renderer.domElement.toBlob(resolve, format, .87))
        } finally {
          world.remove(shadow)
        }
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
      contactShadow.geometry.dispose()
      contactShadow.material.dispose()
      contactShadow.texture.dispose()
      renderer.dispose()
    },
  }
}
