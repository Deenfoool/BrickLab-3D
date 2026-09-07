import * as THREE from 'three'
import { PhysicsSession } from './physics.js'
import { findPart } from './parts.js'

const STORE_KEY = 'bricklab.mechanism-controls.v1'
const MOTOR_ACTIONS = ['forward', 'reverse', 'stop', 'toggle', 'speedUp', 'speedDown']
const TRANSMISSION_ACTIONS = ['forward', 'neutral', 'reverse', 'next', 'previous']
const TRANSMISSION_MODES = ['forward', 'neutral', 'reverse']

const registry = new Map()
const runtime = new Map()
let store = readStore()

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value))
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0))
}

function readStore() {
  try {
    const value = JSON.parse(localStorage.getItem(STORE_KEY) || '{}')
    return value && typeof value === 'object' ? value : {}
  } catch {
    return {}
  }
}

function persistStore() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(store)) } catch (error) { console.warn(error) }
}

function emptyBindings(actions) {
  return Object.fromEntries(actions.map(action => [action, null]))
}

function defaultConfigForObject(object) {
  const definition = findPart(object?.userData?.partId)
  if (definition?.mechanics?.motor) {
    const motor = definition.mechanics.motor
    return {
      version: 1,
      type: 'motor',
      motor: {
        baseRpm: clamp(motor.noLoadRpm ?? motor.rpm ?? 120, 0, 1200),
        maxRpm: Math.max(120, clamp((motor.noLoadRpm ?? motor.rpm ?? 120) * 5, 60, 2000)),
        stepRpm: 10,
        autoStart: true,
        initialDirection: motor.direction === -1 ? -1 : 1,
      },
      bindings: emptyBindings(MOTOR_ACTIONS),
    }
  }

  if (definition?.mechanics?.transmission) {
    return {
      version: 1,
      type: 'transmission',
      transmission: { initialMode: 'forward' },
      bindings: emptyBindings(TRANSMISSION_ACTIONS),
    }
  }

  return null
}

function normalizeConfig(object, candidate) {
  const fallback = defaultConfigForObject(object)
  if (!fallback) return null
  const source = candidate && candidate.type === fallback.type ? candidate : fallback

  if (fallback.type === 'motor') {
    const maxRpm = clamp(source.motor?.maxRpm ?? fallback.motor.maxRpm, 10, 2000)
    return {
      version: 1,
      type: 'motor',
      motor: {
        baseRpm: clamp(source.motor?.baseRpm ?? fallback.motor.baseRpm, 0, maxRpm),
        maxRpm,
        stepRpm: clamp(source.motor?.stepRpm ?? fallback.motor.stepRpm, 1, 250),
        autoStart: source.motor?.autoStart !== false,
        initialDirection: source.motor?.initialDirection === -1 ? -1 : 1,
      },
      bindings: {
        ...emptyBindings(MOTOR_ACTIONS),
        ...(source.bindings ?? {}),
      },
    }
  }

  const initialMode = TRANSMISSION_MODES.includes(source.transmission?.initialMode)
    ? source.transmission.initialMode
    : 'forward'
  return {
    version: 1,
    type: 'transmission',
    transmission: { initialMode },
    bindings: {
      ...emptyBindings(TRANSMISSION_ACTIONS),
      ...(source.bindings ?? {}),
    },
  }
}

function ensureConfig(object) {
  const id = object?.userData?.instanceId
  if (!id) return null
  const fallback = defaultConfigForObject(object)
  if (!fallback) return null
  const config = normalizeConfig(object, store[id] ?? object.userData.controlConfig ?? fallback)
  store[id] = config
  object.userData.controlConfig = clone(config)
  persistStore()
  return config
}

function registerObject(object) {
  if (!object?.userData?.instanceId || !object?.userData?.partId) return
  registry.set(object.userData.instanceId, object)
  ensureConfig(object)
}

function scanObject(object) {
  if (!object) return
  registerObject(object)
  for (const child of object.children ?? []) scanObject(child)
}

