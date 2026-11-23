import { advanceTutorial, finishTutorial, leaveTutorial, readTutorial } from '../menu/tutorial-state.js?v=onboarding-v1'

const content = {
  ru: {
    quick: 'Быстрый старт', first: 'Первая сборка', mechanics: 'Оживи механизм',
    step: (current, total) => `ШАГ ${current} ИЗ ${total}`,
    skip: 'Закончить обучение', hint: 'Нужна подсказка?', hideHint: 'Скрыть подсказку',
    show: 'Показать инструмент', done: 'Готово! У тебя получилось.',
    quickDone: 'Основы освоены. Твоя пробная сборка сохранена автоматически.',
    firstDone: 'Первая сборка сохранена в «Мои сборки». Теперь можно изучить движение механизмов.',
    mechanicsDone: 'Ты запустил механизм и освоил режим кинематики.',
    continue: 'Продолжить работу', full: 'Пройти первую сборку', mechanicsNext: 'Оживить механизм',
    steps: {
      camera: ['Осмотрись на сцене', 'Зажми правую кнопку мыши и поверни камеру вокруг балки или приблизь колесом.', 'Вращение: правая кнопка мыши. Приближение: колёсико. На сенсорном экране — жест двумя пальцами.', '[data-el="viewport"]'],
      placed: ['Добавь штифт', 'Найди в библиотеке «Штифт с трением» (2780) или длинный штифт (6558), выбери его и поставь на сцену.', 'В поиске библиотеки введи «штифт» или «2780», затем щёлкни в сцене для установки.', '[data-panel="library"]'],
      connected: ['Соедини детали', 'Поднеси штифт к отверстию балки Technic. Шаг засчитается, когда движок создаст соединение.', 'Включи автостыковку (значок магнита внизу) и попробуй подвести штифт к отверстию с другой стороны.', '[data-el="viewport"]'],
      painted: ['Добавь цвет', 'Перейди в режим «Окрашивание» и щёлкни по детали, чтобы изменить её цвет.', 'Нажми «Окрашивание» в верхней панели, выбери новый цвет и щёлкни по балке.', '[data-el="paint"]'],
      saved: ['Сохрани результат', 'Назови сборку, если хочешь, и нажми кнопку «Сохранить» вверху редактора.', 'Кнопка «Сохранить» находится справа в верхней панели. После этого модель останется в «Мои сборки».', '[data-el="save"]'],
      kinematics: ['Переключись на кинематику', 'Для этого примера уже загружен редуктор. Нажми режим «Кинематика» в верхней панели.', 'Выбери кнопку «Кинематика» рядом с режимом сборки.', '[data-el="kinematics"]'],
      gearSelected: ['Выбери шестерню', 'Щёлкни по шестерне редуктора, чтобы показать управление вращением.', 'Попробуй нажать на маленькую жёлтую или большую серую шестерню.', '[data-el="viewport"]'],
      motion: ['Приведи механизм в движение', 'Потяни ползунок угла в инспекторе или нажми «Воспроизвести».', 'В панели деталей найди ползунок вращения. После изменения угла механизм начнёт двигаться.', '[data-el="motion"]'],
    },
  },
  en: {
    quick: 'Quick start', first: 'First build', mechanics: 'Bring it to life',
    step: (current, total) => `STEP ${current} OF ${total}`,
    skip: 'Exit tutorial', hint: 'Need help?', hideHint: 'Hide tip',
    show: 'Show the tool', done: 'Great job! You did it.',
    quickDone: 'You learned the basics. Your practice build was saved automatically.',
    firstDone: 'Your first build is saved under My builds. Time to explore moving mechanisms.',
    mechanicsDone: 'You made the mechanism move and explored kinematics mode.',
    continue: 'Continue building', full: 'Try the first build', mechanicsNext: 'Animate a mechanism',
    steps: {
      camera: ['Explore the scene', 'Hold the right mouse button and orbit around the beam, or zoom with the scroll wheel.', 'Orbit with the right mouse button. Zoom with the wheel. On touch screens, use two fingers.', '[data-el="viewport"]'],
      placed: ['Add a pin', 'Find friction pin 2780 (or long pin 6558) in the library, select it and place it in the scene.', 'Search for 2780 or pin in the library, then click the scene to place it.', '[data-panel="library"]'],
      connected: ['Snap parts together', 'Move the pin to a hole in the Technic beam. This step completes when the engine connects them.', 'Enable automatic snapping in the bottom toolbar and bring the pin near a compatible hole.', '[data-el="viewport"]'],
      painted: ['Add some color', 'Switch to Paint mode and click a part to change its color.', 'Click Paint in the top bar, pick a different color and click the beam.', '[data-el="paint"]'],
      saved: ['Save your result', 'Rename your build if you want, then press Save in the top bar.', 'The Save button is on the right side of the top bar.', '[data-el="save"]'],
      kinematics: ['Enter kinematics mode', 'The example gearbox is ready. Switch to Kinematics in the top bar.', 'Choose Kinematics next to Build mode.', '[data-el="kinematics"]'],
      gearSelected: ['Select a gear', 'Click one of the gearbox gears to show its motion controls.', 'Try the small yellow or large gray gear.', '[data-el="viewport"]'],
      motion: ['Make it move', 'Move the angle slider in the inspector or press Play.', 'Open the inspector and adjust the rotation slider.', '[data-el="motion"]'],
    },
  },
}
const flows = {
  quick: ['camera', 'placed', 'connected'],
  first: ['camera', 'placed', 'connected', 'painted', 'saved'],
  mechanics: ['kinematics', 'gearSelected', 'motion'],
}

