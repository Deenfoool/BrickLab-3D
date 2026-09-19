import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { Window } from 'happy-dom'
import RAPIER from '@dimforge/rapier3d-compat'

const dom = new Window()
for (const key of ['window','document','localStorage','CustomEvent','MutationObserver','CSS']) globalThis[key] = key === 'window' ? dom : dom[key]
globalThis.requestAnimationFrame = () => 0
globalThis.setInterval = () => 0
await import('../runtime-extensions.js')
const { PhysicsSession } = await import('../physics.js')
const { findPart } = await import('../parts.js')
const { resetPhysicsClock, STEP_OWNER } = await import('../simulation-time.js')
const runnerBeforeUI = PhysicsSession.prototype.step
const buildBeforeUI = PhysicsSession.prototype.build
await import('../physics-v2-ui.js') // The actual late import that broke RUNTIME-3.
await RAPIER.init()

function brickSession({quality = 'balanced', scenario = 'flat'} = {}) {
  localStorage.setItem('bricklab.physics.v2.settings', JSON.stringify({quality}))
  const brick = findPart('brick-2x4').create(0xd7263d)
  brick.userData.instanceId = 'fall'; brick.userData.partId = 'brick-2x4'; brick.position.y = 900
  const s = new PhysicsSession(RAPIER, [brick], [], scenario)
  s.build(); resetPhysicsClock(s, 0)
  return s
}
function fall(scale, fps, quality = 'balanced', scenario = 'flat') {
  window.__bricklabRequestedTimeScale = scale
  const s = brickSession({quality, scenario})
  let t = 0, hitTime = null
  const body = s.components[0].body
  const metrics = s.updateVehicleMetrics
  s.updateVehicleMetrics = function(dt) {
    metrics.call(this, dt)
    if (hitTime === null && body.translation().y <= .02) hitTime = this.simulationTime
  }
  try {
    while (t < 6 && hitTime === null) { t += 1/fps; s.step(t) }
    assert.ok(t < 6, JSON.stringify({scale,fps,quality,y:body.translation().y,sim:s.simulationTime}))
    assert.ok(Math.abs(s.objects[0].position.y * .008 - body.translation().y) < 1e-6, 'render pose matches real body')
    return {scale, fps, quality, seconds: t, sim: s.simulationTime, hitTime, y: body.translation().y, dt: s.world.timestep}
  } finally { s.dispose() }
}

test('late UI imports preserve the native physics clock and base builder', () => {
  assert.equal(PhysicsSession.prototype.step, runnerBeforeUI)
  assert.equal(PhysicsSession.prototype.build, buildBeforeUI)
  assert.equal(PhysicsSession.prototype.step.__bricklabOwner, STEP_OWNER)
})

test('all local production imports resolve to one cache-busted URL', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8')
  const {imports} = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1])
  const entry = html.match(/src="\.\/bootstrap.js\?v=([^"]+)/)[1]
  const aliases = {'connections.js':'connections-v3.js','snapping.js':'snapping-v3.js','connector-validation.js':'connector-validation-v3.js'}
  for (const name of (await readdir(new URL('../', import.meta.url))).filter(n=>n.endsWith('.js'))) {
    assert.equal(imports[`./${name}`], `./${aliases[name] ?? name}?v=${entry}`, name)
    const code = await readFile(new URL(`../${name}`, import.meta.url), 'utf8')
    for(const match of code.matchAll(/["'](\.\/?[^"']+\.js\?v=[^"']+)["']/g)){
      const requested=match[1]
      const canonicalKey=requested.split('?')[0]
      assert.equal(imports[requested],imports[canonicalKey],name+': '+requested)
    }
    assert.doesNotMatch(code, /PhysicsSession\.prototype\.step\s*=/, name)
  }
})

