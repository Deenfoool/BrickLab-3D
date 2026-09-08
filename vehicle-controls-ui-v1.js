const UI_VERSION = 'vehicle-controls-ui-v3'
const held = new Set()
let installed = false
let parking = false
let pointerThrottle = 0
let pointerBrake = false
let wasVisible = false

const TEXT = {
  en: {
    title: 'VEHICLE', hint: 'W / S · A / D · SPACE · P',
    speed: 'Speed / accel', throttle: 'Throttle', drive: 'Drive', steering: 'Steering', mode: 'Steering mode',
    brake: 'Brake', size: 'Wheelbase / track', mass: 'Mass / CoG', metrics: 'Test metrics',
    physical: 'PHYSICAL', mixed: 'MIXED', virtual: 'VIRTUAL TIRE', free: 'FREE',
    reverseBrake: 'REV BRAKE', park: 'PARK', motors: 'motors', wheels: 'wheels', brakeMetric: 'brake',
    forward: 'Drive forward', reverse: 'Drive reverse', left: 'Steer left', center: 'Center steering', right: 'Steer right',
    brakeTitle: 'Service brake', parkingTitle: 'Parking brake', mechanism: 'MECHANISM', manual: 'DRIVER',
  },
  ru: {
    title: 'МАШИНА', hint: 'W / S · A / D · ПРОБЕЛ · P',
    speed: 'Скорость / ускорение', throttle: 'Газ', drive: 'Привод', steering: 'Руль', mode: 'Режим руля',
    brake: 'Тормоз', size: 'База / колея', mass: 'Масса / ЦТ', metrics: 'Метрики',
    physical: 'ФИЗИЧЕСКИЙ', mixed: 'СМЕШАННЫЙ', virtual: 'ВИРТУАЛЬНЫЙ', free: 'СВОБОДНЫЙ',
    reverseBrake: 'ТОРМОЖЕНИЕ R', park: 'РУЧНИК', motors: 'мот.', wheels: 'кол.', brakeMetric: 'тормоз',
    forward: 'Тяга вперёд', reverse: 'Тяга назад', left: 'Руль влево', center: 'Руль прямо', right: 'Руль вправо',
    brakeTitle: 'Рабочий тормоз', parkingTitle: 'Стояночный тормоз', mechanism: 'МЕХАНИЗМ', manual: 'ВОДИТЕЛЬ',
  },
}

function lang() {
  return document.documentElement.lang === 'ru' || localStorage.getItem('bricklab.ui.language.v1') === 'ru' ? 'ru' : 'en'
}
function t(key) { return TEXT[lang()][key] ?? TEXT.en[key] ?? key }
function vehicle() { return globalThis.BrickLabVehicle }
function drive() { return globalThis.BrickLabVehicleDrive }
function performanceApi() { return globalThis.BrickLabVehiclePerformance }
function activeRuntime() {
  const mode = document.querySelector('.mode.active')?.dataset.mode
  return mode === 'simulate' || mode === 'test'
}

function throttleTarget() {
  const forward = held.has('KeyW') || held.has('ArrowUp')
  const reverse = held.has('KeyS') || held.has('ArrowDown')
  return forward === reverse ? pointerThrottle : forward ? 1 : -1
}
function brakeTarget() { return pointerBrake || held.has('Space') ? 1 : 0 }

function applyInputs() {
  if (!activeRuntime()) return
  const left = held.has('KeyA') || held.has('ArrowLeft')
  const right = held.has('KeyD') || held.has('ArrowRight')
  vehicle()?.setSteering(left === right ? 0 : left ? 1 : -1)
  drive()?.setThrottle(throttleTarget())
  drive()?.setManualBrake(brakeTarget())
}

function clearInputs() {
  held.clear()
  pointerThrottle = 0
  pointerBrake = false
  drive()?.setThrottle(0)
  drive()?.setManualBrake(0)
  vehicle()?.setSteering(0)
  vehicle()?.resetVisuals?.()
}

