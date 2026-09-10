import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { findPart } from '../parts.js'

const PROJECT_KEYS = ['bricklab.project.v2', 'bricklab.project.v1']
const MENU_SETTINGS_KEY = 'bricklab.menu.v2'
const AUDIO_SETTINGS_KEY = 'bricklab.audio.v1'
const VERSION_LABEL = 'v0.2.0'
const VIDEO_URLS = [
  new URL('../assets/menu/background.webm', import.meta.url).href,
  new URL('../assets/menu/background.mp4', import.meta.url).href,
]

const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0))
const reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true

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
  if (document.getElementById('bricklab-main-menu-v2-css')) return
  const link = document.createElement('link')
  link.id = 'bricklab-main-menu-v2-css'
  link.rel = 'stylesheet'
  link.href = new URL('./main-menu-v2.css', import.meta.url).href
  document.head.append(link)
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
  const projectName = String(project?.name || 'Последний проект')
  const recent = hasProject
    ? `<button class="bl2-card" type="button" data-action="continue">
        <span class="bl2-thumb">⚙</span>
        <span class="bl2-card-copy"><strong>${escapeHtml(projectName)}</strong><small>${escapeHtml(relativeDate(project.savedAt))}</small><small>${escapeHtml(projectStats(project))}</small></span>
        <span class="bl2-more">⋯</span>
      </button>`
    : `<div class="bl2-empty">Сохранённых проектов пока нет.<br>Создай первую конструкцию — она появится здесь автоматически.</div>`

  return `<div class="bl2-bg" aria-hidden="true">
    <video class="bl2-video missing" muted loop playsinline preload="metadata"></video>
    <div class="bl2-overlay"></div><div class="bl2-noise"></div><div class="bl2-vignette"></div>
  </div>
  <div class="bl2-ui">
    <header class="bl2-top">
      <div class="bl2-nav"><span>Ideas</span><i>/</i><span>Parts</span><i>/</i><span>Motion</span><i>/</i><span>More</span></div>
      <div class="bl2-progress"><div class="bl2-track"><span></span></div><span>72%</span></div>
      <div class="bl2-tag">Build a brighter tomorrow</div>
    </header>

    <aside class="bl2-left">
      <h2 class="bl2-kicker">Недавние проекты</h2>
      <div class="bl2-recent">${recent}</div>
      <button class="bl2-open" type="button" data-action="open">＋&nbsp;&nbsp;Открыть другой проект...</button>
    </aside>

    <main class="bl2-center">
      <h1 class="bl2-title">BrickLab <em>3D</em></h1>
      <div class="bl2-sub">Design&nbsp;&nbsp;·&nbsp;&nbsp;Simulate&nbsp;&nbsp;·&nbsp;&nbsp;Bring to life</div>
      <div class="bl2-hero" id="bl2Hero">
        <div class="bl2-glow"></div><div class="bl2-rings"></div>
        <div class="bl2-fallback" id="bl2Fallback">3D preview unavailable</div>
        <div class="bl2-hero-badge">REAL PARTS · LIVE 3D</div>
        <div class="bl2-hero-hint">Drag — rotate · Wheel — zoom · Double click — reset</div>
      </div>
      <div class="bl2-actions" role="menu" aria-label="Главное меню">
        <button class="bl2-action primary active" type="button" role="menuitem" data-action="new"><span></span><span>Новый проект</span><span class="arrow">›</span></button>
        <button class="bl2-action" type="button" role="menuitem" data-action="continue" ${hasProject ? '' : 'disabled'}><span></span><span>Продолжить</span><span class="arrow">›</span></button>
        <button class="bl2-action" type="button" role="menuitem" data-action="settings"><span></span><span>Настройки</span><span class="arrow">›</span></button>
      </div>
    </main>

    <aside class="bl2-right" aria-hidden="true">
      <div class="bl2-note a"><strong>Mechanics</strong>Creativity<br>without limits</div>
      <div class="bl2-note b"><strong>Test</strong>Ideas<br>in motion</div>
      <div class="bl2-note c">Different<br>perspectives<br>a brighter build</div>
    </aside>

    <footer class="bl2-footer">
      <div class="bl2-footer-left">Small parts · great ideas</div>
      <div class="bl2-links"><a href="https://github.com/Deenfoool/BrickLab-3D" target="_blank" rel="noopener noreferrer">GitHub</a><span>|</span><a href="https://github.com/Deenfoool/portfolio" target="_blank" rel="noopener noreferrer">Portfolio</a><span>|</span><button type="button" data-action="settings">Settings</button></div>
      <div class="bl2-version">${VERSION_LABEL}</div>
    </footer>
  </div>

  <div class="bl2-settings" id="bl2Settings" aria-hidden="true">
    <section class="bl2-settings-panel" role="dialog" aria-modal="true" aria-labelledby="bl2SettingsTitle">
      <div class="bl2-settings-head"><div><small>BRICKLAB 3D</small><h2 id="bl2SettingsTitle">Настройки</h2></div><button class="bl2-close" type="button" data-close aria-label="Закрыть">×</button></div>
      <div class="bl2-settings-grid">
        <div class="bl2-row"><div><label for="bl2Auto">Автовращение 3D-превью</label><small>После ручного вращения объект снова продолжит медленный оборот.</small></div><input id="bl2Auto" type="checkbox"></div>
        <div class="bl2-row"><div><label for="bl2Motion">Движение механизма</label><small>Шестерни showcase-модели медленно работают прямо в меню.</small></div><input id="bl2Motion" type="checkbox"></div>
        <div class="bl2-row"><div><label for="bl2Video">Фоновое видео</label><small>При отсутствии файла используется встроенный тёмный фон.</small></div><input id="bl2Video" type="checkbox"></div>
        <div class="bl2-row"><div><label for="bl2Master">Общая громкость</label></div><div><input id="bl2Master" type="range" min="0" max="100"><span class="bl2-out" id="bl2MasterOut"></span></div></div>
        <div class="bl2-row"><div><label for="bl2Music">Музыка</label></div><div><input id="bl2Music" type="range" min="0" max="100"><span class="bl2-out" id="bl2MusicOut"></span></div></div>
        <div class="bl2-row"><div><label for="bl2Mute">Без звука</label></div><input id="bl2Mute" type="checkbox"></div>
      </div>
    </section>
  </div>`
}

