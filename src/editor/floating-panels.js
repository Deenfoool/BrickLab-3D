const storageKey = 'bricklab.editor.panels.v1'
const clamp = (value, maximum) => Math.min(maximum, Math.max(0, value))
const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }

function storedPositions() {
  try {
    return JSON.parse(localStorage.getItem(storageKey)) ?? {}
  } catch {
    return {}
  }
}

export function mountFloatingPanels(layer, labels, signal) {
  const positions = {}
  const saved = storedPositions()
  const panels = [...layer.querySelectorAll('[data-panel]')]
  const sync = new ResizeObserver(() => {
    for (const panel of panels) {
      const position = positions[panel.dataset.panel]
      if (!position || panel.hasAttribute('data-dragging')) continue
      const { width, height } = available(panel)
      place(panel, position.x * width, position.y * height)
    }
  })

  function available(panel) {
    return {
      width: Math.max(0, layer.clientWidth - panel.offsetWidth),
      height: Math.max(0, layer.clientHeight - panel.offsetHeight),
    }
  }

  function place(panel, x, y) {
    panel.style.left = `${x}px`
    panel.style.top = `${y}px`
  }

  function move(panel, x, y) {
    const { width, height } = available(panel)
    const left = clamp(x, width)
    const top = clamp(y, height)
    const id = panel.dataset.panel
    positions[id] = {
      x: width ? left / width : positions[id]?.x ?? 0,
      y: height ? top / height : positions[id]?.y ?? 0,
    }
    place(panel, left, top)
  }

  function persist() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(positions))
    } catch {
      // Layout still works in the current editor when storage is unavailable.
    }
  }

  function front(panel) {
    for (const other of panels) other.toggleAttribute('data-front', other === panel)
  }

  const compact = matchMedia('(max-width: 720px)').matches
  for (const panel of panels) {
    const id = panel.dataset.panel
    const title = panel.querySelector('[data-panel-grip]')
    const toggle = panel.querySelector('[data-panel-toggle]')
    const body = panel.querySelector('.editor-panel-body')
    const position = saved[id]
    if (Number.isFinite(position?.x) && Number.isFinite(position?.y)) {
      positions[id] = { x: clamp(position.x, 1), y: clamp(position.y, 1) }
    }
    let drag
    const on = (target, event, handler) => target.addEventListener(event, handler, { signal })

    function expand(open) {
      body.hidden = !open
      toggle.setAttribute('aria-expanded', String(open))
      toggle.setAttribute('aria-label', open ? labels.collapse : labels.expand)
      toggle.title = open ? labels.collapse : labels.expand
      toggle.textContent = open ? '−' : '+'
    }

    expand(!compact)
    on(toggle, 'click', () => expand(body.hidden))
    on(panel, 'pointerdown', () => front(panel))
    on(panel, 'focusin', () => front(panel))
    on(title, 'pointerdown', event => {
      if (!event.isPrimary || event.button !== 0) return
      event.preventDefault()
      title.focus({ preventScroll: true })
      title.setPointerCapture(event.pointerId)
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY,
        left: panel.offsetLeft, top: panel.offsetTop, initial: positions[id] }
      panel.setAttribute('data-dragging', '')
    })
    on(title, 'pointermove', event => {
      if (event.pointerId !== drag?.id) return
      if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 3) return
      drag.moved = true
      move(panel, drag.left + event.clientX - drag.x, drag.top + event.clientY - drag.y)
    })
    on(title, 'pointerup', event => {
      if (event.pointerId !== drag?.id) return
      if (drag.moved) persist()
      drag = undefined
      panel.removeAttribute('data-dragging')
    })
    on(title, 'lostpointercapture', event => {
      if (event.pointerId !== drag?.id) return
      if (drag.moved && drag.initial) positions[id] = drag.initial
      else if (drag.moved) delete positions[id]
      if (drag.moved) {
        panel.style.removeProperty('left')
        panel.style.removeProperty('top')
        if (drag.initial) {
          const { width, height } = available(panel)
          place(panel, drag.initial.x * width, drag.initial.y * height)
        }
      }
      drag = undefined
      panel.removeAttribute('data-dragging')
    })
    on(title, 'keydown', event => {
      const direction = arrows[event.key]
      if (!direction || event.ctrlKey || event.metaKey || event.altKey) return
      event.preventDefault()
      event.stopPropagation()
      const step = event.shiftKey ? 4 : 16
      move(panel, panel.offsetLeft + direction[0] * step, panel.offsetTop + direction[1] * step)
      persist()
    })
    sync.observe(panel)
  }
  sync.observe(layer)
  signal.addEventListener('abort', () => sync.disconnect(), { once: true })
}
