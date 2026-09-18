import { driverEquation } from '../transmission/equations.js'
import { solveLinearSystem } from './linear-system.js'

export class KinematicSolver {
  #equations = new Map()
  #drivers = new Map()
  #revision = 0
  #cache = null

  get revision() { return this.#revision }

  addEquation(equation) {
    if (!equation?.id) throw new TypeError('Equation requires id')
    this.#equations.set(String(equation.id), equation)
    this.#changed()
    return equation
  }

  removeEquation(id) {
    const removed = this.#equations.delete(String(id))
    if (removed) this.#changed()
    return removed
  }

  setDriver({
    id,
    bodyId,
    value,
    channel = 'omega',
    source = 'interaction',
  } = {}) {
    const equation = driverEquation({ id:id || `driver:${source}:${bodyId}:${channel}`, bodyId, value, channel, source })
    this.#drivers.set(equation.id, equation)
    this.#changed()
    return equation
  }

  clearDriver(id) {
    const removed = this.#drivers.delete(String(id))
    if (removed) this.#changed()
    return removed
  }

  clearDriversBySource(source) {
    let removed = 0
    for (const [id, equation] of this.#drivers) {
      if (equation.metadata?.source !== source) continue
      this.#drivers.delete(id)
      removed += 1
    }
    if (removed) this.#changed()
    return removed
  }

  equations() {
    return Object.freeze([...this.#equations.values(), ...this.#drivers.values()])
  }

  solve({
    variables = null,
    defaults = {},
    tolerance,
    force = false,
  } = {}) {
    const cacheKey = JSON.stringify({ variables, defaults, tolerance })
    if (!force && this.#cache?.revision === this.#revision && this.#cache.key === cacheKey) return this.#cache.result

    const linear = solveLinearSystem(this.equations(), { variables, defaults, tolerance })
    const result = Object.freeze({
      ...linear,
      revision:this.#revision,
      equationCount:this.#equations.size,
      driverCount:this.#drivers.size,
      underdetermined:linear.valid && linear.freeVariables.length > 0,
      status:!linear.valid
        ? 'conflict'
        : linear.freeVariables.length
          ? 'underdetermined'
          : 'solved',
    })
    this.#cache = { revision:this.#revision, key:cacheKey, result }
    return result
  }

  explainVariable(variable, result = this.solve()) {
    const participating = this.equations()
      .filter(equation => Object.hasOwn(equation.coefficients || {}, variable))
      .map(equation => ({
        id:equation.id,
        coefficient:equation.coefficients[variable],
        metadata:equation.metadata ?? null,
      }))
    return Object.freeze({
      variable,
      value:result.values?.[variable] ?? null,
      free:result.freeVariables?.includes(variable) ?? false,
      equations:Object.freeze(participating.map(Object.freeze)),
      status:result.status,
    })
  }

  #changed() {
    this.#revision += 1
    this.#cache = null
  }
}

export function createKinematicSolver() {
  return new KinematicSolver()
}
