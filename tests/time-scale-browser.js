const button = document.getElementById('run')
const status = document.getElementById('status')
const output = document.getElementById('diagnostics')
button.onclick = async () => {
  button.disabled = true
  const rows = []
  try {
    status.textContent = 'Загрузка production physics…'
    await import('../runtime-extensions.js')
    const { PhysicsSession } = await import('../physics.js')
    const { findPart } = await import('../parts.js')
    const { resetPhysicsClock, STEP_OWNER } = await import('../simulation-time.js')
    const before = PhysicsSession.prototype.step
    const motor = PhysicsSession.prototype.applyMotorTorques
    await import('../physics-v2-ui.js')
    if (before !== PhysicsSession.prototype.step || motor !== PhysicsSession.prototype.applyMotorTorques || before.__bricklabOwner !== STEP_OWNER) throw Error('Late UI import replaced physics')
    const previousSettings = localStorage.getItem('bricklab.physics.v2.settings')
    const previousScale = window.BrickLabSimulationTime.getPreferred()
    try {
      localStorage.setItem('bricklab.physics.v2.settings', JSON.stringify({quality:'balanced'}))
      for (const scale of [.5,1,2,3]) {
        status.textContent = `Падение ${scale}×…`
        window.BrickLabSimulationTime.set(scale, {persist:false})
        const brick = findPart('brick-2x4').create(0xd7263d)
        brick.userData.instanceId = 'acceptance-fall'; brick.userData.partId = 'brick-2x4'; brick.position.y = 900
        const s = await PhysicsSession.create([brick], [])
        try {
          resetPhysicsClock(s)
          const start = performance.now(), body = s.components[0].body
          let hit = false
          const metrics = s.updateVehicleMetrics
          s.updateVehicleMetrics = function(dt) { metrics.call(this,dt); hit ||= body.translation().y <= .02 }
          while (!hit && performance.now()-start < 8000) {
            await new Promise(requestAnimationFrame)
            s.step()
          }
          if (!hit) throw Error('Brick did not reach ground')
          const seconds = (performance.now()-start)/1000
          rows.push({scale, seconds, sim:s.simulationTime, y:body.translation().y, debug:window.__bricklabTimeDebug()})
          document.getElementById('results').innerHTML = rows.map(r=>`<tr><td>${r.scale}×</td><td>${r.seconds.toFixed(3)} с</td><td>${r.sim.toFixed(3)} с</td><td>${r.y.toFixed(6)}</td><td>${rows.find(x=>x.scale===1)?(rows.find(x=>x.scale===1).seconds/r.seconds).toFixed(2)+'×':'—'}</td></tr>`).join('')
          output.textContent = JSON.stringify(rows, null, 2)
        } finally { s.dispose() }
      }
    } finally {
      if (previousSettings === null) localStorage.removeItem('bricklab.physics.v2.settings')
      else localStorage.setItem('bricklab.physics.v2.settings', previousSettings)
      window.BrickLabSimulationTime.set(previousScale, {persist:false})
    }
    const baseline = rows.find(r=>r.scale===1).seconds
    const passed = rows.every(r=>Math.abs(r.seconds-baseline/r.scale) < .12 && r.debug.droppedSimulationTime === 0)
    status.className = passed ? 'pass' : 'fail'
    status.textContent = passed ? 'PASS — физическое падение масштабируется; поздний UI сохраняет runner и моторы.' : 'FAIL — измерения вне допуска 120 мс; смотрите диагностику.'
  } catch (error) {
    status.className = 'fail'; status.textContent = `FAIL — ${error.message}`
    console.error(error)
  } finally { button.disabled = false }
}
