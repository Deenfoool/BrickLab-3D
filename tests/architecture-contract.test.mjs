import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import './repository-hygiene.test.mjs'
import './performance-engine.test.mjs'
import './ldraw-mechanical-intelligence.test.mjs'
import './smart-assembly-assistant.test.mjs'
import './smart-assembly-curated-registry.test.mjs'
import './smart-assembly-event-order.test.mjs'
import './design-doctor.test.mjs'
import './connectors-v4-pin-semantics.test.mjs'
import './connectors-v4-pin-ranking.test.mjs'
import './connectors-v4-discovery.test.mjs'
import './project-library.test.mjs'

import {
  ARCHITECTURE_CONSOLIDATION_STATUS,
  ARCHITECTURE_CONSOLIDATION_VERSION,
  architectureContractReport,
  assertArchitectureContract,
} from '../architecture/contract-assert-v1.js'

function completeSubsystemFixture() {
  return {
    version:'architecture-v1.2.0',
    status:() => ({
      version:'architecture-v1.2.0',
      editor:true,
      connectorBuild:true,
      connectorSimulate:true,
      projects:true,
      testLab:false,
      guidance:false,
      telemetry:false,
    }),
    parts:{
      list(){}, get(){}, mechanical(){}, physical(){}, connectors(){}, capabilities(){}, instantiate(){},
    },
    editor:{
      objects(){}, selection(){}, primarySelection(){}, objectById(){}, projectState(){}, history(){},
    },
    projects:{
      current(){}, save(){}, createNew(){}, requestImport(){}, exportProject(){},
    },
    mechanics:{ metadata(){} },
    physics:{
      createSession(){},
      guard:() => ({ active:true, createOwner:'connector-physics-guard-v4.5.1' }),
    },
    connectivity:{
      authority:{ build:'connector-v4-with-legacy-bridge', simulate:'connector-v4-physics-guard' },
      build:{ reconcile(){}, records(){} },
    },
  }
}

test('Architecture Consolidation v1 has an executable completion contract', () => {
  const subsystems = completeSubsystemFixture()
  const report = architectureContractReport(subsystems)

  assert.match(ARCHITECTURE_CONSOLIDATION_VERSION, /^architecture-consolidation-v1\./)
  assert.equal(ARCHITECTURE_CONSOLIDATION_STATUS, 'complete')
  assert.equal(report.pass, true)
  assert.equal(report.milestoneStatus, 'complete')
  assert.equal(assertArchitectureContract(subsystems), report)
})

test('completion contract fails closed when BUILD or SIMULATE authority is bypassed', () => {
  const buildBypass = completeSubsystemFixture()
  buildBypass.connectivity.authority.build = 'direct-global-mutation'
  assert.equal(architectureContractReport(buildBypass).pass, false)
  assert.throws(() => assertArchitectureContract(buildBypass), error => {
    assert.equal(error.code, 'BRICKLAB_ARCHITECTURE_CONTRACT_FAILED')
    assert.match(error.message, /BUILD authority/)
    return true
  })

  const simulateBypass = completeSubsystemFixture()
  simulateBypass.physics.guard = () => ({ active:false, createOwner:null })
  const report = architectureContractReport(simulateBypass)
  assert.equal(report.pass, false)
  assert.ok(report.issues.some(issue => /guard/.test(issue)))
})

test('completion contract requires editor, projects and centralized metadata access', () => {
  const fixture = completeSubsystemFixture()
  fixture.status = () => ({ editor:false, projects:false, connectorBuild:true, connectorSimulate:true })
  fixture.parts.mechanical = null
  fixture.projects.current = null

  const report = architectureContractReport(fixture)
  assert.equal(report.pass, false)
  assert.ok(report.issues.includes('Editor contract not bound'))
  assert.ok(report.issues.includes('Projects contract not bound'))
  assert.ok(report.issues.includes('parts.mechanical unavailable'))
  assert.ok(report.issues.includes('projects.current unavailable'))
})

test('production bootstrap asserts the architecture contract after binding the editor adapter', async () => {
  const source = await readFile(new URL('../bootstrap.js', import.meta.url), 'utf8')
  const adapter = source.indexOf("await import('./architecture/editor-adapter-v1.js?v=architecture-20260911-v1')")
  const performanceEngine = source.indexOf("await import('./performance/runtime-v1.js?v=performance-20260911-v1')")
  const assertionImport = source.indexOf("await import('./architecture/contract-assert-v1.js?v=architecture-20260911-v1')")
  const assertionCall = source.indexOf('assertArchitectureContract()')
  const runtimeReady = source.indexOf('window.__bricklabRuntimeReady = true')

  assert.ok(adapter >= 0)
  assert.ok(performanceEngine > adapter, 'Performance Engine consumes the bound editor contract')
  assert.ok(assertionImport > performanceEngine, 'contract assertion loads after optional performance initialization')
  assert.ok(assertionCall > assertionImport, 'architecture contract is executed')
  assert.ok(runtimeReady > assertionCall, 'runtime is marked ready only after the architecture contract passes')
})

test('closure record documents every roadmap item 1 done criterion', async () => {
  const source = await readFile(new URL('../docs/ARCHITECTURE_CONSOLIDATION_V1.md', import.meta.url), 'utf8')
  assert.match(source, /Status: \*\*COMPLETE\*\*/)
  assert.match(source, /documented subsystem APIs/i)
  assert.match(source, /existing project files/i)
  assert.match(source, /fail-closed/i)
  assert.match(source, /acceptance/i)
  assert.match(source, /no-build/i)
})
