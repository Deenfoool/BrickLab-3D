import { buildHeroReducer, HERO_PART_IDS } from './hero-reducer.js?v=hero-reducer-20260910-v1'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { findPart } from '../parts.js'

const PROJECT_KEYS = ['bricklab.project.v2', 'bricklab.project.v1']
const MENU_SETTINGS_KEY = 'bricklab.menu.v4'
const AUDIO_SETTINGS_KEY = 'bricklab.audio.v1'
const VERSION_LABEL = 'v0.2.0'
const VIDEO_URLS = [
  new URL('../assets/menu/background.webm', import.meta.url).href,
  new URL('../assets/menu/background.mp4', import.meta.url).href,
]

const reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0))

function safeJson(value, fallback = null) {
  try { return value ? JSON.parse(value) : fallback } catch { return fallback }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' })[char])
}

function readSnapshot() {
  for (const key of PROJECT_KEYS) {
    try {
      const raw = localStorage.getItem(key)
      const project = safeJson(raw)
      if (project && Array.isArray(project.parts)) return { key, raw, project }
    } catch { /* storage denied */ }
  }
  return null
}

function readMenuSettings() {
  let value = {}
  try { value = safeJson(localStorage.getItem(MENU_SETTINGS_KEY), {}) || {} } catch { /* storage denied */ }
  return {
    autoRotate: value.autoRotate !== false,
    mechanicalMotion: value.mechanicalMotion !== false,
    backgroundVideo: value.backgroundVideo !== false,
  }
}

function writeMenuSettings(settings) {
  try { localStorage.setItem(MENU_SETTINGS_KEY, JSON.stringify(settings)) } catch { /* storage denied */ }
}

function readAudioSettings() {
  let value = {}
  try { value = safeJson(localStorage.getItem(AUDIO_SETTINGS_KEY), {}) || {} } catch { /* storage denied */ }
  return {
    master: Number.isFinite(Number(value.master)) ? clamp01(value.master) : .7,
    sfx: Number.isFinite(Number(value.sfx)) ? clamp01(value.sfx) : .7,
    music: Number.isFinite(Number(value.music)) ? clamp01(value.music) : .23,
    mute: value.mute === true,
  }
}

function writeAudioSettings(settings) {
  try { localStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(settings)) } catch { /* storage denied */ }
}

function ensureCss() {
  const id = 'bricklab-main-menu-v4-css'
  const existing = document.getElementById(id)
  if (existing) return existing.sheet ? Promise.resolve() : new Promise(resolve => {
    existing.addEventListener('load', resolve, { once: true })
    existing.addEventListener('error', resolve, { once: true })
  })
  const link = document.createElement('link')
  link.id = id
  link.rel = 'stylesheet'
  link.href = new URL('./main-menu-v4.css', import.meta.url).href
  document.head.append(link)
  return new Promise(resolve => {
    link.addEventListener('load', resolve, { once: true })
    link.addEventListener('error', resolve, { once: true })
  })
}

function relativeDate(value) {
  if (!value) return 'локальное сохранение'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return 'локальное сохранение'
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000))
  if (minutes < 1) return 'изменён только что'
  if (minutes < 60) return `изменён ${minutes} мин. назад`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `изменён ${hours} ч. назад`
  const days = Math.floor(hours / 24)
  if (days < 30) return `изменён ${days} д. назад`
  return `изменён ${date.toLocaleDateString('ru-RU')}`
}

function projectStats(project) {
  const parts = Array.isArray(project?.parts) ? project.parts.length : 0
  const links = Array.isArray(project?.connections) ? project.connections.length : 0
  return `${parts} деталей · ${links} связей`
}

