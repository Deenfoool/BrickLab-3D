import * as THREE from 'three'
import { PARTS } from '../parts.js'
import { patchPart } from '../parts3/part-schema-v1.js'
import { REAL_TECHNIC_NOMINAL } from './nominal-dimension-fidelity-v1.js'

export const PARTS6_BENT_LIFTARM_FIDELITY_VERSION = 'parts-6-bent-liftarm-fidelity-v6'

const N = REAL_TECHNIC_NOMINAL
const DEPTH = 0.78

function absMaterial(color, roughness = 0.39) {
  return new THREE.MeshPhysicalMaterial({ color, roughness, metalness: 0.004, clearcoat: 0.030, clearcoatRoughness: 0.69, ior: 1.47 })
}
function shade(color, factor = 0.56) {
  return new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(factor), roughness: 0.74, metalness: 0.003, side: THREE.DoubleSide })
}
function root(id, color) {
  const group = new THREE.Group()
  group.userData.partId = id
  group.userData.color = color
  group.userData.visualVersion = PARTS6_BENT_LIFTARM_FIDELITY_VERSION
  return group
}
function visualOnly(object, feature) {
  object.userData.physicsIgnore = true
  object.userData.parts6VisualDetail = true
  object.userData.parts6BentLiftarmFeature = feature
  return object
}
function circleHole(x, y, radius) {
  const path = new THREE.Path()
  path.absarc(x, y, radius, 0, Math.PI * 2, true)
  return path
}

function rightAngleOutline(points) {
  const half = 0.45
  const innerFillet = 0.11
  const minY = Math.min(...points.map(([, y]) => y))
  const maxY = Math.max(...points.map(([, y]) => y))
  const baseline = points.filter(([, y]) => Math.abs(y - minY) < 1e-6)
  const minX = Math.min(...baseline.map(([x]) => x))
  const cornerX = Math.max(...points.map(([x]) => x))

  // The outline is a rounded union of one horizontal and one vertical liftarm
  // corridor. This avoids the blocky triangular/rectangular elbow used by older
  // procedural passes while keeping every connector centre unchanged.
  const shape = new THREE.Shape()
  shape.moveTo(minX, minY + half)
  shape.lineTo(cornerX - half - innerFillet, minY + half)
  shape.quadraticCurveTo(cornerX - half, minY + half, cornerX - half, minY + half + innerFillet)
  shape.lineTo(cornerX - half, maxY)

  // Rounded top cap around the last vertical hole.
  shape.quadraticCurveTo(cornerX - half, maxY + half, cornerX, maxY + half)
  shape.quadraticCurveTo(cornerX + half, maxY + half, cornerX + half, maxY)
  shape.lineTo(cornerX + half, minY)

  // Large outside elbow radius follows the corner hole instead of creating a
  // sharp ninety-degree molded edge.
  shape.quadraticCurveTo(cornerX + half, minY - half, cornerX, minY - half)
  shape.lineTo(minX, minY - half)

  // Rounded left end cap around the first horizontal hole.
  shape.quadraticCurveTo(minX - half, minY - half, minX - half, minY)
  shape.quadraticCurveTo(minX - half, minY + half, minX, minY + half)
  shape.closePath()

  for (const [x, y] of points) shape.holes.push(circleHole(x, y, N.pinHoleRadius))
  return shape
}

function addHoleFinish(group, x, y, color) {
  const liner = visualOnly(new THREE.Mesh(
    new THREE.CylinderGeometry(N.pinHoleRadius * 0.998, N.pinHoleRadius * 0.998, DEPTH + 0.012, 44, 1, true),
    shade(color, 0.52),
  ), 'bent-liftarm-bore-liner')
  liner.rotation.x = Math.PI / 2
  liner.position.set(x, y, 0)
  group.add(liner)

  const centerRadius = (N.pinCounterboreRadius + N.pinHoleRadius) / 2
  const tubeRadius = (N.pinCounterboreRadius - N.pinHoleRadius) / 2
  for (const side of [-1, 1]) {
    const ring = visualOnly(new THREE.Mesh(
      new THREE.TorusGeometry(centerRadius, tubeRadius, 8, 44),
      absMaterial(color, 0.44),
    ), 'bent-liftarm-counterbore')
    ring.position.set(x, y, side * (DEPTH / 2 + 0.004))
    group.add(ring)
  }
}

function createBentLiftarm(part, color) {
  const points = part.connectors
    .filter(item => item.type === 'pin-hole')
    .map(item => [item.position[0], item.position[1]])
  const group = root(part.id, color)
  const geometry = new THREE.ExtrudeGeometry(rightAngleOutline(points), {
    depth: DEPTH,
    bevelEnabled: true,
    bevelSegments: 4,
    bevelSize: 0.015,
    bevelThickness: 0.015,
    curveSegments: 40,
    steps: 1,
  })
  geometry.translate(0, 0, -DEPTH / 2)
  const body = new THREE.Mesh(geometry, absMaterial(color))
  body.userData.parts6BentLiftarmBody = true
  group.add(body)

  for (const [x, y] of points) addHoleFinish(group, x, y, color)

  // A very shallow face parting cue follows each straight leg. It is deliberately
  // inset from the edge and cannot become a floating decorative strip.
  const minY = Math.min(...points.map(([, y]) => y))
  const maxY = Math.max(...points.map(([, y]) => y))
  const baseline = points.filter(([, y]) => Math.abs(y - minY) < 1e-6)
  const minX = Math.min(...baseline.map(([x]) => x))
  const cornerX = Math.max(...points.map(([x]) => x))
  for (const side of [-1, 1]) {
    const horizontal = visualOnly(new THREE.Mesh(
      new THREE.BoxGeometry(Math.max(0.20, cornerX - minX - 1.05), 0.018, 0.010),
      shade(color, 0.88),
    ), 'bent-liftarm-face-parting-line')
    horizontal.position.set((minX + cornerX - 0.05) / 2, minY, side * (DEPTH / 2 + 0.006))
    group.add(horizontal)

    if (maxY - minY > 1.05) {
      const vertical = visualOnly(new THREE.Mesh(
        new THREE.BoxGeometry(0.018, Math.max(0.20, maxY - minY - 1.05), 0.010),
        shade(color, 0.88),
      ), 'bent-liftarm-face-parting-line')
      vertical.position.set(cornerX, (minY + maxY + 0.05) / 2, side * (DEPTH / 2 + 0.006))
      group.add(vertical)
    }
  }

  group.userData.bentLiftarmFidelity = {
    roundedOuterElbow: true,
    roundedEndCaps: true,
    truePinBores: points.length,
    depthStud: DEPTH,
  }
  return group
}

const upgraded = []
for (const id of ['beam-l-3x3', 'beam-angle-4x2']) {
  const part = PARTS.find(item => item.id === id)
  if (!part) continue
  patchPart(PARTS, id, {
    create: color => createBentLiftarm(part, color),
    visualQuality: 'parts-6-rounded-bent-liftarm-v6',
  })
  upgraded.push(id)
}

globalThis.BrickLabParts6BentLiftarmFidelity = Object.freeze({
  version: PARTS6_BENT_LIFTARM_FIDELITY_VERSION,
  upgraded,
  geometry: 'rounded end caps + rounded outer elbow + shallow inner fillet + true nominal bores',
  physics: 'PARTS-5 explicit bent-liftarm collider profiles remain authoritative and are not modified by this visual owner',
})

window.dispatchEvent(new CustomEvent('bricklab:partcatalogchange', {
  detail: { total: PARTS.length, pack: PARTS6_BENT_LIFTARM_FIDELITY_VERSION },
}))
