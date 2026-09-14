import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { PARTS } from '../parts.js'
import { patchPart } from '../parts3/part-schema-v1.js'
import { PARTS6_INTERFACE_FIT_VERSION } from './interface-fit-refinement-v2.js'
import { REAL_TECHNIC_NOMINAL } from './nominal-dimension-fidelity-v1.js'

export const PARTS6_INTERFACE_PHYSICS_SAFETY_VERSION = 'parts-6-interface-physics-safety-v3'
export const TECHNIC_COLLIDER_HOLE_CLEARANCE_STUD = 0.3125

const N = REAL_TECHNIC_NOMINAL
const AXES = ['x', 'y', 'z']
const AXIS_INDEX = { x: 0, y: 1, z: 2 }
const MIN_BOX = 0.035
const CARDINAL_MIN = 0.90
const OFF_AXIS_MAX = 0.18

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

function cardinalAxis(axis) {
  if (!Array.isArray(axis) || axis.length !== 3 || !axis.every(Number.isFinite)) return null
  const absolute = axis.map(value => Math.abs(value))
  let index = 0
  if (absolute[1] > absolute[index]) index = 1
  if (absolute[2] > absolute[index]) index = 2
  if (absolute[index] < CARDINAL_MIN) return null
  if (absolute.some((value, candidate) => candidate !== index && value > OFF_AXIS_MAX)) return null
  return AXES[index]
}

function pinHoleEvidence(part) {
  return (part?.connectors ?? [])
    .filter(connector => connector?.type === 'pin-hole')
    .map(connector => ({
      position: Array.isArray(connector.position) ? [...connector.position] : null,
      axis: cardinalAxis(connector.axis),
    }))
    .filter(hole => hole.axis && hole.position?.length === 3 && hole.position.every(Number.isFinite))
}

function boxRanges(spec) {
  if (spec?.type !== 'box' || !Array.isArray(spec.center) || !Array.isArray(spec.size)) return null
  if (spec.center.length !== 3 || spec.size.length !== 3) return null
  if (!spec.center.every(Number.isFinite) || !spec.size.every(value => Number.isFinite(value) && value > 0)) return null
  return Object.fromEntries(AXES.map((axis, index) => [
    axis,
    [spec.center[index] - spec.size[index] / 2, spec.center[index] + spec.size[index] / 2],
  ]))
}

function boxFromRanges(ranges) {
  const size = AXES.map(axis => ranges[axis][1] - ranges[axis][0])
  if (size.some(value => value < MIN_BOX)) return null
  return {
    type: 'box',
    center: AXES.map(axis => (ranges[axis][0] + ranges[axis][1]) / 2),
    size,
  }
}

function cloneRanges(ranges) {
  return Object.fromEntries(AXES.map(axis => [axis, [...ranges[axis]]]))
}

// PARTS-5 explicit hole proxies predate the current safe Technic clearance. Instead
// of throwing those carefully authored compound profiles away, subtract a conservative
// square tunnel around every verified pin-hole axis. The square is intentionally a
// little larger than the round 4.8 mm bore so Rapier never starts a valid snapped pin
// in penetration because of collider approximation.
export function carveExplicitBoxAroundPinHole(spec, hole, clearance = TECHNIC_COLLIDER_HOLE_CLEARANCE_STUD) {
  const ranges = boxRanges(spec)
  const holeAxis = hole?.axis
  const holePosition = hole?.position
  if (!ranges || !AXIS_INDEX.hasOwnProperty(holeAxis) || !Array.isArray(holePosition)) return [spec]

  const plane = AXES.filter(axis => axis !== holeAxis)
  const a = plane[0]
  const b = plane[1]
  const ai = AXIS_INDEX[a]
  const bi = AXIS_INDEX[b]
  const cutA = [holePosition[ai] - clearance, holePosition[ai] + clearance]
  const cutB = [holePosition[bi] - clearance, holePosition[bi] + clearance]
  const overlapA = [Math.max(ranges[a][0], cutA[0]), Math.min(ranges[a][1], cutA[1])]
  const overlapB = [Math.max(ranges[b][0], cutB[0]), Math.min(ranges[b][1], cutB[1])]
  if (overlapA[1] <= overlapA[0] || overlapB[1] <= overlapB[0]) return [spec]

  const pieces = []
  const push = candidate => {
    const box = boxFromRanges(candidate)
    if (box) pieces.push(box)
  }

  const lowA = cloneRanges(ranges)
  lowA[a] = [ranges[a][0], overlapA[0]]
  push(lowA)
  const highA = cloneRanges(ranges)
  highA[a] = [overlapA[1], ranges[a][1]]
  push(highA)

  const lowB = cloneRanges(ranges)
  lowB[a] = [...overlapA]
  lowB[b] = [ranges[b][0], overlapB[0]]
  push(lowB)
  const highB = cloneRanges(ranges)
  highB[a] = [...overlapA]
  highB[b] = [overlapB[1], ranges[b][1]]
  push(highB)

  return pieces
}

export function hardenExplicitPinHoleCollider(part) {
  const profile = part?.physics?.colliderProfile
  const sourceVersion = String(profile?.version ?? '')
  if (!profile || !Array.isArray(profile.specs) || !profile.specs.length) return false
  if (!sourceVersion.startsWith('parts-5-explicit-v1')) return false
  // Suspension has a deliberate physical pivot pin through its root eye; keep that
  // specialized profile untouched rather than turning the pivot itself into air.
  if (part?.mechanics?.suspensionArm) return false

  const holes = pinHoleEvidence(part)
  if (!holes.length) return false

  let specs = profile.specs.map(spec => ({ ...spec, center: Array.isArray(spec.center) ? [...spec.center] : spec.center, size: Array.isArray(spec.size) ? [...spec.size] : spec.size }))
  for (const hole of holes) {
    specs = specs.flatMap(spec => spec?.type === 'box'
      ? carveExplicitBoxAroundPinHole(spec, hole)
      : [spec])
  }
  if (!specs.length) return false

  part.physics = {
    ...(part.physics ?? {}),
    colliderProfile: {
      ...profile,
      version: 'parts-6-explicit-hole-clearance-v1',
      sourceVersion,
      holeClearanceStud: TECHNIC_COLLIDER_HOLE_CLEARANCE_STUD,
      specs,
    },
  }
  return true
}

const hardenedColliderParts = []
for (const part of PARTS) {
  if (hardenExplicitPinHoleCollider(part)) hardenedColliderParts.push(part.id)
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
  hardenedColliderParts,
  technicHoleClearanceStud: TECHNIC_COLLIDER_HOLE_CLEARANCE_STUD,
  rule: 'interface/fine-detail meshes stay collider-independent and legacy explicit pin-hole boxes are carved to the same safe Technic clearance used by generic colliders',
})

window.dispatchEvent(new CustomEvent('bricklab:partcatalogchange', {
  detail: { total: PARTS.length, pack: PARTS6_INTERFACE_PHYSICS_SAFETY_VERSION },
}))
