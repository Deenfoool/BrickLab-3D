function installTestLab() {
  const buildButton = document.querySelector('.mode[data-mode="build"]')
  const simulateButton = document.querySelector('.mode[data-mode="simulate"]')
  const testButton = document.querySelector('.mode[data-mode="test"]')
  const status = document.getElementById('statusText')
  if (!buildButton || !simulateButton || !testButton || !status) {
    requestAnimationFrame(installTestLab)
    return
  }

  const markTestUi = () => {
    document.querySelectorAll('.mode').forEach(button => button.classList.remove('active'))
    testButton.classList.add('active')
    document.body.dataset.bricklabTest = 'hill-climb'
  }

  const clearTestUi = () => {
    delete document.body.dataset.bricklabTest
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
    // TEST reuses the non-destructive SIMULATE runtime, but asks PhysicsSession
    // to build a Hill Climb environment before the world starts.
    if (!buildButton.classList.contains('active')) originalBuild?.call(buildButton, new Event('click'))
    window.__bricklabNextScenario = 'hill-climb'
    originalSimulate?.call(simulateButton, new Event('click'))
    markTestUi()
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
  })
  observer.observe(status, { childList: true, characterData: true, subtree: true })
}

installTestLab()
