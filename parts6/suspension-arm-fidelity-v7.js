import * as THREE from 'three'
import { PARTS } from '../parts.js'
import { patchPart } from '../parts3/part-schema-v1.js'
import { REAL_TECHNIC_NOMINAL } from './nominal-dimension-fidelity-v1.js'

export const PARTS6_SUSPENSION_ARM_FIDELITY_VERSION = 'parts-6-suspension-arm-fidelity-v7'

const N = REAL_TECHNIC_NOMINAL
const DEPTH = 0.70
const Z_AXIS = new THREE.Vector3(0, 0, 1)

function absMaterial(color, roughness = 0.41) {
  return new THREE.MeshPhysicalMaterial({ color, roughness, metalness: 0.004, clearcoat: 0.028, clearcoatRoughness: 0.70, ior: 1.47 })
}
function darkMaterial() {
  return new THREE.MeshStandardMaterial({ color: 0x14171a, roughness: 0.88, metalness: 0.010, side: THREE.DoubleSide })
}
function metalMaterial() {
  return new THREE.MeshStandardMaterial({ color: 0xaeb6bd, roughness: 0.34, metalness: 0.70 })
}
function visualOnly(object, feature) {
  object.userData.physicsIgnore = true
  object.userData.parts6VisualDetail = true
  object.userData.parts6SuspensionArmFeature = feature
  return object
}
function circleHole(x, y, radius) {
  const path = new THREE.Path()
  path.absarc(x, y, radius, 0, Math.PI * 2, true)
  return path
}
function annulus(outer, inner) {
  const shape = new THREE.Shape()
  shape.absarc(0, 0, outer, 0, Math.PI * 2, false)
  shape.holes.push(circleHole(0, 0, inner))
  return shape
}
function extrude(shape, depth, material, options = {}) {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: options.bevelEnabled ?? true,
    bevelSegments: options.bevelSegments ?? 4,
    bevelSize: options.bevelSize ?? 0.014,
    bevelThickness: options.bevelThickness ?? 0.014,
    curveSegments: options.curveSegments ?? 40,
    steps: 1,
  })
  geometry.translate(0, 0, -depth / 2)
  return new THREE.Mesh(geometry, material)
}

function armOutline(holeXs, y) {
  const first = Math.min(...holeXs)
  const last = Math.max(...holeXs)
  const halfEnd = 0.43
  const waist = 0.31
  const shape = new THREE.Shape()

  shape.moveTo(first, y + halfEnd)
  for (let i = 0; i < holeXs.length - 1; i += 1) {
    const a = holeXs[i]
    const b = holeXs[i + 1]
    shape.quadraticCurveTo((a + b) / 2, y + waist, b, y + halfEnd)
  }
  shape.quadraticCurveTo(last + halfEnd, y + halfEnd, last + halfEnd, y)
  shape.quadraticCurveTo(last + halfEnd, y - halfEnd, last, y - halfEnd)
  for (let i = holeXs.length - 1; i > 0; i -= 1) {
    const a = holeXs[i]
    const b = holeXs[i - 1]
    shape.quadraticCurveTo((a + b) / 2, y - waist, b, y - halfEnd)
  }
  shape.quadraticCurveTo(first - halfEnd, y - halfEnd, first - halfEnd, y)
  shape.quadraticCurveTo(first - halfEnd, y + halfEnd, first, y + halfEnd)
  shape.closePath()

  for (const x of holeXs) shape.holes.push(circleHole(x, y, N.pinHoleRadius))
  return shape
}

function addBoreFinish(group, x, y, color) {
  const liner = visualOnly(new THREE.Mesh(
    new THREE.CylinderGeometry(N.pinHoleRadius * 0.998, N.pinHoleRadius * 0.998, DEPTH + 0.012, 44, 1, true),
    darkMaterial(),
  ), 'suspension-arm-bore-liner')
  liner.rotation.x = Math.PI / 2
  liner.position.set(x, y, 0)
  group.add(liner)

  const centerRadius = (N.pinCounterboreRadius + N.pinHoleRadius) / 2
  const tubeRadius = (N.pinCounterboreRadius - N.pinHoleRadius) / 2
  for (const side of [-1, 1]) {
    const ring = visualOnly(new THREE.Mesh(
      new THREE.TorusGeometry(centerRadius, tubeRadius, 8, 44),
      absMaterial(color, 0.47),
    ), 'suspension-arm-counterbore')
    ring.position.set(x, y, side * (DEPTH / 2 + 0.004))
    group.add(ring)
  }
}

