import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { findPart } from './parts.js'

const PROJECT_KEYS = ['bricklab.project.v2', 'bricklab.project.v1']
const MENU_SETTINGS_KEY = 'bricklab.menu.v1'
const AUDIO_SETTINGS_KEY = 'bricklab.audio.v1'
const MENU_VIDEO_CANDIDATES = ['./assets/menu/background.webm', './assets/menu/background.mp4']
const VERSION_LABEL = 'v0.2.0'

function safeJson(value, fallback = null) {
  try { return value ? JSON.parse(value) : fallback } catch { return fallback }
}

function readProjectSnapshot() {
  for (const key of PROJECT_KEYS) {
    let raw = null
    try { raw = localStorage.getItem(key) } catch { /* storage denied */ }
    const project = safeJson(raw)
    if (project && Array.isArray(project.parts)) return { key, raw, project }
  }
  return null
}

function readMenuSettings() {
  let saved = null
  try { saved = safeJson(localStorage.getItem(MENU_SETTINGS_KEY), {}) } catch { saved = {} }
  return {
    autoRotate: saved?.autoRotate !== false,
    backgroundVideo: saved?.backgroundVideo !== false,
  }
}

function saveMenuSettings(settings) {
  try { localStorage.setItem(MENU_SETTINGS_KEY, JSON.stringify(settings)) } catch { /* storage denied */ }
}

function readAudioSettings() {
  let saved = null
  try { saved = safeJson(localStorage.getItem(AUDIO_SETTINGS_KEY), {}) } catch { saved = {} }
  return {
    master: Number.isFinite(Number(saved?.master)) ? Math.max(0, Math.min(1, Number(saved.master))) : .7,
    sfx: Number.isFinite(Number(saved?.sfx)) ? Math.max(0, Math.min(1, Number(saved.sfx))) : .7,
    music: Number.isFinite(Number(saved?.music)) ? Math.max(0, Math.min(1, Number(saved.music))) : .23,
    mute: saved?.mute === true,
  }
}

function saveAudioSettings(settings) {
  try { localStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(settings)) } catch { /* storage denied */ }
}

function ensureStyles() {
  if (document.getElementById('bricklab-main-menu-style')) return
  const link = document.createElement('link')
  link.id = 'bricklab-main-menu-style'
  link.rel = 'stylesheet'
  link.href = './main-menu.css?v=main-menu-20260910-v1'
  document.head.append(link)
}

function formatRelativeDate(value) {
  if (!value) return 'локальное сохранение'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return 'локальное сохранение'
  const delta = Math.max(0, Date.now() - date.getTime())
  const minutes = Math.floor(delta / 60000)
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
  return `${parts} ${parts === 1 ? 'деталь' : 'деталей'} · ${links} связей`
}

