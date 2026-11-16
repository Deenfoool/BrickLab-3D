import { Plane, Quaternion, Vector3 } from 'three'
import { technic } from '../mechanics/catalog.js'
import { baseRotation, retainedPlacement, samePose } from './placement.js?v=studio-controls'
import { createAssembly, gearPoses, loadParts, raisedPose, snapGrid } from './model.js'
import { nearbyConnections } from './snap.js?v=studio-controls'
import { loadPalette, partOrder, parts } from './parts.js?v=editor-retry'
import { createScene } from './scene.js?v=studio-controls'
import { editorLabels } from './labels.js?v=studio-controls'

const isDriver = part => part && technic[part.design].some(port => port.role === 'axle' || port.role === 'gear')
const X = new Vector3(1, 0, 0)
const Y = new Vector3(0, 1, 0)
const turns = { KeyW: [X, -1], KeyS: [X, 1], KeyA: [Y, -1], KeyD: [Y, 1] }
const heldTurns = { ArrowUp: 'KeyW', ArrowDown: 'KeyS', ArrowLeft: 'KeyA', ArrowRight: 'KeyD' }
const steps = { ArrowUp: [0, 0, -1], ArrowDown: [0, 0, 1], ArrowLeft: [-1, 0, 0], ArrowRight: [1, 0, 0] }
const onGrid = value => Math.round(value / snapGrid) * snapGrid
let clipboard