function createSuspensionArm(part, color) {
  const group = new THREE.Group()
  group.userData.partId = part.id
  group.userData.color = color
  group.userData.visualVersion = PARTS6_SUSPENSION_ARM_FIDELITY_VERSION

  const holes = part.connectors.filter(item => item.type === 'pin-hole').sort((a, b) => a.position[0] - b.position[0])
  const holeXs = holes.map(item => item.position[0])
  const y = holes[0]?.position?.[1] ?? 0.45
  const material = absMaterial(color)

  const body = extrude(armOutline(holeXs, y), DEPTH, material)
  body.userData.parts6SuspensionArmBody = true
  group.add(body)
  for (const x of holeXs) addBoreFinish(group, x, y, color)

  const pivot = part.connectors.find(item => item.id === 'pivot')
  if (pivot) {
    const pivotCenter = new THREE.Vector3(...pivot.position)
    const pivotShell = new THREE.Mesh(new THREE.CylinderGeometry(0.355, 0.385, 0.96, 44), material)
    pivotShell.rotation.x = Math.PI / 2
    pivotShell.position.copy(pivotCenter)
    group.add(pivotShell)

    const pivotPin = new THREE.Mesh(new THREE.CylinderGeometry(N.pinBodyRadius, N.pinBodyRadius, 1.10, 40), metalMaterial())
    pivotPin.rotation.x = Math.PI / 2
    pivotPin.position.copy(pivotCenter)
    group.add(pivotPin)

    // Tapered neck joins the pivot boss to the first bored eye. Two overlapping
    // rounded webs create a forged/molded transition instead of a rectangular rail.
    const firstEyeX = holeXs[0]
    const span = Math.max(0.30, firstEyeX - pivot.position[0])
    for (const z of [-0.19, 0.19]) {
      const neck = new THREE.Mesh(new THREE.BufferGeometry(), material)
      const x0 = pivot.position[0] + 0.20
      const x1 = firstEyeX - 0.20
      const half0 = 0.25
      const half1 = 0.31
      const positions = new Float32Array([
        x0, y - half0, z - 0.12, x0, y + half0, z - 0.12, x1, y + half1, z - 0.12, x1, y - half1, z - 0.12,
        x0, y - half0, z + 0.12, x0, y + half0, z + 0.12, x1, y + half1, z + 0.12, x1, y - half1, z + 0.12,
      ])
      const indices = [
        0,1,2, 0,2,3, 4,6,5, 4,7,6,
        0,4,5, 0,5,1, 1,5,6, 1,6,2,
        2,6,7, 2,7,3, 3,7,4, 3,4,0,
      ]
      neck.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      neck.geometry.setIndex(indices)
      neck.geometry.computeVertexNormals()
      neck.userData.parts6SuspensionArmNeck = span
      group.add(neck)
    }

    for (const side of [-1, 1]) {
      const retainer = visualOnly(new THREE.Mesh(new THREE.TorusGeometry(N.pinBodyRadius + 0.050, 0.020, 8, 42), metalMaterial()), 'suspension-pivot-retaining-washer')
      retainer.position.copy(pivotCenter).addScaledVector(Z_AXIS, side * 0.50)
      group.add(retainer)
    }
  }

  // True shallow lightening pockets are inset inside the molded beam face. They
  // are dark visual recesses rather than boxes floating outside the arm silhouette.
  for (let i = 0; i < holeXs.length - 1; i += 1) {
    const a = holeXs[i]
    const b = holeXs[i + 1]
    const pocketLength = Math.max(0.16, b - a - 0.58)
    for (const side of [-1, 1]) {
      const pocket = visualOnly(new THREE.Mesh(
        new THREE.PlaneGeometry(pocketLength, 0.26),
        darkMaterial(),
      ), 'suspension-arm-face-pocket')
      pocket.position.set((a + b) / 2, y, side * (DEPTH / 2 + 0.006))
      if (side < 0) pocket.rotation.y = Math.PI
      group.add(pocket)
    }
  }

  group.userData.suspensionArmFidelity = {
    taperedWaist: true,
    pivotBoss: true,
    boredEyes: holeXs.length,
    facePockets: Math.max(0, holeXs.length - 1),
  }
  return group
}

const part = PARTS.find(item => item.id === 'suspension-arm-5')
const upgraded = []
if (part) {
  patchPart(PARTS, part.id, {
    create: color => createSuspensionArm(part, color),
    visualQuality: 'parts-6-tapered-suspension-arm-v7',
  })
  upgraded.push(part.id)
}

globalThis.BrickLabParts6SuspensionArmFidelity = Object.freeze({
  version: PARTS6_SUSPENSION_ARM_FIDELITY_VERSION,
  upgraded,
  geometry: 'waisted bored control-arm beam + molded pivot boss + tapered neck + inset face pockets',
  physics: 'PARTS-5 explicit suspension-arm compound collider and PARTS-4/vehicle suspension mechanics remain authoritative',
})

window.dispatchEvent(new CustomEvent('bricklab:partcatalogchange', {
  detail: { total: PARTS.length, pack: PARTS6_SUSPENSION_ARM_FIDELITY_VERSION },
}))
