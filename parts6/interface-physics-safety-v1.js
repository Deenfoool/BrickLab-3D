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

function replaceRoundedBox(node, width, height, depth, radius) {
  node.geometry?.dispose?.()
  node.geometry = new RoundedBoxGeometry(width, height, depth, 3, Math.min(radius, width / 3, height / 3, depth / 3))
}

function hardenFineDetailTree(node, partId) {
  if (node?.userData?.parts6FineFeature && node?.isMesh) {
    node.userData.physicsIgnore = true
    node.userData.parts6FinePhysicsSafe = true

    if (node.userData.parts6FineFeature === 'pivot-bore-shadow') {
      node.geometry?.dispose?.()
      node.geometry = new THREE.CylinderGeometry(N.pinHoleRadius * 0.99, N.pinHoleRadius * 0.99, 0.34, 42, 1, true)
    }

    if (node.userData.parts6FineFeature === 'suspension-arm-lightening-recess') {
      replaceRoundedBox(node, 3.10, 0.24, 0.018, 0.006)
    }
    if (node.userData.parts6FineFeature === 'motor-rear-vent') {
      replaceRoundedBox(node, 0.018, 0.075, 0.24, 0.006)
    }
    if (node.userData.parts6FineFeature === 'worm-wheel-web') {
      replaceRoundedBox(node, 0.035, 0.095, 0.34, 0.010)
    }

    if (node.userData.parts6FineFeature === 'connector-parting-line') {
      replaceRoundedBox(node, 0.70, 0.018, 0.018, 0.006)
      node.position.z = partId === 'connector-triple' ? 0.398 : 0.505
    }
  }
  for (const child of node?.children ?? []) hardenFineDetailTree(child, partId)
}

function hardenHeroMicroDetailTree(node) {
  if (node?.userData?.parts6HeroMicroFeature && node?.isMesh) {
    node.userData.physicsIgnore = true
    node.userData.parts6HeroMicroPhysicsSafe = true

    // Close-range recess cues must remain geometrically well-conditioned even on
    // very small parts. Clamp the CV window edge radius to the thin local section.
    if (node.userData.parts6HeroMicroFeature === 'cv-cage-window-shadow') {
      replaceRoundedBox(node, 0.030, 0.085, 0.155, 0.008)
    }
  }
  for (const child of node?.children ?? []) hardenHeroMicroDetailTree(child)
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
      hardenHeroMicroDetailTree(object)
      return object
    },
    interfacePhysicsSafety: PARTS6_INTERFACE_PHYSICS_SAFETY_VERSION,
  })
  protectedParts.push(part.id)
}

globalThis.BrickLabParts6InterfacePhysicsSafety = Object.freeze({
  version: PARTS6_INTERFACE_PHYSICS_SAFETY_VERSION,
  protectedParts,
  rule: 'interface, fine-detail and hero micro-detail meshes are collider-independent; bore shadows stay open and thin rounded details remain geometrically bounded',
})

window.dispatchEvent(new CustomEvent('bricklab:partcatalogchange', {
  detail: { total: PARTS.length, pack: PARTS6_INTERFACE_PHYSICS_SAFETY_VERSION },
}))
