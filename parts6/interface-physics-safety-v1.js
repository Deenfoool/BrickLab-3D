import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { PARTS } from '../parts.js'
import { patchPart } from '../parts3/part-schema-v1.js'
import { PARTS6_INTERFACE_FIT_VERSION } from './interface-fit-refinement-v2.js'
import { REAL_TECHNIC_NOMINAL } from './nominal-dimension-fidelity-v1.js'

export const PARTS6_INTERFACE_PHYSICS_SAFETY_VERSION = 'parts-6-interface-physics-safety-v2'

const N = REAL_TECHNIC_NOMINAL

function markInterfaceTree(node, inherited = false) {
  const active = inherited || Boolean(node?.userData?.parts6InterfaceFeature)
  if (active && node?.isMesh) {
    node.userData.physicsIgnore = true
    node.userData.parts6InterfacePhysicsSafe = true
  }
  for (const child of node?.children ?? []) markInterfaceTree(child, active)
}

function hardenFineDetailTree(node, partId) {
  if (node?.userData?.parts6FineFeature && node?.isMesh) {
    node.userData.physicsIgnore = true
    node.userData.parts6FinePhysicsSafe = true

    // A bore shadow must be a liner, never a dark solid plug blocking the visible
    // Technic hole. Preserve the existing orientation/transform and only replace
    // the primitive geometry with an open-ended cylinder.
    if (node.userData.parts6FineFeature === 'pivot-bore-shadow') {
      node.geometry?.dispose?.()
      node.geometry = new THREE.CylinderGeometry(N.pinHoleRadius * 0.99, N.pinHoleRadius * 0.99, 0.34, 42, 1, true)
    }

    // Connector parting lines are intentionally hairline-thin surface marks. The
    // original decorative strip depth was too large and could visibly float outside
    // the molded connector body. Clamp it to a thin surface line per connector family.
    if (node.userData.parts6FineFeature === 'connector-parting-line') {
      node.geometry?.dispose?.()
      node.geometry = new RoundedBoxGeometry(0.70, 0.018, 0.018, 2, 0.006)
      node.position.z = partId === 'connector-triple' ? 0.398 : 0.505
    }
  }
  for (const child of node?.children ?? []) hardenFineDetailTree(child, partId)
}

const protectedParts = []
for (const part of PARTS) {
  if (part.interfaceFidelity !== PARTS6_INTERFACE_FIT_VERSION) continue
  const previous = part.create
  patchPart(PARTS, part.id, {
    create: color => {
      const object = previous(color)
      markInterfaceTree(object)
      hardenFineDetailTree(object, part.id)
      return object
    },
    interfacePhysicsSafety: PARTS6_INTERFACE_PHYSICS_SAFETY_VERSION,
  })
  protectedParts.push(part.id)
}

globalThis.BrickLabParts6InterfacePhysicsSafety = Object.freeze({
  version: PARTS6_INTERFACE_PHYSICS_SAFETY_VERSION,
  protectedParts,
  rule: 'interface and fine-detail meshes are collider-independent; bore shadows stay open and connector parting lines stay surface-thin',
})

window.dispatchEvent(new CustomEvent('bricklab:partcatalogchange', {
  detail: { total: PARTS.length, pack: PARTS6_INTERFACE_PHYSICS_SAFETY_VERSION },
}))
