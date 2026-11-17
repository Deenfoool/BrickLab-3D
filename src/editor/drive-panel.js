import { driveSettings, forwardVector, newDriveState, prepareTestDrive, stepTestDrive } from './vehicle-drive.js?v=sketchbook'

const labels = {
  ru: {
    title: 'Тест-драйв',
    flat: 'Ровная площадка',
    venue: 'Полигон',
    sketchbook: 'Sketchbook',
    loadingTrack: 'Загружаем полигон Sketchbook…',
    trackError: 'Полигон не загрузился. Повтори попытку или выбери ровную площадку.',
    blocked: 'Колёса упёрлись в препятствие или достигли края проезда.',
    heading: 'Направление переда',
    traction: 'Тяга',
    push: 'Толкать машину',
    powered: 'Ведущий вал или колёса',
    steering: 'Рулевое управление',
    invert: 'Инвертировать руль',
    none: 'Не назначено',
    pickDrive: 'Указать тягу',
    pickSteering: 'Указать руль',
    clear: 'Сбросить',
    startLabel: 'Начать заезд',
    stopLabel: 'Завершить заезд',
    retry: 'На старт',
    selectDrive: 'Нажми на ведущий вал или колесо. Повторный щелчок снимает назначение.',
    selectSteering: 'Нажми на рулевой вал, рейку или выход сервопривода.',
    shortcuts: 'W / S — вперёд / назад · A / D — руль · Пробел — тормоз',
    wheels: 'Колёс',
    driven: 'Ведущих',
    response: 'Откликаются на руль',
    noSteering: 'Выбранный узел не поворачивает колёса.',
    noTraction: 'Укажи вал или колесо, связанное с ходовой.',
    noWheelbase: 'Нужны колёса спереди и сзади. Проверь направление переда.',
    meters: 'м',
    speed: 'км/ч',
    radius: 'Радиус',
    forward: 'Вперёд',
    left: 'Влево',
    reverse: 'Назад',
    right: 'Вправо',
    brake: 'Тормоз',
  },
  en: {
    title: 'Test drive',
    flat: 'Flat test pad',
    venue: 'Test venue',
    sketchbook: 'Sketchbook',
    loadingTrack: 'Loading the Sketchbook playground…',
    trackError: 'Could not load the playground. Try again or select the flat test pad.',
    blocked: 'The wheels reached an obstacle or the edge of the driving surface.',
    heading: 'Forward direction',
    traction: 'Traction',
    push: 'Push the vehicle',
    powered: 'Driven shaft or wheels',
    steering: 'Steering',
    invert: 'Invert steering',
    none: 'Unassigned',
    pickDrive: 'Assign traction',
    pickSteering: 'Assign steering',
    clear: 'Clear',
    startLabel: 'Start driving',
    stopLabel: 'End drive',
    retry: 'Reset run',
    selectDrive: 'Click a driven shaft or wheel. Click again to remove the assignment.',
    selectSteering: 'Click the steering shaft, rack or servo output.',
    shortcuts: 'W / S — forward / reverse · A / D — steering · Space — brake',
    wheels: 'Wheels',
    driven: 'Driven',
    response: 'Wheels responding to steering',
    noSteering: 'The selected mechanism does not turn any wheels.',
    noTraction: 'Assign a shaft or wheel connected to the drivetrain.',
    noWheelbase: 'Fit front and rear wheels and check the forward direction.',
    meters: 'm',
    speed: 'km/h',
    radius: 'Radius',
    forward: 'Forward',
    left: 'Left',
    reverse: 'Reverse',
    right: 'Right',
    brake: 'Brake',
  },
}

