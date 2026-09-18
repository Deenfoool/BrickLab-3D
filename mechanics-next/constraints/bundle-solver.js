import { DOF_KEYS } from '../core/model.js'

const DEFAULT_TOLERANCE = 1e-8

const add = (a, b) => a.map((value, index) => value + b[index])
const scale = (a, scalar) => a.map(value => value * scalar)
const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0)
const norm = a => Math.sqrt(dot(a, a))
const cross3 = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]

function normalize3(value, fallback) {
  const vector = Array.isArray(value) && value.length === 3 ? value.map(Number) : fallback
  const length = Math.hypot(...vector)
  return length > 1e-12 ? vector.map(component => component / length) : [...fallback]
}

function orthonormalize(vectors, tolerance = DEFAULT_TOLERANCE) {
  const basis = []
  for (const source of vectors) {
    let vector = source.map(Number)
    for (const axis of basis) vector = add(vector, scale(axis, -dot(vector, axis)))
    const length = norm(vector)
    if (length <= tolerance) continue
    basis.push(vector.map(value => value / length))
  }
  return basis
}

function nullspace(matrix, tolerance = DEFAULT_TOLERANCE) {
  if (!matrix.length) return []
  const rows = matrix.map(row => row.map(Number))
  const rowCount = rows.length
  const columnCount = rows[0]?.length || 0
  let pivotRow = 0
  const pivotColumns = []

  for (let column = 0; column < columnCount && pivotRow < rowCount; column += 1) {
    let selected = pivotRow
    let magnitude = Math.abs(rows[selected][column])
    for (let row = pivotRow + 1; row < rowCount; row += 1) {
      const candidate = Math.abs(rows[row][column])
      if (candidate > magnitude) {
        selected = row
        magnitude = candidate
      }
    }
    if (magnitude <= tolerance) continue

    if (selected !== pivotRow) [rows[selected], rows[pivotRow]] = [rows[pivotRow], rows[selected]]
    const pivot = rows[pivotRow][column]
    for (let cell = 0; cell < columnCount; cell += 1) rows[pivotRow][cell] /= pivot

    for (let row = 0; row < rowCount; row += 1) {
      if (row === pivotRow) continue
      const factor = rows[row][column]
      if (Math.abs(factor) <= tolerance) continue
      for (let cell = 0; cell < columnCount; cell += 1) {
        rows[row][cell] -= factor * rows[pivotRow][cell]
        if (Math.abs(rows[row][cell]) <= tolerance) rows[row][cell] = 0
      }
    }

    pivotColumns.push(column)
    pivotRow += 1
  }

  const pivotSet = new Set(pivotColumns)
  const freeColumns = Array.from({ length:columnCount }, (_, index) => index)
    .filter(index => !pivotSet.has(index))

  return freeColumns.map(freeColumn => {
    const vector = Array(columnCount).fill(0)
    vector[freeColumn] = 1
    for (let row = pivotColumns.length - 1; row >= 0; row -= 1) {
      const pivotColumn = pivotColumns[row]
      let value = 0
      for (let column = pivotColumn + 1; column < columnCount; column += 1) {
        value += rows[row][column] * vector[column]
      }
      vector[pivotColumn] = -value
    }
    return vector
  })
}

function intersectSubspaces(a, b, tolerance) {
  if (!a.length || !b.length) return []
  const left = orthonormalize(a, tolerance)
  const right = orthonormalize(b, tolerance)
  if (!left.length || !right.length) return []

  const matrix = Array.from({ length:6 }, (_, row) => [
    ...left.map(vector => vector[row]),
    ...right.map(vector => -vector[row]),
  ])

  const kernel = nullspace(matrix, tolerance)
  const candidates = kernel.map(solution => {
    let vector = Array(6).fill(0)
    for (let index = 0; index < left.length; index += 1) {
      vector = add(vector, scale(left[index], solution[index]))
    }
    return vector
  })
  return orthonormalize(candidates, tolerance)
}

function orientationAxes(frame = {}) {
  const orientation = frame.orientationBrickLab ?? frame.orientation
  if (Array.isArray(orientation) && orientation.length === 9 && orientation.every(Number.isFinite)) {
    return [
      normalize3([orientation[0], orientation[3], orientation[6]], [1,0,0]),
      normalize3([orientation[1], orientation[4], orientation[7]], [0,1,0]),
      normalize3([orientation[2], orientation[5], orientation[8]], [0,0,1]),
    ]
  }

  const y = normalize3(frame.axis, [0,1,0])
  const seed = Math.abs(y[0]) < .8 ? [1,0,0] : [0,0,1]
  const z = normalize3(cross3(seed, y), [0,0,1])
  const x = normalize3(cross3(y, z), [1,0,0])
  return [x, y, z]
}