test('real Rapier free fall scales at 15/30/60/144 FPS and all qualities', () => {
  const report = []
  for (const quality of ['fast','balanced','accurate']) for (const fps of [15,30,60,144]) {
    const baseline = fall(1, fps, quality)
    for (const scale of [.5,1,2,3]) {
      const result = fall(scale, fps, quality)
      assert.ok(Math.abs(result.seconds - baseline.seconds/scale) <= (1 + 1/scale)/fps + 1e-8, JSON.stringify(result))
      assert.equal(result.hitTime, baseline.hitTime, 'identical trajectory and contact time in simulation seconds')
      assert.ok(Math.abs(result.dt - 1/({fast:60,balanced:120,accurate:180}[quality])) < 1e-8)
      if (quality === 'balanced' && fps === 60) report.push({...result,seconds:+result.seconds.toFixed(3)})
    }
  }
  console.log('FALL 7.2 m / real rigid-body coordinates:', JSON.stringify(report))
})

test('same simulated instant gives identical body position and velocity at any scale', () => {
  let baseline
  for (const scale of [1,.5,2,3]) {
    window.__bricklabRequestedTimeScale = scale
    const s = brickSession()
    for (let n=1; n<=144/scale; n++) s.step(n/144)
    const body=s.components[0].body, state=[body.translation().y,body.linvel().y]
    baseline ??= state
    assert.deepEqual(state,baseline)
    assert.ok(Math.abs(s.simulationTime-1)<1e-8)
    s.dispose()
  }
})

test('5 FPS, scale changes, pause/resume, reset, and overload accounting', () => {
  const s=brickSession()
  window.__bricklabRequestedTimeScale=3
  for(let n=1;n<=5;n++) s.step(n/5)
  assert.ok(Math.abs(s.simulationTime-3)<1e-8)
  assert.equal(s.droppedSimulationTime,0)
  window.__bricklabRequestedTimeScale=.5
  s.step(1.2)
  assert.ok(Math.abs(s.simulationTime-3.1)<1e-8)
  s.setRunning(false); s.step(100)
  assert.ok(Math.abs(s.simulationTime-3.1)<1e-8)
  s.setRunning(true)
  s.step(s.physicsLastTime+0.1)
  assert.ok(Math.abs(s.simulationTime-3.15)<1e-8)
  const last=s.physicsLastTime
  s.step(last+2)
  assert.ok(Math.abs(s.droppedSimulationTime-.875)<1e-8)
  resetPhysicsClock(s,0)
  assert.equal(s.simulationTime,0);assert.equal(s.realElapsedTime,0);assert.equal(s.physicsAccumulator,0)
  s.dispose()
})

test('TEST ignores requested scales; phase countdown and timers use simulation seconds', () => {
  for (const scale of [.5,1,2,3]) {
    window.__bricklabRequestedTimeScale=scale
    const s=brickSession({scenario:'hill-climb'})
    for(let n=1;n<=480;n++) s.step(n/120)
    assert.equal(s.timeScale,1)
    assert.ok(Math.abs(s.simulationTime-4)<1e-8)
    assert.equal(s.scenarioData.phase,'RUN')
    assert.ok(Math.abs(s.testElapsed-.5)<.02)
    const d=window.__bricklabTimeDebug()
    assert.equal(d.activeStepOwner,STEP_OWNER);assert.equal(d.appliedScale,1);assert.equal(d.requestedScale,scale)
    s.dispose()
  }
})

test('wall-clock acceptance: reset brick each run, measure position at real timer ticks', async () => {
  const rows=[]
  for(const scale of [.5,1,2,3]) {
    const s=brickSession();window.__bricklabRequestedTimeScale=scale
    resetPhysicsClock(s)
    const start=performance.now()
    while(s.components[0].body.translation().y>.004 && performance.now()-start<6000) {
      await new Promise(resolve=>setTimeout(resolve,4));s.step()
    }
    rows.push({scale,seconds:(performance.now()-start)/1000,y:s.components[0].body.translation().y})
    s.dispose()
  }
  const base=rows.find(r=>r.scale===1).seconds
  for(const row of rows) assert.ok(Math.abs(row.seconds-base/row.scale)<.06,JSON.stringify(rows))
  console.log('WALL CLOCK ACCEPTANCE:',JSON.stringify(rows))
  await dom.happyDOM.close()
})