function installStyle() {
  if (document.querySelector('style[data-bricklab-vehicle-controls]')) return
  const style = document.createElement('style')
  style.dataset.bricklabVehicleControls = UI_VERSION
  style.textContent = `
    .vehicle-control-deck{position:absolute;left:50%;bottom:18px;transform:translateX(-50%);z-index:28;display:flex;align-items:center;gap:7px;padding:8px 10px;border:1px solid rgba(116,230,166,.22);border-radius:12px;background:rgba(13,17,19,.88);backdrop-filter:blur(14px);box-shadow:0 10px 30px rgba(0,0,0,.28);color:#dfe8e3;font:700 11px/1.2 system-ui;user-select:none}
    .vehicle-control-deck.hidden{display:none}.vehicle-control-deck button{height:32px;min-width:36px;border:1px solid #324039;border-radius:8px;background:#1a211e;color:#dfe8e3;font:800 12px system-ui;cursor:pointer}.vehicle-control-deck button.active,.vehicle-control-deck button:active{border-color:#74e6a6;background:#20352b;color:#91f3bb}.vehicle-control-deck .vehicle-throttle{min-width:42px}.vehicle-control-deck .vehicle-reverse{border-color:#4a3b34}.vehicle-control-deck .vehicle-brake{min-width:64px}.vehicle-control-deck .vehicle-parking.active{border-color:#ffb65c;color:#ffcf8c;background:#382b1d}.vehicle-control-readout{display:grid;grid-template-columns:auto auto;gap:2px 8px;min-width:300px;padding:0 6px}.vehicle-control-readout span{color:#82928a;font-weight:650}.vehicle-control-readout b{text-align:right;color:#dfe8e3}.vehicle-control-readout b.warn{color:#ffcf8c}.vehicle-control-title{display:flex;flex-direction:column;gap:2px;padding-right:6px;border-right:1px solid #29332f}.vehicle-control-title strong{font-size:10px;letter-spacing:.08em;color:#74e6a6}.vehicle-control-title small{font-size:8px;color:#77847e;font-weight:600}
  `
  document.head.append(style)
}

