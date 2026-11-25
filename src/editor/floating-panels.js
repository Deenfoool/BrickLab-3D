const storageKey = 'bricklab.editor.panels.v1'
const clamp = (value, maximum) => Math.min(maximum, Math.max(0, value))
const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }

function storedLayouts() {
  try {
    return JSON.parse(localStorage.getItem(storageKey)) ?? {}
  } catch {
    return {}
  }
}

export function mountFloatingPanels(layer, labels, signal) {
  const layouts = {}
  const saved = storedLayouts()
  const panels = [...layer.querySelectorAll('[data-panel]')]
  const sync = new ResizeObserver(() => panels.forEach(syncPanel))

  function available(panel) {
    return {
      width: Math.max(0, layer.clientWidth - panel.offsetWidth),
      height: Math.max(0, layer.clientHeight - panel.offsetHeight),
    }
  }

  function place(panel, x, y) {
    panel.style.left = `${x}px`
    panel.style.top = `${y}px`
    panel.style.bottom = 'auto'
  }

  function size(panel, width, height) {
    panel.toggleAttribute('data-custom-width', Boolean(width))
    panel.toggleAttribute('data-custom-height', Boolean(height))
    if (width) panel.style.setProperty('--editor-panel-width', `${width}px`)
    else panel.style.removeProperty('--editor-panel-width')
    if (height) panel.style.setProperty('--editor-panel-height', `${height}px`)
    else panel.style.removeProperty('--editor-panel-height')
  }

  function syncPanel(panel) {
    if (layer.closest('.editor')?.dataset.workspaceLayout === 'dock') return
    if (!layer.clientWidth || !layer.clientHeight || panel.hasAttribute('data-dragging') ||
        panel.hasAttribute('data-resizing')) return
    const layout = layouts[panel.dataset.panel]
    const { width, height } = available(panel)
    if (layout) place(panel, layout.x * width, layout.y * height)
    panel.toggleAttribute('data-resize-left', panel.offsetLeft > width / 2)
    panel.toggleAttribute('data-resize-top', panel.offsetTop > height / 2)
  }

  function move(panel, x, y, dimensions) {
    const { width, height } = available(panel)
    const left = clamp(x, width)
    const top = clamp(y, height)
    const id = panel.dataset.panel
    layouts[id] = {
      ...layouts[id],
      ...dimensions,
      x: width ? left / width : layouts[id]?.x ?? Number(panel.hasAttribute('data-resize-left')),
      y: height ? top / height : layouts[id]?.y ?? Number(panel.hasAttribute('data-resize-top')),
    }
    place(panel, left, top)
  }

  function geometry(panel) {
    return {
      left: panel.offsetLeft, top: panel.offsetTop, width: panel.offsetWidth, height: panel.offsetHeight,
      saved: layouts[panel.dataset.panel],
      fromLeft: panel.hasAttribute('data-resize-left'), fromTop: panel.hasAttribute('data-resize-top'),
    }
  }

  function resize(panel, start, dx, dy) {
    const { left, top, width, height, fromLeft, fromTop, saved } = start
    const right = left + width
    const bottom = top + height
    const maxWidth = fromLeft ? right : layer.clientWidth - left
    const maxHeight = fromTop ? bottom : layer.clientHeight - top
    const minWidth = panel.dataset.panel === 'instruction' ? 230 : 176
    const nextWidth = dx ? Math.min(maxWidth, Math.max(Math.min(minWidth, width), width + (fromLeft ? -dx : dx))) : saved?.width
    const nextHeight = dy ? Math.min(maxHeight, Math.max(Math.min(112, height), height + (fromTop ? -dy : dy))) : saved?.height
    size(panel, nextWidth, nextHeight)
    move(panel, fromLeft ? right - panel.offsetWidth : left, fromTop ? bottom - panel.offsetHeight : top,
      { width: nextWidth, height: nextHeight })
  }

  function persist(id) {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ ...storedLayouts(), [id]: layouts[id] }))
    } catch {
      // Layout still works in the current editor when storage is unavailable.
    }
  }

  function front(panel) {
    for (const other of panels) other.toggleAttribute('data-front', other === panel)
  }

  const compact = matchMedia('(max-width: 720px)').matches
  const on = (target, event, handler) => target.addEventListener(event, handler, { signal })
  for (const panel of panels) {
    const id = panel.dataset.panel
    const title = panel.querySelector('[data-panel-grip]')
    const toggle = panel.querySelector('[data-panel-toggle]')
    const body = panel.querySelector('.editor-panel-body')
    const grip = panel.ownerDocument.createElement('button')
    grip.type = 'button'
    grip.className = 'editor-panel-resizer'
    grip.title = labels.resizePanel
    grip.setAttribute('aria-label', labels.resizePanel)
    panel.append(grip)

    const layout = saved[id]
    if (Number.isFinite(layout?.x) && Number.isFinite(layout?.y)) {
      layouts[id] = { x: clamp(layout.x, 1), y: clamp(layout.y, 1) }
      if (Number.isFinite(layout.width) && layout.width > 0) layouts[id].width = layout.width
      if (Number.isFinite(layout.height) && layout.height > 0) layouts[id].height = layout.height
      size(panel, layouts[id].width, layouts[id].height)
    }

    function expand(open) {
      body.hidden = grip.hidden = !open
      toggle.setAttribute('aria-expanded', String(open))
      toggle.setAttribute('aria-label', open ? labels.collapse : labels.expand)
      toggle.title = open ? labels.collapse : labels.expand
      toggle.textContent = open ? '−' : '+'
      syncPanel(panel)
    }

    expand(!compact)
    on(toggle, 'click', () => expand(body.hidden))
    on(panel, 'pointerdown', () => front(panel))
    on(panel, 'focusin', () => front(panel))
    bindGrip(title, 'data-dragging', (start, dx, dy) => move(panel, start.left + dx, start.top + dy))
    bindGrip(grip, 'data-resizing', (start, dx, dy) => resize(panel, start, dx, dy))
    sync.observe(panel)

    function bindGrip(handle, active, update) {
      let drag
      on(handle, 'pointerdown', event => {
        if (layer.closest('.editor')?.dataset.workspaceLayout === 'dock') return
        if (!event.isPrimary || event.button !== 0 || drag) return
        event.preventDefault()
        handle.focus({ preventScroll: true })
        handle.setPointerCapture(event.pointerId)
        drag = {
          id: event.pointerId, x: event.clientX, y: event.clientY, start: geometry(panel), initial: layouts[id],
        }
        panel.setAttribute(active, '')
      })
      on(handle, 'pointermove', event => {
        if (event.pointerId !== drag?.id) return
        const dx = event.clientX - drag.x
        const dy = event.clientY - drag.y
        if (!drag.moved && Math.hypot(dx, dy) < 3) return
        drag.moved = true
        update(drag.start, dx, dy)
      })
      function end(event, canceled) {
        if (event.pointerId !== drag?.id) return
        if (drag.moved && canceled) {
          if (drag.initial) layouts[id] = drag.initial
          else delete layouts[id]
          size(panel, drag.initial?.width, drag.initial?.height)
          for (const property of ['left', 'top', 'bottom']) panel.style.removeProperty(property)
        } else if (drag.moved) {
          persist(id)
        }
        drag = undefined
        panel.removeAttribute(active)
        syncPanel(panel)
      }
      on(handle, 'pointerup', event => end(event, false))
      on(handle, 'pointercancel', event => end(event, true))
      on(handle, 'lostpointercapture', event => end(event, true))
      on(handle, 'keydown', event => {
        if (layer.closest('.editor')?.dataset.workspaceLayout === 'dock') return
        const direction = arrows[event.key]
        if (!direction || event.ctrlKey || event.metaKey || event.altKey) return
        event.preventDefault()
        event.stopPropagation()
        if (drag) return
        const step = event.shiftKey ? 4 : 16
        update(geometry(panel), direction[0] * step, direction[1] * step)
        syncPanel(panel)
        persist(id)
      })
    }
  }
  sync.observe(layer)
  signal.addEventListener('abort', () => sync.disconnect(), { once: true })
}