function markup(snapshot) {
  const project = snapshot?.project
  const hasProject = !!project?.parts?.length
  const name = String(project?.name || 'Последний проект')
  const recent = hasProject
    ? `<button class="bl4-card" type="button" data-action="continue">
        <span class="bl4-thumb"><span>⚙</span></span>
        <span class="bl4-card-copy"><strong>${escapeHtml(name)}</strong><small>${escapeHtml(relativeDate(project.savedAt))}</small><small>${escapeHtml(projectStats(project))}</small></span>
        <span class="bl4-more">⋯</span>
      </button>`
    : `<div class="bl4-empty">Сохранённых проектов пока нет.<br>Создай первую конструкцию — она появится здесь автоматически.</div>`

  return `<div class="bl4-bg" aria-hidden="true">
    <video class="bl4-video missing" muted loop playsinline preload="auto"></video>
    <div class="bl4-overlay"></div><div class="bl4-noise"></div><div class="bl4-vignette"></div>
  </div>
  <div class="bl4-ui">
    <header class="bl4-top">
      <div class="bl4-nav"><span>Ideas</span><i>/</i><span>Parts</span><i>/</i><span>Motion</span><i>/</i><span>More</span></div>
      <div class="bl4-tag">Build a brighter tomorrow</div>
    </header>

    <aside class="bl4-left">
      <h2 class="bl4-kicker">Недавние проекты</h2>
      <div class="bl4-recent">${recent}</div>
      <button class="bl4-open" type="button" data-action="open"><span>＋</span><span>Открыть другой проект...</span></button>
    </aside>

    <main class="bl4-center">
      <h1 class="bl4-title">BrickLab <em>3D</em></h1>
      <div class="bl4-sub">Design&nbsp;&nbsp;·&nbsp;&nbsp;Simulate&nbsp;&nbsp;·&nbsp;&nbsp;Bring to life</div>
      <div class="bl4-hero" id="bl4Hero">
        <div class="bl4-glow"></div><div class="bl4-rings"></div>
        <div class="bl4-fallback" id="bl4Fallback">3D preview unavailable</div>
      </div>
      <div class="bl4-hero-meta" aria-hidden="true"><span>CURATED TRANSMISSION · LIVE 3D</span><span>Drag — rotate · Wheel — zoom · Double click — reset</span></div>
      <div class="bl4-actions" role="menu" aria-label="Главное меню">
        <button class="bl4-action is-primary active" type="button" role="menuitem" data-action="new"><span class="bl4-label">Новый проект</span><span class="bl4-arrow">›</span></button>
        <button class="bl4-action" type="button" role="menuitem" data-action="continue" ${hasProject ? '' : 'disabled'}><span class="bl4-label">Продолжить</span><span class="bl4-arrow">›</span></button>
        <button class="bl4-action" type="button" role="menuitem" data-action="settings"><span class="bl4-label">Настройки</span><span class="bl4-arrow">›</span></button>
      </div>
    </main>

    <aside class="bl4-right" aria-hidden="true">
      <div class="bl4-note a"><strong>Mechanics</strong>Creativity<br>without limits</div>
      <div class="bl4-note b"><strong>Test</strong>Ideas<br>in motion</div>
      <div class="bl4-note c">Different<br>perspectives<br>a brighter build</div>
    </aside>

    <footer class="bl4-footer">
      <div class="bl4-footer-left">Small parts · great ideas</div>
      <div class="bl4-links"><a href="https://github.com/Deenfoool/BrickLab-3D" target="_blank" rel="noopener noreferrer">GitHub</a><span>|</span><a href="https://github.com/Deenfoool/portfolio" target="_blank" rel="noopener noreferrer">Portfolio</a><span>|</span><button type="button" data-action="settings">Settings</button></div>
      <div class="bl4-version">${VERSION_LABEL}</div>
    </footer>
  </div>

  <div class="bl4-settings" id="bl4Settings" aria-hidden="true">
    <section class="bl4-settings-panel" role="dialog" aria-modal="true" aria-labelledby="bl4SettingsTitle">
      <div class="bl4-settings-head"><div><small>BRICKLAB 3D</small><h2 id="bl4SettingsTitle">Настройки</h2></div><button class="bl4-close" type="button" data-close aria-label="Закрыть">×</button></div>
      <div class="bl4-settings-grid">
        <div class="bl4-row"><div><label for="bl4Auto">Автовращение 3D-превью</label><small>После ручного вращения механизм снова продолжит медленный оборот.</small></div><input id="bl4Auto" type="checkbox"></div>
        <div class="bl4-row"><div><label for="bl4Motion">Движение механизма</label><small>Шестерни и валы демонстрационной модели работают прямо в меню.</small></div><input id="bl4Motion" type="checkbox"></div>
        <div class="bl4-row"><div><label for="bl4Video">Фоновое видео</label><small>При отсутствии файла используется встроенный тёмный фон.</small></div><input id="bl4Video" type="checkbox"></div>
        <div class="bl4-row"><div><label for="bl4Master">Общая громкость</label></div><div><input id="bl4Master" type="range" min="0" max="100"><span class="bl4-out" id="bl4MasterOut"></span></div></div>
        <div class="bl4-row"><div><label for="bl4Music">Музыка</label></div><div><input id="bl4Music" type="range" min="0" max="100"><span class="bl4-out" id="bl4MusicOut"></span></div></div>
        <div class="bl4-row"><div><label for="bl4Mute">Без звука</label></div><input id="bl4Mute" type="checkbox"></div>
      </div>
    </section>
  </div>`
}