function tryPart(id, color) {
  const def = findPart(id)
  if (!def?.create) return null
  try {
    const object = def.create(color ?? def.defaultColor)
    object.userData.menuHeroPart = id
    object.traverse(child => {
      if (child.isMesh) {
        child.castShadow = true
        child.receiveShadow = true
      }
    })
    return object
  } catch (error) {
    console.warn(`[BrickLab menu] Could not create ${id}`, error)
    return null
  }
}

function centerObject(object) {
  object.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(object)
  const center = box.getCenter(new THREE.Vector3())
  object.position.sub(center)
  return object
}

function showcaseAssembly(root) {
  const moving = []
  const add = (id, color, position, rotation = [0, 0, 0], spin = null) => {
    const part = tryPart(id, color)
    if (!part) return null
    centerObject(part)
    const pivot = new THREE.Group()
    pivot.position.fromArray(position)
    pivot.rotation.set(...rotation)
    pivot.add(part)
    root.add(pivot)
    if (spin) moving.push({ object: part, axis: spin.axis, speed: spin.speed })
    return pivot
  }

  // A compact transmission showcase assembled entirely from BrickLab production parts.
  // The layout is intentionally presentation-oriented, but every visible mechanical
  // component comes from the exact same factory used by BUILD mode.
  add('technic-frame-5x7', 0x25292d, [0, .05, -.95], [Math.PI / 2, 0, 0])
  add('motor', 0x343a40, [-3.75, .05, -.08], [0, Math.PI / 2, 0])
  add('gearbox-fnr', 0x333a40, [-1.55, .03, .02], [0, 0, 0])
  add('open-differential', 0x3c4349, [1.52, .10, .10], [0, 0, 0])
  add('bearing-block', 0x2c3135, [3.33, .02, .05], [0, Math.PI / 2, 0])

  add('gear-36', 0x24282c, [1.58, .34, 1.55], [Math.PI / 2, 0, 0], { axis: 'y', speed: .46 })
  add('gear-20', 0xc7aa73, [-1.92, .34, 1.55], [Math.PI / 2, 0, 0], { axis: 'y', speed: -.83 })
  add('bevel-gear-12', 0xc7aa73, [-.65, 1.05, .65], [0, 0, Math.PI / 2], { axis: 'y', speed: .72 })
  add('gear-8', 0xaeb5ba, [-.12, -.62, 1.28], [Math.PI / 2, 0, 0], { axis: 'y', speed: 1.28 })

  add('axle-7', 0x26292d, [-.30, .06, -.05], [0, 0, 0], { axis: 'x', speed: .55 })
  add('axle-5', 0xb6bcc0, [2.72, .12, .08], [0, 0, 0], { axis: 'x', speed: -.46 })
  add('axle-coupler', 0xb8bec2, [-2.85, .02, -.02], [0, 0, 0], { axis: 'x', speed: .55 })

  return moving
}

