import { Quaternion, Vector3 } from 'three'
import { driveScale, driveScaleLimits, driveSettings, forwardVector, newDriveState, prepareTestDrive, resizeKinematicDrive, stepTestDrive } from './vehicle-drive.js?v=volvo-spur-gears'

const labels = {
  ru: {
    title: 'Тест-драйв',
    flat: 'Ровная площадка',
    world: 'Мой BrickLab World',
    venue: 'Полигон',
    sketchbook: 'Sketchbook',
    loadingTrack: 'Загружаем полигон и готовим заезд…',
    loadingPhysics: 'Запускаем физический движок…',
    physicsError: 'Физический движок не запустился. Повтори попытку или выбери кинематический режим.',
    simulation: 'Режим заезда',
    physical: 'Физика',
    kinematic: 'Кинематика',
    grounded: 'Колёс на опоре',
    outOfBounds: 'Машина покинула полигон. Нажми «На старт».',
    suspension: 'Амортизаторов',
    trackError: 'Полигон не загрузился. Повтори попытку или выбери ровную площадку.',
    blocked: 'Колёса упёрлись в препятствие или достигли края проезда.',
    heading: 'Направление переда',
    vehicleScale: 'Масштаб машины',
    scaleNoRoom: 'Здесь не хватает места для такого масштаба.',
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
    world: 'My BrickLab World',
    venue: 'Test venue',
    sketchbook: 'Sketchbook',
    loadingTrack: 'Loading the playground and preparing the drive…',
    loadingPhysics: 'Starting the physics engine…',
    physicsError: 'Could not start physics. Try again or select the kinematic mode.',
    simulation: 'Driving mode',
    physical: 'Physics',
    kinematic: 'Kinematics',
    grounded: 'Wheels in contact',
    outOfBounds: 'The vehicle left the playground. Reset the run to return.',
    suspension: 'Shock absorbers',
    trackError: 'Could not load the playground. Try again or select the flat test pad.',
    blocked: 'The wheels reached an obstacle or the edge of the driving surface.',
    heading: 'Forward direction',
    vehicleScale: 'Vehicle scale',
    scaleNoRoom: 'There is not enough room to use that scale here.',
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

export function mountDrivePanel(root, { language, scene, models, catalog, read, write, nameOf, signal, readWorld }) {
  const t = labels[language]
  root.setAttribute('aria-label', t.title)
  const { min, max, step } = driveScaleLimits
  root.innerHTML = `
    <header>${t.title}<small data-drive="venueTitle"></small></header>
    <div class="drive-scale">
      <label for="drive-scale">${t.vehicleScale} <output data-drive="scaleValue"></output></label>
      <input id="drive-scale" data-drive="scale" type="range" min="${min}" max="${max}" step="${step}">
      <p data-drive="scaleNotice" role="status" hidden></p>
    </div>
    <div data-drive="setup">
      <label>${t.venue}<select data-drive="venue"><option value="sketchbook">${t.sketchbook}</option><option value="flat">${t.flat}</option>${readWorld?'<option value="world">'+t.world+'</option>':''}</select></label>
      <label>${t.simulation}<select data-drive="simulation"><option value="physical">${t.physical}</option><option value="kinematic">${t.kinematic}</option></select></label>
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
      <p data-drive="mechanics" hidden></p>
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
  const stationary = new Vector3()
  const upright = new Quaternion()
  let vehicle
  let active = false
  let state
  let picking
  let frame
  let previous
  let press
  let sketchbook
  let track
  let worldTrack,worldDocument
  let loadingTrack
  let launchError
  let physics
  let physicsRun

  function arrow(degrees, scale = vehicle.settings.scale) {
    const direction = forwardVector(degrees)
    const start = vehicle.origin.clone().addScaledVector(direction, vehicle.wheelbase * scale + 50)
    start.y = 8
    scene.driveArrow(start, direction)
  }

  function showScale(scale) {
    const percent = Math.round(scale * 100)
    el('scale').value = percent
    el('scale').setAttribute('aria-valuetext', percent + '%')
    el('scaleValue').value = percent + '%'
  }

  function previewScale(scale) {
    scene.driveTransform(vehicle.origin, stationary, 0, upright, scale)
    arrow(Number(el('heading').value), scale)
  }

  function sync() {
    if (!active || state) return
    const { parts, assembly, config } = read()
    vehicle = prepareTestDrive(parts, assembly, models, config, catalog)
    const { settings } = vehicle
    if(settings.venue==='world'&&!readWorld)settings.venue='flat'
    el('venue').value = settings.venue
    el('simulation').value = settings.simulation
    el('venueTitle').textContent = t[settings.venue]
    el('heading').value = settings.heading
    el('degrees').value = settings.heading + '°'
    el('mode').value = settings.mode
    el('invert').checked = settings.invert
    showScale(settings.scale)
    previewScale(settings.scale)
    el('traction').hidden = settings.mode !== 'powered'
    el('assignedDrive').textContent = settings.driveParts.map(nameOf).join(', ') || t.none
    el('assignedSteering').textContent = settings.steering ? nameOf(settings.steering) : t.none
    el('pickDrive').setAttribute('aria-pressed', String(picking === 'drive'))
    el('pickSteering').setAttribute('aria-pressed', String(picking === 'steering'))
    el('start').disabled = !vehicle.ready || Boolean(loadingTrack)
    el('info').textContent = loadingTrack ? t[loadingTrack.message] : launchError ? t[launchError] :
      picking ? (picking === 'drive' ? t.selectDrive : t.selectSteering) : [
      t.wheels + ': ' + vehicle.initial.length,
      settings.mode === 'powered' ? t.driven + ': ' + vehicle.driven.length : '',
      vehicle.steered.length ? t.response + ': ' + vehicle.steered.length : settings.steering ? t.noSteering : '',
      vehicle.wheelbase <= 5 || !vehicle.aligned ? t.noWheelbase : !vehicle.ready ? t.noTraction : '',
    ].filter(Boolean).join(' · ')
    const showTraction = picking === 'drive' || !vehicle.steered.length
    scene.highlight(showTraction ? vehicle.driven : vehicle.steered, showTraction ? 0xffb01b : 0x65b9ff)
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
    const input = { throttle: amount('forward', 'reverse'), steer: amount('right', 'left'), brake: values.has('brake') }
    const dt = previous === undefined ? 0 : (time - previous) / 1000
    const result = physicsRun ? physicsRun.advance(input, dt) : stepTestDrive(vehicle, state, input, dt, track)
    previous = time
    scene.previewParts(result.poses)
    scene.driveTransform(vehicle.origin, result.position, result.yaw, result.tilt, result.scale)
    el('trackStatus').hidden = !result.blocked && !result.outOfBounds
    el('trackStatus').textContent = result.outOfBounds ? t.outOfBounds : result.blocked ? t.blocked : ''
    const currentRadius = Number.isFinite(result.radius) ?
      (result.radius * (physicsRun ? 1 : .0004)).toFixed(2) + ' ' + t.meters : '—'
    el('telemetry').value = (result.speed * (physicsRun ? 3.6 : .00144)).toFixed(2) +
      ' ' + t.speed + ' · ' + t.radius + ' ' + currentRadius
    el('mechanics').hidden = !physicsRun
    if (physicsRun) el('mechanics').textContent = t.grounded + ' ' + result.grounded + '/' + vehicle.initial.length +
      ' · ' + t.suspension + ' ' + result.suspension.length
    if (!result.outOfBounds && (physicsRun || values.size || state.speed || state.steering)) schedule()
    else previous = undefined
  }

  function clearTrackRequest() {
    loadingTrack = undefined
    launchError = undefined
  }

  function stop() {
    clearTrackRequest()
    if (frame !== undefined) cancelAnimationFrame(frame)
    frame = previous = state = undefined
    held.clear()
    track = undefined
    physicsRun?.dispose()
    physicsRun = undefined
    scene.setDriveMap()
    scene.clearDriveTransform()
    scene.setParts(read().parts)
    scene.resetView()
    el('setup').hidden = false
    el('run').hidden = true
    el('scaleNotice').hidden = true
    sync()
  }

  async function start() {
    if (!vehicle?.ready || loadingTrack) return
    const { venue, simulation } = vehicle.settings
    let worldSource;
    if(venue==='world'){
      try{worldSource=readWorld?.();if(!worldSource)throw Error('Сначала сохрани карту в BrickLab World.')}
      catch(e){el('info').textContent=e.message;return}
    }
    const worldKey=worldSource?JSON.stringify(worldSource):null;
    const needsWorld=venue==='world'&&(!worldTrack||worldDocument!==worldKey);
    const needsTrack = venue === 'sketchbook' && !sketchbook
    const needsPhysics = simulation === 'physical' && !physics
    if (needsTrack || needsWorld || needsPhysics) {
      const request = loadingTrack = { message: needsTrack || needsWorld ? 'loadingTrack' : 'loadingPhysics' }
      launchError = undefined
      sync()
      let stage = 'trackError'
      try {
        if(needsWorld){
          const {loadWorldTrack}=await import('./world-track.js');
          const loaded=await loadWorldTrack(worldSource,signal);
          if(loadingTrack!==request){loaded.dispose();return}
          if(worldTrack){scene.setDriveMap();worldTrack.dispose()}
          worldTrack=loaded;worldDocument=worldKey;
        }
        if (needsTrack) {
          const { loadSketchbookTrack } = await import('./sketchbook-track.js?v=ford-startup')
          const loaded = await loadSketchbookTrack()
          if (loadingTrack !== request) return
          sketchbook = loaded
        }
        if (needsPhysics) {
          stage = 'physicsError'
          request.message = 'loadingPhysics'
          sync()
          const [{ createPhysicalDrive }, { loadRapier }] = await Promise.all([
            import('./physical-drive.js?v=volvo-spur-gears'), import('../mechanics/physics-world.js'),
          ])
          const rapier = await loadRapier()
          if (loadingTrack !== request) return
          physics = { createPhysicalDrive, rapier }
        }
      } catch (error) {
        if (loadingTrack !== request) return
        launchError = stage
        console.error(error)
        return
      } finally {
        if (loadingTrack === request) {
          loadingTrack = undefined
          sync()
        }
      }
      if (!active || !vehicle.ready) return
    }
    track = venue === 'world' ? worldTrack : venue === 'sketchbook' ? sketchbook : undefined
    if(venue==='world'&&!track)return;
    if (simulation === 'physical') {
      try {
        const next = physics.createPhysicalDrive(physics.rapier, vehicle, models, read().assembly, track)
        physicsRun?.dispose()
        physicsRun = next
      } catch (error) {
        stop()
        launchError = 'physicsError'
        sync()
        console.error(error)
        return
      }
    }
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
    el('scaleNotice').hidden = true
    el('mechanics').hidden = !physicsRun
    const initial = physicsRun ? physicsRun.advance({ throttle: 0, steer: 0, brake: false }, 0) : state
    scene.driveTransform(vehicle.origin, initial.position, initial.yaw, initial.tilt, initial.scale)
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
  on(el('simulation'), 'change', () => {
    clearTrackRequest()
    change({ simulation: el('simulation').value })
  })
  on(el('scale'), 'input', () => {
    const scale = driveScale(Number(el('scale').value) / 100)
    el('scaleNotice').hidden = true
    showScale(scale)
    if (active && vehicle && !state) previewScale(scale)
  })
  on(el('scale'), 'change', () => {
    const scale = driveScale(Number(el('scale').value) / 100)
    if (physicsRun && !physicsRun.resize(scale)) {
      showScale(vehicle.settings.scale)
      el('scaleNotice').textContent = t.scaleNoRoom
      el('scaleNotice').hidden = false
      return
    }
    if (state && !physicsRun) resizeKinematicDrive(vehicle, state, scale)
    if (state) vehicle.settings.scale = scale
    showScale(scale)
    change({ scale })
    schedule()
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
    physicsRun?.dispose()
    scene.setDriveMap()
    worldTrack?.dispose();worldTrack=undefined;worldDocument=undefined;
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