function tuneMaterial(material) {
  if (!material) return
  if ('envMapIntensity' in material) material.envMapIntensity = Math.max(.85, Number(material.envMapIntensity) || 0)
  if ('roughness' in material) {
    const metal = Number(material.metalness) || 0
    material.roughness = metal > .2
      ? THREE.MathUtils.clamp(Number(material.roughness) || .34, .24, .42)
      : THREE.MathUtils.clamp(Number(material.roughness) || .42, .34, .58)
  }
  if (material.color) {
    const hsl = {}
    material.color.getHSL(hsl)
    if (hsl.l < .055) material.color.offsetHSL(0, 0, .025)
  }
  material.needsUpdate = true
}

function tryPart(id, color) {
  const def = findPart(id)
  if (!def?.create) return null
  try {
    const object = def.create(color ?? def.defaultColor)
    object.userData.menuHeroPart = id
    object.traverse(child => {
      if (!child.isMesh) return
      child.castShadow = true
      child.receiveShadow = true
      const materials = Array.isArray(child.material) ? child.material : [child.material]
      materials.forEach(tuneMaterial)
    })
    return object
  } catch (error) {
    console.warn(`[BrickLab menu] Could not create ${id}`, error)
    return null
  }
}

function hierarchyVisible(object, root) {
  for (let node = object; node; node = node.parent) {
    if (node.visible === false) return false
    if (node === root) break
  }
  return true
}

function visualBounds(root) {
  root.updateMatrixWorld(true)
  const result = new THREE.Box3()
  let populated = false
  root.traverse(object => {
    if (!object.isMesh || !object.geometry || !hierarchyVisible(object, root)) return
    const materials = Array.isArray(object.material) ? object.material : object.material ? [object.material] : []
    if (materials.length && materials.every(material => material?.visible === false || material?.opacity === 0 || material?.colorWrite === false)) return
    if (!object.geometry.boundingBox) object.geometry.computeBoundingBox()
    if (!object.geometry.boundingBox) return
    const box = object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld)
    if (![box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z].every(Number.isFinite)) return
    if (!populated) { result.copy(box); populated = true } else result.union(box)
  })
  return populated ? result : new THREE.Box3().setFromObject(root)
}

function buildCuratedTransmission(root) {
  return buildHeroReducer(root, tryPart).moving
}

function disposeTree(root) {
  const geometries = new Set()
  const materials = new Set()
  root.traverse(object => {
    if (object.geometry) geometries.add(object.geometry)
    if (Array.isArray(object.material)) object.material.forEach(material => materials.add(material))
    else if (object.material) materials.add(object.material)
  })
  geometries.forEach(geometry => geometry.dispose?.())
  materials.forEach(material => material.dispose?.())
}

function fitDistance(box, camera, aspect, padding = 1.28) {
  const size = box.getSize(new THREE.Vector3())
  const verticalFov = THREE.MathUtils.degToRad(camera.fov)
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * Math.max(.2, aspect))
  const byHeight = (size.y * .5) / Math.max(.05, Math.tan(verticalFov / 2))
  const byWidth = (size.x * .5) / Math.max(.05, Math.tan(horizontalFov / 2))
  return (Math.max(byHeight, byWidth) + size.z * .55) * padding
}