function savedAssembly(root, project) {
  if (!Array.isArray(project?.parts) || !project.parts.length) return 0
  const source = project.parts.length > 180
    ? project.parts.filter((_, i) => i % Math.ceil(project.parts.length / 180) === 0).slice(0, 180)
    : project.parts
  let count = 0
  for (const state of source) {
    const object = tryPart(state?.partId, state?.color)
    if (!object) continue
    if (Array.isArray(state.position)) object.position.fromArray(state.position)
    if (Array.isArray(state.rotation)) object.rotation.set(...state.rotation)
    root.add(object)
    count += 1
  }
  return count
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

function mountHero(shell, project, settings) {
  const fallback = shell.querySelector('#bl2Fallback')
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
  renderer.toneMappingExposure = 1.16
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.domElement.className = 'bl2-hero-canvas'
  renderer.domElement.setAttribute('aria-label', 'Интерактивная 3D-модель BrickLab')
  shell.append(renderer.domElement)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(33, 1, .05, 160)
  const floatRoot = new THREE.Group()
  const model = new THREE.Group()
  floatRoot.add(model)
  scene.add(floatRoot)

  scene.add(new THREE.HemisphereLight(0xd8ebe7, 0x111719, 2.25))
  const key = new THREE.DirectionalLight(0xffffff, 4.7)
  key.position.set(7, 9, 8); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); scene.add(key)
  const mint = new THREE.PointLight(0x67f2cb, 8.0, 20, 2)
  mint.position.set(-5, 1.8, 5); scene.add(mint)
  const blue = new THREE.PointLight(0x6c94ff, 4.2, 18, 2)
  blue.position.set(5, 3, -5); scene.add(blue)
  const rim = new THREE.DirectionalLight(0xbcd5ff, 1.7)
  rim.position.set(-6, 5, -7); scene.add(rim)

  let moving = []
  const savedCount = savedAssembly(model, project)
  const usingSavedProject = savedCount > 0
  if (!usingSavedProject) moving = showcaseAssembly(model)
  if (!model.children.length) {
    fallback?.classList.add('show')
    renderer.domElement.style.display = 'none'
    return { dispose() { renderer.dispose() }, setAutoRotate() {}, setMechanicalMotion() {} }
  }

  model.updateMatrixWorld(true)
  const initialBox = new THREE.Box3().setFromObject(model)
  const center = initialBox.getCenter(new THREE.Vector3())
  model.position.sub(center)
  model.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(model)
  const size = box.getSize(new THREE.Vector3())
  const largest = Math.max(size.x, size.y, size.z, .1)
  model.scale.setScalar(Math.min(usingSavedProject ? 1.35 : 1.52, (usingSavedProject ? 7.0 : 7.9) / largest))
  model.rotation.set(-.08, -.28, .01)
  model.updateMatrixWorld(true)

  const sphere = new THREE.Box3().setFromObject(model).getBoundingSphere(new THREE.Sphere())
  const radius = Math.max(2.2, sphere.radius)
  const homePosition = new THREE.Vector3(radius * 1.12, radius * .58, radius * 2.42)
  camera.position.copy(homePosition)
  camera.lookAt(0, 0, 0)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = .065
  controls.enablePan = false
  controls.enableZoom = true
  controls.rotateSpeed = .62
  controls.zoomSpeed = .75
  controls.minDistance = radius * 1.45
  controls.maxDistance = radius * 4.2
  controls.target.set(0, 0, 0)
  controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE
  controls.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY
  controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE
  controls.autoRotate = settings.autoRotate && !reducedMotion()
  controls.autoRotateSpeed = .62

  let resumeTimer = 0
  const resumeAuto = () => {
    clearTimeout(resumeTimer)
    resumeTimer = setTimeout(() => { controls.autoRotate = settings.autoRotate && !reducedMotion() }, 2300)
  }
  const pauseAuto = () => { controls.autoRotate = false; resumeAuto() }
  controls.addEventListener('start', pauseAuto)

  const onPointerDown = () => renderer.domElement.classList.add('grab')
  const onPointerUp = () => renderer?.domElement.classList.remove('grab')
  renderer.domElement.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('pointerup', onPointerUp)
  renderer.domElement.addEventListener('dblclick', () => {
    camera.position.copy(homePosition)
    controls.target.set(0, 0, 0)
    controls.update()
    pauseAuto()
  })

  let alive = true
  let last = performance.now()
  const clock = new THREE.Clock()
  const frame = now => {
    if (!alive) return
    const dt = Math.min(.05, Math.max(0, (now - last) / 1000)); last = now
    if (!usingSavedProject && settings.mechanicalMotion && !reducedMotion()) {
      for (const item of moving) item.object.rotation[item.axis] += item.speed * dt
    }
    const t = clock.getElapsedTime()
    floatRoot.position.y = reducedMotion() ? 0 : Math.sin(t * .72) * .045
    controls.update()
    renderer.render(scene, camera)
    requestAnimationFrame(frame)
  }

  const resize = () => {
    const rect = shell.getBoundingClientRect()
    const width = Math.max(1, Math.floor(rect.width))
    const height = Math.max(1, Math.floor(rect.height))
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    renderer.setSize(width, height, false)
  }
  const observer = new ResizeObserver(resize)
  observer.observe(shell)
  resize()
  requestAnimationFrame(frame)

  return {
    usingSavedProject,
    setAutoRotate(value) {
      settings.autoRotate = !!value
      controls.autoRotate = !!value && !reducedMotion()
    },
    setMechanicalMotion(value) { settings.mechanicalMotion = !!value },
    dispose() {
      alive = false
      clearTimeout(resumeTimer)
      observer.disconnect()
      controls.dispose()
      renderer.domElement.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointerup', onPointerUp)
      disposeTree(model)
      renderer.dispose()
      renderer.domElement.remove()
      renderer = null
    },
  }
}

