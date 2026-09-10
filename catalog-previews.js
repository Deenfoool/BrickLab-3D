import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { PARTS, findPart } from './parts.js'

const PREVIEW_SIZE = { width: 240, height: 158 }
const cache = new Map()
let renderer = null
let scene = null
let camera = null
let lightRig = null
let environmentTexture = null
let queue = []
let queued = new Set()
let running = false

function ensureRenderer() {
  if (renderer) return true
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
      powerPreference: 'low-power',
    })
    renderer.setPixelRatio(Math.min(1.7, window.devicePixelRatio || 1.4))
    renderer.setSize(PREVIEW_SIZE.width, PREVIEW_SIZE.height, false)
    renderer.setClearColor(0x000000, 0)
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.02
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.physicallyCorrectLights = true

    scene = new THREE.Scene()
    scene.userData.bricklabPreview = true
    camera = new THREE.PerspectiveCamera(30, PREVIEW_SIZE.width / PREVIEW_SIZE.height, 0.01, 100)

    try {
      const pmrem = new THREE.PMREMGenerator(renderer)
      const room = new RoomEnvironment()
      environmentTexture = pmrem.fromScene(room, 0.04).texture
      scene.environment = environmentTexture
      scene.environmentIntensity = 0.95
      room.dispose?.()
      pmrem.dispose()
    } catch (error) {
      console.warn('BrickLab preview environment unavailable', error)
    }

    lightRig = new THREE.Group()
    const hemi = new THREE.HemisphereLight(0xf7f9ff, 0x252a30, 1.18)
    const key = new THREE.DirectionalLight(0xfff8ef, 2.45)
    key.position.set(4.5, 7.5, 6)
    const fill = new THREE.DirectionalLight(0xb2c7ff, 0.72)
    fill.position.set(-5, 3.5, -4)
    const rim = new THREE.DirectionalLight(0xffd7b1, 0.52)
    rim.position.set(4, 3, -5)
    lightRig.add(hemi, key, fill, rim)
    scene.add(lightRig)
    return true
  } catch (error) {
    console.warn('BrickLab catalog previews unavailable', error)
    renderer = null
    return false
  }
}

function disposeObject(object) {
  object.traverse(child => {
    if (!child.geometry?.userData?.bricklabSharedVisual) child.geometry?.dispose?.()
    if (Array.isArray(child.material)) {
      child.material.forEach(item => {
        if (!item?.userData?.bricklabSharedVisual) item?.dispose?.()
      })
    } else if (!child.material?.userData?.bricklabSharedVisual) {
      child.material?.dispose?.()
    }
  })
}

function renderPreview(partId) {
  if (cache.has(partId)) return cache.get(partId)
  if (!ensureRenderer()) return null

  const definition = findPart(partId)
  if (!definition?.create) return null
  // LDraw create() is synchronous to the editor, but the remote geometry is not.
  // Never snapshot the temporary placeholder. runtime-v3 flips ready only after the
  // real prototype and connector analysis have completed.
  if (definition.ldraw && !definition.ldraw.ready) return null

  let object = null
  let wrapper = null
  let shadow = null
  try {
    object = definition.create(definition.defaultColor)
    wrapper = new THREE.Group()
    wrapper.add(object)
    scene.add(wrapper)

    object.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(object)
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    const maxDimension = Math.max(size.x, size.y, size.z, 0.8)

    object.position.sub(center)
    wrapper.rotation.set(-0.24, -0.72, 0.025)
    wrapper.updateMatrixWorld(true)

    const framed = new THREE.Box3().setFromObject(wrapper)
    const framedCenter = framed.getCenter(new THREE.Vector3())
    const framedSize = framed.getSize(new THREE.Vector3())
    const framedMax = Math.max(framedSize.x, framedSize.y, framedSize.z, maxDimension)

    wrapper.position.sub(framedCenter)
    wrapper.updateMatrixWorld(true)
    const finalBounds = new THREE.Box3().setFromObject(wrapper)
    const finalSize = finalBounds.getSize(new THREE.Vector3())

    const shadowGeometry = new THREE.CircleGeometry(1, 64)
    const shadowMaterial = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
    })
    shadow = new THREE.Mesh(shadowGeometry, shadowMaterial)
    shadow.rotation.x = -Math.PI / 2
    shadow.scale.set(Math.max(0.45, finalSize.x * 0.44), Math.max(0.35, finalSize.z * 0.44), 1)
    shadow.position.set(0, finalBounds.min.y - 0.028, 0)
    scene.add(shadow)

    camera.position.set(framedMax * 1.34, framedMax * 0.96, framedMax * 2.18)
    camera.near = Math.max(0.01, framedMax / 100)
    camera.far = Math.max(30, framedMax * 12)
    camera.lookAt(0, 0.025, 0)
    camera.updateProjectionMatrix()

    renderer.render(scene, camera)
    const dataUrl = renderer.domElement.toDataURL('image/png')
    cache.set(partId, dataUrl)
    return dataUrl
  } catch (error) {
    console.warn(`BrickLab could not render preview for ${partId}`, error)
    return null
  } finally {
    if (wrapper) scene.remove(wrapper)
    if (shadow) {
      scene.remove(shadow)
      shadow.geometry?.dispose?.()
      shadow.material?.dispose?.()
    }
    if (object) disposeObject(object)
  }
}

