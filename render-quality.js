import * as THREE from 'three'

const originalRender = THREE.WebGLRenderer.prototype.render

function configureRenderer(renderer) {
  if (renderer.__bricklabQualityConfigured) return
  renderer.__bricklabQualityConfigured = true
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.08
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
}

function configureScene(scene) {
  if (!scene || scene.userData?.bricklabPreview || scene.userData?.bricklabQualityConfigured) return
  scene.userData.bricklabQualityConfigured = true

  scene.background = new THREE.Color(0x14171a)
  if (scene.fog) {
    scene.fog.color.set(0x14171a)
    scene.fog.near = 52
    scene.fog.far = 118
  }

  const hemisphere = scene.children.find(child => child.isHemisphereLight)
  if (hemisphere) {
    hemisphere.intensity = 1.5
    hemisphere.color.set(0xeaf1ff)
    hemisphere.groundColor.set(0x252a30)
  }

  const sun = scene.children.find(child => child.isDirectionalLight && child.castShadow)
  if (sun) {
    sun.intensity = 2.25
    sun.color.set(0xfff8ee)
    sun.shadow.bias = -0.0003
    sun.shadow.normalBias = 0.025
    sun.shadow.radius = 2
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

  const fill = new THREE.DirectionalLight(0x9ebcff, 0.72)
  fill.name = 'BrickLab Fill'
  fill.position.set(-10, 9, -11)
  scene.add(fill)

  const rim = new THREE.DirectionalLight(0xffd8ad, 0.42)
  rim.name = 'BrickLab Rim'
  rim.position.set(8, 7, -12)
  scene.add(rim)

  const ground = scene.children.find(child =>
    child.isMesh &&
    child.geometry?.type === 'PlaneGeometry' &&
    Math.abs(Math.abs(child.rotation.x) - Math.PI / 2) < 0.05
  )
  if (ground?.material?.color) {
    ground.material.color.set(0x1d2125)
    ground.material.roughness = 0.94
  }

  const grid = scene.children.find(child => child.type === 'GridHelper')
  if (grid?.material) {
    const materials = Array.isArray(grid.material) ? grid.material : [grid.material]
    for (const item of materials) {
      item.transparent = true
      item.opacity = 0.38
      item.depthWrite = false
    }
  }
}

THREE.WebGLRenderer.prototype.render = function bricklabQualityRender(scene, camera) {
  configureRenderer(this)
  configureScene(scene)
  return originalRender.call(this, scene, camera)
}
