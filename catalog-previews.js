import * as THREE from 'three'
import { PARTS, findPart } from './parts.js'

const PREVIEW_SIZE = { width: 180, height: 120 }
const cache = new Map()
let renderer = null
let scene = null
let camera = null
let lightRig = null
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
    renderer.setPixelRatio(1)
    renderer.setSize(PREVIEW_SIZE.width, PREVIEW_SIZE.height, false)
    renderer.setClearColor(0x000000, 0)
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    renderer.outputColorSpace = THREE.SRGBColorSpace

    scene = new THREE.Scene()
    scene.userData.bricklabPreview = true
    camera = new THREE.PerspectiveCamera(32, PREVIEW_SIZE.width / PREVIEW_SIZE.height, 0.01, 100)

    lightRig = new THREE.Group()
    const hemi = new THREE.HemisphereLight(0xffffff, 0x31363a, 1.8)
    const key = new THREE.DirectionalLight(0xffffff, 3.1)
    key.position.set(4, 7, 6)
    const fill = new THREE.DirectionalLight(0x9ebcff, 1.15)
    fill.position.set(-5, 3, -4)
    const rim = new THREE.DirectionalLight(0xffd9b5, 0.8)
    rim.position.set(4, 2, -5)
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
    child.geometry?.dispose?.()
    if (Array.isArray(child.material)) child.material.forEach(item => item?.dispose?.())
    else child.material?.dispose?.()
  })
}

function renderPreview(partId) {
  if (cache.has(partId)) return cache.get(partId)
  if (!ensureRenderer()) return null

  const definition = findPart(partId)
  if (!definition?.create) return null

  let object = null
  let wrapper = null
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
    wrapper.rotation.set(-0.22, -0.66, 0)
    wrapper.updateMatrixWorld(true)

    const framed = new THREE.Box3().setFromObject(wrapper)
    const framedCenter = framed.getCenter(new THREE.Vector3())
    const framedSize = framed.getSize(new THREE.Vector3())
    const framedMax = Math.max(framedSize.x, framedSize.y, framedSize.z, maxDimension)

    wrapper.position.sub(framedCenter)
    camera.position.set(framedMax * 1.35, framedMax * 0.95, framedMax * 2.25)
    camera.near = Math.max(0.01, framedMax / 100)
    camera.far = Math.max(30, framedMax * 12)
    camera.lookAt(0, 0, 0)
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
    if (object) disposeObject(object)
  }
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

  if (!queued.has(partId)) {
    queued.add(partId)
    queue.push(partId)
    scheduleQueue()
  }
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

function installCatalogPreviews() {
  if (!document.getElementById('bricklabPreviewStyles')) {
    const style = document.createElement('style')
    style.id = 'bricklabPreviewStyles'
    style.textContent = `
      .part-icon.has-preview{padding:0!important;overflow:hidden;background:radial-gradient(circle at 50% 35%,#30373d 0,#20252a 58%,#171b1f 100%)!important}
      .part-icon.has-preview img{display:block;width:100%;height:100%;object-fit:contain;pointer-events:none;user-select:none;filter:drop-shadow(0 5px 5px rgba(0,0,0,.32))}
      .parts-panel.catalog-grid .part-icon.has-preview{height:72px;background:radial-gradient(circle at 50% 38%,#343b42 0,#22282d 54%,#181c20 100%)!important}
      .parts-panel.catalog-grid .part-icon.has-preview img{transform:scale(1.08)}
      @media(max-width:800px){.parts-panel.catalog-grid .part-icon.has-preview{height:36px}}
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

  for (const part of PARTS) {
    if (queued.has(part.id) || cache.has(part.id)) continue
    queued.add(part.id)
    queue.push(part.id)
  }
  scheduleQueue()
}

installCatalogPreviews()