const originalAdd = THREE.Object3D.prototype.add
THREE.Object3D.prototype.add = function bricklabControlAwareAdd(...objects) {
  const result = originalAdd.apply(this, objects)
  for (const object of objects) scanObject(object)
  return result
}

function activeObjects() {
  return [...registry.values()].filter(object => object?.parent && object.userData?.instanceId)
}

function resetRuntimeForObjects(objects) {
  runtime.clear()
  for (const object of objects ?? []) {
    registerObject(object)
    const config = ensureConfig(object)
    if (!config) continue
    const id = object.userData.instanceId
    if (config.type === 'motor') {
      runtime.set(id, {
        type: 'motor',
        rpm: config.motor.baseRpm,
        direction: config.motor.autoStart ? config.motor.initialDirection : 0,
        running: config.motor.autoStart,
      })
    } else if (config.type === 'transmission') {
      runtime.set(id, {
        type: 'transmission',
        mode: config.transmission.initialMode,
      })
    }
  }
  window.dispatchEvent(new CustomEvent('bricklab:controls-runtime-reset'))
}

function emitRuntime(id) {
  window.dispatchEvent(new CustomEvent('bricklab:control-runtime-change', {
    detail: { id, state: clone(runtime.get(id)) },
  }))
}

function updateConfig(id, patch) {
  const object = registry.get(id)
  if (!object) return null
  const current = ensureConfig(object)
  if (!current) return null
  const merged = clone(current)

  if (current.type === 'motor' && patch?.motor) Object.assign(merged.motor, patch.motor)
  if (current.type === 'transmission' && patch?.transmission) Object.assign(merged.transmission, patch.transmission)
  if (patch?.bindings) Object.assign(merged.bindings, patch.bindings)

  const normalized = normalizeConfig(object, merged)
  store[id] = normalized
  object.userData.controlConfig = clone(normalized)
  persistStore()
  window.dispatchEvent(new CustomEvent('bricklab:control-config-change', {
    detail: { id, config: clone(normalized) },
  }))
  return clone(normalized)
}

function getConfig(id) {
  const object = registry.get(id)
  return object ? clone(ensureConfig(object)) : null
}

function stageProjectControls(parts) {
  for (const part of parts ?? []) {
    if (!part?.instanceId || !part?.control) continue
    store[part.instanceId] = clone(part.control)
  }
  persistStore()
}

function getRuntime(id) {
  return runtime.get(id) ?? null
}

function setMotorRpm(id, rpm) {
  const state = runtime.get(id)
  const config = getConfig(id)
  if (!state || state.type !== 'motor' || !config) return
  state.rpm = clamp(rpm, 0, config.motor.maxRpm)
  emitRuntime(id)
}

function nudgeMotorRpm(id, delta) {
  const state = runtime.get(id)
  const config = getConfig(id)
  if (!state || state.type !== 'motor' || !config) return
  setMotorRpm(id, state.rpm + delta)
}

function setMotorDirection(id, direction) {
  const state = runtime.get(id)
  if (!state || state.type !== 'motor') return
  state.direction = direction > 0 ? 1 : direction < 0 ? -1 : 0
  state.running = state.direction !== 0
  emitRuntime(id)
}

function toggleMotor(id) {
  const state = runtime.get(id)
  const config = getConfig(id)
  if (!state || state.type !== 'motor' || !config) return
  if (state.direction) setMotorDirection(id, 0)
  else setMotorDirection(id, config.motor.initialDirection)
}

function setTransmissionMode(id, mode) {
  const state = runtime.get(id)
  if (!state || state.type !== 'transmission' || !TRANSMISSION_MODES.includes(mode)) return
  state.mode = mode
  emitRuntime(id)
}

function stepTransmission(id, direction) {
  const state = runtime.get(id)
  if (!state || state.type !== 'transmission') return
  const index = TRANSMISSION_MODES.indexOf(state.mode)
  const next = Math.max(0, Math.min(TRANSMISSION_MODES.length - 1, index + (direction > 0 ? 1 : -1)))
  setTransmissionMode(id, TRANSMISSION_MODES[next])
}