function createMenuMarkup(snapshot) {
  const project = snapshot?.project
  const hasProject = !!project?.parts?.length
  const projectName = String(project?.name || 'Последний проект')
  const recent = hasProject ? `
    <button class="bl-recent-card" type="button" data-menu-action="continue" aria-label="Продолжить ${escapeHtml(projectName)}">
      <span class="bl-recent-thumb"><span class="bl-recent-gear">⚙</span></span>
      <span class="bl-recent-copy"><strong>${escapeHtml(projectName)}</strong><small>${escapeHtml(formatRelativeDate(project.savedAt))}</small><small>${escapeHtml(projectStats(project))}</small></span>
      <span class="bl-recent-more">⋯</span>
    </button>` : `<div class="bl-menu-empty">Сохранённых проектов пока нет.<br>Создай первую конструкцию — она появится здесь автоматически.</div>`

  return `
  <div class="bl-menu-bg" aria-hidden="true">
    <video class="bl-menu-video is-unavailable" muted loop playsinline preload="metadata"></video>
    <div class="bl-menu-overlay"></div>
    <div class="bl-menu-noise"></div>
    <div class="bl-menu-vignette"></div>
  </div>
  <div class="bl-menu-ui">
    <header class="bl-menu-top">
      <div class="bl-menu-nav"><span>Ideas</span><i>/</i><span>Parts</span><i>/</i><span>Motion</span><i>/</i><span>More</span></div>
      <div class="bl-menu-progress"><div class="bl-menu-progress-track"><span class="bl-menu-progress-fill"></span></div><span>72%</span></div>
      <div class="bl-menu-top-tag">Build a brighter tomorrow</div>
    </header>

    <aside class="bl-menu-left">
      <h2 class="bl-menu-kicker">Недавние проекты</h2>
      <div class="bl-menu-recent">${recent}</div>
      <button class="bl-menu-open" type="button" data-menu-action="open"><b>＋</b>Открыть другой проект...</button>
    </aside>

    <main class="bl-menu-center">
      <h1 class="bl-menu-title">BrickLab <em>3D</em></h1>
      <div class="bl-menu-subtitle">Design&nbsp;&nbsp;·&nbsp;&nbsp;Simulate&nbsp;&nbsp;·&nbsp;&nbsp;Bring to life</div>
      <div class="bl-hero-shell" id="blHeroShell">
        <div class="bl-hero-glow"></div>
        <div class="bl-hero-platform"></div>
        <div class="bl-hero-fallback" id="blHeroFallback">3D preview unavailable</div>
        <div class="bl-hero-hint">Drag to rotate · Wheel to zoom</div>
      </div>
      <div class="bl-menu-actions" role="menu" aria-label="Главное меню">
        <button class="bl-menu-action primary active" type="button" role="menuitem" data-menu-action="new"><span></span><span>Новый проект</span><span class="arrow">›</span></button>
        <button class="bl-menu-action" type="button" role="menuitem" data-menu-action="continue" ${hasProject ? '' : 'disabled'}><span></span><span>Продолжить</span><span class="arrow">›</span></button>
        <button class="bl-menu-action" type="button" role="menuitem" data-menu-action="settings"><span></span><span>Настройки</span><span class="arrow">›</span></button>
      </div>
    </main>

    <aside class="bl-menu-right" aria-hidden="true">
      <div class="bl-menu-side-note top"><strong>Mechanics</strong>Creativity<br>without limits</div>
      <div class="bl-menu-side-note middle"><strong>Test</strong>Ideas<br>in motion</div>
      <div class="bl-menu-side-note bottom">Different<br>perspectives<br>a brighter build</div>
    </aside>

    <footer class="bl-menu-footer">
      <div class="bl-menu-footer-left">Small parts · great ideas</div>
      <div class="bl-menu-links">
        <a href="https://github.com/Deenfoool/BrickLab-3D" target="_blank" rel="noopener noreferrer">GitHub</a><span class="bl-menu-sep">|</span>
        <a href="https://github.com/Deenfoool/portfolio" target="_blank" rel="noopener noreferrer">Portfolio</a><span class="bl-menu-sep">|</span>
        <button type="button" data-menu-action="settings">Settings</button>
      </div>
      <div class="bl-menu-version">${VERSION_LABEL}</div>
    </footer>
  </div>

  <div class="bl-menu-settings" id="blMenuSettings" aria-hidden="true">
    <section class="bl-settings-panel" role="dialog" aria-modal="true" aria-labelledby="blSettingsTitle">
      <div class="bl-settings-head"><div><small>BRICKLAB 3D</small><h2 id="blSettingsTitle">Настройки</h2></div><button type="button" class="bl-settings-close" data-settings-close aria-label="Закрыть">×</button></div>
      <div class="bl-settings-grid">
        <div class="bl-settings-row"><div><label for="blAutoRotate">Автовращение 3D-превью</label><small>После паузы механизм снова медленно вращается.</small></div><input id="blAutoRotate" type="checkbox"></div>
        <div class="bl-settings-row"><div><label for="blBgVideo">Фоновое видео</label><small>Если файл отсутствует, остаётся встроенный тёмный фон.</small></div><input id="blBgVideo" type="checkbox"></div>
        <div class="bl-settings-row"><div><label for="blMasterVolume">Общая громкость</label><small>Применится к звуковой системе после входа в редактор.</small></div><div><input id="blMasterVolume" type="range" min="0" max="100"><span class="bl-settings-output" id="blMasterOut"></span></div></div>
        <div class="bl-settings-row"><div><label for="blMusicVolume">Музыка</label><small>Фоновая музыка режима сборки.</small></div><div><input id="blMusicVolume" type="range" min="0" max="100"><span class="bl-settings-output" id="blMusicOut"></span></div></div>
        <div class="bl-settings-row"><div><label for="blMute">Без звука</label><small>Полностью отключает звук BrickLab.</small></div><input id="blMute" type="checkbox"></div>
      </div>
    </section>
  </div>`
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' })[char])
}

