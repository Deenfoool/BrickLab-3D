import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'

const originalRender = THREE.WebGLRenderer.prototype.render

function configureRenderer(renderer) {
  if (renderer.__bricklabQualityConfigured) return
  renderer.__bricklabQualityConfigured = true
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.02
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.physicallyCorrectLights = true

  try {
    const pmrem = new THREE.PMREMGenerator(renderer)
    const room = new RoomEnvironment()
    renderer.__bricklabEnvironmentTexture = pmrem.fromScene(room, 0.04).texture
    room.dispose?.()
    pmrem.dispose()
  } catch (error) {
    console.warn('BrickLab studio environment unavailable', error)
  }
}

function configureScene(scene, renderer) {
  if (!scene || scene.userData?.bricklabPreview || scene.userData?.bricklabQualityConfigured) return
  scene.userData.bricklabQualityConfigured = true

  scene.background = new THREE.Color(0x14171a)
  if (renderer.__bricklabEnvironmentTexture) {
    scene.environment = renderer.__bricklabEnvironmentTexture
    scene.environmentIntensity = 0.92
  }

  if (scene.fog) {
    scene.fog.color.set(0x14171a)
    scene.fog.near = 52
    scene.fog.far = 118
  }

  const hemisphere = scene.children.find(child => child.isHemisphereLight)
  if (hemisphere) {
    hemisphere.intensity = 1.16
    hemisphere.color.set(0xf1f5ff)
    hemisphere.groundColor.set(0x262c32)
  }

  const sun = scene.children.find(child => child.isDirectionalLight && child.castShadow)
  if (sun) {
    sun.intensity = 2.05
    sun.color.set(0xfff7ec)
    sun.shadow.bias = -0.00022
    sun.shadow.normalBias = 0.018
    sun.shadow.radius = 2.4
    sun.shadow.mapSize.set(2048, 2048)
    if (sun.shadow.camera) {
      sun.shadow.camera.left = -28
      sun.shadow.camera.right = 28
      sun.shadow.camera.top = 28
      sun.shadow.camera.bottom = -28
      sun.shadow.camera.near = 0.5
      sun.shadow.camera.far = 90
      sun.shadow.camera.updateProjectionMatrix?.()
    }
  }

  const existingFill = scene.getObjectByName('BrickLab Fill')
  if (!existingFill) {
    const fill = new THREE.DirectionalLight(0xb7cbff, 0.55)
    fill.name = 'BrickLab Fill'
    fill.position.set(-10, 9, -11)
    scene.add(fill)
  }

  const existingRim = scene.getObjectByName('BrickLab Rim')
  if (!existingRim) {
    const rim = new THREE.DirectionalLight(0xffd7af, 0.36)
    rim.name = 'BrickLab Rim'
    rim.position.set(8, 7, -12)
    scene.add(rim)
  }

  const ground = scene.children.find(child =>
    child.isMesh &&
    child.geometry?.type === 'PlaneGeometry' &&
    Math.abs(Math.abs(child.rotation.x) - Math.PI / 2) < 0.05
  )
  if (ground?.material) {
    ground.material.color?.set?.(0x1d2125)
    ground.material.roughness = 0.9
    ground.material.metalness = 0
    ground.material.envMapIntensity = 0.35
    ground.material.needsUpdate = true
  }

  const grid = scene.children.find(child => child.type === 'GridHelper')
  if (grid?.material) {
    const materials = Array.isArray(grid.material) ? grid.material : [grid.material]
    for (const item of materials) {
      item.transparent = true
      item.opacity = 0.32
      item.depthWrite = false
    }
  }
}

THREE.WebGLRenderer.prototype.render = function bricklabQualityRender(scene, camera) {
  configureRenderer(this)
  configureScene(scene, this)
  return originalRender.call(this, scene, camera)
}
