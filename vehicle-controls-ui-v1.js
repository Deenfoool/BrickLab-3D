import {
  approachVehicle,
  classifyDrivenWheels,
  resolveDriveRequest,
} from './vehicle-model-v1.js'

const UI_VERSION = 'vehicle-controls-ui-v2'
const held = new Set()
let installed = false
let parking = false
let wasVisible = false
let pointerBrake = false
let pointerThrottle = 0
let driveArmed = false
let throttleInput = 0
let lastFrameSeconds = 0
let cachedSession = null
let cachedDrive = null

const THROTTLE_RATE = 3.0
const THROTTLE_RELEASE_RATE = 4.5
const REVERSE_SPEED_THRESHOLD = 0.08

const TEXT = {
  en: {
    title: 'VEHICLE', hint: 'W / S · A / D · SPACE · P', left: 'Steer left', center: 'Center steering', right: 'Steer right',
    forward: 'Drive forward', reverse: 'Drive reverse', brakeButton: 'BRAKE', brakeTitle: 'Service brake', parkingTitle: 'Parking brake',
    speed: 'Speed / accel', throttle: 'Throttle', drive: 'Drive', steering: 'Steering', mode: 'Steering mode', brake: 'Brake',
    size: 'Wheelbase / track', mass: 'Mass / CoG', metrics: 'Test metrics', physical: 'PHYSICAL', mixed: 'MIXED',
    virtual: 'VIRTUAL TIRE', joints: 'JOINTS', park: 'PARK', brakeMetric: 'brake', manualDrive: 'MANUAL', mechanismDrive: 'MECHANISM',
    reverseBrake: 'REV BRAKE', motors: 'motors', wheels: 'wheels', noDrive: 'FREE',
  },
  ru: {
    title: 'МАШИНА', hint: 'W / S · A / D · ПРОБЕЛ · P', left: 'Руль влево', center: 'Руль прямо', right: 'Руль вправо',
    forward: 'Тяга вперёд', reverse: 'Тяга назад', brakeButton: 'ТОРМОЗ', brakeTitle: 'Рабочий тормоз', parkingTitle: 'Стояночный тормоз',
    speed: 'Скорость / ускорение', throttle: 'Газ', drive: 'Привод', steering: 'Руль', mode: 'Режим руля', brake: 'Тормоз',
    size: 'База / колея', mass: 'Масса / ЦТ', metrics: 'Метрики', physical: 'ФИЗИЧЕСКИЙ', mixed: 'СМЕШАННЫЙ',
    virtual: 'ВИРТУАЛЬНЫЙ', joints: 'ШАРНИРА', park: 'РУЧНИК', brakeMetric: 'тормоз', manualDrive: 'РУЧНОЙ', mechanismDrive: 'МЕХАНИЗМ',
    reverseBrake: 'ТОРМОЖЕНИЕ R', motors: 'мот.', wheels: 'кол.', noDrive: 'СВОБОДНЫЙ',
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
function mechanismApi() { return globalThis.BrickLabControls }
function session() { return globalThis.__bricklabPhysicsSession ?? null }

function currentThrottleTarget() {
  const forward = held.has('KeyW') || held.has('ArrowUp')
  const reverse = held.has('KeyS') || held.has('ArrowDown')
  if (forward !== reverse) return forward ? 1 : -1
  return pointerThrottle
}

function manualBrakeInput() {
  return pointerBrake || held.has('Space') ? 1 : 0
}

function applyKeys() {
  if (!activeRuntime() || !api()) return
  const left = held.has('KeyA') || held.has('ArrowLeft')
  const right = held.has('KeyD') || held.has('ArrowRight')
  api().setSteering(left === right ? 0 : left ? 1 : -1)
}

function horizontalLongitudinalSpeed(activeSession) {
  const body = activeSession?.chassisMonitor?.body
  const velocity = body?.linvel?.()
  const q = body?.rotation?.()
  if (!velocity || !q) return 0

  // Local +Z is the vehicle forward direction used by wheel axle classification.
  const fx = 2 * (q.x * q.z + q.w * q.y)
  const fz = 1 - 2 * (q.x * q.x + q.y * q.y)
  const length = Math.hypot(fx, fz)
  if (length < 1e-8) return 0
  return (velocity.x * fx + velocity.z * fz) / length
}

function buildDriveInfo(activeSession) {
  if (!activeSession) return { layout: 'FREE', motorIds: [], drivenWheelCount: 0, motors: [], wheels: [] }
  const controls = mechanismApi()
  const wheels = (activeSession.wheelMonitors ?? []).map(wheel => ({
    id: wheel.id,
    instanceId: wheel.object?.userData?.instanceId ?? null,
    axle: wheel.axleRole ?? 'middle',
  }))
  const classified = classifyDrivenWheels(wheels, activeSession.drivetrain?.shafts ?? [])
  const motors = classified.motorIds.map(id => {
    const config = controls?.getConfig?.(id)
    const runtime = controls?.getRuntime?.(id)
    if (config?.type !== 'motor' || runtime?.type !== 'motor') return null
    return {
      id,
      forwardDirection: config.motor?.initialDirection === -1 ? -1 : 1,
      fullRpm: Math.max(0, Number(config.motor?.baseRpm) || 0),
    }
  }).filter(Boolean)

  return { ...classified, motors }
}

function driveInfo() {
  const activeSession = session()
  if (activeSession !== cachedSession) {
    cachedSession = activeSession
    cachedDrive = buildDriveInfo(activeSession)
  }
  return cachedDrive ?? buildDriveInfo(activeSession)
}

function commandDrive(info, command) {
  if (!driveArmed || !info?.motors?.length) return
  const controls = mechanismApi()
  if (!controls) return

  for (const motor of info.motors) {
    const runtime = controls.getRuntime?.(motor.id)
    if (!runtime || runtime.type !== 'motor') continue
    const desiredDirection = command.direction === 0 ? 0 : motor.forwardDirection * command.direction
    const desiredRpm = Math.max(0, motor.fullRpm * command.throttle)
    if (Math.abs((runtime.rpm ?? 0) - desiredRpm) > 0.5) controls.setMotorRpm?.(motor.id, desiredRpm)
    if ((runtime.direction ?? 0) !== desiredDirection) controls.setMotorDirection?.(motor.id, desiredDirection)
  }
}

function stopManualDrive() {
  if (!driveArmed) return
  const controls = mechanismApi()
  for (const motor of driveInfo()?.motors ?? []) {
    controls?.setMotorRpm?.(motor.id, 0)
    controls?.setMotorDirection?.(motor.id, 0)
  }
  throttleInput = 0
}

function updateDrive(nowSeconds) {
  const activeSession = session()
  const info = driveInfo()
  const dt = lastFrameSeconds > 0 ? Math.min(0.1, Math.max(0, nowSeconds - lastFrameSeconds)) : 0
  lastFrameSeconds = nowSeconds
  const target = currentThrottleTarget()
  if (target !== 0 && info.motors.length) driveArmed = true

  const rate = target === 0 ? THROTTLE_RELEASE_RATE : THROTTLE_RATE
  throttleInput = approachVehicle(throttleInput, target, rate * dt)

  const command = resolveDriveRequest({
    throttle: driveArmed ? throttleInput : 0,
    longitudinalSpeed: horizontalLongitudinalSpeed(activeSession),
    reverseSpeedThreshold: REVERSE_SPEED_THRESHOLD,
  })
  commandDrive(info, command)

  const effectiveBrake = Math.max(manualBrakeInput(), driveArmed ? command.autoBrake : 0)
  const currentBrake = Number(api()?.getState?.()?.brakeInput) || 0
  if (Math.abs(currentBrake - effectiveBrake) > 0.01) api()?.setBrake(effectiveBrake)

  return { info, command }
}

function installStyle() {
  if (document.querySelector('style[data-bricklab-vehicle-controls]')) return
  const style = document.createElement('style')
  style.dataset.bricklabVehicleControls = UI_VERSION
  style.textContent = `
    .vehicle-control-deck{position:absolute;left:50%;bottom:18px;transform:translateX(-50%);z-index:28;display:flex;align-items:center;gap:7px;padding:8px 10px;border:1px solid rgba(116,230,166,.22);border-radius:12px;background:rgba(13,17,19,.88);backdrop-filter:blur(14px);box-shadow:0 10px 30px rgba(0,0,0,.28);color:#dfe8e3;font:700 11px/1.2 system-ui;user-select:none}
    .vehicle-control-deck.hidden{display:none}.vehicle-control-deck button{height:32px;min-width:36px;border:1px solid #324039;border-radius:8px;background:#1a211e;color:#dfe8e3;font:800 12px system-ui;cursor:pointer}.vehicle-control-deck button.active,.vehicle-control-deck button:active{border-color:#74e6a6;background:#20352b;color:#91f3bb}.vehicle-control-deck .vehicle-throttle{min-width:42px}.vehicle-control-deck .vehicle-reverse{border-color:#4a3b34}.vehicle-control-deck .vehicle-brake{min-width:64px}.vehicle-control-deck .vehicle-parking.active{border-color:#ffb65c;color:#ffcf8c;background:#382b1d}.vehicle-control-readout{display:grid;grid-template-columns:auto auto;gap:2px 8px;min-width:285px;padding:0 6px}.vehicle-control-readout span{color:#82928a;font-weight:650}.vehicle-control-readout b{text-align:right;color:#dfe8e3}.vehicle-control-readout b.warn{color:#ffcf8c}.vehicle-control-title{display:flex;flex-direction:column;gap:2px;padding-right:6px;border-right:1px solid #29332f}.vehicle-control-title strong{font-size:10px;letter-spacing:.08em;color:#74e6a6}.vehicle-control-title small{font-size:8px;color:#77847e;font-weight:600}
  `
  document.head.append(style)
}

function applyLanguage(deck) {
  if (!deck || deck.dataset.vehicleLang === lang()) return
  deck.dataset.vehicleLang = lang()
  deck.querySelector('[data-vehicle-title]').textContent = t('title')
  deck.querySelector('[data-vehicle-hint]').textContent = t('hint')
  const forward = deck.querySelector('[data-throttle="1"]')
  const reverse = deck.querySelector('[data-throttle="-1"]')
  const left = deck.querySelector('[data-steer="1"]')
  const center = deck.querySelector('[data-steer="0"]')
  const right = deck.querySelector('[data-steer="-1"]')
  if (forward) forward.title = t('forward')
  if (reverse) reverse.title = t('reverse')
  if (left) left.title = t('left')
  if (center) center.title = t('center')
  if (right) right.title = t('right')
  const brake = deck.querySelector('[data-brake]')
  if (brake) { brake.textContent = t('brakeButton'); brake.title = t('brakeTitle') }
  const parkingButton = deck.querySelector('[data-parking]')
  if (parkingButton) parkingButton.title = t('parkingTitle')
  for (const key of ['speed','throttle','drive','steering','mode','brake','size','mass','metrics']) {
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
    <div class="vehicle-control-title"><strong data-vehicle-title>VEHICLE</strong><small data-vehicle-hint>W / S · A / D · SPACE · P</small></div>
    <button type="button" class="vehicle-throttle" data-throttle="1">W ▲</button>
    <button type="button" class="vehicle-throttle vehicle-reverse" data-throttle="-1">S ▼</button>
    <button type="button" data-steer="1">A ◀</button>
    <button type="button" data-steer="0">●</button>
    <button type="button" data-steer="-1">▶ D</button>
    <button type="button" class="vehicle-brake" data-brake>BRAKE</button>
    <button type="button" class="vehicle-parking" data-parking>P</button>
    <div class="vehicle-control-readout">
      <span data-vehicle-label="speed">Speed / accel</span><b data-vehicle-motion>0.00 m/s · 0.00 m/s²</b>
      <span data-vehicle-label="throttle">Throttle</span><b data-vehicle-throttle>0%</b>
      <span data-vehicle-label="drive">Drive</span><b data-vehicle-drive>FREE</b>
      <span data-vehicle-label="steering">Steering</span><b data-vehicle-steer>0°</b>
      <span data-vehicle-label="mode">Steering mode</span><b data-vehicle-mode>VIRTUAL TIRE</b>
      <span data-vehicle-label="brake">Brake</span><b data-vehicle-brake>0%</b>
      <span data-vehicle-label="size">Wheelbase / track</span><b data-vehicle-size>—</b>
      <span data-vehicle-label="mass">Mass / CoG</span><b data-vehicle-mass>—</b>
      <span data-vehicle-label="metrics">Test metrics</span><b data-vehicle-performance>—</b>
    </div>`
  viewport.append(deck)
  applyLanguage(deck)

  deck.querySelectorAll('[data-throttle]').forEach(button => {
    const release = () => { pointerThrottle = 0; button.classList.remove('active') }
    button.addEventListener('pointerdown', event => {
      event.preventDefault()
      pointerThrottle = Number(button.dataset.throttle)
      if (driveInfo().motors.length) driveArmed = true
      button.classList.add('active')
      button.setPointerCapture?.(event.pointerId)
    })
    button.addEventListener('pointerup', release)
    button.addEventListener('pointercancel', release)
  })

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
    event.preventDefault(); pointerBrake = true; brake.classList.add('active')
    brake.setPointerCapture?.(event.pointerId)
  })
  const releaseBrake = () => { pointerBrake = false; brake.classList.remove('active') }
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
  const drivingKey = ['KeyW','KeyS','ArrowUp','ArrowDown','KeyA','KeyD','ArrowLeft','ArrowRight','Space'].includes(event.code)
  if (drivingKey) {
    held.add(event.code)
    if (['KeyW','KeyS','ArrowUp','ArrowDown'].includes(event.code) && driveInfo().motors.length) driveArmed = true
    if (event.code.startsWith('Arrow') || event.code === 'Space') event.preventDefault()
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

function render(nowMs = performance.now()) {
  install()
  const deck = document.getElementById('vehicleControlDeck')
  applyLanguage(deck)
  const state = api()?.getState?.()
  const performance = performanceApi()?.get?.()
  const visible = activeRuntime() && Boolean(state?.enabled)
  deck?.classList.toggle('hidden', !visible)

  if (!visible && wasVisible) {
    held.clear()
    pointerThrottle = 0
    pointerBrake = false
    stopManualDrive()
    driveArmed = false
    api()?.setSteering(0)
    api()?.setBrake(0)
    api()?.resetVisuals?.()
    cachedSession = null
    cachedDrive = null
  }
  wasVisible = visible

  const drive = visible ? updateDrive(nowMs / 1000) : { info: driveInfo(), command: resolveDriveRequest() }

  if (visible && deck) {
    const steer = deck.querySelector('[data-vehicle-steer]')
    const mode = deck.querySelector('[data-vehicle-mode]')
    const brake = deck.querySelector('[data-vehicle-brake]')
    const mass = deck.querySelector('[data-vehicle-mass]')
    const motion = deck.querySelector('[data-vehicle-motion]')
    const throttle = deck.querySelector('[data-vehicle-throttle]')
    const driveEl = deck.querySelector('[data-vehicle-drive]')
    const size = deck.querySelector('[data-vehicle-size]')
    const performanceEl = deck.querySelector('[data-vehicle-performance]')

    if (motion) motion.textContent = `${(state.speedMps || 0).toFixed(2)} m/s · ${(state.accelerationMps2 || 0).toFixed(2)} m/s²`
    if (throttle) {
      const sign = throttleInput > 0.01 ? 'F ' : throttleInput < -0.01 ? 'R ' : ''
      throttle.textContent = drive.command.reverseInterlock ? t('reverseBrake') : `${sign}${Math.round(Math.abs(throttleInput) * 100)}%`
      throttle.classList.toggle('warn', Boolean(drive.command.reverseInterlock))
    }
    if (driveEl) {
      const controlMode = driveArmed ? t('manualDrive') : t('mechanismDrive')
      const layout = drive.info.layout === 'FREE' ? t('noDrive') : drive.info.layout
      driveEl.textContent = `${layout} · ${controlMode} · ${drive.info.motors.length} ${t('motors')} / ${drive.info.drivenWheelCount} ${t('wheels')}`
    }
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

    deck.querySelector('[data-throttle="1"]')?.classList.toggle('active', currentThrottleTarget() > 0)
    deck.querySelector('[data-throttle="-1"]')?.classList.toggle('active', currentThrottleTarget() < 0)
    deck.querySelector('[data-parking]')?.classList.toggle('active', Boolean(state.parkingBrake))
    deck.querySelector('[data-brake]')?.classList.toggle('active', manualBrakeInput() > 0 || drive.command.autoBrake > 0)
  }
  requestAnimationFrame(render)
}

render()
globalThis.BrickLabVehicleControlsUI = {
  version: UI_VERSION,
  getDriveState: () => ({
    armed: driveArmed,
    throttleInput,
    throttleTarget: currentThrottleTarget(),
    ...driveInfo(),
  }),
}
