const copy = {
  ru: {
    title: 'Подготовка BrickLab 3D', download: 'Загружаем карту', prepare: 'Подготавливаем карту',
    ready: 'Готово', unavailable: 'Не удалось загрузить карту', retry: 'Повторить', skip: 'Войти в BrickLab',
    editor: 'Загружаем 3D-сцену', guided: 'Готовим сборку по инструкции', inventory: 'Детали набора загружены',
    scene: '3D-сцена готова', instruction: 'Страница инструкции готова', back: 'К сборкам', sets: 'К наборам',
    tips: ['Удерживай ПКМ, чтобы вращать камеру.', 'Shift + ПКМ перемещает камеру.',
      'G перемещает выбранную деталь, R вращает её.', 'В режиме «Кинематика» можно проверить работу механизма.'],
  },
  en: {
    title: 'Starting BrickLab 3D', download: 'Downloading the map', prepare: 'Preparing the map',
    ready: 'Ready', unavailable: 'Could not load the map', retry: 'Retry', skip: 'Enter BrickLab',
    editor: 'Loading the 3D scene', guided: 'Preparing your guided build', inventory: 'Set inventory is ready',
    scene: '3D scene is ready', instruction: 'Instruction page is ready', back: 'Back to builds', sets: 'Back to sets',
    tips: ['Hold the right mouse button to orbit the camera.', 'Shift + right mouse button pans the camera.',
      'Press G to move a selected part or R to rotate it.', 'Use Kinematics mode to try out a mechanism.'],
  },
}

const variants = [
  { id: 'ford', title: 'Ford GT', tag: '42154', action: 'explode' },
  { id: 'buggy', title: 'Dune Buggy', tag: '8845', action: 'assemble' },
  { id: 'wrangler', title: 'Jeep Wrangler', tag: '42122', action: 'explode' },
  { id: 'ford', title: 'Ford GT', tag: '42154', action: 'assemble' },
  { id: 'buggy', title: 'Dune Buggy', tag: '8845', action: 'explode' },
  { id: 'wrangler', title: 'Jeep Wrangler', tag: '42122', action: 'assemble' },
]
const variantKey = 'bricklab.intro.variant'
const revealDuration = 360
const firstIntro = 2250
const repeatIntro = 1050
let nextIndex = Math.floor(Math.random() * variants.length)
try {
  const saved = sessionStorage.getItem(variantKey)
  if (saved !== null && variants[Number(saved)]) nextIndex = Number(saved)
} catch {
  // The sequence still advances while this document is open.
}
function nextVariant() {
  const variant = variants[nextIndex]
  nextIndex = (nextIndex + 1) % variants.length
  try { sessionStorage.setItem(variantKey, String(nextIndex)) } catch { /* storage is optional */ }
  return variant
}

function wait(ms, signal) {
  if (ms <= 0 || signal.aborted) return Promise.resolve()
  return new Promise(resolve => {
    function done() {
      clearTimeout(timer)
      signal.removeEventListener('abort', done)
      resolve()
    }
    const timer = setTimeout(done, ms)
    signal.addEventListener('abort', done, { once: true })
  })
}

function loadingScreen(root, language, intro, onClose) {
  const text = copy[language]
  const field = name => root.querySelector(`[data-startup="${name}"]`)
  const progress = field('progress')
  const status = field('status')
  const amount = field('amount')
  const tip = field('tip')
  const lifetime = new AbortController()
  const { signal } = lifetime
  const motion = matchMedia('(prefers-reduced-motion: reduce)')
  const percent = new Intl.NumberFormat(language, { style: 'percent' })
  const started = performance.now()
  let finishRequest
  let visual
  let tipIndex = 0
  root.hidden = false
  tip.textContent = text.tips[tipIndex]
  const stage = import('./startup-stage.js?v=ldraw-brand').then(async ({ mountStartupStage }) => {
    const view = await mountStartupStage(field('stage'), { signal, motion, intro, started })
    if (!signal.aborted) {
      if (view) field('stage').removeAttribute('aria-hidden')
      else field('brand').hidden = false
    }
    return view
  }).catch(error => {
    if (!signal.aborted) {
      field('brand').hidden = false
      console.warn('Startup bricks unavailable', error)
    }
    return null
  })

  const tipTimer = setInterval(() => {
    if (!motion.matches) tip.textContent = text.tips[++tipIndex % text.tips.length]
  }, 6200)

  wait(intro, signal).then(async () => {
    if (signal.aborted || finishRequest || motion.matches) return
    visual = new AbortController()
    const visualSignal = visual.signal
    try {
      const view = await stage
      if (!view || visualSignal.aborted) return
      const { createStartupCar } = await import('./startup-car.js?v=ldraw-brand')
      if (visualSignal.aborted) return
      const variant = nextVariant()
      const car = await createStartupCar(variant, visualSignal)
      if (!car || visualSignal.aborted || motion.matches) {
        car?.dispose()
        return
      }
      view.setVehicle(car)
      root.dataset.vehicle = variant.action
      field('modelName').textContent = variant.title
      field('modelTag').textContent = variant.tag
      field('model').hidden = false
    } catch (error) {
      if (!visualSignal.aborted) console.warn('Startup vehicle unavailable', error)
    }
  })

  function display(phase, description, fraction) {
    root.dataset.phase = phase
    if (status.textContent !== description) status.textContent = description
    if (fraction === undefined) progress.removeAttribute('value')
    else progress.value = fraction
    amount.textContent = fraction === undefined ? '' : percent.format(fraction)
  }

  function close() {
    if (signal.aborted) return
    visual?.abort()
    lifetime.abort()
    clearInterval(tipTimer)
    root.hidden = true
    onClose?.()
  }

  function finish(immediate = false) {
    return finishRequest ??= (async () => {
      if (!root.dataset.vehicle) visual?.abort()
      if (!immediate && !motion.matches) await wait(intro - (performance.now() - started), signal)
      if (signal.aborted) return
      if (!motion.matches) {
        root.dataset.leaving = ''
        await wait(revealDuration, signal)
      }
      close()
    })()
  }

  return { field, signal, display, finish, close }
}