async function attachBackgroundVideo(menu, settings) {
  const video = menu.querySelector('.bl-menu-video')
  if (!video || !settings.backgroundVideo || matchMedia('(prefers-reduced-motion: reduce)').matches) return
  for (const src of MENU_VIDEO_CANDIDATES) {
    try {
      const probe = await fetch(src, { method: 'HEAD', cache: 'no-store' })
      if (!probe.ok) continue
      video.src = src
      video.classList.remove('is-unavailable')
      await video.play().catch(() => {})
      return
    } catch { /* try next candidate */ }
  }
}

function createRealPart(id, color, position, rotation, scale = 1) {
  const part = findPart(id)
  if (!part?.create) return null
  try {
    const object = part.create(color ?? part.defaultColor)
    if (position) object.position.fromArray(position)
    if (rotation) object.rotation.set(...rotation)
    object.scale.setScalar(scale)
    object.userData.menuHeroPart = id
    return object
  } catch (error) {
    console.warn(`[BrickLab menu] Unable to create hero part ${id}`, error)
    return null
  }
}

function applySavedTransform(object, state) {
  if (Array.isArray(state?.position) && state.position.length >= 3) object.position.fromArray(state.position)
  if (Array.isArray(state?.rotation) && state.rotation.length >= 3) object.rotation.set(state.rotation[0], state.rotation[1], state.rotation[2])
}

function populateSavedProject(group, project) {
  if (!Array.isArray(project?.parts) || project.parts.length === 0) return 0
  const states = project.parts.length > 140
    ? project.parts.filter((_, index) => index % Math.ceil(project.parts.length / 140) === 0).slice(0, 140)
    : project.parts
  let count = 0
  for (const state of states) {
    const part = findPart(state?.partId)
    if (!part?.create) continue
    try {
      const object = part.create(state.color ?? part.defaultColor)
      applySavedTransform(object, state)
      group.add(object)
      count += 1
    } catch { /* skip incompatible legacy part */ }
  }
  return count
}

function populateShowcase(group) {
  // Every visible item is produced by the real BrickLab part factory. This is not a baked image.
  const specs = [
    ['technic-frame-5x7', 0x262a2e, [0, -2.35, -0.72], [Math.PI / 2, 0, 0]],
    ['gearbox-fnr', 0x30353a, [-2.45, -0.15, 0.10], [0, -Math.PI / 2, 0]],
    ['open-differential', 0x383d42, [1.15, 0.05, 0.22], [0, 0.18, 0]],
    ['gear-36', 0x202428, [2.42, 0.14, 0.20], [Math.PI / 2, 0, Math.PI / 36]],
    ['gear-20', 0xc9ad78, [0.38, 0.02, 0.52], [Math.PI / 2, 0, Math.PI / 20]],
    ['bevel-gear-12', 0xc9ad78, [-.72, .30, .62], [0, 0, Math.PI / 2]],
    ['bearing-block', 0x25292d, [3.04, -0.14, 0.08], [0, Math.PI / 2, 0]],
    ['motor', 0x2c3136, [-4.00, -0.12, 0.04], [0, Math.PI / 2, 0]],
  ]
  let count = 0
  for (const [id, color, position, rotation] of specs) {
    const object = createRealPart(id, color, position, rotation)
    if (!object) continue
    group.add(object)
    count += 1
  }
  return count
}

function disposeTree(root) {
  root.traverse(object => {
    if (object.geometry?.dispose) object.geometry.dispose()
    const materials = Array.isArray(object.material) ? object.material : object.material ? [object.material] : []
    for (const material of materials) material.dispose?.()
  })
}

