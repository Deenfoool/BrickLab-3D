import { Quaternion, Vector3 } from 'three'
import { technic } from '../mechanics/catalog.js'
import { baseRotation } from './placement.js'
import { createAssembly, gearPoses, loadParts, raisedPose } from './model.js'
import { nearbyConnections } from './snap.js'
import { loadPalette, partOrder, parts } from './parts.js'
import { createScene } from './scene.js'
import { editorLabels } from './labels.js'

const isDriver = part => part && technic[part.design].some(port => port.role === 'axle' || port.role === 'gear')
const Y = new Vector3(0, 1, 0)

export async function mountEditor(root, { document: source, language, save, download, signal }) {
  const t = editorLabels[language]
  const models = await loadPalette()
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
        <div class="editor-viewport-tools"><button type="button" data-el="frame">${t.reset}</button></div>
        <div data-el="empty" class="editor-empty">${t.empty}</div>
        <div class="editor-coordinates" aria-hidden="true"><span>X</span><span>Y</span><span>Z</span></div>
      </section>
      <aside class="editor-inspector">
        <details open><summary>${t.info}</summary>
          <p data-el="selection"></p>
          <div class="editor-part-actions" data-el="partActions" hidden>
            <label>${t.color}<input type="color" data-el="color"></label>
            <button type="button" data-el="move">${t.move}</button>
            <button type="button" data-el="rotate">${t.rotate}</button>
            <button type="button" data-el="remove" class="editor-danger">${t.delete}</button>
          </div>
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
  let movesExisting = false
  let placementAssembly
  let pointer
  let candidate
  let pose
  let depth = 0
  let roll = 0
  let chooseNext = false
  let angle = 0
  let frame
  let transmission
  let pointerDown
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
    to.push(state)
    applyState(from.pop())
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
    el('partActions').hidden = !part || mode !== 'build' || Boolean(moving)
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
    el('undo').disabled = !undo.length
    el('redo').disabled = !redo.length
    const fit = candidate?.fit
    const cue = fit ? (fit.motion.rotation === 'locked' ? t.locked : fit.motion.rotation === 'detented' ? t.detented : t.freely)
      : candidate?.failure?.includes('occupied') ? t.occupied : candidate?.failure ? t.blocked : t.free
    el('hint').textContent = moving ? `${cue} · ${t.place}`
      : message || (hiddenParts.length ? t.unknown(hiddenParts.length) : t.camera)
  }

  function updatePointer(event) {
    pointer = event
    if (!moving) return
    const { ground } = scene.pointer(event, false)
    const options = nearbyConnections({
      scene, assembly: placementAssembly, parts: state.parts, moving, event, depth, roll, previous: candidate?.key,
    })
    const index = options.findIndex(option => option.key === candidate?.key)
    candidate = chooseNext ? options[(index + 1) % options.length] : options[0]
    chooseNext = false
    if (candidate?.fit) pose = { ...moving, ...candidate.pose }
    else pose = ground ? raisedPose(moving, models.get(moving.design), ground) : null
    scene.setGhost(pose, candidate?.point, Boolean(candidate?.failure))
    render()
  }

  function startPlacement(part, existing = false) {
    cancelPlacement()
    moving = part
    movesExisting = existing
    placementAssembly = createAssembly(existing ? state.parts : [...state.parts, part],
      existing ? state.links.filter(link => link.shaft.part !== part.id && link.socket.part !== part.id) : state.links)
    if (existing) scene.setMoving(part.id, true)
    if (pointer) updatePointer(pointer)
    render()
  }

  function cancelPlacement() {
    if (movesExisting) scene.setMoving(moving.id, false)
    moving = null
    movesExisting = false
    candidate = null
    pose = null
    depth = 0
    roll = 0
    scene.setGhost(null)
    render()
  }

  function place() {
    if (!pose || candidate?.failure) return
    const fit = candidate?.fit && placementAssembly.connect(candidate.shaft, candidate.socket, candidate.fit.placement)
    if (fit && !fit.ok) return
    const id = pose.id
    const placed = movesExisting ? state.parts.map(part => part.id === id ? pose : part) : [...state.parts, pose]
    const links = movesExisting ? state.links.filter(link => link.shaft.part !== id && link.socket.part !== id) : [...state.links]
    if (fit) links.push({ shaft: candidate.shaft, socket: candidate.socket, placement: fit.placement })
    cancelPlacement()
    selected = id
    commit({ parts: placed, links })
  }

  function rotatePlacement() {
    if (!moving) return
    roll = (roll + Math.PI / 2) % (Math.PI * 2)
    moving = { ...moving, rotation: new Quaternion().setFromAxisAngle(Y, Math.PI / 2)
      .multiply(new Quaternion().fromArray(moving.rotation)).toArray() }
    if (pointer) updatePointer(pointer)
  }

  function changeDepth(step) {
    depth += step
    if (pointer) updatePointer(pointer)
    else render()
  }

  function setMode(next) {
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
  on(el('move'), 'click', () => { if (selectedPart()) startPlacement(selectedPart(), true) })
  on(el('rotate'), 'click', () => { if (selectedPart()) { startPlacement(selectedPart(), true); rotatePlacement() } })
  on(el('remove'), 'click', () => {
    if (!selected) return
    commit({ parts: state.parts.filter(part => part.id !== selected),
      links: state.links.filter(link => link.shaft.part !== selected && link.socket.part !== selected) })
  })
  on(el('color'), 'change', event => {
    if (!selected) return
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
  on(scene.canvas, 'pointerdown', event => {
    if (event.button !== 0) return
    pointerDown = [event.clientX, event.clientY]
    if (mode !== 'kinematics') return
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
    } else if (!event.buttons) updatePointer(event)
  })
  on(scene.canvas, 'pointerup', event => {
    const click = event.button === 0 && pointerDown && Math.hypot(event.clientX - pointerDown[0], event.clientY - pointerDown[1]) < 5
    pointerDown = null
    if (drag) {
      drag = null
      return
    }
    if (!click) return
    if (moving) {
      updatePointer(event)
      place()
    } else setSelection(scene.pointer(event).hit)
  })
  on(scene.canvas, 'pointercancel', () => {
    pointerDown = null
    drag = null
  })
  on(window, 'keydown', event => {
    if (event.key === 'Escape' && moving) {
      cancelPlacement()
      return
    }
    if (event.target.closest?.('input, textarea, select, [contenteditable]')) return
    if (event.ctrlKey || event.metaKey) {
      if (event.code === 'KeyZ' || event.code === 'KeyY') {
        event.preventDefault()
        if (event.shiftKey || event.code === 'KeyY') restore(redo, undo)
        else restore(undo, redo)
      } else if (event.code === 'KeyS') {
        event.preventDefault()
        persist(true)
      }
      return
    }
    if (!moving) {
      if (event.key === 'Delete' && mode === 'build') el('remove').click()
      return
    }
    if (event.code === 'KeyR') rotatePlacement()
    if (event.key === 'Tab' && candidate && pointer) {
      event.preventDefault()
      chooseNext = true
      updatePointer(pointer)
    }
  })

  renderCatalog()
  scene.setParts(state.parts)
  scene.resetView()
  render()
}