function applyLanguage(deck) {
  if (!deck || deck.dataset.vehicleLang === lang()) return
  deck.dataset.vehicleLang = lang()
  deck.querySelector('[data-title]').textContent = t('title')
  deck.querySelector('[data-hint]').textContent = t('hint')
  for (const key of ['speed','throttle','drive','steering','mode','brake','size','mass','metrics']) {
    const label = deck.querySelector(`[data-label="${key}"]`)
    if (label) label.textContent = t(key)
  }
  deck.querySelector('[data-throttle="1"]').title = t('forward')
  deck.querySelector('[data-throttle="-1"]').title = t('reverse')
  deck.querySelector('[data-steer="1"]').title = t('left')
  deck.querySelector('[data-steer="0"]').title = t('center')
  deck.querySelector('[data-steer="-1"]').title = t('right')
  deck.querySelector('[data-brake]').title = t('brakeTitle')
  deck.querySelector('[data-parking]').title = t('parkingTitle')
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
    <div class="vehicle-control-title"><strong data-title>VEHICLE</strong><small data-hint>W / S · A / D · SPACE · P</small></div>
    <button class="vehicle-throttle" data-throttle="1">W ▲</button><button class="vehicle-throttle vehicle-reverse" data-throttle="-1">S ▼</button>
    <button data-steer="1">A ◀</button><button data-steer="0">●</button><button data-steer="-1">▶ D</button>
    <button class="vehicle-brake" data-brake>BRAKE</button><button class="vehicle-parking" data-parking>P</button>
    <div class="vehicle-control-readout">
      <span data-label="speed">Speed / accel</span><b data-motion>0.00 m/s · 0.00 m/s²</b>
      <span data-label="throttle">Throttle</span><b data-throttle-readout>0%</b>
      <span data-label="drive">Drive</span><b data-drive>FREE</b>
      <span data-label="steering">Steering</span><b data-steering>0°</b>
      <span data-label="mode">Steering mode</span><b data-mode>VIRTUAL TIRE</b>
      <span data-label="brake">Brake</span><b data-brake-readout>0%</b>
      <span data-label="size">Wheelbase / track</span><b data-size>—</b>
      <span data-label="mass">Mass / CoG</span><b data-mass>—</b>
      <span data-label="metrics">Test metrics</span><b data-metrics>—</b>
    </div>`
  viewport.append(deck)
  applyLanguage(deck)

  deck.querySelectorAll('[data-throttle]').forEach(button => {
    const release = () => { pointerThrottle = 0; applyInputs() }
    button.addEventListener('pointerdown', event => { event.preventDefault(); pointerThrottle = Number(button.dataset.throttle); applyInputs(); button.setPointerCapture?.(event.pointerId) })
    button.addEventListener('pointerup', release)
    button.addEventListener('pointercancel', release)
  })
  deck.querySelectorAll('[data-steer]').forEach(button => {
    button.addEventListener('pointerdown', event => { event.preventDefault(); vehicle()?.setSteering(Number(button.dataset.steer)); button.setPointerCapture?.(event.pointerId) })
    const release = () => vehicle()?.setSteering(0)
    button.addEventListener('pointerup', release)
    button.addEventListener('pointercancel', release)
  })
  const brake = deck.querySelector('[data-brake]')
  brake.addEventListener('pointerdown', event => { event.preventDefault(); pointerBrake = true; applyInputs(); brake.setPointerCapture?.(event.pointerId) })
  const releaseBrake = () => { pointerBrake = false; applyInputs() }
  brake.addEventListener('pointerup', releaseBrake)
  brake.addEventListener('pointercancel', releaseBrake)
  deck.querySelector('[data-parking]').addEventListener('click', event => { parking = !parking; vehicle()?.setParkingBrake(parking); event.currentTarget.classList.toggle('active', parking) })
}

window.addEventListener('keydown', event => {
  if (!activeRuntime() || event.repeat || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '')) return
  if (['KeyW','KeyS','ArrowUp','ArrowDown','KeyA','KeyD','ArrowLeft','ArrowRight','Space'].includes(event.code)) {
    held.add(event.code)
    if (event.code.startsWith('Arrow') || event.code === 'Space') event.preventDefault()
    applyInputs()
  } else if (event.code === 'KeyP') {
    parking = !parking
    vehicle()?.setParkingBrake(parking)
    event.preventDefault()
  }
})
window.addEventListener('keyup', event => { if (held.delete(event.code)) applyInputs() })

function render() {
  install()
  const deck = document.getElementById('vehicleControlDeck')
  applyLanguage(deck)
  const state = vehicle()?.getState?.()
  const driveState = drive()?.getState?.()
  const perf = performanceApi()?.get?.()
  const visible = activeRuntime() && Boolean(state?.enabled)
  deck?.classList.toggle('hidden', !visible)
  if (!visible && wasVisible) clearInputs()
  wasVisible = visible

  if (visible && deck) {
    deck.querySelector('[data-motion]').textContent = `${(state.speedMps || 0).toFixed(2)} m/s · ${(state.accelerationMps2 || 0).toFixed(2)} m/s²`
    const throttle = deck.querySelector('[data-throttle-readout]')
    throttle.textContent = driveState?.reverseInterlock ? t('reverseBrake') : `${(driveState?.throttleInput ?? 0) < -0.01 ? 'R ' : (driveState?.throttleInput ?? 0) > 0.01 ? 'F ' : ''}${Math.round(Math.abs(driveState?.throttleInput ?? 0) * 100)}%`
    throttle.classList.toggle('warn', Boolean(driveState?.reverseInterlock))
    const driveMode = driveState?.armed ? t('manual') : t('mechanism')
    deck.querySelector('[data-drive]').textContent = `${driveState?.layout === 'FREE' ? t('free') : driveState?.layout ?? t('free')} · ${driveMode} · ${driveState?.motorCount ?? 0} ${t('motors')} / ${driveState?.drivenWheelCount ?? 0} ${t('wheels')}`
    deck.querySelector('[data-steering]').textContent = `${(state.centerSteerDeg || 0).toFixed(1)}° · L ${(state.leftSteerDeg || 0).toFixed(1)}° / R ${(state.rightSteerDeg || 0).toFixed(1)}°`
    const modeName = { physical: t('physical'), mixed: t('mixed'), virtual: t('virtual') }[state.steeringMode] ?? t('virtual')
    deck.querySelector('[data-mode]').textContent = state.physicalSteeringJoints ? `${modeName} · ${state.physicalSteeringJoints}` : modeName
    deck.querySelector('[data-brake-readout]').textContent = `${Math.round((state.brakeInput || 0) * 100)}%${state.parkingBrake ? ` · ${t('park')}` : ''}`
    deck.querySelector('[data-size]').textContent = `${(state.wheelbaseM || 0).toFixed(3)} / ${(state.trackM || 0).toFixed(3)} m`
    const cog = Array.isArray(state.comStud) ? state.comStud.map(v => Number(v).toFixed(1)).join(',') : '—'
    deck.querySelector('[data-mass]').textContent = `${(state.massKg || 0).toFixed(3)} kg · [${cog}]`
    deck.querySelector('[data-metrics]').textContent = `Vmax ${(perf?.topSpeedMps ?? 0).toFixed(2)} · 0→${(perf?.accelTargetMps ?? .5).toFixed(1)} ${perf?.accelTimeToTarget == null ? '—' : `${perf.accelTimeToTarget.toFixed(2)}s`} · ${t('brakeMetric')} ${perf?.lastBrakingDistanceM == null ? '—' : `${perf.lastBrakingDistanceM.toFixed(3)}m`}`
    deck.querySelector('[data-parking]')?.classList.toggle('active', Boolean(state.parkingBrake))
    deck.querySelector('[data-brake]')?.classList.toggle('active', brakeTarget() > 0 || (driveState?.autoBrake ?? 0) > 0)
  }
  requestAnimationFrame(render)
}

render()
globalThis.BrickLabVehicleControlsUI = { version: UI_VERSION }
