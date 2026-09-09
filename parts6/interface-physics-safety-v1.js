import { PARTS } from '../parts.js'
import { patchPart } from '../parts3/part-schema-v1.js'
import { PARTS6_INTERFACE_FIT_VERSION } from './interface-fit-refinement-v2.js'

export const PARTS6_INTERFACE_PHYSICS_SAFETY_VERSION = 'parts-6-interface-physics-safety-v1'

function markInterfaceTree(node, inherited = false) {
  const active = inherited || Boolean(node?.userData?.parts6InterfaceFeature)
  if (active && node?.isMesh) {
    node.userData.physicsIgnore = true
    node.userData.parts6InterfacePhysicsSafe = true
  }
  for (const child of node?.children ?? []) markInterfaceTree(child, active)
}

const protectedParts = []
for (const part of PARTS) {
  if (part.interfaceFidelity !== PARTS6_INTERFACE_FIT_VERSION) continue
  const previous = part.create
  patchPart(PARTS, part.id, {
    create: color => {
      const object = previous(color)
      markInterfaceTree(object)
      return object
    },
    interfacePhysicsSafety: PARTS6_INTERFACE_PHYSICS_SAFETY_VERSION,
  })
  protectedParts.push(part.id)
}

globalThis.BrickLabParts6InterfacePhysicsSafety = Object.freeze({
  version: PARTS6_INTERFACE_PHYSICS_SAFETY_VERSION,
  protectedParts,
  rule: 'every mesh descended from a PARTS-6 interface-detail group is excluded from bounds-derived colliders',
})

window.dispatchEvent(new CustomEvent('bricklab:partcatalogchange', {
  detail: { total: PARTS.length, pack: PARTS6_INTERFACE_PHYSICS_SAFETY_VERSION },
}))
