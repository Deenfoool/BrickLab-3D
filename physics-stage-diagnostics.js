import { PhysicsSession } from './physics.js'

const marker = Symbol.for('bricklab.physicsStageDiagnostics.v1')

function preserveOwner(wrapper, original) {
  if (original?.__bricklabOwner) wrapper.__bricklabOwner = original.__bricklabOwner
  if (original?.__mechanicsNextBypass) wrapper.__mechanicsNextBypass = true
  return wrapper
}

if (!PhysicsSession.prototype[marker]) {
  const stages = [
    'buildScenario',
    'createCompoundBody',
    'createJoint',
    'buildGearCouplers',
    'buildShaftMonitors',
    'buildWheelMonitors',
    'buildChassisMonitor',
    'mountTelemetry',
  ]

  for (const name of stages) {
    const original = PhysicsSession.prototype[name]
    if (typeof original !== 'function') continue

    const wrapped = function bricklabStageWrapped(...args) {
      window.__bricklabPhysicsStage = name
      try {
        return original.apply(this, args)
      } catch (error) {
        if (error && typeof error === 'object' && !error.bricklabStage) {
          try { error.bricklabStage = name } catch {}
        }
        throw error
      }
    }
    PhysicsSession.prototype[name] = preserveOwner(wrapped, original)
  }

  Object.defineProperty(PhysicsSession.prototype, marker, {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false,
  })
}