export function startStartup(root, language, background, renderDestination) {
  const text = copy[language]
  let restoreFocus = false
  const screen = loadingScreen(root, language, firstIntro, () => {
    for (const node of background) node.inert = false
    if (restoreFocus) background.find(node => !node.hidden)?.querySelector('a, button')?.focus()
  })
  const { signal, field, display } = screen
  const retry = field('retry')
  const skip = field('skip')
  root.setAttribute('aria-label', text.title)
  field('progress').setAttribute('aria-label', text.download)
  retry.textContent = text.retry
  skip.textContent = text.skip
  skip.hidden = false
  for (const node of background) node.inert = true
  let skipping = false
  const destination = Promise.resolve(renderDestination())
  async function reveal(immediate = false) {
    await destination
    if (signal.aborted) return
    display('ready', text.ready, 1)
    await screen.finish(immediate)
  }
  async function preload() {
    retry.hidden = true
    display('download', text.download)
    try {
      const { loadSketchbookTrack } = await import('../editor/sketchbook-track.js?v=ford-startup')
      await loadSketchbookTrack({ signal, onProgress({ stage, loaded, total }) {
        if (!signal.aborted && !skipping) display(stage, text[stage], stage === 'ready' ? 1 : total ? loaded / total : undefined)
      } })
      if (!skipping) await reveal()
    } catch (error) {
      if (signal.aborted || skipping) return
      console.warn('Sketchbook preload failed', error)
      display('unavailable', text.unavailable)
      retry.hidden = false
    }
  }
  retry.addEventListener('click', preload, { signal })
  skip.addEventListener('click', () => {
    restoreFocus = skipping = true
    skip.disabled = true
    reveal(true)
  }, { signal })
  preload()
}

export function showEditorLoading(root, editor, { language, set, signal }) {
  const text = copy[language]
  const screen = loadingScreen(root, language, repeatIntro, () => {
    root.remove()
    editor.inert = false
    signal.removeEventListener('abort', screen.close)
  })
  screen.field('progress').setAttribute('aria-label', set ? text.guided : text.editor)
  root.setAttribute('aria-label', set ? text.guided : text.editor)
  const back = screen.field('back')
  back.href = set ? '#sets' : '#projects'
  back.textContent = set ? text.sets : text.back
  back.hidden = false
  if (set) {
    const context = screen.field('context')
    context.textContent = `${set.number} · ${set.name}`
    context.hidden = false
  }
  screen.display('prepare', set ? text.guided : text.editor, set ? 0 : undefined)
  editor.inert = true
  editor.before(root)
  const stages = new Set()
  signal.addEventListener('abort', screen.close, { once: true })
  return {
    report(stage, ready) {
      if (!set || screen.signal.aborted || !['scene', 'inventory', 'instruction'].includes(stage) || stages.has(stage)) return
      stages.add(stage)
      screen.display('prepare', ready ? text[stage] : text.guided, stages.size / 3)
    },
    finish(error = false) {
      if (!error) screen.display('ready', text.ready, 1)
      return screen.finish(error)
    },
  }
}

export function revealMenu(menu) {
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches)
    menu.animate?.([{ opacity: .35 }, { opacity: 1 }], { duration: revealDuration, easing: 'ease-out' })
}
