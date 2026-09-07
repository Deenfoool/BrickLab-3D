const DEMO_BACKUP_KEY = 'bricklab.demo.backup.v1'
const PROJECT_KEY = 'bricklab.project.v2'
const SCENARIO_KEY = 'bricklab.test.scenario.v1'

const SCENARIOS = {
  'hill-climb': {
    id: 'hill-climb',
    short: 'HILL',
    title: 'Hill Climb 22°',
    statusTitle: 'HILL CLIMB',
    bestKey: 'bricklab.test.hill-climb.best.v1',
    bestKind: 'time',
  },
  'torque-pull': {
    id: 'torque-pull',
    short: 'PULL',
    title: 'Pull / Torque Bench',
    statusTitle: 'PULL / TORQUE',
    bestKey: 'bricklab.test.torque-pull.best.v1',
    bestKind: 'force',
  },
}

function readScenarioId() {
  const saved = localStorage.getItem(SCENARIO_KEY)
  return SCENARIOS[saved] ? saved : 'hill-climb'
}

function isTypingTarget(target) {
  return target instanceof HTMLElement && (/INPUT|TEXTAREA|SELECT/.test(target.tagName) || target.isContentEditable)
}

// Scale is intentionally out of the editor for now. Shift+S remains connector snap.
window.addEventListener('keydown', event => {
  if (event.code !== 'KeyS' || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return
  if (isTypingTarget(event.target)) return
  event.preventDefault()
  event.stopImmediatePropagation()
}, true)

function installTestLab() {
  const buildButton = document.querySelector('.mode[data-mode="build"]')
  const simulateButton = document.querySelector('.mode[data-mode="simulate"]')
  const testButton = document.querySelector('.mode[data-mode="test"]')
  const modes = document.querySelector('.modes')
  const status = document.getElementById('statusText')
  const topActions = document.querySelector('.top-actions')
  const shortcutsButton = document.getElementById('shortcutsBtn')
  if (!buildButton || !simulateButton || !testButton || !modes || !status || !topActions) {
    requestAnimationFrame(installTestLab)
    return
  }

  document.getElementById('scaleTool')?.remove()
  document.querySelectorAll('.shortcut-row').forEach(row => {
    if (row.textContent?.includes('Scale (reserved)')) row.remove()
  })

  let selectedScenarioId = readScenarioId()
  let runStartedAt = 0
  let runPeakForce = 0
  let finished = false
  let timerFrame = 0

  const scenario = () => SCENARIOS[selectedScenarioId]

  const readProject = () => {
    try {
      return JSON.parse(localStorage.getItem(PROJECT_KEY) || 'null')
    } catch {
      return null
    }
  }

  const readBest = config => {
    const value = Number(localStorage.getItem(config.bestKey))
    return Number.isFinite(value) && value > 0 ? value : null
  }

  const saveResult = (config, value) => {
    if (!Number.isFinite(value) || value <= 0) return readBest(config)
    const previous = readBest(config)
    const better = previous == null || (config.bestKind === 'time' ? value < previous : value > previous)
    if (better) localStorage.setItem(config.bestKey, String(value))
    return readBest(config) ?? value
  }

  const formatTime = seconds => `${seconds.toFixed(2)}s`
  const formatForce = force => `${force.toFixed(1)} F`
  const formatBest = config => {
    const value = readBest(config)
    if (value == null) return '—'
    return config.bestKind === 'time' ? formatTime(value) : formatForce(value)
  }

  const installDemoButton = () => {
    if (document.getElementById('demoProjectBtn')) return
    const current = readProject()
    const backup = localStorage.getItem(DEMO_BACKUP_KEY)
    const showingDemo = current?.name === 'Starter Hill Climber' && backup
    const button = document.createElement('button')
    button.id = 'demoProjectBtn'
    button.className = 'ghost'
    button.title = showingDemo ? 'Restore build from before demo' : 'Load Starter Hill Climber demo'
    button.innerHTML = showingDemo
      ? '<i data-lucide="history"></i><span>Restore</span>'
      : '<i data-lucide="car-front"></i><span>Demo</span>'

    button.onclick = async () => {
      if (showingDemo) {
        localStorage.setItem(PROJECT_KEY, backup)
        localStorage.removeItem(DEMO_BACKUP_KEY)
        location.reload()
        return
      }

      const existing = readProject()
      if (existing?.parts?.length) localStorage.setItem(DEMO_BACKUP_KEY, JSON.stringify(existing))
      try {
        const response = await fetch('./examples/hill-climber.bricklab', { cache: 'no-store' })
        if (!response.ok) throw new Error(`Demo HTTP ${response.status}`)
        const demo = await response.json()
        localStorage.setItem(PROJECT_KEY, JSON.stringify(demo))
        localStorage.setItem(SCENARIO_KEY, 'hill-climb')
        location.reload()
      } catch (error) {
        console.error('Could not load BrickLab demo', error)
      }
    }

    topActions.insertBefore(button, shortcutsButton || null)
  }

  const syncScenarioSelector = () => {
    document.querySelectorAll('[data-test-scenario]').forEach(button => {
      button.classList.toggle('active', button.dataset.testScenario === selectedScenarioId)
    })
  }

  const installScenarioSelector = () => {
    if (document.getElementById('testScenarioSelector')) return
    const selector = document.createElement('div')
    selector.id = 'testScenarioSelector'
    selector.className = 'test-scenario-selector'
    selector.setAttribute('aria-label', 'TEST scenario')
    selector.innerHTML = Object.values(SCENARIOS).map(item => `
      <button type="button" data-test-scenario="${item.id}" title="${item.title}">${item.short}</button>
    `).join('')
    testButton.insertAdjacentElement('afterend', selector)

    selector.querySelectorAll('[data-test-scenario]').forEach(button => {
      button.onclick = event => {
        event.stopPropagation()
        const next = button.dataset.testScenario
        if (!SCENARIOS[next] || next === selectedScenarioId) return
        selectedScenarioId = next
        localStorage.setItem(SCENARIO_KEY, next)
        syncScenarioSelector()
        if (document.body.dataset.bricklabTest) testButton.click()
      }
    })
  }

  installDemoButton()
  installScenarioSelector()
  syncScenarioSelector()
  window.lucide?.createIcons?.({ attrs: { 'stroke-width': 1.8, 'aria-hidden': 'true' } })

  const markTestUi = () => {
    document.querySelectorAll('.mode').forEach(button => button.classList.remove('active'))
    testButton.classList.add('active')
    document.body.dataset.bricklabTest = selectedScenarioId
    syncScenarioSelector()
  }

  const clearTestUi = () => {
    delete document.body.dataset.bricklabTest
    cancelAnimationFrame(timerFrame)
  }

  const ensureRunUi = () => {
    const testPanel = document.querySelector('.telemetry-test')
    if (!testPanel) return null
    const config = scenario()
    let meta = testPanel.querySelector('.test-run-meta')
    if (!meta) {
      meta = document.createElement('div')
      meta.className = 'test-run-meta'
      testPanel.append(meta)
    }

    if (meta.dataset.scenario === config.id) return testPanel
    meta.dataset.scenario = config.id
    const label = config.bestKind === 'time' ? 'TIME' : 'LOAD'
    const initial = config.bestKind === 'time' ? '0.00s' : '0.0 F'
    meta.innerHTML = `
      <span>${label} <b data-test-primary>${initial}</b></span>
      <span>BEST <b data-test-best>${formatBest(config)}</b></span>
      <button type="button" data-test-retry><i data-lucide="rotate-ccw"></i><span>Retry</span></button>
    `
    meta.querySelector('[data-test-retry]').onclick = () => testButton.click()
    window.lucide?.createIcons?.({ attrs: { 'stroke-width': 1.8, 'aria-hidden': 'true' } })
    return testPanel
  }

  const finishRun = (panel, config, statusValue, elapsed) => {
    if (finished || !['PASSED', 'STALLED'].includes(statusValue)) return
    finished = true

    let result = elapsed
    if (config.bestKind === 'force') {
      const currentForce = Number(panel?.dataset.testForce || 0)
      runPeakForce = Math.max(runPeakForce, Number.isFinite(currentForce) ? currentForce : 0)
      result = runPeakForce
    }

    const best = saveResult(config, result)
    const bestEl = panel?.querySelector('[data-test-best]')
    if (bestEl && best != null) bestEl.textContent = config.bestKind === 'time' ? formatTime(best) : formatForce(best)
    panel?.classList.toggle('run-complete', statusValue === 'PASSED')
    panel?.classList.toggle('run-failed', statusValue === 'STALLED')
  }

  const updateRun = () => {
    if (document.body.dataset.bricklabTest !== selectedScenarioId) return
    const panel = ensureRunUi()
    const config = scenario()
    const primary = panel?.querySelector('[data-test-primary]')
    const statusValue = panel?.dataset.testStatus || 'RUNNING'
    const elapsed = runStartedAt ? (performance.now() - runStartedAt) / 1000 : 0

    if (config.bestKind === 'time') {
      if (primary) primary.textContent = formatTime(elapsed)
    } else {
      const currentForce = Number(panel?.dataset.testForce || 0)
      if (Number.isFinite(currentForce)) runPeakForce = Math.max(runPeakForce, currentForce)
      if (primary) primary.textContent = formatForce(runPeakForce)
    }

    finishRun(panel, config, statusValue, elapsed)
    if (!finished) timerFrame = requestAnimationFrame(updateRun)
  }

  const startRun = () => {
    cancelAnimationFrame(timerFrame)
    runStartedAt = performance.now()
    runPeakForce = 0
    finished = false
    timerFrame = requestAnimationFrame(updateRun)
  }

  const originalBuild = buildButton.onclick
  const originalSimulate = simulateButton.onclick

  buildButton.onclick = event => {
    clearTestUi()
    originalBuild?.call(buildButton, event)
  }

  simulateButton.onclick = event => {
    const leavingTest = Boolean(document.body.dataset.bricklabTest)
    if (leavingTest) originalBuild?.call(buildButton, event)
    clearTestUi()
    originalSimulate?.call(simulateButton, event)
  }

  testButton.onclick = () => {
    if (!buildButton.classList.contains('active')) originalBuild?.call(buildButton, new Event('click'))
    window.__bricklabNextScenario = selectedScenarioId
    originalSimulate?.call(simulateButton, new Event('click'))
    markTestUi()
    startRun()
  }

  const observer = new MutationObserver(() => {
    if (!document.body.dataset.bricklabTest) return
    const config = scenario()

    if (status.textContent.startsWith('BUILD')) {
      clearTestUi()
      return
    }

    if (status.textContent.startsWith('SIMULATE')) {
      status.textContent = status.textContent.replace(/^SIMULATE/, `TEST · ${config.statusTitle}`)
    }
    markTestUi()
  })
  observer.observe(status, { childList: true, characterData: true, subtree: true })
}

installTestLab()