export function mountTutorial(root, { projectId, language, signal }) {
  const active = readTutorial().active
  if (!active || active.projectId !== projectId || !flows[active.mode]) return null
  const t = content[language === 'en' ? 'en' : 'ru']
  const flow = flows[active.mode]
  let step = Math.max(0, Math.min(flow.length - 1, active.step))
  let highlighted
  let finished = false
  let failedAttempts = 0

  const card = document.createElement('aside')
  card.className = 'tutorial-coach'
  card.setAttribute('aria-label', t[active.mode])
  const eyebrow = document.createElement('p')
  eyebrow.className = 'tutorial-eyebrow'
  const heading = document.createElement('h2')
  const description = document.createElement('p')
  description.className = 'tutorial-description'
  const hint = document.createElement('p')
  hint.className = 'tutorial-help'
  hint.hidden = true
  const progress = document.createElement('div')
  progress.className = 'tutorial-progress'
  progress.setAttribute('role', 'progressbar')
  const footer = document.createElement('div')
  footer.className = 'tutorial-footer'
  const skip = document.createElement('button')
  skip.type = 'button'
  skip.className = 'tutorial-quiet'
  skip.textContent = t.skip
  const help = document.createElement('button')
  help.type = 'button'
  help.className = 'tutorial-link'
  help.textContent = t.hint
  const showTool = document.createElement('button')
  showTool.type = 'button'
  showTool.className = 'tutorial-link'
  showTool.textContent = t.show
  footer.append(skip, help, showTool)
  card.append(eyebrow, heading, description, progress, hint, footer)
  root.append(card)

  function clearHighlight() {
    highlighted?.classList.remove('tutorial-highlight')
    highlighted = null
  }
  function highlight() {
    clearHighlight()
    const selector = t.steps[flow[step]]?.[3]
    highlighted = selector && root.querySelector(selector)
    if (highlighted?.hidden || highlighted?.closest('[hidden]')) highlighted = null
    highlighted?.classList.add('tutorial-highlight')
  }
  function render() {
    failedAttempts = 0
    hint.hidden = true
    help.textContent = t.hint
    const [title, details] = t.steps[flow[step]]
    eyebrow.textContent = `${t[active.mode]} · ${t.step(step + 1, flow.length)}`
    heading.textContent = title
    description.textContent = details
    progress.setAttribute('aria-valuemin', '0')
    progress.setAttribute('aria-valuemax', String(flow.length))
    progress.setAttribute('aria-valuenow', String(step))
    progress.replaceChildren(...flow.map((_, index) => {
      const line = document.createElement('span')
      line.className = index <= step ? 'tutorial-progress-done' : ''
      return line
    }))
    highlight()
  }
  function launch(mode) {
    root.dispatchEvent(new CustomEvent('bricklab-tutorial-next', { bubbles: true, detail: { mode } }))
  }
  function finish() {
    finished = true
    finishTutorial(projectId)
    clearHighlight()
    eyebrow.textContent = t.done
    heading.textContent = t.done
    description.textContent = t[`${active.mode}Done`]
    progress.setAttribute('aria-valuenow', String(flow.length))
    for (const bar of progress.children) bar.classList.add('tutorial-progress-done')
    hint.hidden = true
    footer.replaceChildren()
    const close = document.createElement('button')
    close.type = 'button'
    close.className = 'tutorial-quiet'
    close.textContent = t.continue
    close.addEventListener('click', () => card.remove(), { signal })
    footer.append(close)
    if (active.mode !== 'mechanics') {
      const next = document.createElement('button')
      next.type = 'button'
      next.className = 'tutorial-next'
      next.textContent = active.mode === 'quick' ? t.full : t.mechanicsNext
      next.addEventListener('click', () => launch(active.mode === 'quick' ? 'first' : 'mechanics'), { signal })
      footer.append(next)
    }
  }
  skip.addEventListener('click', () => {
    leaveTutorial(projectId)
    clearHighlight()
    card.remove()
  }, { signal })
  help.addEventListener('click', () => {
    hint.hidden = !hint.hidden
    hint.textContent = t.steps[flow[step]][2]
    help.textContent = hint.hidden ? t.hint : t.hideHint
  }, { signal })
  showTool.addEventListener('click', () => {
    highlight()
    highlighted?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    if (highlighted?.matches('button, input, select')) highlighted.focus({ preventScroll: true })
    hint.hidden = false
    hint.textContent = t.steps[flow[step]][2]
    help.textContent = t.hideHint
  }, { signal })
  signal.addEventListener('abort', () => { clearHighlight(); card.remove() }, { once: true })
  render()
  return {
    nudge(action) {
      if (finished || signal.aborted || flow[step] !== action) return
      if (++failedAttempts < 2) return
      hint.hidden = false
      hint.textContent = t.steps[flow[step]][2]
      help.textContent = t.hideHint
    },
    handle(action, detail = {}) {
      if (finished || signal.aborted || action !== flow[step]) return
      if (action === 'placed' && (!detail.newPart || !['2780', '6558'].includes(String(detail.design)))) return
      if (action === 'gearSelected' && !detail.rotatable) return
      if (action === 'saved' && !detail.success) return
      if (step === flow.length - 1) finish()
      else {
        step++
        advanceTutorial(projectId, step)
        render()
      }
    },
    get step() { return flow[step] },
  }
}