function setAllTransmissions(mode) {
  for (const [id, state] of runtime) {
    if (state.type === 'transmission') setTransmissionMode(id, mode)
  }
}

const oldBuild = PhysicsSession.prototype.build
PhysicsSession.prototype.build = function buildWithMechanismControls(...args) {
  resetRuntimeForObjects(this.objects)

  const previousGlobalMode = globalThis.__bricklabTransmissionMode
  globalThis.__bricklabTransmissionMode = 'forward'
  let result
  try {
    result = oldBuild.apply(this, args)
  } finally {
    globalThis.__bricklabTransmissionMode = previousGlobalMode
  }

  for (const coupling of this.gearCouplers ?? []) {
    if (!coupling.id?.startsWith('transmission:')) continue
    const id = coupling.id.slice('transmission:'.length)
    coupling.controlId = id
    coupling.controlForwardFactor = coupling.factor
  }

  window.__bricklabPhysicsSession = this
  return result
}

const oldRegisterMotorDrive = PhysicsSession.prototype.registerMotorDrive
PhysicsSession.prototype.registerMotorDrive = function registerControlledMotor(...args) {
  const before = this.motorDrives.length
  const result = oldRegisterMotorDrive.apply(this, args)
  const drive = this.motorDrives[before]
  if (!drive) return result

  const config = getConfig(drive.id)
  if (!config || config.type !== 'motor') return result
  const originalNominal = Math.max(1, Math.abs(drive.nominalRpm || 120))
  drive.controlId = drive.id
  drive.controlAxisSign = Math.sign(drive.targetRpm / originalNominal) || 1
  drive.nominalRpm = config.motor.baseRpm
  return result
}

const oldApplyMotorTorques = PhysicsSession.prototype.applyMotorTorques
PhysicsSession.prototype.applyMotorTorques = function applyControlledMotorTorques(dt) {
  for (const drive of this.motorDrives ?? []) {
    const state = runtime.get(drive.controlId ?? drive.id)
    if (!state || state.type !== 'motor') continue
    drive.targetRpm = state.rpm * state.direction * (drive.controlAxisSign ?? 1)
    drive.commandRpm = state.rpm * state.direction
  }
  return oldApplyMotorTorques.call(this, dt)
}

const oldApplyGearTorques = PhysicsSession.prototype.applyGearCouplingTorques
PhysicsSession.prototype.applyGearCouplingTorques = function applyControlledTransmissionTorques(...args) {
  const neutralStates = []
  for (const coupling of this.gearCouplers ?? []) {
    if (!coupling.controlId) continue
    const state = runtime.get(coupling.controlId)
    if (!state || state.type !== 'transmission') continue
    coupling.controlMode = state.mode
    if (state.mode === 'forward') coupling.factor = coupling.controlForwardFactor
    else if (state.mode === 'reverse') coupling.factor = -coupling.controlForwardFactor
    else {
      neutralStates.push([coupling, Boolean(coupling.failed)])
      coupling.failed = true
      coupling.transferTorque = 0
      coupling.requestedTorque = 0
    }
  }

  const result = oldApplyGearTorques.apply(this, args)
  for (const [coupling, wasFailed] of neutralStates) coupling.failed = wasFailed
  return result
}

const oldDispose = PhysicsSession.prototype.dispose
PhysicsSession.prototype.dispose = function disposeControlledSession(...args) {
  if (window.__bricklabPhysicsSession === this) window.__bricklabPhysicsSession = null
  return oldDispose.apply(this, args)
}

window.BrickLabControls = {
  getObject: id => registry.get(id) ?? null,
  getObjects: () => activeObjects(),
  getConfig,
  updateConfig,
  stageProjectControls,
  getRuntime,
  getRuntimeEntries: () => [...runtime.entries()],
  resetRuntimeForObjects,
  setMotorRpm,
  nudgeMotorRpm,
  setMotorDirection,
  toggleMotor,
  setTransmissionMode,
  stepTransmission,
  setAllTransmissions,
  motorActions: [...MOTOR_ACTIONS],
  transmissionActions: [...TRANSMISSION_ACTIONS],
}
