import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { findPart } from '../parts.js'

const PROJECT_KEYS = ['bricklab.project.v2', 'bricklab.project.v1']
const MENU_SETTINGS_KEY = 'bricklab.menu.v3'
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
  const existing = document.getElementById('bricklab-main-menu-v3-css')
  if (existing) return existing.sheet ? Promise.resolve() : new Promise(resolve => {
    existing.addEventListener('load', resolve, { once: true })
    existing.addEventListener('error', resolve, { once: true })
  })
  const link = document.createElement('link')
  link.id = 'bricklab-main-menu-v3-css'
  link.rel = 'stylesheet'
  link.href = new URL('./main-menu-v3.css', import.meta.url).href
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
  const projectName = String(project?.name || 'Последний проект')
  const recent = hasProject
    ? `<button class="bl3-card" type="button" data-action="continue">
        <span class="bl3-thumb">⚙</span>
        <span class="bl3-card-copy"><strong>${escapeHtml(projectName)}</strong><small>${escapeHtml(relativeDate(project.savedAt))}</small><small>${escapeHtml(projectStats(project))}</small></span>
        <span class="bl3-more">⋯</span>
      </button>`
    : `<div class="bl3-empty">Сохранённых проектов пока нет.<br>Создай первую конструкцию — она появится здесь автоматически.</div>`

  return `<div class="bl3-bg" aria-hidden="true">
    <video class="bl3-video missing" muted loop playsinline preload="auto"></video>
    <div class="bl3-overlay"></div><div class="bl3-noise"></div><div class="bl3-vignette"></div>
  </div>
  <div class="bl3-ui">
    <header class="bl3-top">
      <div class="bl3-nav"><span>Ideas</span><i>/</i><span>Parts</span><i>/</i><span>Motion</span><i>/</i><span>More</span></div>
      <div class="bl3-tag">Build a brighter tomorrow</div>
    </header>

    <aside class="bl3-left">
      <h2 class="bl3-kicker">Недавние проекты</h2>
      <div class="bl3-recent">${recent}</div>
      <button class="bl3-open" type="button" data-action="open"><span>＋</span><span>Открыть другой проект...</span></button>
    </aside>

    <main class="bl3-center">
      <h1 class="bl3-title">BrickLab <em>3D</em></h1>
      <div class="bl3-sub">Design&nbsp;&nbsp;·&nbsp;&nbsp;Simulate&nbsp;&nbsp;·&nbsp;&nbsp;Bring to life</div>
      <div class="bl3-hero" id="bl3Hero">
        <div class="bl3-glow"></div><div class="bl3-rings"></div>
        <div class="bl3-fallback" id="bl3Fallback">3D preview unavailable</div>
        <div class="bl3-hero-badge">BRICKLAB DRIVETRAIN · LIVE 3D</div>
        <div class="bl3-hero-hint">Drag — rotate · Wheel — zoom · Double click — reset</div>
      </div>
      <div class="bl3-actions" role="menu" aria-label="Главное меню">
        <button class="bl3-action is-primary active" type="button" role="menuitem" data-action="new"><span class="bl3-label">Новый проект</span><span class="bl3-arrow">›</span></button>
        <button class="bl3-action" type="button" role="menuitem" data-action="continue" ${hasProject ? '' : 'disabled'}><span class="bl3-label">Продолжить</span><span class="bl3-arrow">›</span></button>
        <button class="bl3-action" type="button" role="menuitem" data-action="settings"><span class="bl3-label">Настройки</span><span class="bl3-arrow">›</span></button>
      </div>
    </main>

    <aside class="bl3-right" aria-hidden="true">
      <div class="bl3-note a"><strong>Mechanics</strong>Creativity<br>without limits</div>
      <div class="bl3-note b"><strong>Test</strong>Ideas<br>in motion</div>
      <div class="bl3-note c">Different<br>perspectives<br>a brighter build</div>
    </aside>

    <footer class="bl3-footer">
      <div class="bl3-footer-left">Small parts · great ideas</div>
      <div class="bl3-links"><a href="https://github.com/Deenfoool/BrickLab-3D" target="_blank" rel="noopener noreferrer">GitHub</a><span>|</span><a href="https://github.com/Deenfoool/portfolio" target="_blank" rel="noopener noreferrer">Portfolio</a><span>|</span><button type="button" data-action="settings">Settings</button></div>
      <div class="bl3-version">${VERSION_LABEL}</div>
    </footer>
  </div>

  <div class="bl3-settings" id="bl3Settings" aria-hidden="true">
    <section class="bl3-settings-panel" role="dialog" aria-modal="true" aria-labelledby="bl3SettingsTitle">
      <div class="bl3-settings-head"><div><small>BRICKLAB 3D</small><h2 id="bl3SettingsTitle">Настройки</h2></div><button class="bl3-close" type="button" data-close aria-label="Закрыть">×</button></div>
      <div class="bl3-settings-grid">
        <div class="bl3-row"><div><label for="bl3Auto">Автовращение 3D-превью</label><small>После ручного вращения механизм снова продолжит медленный оборот.</small></div><input id="bl3Auto" type="checkbox"></div>
        <div class="bl3-row"><div><label for="bl3Motion">Движение механизма</label><small>Шестерни и валы демонстрационной модели работают прямо в меню.</small></div><input id="bl3Motion" type="checkbox"></div>
        <div class="bl3-row"><div><label for="bl3Video">Фоновое видео</label><small>При отсутствии файла используется встроенный тёмный фон.</small></div><input id="bl3Video" type="checkbox"></div>
        <div class="bl3-row"><div><label for="bl3Master">Общая громкость</label></div><div><input id="bl3Master" type="range" min="0" max="100"><span class="bl3-out" id="bl3MasterOut"></span></div></div>
        <div class="bl3-row"><div><label for="bl3Music">Музыка</label></div><div><input id="bl3Music" type="range" min="0" max="100"><span class="bl3-out" id="bl3MusicOut"></span></div></div>
        <div class="bl3-row"><div><label for="bl3Mute">Без звука</label></div><input id="bl3Mute" type="checkbox"></div>
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
      if (!child.isMesh) return
      child.castShadow = true
      child.receiveShadow = true
    })
    return object
  } catch (error) {
    console.warn(`[BrickLab menu] Could not create ${id}`, error)
    return null
  }
}

function hierarchyVisible(object, stopAt) {
  for (let node = object; node && node !== stopAt; node = node.parent) if (node.visible === false) return false
  return true
}

function renderedBounds(root) {
  root.updateMatrixWorld(true)
  const result = new THREE.Box3()
  let hasMesh = false
  root.traverse(object => {
    if (!object.isMesh || !object.geometry || !hierarchyVisible(object, root.parent)) return
    if (!object.geometry.boundingBox) object.geometry.computeBoundingBox()
    if (!object.geometry.boundingBox) return
    const box = object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld)
    if (!Number.isFinite(box.min.x) || !Number.isFinite(box.max.x)) return
    if (!hasMesh) { result.copy(box); hasMesh = true } else result.union(box)
  })
  return hasMesh ? result : new THREE.Box3().setFromObject(root)
}

function centerVisual(object) {
  const box = renderedBounds(object)
  const center = box.getCenter(new THREE.Vector3())
  object.position.sub(center)
  object.updateMatrixWorld(true)
  return object
}

function showcaseAssembly(root) {
  const moving = []
  const add = (id, color, position, rotation = [0, 0, 0], spin = null, scale = 1) => {
    const part = tryPart(id, color)
    if (!part) return null
    centerVisual(part)
    const pivot = new THREE.Group()
    pivot.position.fromArray(position)
    pivot.rotation.set(...rotation)
    pivot.scale.setScalar(scale)
    pivot.add(part)
    root.add(pivot)
    if (spin) moving.push({ object: part, axis: spin.axis, speed: spin.speed })
    return pivot
  }

  // Fixed menu hero: the same curated BrickLab drivetrain for every user.
  // Recent projects stay in the left panel but never replace the hero model.
  add('technic-frame-5x7', 0x23282c, [0, -.52, -.90], [Math.PI / 2, 0, 0], null, 1.02)
  add('motor', 0x343a40, [-3.45, -.20, -.05], [0, Math.PI / 2, 0], null, .92)
  add('gearbox-fnr', 0x30373c, [-1.32, -.18, .02], [0, 0, 0], null, .92)
  add('open-differential', 0x3c4349, [1.38, -.06, .08], [0, 0, 0], null, 1.02)
  add('bearing-block', 0x282e32, [3.22, -.14, .04], [0, Math.PI / 2, 0], null, .94)

  add('gear-36', 0x22272b, [1.45, .22, 1.42], [Math.PI / 2, 0, 0], { axis: 'y', speed: .42 }, .96)
  add('gear-20', 0xc9ad78, [-.44, .26, 1.45], [Math.PI / 2, 0, 0], { axis: 'y', speed: -.75 }, .98)
  add('gear-16', 0x899298, [-1.72, .25, 1.42], [Math.PI / 2, 0, 0], { axis: 'y', speed: .94 }, .98)
  add('bevel-gear-12', 0xc9ad78, [-.85, 1.10, .47], [0, 0, Math.PI / 2], { axis: 'y', speed: .72 }, .92)
  add('gear-8', 0xaeb5ba, [.12, -.82, 1.13], [Math.PI / 2, 0, 0], { axis: 'y', speed: 1.26 }, .9)

  add('axle-7', 0x24282c, [-.12, -.03, -.02], [0, 0, 0], { axis: 'x', speed: .52 }, .96)
  add('axle-5', 0xb8bec2, [2.65, -.02, .05], [0, 0, 0], { axis: 'x', speed: -.45 }, .94)
  add('axle-coupler', 0xb8bec2, [-2.60, -.08, -.02], [0, 0, 0], { axis: 'x', speed: .52 }, .9)

  return moving
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

function mountHero(shell, settings) {
  const fallback = shell.querySelector('#bl3Fallback')
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
  renderer.toneMappingExposure = 1.2
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.domElement.className = 'bl3-hero-canvas'
  renderer.domElement.setAttribute('aria-label', 'Интерактивная демонстрационная модель BrickLab drivetrain')
  shell.append(renderer.domElement)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(31, 1, .05, 180)
  const floatRoot = new THREE.Group()
  const model = new THREE.Group()
  floatRoot.add(model)
  scene.add(floatRoot)

  scene.add(new THREE.HemisphereLight(0xd8ebe7, 0x101618, 2.35))
  const key = new THREE.DirectionalLight(0xffffff, 5.0)
  key.position.set(7, 9, 8); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); scene.add(key)
  const mint = new THREE.PointLight(0x67f2cb, 8.6, 20, 2)
  mint.position.set(-5, 1.8, 5); scene.add(mint)
  const blue = new THREE.PointLight(0x6c94ff, 4.0, 18, 2)
  blue.position.set(5, 3, -5); scene.add(blue)
  const rim = new THREE.DirectionalLight(0xbcd5ff, 1.8)
  rim.position.set(-6, 5, -7); scene.add(rim)

  const moving = showcaseAssembly(model)
  if (!model.children.length) {
    fallback?.classList.add('show')
    renderer.domElement.style.display = 'none'
    return { dispose() { renderer.dispose() }, setAutoRotate() {}, setMechanicalMotion() {} }
  }

  model.updateMatrixWorld(true)
  const initial = renderedBounds(model)
  model.position.sub(initial.getCenter(new THREE.Vector3()))
  model.updateMatrixWorld(true)
  const visualBox = renderedBounds(model)
  const size = visualBox.getSize(new THREE.Vector3())
  const largest = Math.max(size.x, size.y, size.z, .1)
  model.scale.setScalar(8.65 / largest)
  model.rotation.set(-.055, -.30, .012)
  model.updateMatrixWorld(true)

  const sphere = renderedBounds(model).getBoundingSphere(new THREE.Sphere())
  const radius = Math.max(2.0, sphere.radius)
  const homePosition = new THREE.Vector3(radius * 1.02, radius * .48, radius * 2.18)
  camera.position.copy(homePosition)
  camera.lookAt(0, -.03, 0)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = .065
  controls.enablePan = false
  controls.enableZoom = true
  controls.rotateSpeed = .62
  controls.zoomSpeed = .75
  controls.minDistance = radius * 1.28
  controls.maxDistance = radius * 3.7
  controls.target.set(0, -.03, 0)
  controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE
  controls.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY
  controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE
  controls.autoRotate = settings.autoRotate && !reducedMotion()
  controls.autoRotateSpeed = .58

  let resumeTimer = 0
  const resumeAuto = () => {
    clearTimeout(resumeTimer)
    resumeTimer = setTimeout(() => { controls.autoRotate = settings.autoRotate && !reducedMotion() }, 2300)
  }
  const pauseAuto = () => { controls.autoRotate = false; resumeAuto() }
  controls.addEventListener('start', pauseAuto)

  const onPointerDown = () => renderer.domElement.classList.add('grab')
  const onPointerUp = () => renderer?.domElement.classList.remove('grab')
  const resetCamera = () => {
    camera.position.copy(homePosition)
    controls.target.set(0, -.03, 0)
    controls.update()
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
      renderer.domElement.removeEventListener('dblclick', resetCamera)
      window.removeEventListener('pointerup', onPointerUp)
      disposeTree(model)
      renderer.dispose()
      renderer.domElement.remove()
      renderer = null
    },
  }
}

async function attachVideo(menu, settings) {
  const video = menu.querySelector('.bl3-video')
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
  const layer = menu.querySelector('#bl3Settings')
  const auto = menu.querySelector('#bl3Auto')
  const motion = menu.querySelector('#bl3Motion')
  const videoToggle = menu.querySelector('#bl3Video')
  const master = menu.querySelector('#bl3Master')
  const music = menu.querySelector('#bl3Music')
  const mute = menu.querySelector('#bl3Mute')
  const masterOut = menu.querySelector('#bl3MasterOut')
  const musicOut = menu.querySelector('#bl3MusicOut')
  const video = menu.querySelector('.bl3-video')
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
  menu.id = 'bricklab-main-menu-v3'
  menu.className = 'bl3-enter'
  menu.setAttribute('aria-label', 'BrickLab 3D main menu')
  menu.innerHTML = markup(snapshot)
  document.body.append(menu)
  document.body.classList.add('bricklab-menu-open')

  const hero = mountHero(menu.querySelector('#bl3Hero'), menuSettings)
  const settings = wireSettings(menu, hero, menuSettings)
  attachVideo(menu, menuSettings)

  const buttons = [...menu.querySelectorAll('.bl3-action:not([disabled])')]
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
      menu.classList.remove('bl3-enter')
      menu.classList.add('bl3-exit')
      setTimeout(() => {
        hero.dispose()
        menu.remove()
        document.body.classList.remove('bricklab-menu-open')
        resolve({ action, snapshot })
      }, reducedMotion() ? 0 : 340)
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
      if (event.key === 'ArrowDown' || event.key === 'ArrowRight') { event.preventDefault(); setActive(activeIndex + 1); buttons[activeIndex]?.focus(); return }
      if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') { event.preventDefault(); setActive(activeIndex - 1); buttons[activeIndex]?.focus(); return }
      if (event.key === 'Enter' && document.activeElement === document.body) { event.preventDefault(); buttons[activeIndex]?.click() }
    }
    window.addEventListener('keydown', onKeyDown, true)
  })
}

export const BrickLabMainMenuV3 = Object.freeze({
  projectKeys: PROJECT_KEYS,
  settingsKey: MENU_SETTINGS_KEY,
  videoUrls: VIDEO_URLS,
  heroSource: 'fixed-production-drivetrain',
})
