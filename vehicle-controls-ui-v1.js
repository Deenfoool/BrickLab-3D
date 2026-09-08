const UI_VERSION = 'vehicle-controls-ui-v1'
const held = new Set()
let installed = false
let parking = false
let wasVisible = false

const TEXT = {
  en: {
    title: 'VEHICLE', hint: 'A / D · SPACE · P', left: 'Steer left', center: 'Center steering', right: 'Steer right',
    brakeButton: 'BRAKE', brakeTitle: 'Service brake', parkingTitle: 'Parking brake', speed: 'Speed / accel', steering: 'Steering',
    mode: 'Mode', brake: 'Brake', size: 'Wheelbase / track', mass: 'Mass / CoG', metrics: 'Test metrics',
    physical: 'PHYSICAL', mixed: 'MIXED', virtual: 'VIRTUAL TIRE', joints: 'JOINTS', park: 'PARK', brakeMetric: 'brake',
  },
  ru: {
    title: 'МАШИНА', hint: 'A / D · ПРОБЕЛ · P', left: 'Руль влево', center: 'Руль прямо', right: 'Руль вправо',
    brakeButton: 'ТОРМОЗ', brakeTitle: 'Рабочий тормоз', parkingTitle: 'Стояночный тормоз', speed: 'Скорость / ускорение', steering: 'Руль',
    mode: 'Режим', brake: 'Тормоз', size: 'База / колея', mass: 'Масса / ЦТ', metrics: 'Метрики',
    physical: 'ФИЗИЧЕСКИЙ', mixed: 'СМЕШАННЫЙ', virtual: 'ВИРТУАЛЬНЫЙ', joints: 'ШАРНИРА', park: 'РУЧНИК', brakeMetric: 'тормоз',
  },
}

function lang() {
  return document.documentElement.lang === 'ru' || localStorage.getItem('bricklab.ui.language.v1') === 'ru' ? 'ru' : 'en'
}
function t(key) { return TEXT[lang()][key] ?? TEXT.en[key] ?? key }

function activeRuntime() {
  const mode = document.querySelector('.mode.active')?.dataset.mode
  return mode === 'simulate' || mode === 'test'
}

function api() { return globalThis.BrickLabVehicle }
function performanceApi() { return globalThis.BrickLabVehiclePerformance }

function applyKeys() {
  if (!activeRuntime() || !api()) return
  const left = held.has('KeyA') || held.has('ArrowLeft')
  const right = held.has('KeyD') || held.has('ArrowRight')
  api().setSteering(left === right ? 0 : left ? 1 : -1)
  api().setBrake(held.has('Space') ? 1 : 0)
}

function installStyle() {
  if (document.querySelector('style[data-bricklab-vehicle-controls]')) return
  const style = document.createElement('style')
  style.dataset.bricklabVehicleControls = UI_VERSION
  style.textContent = `
    .vehicle-control-deck{position:absolute;left:50%;bottom:18px;transform:translateX(-50%);z-index:28;display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid rgba(116,230,166,.22);border-radius:12px;background:rgba(13,17,19,.88);backdrop-filter:blur(14px);box-shadow:0 10px 30px rgba(0,0,0,.28);color:#dfe8e3;font:700 11px/1.2 system-ui;user-select:none}
    .vehicle-control-deck.hidden{display:none}.vehicle-control-deck button{height:32px;min-width:36px;border:1px solid #324039;border-radius:8px;background:#1a211e;color:#dfe8e3;font:800 12px system-ui;cursor:pointer}.vehicle-control-deck button.active,.vehicle-control-deck button:active{border-color:#74e6a6;background:#20352b;color:#91f3bb}.vehicle-control-deck .vehicle-brake{min-width:64px}.vehicle-control-deck .vehicle-parking.active{border-color:#ffb65c;color:#ffcf8c;background:#382b1d}.vehicle-control-readout{display:grid;grid-template-columns:auto auto;gap:2px 8px;min-width:260px;padding:0 6px}.vehicle-control-readout span{color:#82928a;font-weight:650}.vehicle-control-readout b{text-align:right;color:#dfe8e3}.vehicle-control-title{display:flex;flex-direction:column;gap:2px;padding-right:6px;border-right:1px solid #29332f}.vehicle-control-title strong{font-size:10px;letter-spacing:.08em;color:#74e6a6}.vehicle-control-title small{font-size:8px;color:#77847e;font-weight:600}
  `
  document.head.append(style)
}