function mountHero(shell, project, settings) {
  const fallback = shell.querySelector('#blHeroFallback')
  let renderer = null
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
  } catch (error) {
    console.warn('[BrickLab menu] WebGL hero unavailable', error)
    fallback?.classList.add('show')
    return { dispose() {} }
  }

  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.13
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.domElement.className = 'bl-hero-canvas'
  renderer.domElement.setAttribute('aria-label', 'Интерактивное 3D-превью механизма')
  shell.append(renderer.domElement)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(34, 1, .05, 160)
  const modelPivot = new THREE.Group()
  const model = new THREE.Group()
  modelPivot.add(model)
  scene.add(modelPivot)

  const hemi = new THREE.HemisphereLight(0xcfe2e1, 0x1a2023, 2.25)
  scene.add(hemi)
  const key = new THREE.DirectionalLight(0xffffff, 4.5)
  key.position.set(7, 10, 8)
  key.castShadow = true
  key.shadow.mapSize.set(1024, 1024)
  scene.add(key)
  const mint = new THREE.PointLight(0x67f2cb, 7.5, 18, 2)
  mint.position.set(-5, 1.5, 5)
  scene.add(mint)
  const cool = new THREE.PointLight(0x7ca8ff, 4.4, 16, 2)
  cool.position.set(5, 3, -4)
  scene.add(cool)
  const rim = new THREE.DirectionalLight(0xbad2ff, 1.8)
  rim.position.set(-6, 5, -7)
  scene.add(rim)

  let count = populateSavedProject(model, project)
  const usingSavedProject = count > 0
  if (!count) count = populateShowcase(model)
  if (!count) {
    fallback?.classList.add('show')
    renderer.domElement.style.display = 'none'
    return { dispose() { renderer.dispose() } }
  }

  model.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(model)
  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  const largest = Math.max(size.x, size.y, size.z, .1)
  model.position.sub(center)
  const desiredSpan = usingSavedProject ? 7.0 : 7.6
  model.scale.setScalar(Math.min(1.45, desiredSpan / largest))
  model.rotation.set(-.10, -.28, .015)
  model.updateMatrixWorld(true)

  const normalizedBox = new THREE.Box3().setFromObject(model)
  const sphere = normalizedBox.getBoundingSphere(new THREE.Sphere())
  const radius = Math.max(2.0, sphere.radius)
  const baseCamera = new THREE.Vector3(radius * 1.23, radius * .62, radius * 2.55)
  camera.position.copy(baseCamera)
  camera.lookAt(0, 0, 0)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = .065
  controls.enablePan = false
  controls.enableZoom = true
  controls.rotateSpeed = .62
  controls.zoomSpeed = .72
  controls.minDistance = radius * 1.45
  controls.maxDistance = radius * 4.2
  controls.target.set(0, 0, 0)
  controls.autoRotate = settings.autoRotate && !matchMedia('(prefers-reduced-motion: reduce)').matches
  controls.autoRotateSpeed = .68

  let resumeTimer = 0
  const pauseAutoRotate = () => {
    controls.autoRotate = false
    clearTimeout(resumeTimer)
    resumeTimer = setTimeout(() => {
      controls.autoRotate = settings.autoRotate && !matchMedia('(prefers-reduced-motion: reduce)').matches
    }, 2600)
  }
  controls.addEventListener('start', pauseAutoRotate)
  renderer.domElement.addEventListener('pointerdown', () => renderer.domElement.classList.add('is-grabbing'))
  window.addEventListener('pointerup', () => renderer?.domElement.classList.remove('is-grabbing'))
  renderer.domElement.addEventListener('dblclick', () => {
    camera.position.copy(baseCamera)
    controls.target.set(0, 0, 0)
    controls.update()
    pauseAutoRotate()
  })

  let alive = true
  const clock = new THREE.Clock()
  const render = () => {
    if (!alive) return
    const t = clock.getElapsedTime()
    modelPivot.position.y = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : Math.sin(t * .72) * .045
    controls.update()
    renderer.render(scene, camera)
    requestAnimationFrame(render)
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
  render()

  return {
    setAutoRotate(value) {
      settings.autoRotate = !!value
      controls.autoRotate = !!value && !matchMedia('(prefers-reduced-motion: reduce)').matches
    },
    dispose() {
      alive = false
      clearTimeout(resumeTimer)
      observer.disconnect()
      controls.dispose()
      disposeTree(model)
      renderer.dispose()
      renderer.domElement.remove()
      renderer = null
    },
    usingSavedProject,
  }
}

