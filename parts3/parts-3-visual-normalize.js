import { PARTS } from '../parts.js'

export const PARTS3_VISUAL_NORMALIZE_VERSION = 'parts-3-visual-normalize-v1'

// PARTS-3 wheels are modeled with a TorusGeometry whose native normal is local Z.
// After rotating the torus to make the wheel axis world/local X, tyre width still
// belongs on the torus local Z scale. Normalize the generator output here so the
// tyre is widened along the axle instead of being stretched into an oval radius.
for (const part of PARTS) {
  const isParts3Wheel = Boolean(part.mechanics?.wheel) && (
    String(part.visual?.family ?? '').startsWith('tire-')
    || part.visualQuality === 'parts-3-tire-rim'
  )
  if (!isParts3Wheel || typeof part.create !== 'function' || part.__parts3WheelProfileNormalized) continue

  part.__parts3WheelProfileNormalized = true
  const create = part.create
  part.create = color => {
    const object = create(color)
    let corrected = false
    object.traverse?.(child => {
      if (corrected || child?.geometry?.type !== 'TorusGeometry') return
      const sx = Number(child.scale?.x) || 1
      const sz = Number(child.scale?.z) || 1
      if (Math.abs(sx - 1) < 1e-6 || Math.abs(sz - 1) > 1e-6) return
      child.scale.x = 1
      child.scale.z = sx
      corrected = true
    })
    object.userData.parts3WheelProfileNormalized = corrected
    return object
  }
}

globalThis.BrickLabParts3VisualNormalize = Object.freeze({ version: PARTS3_VISUAL_NORMALIZE_VERSION })