function applyLanguage(deck) {
  if (!deck || deck.dataset.vehicleLang === lang()) return
  deck.dataset.vehicleLang = lang()
  deck.querySelector('[data-vehicle-title]').textContent = t('title')
  deck.querySelector('[data-vehicle-hint]').textContent = t('hint')
  const left = deck.querySelector('[data-steer="1"]')
  const center = deck.querySelector('[data-steer="0"]')
  const right = deck.querySelector('[data-steer="-1"]')
  if (left) left.title = t('left')
  if (center) center.title = t('center')
  if (right) right.title = t('right')
  const brake = deck.querySelector('[data-brake]')
  if (brake) { brake.textContent = t('brakeButton'); brake.title = t('brakeTitle') }
  const parkingButton = deck.querySelector('[data-parking]')
  if (parkingButton) parkingButton.title = t('parkingTitle')
  for (const key of ['speed','steering','mode','brake','size','mass','metrics']) {
    const label = deck.querySelector(`[data-vehicle-label="${key}"]`)
    if (label) label.textContent = t(key)
  }
}

function install() {
  if (installed) return
  const viewport = document.querySelector('.viewport-wrap')
  if (!viewport) return requestAnimationFrame(install)
  installed = true
  installStyle()
  const deck = document.createElement('div')
  deck.id = 'vehicleControlDeck'
  deck.className = 'vehicle-control-deck hidden'
  deck.innerHTML = `
    <div class="vehicle-control-title"><strong data-vehicle-title>VEHICLE</strong><small data-vehicle-hint>A / D · SPACE · P</small></div>
    <button type="button" data-steer="1">A ◀</button>
    <button type="button" data-steer="0">●</button>
    <button type="button" data-steer="-1">▶ D</button>
    <button type="button" class="vehicle-brake" data-brake>BRAKE</button>
    <button type="button" class="vehicle-parking" data-parking>P</button>
    <div class="vehicle-control-readout">
      <span data-vehicle-label="speed">Speed / accel</span><b data-vehicle-motion>0.00 m/s · 0.00 m/s²</b>
      <span data-vehicle-label="steering">Steering</span><b data-vehicle-steer>0°</b>
      <span data-vehicle-label="mode">Mode</span><b data-vehicle-mode>VIRTUAL TIRE</b>
      <span data-vehicle-label="brake">Brake</span><b data-vehicle-brake>0%</b>
      <span data-vehicle-label="size">Wheelbase / track</span><b data-vehicle-size>—</b>
      <span data-vehicle-label="mass">Mass / CoG</span><b data-vehicle-mass>—</b>
      <span data-vehicle-label="metrics">Test metrics</span><b data-vehicle-performance>—</b>
    </div>`
  viewport.append(deck)
  applyLanguage(deck)

  const stopSteer = () => api()?.setSteering(0)
  deck.querySelectorAll('[data-steer]').forEach(button => {
    button.addEventListener('pointerdown', event => {
      event.preventDefault()
      api()?.setSteering(Number(button.dataset.steer))
      button.setPointerCapture?.(event.pointerId)
    })
    button.addEventListener('pointerup', stopSteer)
    button.addEventListener('pointercancel', stopSteer)
  })
  const brake = deck.querySelector('[data-brake]')
  brake.addEventListener('pointerdown', event => {
    event.preventDefault(); api()?.setBrake(1); brake.classList.add('active')
    brake.setPointerCapture?.(event.pointerId)
  })
  const releaseBrake = () => { api()?.setBrake(0); brake.classList.remove('active') }
  brake.addEventListener('pointerup', releaseBrake)
  brake.addEventListener('pointercancel', releaseBrake)
  deck.querySelector('[data-parking]').addEventListener('click', event => {
    parking = !parking
    api()?.setParkingBrake(parking)
    event.currentTarget.classList.toggle('active', parking)
  })
}