export async function mountEditor(root, { document: source, language, save, download, signal }) {
  const t = editorLabels[language]
  const models = await loadPalette().catch(cause => {
    throw Object.assign(new Error('Failed to load parts palette', { cause }), { code: 'palette-load' })
  })
  if (signal.aborted) return
  root.innerHTML = `
    <header class="editor-bar">
      <a class="editor-back" href="#projects" aria-label="${t.home}"><img src="./assets/bricklab.svg" alt="" width="31" height="31"><span>${t.home}</span></a>
      <input class="editor-name" data-el="name" aria-label="${t.name}" maxlength="120">
      <div class="editor-modes">
        <button data-el="build" type="button">${t.build}</button>
        <button data-el="kinematics" type="button">${t.kinematics}</button>
      </div>
      <div class="editor-actions">
        <button data-el="undo" class="editor-square" type="button" title="${t.undo}" aria-label="${t.undo}">↶</button>
        <button data-el="redo" class="editor-square" type="button" title="${t.redo}" aria-label="${t.redo}">↷</button>
        <button data-el="export" type="button">${t.download}</button>
        <button data-el="save" class="editor-primary" type="button">${t.save}</button>
      </div>
    </header>
    <div class="editor-workspace">
      <aside class="editor-catalog">
        <h2>${t.parts}</h2>
        <input data-el="search" type="search" aria-label="${t.search}" placeholder="${t.search}">
        <div class="editor-parts" data-el="parts"></div>
      </aside>
      <section class="editor-viewport" data-el="viewport">
        <div class="editor-viewport-tools">
          <button type="button" data-el="selectTool" title="${t.select} (V)" aria-label="${t.select}"><svg class="icon" viewBox="0 0 24 24"><path d="m5 3 13 10-6 1-3 6z"/></svg></button>
          <button type="button" data-el="moveTool" title="${t.move} (T)" aria-label="${t.move}"><svg class="icon" viewBox="0 0 24 24"><path d="M12 3v18M3 12h18M9 6l3-3 3 3m-6 12 3 3 3-3M6 9l-3 3 3 3m12-6 3 3-3 3"/></svg></button>
          <button type="button" data-el="rotateTool" title="${t.rotate} (R)" aria-label="${t.rotate}"><svg class="icon" viewBox="0 0 24 24"><path d="M20 11a8 8 0 1 1-3-6m-2 3h5V3"/></svg></button>
          <button type="button" data-el="snap" aria-pressed="true">${t.snap}</button>
          <button type="button" data-el="frame">${t.reset}</button>
        </div>
        <div data-el="empty" class="editor-empty">${t.empty}</div>
        <div class="editor-coordinates" aria-hidden="true"><span>X</span><span>Y</span><span>Z</span></div>
      </section>
      <aside class="editor-inspector">
        <details open><summary>${t.info}</summary>
          <p data-el="selection"></p>
          <div class="editor-part-actions" data-el="partActions" hidden>
            <label>${t.color}<input type="color" data-el="color"></label>
            <button type="button" data-el="copy">${t.copy}</button>
            <button type="button" data-el="duplicate">${t.duplicate}</button>
            <button type="button" data-el="remove" class="editor-danger">${t.delete}</button>
          </div>
          <button type="button" data-el="paste" hidden>${t.paste}</button>
          <div data-el="insertion" class="editor-insertion" hidden>
            <span>${t.depth}</span><div>
              <button type="button" data-el="shallower" aria-label="${t.out}">−</button>
              <output data-el="depth">0</output>
              <button type="button" data-el="deeper" aria-label="${t.in}">+</button>
            </div>
            <small>${t.side}</small>
          </div>
          <div data-el="motion" class="editor-motion" hidden>
            <label>${t.drive}<input data-el="angle" type="range" min="-1080" max="1080" step="1" value="0"></label>
            <output data-el="degrees">0°</output>
            <button type="button" data-el="play">${t.play}</button>
          </div>
          <p class="editor-links" data-el="links"></p>
        </details>
      </aside>
    </div>
    <footer class="editor-status"><span data-el="hint" role="status"></span><span data-el="count"></span></footer>`
  const el = name => root.querySelector(`[data-el="${name}"]`)
  const on = (target, event, callback) => target.addEventListener(event, callback, { signal })
  let scene
  try {
    scene = createScene(el('viewport'), models)
  } catch (error) {
    root.replaceChildren()
    throw error
  }
  const visibleParts = loadParts(source, models)
  const shown = new Set(visibleParts.map(part => part.id))
  const hiddenParts = source.parts.filter(part => !shown.has(part?.id))
  const hiddenGears = Array.isArray(source.gears) ? source.gears.filter(gear => !shown.has(gear?.part)) : []
  const unknownLinks = source.connections.filter(link => !shown.has(link?.shaft?.part) || !shown.has(link?.socket?.part))
  let state = { parts: visibleParts, links: source.connections.filter(link => shown.has(link?.shaft?.part) && shown.has(link?.socket?.part)) }
  let assembly = createAssembly(state.parts, state.links)
  let mode = 'build'
  let selected
  let moving
  let tool = 'select'
  let snapEnabled = true
  let grab
  let rightDown
  let gizmoPart
  let ignoreGizmoClick = false
  let movesExisting = false
  let placementAssembly
  let pointer
  let candidate
  let pose
  let depth = 0
  let roll = 0
  let angle = 0
  let frame
  let transmission
  let pointerDown
  let directDrag
  let drag
  let links = assembly.connections
  let message = ''
  const undo = []
  const redo = []
  el('name').value = source.name

  function currentDocument() {
    return {
      ...source,
      name: el('name').value.trim() || source.name,
      parts: [...state.parts, ...hiddenParts],
      connections: [...state.links, ...unknownLinks],
      gears: [...gearPoses(state.parts).map(({ part, center, axis }) => ({ part, center, axis })), ...hiddenGears],
    }
  }

  function persist(showMessage = false) {
    const successful = save(currentDocument())
    message = successful ? (showMessage ? t.ready : '') : t.storage
    render()
  }

  function selectedPart() {
    return state.parts.find(part => part.id === selected)
  }

  function stopAnimation() {
    if (frame) cancelAnimationFrame(frame)
    frame = undefined
  }

  signal.addEventListener('abort', () => {
    stopAnimation()
    scene.dispose()
  }, { once: true })

  function showMotion() {
    if (transmission?.ok) scene.turn(state.parts, transmission.ratios, angle * Math.PI / 180)
    el('degrees').textContent = `${Math.round(angle)}°`
    el('angle').value = angle
  }

  function setSelection(id) {
    stopAnimation()
    scene.setParts(state.parts)
    selected = id
    scene.select(id)
    angle = 0
    transmission = mode === 'kinematics' && isDriver(selectedPart())
      ? assembly.rotationFrom(id, gearPoses(state.parts)) : null
    showMotion()
    render()
  }

  function applyState(next) {
    state = next
    assembly = createAssembly(state.parts, state.links)
    links = assembly.connections
    setSelection(state.parts.some(part => part.id === selected) ? selected : undefined)
    persist()
  }

  function commit(next) {
    undo.push(state)
    if (undo.length > 80) undo.shift()
    redo.length = 0
    applyState(next)
  }

  function restore(from, to) {
    if (!from.length) return
    cancelPlacement()
    cancelGizmo()
    to.push(state)
    const next = from.pop()
    if (!selected) {
      const currentIds = new Set(state.parts.map(part => part.id))
      const restored = next.parts.filter(part => !currentIds.has(part.id))
      if (restored.length === 1) selected = restored[0].id
    }
    applyState(next)
  }

  function renderCatalog() {
    const search = el('search').value.trim().toLocaleLowerCase(language)
    el('parts').replaceChildren()
    for (const design of partOrder) {
      const part = parts[design]
      if (!`${part[language]} ${design}`.toLocaleLowerCase(language).includes(search)) continue
      const button = document.createElement('button')
      const glyph = document.createElement('span')
      const name = document.createElement('span')
      const id = document.createElement('small')
      button.type = 'button'
      button.dataset.design = design
      button.setAttribute('aria-pressed', String(moving?.design === design && !movesExisting))
      glyph.className = `editor-glyph editor-glyph-${part.glyph}`
      glyph.style.color = part.color
      glyph.setAttribute('aria-hidden', 'true')
      name.textContent = part[language]
      id.textContent = design
      name.append(id)
      button.append(glyph, name)
      el('parts').append(button)
    }
  }

  function render() {
    const part = selectedPart()
    const selectedLinks = part ? links.filter(link => link.shaft.part === part.id || link.socket.part === part.id) : []
    el('selection').textContent = part ? parts[part.design][language] : t.none
    const building = mode === 'build'
    el('partActions').hidden = !part || !building || Boolean(moving || gizmoPart)
    el('paste').hidden = !clipboard || !building || Boolean(moving || gizmoPart)
    for (const name of ['select', 'move', 'rotate']) {
      const control = el(`${name}Tool`)
      control.disabled = !building
      control.setAttribute('aria-pressed', String(tool === name))
    }
    scene.setTool(building && !moving && tool !== 'select'
      ? tool === 'move' ? 'translate' : 'rotate' : null, part)
    if (part) el('color').value = /^#[0-9a-f]{6}$/i.test(part.color) ? part.color : parts[part.design].color
    el('links').textContent = mode === 'kinematics'
      ? transmission?.ok ? `${t.mesh}: ${transmission.meshes.length}` : t.driver
      : part ? `${t.joints}: ${selectedLinks.length}` : ''
    el('motion').hidden = !transmission?.ok || mode !== 'kinematics'
    el('play').textContent = frame ? t.stop : t.play
    el('insertion').hidden = !moving
    el('depth').value = String(depth)
    el('empty').hidden = Boolean(state.parts.length || moving)
    el('count').textContent = `${t.count}: ${state.parts.length} · ${t.linkCount}: ${links.length}`
    for (const name of ['build', 'kinematics']) el(name).setAttribute('aria-pressed', String(mode === name))
    for (const button of el('parts').children) {
      button.disabled = mode !== 'build'
      button.setAttribute('aria-pressed', String(moving?.design === button.dataset.design && !movesExisting))
    }
    el('snap').disabled = !building
    el('snap').setAttribute('aria-pressed', String(snapEnabled))
    el('undo').disabled = !undo.length
    el('redo').disabled = !redo.length
    const fit = candidate?.fit
    const cue = fit ? (fit.motion.rotation === 'locked' ? t.locked : fit.motion.rotation === 'detented' ? t.detented : t.freely)
      : candidate?.failure?.includes('occupied') ? t.occupied : candidate?.failure ? t.blocked : t.free
    el('hint').textContent = moving ? `${cue} · ${t.place}`
      : message || (hiddenParts.length ? t.unknown(hiddenParts.length) : t.camera)
  }

  function updatePointer(event, cycle = false) {
    pointer = event
    if (!moving) return
    const { ground, ray } = scene.pointer(event, false)
    const freePoint = grab ? ray.intersectPlane(grab.plane, new Vector3()) : ground
    const options = snapEnabled && !event.ctrlKey && !event.metaKey
      ? nearbyConnections({ scene, assembly: placementAssembly, parts: state.parts, moving, event, depth, roll })
      : []
    const index = options.findIndex(option => option.key === candidate?.key)
    const sticky = options[index]
    const first = options[0]
    if (cycle && options.length) candidate = options[(index + 1) % options.length]
    else if (sticky && Boolean(sticky.fit) === Boolean(first.fit) && sticky.distance <= first.distance + 8) candidate = sticky
    else candidate = first
    if (candidate?.fit) pose = { ...moving, ...candidate.pose }
    else if (grab) {
      const delta = freePoint?.sub(grab.anchor)
      const position = moving.position.map((value, i) => i === 1 ? value : value + onGrid(delta?.getComponent(i) ?? 0))
      pose = { ...moving, position }
    } else pose = freePoint ? raisedPose(moving, models.get(moving.design), freePoint) : null
    scene.setGhost(pose, candidate?.point, Boolean(candidate?.failure))
    render()
  }

  function startPlacement(part, existing = false, origin) {
    cancelGizmo()
    cancelPlacement()
    message = ''
    moving = part
    movesExisting = existing
    placementAssembly = createAssembly(existing ? state.parts : [...state.parts, part],
      existing ? state.links.filter(link => link.shaft.part !== part.id && link.socket.part !== part.id) : state.links)
    if (existing) {
      scene.setMoving(part.id, true)
      const plane = new Plane(Y, -part.position[1])
      const anchor = scene.pointer(origin, false).ray.intersectPlane(plane, new Vector3())
      if (anchor) grab = { plane, anchor }
    }
    pose = null
    if (pointer) updatePointer(pointer)
    render()
  }

  function cancelPlacement() {
    if (movesExisting) scene.setMoving(moving.id, false)
    moving = null
    directDrag = null
    movesExisting = false
    grab = null
    candidate = null
    pose = null
    depth = 0
    roll = 0
    scene.setGhost(null)
    render()
  }

  function place() {
    if (!pose || candidate?.failure) return
    const original = movesExisting ? state.parts.find(part => part.id === moving.id) : null
    if (original && samePose(original, pose) && !candidate) {
      cancelPlacement()
      return
    }
    const fit = candidate?.fit && placementAssembly.connect(candidate.shaft, candidate.socket, candidate.fit.placement)
    if (fit && !fit.ok) return
    const id = pose.id
    const placed = original ? state.parts.map(part => part.id === id ? pose : part) : [...state.parts, pose]
    const added = fit ? [{ shaft: candidate.shaft, socket: candidate.socket, placement: fit.placement }] : []
    const nextLinks = original ? transformLinks(placed, id, placementAssembly, added) : [...state.links, ...added]
    cancelPlacement()
    selected = id
    commit({ parts: placed, links: nextLinks })
  }

  function turnPart([axis, direction], smallStep) {
    const part = moving ?? selectedPart()
    if (!part) return
    const angle = direction * (smallStep ? Math.PI / 4 : Math.PI / 2)
    const rotation = new Quaternion().setFromAxisAngle(axis, angle)
      .multiply(new Quaternion().fromArray(part.rotation)).toArray()
    const next = { ...part, rotation }
    if (moving) {
      moving = next
      if (axis === Y) roll += angle
      if (pointer) updatePointer(pointer)
    } else finishTransform(part, next)
  }

  function cancelGizmo() {
    if (!gizmoPart) return
    const part = gizmoPart
    gizmoPart = null
    scene.cancelGizmo()
    scene.setMoving(part.id, false)
    scene.setGhost(null)
    render()
  }

  function transformLinks(placed, id, prepared, added = []) {
    const byId = new Map(placed.map(part => [part.id, part]))
    const attached = link => link?.shaft?.part === id || link?.socket?.part === id
    const retained = [...state.links.filter(link => !attached(link)), ...added]
    const checked = prepared ?? createAssembly(placed, retained)
    for (const { shaft: a, socket: b, placement: previous } of state.links.filter(attached)) {
      const shaft = byId.get(a?.part)
      const socket = byId.get(b?.part)
      const male = shaft && checked.port(shaft.id, a.port)
      const female = socket && checked.port(socket.id, b.port)
      if (!male || !female || !previous) continue
      const placement = retainedPlacement(shaft, male, socket, female, previous)
      if (!placement) continue
      const fit = checked.previewInsertion(a, b, placement)
      if (!fit.ok || Math.abs(fit.placement.roll - placement.roll) > .002) continue
      checked.connect(a, b, fit.placement)
      retained.push({ shaft: a, socket: b, placement: fit.placement })
    }
    return retained
  }

  function finishTransform(before, after) {
    cancelGizmo()
    if (samePose(before, after)) return
    const placed = state.parts.map(part => part.id === after.id ? after : part)
    selected = after.id
    commit({ parts: placed, links: transformLinks(placed, after.id) })
  }

  function copyPart() {
    const part = selectedPart()
    if (!part || mode !== 'build' || moving || gizmoPart) return
    clipboard = structuredClone(part)
    message = t.copied
    render()
  }

  function insertCopy(part) {
    if (!part || mode !== 'build') return
    const copy = { ...structuredClone(part), id: crypto.randomUUID() }
    startPlacement(copy)
  }

  function setTool(next) {
    if (mode !== 'build') return
    cancelGizmo()
    cancelPlacement()
    tool = next
    render()
  }

  function changeDepth(step) {
    depth += step
    if (pointer) updatePointer(pointer)
    else render()
  }

  function setMode(next) {
    cancelGizmo()
    cancelPlacement()
    mode = next
    setSelection(selected)
  }

  function stepAnimation(time) {
    if (!frame) return
    if (!stepAnimation.previous) stepAnimation.previous = time
    angle += Math.min(50, time - stepAnimation.previous) * .0015
    stepAnimation.previous = time
    if (angle > 1080) {
      angle = 1080
      stopAnimation()
      showMotion()
      render()
      return
    }
    showMotion()
    frame = requestAnimationFrame(stepAnimation)
  }

  on(el('parts'), 'click', event => {
    const design = event.target.closest('button')?.dataset.design
    if (!design || mode !== 'build') return
    startPlacement({ id: crypto.randomUUID(), design, position: [0, 0, 0], rotation: baseRotation, color: parts[design].color })
  })
  on(el('search'), 'input', renderCatalog)
  on(el('build'), 'click', () => setMode('build'))
  on(el('kinematics'), 'click', () => setMode('kinematics'))
  on(el('undo'), 'click', () => restore(undo, redo))
  on(el('redo'), 'click', () => restore(redo, undo))
  on(el('frame'), 'click', scene.resetView)
  on(el('name'), 'change', () => {
    if (!el('name').value.trim()) el('name').value = currentDocument().name
    persist()
  })
  on(el('save'), 'click', () => persist(true))
  on(el('export'), 'click', () => download(currentDocument()))
  for (const name of ['select', 'move', 'rotate']) on(el(`${name}Tool`), 'click', () => setTool(name))
  on(window, 'keyup', event => {
    if (moving && pointer && ['Control', 'Meta'].includes(event.key)) {
      updatePointer({ clientX: pointer.clientX, clientY: pointer.clientY, ctrlKey: event.ctrlKey, metaKey: event.metaKey })
    }
  })
  on(el('snap'), 'click', () => {
    snapEnabled = !snapEnabled
    if (moving && pointer) updatePointer(pointer)
    else render()
  })
  on(el('copy'), 'click', copyPart)
  on(el('paste'), 'click', () => insertCopy(clipboard))
  on(el('duplicate'), 'click', () => insertCopy(selectedPart()))
  on(el('remove'), 'click', () => {
    if (!selected || mode !== 'build' || moving || gizmoPart) return
    commit({ parts: state.parts.filter(part => part.id !== selected),
      links: state.links.filter(link => link.shaft.part !== selected && link.socket.part !== selected) })
  })
  on(el('color'), 'change', event => {
    if (!selected || mode !== 'build' || moving || gizmoPart) return
    commit({ ...state, parts: state.parts.map(part => part.id === selected ? { ...part, color: event.target.value } : part) })
  })
  on(el('shallower'), 'click', () => changeDepth(-2))
  on(el('deeper'), 'click', () => changeDepth(2))
  on(el('angle'), 'input', event => {
    stopAnimation()
    angle = Number(event.target.value)
    showMotion()
    render()
  })
  on(el('play'), 'click', () => {
    if (frame) stopAnimation()
    else {
      stepAnimation.previous = 0
      frame = requestAnimationFrame(stepAnimation)
    }
    render()
  })
  scene.gizmo.addEventListener('mouseDown', () => {
    gizmoPart = selectedPart()
    ignoreGizmoClick = Boolean(gizmoPart)
    if (gizmoPart) scene.setMoving(gizmoPart.id, true)
    scene.canvas.focus({ preventScroll: true })
  })
  scene.gizmo.addEventListener('objectChange', () => {
    if (gizmoPart) scene.setGhost(scene.gizmoPose(gizmoPart))
  })
  scene.gizmo.addEventListener('mouseUp', () => {
    if (!gizmoPart) return
    const part = gizmoPart
    const pose = scene.gizmoPose(part)
    // TransformControls clears its own dragging flag after this event.
    queueMicrotask(() => { if (gizmoPart === part) finishTransform(part, pose) })
  })
  on(scene.canvas, 'pointerdown', event => {
    if (event.button === 2) {
      rightDown = [event.clientX, event.clientY]
      return
    }
    if (event.button !== 0) return
    if (!gizmoPart) ignoreGizmoClick = false
    scene.canvas.focus({ preventScroll: true })
    pointerDown = [event.clientX, event.clientY]
    if (mode === 'build') {
      if (!gizmoPart && !moving && tool === 'select' && event.pointerType !== 'touch') {
        const hit = scene.pointer(event).hit
        const part = state.parts.find(entry => entry.id === hit)
        if (part) {
          setSelection(hit)
          directDrag = { part, start: event }
        }
      }
      return
    }
    const hit = scene.pointer(event).hit
    const part = state.parts.find(entry => entry.id === hit)
    if (!isDriver(part)) return
    if (hit !== selected) setSelection(hit)
    stopAnimation()
    scene.canvas.setPointerCapture(event.pointerId)
    drag = { x: event.clientX, angle }
    render()
  })
  on(scene.canvas, 'pointermove', event => {
    if (drag) {
      angle = Math.max(-1080, Math.min(1080, drag.angle + (event.clientX - drag.x) * 2))
      showMotion()
    } else if (directDrag && !moving && (event.buttons & 1) &&
        Math.hypot(event.clientX - directDrag.start.clientX, event.clientY - directDrag.start.clientY) >= 5) {
      const { part, start } = directDrag
      pointer = event
      startPlacement(part, true, start)
      directDrag = { part, start }
    } else if ((moving && directDrag && (event.buttons & 1)) || !event.buttons) {
      updatePointer(event)
    }
  })
  on(scene.canvas, 'pointerup', event => {
    if (event.button === 2) {
      if (rightDown && Math.hypot(event.clientX - rightDown[0], event.clientY - rightDown[1]) < 5) {
        cancelGizmo()
        cancelPlacement()
      } else if (moving) updatePointer(event)
      rightDown = null
      return
    }
    if (event.button !== 0) return
    const click = pointerDown && Math.hypot(event.clientX - pointerDown[0], event.clientY - pointerDown[1]) < 5
    pointerDown = null
    if (ignoreGizmoClick) {
      ignoreGizmoClick = false
      return
    }
    if (drag) {
      drag = null
      return
    }
    const releasedPart = Boolean(directDrag && moving)
    directDrag = null
    if (moving && (click || releasedPart)) {
      updatePointer(event)
      place()
    } else if (click) setSelection(scene.pointer(event).hit)
  })
  on(scene.canvas, 'pointercancel', () => {
    pointerDown = null
    rightDown = null
    drag = null
    ignoreGizmoClick = false
    cancelGizmo()
    cancelPlacement()
  })
  on(window, 'keydown', event => {
    if (event.key === 'Escape' && (moving || gizmoPart)) {
      event.preventDefault()
      cancelGizmo()
      cancelPlacement()
      return
    }
    if (event.target.closest?.('input, textarea, select, [contenteditable]') || event.altKey) return
    if (event.ctrlKey || event.metaKey) {
      if (moving && pointer && ['Control', 'Meta'].includes(event.key)) {
        updatePointer({ clientX: pointer.clientX, clientY: pointer.clientY, ctrlKey: event.ctrlKey, metaKey: event.metaKey })
      }
      const actions = {
        KeyZ: () => event.shiftKey ? restore(redo, undo) : restore(undo, redo),
        KeyY: () => restore(redo, undo),
        KeyS: () => persist(true),
        KeyC: copyPart,
        KeyV: () => insertCopy(clipboard),
        KeyD: () => insertCopy(selectedPart()),
        KeyX: () => {
          copyPart()
          el('remove').click()
        },
      }
      const action = actions[event.code]
      if (action && (!['KeyC', 'KeyV', 'KeyD', 'KeyX'].includes(event.code) || mode === 'build')) {
        event.preventDefault()
        action()
      }
      return
    }
    if (mode !== 'build' || gizmoPart) return
    const turn = turns[moving ? heldTurns[event.code] ?? event.code : event.code]
    if (turn) {
      event.preventDefault()
      if (!event.repeat) turnPart(turn, event.shiftKey)
      return
    }
    if (moving) {
      if (event.code === 'Space' || event.key === 'Enter' && !event.target.closest?.('button, a')) {
        event.preventDefault()
        place()
      } else if (event.key === 'Tab' && candidate && pointer) {
        event.preventDefault()
        updatePointer(pointer, true)
      }
      return
    }
    const step = steps[event.code]
    const part = selectedPart()
    if (step && part) {
      event.preventDefault()
      const position = part.position.map((value, axis) => value + step[axis] * snapGrid)
      finishTransform(part, { ...part, position })
      return
    }
    const actions = {
      Escape: () => setTool('select'),
      KeyV: () => setTool('select'),
      KeyT: () => setTool('move'),
      KeyR: () => setTool('rotate'),
      Delete: () => el('remove').click(),
    }
    const action = actions[event.code]
    if (action && !event.repeat) {
      event.preventDefault()
      action()
    }
  })

  renderCatalog()
  scene.setParts(state.parts)
  scene.resetView()
  render()
}