const keys = { KeyW: 'forward', ArrowUp: 'forward', KeyS: 'reverse', ArrowDown: 'reverse',
  KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', Space: 'brake' }

export const driveTitle = language => labels[language].title

export function mountDrivePanel(root, { language, scene, models, catalog, read, write, nameOf, signal }) {
  const t = labels[language]
  root.setAttribute('aria-label', t.title)
  root.innerHTML = `
    <header>${t.title}<small data-drive="venueTitle"></small></header>
    <div data-drive="setup">
      <label>${t.venue}<select data-drive="venue"><option value="sketchbook">${t.sketchbook}</option><option value="flat">${t.flat}</option></select></label>
      <label for="drive-heading">${t.heading} <output data-drive="degrees"></output></label>
      <input id="drive-heading" data-drive="heading" type="range" min="-180" max="180" step="1">
      <label>${t.traction}<select data-drive="mode"><option value="push">${t.push}</option><option value="powered">${t.powered}</option></select></label>
      <div data-drive="traction">
        <p data-drive="assignedDrive"></p>
        <button type="button" data-drive="pickDrive">${t.pickDrive}</button>
        <button type="button" data-drive="clearDrive">${t.clear}</button>
      </div>
      <div>
        <p>${t.steering} · <span data-drive="assignedSteering"></span></p>
        <button type="button" data-drive="pickSteering">${t.pickSteering}</button>
        <button type="button" data-drive="clearSteering">${t.clear}</button>
      </div>
      <label><input data-drive="invert" type="checkbox"> ${t.invert}</label>
      <p data-drive="info" role="status"></p>
      <button type="button" class="editor-primary" data-drive="start">${t.startLabel}</button>
    </div>
    <div data-drive="run" hidden>
      <output data-drive="telemetry"></output>
      <p data-drive="trackStatus" role="status" hidden></p>
      <p>${t.shortcuts}</p>
      <div class="drive-controls">
        ${[['forward','W'],['left','A'],['reverse','S'],['right','D'],['brake','⏹']].map(([key, label]) =>
          '<button type="button" data-hold="' + key + '" aria-label="' + t[key] + '">' + label + '</button>').join('')}
      </div>
      <div class="drive-actions">
        <button type="button" data-drive="retry">${t.retry}</button>
        <button type="button" data-drive="stop">${t.stopLabel}</button>
      </div>
    </div>`
  const el = name => root.querySelector('[data-drive="' + name + '"]')
  const on = (target, event, handler) => target.addEventListener(event, handler, { signal })
  const held = new Map()
  let vehicle
  let active = false
  let state
  let picking
  let frame
  let previous
  let press
  let sketchbook
  let track
  let loadingTrack
  let trackError = false

  function arrow(degrees) {
    const direction = forwardVector(degrees)
    const start = vehicle.origin.clone().addScaledVector(direction, vehicle.wheelbase + 50)
    start.y = 8
    scene.driveArrow(start, direction)
  }

  function sync() {
    if (!active || state) return
    const { parts, assembly, config } = read()
    vehicle = prepareTestDrive(parts, assembly, models, config, catalog)
    const { settings } = vehicle
    el('venue').value = settings.venue
    el('venueTitle').textContent = t[settings.venue]
    el('heading').value = settings.heading
    el('degrees').value = settings.heading + '°'
    el('mode').value = settings.mode
    el('invert').checked = settings.invert
    el('traction').hidden = settings.mode !== 'powered'
    el('assignedDrive').textContent = settings.driveParts.map(nameOf).join(', ') || t.none
    el('assignedSteering').textContent = settings.steering ? nameOf(settings.steering) : t.none
    el('pickDrive').setAttribute('aria-pressed', String(picking === 'drive'))
    el('pickSteering').setAttribute('aria-pressed', String(picking === 'steering'))
    el('start').disabled = !vehicle.ready || Boolean(loadingTrack)
    el('info').textContent = loadingTrack ? t.loadingTrack : trackError ? t.trackError :
      picking ? (picking === 'drive' ? t.selectDrive : t.selectSteering) : [
      t.wheels + ': ' + vehicle.initial.length,
      settings.mode === 'powered' ? t.driven + ': ' + vehicle.driven.length : '',
      vehicle.steered.length ? t.response + ': ' + vehicle.steered.length : settings.steering ? t.noSteering : '',
      vehicle.wheelbase <= 5 || !vehicle.aligned ? t.noWheelbase : !vehicle.ready ? t.noTraction : '',
    ].filter(Boolean).join(' · ')
    const showTraction = picking === 'drive' || !vehicle.steered.length
    scene.highlight(showTraction ? vehicle.driven : vehicle.steered, showTraction ? 0xffb01b : 0x65b9ff)
    arrow(settings.heading)
  }

  function change(update) {
    write(driveSettings({ ...read().config, ...update }))
    sync()
  }

  function schedule() {
    if (state && frame === undefined) frame = requestAnimationFrame(tick)
  }

  function tick(time) {
    frame = undefined
    if (!state) return
    const values = new Set(held.values())
    const amount = (positive, negative) => Number(values.has(positive)) - Number(values.has(negative))
    const result = stepTestDrive(vehicle, state, { throttle: amount('forward', 'reverse'),
      steer: amount('right', 'left'), brake: values.has('brake') }, previous === undefined ? 0 : (time - previous) / 1000, track)
    previous = time
    scene.previewParts(result.poses)
    scene.driveTransform(vehicle.origin, result.position, result.yaw, result.tilt)
    el('trackStatus').hidden = !result.blocked
    el('trackStatus').textContent = result.blocked ? t.blocked : ''
    const currentRadius = Number.isFinite(result.radius) ? (result.radius * .0004).toFixed(2) + ' ' + t.meters : '—'
    el('telemetry').value = (result.speed * .00144).toFixed(2) + ' ' + t.speed + ' · ' + t.radius + ' ' + currentRadius
    if (values.size || state.speed || state.steering) schedule()
    else previous = undefined
  }

  function clearTrackRequest() {
    loadingTrack = undefined
    trackError = false
  }

  function stop() {
    clearTrackRequest()
    if (frame !== undefined) cancelAnimationFrame(frame)
    frame = previous = state = undefined
    held.clear()
    track = undefined
    scene.setDriveMap()
    scene.clearDriveTransform()
    scene.setParts(read().parts)
    scene.resetView()
    el('setup').hidden = false
    el('run').hidden = true
    sync()
  }

  async function start() {
    if (!vehicle?.ready || loadingTrack) return
    const venue = vehicle.settings.venue
    if (venue === 'sketchbook' && !sketchbook) {
      const request = loadingTrack = {}
      trackError = false
      sync()
      try {
        const { loadSketchbookTrack } = await import('./sketchbook-track.js?v=track-cache')
        const loaded = await loadSketchbookTrack()
        if (loadingTrack !== request) return
        sketchbook = loaded
      } catch (error) {
        if (loadingTrack !== request) return
        trackError = true
        console.error(error)
      } finally {
        if (loadingTrack === request) {
          loadingTrack = undefined
          sync()
        }
      }
      if (!active || !sketchbook || !vehicle.ready) return
    }
    track = venue === 'sketchbook' ? sketchbook : undefined
    picking = undefined
    held.clear()
    previous = undefined
    scene.driveArrow()
    scene.highlight([])
    scene.select(undefined)
    scene.setParts(vehicle.parts)
    scene.clearDriveTransform()
    scene.setDriveMap(track?.group)
    state = newDriveState(vehicle, track)
    el('trackStatus').hidden = true
    scene.driveTransform(vehicle.origin, state.position, state.yaw, state.tilt)
    scene.resetView()
    el('setup').hidden = true
    el('run').hidden = false
    scene.canvas.focus({ preventScroll: true })
    schedule()
  }

  on(el('venue'), 'change', () => {
    clearTrackRequest()
    change({ venue: el('venue').value })
  })
  on(el('heading'), 'input', () => {
    el('degrees').value = el('heading').value + '°'
    arrow(Number(el('heading').value))
  })
  on(el('heading'), 'change', () => change({ heading: Number(el('heading').value) }))
  on(el('mode'), 'change', () => { picking = undefined; change({ mode: el('mode').value }) })
  on(el('invert'), 'change', () => change({ invert: el('invert').checked }))
  on(el('pickDrive'), 'click', () => { picking = picking === 'drive' ? undefined : 'drive'; sync() })
  on(el('pickSteering'), 'click', () => { picking = picking === 'steering' ? undefined : 'steering'; sync() })
  on(el('clearDrive'), 'click', () => change({ driveParts: [] }))
  on(el('clearSteering'), 'click', () => change({ steering: null }))
  on(el('start'), 'click', start)
  on(el('retry'), 'click', start)
  on(el('stop'), 'click', stop)
  on(scene.canvas, 'pointerdown', event => {
    if (active && !state && picking && event.button === 0) press = [event.clientX, event.clientY]
  })
  on(scene.canvas, 'pointerup', event => {
    const down = press
    press = undefined
    if (!active || state || !picking || !down || event.button !== 0 ||
        Math.hypot(down[0] - event.clientX, down[1] - event.clientY) > 5) return
    const id = scene.pointer(event).hit
    if (!id) return
    if (picking === 'steering') {
      picking = undefined
      change({ steering: id })
    } else {
      const { driveParts } = driveSettings(read().config)
      change({ driveParts: driveParts.includes(id) ? driveParts.filter(part => part !== id) : [...driveParts, id] })
    }
  })
  on(scene.canvas, 'pointercancel', () => { press = undefined })
  on(window, 'keydown', event => {
    if (!active) return
    if (event.key === 'Escape' && (state || picking || loadingTrack)) {
      event.preventDefault()
      event.stopImmediatePropagation()
      if (state) stop()
      else { clearTrackRequest(); picking = undefined; sync() }
      return
    }
    if (!state || !keys[event.code] || event.altKey || event.ctrlKey || event.metaKey ||
        event.target.closest?.('input, textarea, select, [contenteditable]')) return
    event.preventDefault()
    held.set(event.code, keys[event.code])
    schedule()
  })
  on(window, 'keyup', event => { if (held.delete(event.code)) schedule() })
  on(window, 'blur', () => { held.clear(); schedule() })
  on(document, 'visibilitychange', () => {
    if (document.hidden) {
      held.clear()
      previous = undefined
      schedule()
    }
  })
  for (const button of root.querySelectorAll('[data-hold]')) {
    on(button, 'pointerdown', event => {
      event.preventDefault()
      button.setPointerCapture(event.pointerId)
      held.set(event.pointerId, button.dataset.hold)
      schedule()
    })
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      on(button, event, input => { if (held.delete(input.pointerId)) schedule() })
    }
  }
  signal.addEventListener('abort', () => {
    clearTrackRequest()
    if (frame !== undefined) cancelAnimationFrame(frame)
    scene.setDriveMap()
  }, { once: true })

  return {
    setActive(enabled) {
      if (active === enabled) return
      active = enabled
      root.hidden = !enabled
      if (enabled) sync()
      else {
        picking = undefined
        press = undefined
        stop()
        scene.driveArrow()
        scene.highlight([])
      }
    },
  }
}