function referenceFrame(constraint) {
  const candidate =
    constraint?.referenceFrame ??
    constraint?.metadata?.referenceFrame ??
    constraint?.frameA ??
    {}
  const position =
    candidate.positionStud ??
    candidate.position ??
    candidate.positionLdu ??
    [0,0,0]
  return {
    position:Array.isArray(position) && position.length === 3 ? position.map(Number) : [0,0,0],
    axes:orientationAxes(candidate),
  }
}

function rotationTwist(position, axis) {
  return [...cross3(position, axis), ...axis]
}

function translationTwist(axis) {
  return [...axis, 0, 0, 0]
}

export function allowedTwistBasis(constraint) {
  const dof = constraint?.dof
  if (!dof) return []
  const { position, axes } = referenceFrame(constraint)
  const vectors = []

  for (const [index, key] of ['tx','ty','tz'].entries()) {
    if (!['free','limited','driven'].includes(dof[key]?.state)) continue
    vectors.push(translationTwist(axes[index]))
  }
  for (const [index, key] of ['rx','ry','rz'].entries()) {
    if (!['free','limited','driven'].includes(dof[key]?.state)) continue
    vectors.push(rotationTwist(position, axes[index]))
  }

  return orthonormalize(vectors)
}

function classifyBasis(basis, tolerance) {
  const dimension = basis.length
  if (dimension === 0) return 'fixed'
  if (dimension === 6) return 'free'
  if (dimension === 1) {
    const vector = basis[0]
    const linear = norm(vector.slice(0, 3))
    const angular = norm(vector.slice(3))
    if (angular <= tolerance && linear > tolerance) return 'prismatic'
    if (angular > tolerance) return 'revolute'
    return 'custom-1d'
  }
  if (dimension === 2) {
    const pureTranslations = basis.filter(vector => norm(vector.slice(3)) <= tolerance).length
    if (pureTranslations >= 1) return 'cylindrical-or-planar-2d'
    return 'custom-2d'
  }
  if (dimension === 3) return 'spherical-or-planar'
  return `custom-${dimension}d`
}

export function solveConstraintBundle(constraints = [], {
  tolerance = DEFAULT_TOLERANCE,
} = {}) {
  const eps = Math.max(DEFAULT_TOLERANCE, Math.abs(Number(tolerance) || 0))
  let remaining = Array.from({ length:6 }, (_, index) =>
    Array.from({ length:6 }, (_, column) => index === column ? 1 : 0))

  const steps = []
  for (const constraint of constraints.filter(Boolean)) {
    const allowed = allowedTwistBasis(constraint)
    remaining = intersectSubspaces(remaining, allowed, eps)
    steps.push(Object.freeze({
      constraintId:constraint.id ?? null,
      allowedDof:allowed.length,
      remainingDof:remaining.length,
    }))
    if (!remaining.length) break
  }

  const basis = Object.freeze(remaining.map(vector => Object.freeze(vector.map(value =>
    Math.abs(value) <= eps ? 0 : value))))
  return Object.freeze({
    valid:true,
    rigid:basis.length === 0,
    remainingDof:basis.length,
    kind:classifyBasis(basis, eps),
    basis,
    steps:Object.freeze(steps),
  })
}

export function groupConstraintsByBodyPair(constraints = []) {
  const groups = new Map()
  for (const constraint of constraints) {
    const bodyA = constraint?.bodyA
    const bodyB = constraint?.bodyB
    if (!bodyA || !bodyB || bodyA === bodyB) continue
    const key = [String(bodyA), String(bodyB)].sort().join('<>')
    const list = groups.get(key) || []
    list.push(constraint)
    groups.set(key, list)
  }
  return groups
}

export function solveBodyPairConstraintBundles(constraints = [], options = {}) {
  const result = []
  for (const [pairKey, bundle] of groupConstraintsByBodyPair(constraints)) {
    result.push(Object.freeze({
      pairKey,
      bodyIds:Object.freeze(pairKey.split('<>')),
      constraintIds:Object.freeze(bundle.map(item => item.id ?? null)),
      solution:solveConstraintBundle(bundle, options),
    }))
  }
  return Object.freeze(result)
}
