const HILL_BEST_KEY = 'bricklab.test.hill-climb.best.v1'
const PULL_BEST_KEY = 'bricklab.test.torque-pull.best.v1'
const TEST_SCENARIO_KEY = 'bricklab.test.scenario.v1'
const DEMO_BACKUP_KEY = 'bricklab.demo.backup.v1'
const PROJECT_KEY = 'bricklab.project.v2'

const SCENARIOS = {
  'hill-climb': { short: 'HILL', label: 'Hill Climb 22°', status: 'TEST · HILL CLIMB' },
  'torque-pull': { short: 'PULL', label: 'Pull / Torque Bench', status: 'TEST · TORQUE PULL' },
}

function readScenario() {
  const saved = localStorage.getItem(TEST_SCENARIO_KEY)
  return SCENARIOS[saved] ? saved : 'hill-climb'
}

let selectedScenario = readScenario()

// Scale is intentionally out of the editor for now. Capture only the plain S key;
// Shift+S must continue to reach the connector-snap shortcut in app.js.
window.addEventListener('keydown', event => {
  if (event.code !== 'KeyS' || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return
  if (event.target instanceof HTMLElement && (/INPUT|TEXTAREA|SELECT/.test(event.target.tagName) || event.target.isContentEditable)) return
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

  let runStartedAt = 0
  let finished = false
  let timerFrame = 0
  let maxPullForce = 0

  const readProject = () => {
    try {
      return JSON.parse(localStorage.getItem(PROJECT_KEY) || 'null')
    } catch {
      return null
    }
  }

  const readPositiveNumber = key => {
    const value = Number(localStorage.getItem(key))
    return Number.isFinite(value) && value > 0 ? value : null
  }

  const formatTime = seconds => `${seconds.toFixed(2)}s`
  const formatForce = force => `${force.toFixed(1)} F`

  const bestForScenario = scenario => scenario === 'torque-pull'
    ? readPositiveNumber(PULL_BEST_KEY)
    : readPositiveNumber(HILL_BEST_KEY)

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
        localStorage.setItem(TEST_SCENARIO_KEY, 'hill-climb')
        location.reload()
      } catch (error) {
        console.error('Could not load BrickLab demo', error)
      }
    }

    topActions.insertBefore(button, shortcutsButton || null)
    window.lucide?.createIcons?.({ attrs: { 'stroke-width': 1.8, 'aria-hidden': 'true' } })
  }

  const updateScenarioControl = () => {
    const control = document.getElementById('testScenarioControl')
    if (!control) return
    const config = SCENARIOS[selectedScenario]
    control.querySelector('[data-test-scenario-label]').textContent = config.short
    control.title = `TEST scenario: ${config.label}. Click to switch.`
    control.dataset.scenario = selectedScenario
  }

  const installScenarioControl = () => {
    if (document.getElementById('testScenarioControl')) return
    const button = document.createElement('button')
    button.id = 'testScenarioControl'
    button.className = 'test-scenario-control'
    button.innerHTML = '<i data-lucide="route"></i><span data-test-scenario-label></span><i data-lucide="repeat-2"></i>'
    button.onclick = () => {
      selectedScenario = selectedScenario === 'hill-climb' ? 'torque-pull' : 'hill-climb'
      localStorage.setItem(TEST_SCENARIO_KEY, selectedScenario)
      updateScenarioControl()
      if (document.body.dataset.bricklabTest) testButton.click()
    }
    modes.after(button)
    updateScenarioControl()
    window.lucide?.createIcons?.({ attrs: { 'stroke-width': 1.8, 'aria-hidden': 'true' } })
  }

  installDemoButton()
  installScenarioControl()

  const markTestUi = scenario => {
    document.querySelectorAll('.mode').forEach(button => button.classList.remove('active'))
    testButton.classList.add('active')
    document.body.dataset.bricklabTest = scenario
    document.body.dataset.bricklabTestLabel = SCENARIOS[scenario]?.short || 'TEST'
  }

  const clearTestUi = () => {
    delete document.body.dataset.bricklabTest
    delete document.body.dataset.bricklabTestLabel
    cancelAnimationFrame(timerFrame)
  }

  const ensureRunUi = scenario => {
    const testPanel = document.querySelector('.telemetry-test')
    if (!testPanel) return null
    const existing = testPanel.querySelector('.test-run-meta')
    if (existing) return testPanel

    const best = bestForScenario(scenario)
    const meta = document.createElement('div')
    meta.className = 'test-run-meta'
    meta.dataset.scenario = scenario

    if (scenario === 'torque-pull') {
      meta.innerHTML = `
        <span>TIME <b data-test-time>0.00s</b></span>
        <span>BEST LOAD <b data-test-best>${best == null ? '—' : formatForce(best)}</b></span>
        <button type="button" data-test-retry><i data-lucide="rotate-ccw"></i><span>Retry</span></button>
      `
    } else {
      meta.innerHTML = `
        <span>TIME <b data-test-time>0.00s</b></span>
        <span>BEST TIME <b data-test-best>${best == null ? '—' : formatTime(best)}</b></span>
        <button type="button" data-test-retry><i data-lucide="rotate-ccw"></i><span>Retry</span></button>
      `
    }

    testPanel.append(meta)
    meta.querySelector('[data-test-retry]').onclick = () => testButton.click()
    window.lucide?.createIcons?.({ attrs: { 'stroke-width': 1.8, 'aria-hidden': 'true' } })
    return testPanel
  }

  const readCurrentPullForce = panel => {
    const text = panel?.querySelector('[data-test-altitude]')?.textContent || ''
    const value = Number.parseFloat(text)
    return Number.isFinite(value) ? value : 0
  }

  const finishRun = (scenario, panel, elapsed, statusValue) => {
    if (finished) return
    finished = true

    if (scenario === 'torque-pull') {
      const previous = readPositiveNumber(PULL_BEST_KEY)
      if (previous == null || maxPullForce > previous) localStorage.setItem(PULL_BEST_KEY, String(maxPullForce))
      const bestEl = panel?.querySelector('[data-test-best]')
      if (bestEl) bestEl.textContent = formatForce(readPositiveNumber(PULL_BEST_KEY) ?? maxPullForce)
    } else if (statusValue === 'PASSED') {
      const previous = readPositiveNumber(HILL_BEST_KEY)
      if (previous == null || elapsed < previous) localStorage.setItem(HILL_BEST_KEY, String(elapsed))
      const bestEl = panel?.querySelector('[data-test-best]')
      if (bestEl) bestEl.textContent = formatTime(readPositiveNumber(HILL_BEST_KEY) ?? elapsed)
    }

    panel?.classList.toggle('run-complete', statusValue === 'PASSED')
    panel?.classList.toggle('run-failed', statusValue === 'STALLED')
  }

  const updateRunTimer = () => {
    const activeScenario = document.body.dataset.bricklabTest
    if (!SCENARIOS[activeScenario]) return

    const panel = ensureRunUi(activeScenario)
    const timeEl = panel?.querySelector('[data-test-time]')
    const statusValue = panel?.dataset.testStatus || 'RUNNING'
    const elapsed = runStartedAt ? (performance.now() - runStartedAt) / 1000 : 0
    if (timeEl) timeEl.textContent = formatTime(elapsed)

    if (activeScenario === 'torque-pull') {
      maxPullForce = Math.max(maxPullForce, readCurrentPullForce(panel))
      const bestEl = panel?.querySelector('[data-test-best]')
      const storedBest = readPositiveNumber(PULL_BEST_KEY) ?? 0
      if (bestEl && !finished) bestEl.textContent = formatForce(Math.max(storedBest, maxPullForce))
    }

    if (!finished && (statusValue === 'PASSED' || statusValue === 'STALLED')) {
      finishRun(activeScenario, panel, elapsed, statusValue)
    }

    if (!finished) timerFrame = requestAnimationFrame(updateRunTimer)
  }

  const startTimer = () => {
    cancelAnimationFrame(timerFrame)
    runStartedAt = performance.now()
    finished = false
    maxPullForce = 0
    timerFrame = requestAnimationFrame(updateRunTimer)
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
    const scenario = selectedScenario
    if (!buildButton.classList.contains('active')) originalBuild?.call(buildButton, new Event('click'))
    window.__bricklabNextScenario = scenario
    originalSimulate?.call(simulateButton, new Event('click'))
    markTestUi(scenario)
    startTimer()
  }

  const observer = new MutationObserver(() => {
    const activeScenario = document.body.dataset.bricklabTest
    if (!SCENARIOS[activeScenario]) return

    if (status.textContent.startsWith('BUILD')) {
      clearTestUi()
      return
    }

    if (status.textContent.startsWith('SIMULATE')) {
      status.textContent = status.textContent.replace(/^SIMULATE[^·]*/, SCENARIOS[activeScenario].status)
    }
    markTestUi(activeScenario)
    ensureRunUi(activeScenario)
  })
  observer.observe(status, { childList: true, characterData: true, subtree: true })
}

installTestLab()