function mountHero(shell, settings) {
  const fallback = shell.querySelector('#bl4Fallback')
  let renderer
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
  } catch (error) {
    console.warn('[BrickLab menu] WebGL hero unavailable', error)
    fallback?.classList.add('show')
    return { dispose() {}, setAutoRotate() {}, setMechanicalMotion() {} }
  }

  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.domElement.className = 'bl4-hero-canvas'
  renderer.domElement.setAttribute('aria-label', 'Интерактивная демонстрационная трансмиссия BrickLab')
  shell.append(renderer.domElement)

  const scene = new THREE.Scene()
  const pmrem = new THREE.PMREMGenerator(renderer)
  const environment = pmrem.fromScene(new RoomEnvironment(renderer), .04)
  scene.environment = environment.texture
  pmrem.dispose()

  const camera = new THREE.PerspectiveCamera(35, 1, .05, 120)
  const floatRoot = new THREE.Group()
  const presentation = new THREE.Group()
  const model = new THREE.Group()
  presentation.add(model)
  floatRoot.add(presentation)
  scene.add(floatRoot)

  scene.add(new THREE.HemisphereLight(0xd5e4e1, 0x111719, 1.25))
  const key = new THREE.DirectionalLight(0xf7fbff, 2.65)
  key.position.set(6, 8, 9); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); scene.add(key)
  const fill = new THREE.DirectionalLight(0xa8c6d3, .85)
  fill.position.set(-6, 3, 5); scene.add(fill)
  const rim = new THREE.DirectionalLight(0xd9ebff, 1.35)
  rim.position.set(4, 6, -7); scene.add(rim)
  const mint = new THREE.PointLight(0x67f2cb, 1.45, 16, 2)
  mint.position.set(-4, -1, 5); scene.add(mint)

  const moving = buildCuratedTransmission(model)
  if (!model.children.length) {
    fallback?.classList.add('show')
    renderer.domElement.style.display = 'none'
    return { dispose() { environment.texture.dispose(); renderer.dispose() }, setAutoRotate() {}, setMechanicalMotion() {} }
  }

  // Presentation pose is deliberately modest: readable 3/4 view, not a low dramatic crop.
  presentation.rotation.set(-.04, -.22, -.012)
  model.updateMatrixWorld(true)
  const centered = visualBounds(model)
  model.position.sub(centered.getCenter(new THREE.Vector3()))
  model.updateMatrixWorld(true)

  const target = new THREE.Vector3(0, .02, 0)
  const homeDirection = new THREE.Vector3(.78, .52, 3.1).normalize()
  let homeDistance = 12
  let homePosition = homeDirection.clone().multiplyScalar(homeDistance).add(target)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = .07
  controls.enablePan = false
  controls.enableZoom = true
  controls.rotateSpeed = .58
  controls.zoomSpeed = .70
  controls.target.copy(target)
  controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE
  controls.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY
  controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE
  controls.autoRotate = settings.autoRotate && !reducedMotion()
  controls.autoRotateSpeed = .45

  const fitCamera = () => {
    const rect = shell.getBoundingClientRect()
    const width = Math.max(1, Math.floor(rect.width))
    const height = Math.max(1, Math.floor(rect.height))
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    renderer.setSize(width, height, false)
    presentation.updateMatrixWorld(true)
    const box = visualBounds(presentation)
    homeDistance = fitDistance(box, camera, camera.aspect, width < 700 ? 1.38 : 1.28)
    homePosition = homeDirection.clone().multiplyScalar(homeDistance).add(target)
    controls.minDistance = homeDistance * .70
    controls.maxDistance = homeDistance * 1.75
    camera.position.copy(homePosition)
    controls.target.copy(target)
    controls.update()
  }

  fitCamera()

  let resumeTimer = 0
  const resumeAuto = () => {
    clearTimeout(resumeTimer)
    resumeTimer = setTimeout(() => { controls.autoRotate = settings.autoRotate && !reducedMotion() }, 2600)
  }
  const pauseAuto = () => { controls.autoRotate = false; resumeAuto() }
  controls.addEventListener('start', pauseAuto)

  const onPointerDown = () => renderer.domElement.classList.add('grab')
  const onPointerUp = () => renderer?.domElement.classList.remove('grab')
  const resetCamera = () => {
    presentation.rotation.set(-.04, -.22, -.012)
    fitCamera()
    pauseAuto()
  }
  renderer.domElement.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('pointerup', onPointerUp)
  renderer.domElement.addEventListener('dblclick', resetCamera)

  let alive = true
  let last = performance.now()
  const clock = new THREE.Clock()
  const frame = now => {
    if (!alive) return
    const dt = Math.min(.05, Math.max(0, (now - last) / 1000)); last = now
    if (settings.mechanicalMotion && !reducedMotion()) {
      for (const item of moving) item.object.rotation[item.axis] += item.speed * dt
    }
    const t = clock.getElapsedTime()
    floatRoot.position.y = reducedMotion() ? 0 : Math.sin(t * .62) * .032
    controls.update()
    renderer.render(scene, camera)
    requestAnimationFrame(frame)
  }

  let resizeTimer = 0
  const observer = new ResizeObserver(() => {
    clearTimeout(resizeTimer)
    resizeTimer = setTimeout(fitCamera, 30)
  })
  observer.observe(shell)
  requestAnimationFrame(frame)

  return {
    setAutoRotate(value) {
      settings.autoRotate = !!value
      controls.autoRotate = !!value && !reducedMotion()
    },
    setMechanicalMotion(value) { settings.mechanicalMotion = !!value },
    dispose() {
      alive = false
      clearTimeout(resumeTimer)
      clearTimeout(resizeTimer)
      observer.disconnect()
      controls.dispose()
      renderer.domElement.removeEventListener('pointerdown', onPointerDown)
      renderer.domElement.removeEventListener('dblclick', resetCamera)
      window.removeEventListener('pointerup', onPointerUp)
      disposeTree(model)
      environment.texture.dispose()
      renderer.dispose()
      renderer.domElement.remove()
      renderer = null
    },
  }
}

