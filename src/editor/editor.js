import { Plane, Quaternion, Vector3 } from 'three'
import { technic } from '../mechanics/catalog.js?v=mechanics-audit'
import { baseRotation, samePose, worldPort } from './placement.js?v=mechanics-audit'
import { connectPlaced, createAssembly, gearPoses, hingeMotion, hingePoses, loadParts, raisedPose, snapGrid } from './model.js?v=mechanics-audit'
import { axleEnds, axleOptions, resizeAxle } from './axle-length.js'
import { nearestDetent, portLength } from '../mechanics/axial.js?v=mechanics-audit'
import { nearbyConnections } from './snap.js?v=mechanics-audit'
import { loadPalette, partOrder, parts } from './parts.js?v=mechanics-audit'
import { createScene } from './scene.js?v=mechanics-audit'
import { editorLabels } from './labels.js?v=mechanics-audit'

const isDriver = part => part && technic[part.design].some(port => port.role === 'axle' || port.role === 'gear')
const X = new Vector3(1, 0, 0)
const Y = new Vector3(0, 1, 0)
const heldTurns = { ArrowUp: [X, -1], ArrowDown: [X, 1], ArrowLeft: [Y, -1], ArrowRight: [Y, 1] }
const steps = { ArrowUp: [0, 0, -1], ArrowDown: [0, 0, 1], ArrowLeft: [-1, 0, 0], ArrowRight: [1, 0, 0] }
const connectionRecord = ({ shaft, socket, fit }) => ({ shaft, socket, placement: fit.placement })
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
          <button type="button" data-el="moveTool" title="${t.move} (G / П)" aria-label="${t.move}"><svg class="icon" viewBox="0 0 24 24"><path d="M12 3v18M3 12h18M9 6l3-3 3 3m-6 12 3 3 3-3M6 9l-3 3 3 3m12-6 3 3-3 3"/></svg></button>
          <button type="button" data-el="rotateTool" title="${t.rotate} (R / К)" aria-label="${t.rotate}"><svg class="icon" viewBox="0 0 24 24"><path d="M20 11a8 8 0 1 1-3-6m-2 3h5V3"/></svg></button>
          <button type="button" data-el="lengthTool" title="${t.length} (S / Ы)" aria-label="${t.length}"><svg class="icon" viewBox="0 0 24 24"><path d="M3 12h18M7 8l-4 4 4 4m10-8 4 4-4 4M12 7v10"/></svg></button>
          <button type="button" data-el="snap" aria-pressed="true">${t.snap}</button>
          <button type="button" data-el="frame">${t.reset}</button>
        </div>
        <div class="editor-axle-handles" data-el="axleHandles" hidden>
          ${[0, 1].map(end => `<button type="button" class="editor-axle-end" data-end="${end}" aria-label="${t.axleEnd(end + 1)}" title="${t.axleEnd(end + 1)}">↔</button>`).join('')}
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
            <button type="button" data-el="applyHinge" hidden>${t.applyHinge}</button>
          </div>
          <p class="editor-links" data-el="links"></p>
        </details>
      </aside>
    </div>
    <footer class="editor-status"><span data-el="hint" role="status"></span><span data-el="loadNotice" role="status"></span><span data-el="count"></span></footer>`
  const el = name => root.querySelector(`[data-el="${name}"]`)
  const on = (target, event, callback, capture = false) => target.addEventListener(event, callback, { signal, capture })
  let scene
  try {
    scene = createScene(el('viewport'), models)
  } catch (error) {
    root.replaceChildren()
    throw error
  }
  const visibleParts = loadParts(source, models)
  const shown = new Set(visibleParts.map(part => part.id))
  const hiddenParts = source.parts.filter(part => !models.has(String(part?.design ?? '')))
  const hiddenGears = Array.isArray(source.gears) ? source.gears.filter(gear => !shown.has(gear?.part)) : []
  const hiddenIds = new Set(hiddenParts.map(part => part?.id).filter(id => typeof id === 'string' && !shown.has(id)))
  const unknownLinks = source.connections.filter(link => hiddenIds.has(link?.shaft?.part) || hiddenIds.has(link?.socket?.part))
  let state = { parts: visibleParts, links: source.connections.filter(link => shown.has(link?.shaft?.part) && shown.has(link?.socket?.part)) }
  let assembly = createAssembly(state.parts, state.links)
  const discardedLinks = source.connections.length - assembly.connections.length - unknownLinks.length
  state.links = assembly.connections.map(connectionRecord)
  let mode = 'build'
  let selected
  let moving
  let pastedGroup
  let tool = 'move'
  const additional = new Set()
  let resize
  let transform
  let gizmoSnap
  let gizmoRaw
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
  let hinge
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
    if (hinge?.ok) {
      const target = nearestDetent(hinge.detents, angle * Math.PI / 180)
      angle = target * 180 / Math.PI
      scene.previewParts(hingePoses(state.parts, hinge, target).filter(part => hinge.moving.has(part.id)))
      scene.select(selected)
      el('applyHinge').disabled = Math.abs(target - hinge.roll) < 1e-8
    } else if (transmission?.ok) scene.turn(state.parts, transmission.ratios, angle * Math.PI / 180)
    el('degrees').textContent = `${Number(angle.toFixed(2))}°`
    el('angle').value = angle
  }

  const selectionIds = () => selected ? [selected, ...additional] : []
  const canResize = part => !additional.size && axleOptions(part).length > 1
  const dragActive = () => Boolean(moving || gizmoPart || resize)
  const snapAllowed = event => snapEnabled && !event?.ctrlKey && !event?.metaKey

  function selectClick(id, toggle = false) {
    if (!toggle || mode !== 'build') {
      additional.clear()
      setSelection(id)
    } else if (id === selected) {
      const next = additional.values().next().value
      additional.delete(next)
      setSelection(next)
    } else if (id) {
      if (!selected) setSelection(id)
      else {
        if (additional.has(id)) additional.delete(id)
        else additional.add(id)
        setSelection(selected)
      }
    }
  }

  function setSelection(id) {
    stopAnimation()
    scene.setParts(state.parts)
    selected = id
    if (tool === 'length' && !canResize(selectedPart())) tool = 'move'
    scene.select(id)
    updateHighlights()
    hinge = mode === 'kinematics' && id ? hingeMotion(id, state.parts, links) : undefined
    angle = hinge?.ok ? hinge.roll * 180 / Math.PI : 0
    transmission = mode === 'kinematics' && isDriver(selectedPart())
      ? assembly.rotationFrom(id, gearPoses(state.parts)) : null
    showMotion()
    render()
  }

  function applyState(next) {
    state = next
    assembly = createAssembly(state.parts, state.links)
    links = assembly.connections
    state.links = links.map(connectionRecord)
    const ids = new Set(state.parts.map(part => part.id))
    for (const id of additional) if (!ids.has(id)) additional.delete(id)
    if (!ids.has(selected)) {
      selected = additional.values().next().value
      additional.delete(selected)
    }
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
    cancelResize()
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
    el('selection').textContent = additional.size ? t.selectedCount(selectionIds().length) : part ? parts[part.design][language] : t.none
    const building = mode === 'build'
    el('partActions').hidden = !part || !building || dragActive()
    el('paste').hidden = !clipboard || !building || dragActive()
    for (const name of ['select', 'move', 'rotate', 'length']) {
      const control = el(`${name}Tool`)
      control.disabled = !building || (name === 'length' && !canResize(part))
      control.setAttribute('aria-pressed', String(tool === name))
    }
    scene.setTool(building && !moving && !resize && (tool === 'move' || tool === 'rotate')
      ? tool === 'move' ? 'translate' : 'rotate' : null, part, selectionIds())
    positionHandles()
    if (part) el('color').value = /^#[0-9a-f]{6}$/i.test(part.color) ? part.color : parts[part.design].color
    el('links').textContent = mode === 'kinematics'
      ? hinge ? (hinge.ok ? t.detented : t.closedHinge)
        : transmission ? (transmission.ok ? `${t.mesh}: ${transmission.meshes.length}` : t.transmissionError)
          : t.driver
      : part ? `${t.joints}: ${selectedLinks.length}` : ''
    el('motion').hidden = (!hinge?.ok && !transmission?.ok) || mode !== 'kinematics'
    el('play').hidden = Boolean(hinge)
    el('applyHinge').hidden = !hinge?.ok
    const range = el('angle')
    range.min = hinge?.ok ? hinge.detents[0] * 180 / Math.PI : -1080
    range.max = hinge?.ok ? hinge.detents.at(-1) * 180 / Math.PI : 1080
    range.step = hinge?.ok ? 'any' : '1'
    range.value = angle
    el('play').textContent = frame ? t.stop : t.play
    el('insertion').hidden = !moving
    el('depth').value = String(depth)
    el('empty').hidden = Boolean(state.parts.length || moving)
    el('count').textContent = `${t.count}: ${state.parts.length} · ${t.linkCount}: ${links.length}`
    el('loadNotice').textContent = discardedLinks ? t.discarded(discardedLinks) : ''
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
    el('hint').textContent = resize ? t.lengthPreview(parts[resize.pose.design][language], resize.lost.length, resize.kept) :
      gizmoSnap?.fit ? t.snapPreview : moving ? `${cue} · ${t.place}`
      : message || (hiddenParts.length ? t.unknown(hiddenParts.length) : t.camera)
  }

  function updatePointer(event, cycle = false) {
    pointer = event
    if (!moving) return
    const { ground, ray } = scene.pointer(event, false)
    const freePoint = grab ? ray.intersectPlane(grab.plane, new Vector3()) : ground
    const options = !pastedGroup && snapAllowed(event)
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
    scene.setGroupGhost(pose && pastedGroup ? groupTransforms(pastedGroup.items, pastedGroup.anchor, pose) : [])
    render()
  }

  function startPlacement(part, existing = false, origin, group) {
    cancelGizmo()
    cancelPlacement()
    cancelResize()
    message = ''
    moving = part
    pastedGroup = group
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
    pastedGroup = null
    directDrag = null
    movesExisting = false
    grab = null
    candidate = null
    pose = null
    depth = 0
    roll = 0
    scene.setGhost(null)
    scene.setGroupGhost([])
    render()
  }

  function place() {
    if (!pose || candidate?.failure) return
    const original = movesExisting ? state.parts.find(part => part.id === moving.id) : null
    if (original && samePose(original, pose) && !candidate) {
      cancelPlacement()
      cancelResize()
      return
    }
    const fit = candidate?.fit && placementAssembly.connect(candidate.shaft, candidate.socket, candidate.fit.placement)
    if (fit && !fit.ok) return
    const id = pose.id
    const copied = pastedGroup ? groupTransforms(pastedGroup.items, pastedGroup.anchor, pose) : []
    const placed = original ? state.parts.map(part => part.id === id ? pose : part) : [...state.parts, pose, ...copied]
    const added = fit ? [{ shaft: candidate.shaft, socket: candidate.socket, placement: fit.placement }] : []
    const nextLinks = original ? transformLinks(placed, id, added) : [...state.links, ...(pastedGroup?.links ?? []), ...added]
    cancelPlacement()
    additional.clear()
    for (const part of copied) additional.add(part.id)
    selected = id
    commit({ parts: placed, links: nextLinks })
  }

  function turnPart([axis, direction], smallStep) {
    const part = moving
    if (!part) return
    const angle = direction * (smallStep ? Math.PI / 4 : Math.PI / 2)
    const rotation = new Quaternion().setFromAxisAngle(axis, angle)
      .multiply(new Quaternion().fromArray(part.rotation)).toArray()
    const next = { ...part, rotation }
    moving = next
    if (axis === Y) roll += angle
    if (pointer) updatePointer(pointer)
  }

  function cancelGizmo() {
    if (!gizmoPart) return
    const part = gizmoPart
    gizmoPart = null
    transform = null
    gizmoRaw = null
    gizmoSnap = null
    scene.cancelGizmo()
    scene.setParts(state.parts)
    scene.setMoving(part.id, false)
    scene.setGhost(null)
    render()
  }

  function transformLinks(placed, ids, added = []) {
    const byId = new Map(placed.map(part => [part.id, part]))
    const changed = new Set(Array.isArray(ids) ? ids : [ids])
    const attached = link => changed.has(link?.shaft?.part) || changed.has(link?.socket?.part)
    const retained = [...state.links.filter(link => !attached(link)), ...added]
    const checked = createAssembly(placed, retained)
    for (const { shaft: a, socket: b, placement: previous } of state.links.filter(attached)) {
      const shaft = byId.get(a?.part)
      const socket = byId.get(b?.part)
      if (!shaft || !socket || !previous) continue
      const fit = connectPlaced(checked, shaft, socket, { shaft: a, socket: b, placement: previous })
      if (fit.ok) retained.push(connectionRecord({ shaft: a, socket: b, fit }))
    }
    return retained
  }

  function finishTransform(before, after, snap) {
    cancelGizmo()
    if (!snap && before.design === after.design && samePose(before, after)) return
    const edited = new Map([after, ...groupTransforms(state.parts.filter(item => additional.has(item.id)), before, after)].map(part => [part.id, part]))
    const placed = state.parts.map(part => edited.get(part.id) ?? part)
    selected = after.id
    const added = snap?.fit ? [{ shaft: snap.shaft, socket: snap.socket, placement: snap.fit.placement }] : []
    commit({ parts: placed, links: transformLinks(placed, [...edited.keys()], added) })
  }

  function clipboardSelection() {
    const part = selectedPart()
    if (!part || mode !== 'build' || dragActive()) return
    const items = state.parts.filter(item => additional.has(item.id))
    const ids = new Set(selectionIds())
    const links = state.links.filter(link => ids.has(link.shaft.part) && ids.has(link.socket.part))
    return structuredClone({ anchor: part, items, links })
  }

  function copyPart() {
    const copy = clipboardSelection()
    if (!copy) return
    clipboard = copy
    message = t.copied
    render()
  }

  function insertCopy(group) {
    if (!group || mode !== 'build' || dragActive()) return
    const copied = [group.anchor, ...group.items].map(part => ({ ...part, id: crypto.randomUUID() }))
    const ids = new Map([group.anchor, ...group.items].map((part, i) => [part.id, copied[i].id]))
    const links = group.links.map(link => ({
      shaft: { ...link.shaft, part: ids.get(link.shaft.part) },
      socket: { ...link.socket, part: ids.get(link.socket.part) },
      placement: link.placement,
    }))
    const [anchor, ...items] = copied
    startPlacement(anchor, false, undefined, items.length ? { anchor, items, links } : undefined)
  }

  function setTool(next) {
    if (mode !== 'build' || (next === 'length' && !canResize(selectedPart()))) return
    if (moving) return
    cancelGizmo()
    cancelResize()
    message = ''
    tool = next
    render()
  }

  function updateHighlights() {
    scene.highlight(additional.size ? [...additional] : [], 0xffb01b)
  }

  function positionHandles() {
    const handles = el('axleHandles')
    const part = resize?.pose ?? selectedPart()
    handles.hidden = mode !== 'build' || tool !== 'length' || !canResize(part) || Boolean(moving)
    if (handles.hidden) return
    const ends = axleEnds(part)
    const rectangle = el('viewport').getBoundingClientRect()
    const points = ends.map(scene.project)
    const dx = points[1].clientX - points[0].clientX
    const dy = points[1].clientY - points[0].clientY
    const span = Math.hypot(dx, dy)
    for (const [end, handle] of [...handles.children].entries()) {
      const point = points[end]
      const direction = end === 0 ? -1 : 1
      const insetX = span > 1 ? 12 * direction * dx / span : 16 * direction
      const insetY = span > 1 ? 12 * direction * dy / span : 0
      handle.hidden = !point.visible
      handle.style.left = `${point.clientX - rectangle.left + insetX}px`
      handle.style.top = `${point.clientY - rectangle.top + insetY}px`
    }
  }

  function beginResize(event) {
    const handle = event.target.closest('[data-end]')
    const part = selectedPart()
    if (!handle || event.button !== 0 || !canResize(part)) return
    event.preventDefault()
    scene.canvas.focus({ preventScroll: true })
    handle.setPointerCapture(event.pointerId)
    const end = Number(handle.dataset.end)
    const ends = axleEnds(part)
    const point = ends[end]
    const direction = point.clone().sub(ends[1 - end]).normalize()
    const from = scene.project(point)
    const to = scene.project(point.clone().addScaledVector(direction, 20))
    const dx = to.clientX - from.clientX
    const dy = to.clientY - from.clientY
    const lengthSquared = dx * dx + dy * dy
    resize = { part, end, pose: part, startX: event.clientX, startY: event.clientY,
      dx, dy, lengthSquared, lost: [],
      kept: links.filter(link => link.shaft.part === part.id || link.socket.part === part.id).length,
      pointerId: event.pointerId }
    scene.setMoving(part.id, true)
    scene.setGhost(part)
    render()
  }

  function previewResize(event) {
    if (!resize || event.pointerId !== resize.pointerId) return
    const { part, end, startX, startY, dx, dy, lengthSquared } = resize
    const distance = lengthSquared > 1
      ? 20 * ((event.clientX - startX) * dx + (event.clientY - startY) * dy) / lengthSquared
      : (end === 0 ? -1 : 1) * (event.clientX - startX)
    const pose = resizeAxle(part, end, distance)
    if (pose.design === resize.pose.design) return
    resize.pose = pose
    const placed = state.parts.map(item => item.id === part.id ? pose : item)
    resize.placed = placed
    resize.links = transformLinks(placed, part.id)
    const key = link => JSON.stringify([link.shaft, link.socket])
    const retained = new Set(resize.links.map(key))
    const original = links.filter(link => link.shaft.part === part.id || link.socket.part === part.id)
    resize.lost = original.filter(link => !retained.has(key(link)))
    resize.kept = original.length - resize.lost.length
    scene.highlight(resize.lost.map(link => link.shaft.part === part.id ? link.socket.part : link.shaft.part))
    scene.setGhost(pose)
    render()
  }

  function cancelResize() {
    if (!resize) return
    scene.setMoving(resize.part.id, false)
    resize = null
    updateHighlights()
    scene.setGhost(null)
    render()
  }

  function finishResize(event) {
    if (!resize || event.pointerId !== resize.pointerId) return
    previewResize(event)
    const { part, pose, placed, links } = resize
    cancelResize()
    if (pose.design !== part.design) commit({ parts: placed, links })
  }

  function groupTransforms(items, part, pose) {
    const rotation = new Quaternion().fromArray(pose.rotation)
      .multiply(new Quaternion().fromArray(part.rotation).invert())
    const origin = new Vector3().fromArray(part.position)
    const next = new Vector3().fromArray(pose.position)
    return items.map(item => ({
      ...item,
      position: new Vector3().fromArray(item.position).sub(origin).applyQuaternion(rotation).add(next).toArray(),
      rotation: rotation.clone().multiply(new Quaternion().fromArray(item.rotation)).toArray(),
    }))
  }

  function updateGizmo(cycle = false) {
    if (!gizmoPart || !gizmoRaw) return
    if (tool === 'move' && snapAllowed(pointer) && transform && !additional.size) {
      const ownPorts = technic[gizmoRaw.design].filter(port => port.role !== 'gear')
      const points = ownPorts.flatMap(port => {
        const { start, axis } = worldPort(gizmoRaw, port)
        return [start, start.clone().addScaledVector(axis, portLength(port))]
      }).map(scene.project).filter(point => point.visible)
      const snapScene = { pixelDistance: point => Math.min(...points.map(screen => scene.pixelDistance(point, screen))) }
      const axes = scene.gizmo.axis ?? ''
      const acceptPose = pose => {
        const delta = pose.position.map((value, i) => value - gizmoRaw.position[i])
        return samePose(gizmoRaw, { ...pose, position: gizmoRaw.position }) &&
          delta.every((value, i) => axes.includes('XYZ'[i]) || Math.abs(value) < .01) &&
          Math.hypot(...delta) <= 12
      }
      const options = nearbyConnections({ scene: snapScene, assembly: transform, parts: state.parts,
        moving: gizmoRaw, depth: 0, roll: 0, acceptPose }).filter(option => option.fit)
      const previous = options.findIndex(option => option.key === gizmoSnap?.key)
      gizmoSnap = options.length ? options[cycle ? (previous + 1) % options.length : Math.max(0, previous)] : null
    } else gizmoSnap = null
    const pose = gizmoSnap?.fit ? { ...gizmoRaw, ...gizmoSnap.pose } : gizmoRaw
    scene.setGhost(pose, gizmoSnap?.point)
    if (additional.size) scene.previewParts(groupTransforms(state.parts.filter(item => additional.has(item.id)), gizmoPart, pose))
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
    cancelResize()
    mode = next
    additional.clear()
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
  scene.watchView(positionHandles)
  on(el('axleHandles'), 'pointerdown', beginResize)
  on(el('axleHandles'), 'pointermove', previewResize)
  on(el('axleHandles'), 'pointerup', finishResize)
  on(el('axleHandles'), 'pointercancel', cancelResize)
  on(el('name'), 'change', () => {
    if (!el('name').value.trim()) el('name').value = currentDocument().name
    persist()
  })
  on(el('save'), 'click', () => persist(true))
  on(el('export'), 'click', () => download(currentDocument()))
  for (const name of ['select', 'move', 'rotate', 'length']) on(el(`${name}Tool`), 'click', () => setTool(name))
  on(window, 'keyup', event => {
    if ((moving || gizmoPart) && pointer && ['Control', 'Meta'].includes(event.key)) {
      updatePointer({ clientX: pointer.clientX, clientY: pointer.clientY, ctrlKey: event.ctrlKey, metaKey: event.metaKey })
      if (gizmoPart) updateGizmo()
    }
  })
  on(el('snap'), 'click', () => {
    snapEnabled = !snapEnabled
    if (moving && pointer) updatePointer(pointer)
    else render()
  })
  on(el('copy'), 'click', copyPart)
  on(el('paste'), 'click', () => insertCopy(clipboard))
  on(el('duplicate'), 'click', () => insertCopy(clipboardSelection()))
  on(el('remove'), 'click', () => {
    if (!selected || mode !== 'build' || dragActive()) return
    const ids = new Set(selectionIds())
    additional.clear()
    commit({ parts: state.parts.filter(part => !ids.has(part.id)),
      links: state.links.filter(link => !ids.has(link.shaft.part) && !ids.has(link.socket.part)) })
  })
  on(el('color'), 'change', event => {
    if (!selected || mode !== 'build' || dragActive()) return
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
  on(el('applyHinge'), 'click', () => {
    if (!hinge?.ok) return
    const target = nearestDetent(hinge.detents, angle * Math.PI / 180)
    if (Math.abs(target - hinge.roll) < 1e-8) return
    const placed = hingePoses(state.parts, hinge, target)
    commit({ parts: placed, links: transformLinks(placed, [...hinge.moving]) })
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
    if (gizmoPart) {
      const id = gizmoPart.id
      transform = createAssembly(state.parts, state.links.filter(link => link.shaft.part !== id && link.socket.part !== id))
      gizmoRaw = gizmoPart
      scene.setMoving(id, true)
    }
    scene.canvas.focus({ preventScroll: true })
  })
  scene.gizmo.addEventListener('objectChange', () => {
    if (!gizmoPart) return
    gizmoRaw = scene.gizmoPose(gizmoPart)
    updateGizmo()
  })
  scene.gizmo.addEventListener('mouseUp', () => {
    if (!gizmoPart) return
    const part = gizmoPart
    const snap = gizmoSnap
    const pose = snap?.fit ? { ...gizmoRaw, ...snap.pose } : gizmoRaw
    // TransformControls clears its own dragging flag after this event.
    queueMicrotask(() => { if (gizmoPart === part) finishTransform(part, pose, snap) })
  })
  on(scene.canvas, 'pointermove', event => { pointer = event }, true)
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
      if (!gizmoPart && !moving && tool === 'select' && !event.shiftKey && event.pointerType !== 'touch') {
        const hit = scene.pointer(event).hit
        const part = state.parts.find(entry => entry.id === hit)
        if (part) {
          selectClick(hit)
          directDrag = { part, start: event }
        }
      }
      return
    }
    const hit = scene.pointer(event).hit
    const part = state.parts.find(entry => entry.id === hit)
    if (!part) return
    if (hit !== selected) setSelection(hit)
    if (!hinge?.ok && !transmission?.ok) return
    stopAnimation()
    scene.canvas.setPointerCapture(event.pointerId)
    drag = { x: event.clientX, angle, sign: hinge?.sign ?? 1 }
    render()
  })
  on(scene.canvas, 'pointermove', event => {
    if (drag) {
      const min = Number(el('angle').min)
      const max = Number(el('angle').max)
      angle = Math.max(min, Math.min(max, drag.angle + (event.clientX - drag.x) * 2 * drag.sign))
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
    } else if (click) selectClick(scene.pointer(event).hit, event.shiftKey)
  })
  on(scene.canvas, 'pointercancel', () => {
    pointerDown = null
    rightDown = null
    drag = null
    ignoreGizmoClick = false
    cancelGizmo()
    cancelPlacement()
    cancelResize()
  })
  on(window, 'keydown', event => {
    if (event.key === 'Escape' && dragActive()) {
      event.preventDefault()
      cancelGizmo()
      cancelPlacement()
      cancelResize()
      return
    }
    if (event.target.closest?.('input, textarea, select, [contenteditable]') || event.altKey) return
    if (event.ctrlKey || event.metaKey) {
      if ((moving || gizmoPart) && pointer && ['Control', 'Meta'].includes(event.key)) {
        updatePointer({ clientX: pointer.clientX, clientY: pointer.clientY, ctrlKey: event.ctrlKey, metaKey: event.metaKey })
        if (gizmoPart) updateGizmo()
      }
      const actions = {
        KeyZ: () => event.shiftKey ? restore(redo, undo) : restore(undo, redo),
        KeyY: () => restore(redo, undo),
        KeyS: () => persist(true),
        KeyC: copyPart,
        KeyV: () => insertCopy(clipboard),
        KeyD: () => insertCopy(clipboardSelection()),
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
    if (mode !== 'build' || resize) return
    if (gizmoPart) {
      if (event.key === 'Tab' && gizmoSnap) {
        event.preventDefault()
        updateGizmo(true)
      }
      return
    }
    const turn = moving && heldTurns[event.code]
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
      KeyG: () => setTool('move'),
      KeyS: () => setTool('length'),
      KeyF: () => scene.focus(selectionIds()),
      KeyR: () => setTool('rotate'),
      KeyX: () => el('remove').click(),
      Delete: () => el('remove').click(),
      Backspace: () => el('remove').click(),
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
