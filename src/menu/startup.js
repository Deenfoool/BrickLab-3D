const copy = {
  ru: {
    title: 'Подготовка BrickLab 3D', download: 'Загружаем карту', prepare: 'Подготавливаем карту',
    ready: 'Карта готова', unavailable: 'Не удалось загрузить карту', retry: 'Повторить', skip: 'Войти в BrickLab',
    tips: ['Удерживай ПКМ, чтобы вращать камеру.', 'Shift + ПКМ перемещает камеру.',
      'G перемещает выбранную деталь, R вращает её.', 'В режиме «Кинематика» можно проверить работу механизма.'],
  },
  en: {
    title: 'Starting BrickLab 3D', download: 'Downloading the map', prepare: 'Preparing the map',
    ready: 'Map ready', unavailable: 'Could not load the map', retry: 'Retry', skip: 'Enter BrickLab',
    tips: ['Hold the right mouse button to orbit the camera.', 'Shift + right mouse button pans the camera.',
      'Press G to move a selected part or R to rotate it.', 'Use Kinematics mode to try out a mechanism.'],
  },
}

export function startStartup(root, language, background) {
  const text = copy[language]
  const field = name => root.querySelector(`[data-startup="${name}"]`)
  const progress = field('progress')
  const status = field('status')
  const amount = field('amount')
  const tip = field('tip')
  const retry = field('retry')
  const skip = field('skip')
  const lifetime = new AbortController()
  const { signal } = lifetime
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
  const percent = new Intl.NumberFormat(language, { style: 'percent' })
  const tips = text.tips
  let tipIndex = 0
  let stage

  root.setAttribute('aria-label', text.title)
  progress.setAttribute('aria-label', text.download)
  tip.textContent = tips[tipIndex]
  retry.textContent = text.retry
  skip.textContent = text.skip
  skip.hidden = false
  for (const node of background) node.inert = true

  const timer = setInterval(() => {
    if (!reducedMotion.matches) tip.textContent = tips[++tipIndex % tips.length]
  }, 6200)
  function finish(restoreFocus = false) {
    if (signal.aborted) return
    lifetime.abort()
    clearInterval(timer)
    root.hidden = true
    for (const node of background) node.inert = false
    if (restoreFocus) background.find(node => !node.hidden)?.querySelector('a, button')?.focus()
  }

  function display(next, fraction) {
    if (stage !== next) {
      stage = next
      status.textContent = text[next]
      root.dataset.phase = next
    }
    if (fraction === undefined) progress.removeAttribute('value')
    else progress.value = fraction
    amount.textContent = fraction === undefined ? '' : percent.format(fraction)
  }

  async function preload() {
    retry.hidden = true
    progress.hidden = false
    display('download')
    try {
      const { loadSketchbookTrack } = await import('../editor/sketchbook-track.js?v=ford-startup')
      await loadSketchbookTrack({ signal, onProgress({ stage, loaded, total }) {
        if (!signal.aborted) display(stage, stage === 'ready' ? 1 : total ? loaded / total : undefined)
      } })
      finish()
    } catch (error) {
      if (signal.aborted) return
      console.warn('Sketchbook preload failed', error)
      display('unavailable')
      progress.hidden = false
      retry.hidden = false
    }
  }

  retry.addEventListener('click', preload, { signal })
  skip.addEventListener('click', () => finish(true), { signal })
  preload()
  import('./startup-car.js?v=ford-startup').then(async ({ mountStartupCar }) => {
    if (!signal.aborted && await mountStartupCar(field('stage'), { signal, reducedMotion })) field('model').hidden = false
  }).catch(error => {
    if (!signal.aborted) console.warn('Ford GT animation unavailable', error)
  })
}