async function attachVideo(menu, settings) {
  const video = menu.querySelector('.bl4-video')
  if (!video || !settings.backgroundVideo || reducedMotion()) return
  for (const url of VIDEO_URLS) {
    const loaded = await new Promise(resolve => {
      let done = false
      const finish = ok => { if (done) return; done = true; cleanup(); resolve(ok) }
      const cleanup = () => { video.removeEventListener('loadeddata', onLoad); video.removeEventListener('error', onError) }
      const onLoad = () => finish(true)
      const onError = () => finish(false)
      video.addEventListener('loadeddata', onLoad, { once: true })
      video.addEventListener('error', onError, { once: true })
      video.src = url
      video.load()
      setTimeout(() => finish(video.readyState >= 2), 1600)
    })
    if (!loaded) continue
    video.classList.remove('missing')
    await video.play().catch(() => {})
    return
  }
  video.classList.add('missing')
}

function wireSettings(menu, hero, menuSettings) {
  const layer = menu.querySelector('#bl4Settings')
  const auto = menu.querySelector('#bl4Auto')
  const motion = menu.querySelector('#bl4Motion')
  const videoToggle = menu.querySelector('#bl4Video')
  const master = menu.querySelector('#bl4Master')
  const music = menu.querySelector('#bl4Music')
  const mute = menu.querySelector('#bl4Mute')
  const masterOut = menu.querySelector('#bl4MasterOut')
  const musicOut = menu.querySelector('#bl4MusicOut')
  const video = menu.querySelector('.bl4-video')
  const audio = readAudioSettings()

  auto.checked = menuSettings.autoRotate
  motion.checked = menuSettings.mechanicalMotion
  videoToggle.checked = menuSettings.backgroundVideo
  master.value = Math.round(audio.master * 100)
  music.value = Math.round(audio.music * 100)
  mute.checked = audio.mute
  masterOut.textContent = `${master.value}%`
  musicOut.textContent = `${music.value}%`

  const open = () => { layer.classList.add('open'); layer.setAttribute('aria-hidden', 'false'); menu.querySelector('[data-close]')?.focus() }
  const close = () => { layer.classList.remove('open'); layer.setAttribute('aria-hidden', 'true') }

  auto.onchange = () => { menuSettings.autoRotate = auto.checked; writeMenuSettings(menuSettings); hero.setAutoRotate(auto.checked) }
  motion.onchange = () => { menuSettings.mechanicalMotion = motion.checked; writeMenuSettings(menuSettings); hero.setMechanicalMotion(motion.checked) }
  videoToggle.onchange = async () => {
    menuSettings.backgroundVideo = videoToggle.checked
    writeMenuSettings(menuSettings)
    if (videoToggle.checked) await attachVideo(menu, menuSettings)
    else { video.pause(); video.removeAttribute('src'); video.load(); video.classList.add('missing') }
  }
  master.oninput = () => { audio.master = Number(master.value) / 100; masterOut.textContent = `${master.value}%`; writeAudioSettings(audio) }
  music.oninput = () => { audio.music = Number(music.value) / 100; musicOut.textContent = `${music.value}%`; writeAudioSettings(audio) }
  mute.onchange = () => { audio.mute = mute.checked; writeAudioSettings(audio) }
  menu.querySelector('[data-close]')?.addEventListener('click', close)
  layer.addEventListener('pointerdown', event => { if (event.target === layer) close() })
  return { open, close, isOpen: () => layer.classList.contains('open') }
}