window.addEventListener('keydown', event => {
  if (!activeRuntime() || event.repeat || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '')) return
  if (['KeyA','KeyD','ArrowLeft','ArrowRight','Space'].includes(event.code)) {
    held.add(event.code)
    if (event.code === 'Space') event.preventDefault()
    applyKeys()
  } else if (event.code === 'KeyP') {
    parking = !parking
    api()?.setParkingBrake(parking)
    event.preventDefault()
  }
})

window.addEventListener('keyup', event => {
  if (!held.delete(event.code)) return
  applyKeys()
})

function render() {
  install()
  const deck = document.getElementById('vehicleControlDeck')
  applyLanguage(deck)
  const state = api()?.getState?.()
  const performance = performanceApi()?.get?.()
  const visible = activeRuntime() && Boolean(state?.enabled)
  deck?.classList.toggle('hidden', !visible)

  if (!visible && wasVisible) {
    held.clear()
    api()?.setSteering(0)
    api()?.setBrake(0)
    api()?.resetVisuals?.()
  }
  wasVisible = visible

  if (visible && deck) {
    const steer = deck.querySelector('[data-vehicle-steer]')
    const mode = deck.querySelector('[data-vehicle-mode]')
    const brake = deck.querySelector('[data-vehicle-brake]')
    const mass = deck.querySelector('[data-vehicle-mass]')
    const motion = deck.querySelector('[data-vehicle-motion]')
    const size = deck.querySelector('[data-vehicle-size]')
    const performanceEl = deck.querySelector('[data-vehicle-performance]')
    if (motion) motion.textContent = `${(state.speedMps || 0).toFixed(2)} m/s · ${(state.accelerationMps2 || 0).toFixed(2)} m/s²`
    if (steer) steer.textContent = `${(state.centerSteerDeg || 0).toFixed(1)}° · L ${(state.leftSteerDeg || 0).toFixed(1)}° / R ${(state.rightSteerDeg || 0).toFixed(1)}°`
    if (mode) {
      const names = { physical: t('physical'), mixed: t('mixed'), virtual: t('virtual') }
      const base = names[state.steeringMode] ?? String(state.steeringMode || t('virtual')).toUpperCase()
      mode.textContent = state.physicalSteeringJoints ? `${base} · ${state.physicalSteeringJoints} ${t('joints')}` : base
    }
    if (brake) brake.textContent = `${Math.round((state.brakeInput || 0) * 100)}%${state.parkingBrake ? ` · ${t('park')}` : ''}`
    if (size) size.textContent = `${(state.wheelbaseM || 0).toFixed(3)} / ${(state.trackM || 0).toFixed(3)} m`
    if (mass) {
      const cog = Array.isArray(state.comStud) ? state.comStud.map(v => Number(v).toFixed(1)).join(',') : '—'
      mass.textContent = `${(state.massKg || 0).toFixed(3)} kg · [${cog}]`
    }
    if (performanceEl) {
      const top = performance?.topSpeedMps ?? 0
      const accel = performance?.accelTimeToTarget
      const brakeDistance = performance?.lastBrakingDistanceM
      performanceEl.textContent = `Vmax ${top.toFixed(2)} · 0→${(performance?.accelTargetMps ?? .5).toFixed(1)} ${accel == null ? '—' : `${accel.toFixed(2)}s`} · ${t('brakeMetric')} ${brakeDistance == null ? '—' : `${brakeDistance.toFixed(3)}m`}`
    }
    deck.querySelector('[data-parking]')?.classList.toggle('active', Boolean(state.parkingBrake))
  }
  requestAnimationFrame(render)
}

render()
globalThis.BrickLabVehicleControlsUI = { version: UI_VERSION }