async function attachVideo(menu, settings) {
  const video = menu.querySelector('.bl2-video')
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
      setTimeout(() => finish(video.readyState >= 2), 1800)
    })
    if (!loaded) continue
    video.classList.remove('missing')
    await video.play().catch(() => {})
    return
  }
  video.classList.add('missing')
}

function wireSettings(menu, hero, menuSettings) {
  const layer = menu.querySelector('#bl2Settings')
  const auto = menu.querySelector('#bl2Auto')
  const motion = menu.querySelector('#bl2Motion')
  const videoToggle = menu.querySelector('#bl2Video')
  const master = menu.querySelector('#bl2Master')
  const music = menu.querySelector('#bl2Music')
  const mute = menu.querySelector('#bl2Mute')
  const masterOut = menu.querySelector('#bl2MasterOut')
  const musicOut = menu.querySelector('#bl2MusicOut')
  const video = menu.querySelector('.bl2-video')
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
  ensureCss()
  const snapshot = readSnapshot()
  const menuSettings = readMenuSettings()
  const menu = document.createElement('section')
  menu.id = 'bricklab-main-menu-v2'
  menu.className = 'bl2-enter'
  menu.setAttribute('aria-label', 'BrickLab 3D main menu')
  menu.innerHTML = markup(snapshot)
  document.body.append(menu)
  document.body.classList.add('bricklab-menu-open')

  const hero = mountHero(menu.querySelector('#bl2Hero'), snapshot?.project, menuSettings)
  const settings = wireSettings(menu, hero, menuSettings)
  attachVideo(menu, menuSettings)

  const buttons = [...menu.querySelectorAll('.bl2-action:not([disabled])')]
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
      menu.classList.remove('bl2-enter')
      menu.classList.add('bl2-exit')
      setTimeout(() => {
        hero.dispose()
        menu.remove()
        document.body.classList.remove('bricklab-menu-open')
        resolve({ action, snapshot })
      }, reducedMotion() ? 0 : 360)
    }
    const activate = action => {
      if (action === 'settings') return settings.open()
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
      if (event.key === 'ArrowDown' || event.key === 'ArrowRight') { event.preventDefault(); setActive(activeIndex + 1); buttons[activeIndex]?.focus(); return }
      if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') { event.preventDefault(); setActive(activeIndex - 1); buttons[activeIndex]?.focus(); return }
      if (event.key === 'Enter' && document.activeElement === document.body) { event.preventDefault(); buttons[activeIndex]?.click() }
    }
    window.addEventListener('keydown', onKeyDown, true)
  })
}

export const BrickLabMainMenuV2 = Object.freeze({
  projectKeys: PROJECT_KEYS,
  settingsKey: MENU_SETTINGS_KEY,
  videoUrls: VIDEO_URLS,
})