export async function showMainMenu() {
  await ensureCss()
  const snapshot = readSnapshot()
  const menuSettings = readMenuSettings()
  const menu = document.createElement('section')
  menu.id = 'bricklab-main-menu-v4'
  menu.className = 'bl4-enter'
  menu.setAttribute('aria-label', 'BrickLab 3D main menu')
  menu.innerHTML = markup(snapshot)
  document.body.append(menu)
  document.body.classList.add('bricklab-menu-open')

  const hero = mountHero(menu.querySelector('#bl4Hero'), menuSettings)
  const settings = wireSettings(menu, hero, menuSettings)
  attachVideo(menu, menuSettings)

  const buttons = [...menu.querySelectorAll('.bl4-action:not([disabled])')]
  let activeIndex = 0
  const setActive = index => {
    if (!buttons.length) return
    activeIndex = (index + buttons.length) % buttons.length
    buttons.forEach((button, i) => button.classList.toggle('active', i === activeIndex))
  }
  buttons.forEach((button, index) => {
    button.addEventListener('mouseenter', () => setActive(index))
    button.addEventListener('focus', () => setActive(index))
  })

  return new Promise(resolve => {
    let resolved = false
    const finish = action => {
      if (resolved) return
      resolved = true
      window.removeEventListener('keydown', onKeyDown, true)
      menu.classList.remove('bl4-enter')
      menu.classList.add('bl4-exit')
      setTimeout(() => {
        hero.dispose()
        menu.remove()
        document.body.classList.remove('bricklab-menu-open')
        resolve({ action, snapshot })
      }, reducedMotion() ? 0 : 300)
    }

    const activate = action => {
      if (action === 'settings') { settings.open(); return }
      if (action === 'continue' && !snapshot?.project?.parts?.length) return
      finish(action)
    }

    menu.addEventListener('click', event => {
      const button = event.target.closest('[data-action]')
      if (!button || button.disabled) return
      activate(button.dataset.action)
    })

    const onKeyDown = event => {
      if (settings.isOpen()) {
        if (event.key === 'Escape') { event.preventDefault(); settings.close() }
        return
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
        event.preventDefault(); setActive(activeIndex + 1); buttons[activeIndex]?.focus(); return
      }
      if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
        event.preventDefault(); setActive(activeIndex - 1); buttons[activeIndex]?.focus(); return
      }
      if (event.key === 'Enter' && document.activeElement === document.body) {
        event.preventDefault(); buttons[activeIndex]?.click()
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
  })
}

export const BrickLabMainMenuV4 = Object.freeze({
  projectKeys: PROJECT_KEYS,
  settingsKey: MENU_SETTINGS_KEY,
  fixedHero: true,
  heroPartIds: HERO_PART_IDS,
})