function wireSettings(menu, hero, menuSettings) {
  const layer = menu.querySelector('#blMenuSettings')
  const autoRotate = menu.querySelector('#blAutoRotate')
  const bgVideo = menu.querySelector('#blBgVideo')
  const master = menu.querySelector('#blMasterVolume')
  const music = menu.querySelector('#blMusicVolume')
  const mute = menu.querySelector('#blMute')
  const masterOut = menu.querySelector('#blMasterOut')
  const musicOut = menu.querySelector('#blMusicOut')
  const video = menu.querySelector('.bl-menu-video')
  let audio = readAudioSettings()

  autoRotate.checked = menuSettings.autoRotate
  bgVideo.checked = menuSettings.backgroundVideo
  master.value = Math.round(audio.master * 100)
  music.value = Math.round(audio.music * 100)
  mute.checked = audio.mute
  masterOut.textContent = `${master.value}%`
  musicOut.textContent = `${music.value}%`

  const open = () => { layer.classList.add('open'); layer.setAttribute('aria-hidden', 'false'); menu.querySelector('[data-settings-close]')?.focus() }
  const close = () => { layer.classList.remove('open'); layer.setAttribute('aria-hidden', 'true') }

  autoRotate.addEventListener('change', () => {
    menuSettings.autoRotate = autoRotate.checked
    saveMenuSettings(menuSettings)
    hero.setAutoRotate?.(menuSettings.autoRotate)
  })
  bgVideo.addEventListener('change', async () => {
    menuSettings.backgroundVideo = bgVideo.checked
    saveMenuSettings(menuSettings)
    if (bgVideo.checked) await attachBackgroundVideo(menu, menuSettings)
    else { video.pause(); video.classList.add('is-unavailable') }
  })
  master.addEventListener('input', () => {
    audio.master = Number(master.value) / 100
    masterOut.textContent = `${master.value}%`
    saveAudioSettings(audio)
  })
  music.addEventListener('input', () => {
    audio.music = Number(music.value) / 100
    musicOut.textContent = `${music.value}%`
    saveAudioSettings(audio)
  })
  mute.addEventListener('change', () => { audio.mute = mute.checked; saveAudioSettings(audio) })
  layer.querySelector('[data-settings-close]')?.addEventListener('click', close)
  layer.addEventListener('pointerdown', event => { if (event.target === layer) close() })
  return { open, close, isOpen: () => layer.classList.contains('open') }
}

export async function showMainMenu() {
  ensureStyles()
  const snapshot = readProjectSnapshot()
  const menuSettings = readMenuSettings()
  const menu = document.createElement('section')
  menu.id = 'bricklab-main-menu'
  menu.className = 'bl-menu-enter'
  menu.setAttribute('aria-label', 'BrickLab 3D main menu')
  menu.innerHTML = createMenuMarkup(snapshot)
  document.body.append(menu)
  document.body.classList.add('bricklab-menu-open')

  const hero = mountHero(menu.querySelector('#blHeroShell'), snapshot?.project, menuSettings)
  const settings = wireSettings(menu, hero, menuSettings)
  attachBackgroundVideo(menu, menuSettings)

  const menuButtons = [...menu.querySelectorAll('.bl-menu-action:not([disabled])')]
  let activeIndex = 0
  const setActive = index => {
    if (!menuButtons.length) return
    activeIndex = (index + menuButtons.length) % menuButtons.length
    menuButtons.forEach((button, i) => button.classList.toggle('active', i === activeIndex))
  }
  menuButtons.forEach((button, index) => {
    button.addEventListener('mouseenter', () => setActive(index))
    button.addEventListener('focus', () => setActive(index))
  })

  return new Promise(resolve => {
    let resolved = false
    const finish = action => {
      if (resolved) return
      resolved = true
      window.removeEventListener('keydown', onKeyDown, true)
      menu.classList.remove('bl-menu-enter')
      menu.classList.add('bl-menu-exit')
      setTimeout(() => {
        hero.dispose?.()
        menu.remove()
        document.body.classList.remove('bricklab-menu-open')
        resolve({ action, snapshot })
      }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 360)
    }

    const activate = action => {
      if (action === 'settings') { settings.open(); return }
      if (action === 'continue' && !snapshot?.project?.parts?.length) return
      finish(action)
    }

    menu.addEventListener('click', event => {
      const button = event.target.closest('[data-menu-action]')
      if (!button || button.disabled) return
      activate(button.dataset.menuAction)
    })

    const onKeyDown = event => {
      if (settings.isOpen()) {
        if (event.key === 'Escape') { event.preventDefault(); settings.close() }
        return
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowRight') { event.preventDefault(); setActive(activeIndex + 1); menuButtons[activeIndex]?.focus(); return }
      if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') { event.preventDefault(); setActive(activeIndex - 1); menuButtons[activeIndex]?.focus(); return }
      if (event.key === 'Enter' && document.activeElement === document.body) { event.preventDefault(); menuButtons[activeIndex]?.click() }
    }
    window.addEventListener('keydown', onKeyDown, true)
  })
}

export const BrickLabMainMenu = Object.freeze({
  projectKeys: PROJECT_KEYS,
  settingsKey: MENU_SETTINGS_KEY,
  videoCandidates: MENU_VIDEO_CANDIDATES,
})
