const text = {
  ru: {
    title: 'Физика сборки', play: 'Запустить', stop: 'Пауза', resume: 'Продолжить', reset: 'Сбросить',
    picking: 'Выбрать основание', pinCount: count => 'Закреплено деталей: ' + count,
    pinHelp: 'Щёлкни по детали, чтобы закрепить или освободить её жёсткую группу.',
    pushHelp: 'Щелчок по детали толкает её жёсткую группу.',
    load: 'Запускаем физический движок…',
    fail: 'Не удалось запустить физику сборки. Можно повторить запуск.',
    stats: sim => 'Тел: ' + sim.bodies + ' · Связей: ' + sim.constraints +
      (sim.unsupported ? ' · Без физической связи: ' + sim.unsupported : ''),
  },
  en: {
    title: 'Assembly physics', play: 'Run', stop: 'Pause', resume: 'Resume', reset: 'Reset',
    picking: 'Select anchors', pinCount: count => 'Anchored parts: ' + count,
    pinHelp: 'Click a part to anchor or release its rigid group.',
    pushHelp: 'Click a part to push its rigid group.',
    load: 'Starting the physics engine…',
    fail: 'Could not start assembly physics. Try starting the simulation again.',
    stats: sim => 'Bodies: ' + sim.bodies + ' · Constraints: ' + sim.constraints +
      (sim.unsupported ? ' · Unsupported constraints: ' + sim.unsupported : ''),
  },
}

export const physicsTitle = language => text[language].title

export function mountPhysicsPanel(root, { language, scene, models, read, signal }) {
  const t = text[language]
  root.setAttribute('aria-label', t.title)
  root.innerHTML = `
    <header>${t.title}</header>
    <div data-drive="setup">
      <div class="drive-actions">
        <button type="button" class="editor-primary" data-physics="play"></button>
        <button type="button" data-physics="reset">${t.reset}</button>
      </div>
      <button type="button" data-physics="pin">${t.picking}</button>
      <p data-physics="status" role="status"></p>
      <p data-physics="help"></p>
    </div>`
  const el = name => root.querySelector('[data-physics="' + name + '"]')
  const on = (node, event, listener) => node.addEventListener(event, listener, { signal })
  const pinned = new Set()
  let visible = false
  let picking = false
  let simulation
  let running = false
  let request
  let frame
  let last
  let failure = false

  function update() {
    el('play').disabled = Boolean(request) || !read().parts.length
    el('play').textContent = running ? t.stop : simulation ? t.resume : t.play
    el('reset').disabled = !simulation && !request && !pinned.size
    el('pin').disabled = Boolean(simulation || request)
    el('pin').setAttribute('aria-pressed', String(picking))
    el('status').textContent = request ? t.load : failure ? t.fail :
      simulation ? t.stats(simulation) : t.pinCount(pinned.size)
    el('help').textContent = picking ? t.pinHelp : simulation ? t.pushHelp : ''
  }

  function pause() {
    running = false
    if (frame !== undefined) cancelAnimationFrame(frame)
    frame = last = undefined
  }

  function reset() {
    request = undefined
    pause()
    simulation?.dispose()
    simulation = undefined
    failure = picking = false
    scene.highlight([])
    scene.setParts(read().parts)
    if (visible) {
      scene.highlight([...pinned], 0x65b9ff)
      update()
    }
  }

  function tick(time) {
    if (!running) return
    scene.previewParts(simulation.advance(last === undefined ? 0 : (time - last) / 1000))
    last = time
    frame = requestAnimationFrame(tick)
  }

  async function play() {
    if (running) {
      pause()
      update()
      return
    }
    if (!simulation) {
      const pending = request = {}
      failure = picking = false
      update()
      try {
        const [{ loadRapier }, { createPhysicalAssembly }, { assemblyJoints }] = await Promise.all([
          import('../mechanics/physics-world.js'), import('../mechanics/physical-assembly.js'),
          import('./model.js?v=belt-drive'),
        ])
        const rapier = await loadRapier()
        if (request !== pending) return
        const { parts, assembly } = read()
        simulation = createPhysicalAssembly(rapier, parts, assemblyJoints(parts, assembly), models, { pinned })
        scene.highlight([])
        scene.select(undefined)
      } catch (error) {
        if (request !== pending) return
        failure = true
        console.error(error)
      } finally {
        if (request === pending) request = undefined
      }
    }
    if (!visible) return
    if (simulation) {
      running = true
      frame = requestAnimationFrame(tick)
    }
    update()
  }

  on(el('play'), 'click', play)
  on(el('reset'), 'click', () => {
    if (!simulation && !request) pinned.clear()
    reset()
  })
  on(el('pin'), 'click', () => { picking = !picking; update() })
  on(scene.canvas, 'click', event => {
    if (!visible || event.button !== 0) return
    const { hit, ray } = scene.pointer(event)
    if (!hit) return
    if (picking) {
      if (pinned.has(hit)) pinned.delete(hit)
      else pinned.add(hit)
      scene.highlight([...pinned], 0x65b9ff)
      update()
    } else if (running) {
      const direction = ray.direction.clone().setY(.12).normalize()
      simulation.push(hit, direction)
    }
  })
  signal.addEventListener('abort', () => { visible = false; reset() }, { once: true })

  return {
    setActive(enabled) {
      visible = enabled
      root.hidden = !enabled
      if (enabled) {
        const available = new Set(read().parts.map(part => part.id))
        for (const id of pinned) if (!available.has(id)) pinned.delete(id)
        scene.highlight([...pinned], 0x65b9ff)
        update()
      } else reset()
    },
  }
}
