const DEFAULT_TOLERANCE = 1e-9

function finite(value) {
  return Number.isFinite(Number(value))
}

function normalizedEquation(raw, index) {
  if (!raw || typeof raw !== 'object') throw new TypeError(`Equation ${index} must be an object`)
  const coefficients = {}
  for (const [variable, coefficient] of Object.entries(raw.coefficients || {})) {
    const numeric = Number(coefficient)
    if (!finite(numeric)) throw new TypeError(`Equation ${raw.id || index} has non-finite coefficient`)
    if (numeric !== 0) coefficients[String(variable)] = numeric
  }
  const constant = Number(raw.constant ?? 0)
  if (!finite(constant)) throw new TypeError(`Equation ${raw.id || index} has non-finite constant`)
  return {
    id:String(raw.id || `eq-${index}`),
    coefficients,
    constant,
    metadata:raw.metadata ?? null,
  }
}

function residual(equation, values) {
  let lhs = 0
  for (const [variable, coefficient] of Object.entries(equation.coefficients)) {
    lhs += coefficient * (values[variable] ?? 0)
  }
  return lhs - equation.constant
}

export function solveLinearSystem(rawEquations = [], {
  variables = null,
  defaults = {},
  tolerance = DEFAULT_TOLERANCE,
} = {}) {
  const eps = Number.isFinite(tolerance) ? Math.max(DEFAULT_TOLERANCE, Math.abs(tolerance)) : DEFAULT_TOLERANCE
  const equations = rawEquations.map(normalizedEquation)

  const variableSet = new Set((variables || []).map(String))
  for (const equation of equations) {
    for (const variable of Object.keys(equation.coefficients)) variableSet.add(variable)
  }
  const names = [...variableSet].sort()
  const width = names.length
  const indexOf = new Map(names.map((name, index) => [name, index]))

  const rows = equations.map(equation => {
    const values = Array(width + 1).fill(0)
    for (const [variable, coefficient] of Object.entries(equation.coefficients)) {
      values[indexOf.get(variable)] = coefficient
    }
    values[width] = equation.constant
    return { values, provenance:new Set([equation.id]) }
  })

  let pivotRow = 0
  const pivots = new Map()

  for (let column = 0; column < width && pivotRow < rows.length; column += 1) {
    let selected = pivotRow
    let magnitude = Math.abs(rows[selected]?.values[column] || 0)
    for (let row = pivotRow + 1; row < rows.length; row += 1) {
      const candidate = Math.abs(rows[row].values[column])
      if (candidate > magnitude) {
        magnitude = candidate
        selected = row
      }
    }
    if (magnitude <= eps) continue

    if (selected !== pivotRow) [rows[selected], rows[pivotRow]] = [rows[pivotRow], rows[selected]]
    const pivot = rows[pivotRow].values[column]
    for (let cell = column; cell <= width; cell += 1) rows[pivotRow].values[cell] /= pivot

    for (let row = 0; row < rows.length; row += 1) {
      if (row === pivotRow) continue
      const factor = rows[row].values[column]
      if (Math.abs(factor) <= eps) continue
      for (let cell = column; cell <= width; cell += 1) {
        rows[row].values[cell] -= factor * rows[pivotRow].values[cell]
        if (Math.abs(rows[row].values[cell]) <= eps) rows[row].values[cell] = 0
      }
      for (const id of rows[pivotRow].provenance) rows[row].provenance.add(id)
    }

    pivots.set(column, pivotRow)
    pivotRow += 1
  }

  const conflicts = []
  for (const row of rows) {
    const allZero = row.values.slice(0, width).every(value => Math.abs(value) <= eps)
    if (allZero && Math.abs(row.values[width]) > eps) {
      conflicts.push(Object.freeze({
        reason:'inconsistent-equations',
        residual:row.values[width],
        equationIds:Object.freeze([...row.provenance].sort()),
      }))
    }
  }

  if (conflicts.length) {
    return Object.freeze({
      valid:false,
      values:Object.freeze({}),
      freeVariables:Object.freeze([]),
      pivotVariables:Object.freeze([]),
      conflicts:Object.freeze(conflicts),
      rank:pivots.size,
      variables:Object.freeze(names),
      residuals:Object.freeze([]),
    })
  }

  const freeColumns = []
  for (let column = 0; column < width; column += 1) if (!pivots.has(column)) freeColumns.push(column)

  const solution = Array(width).fill(0)
  for (const column of freeColumns) {
    const fallback = Number(defaults?.[names[column]])
    solution[column] = Number.isFinite(fallback) ? fallback : 0
  }

  const pivotColumns = [...pivots.keys()].sort((a, b) => b - a)
  for (const column of pivotColumns) {
    const row = rows[pivots.get(column)]
    let value = row.values[width]
    for (let other = column + 1; other < width; other += 1) value -= row.values[other] * solution[other]
    solution[column] = value
  }

  const values = Object.freeze(Object.fromEntries(names.map((name, index) => [name, solution[index]])))
  const residuals = Object.freeze(equations.map(eq => Object.freeze({
    id:eq.id,
    residual:residual(eq, values),
  })))

  return Object.freeze({
    valid:true,
    values,
    freeVariables:Object.freeze(freeColumns.map(column => names[column])),
    pivotVariables:Object.freeze([...pivots.keys()].sort((a, b) => a - b).map(column => names[column])),
    conflicts:Object.freeze([]),
    rank:pivots.size,
    variables:Object.freeze(names),
    residuals,
  })
}
