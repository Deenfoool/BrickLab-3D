const HILL_BEST_KEY = 'bricklab.test.hill-climb.best.v1'

function installTestLab() {
  const buildButton = document.querySelector('.mode[data-mode="build"]')
  const simulateButton = document.querySelector('.mode[data-mode="simulate"]')
  const testButton = document.querySelector('.mode[data-mode="test"]')
  const status = document.getElementById('statusText')
  if (!buildButton || !simulateButton || !testButton || !status) {
    requestAnimationFrame(installTestLab)
    return
  }

  let runStartedAt = 0
  let finished = false
  let timerFrame = 0

  const readBest = () => {
    const value = Number(localStorage.getItem(HILL_BEST_KEY))
    return Number.isFinite(value) && value > 0 ? value : null
  }

  const formatTime = seconds => `${seconds.toFixed(2)}s`

  const markTestUi = () => {
    document.querySelectorAll('.mode').forEach(button => button.classList.remove('active'))
    testButton.classList.add('active')
    document.body.dataset.bricklabTest = 'hill-climb'
  }

  const clearTestUi = () => {
    delete document.body.dataset.bricklabTest
    cancelAnimationFrame(timerFrame)
  }

  const ensureRunUi = () => {
    const testPanel = document.querySelector('.telemetry-test')
    if (!testPanel || testPanel.querySelector('.test-run-meta')) return testPanel

    const meta = document.createElement('div')
    meta.className = 'test-run-meta'
    meta.innerHTML = `
      <span>TIME <b data-test-time>0.00s</b></span>
      <span>BEST <b data-test-best>${readBest() == null ? '—' : formatTime(readBest())}</b></span>
      <button type="button" data-test-retry><i data-lucide="rotate-ccw"></i><span>Retry</span></button>
    `
    testPanel.append(meta)
    meta.querySelector('[data-test-retry]').onclick = () => testButton.click()
    window.lucide?.createIcons?.({ attrs: { 'stroke-width': 1.8, 'aria-hidden': 'true' } })
    return testPanel
  }

  const updateRunTimer = () => {
    if (document.body.dataset.bricklabTest !== 'hill-climb') return
    const panel = ensureRunUi()
    const timeEl = panel?.querySelector('[data-test-time]')
    const statusValue = panel?.dataset.testStatus || 'RUNNING'
    const elapsed = runStartedAt ? (performance.now() - runStartedAt) / 1000 : 0

    if (timeEl) timeEl.textContent = formatTime(elapsed)

    if (!finished && statusValue === 'PASSED') {
      finished = true
      const previous = readBest()
      if (previous == null || elapsed < previous) localStorage.setItem(HILL_BEST_KEY, String(elapsed))
      const bestEl = panel?.querySelector('[data-test-best]')
      if (bestEl) bestEl.textContent = formatTime(readBest() ?? elapsed)
      panel?.classList.add('run-complete')
    } else if (!finished && statusValue === 'STALLED') {
      finished = true
      panel?.classList.add('run-failed')
    }

    if (!finished) timerFrame = requestAnimationFrame(updateRunTimer)
  }

  const startTimer = () => {
    cancelAnimationFrame(timerFrame)
    runStartedAt = performance.now()
    finished = false
    timerFrame = requestAnimationFrame(updateRunTimer)
  }

  const originalBuild = buildButton.onclick
  const originalSimulate = simulateButton.onclick

  buildButton.onclick = event => {
    clearTestUi()
    originalBuild?.call(buildButton, event)
  }

  simulateButton.onclick = event => {
    const leavingTest = document.body.dataset.bricklabTest === 'hill-climb'
    if (leavingTest) originalBuild?.call(buildButton, event)
    clearTestUi()
    originalSimulate?.call(simulateButton, event)
  }

  testButton.onclick = () => {
    if (!buildButton.classList.contains('active')) originalBuild?.call(buildButton, new Event('click'))
    window.__bricklabNextScenario = 'hill-climb'
    originalSimulate?.call(simulateButton, new Event('click'))
    markTestUi()
    startTimer()
  }

  const observer = new MutationObserver(() => {
    if (document.body.dataset.bricklabTest !== 'hill-climb') return

    if (status.textContent.startsWith('BUILD')) {
      clearTestUi()
      return
    }

    if (status.textContent.startsWith('SIMULATE')) {
      status.textContent = status.textContent.replace(/^SIMULATE/, 'TEST · HILL CLIMB')
    }
    markTestUi()
    ensureRunUi()
  })
  observer.observe(status, { childList: true, characterData: true, subtree: true })
}

installTestLab()
