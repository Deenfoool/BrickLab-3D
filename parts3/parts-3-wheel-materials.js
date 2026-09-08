import { PARTS } from '../parts.js'

export const PARTS3_WHEEL_MATERIAL_VERSION = 'parts-3-wheel-material-v1'

// part-visual-v3 predates the expanded wheel catalog and historically recognized
// rubber only on part id "wheel". Reassert tyre material semantics after that
// visual wrapper runs so every PARTS-3 tyre stays matte rubber instead of glossy
// dark plastic. The Torus tyre and tread blocks share the same material instance.
for (const part of PARTS) {
  if (!part.mechanics?.wheel || typeof part.create !== 'function' || part.__parts3RubberNormalized) continue
  part.__parts3RubberNormalized = true
  const create = part.create
  part.create = color => {
    const object = create(color)
    object.traverse?.(child => {
      if (child?.geometry?.type !== 'TorusGeometry') return
      const radius = Number(child.geometry?.parameters?.radius) || 0
      if (radius < 0.45) return
      const materials = Array.isArray(child.material) ? child.material : [child.material]
      for (const material of materials) {
        if (!material) continue
        material.roughness = Math.max(0.80, Number(material.roughness) || 0)
        material.metalness = 0
        if ('clearcoat' in material) material.clearcoat = 0
        if ('clearcoatRoughness' in material) material.clearcoatRoughness = 1
        material.envMapIntensity = Math.min(0.42, Number(material.envMapIntensity) || 0.42)
        material.needsUpdate = true
      }
    })
    return object
  }
}

globalThis.BrickLabParts3WheelMaterial = Object.freeze({ version: PARTS3_WHEEL_MATERIAL_VERSION })
