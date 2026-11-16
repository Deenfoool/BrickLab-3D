export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const subtract = (a, b) => a.map((value, i) => value - b[i])
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
export const scale = (vector, factor) => vector.map(value => value * factor)
export const length = vector => Math.hypot(...vector)
export const isVector = value => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite)

export function unit(vector) {
  if (!isVector(vector)) return null
  const size = length(vector)
  return size > 0 ? scale(vector, 1 / size) : null
}
