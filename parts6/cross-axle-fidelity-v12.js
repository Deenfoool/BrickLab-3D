import * as THREE from 'three'
import { PARTS } from '../parts.js'
import { patchPart } from '../parts3/part-schema-v1.js'
import { REAL_TECHNIC_NOMINAL } from './nominal-dimension-fidelity-v1.js'

export const PARTS6_CROSS_AXLE_FIDELITY_VERSION = 'parts-6-cross-axle-fidelity-v12'

const N = REAL_TECHNIC_NOMINAL

function pomMaterial(color, roughness = 0.42) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.004 })
}
function visualOnly(object, feature) {
  object.userData.physicsIgnore = true
  object.userData.parts6VisualDetail = true
  object.userData.parts6CrossAxleFeature = feature
  return object
}
function root(id, color) {
  const group = new THREE.Group()
  group.userData.partId = id
  group.userData.color = color
  group.userData.visualVersion = PARTS6_CROSS_AXLE_FIDELITY_VERSION
  return group
}

// Molded Technic-style cross section. The outer tips keep the measured nominal
// 4.78 mm envelope while tiny 45-degree root chamfers avoid the primitive look of
// two intersecting rounded boxes and read much closer to a real keyed axle.
function moldedCrossShape(radius = N.axleTipRadius, arm = N.axleArmHalfWidth) {
  const rootChamfer = Math.min(0.025, Math.max(0.010, (radius - arm) * 0.18))
  const tipChamfer = Math.min(0.018, arm * 0.18)
  const points = [
    [-arm + tipChamfer, radius], [arm - tipChamfer, radius], [arm, radius - tipChamfer],
    [arm, arm + rootChamfer], [arm + rootChamfer, arm], [radius - tipChamfer, arm],
    [radius, arm - tipChamfer], [radius, -arm + tipChamfer], [radius - tipChamfer, -arm],
    [arm + rootChamfer, -arm], [arm, -arm - rootChamfer], [arm, -radius + tipChamfer],
    [arm - tipChamfer, -radius], [-arm + tipChamfer, -radius], [-arm, -radius + tipChamfer],
    [-arm, -arm - rootChamfer], [-arm - rootChamfer, -arm], [-radius + tipChamfer, -arm],
    [-radius, -arm + tipChamfer], [-radius, arm - tipChamfer], [-radius + tipChamfer, arm],
    [-arm - rootChamfer, arm], [-arm, arm + rootChamfer], [-arm, radius - tipChamfer],
  ]
  const shape = new THREE.Shape()
  shape.moveTo(...points[0])
  for (let i = 1; i < points.length; i += 1) shape.lineTo(...points[i])
  shape.closePath()
  return shape
}

function extrudeAlongX(shape, length, material) {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: length,
    bevelEnabled: true,
    bevelSegments: 3,
    bevelSize: 0.010,
    bevelThickness: 0.016,
    curveSegments: 1,
    steps: 1,
  })
  geometry.translate(0, 0, -length / 2)
  geometry.rotateY(Math.PI / 2)
  geometry.computeVertexNormals()
  return new THREE.Mesh(geometry, material)
}

function legacyProxy(previousFactory, color) {
  const proxy = previousFactory(color)
  proxy.visible = false
  proxy.name = 'parts6-v12-legacy-axle-collider-proxy'
  proxy.userData.parts6LegacyAxleColliderProxy = PARTS6_CROSS_AXLE_FIDELITY_VERSION
  proxy.traverse(child => {
    if (child.isMesh) child.raycast = () => {}
  })
  return proxy
}

function axleLength(part) {
  const fromDimensions = Number(part.dimensions?.lengthStud)
  if (Number.isFinite(fromDimensions) && fromDimensions > 0) return fromDimensions
  const fromId = Number(part.id.match(/^axle-(\d+)$/)?.[1])
  if (Number.isFinite(fromId) && fromId > 0) return fromId
  const xs = (part.connectors ?? []).filter(item => item.type === 'axle').map(item => item.position?.[0]).filter(Number.isFinite)
  if (xs.length > 1) return Math.max(...xs) - Math.min(...xs) + 1
  return 3
}

function createAxle(part, color, previousFactory) {
  const group = root(part.id, color)
  group.add(legacyProxy(previousFactory, color))
  const material = pomMaterial(color)
  const nominalLength = axleLength(part)
  const bodyLength = Math.max(0.30, nominalLength - 0.08)

  const shaft = visualOnly(extrudeAlongX(moldedCrossShape(), bodyLength, material), 'cross-axle-molded-shaft')
  shaft.position.y = 0.32
  group.add(shaft)

  // Injection gate witnesses sit flush with each end face. The tiny discs are not
  // structural and are excluded from collision/picking envelopes.
  for (const side of [-1, 1]) {
    const gate = visualOnly(new THREE.Mesh(
      new THREE.CircleGeometry(Math.min(0.038, N.axleArmHalfWidth * 0.34), 18),
      pomMaterial(new THREE.Color(color).multiplyScalar(0.74), 0.49),
    ), 'cross-axle-end-gate-witness')
    gate.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2
    gate.position.set(side * (bodyLength / 2 + 0.002), 0.32, 0)
    group.add(gate)
  }

  // Four hairline mold seams run in the valleys between lobes. They are deliberately
  // shallow and same-family material cues rather than raised rails.
  const seamMaterial = pomMaterial(new THREE.Color(color).multiplyScalar(0.82), 0.50)
  for (const [y, z] of [
    [N.axleArmHalfWidth * 0.95, N.axleArmHalfWidth * 0.95],
    [N.axleArmHalfWidth * 0.95, -N.axleArmHalfWidth * 0.95],
    [-N.axleArmHalfWidth * 0.95, N.axleArmHalfWidth * 0.95],
    [-N.axleArmHalfWidth * 0.95, -N.axleArmHalfWidth * 0.95],
  ]) {
    const seam = visualOnly(new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, bodyLength * 0.90, 6), seamMaterial), 'cross-axle-longitudinal-mold-seam')
    seam.rotation.z = Math.PI / 2
    seam.position.set(0, 0.32 + y, z)
    group.add(seam)
  }

  group.userData.crossAxleFidelity = {
    moldedCrossSection: true,
    nominalTipWidthMm: N.axleTipRadius * 2 * N.studMm,
    rootChamfered: true,
    endChamfered: true,
    lengthStud: nominalLength,
  }
  return group
}

const upgraded = []
for (const part of PARTS.filter(item => /^axle-\d+$/.test(item.id))) {
  if (typeof part.create !== 'function') continue
  const previous = part.create
  patchPart(PARTS, part.id, {
    create: color => createAxle(part, color, previous),
    visualQuality: 'parts-6-true-molded-cross-axle-v12',
  })
  upgraded.push(part.id)
}

globalThis.BrickLabParts6CrossAxleFidelity = Object.freeze({
  version: PARTS6_CROSS_AXLE_FIDELITY_VERSION,
  upgraded,
  nominalTipWidthMm: N.axleTipRadius * 2 * N.studMm,
  geometry: 'single extruded measured cross section with molded root/tip chamfers, end gate witness and subtle longitudinal mold seams',
  physics: 'pre-v12 axle factory remains invisible as the non-ignored collider/bounds source; existing nominal explicit cylinder-x axle proxy remains authoritative and all new visible v12 geometry is physicsIgnore',
})

window.dispatchEvent(new CustomEvent('bricklab:partcatalogchange', {
  detail: { total: PARTS.length, pack: PARTS6_CROSS_AXLE_FIDELITY_VERSION },
}))