function enqueue(partId) {
  const definition = findPart(partId)
  if (!definition || (definition.ldraw && !definition.ldraw.ready)) return
  if (queued.has(partId) || cache.has(partId)) return
  queued.add(partId)
  queue.push(partId)
  scheduleQueue()
}

function applyPreviewToCard(card) {
  const partId = card.dataset.part
  if (!partId) return

  const icon = card.querySelector('.part-icon')
  if (!icon || icon.dataset.previewPart === partId) return

  const cached = cache.get(partId)
  if (cached) {
    icon.dataset.previewPart = partId
    icon.classList.add('has-preview')
    icon.innerHTML = `<img src="${cached}" alt="" draggable="false" />`
    return
  }

  enqueue(partId)
}

function refreshVisibleCards() {
  document.querySelectorAll('.part-card[data-part]').forEach(applyPreviewToCard)
}

function scheduleQueue() {
  if (running) return
  running = true

  const runOne = deadline => {
    const hasBudget = !deadline || deadline.timeRemaining() > 4 || deadline.didTimeout
    if (queue.length && hasBudget) {
      const partId = queue.shift()
      queued.delete(partId)
      renderPreview(partId)
      document.querySelectorAll(`.part-card[data-part="${CSS.escape(partId)}"]`).forEach(applyPreviewToCard)
    }

    if (queue.length) {
      if ('requestIdleCallback' in window) requestIdleCallback(runOne, { timeout: 120 })
      else setTimeout(() => runOne(null), 20)
    } else {
      running = false
    }
  }

  if ('requestIdleCallback' in window) requestIdleCallback(runOne, { timeout: 120 })
  else setTimeout(() => runOne(null), 20)
}

function refreshLDrawPreview(partId) {
  if (!partId) return
  cache.delete(partId)
  queued.delete(partId)
  queue = queue.filter(id => id !== partId)
  document.querySelectorAll(`.part-card[data-part="${CSS.escape(partId)}"]`).forEach(card => {
    const icon = card.querySelector('.part-icon')
    if (icon) {
      delete icon.dataset.previewPart
      icon.classList.remove('has-preview')
    }
    applyPreviewToCard(card)
  })
}

function installCatalogPreviews() {
  if (!document.getElementById('bricklabPreviewStyles')) {
    const style = document.createElement('style')
    style.id = 'bricklabPreviewStyles'
    style.textContent = `
      .part-icon.has-preview{padding:0!important;overflow:hidden;background:radial-gradient(circle at 48% 28%,#3b454e 0,#252c32 54%,#15191d 100%)!important}
      .part-icon.has-preview img{display:block;width:100%;height:100%;object-fit:contain;pointer-events:none;user-select:none;filter:drop-shadow(0 7px 8px rgba(0,0,0,.4));image-rendering:auto}
      .parts-panel.catalog-grid .part-icon.has-preview{height:88px;background:radial-gradient(circle at 48% 30%,#3d4851 0,#262e34 52%,#161a1e 100%)!important}
      .parts-panel.catalog-grid .part-icon.has-preview img{transform:scale(1.06)}
      .parts-panel.catalog-grid .part-card{min-height:138px}
      @media(max-width:800px){.parts-panel.catalog-grid .part-icon.has-preview{height:40px}.parts-panel.catalog-grid .part-card{min-height:auto}}
    `
    document.head.append(style)
  }

  const list = document.getElementById('partsList')
  if (!list) {
    requestAnimationFrame(installCatalogPreviews)
    return
  }

  refreshVisibleCards()
  new MutationObserver(refreshVisibleCards).observe(list, { childList: true, subtree: true })

  for (const part of PARTS) enqueue(part.id)
}

window.addEventListener('bricklab:ldrawloaded', event => refreshLDrawPreview(event.detail?.id))
installCatalogPreviews()
