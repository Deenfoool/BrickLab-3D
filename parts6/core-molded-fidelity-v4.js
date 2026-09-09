import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { PARTS } from '../parts.js'
import { patchPart } from '../parts3/part-schema-v1.js'
import { REAL_TECHNIC_NOMINAL } from './nominal-dimension-fidelity-v1.js'
import { gearMetrics } from '../parts5/part-geometry-metrics-v1.js'

export const PARTS6_CORE_MOLDED_FIDELITY_VERSION = 'parts-6-core-molded-fidelity-v4'

const N = REAL_TECHNIC_NOMINAL
const X_AXIS = new THREE.Vector3(1, 0, 0)
const Y_AXIS = new THREE.Vector3(0, 1, 0)
const Z_AXIS = new THREE.Vector3(0, 0, 1)

function absMaterial(color, roughness = 0.39) {
  return new THREE.MeshPhysicalMaterial({ color, roughness, metalness: 0.004, clearcoat: 0.030, clearcoatRoughness: 0.69, ior: 1.47 })
}
function pomMaterial(color, roughness = 0.43) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.004 })
}
function shade(color, factor = 0.56) {
  return new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(factor), roughness: 0.73, metalness: 0.003 })
}
function root(id, color) {
  const group = new THREE.Group()
  group.userData.partId = id
  group.userData.color = color
  group.userData.visualVersion = PARTS6_CORE_MOLDED_FIDELITY_VERSION
  return group
}
function visualOnly(object, feature) {
  object.userData.physicsIgnore = true
  object.userData.parts6VisualDetail = true
  object.userData.parts6CoreFeature = feature
  return object
}
function circleHole(radius) {
  const path = new THREE.Path()
  path.absarc(0, 0, radius, 0, Math.PI * 2, true)
  return path
}
function annulusShape(outer, inner) {
  const shape = new THREE.Shape()
  shape.absarc(0, 0, outer, 0, Math.PI * 2, false)
  shape.holes.push(circleHole(inner))
  return shape
}
function extrudeCentered(shape, depth, material, options = {}) {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: options.bevelEnabled ?? true,
    bevelSegments: options.bevelSegments ?? 3,
    bevelSize: options.bevelSize ?? 0.006,
    bevelThickness: options.bevelThickness ?? 0.006,
    curveSegments: options.curveSegments ?? 40,
    steps: 1,
  })
  geometry.translate(0, 0, -depth / 2)
  return new THREE.Mesh(geometry, material)
}
function extrudeAlongY(shape, depth, material, options = {}) {
  const mesh = extrudeCentered(shape, depth, material, options)
  mesh.rotation.x = Math.PI / 2
  return mesh
}
function orientCylinderZ(mesh) {
  mesh.rotation.x = Math.PI / 2
  return mesh
}

function pinLobeGeometry(radiusTop, radiusBottom, length, thetaStart, thetaLength) {
  const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, length, 28, 1, false, thetaStart, thetaLength)
  geometry.rotateX(Math.PI / 2)
  return geometry
}

function addSplitPinHalf(group, side, length, material, friction) {
  const half = length / 2
  const collarHalf = Math.min(0.075, half * 0.17)
  const tipLength = Math.min(0.20, Math.max(0.10, half * 0.32))
  const shaftLength = Math.max(0.10, half - collarHalf - tipLength)
  const lobeArc = Math.PI * 0.80
  const gapStart = Math.PI * 0.10
  const shaftCenter = side * (collarHalf + shaftLength / 2)
  const tipCenter = side * (half - tipLength / 2)

  for (const offset of [0, Math.PI]) {
    const shaft = new THREE.Mesh(
      pinLobeGeometry(N.pinBodyRadius, N.pinBodyRadius, shaftLength + 0.012, gapStart + offset, lobeArc),
      material,
    )
    shaft.position.set(0, 0.28, shaftCenter)
    group.add(shaft)

    const tip = new THREE.Mesh(
      pinLobeGeometry(N.pinBodyRadius * 0.86, N.pinBodyRadius, tipLength, gapStart + offset, lobeArc),
      material,
    )
    tip.position.set(0, 0.28, tipCenter)
    group.add(tip)
  }

  // The actual open split is intentionally geometry, not a black rectangle painted
  // on top of a solid cylinder. A shallow inner shadow only makes the cavity readable.
  const slot = visualOnly(new THREE.Mesh(
    new RoundedBoxGeometry(N.pinBodyRadius * 1.55, 0.020, Math.max(0.12, shaftLength + tipLength * 0.72), 2, 0.006),
    shade(0x2b2d31, 0.30),
  ), 'pin-elastic-slot-shadow')
  slot.position.set(0, 0.28, side * (collarHalf + (shaftLength + tipLength * 0.65) / 2))
  group.add(slot)

  if (friction) {
    const z = side * Math.min(half * 0.62, Math.max(0.17, half - tipLength * 0.80))
    const arc = Math.PI * 0.76
    for (const offset of [Math.PI * 0.12, Math.PI * 1.12]) {
      const ridge = visualOnly(new THREE.Mesh(
        new THREE.TorusGeometry(N.pinFrictionRadius, 0.018, 7, 28, arc),
        material,
      ), 'pin-friction-ridge-arc')
      ridge.rotation.z = offset
      ridge.position.set(0, 0.28, z)
      group.add(ridge)
    }
  }
}

function createSplitPin(part, color, length, friction) {
  const group = root(part.id, color)
  const material = pomMaterial(color)
  const collarRadius = friction ? N.pinCounterboreRadius * 0.92 : N.pinCounterboreRadius * 0.84
  const collarLength = Math.min(0.15, Math.max(0.10, length * 0.08))
  const collar = orientCylinderZ(new THREE.Mesh(
    new THREE.CylinderGeometry(collarRadius, collarRadius, collarLength, 44),
    material,
  ))
  collar.position.y = 0.28
  group.add(collar)

  const neck = orientCylinderZ(new THREE.Mesh(
    new THREE.CylinderGeometry(N.pinBodyRadius, N.pinBodyRadius, Math.min(0.24, length * 0.18), 40),
    material,
  ))
  neck.position.y = 0.28
  group.add(neck)

  addSplitPinHalf(group, -1, length, material, friction)
  addSplitPinHalf(group, 1, length, material, friction)

  for (const side of [-1, 1]) {
    const witness = visualOnly(new THREE.Mesh(new THREE.CircleGeometry(N.pinBodyRadius * 0.38, 20), shade(color, 0.70)), 'pin-end-mold-witness')
    witness.position.set(0, 0.28, side * (length / 2 + 0.002))
    if (side < 0) witness.rotation.y = Math.PI
    group.add(witness)
  }

  group.userData.pinFidelity = {
    splitEnds: true,
    friction,
    nominalBodyDiameterStud: N.pinBodyRadius * 2,
    nominalFrictionDiameterStud: N.pinFrictionRadius * 2,
  }
  return group
}

function wrapPart(id, decorate, quality) {
  const part = PARTS.find(item => item.id === id)
  if (!part || typeof part.create !== 'function') return false
  const previous = part.create
  patchPart(PARTS, id, {
    create: color => {
      const object = previous(color)
      decorate(object, part, color)
      object.userData.visualVersion = PARTS6_CORE_MOLDED_FIDELITY_VERSION
      object.userData.parts6CoreMoldedFidelity = true
      return object
    },
    visualQuality: quality,
  })
  return true
}

function addTechnicBrickUnderside(group, part, color) {
  const material = absMaterial(color, 0.44)
  const tubePorts = part.connectors.filter(item => item.type === 'tube')
  for (const port of tubePorts) {
    const tube = visualOnly(extrudeAlongY(
      annulusShape(0.285, 0.185),
      0.18,
      material,
      { bevelSegments: 2, bevelSize: 0.005, bevelThickness: 0.005 },
    ), 'technic-brick-underside-tube')
    tube.position.fromArray(port.position)
    tube.position.y += 0.10
    group.add(tube)
  }

  const xs = tubePorts.map(port => port.position[0]).sort((a, b) => a - b)
  for (let i = 0; i < xs.length - 1; i += 1) {
    const bridge = visualOnly(new THREE.Mesh(
      new RoundedBoxGeometry(Math.max(0.08, xs[i + 1] - xs[i] - 0.34), 0.10, 0.10, 2, 0.024),
      material,
    ), 'technic-brick-underside-bridge')
    bridge.position.set((xs[i] + xs[i + 1]) / 2, 0.12, 0)
    group.add(bridge)
  }
}

function addLiftarmMoldFinish(group, part, color) {
  const holes = part.connectors.filter(item => item.type === 'pin-hole')
  if (holes.length < 3) return
  const minX = Math.min(...holes.map(item => item.position[0]))
  const maxX = Math.max(...holes.map(item => item.position[0]))
  const y = holes.reduce((sum, item) => sum + item.position[1], 0) / holes.length
  if (Math.abs(maxX - minX) < 1.2) return
  for (const side of [-1, 1]) {
    const lane = visualOnly(new THREE.Mesh(
      new RoundedBoxGeometry(Math.max(0.20, maxX - minX - 1.25), 0.028, 0.010, 2, 0.004),
      shade(color, 0.88),
    ), 'liftarm-face-mold-lane')
    lane.position.set((minX + maxX) / 2, y, side * 0.397)
    group.add(lane)
  }
}

function addAxleEndFinish(group, part, color) {
  const length = Math.max(0.5, Number(part.dimensions?.lengthStud) || Number(part.id.match(/(\d+)$/)?.[1]) || 3)
  const bodyLength = Math.max(0.30, length - 0.08)
  const material = pomMaterial(color, 0.46)
  const diameter = N.axleTipRadius * 2
  const arm = N.axleArmHalfWidth * 2
  for (const side of [-1, 1]) {
    const x = side * (bodyLength / 2 + 0.018)
    const capA = visualOnly(new THREE.Mesh(new RoundedBoxGeometry(0.036, arm * 0.88, diameter * 0.88, 2, 0.010), material), 'axle-end-chamfer-cap')
    const capB = visualOnly(new THREE.Mesh(new RoundedBoxGeometry(0.036, diameter * 0.88, arm * 0.88, 2, 0.010), material), 'axle-end-chamfer-cap')
    capA.position.set(x, 0.32, 0)
    capB.position.set(x, 0.32, 0)
    group.add(capA, capB)
  }
}

function addBushFinish(group, part, color) {
  const width = Math.max(0.28, Number(part.dimensions?.lengthStud) || (part.id === 'half-bush' ? 0.38 : 0.72))
  for (const side of [-1, 1]) {
    const shoulder = visualOnly(new THREE.Mesh(
      new THREE.TorusGeometry(0.342, 0.018, 7, 44),
      pomMaterial(color, 0.47),
    ), 'bush-face-shoulder')
    shoulder.rotation.y = Math.PI / 2
    shoulder.position.set(side * (width / 2 + 0.004), 0.36, 0)
    group.add(shoulder)
  }
  const groove = visualOnly(new THREE.Mesh(new THREE.TorusGeometry(0.350, 0.014, 6, 44), shade(color, 0.50)), 'bush-center-groove')
  groove.rotation.y = Math.PI / 2
  groove.position.y = 0.36
  group.add(groove)
}

function addCouplerFinish(group, part, color) {
  for (const side of [-1, 1]) {
    const end = visualOnly(new THREE.Mesh(new THREE.TorusGeometry(0.355, 0.020, 7, 44), pomMaterial(color, 0.47)), 'coupler-end-shoulder')
    end.rotation.y = Math.PI / 2
    end.position.set(side * 0.748, 0.38, 0)
    group.add(end)
  }
  for (let i = 0; i < 8; i += 1) {
    const a = i / 8 * Math.PI * 2
    const rib = visualOnly(new THREE.Mesh(
      new RoundedBoxGeometry(0.72, 0.034, 0.034, 2, 0.010),
      pomMaterial(color, 0.46),
    ), 'coupler-longitudinal-rib')
    rib.position.set(0, 0.38 + Math.cos(a) * 0.382, Math.sin(a) * 0.382)
    rib.rotation.x = a
    group.add(rib)
  }
}

function addSpurGearFaceFinish(group, part, color) {
  const metrics = gearMetrics(part.mechanics.gear.teeth, 'spur')
  const material = shade(color, 0.74)
  const hubRadius = metrics.teeth <= 12 ? 0.355 : 0.37
  const rootReliefRadius = Math.max(hubRadius + 0.09, metrics.rootRadius - Math.max(0.07, metrics.module * 0.50))
  const faceY = metrics.thickness / 2 + 0.006

  for (const side of [-1, 1]) {
    const hubShoulder = visualOnly(new THREE.Mesh(
      new THREE.TorusGeometry(hubRadius * 0.88, 0.018, 7, 48),
      material,
    ), 'spur-hub-face-shoulder')
    hubShoulder.rotation.x = Math.PI / 2
    hubShoulder.position.set(0, 0.40 + side * faceY, 0)
    group.add(hubShoulder)

    if (metrics.teeth >= 16) {
      const rootRelief = visualOnly(new THREE.Mesh(
        new THREE.TorusGeometry(rootReliefRadius, 0.014, 6, Math.max(48, metrics.teeth * 3)),
        material,
      ), 'spur-root-face-relief')
      rootRelief.rotation.x = Math.PI / 2
      rootRelief.position.set(0, 0.40 + side * faceY, 0)
      group.add(rootRelief)
    }
  }

  if (metrics.teeth >= 20) {
    const witnessCount = metrics.teeth >= 36 ? 4 : 3
    for (let i = 0; i < witnessCount; i += 1) {
      const a = i / witnessCount * Math.PI * 2
      const witness = visualOnly(new THREE.Mesh(new THREE.CircleGeometry(0.025, 14), material), 'spur-mold-witness')
      witness.rotation.x = -Math.PI / 2
      witness.position.set(Math.sin(a) * hubRadius * 1.25, 0.40 + faceY + 0.001, Math.cos(a) * hubRadius * 1.25)
      group.add(witness)
    }
  }
}

function addFrameFinish(group, part, color) {
  const holes = part.connectors.filter(item => item.type === 'pin-hole')
  if (!holes.length) return
  for (const side of [-1, 1]) {
    const topRail = visualOnly(new THREE.Mesh(new RoundedBoxGeometry(4.60, 0.035, 0.010, 2, 0.004), shade(color, 0.86)), 'frame-face-mold-lane')
    topRail.position.set(0, 4.45, side * 0.397)
    const bottomRail = topRail.clone()
    bottomRail.userData = { ...topRail.userData }
    bottomRail.position.y = 0.45
    group.add(topRail, bottomRail)
  }
  for (const [x, y] of [[-2.42, 0.98], [2.42, 0.98], [-2.42, 3.92], [2.42, 3.92]]) {
    const gusset = visualOnly(new THREE.Mesh(new RoundedBoxGeometry(0.36, 0.12, 0.52, 3, 0.035), absMaterial(color, 0.45)), 'frame-inner-gusset')
    gusset.position.set(x, y, 0)
    group.add(gusset)
  }
}

const upgraded = []

for (const [id, length, friction] of [
  ['pin', 2.0, true],
  ['pin-half', 0.9, true],
  ['pin-long', 3.0, true],
  ['pin-frictionless', 2.0, false],
]) {
  const part = PARTS.find(item => item.id === id)
  if (!part) continue
  patchPart(PARTS, id, {
    create: color => createSplitPin(part, color, length, friction),
    visualQuality: friction ? 'parts-6-true-split-friction-pin-v4' : 'parts-6-true-split-frictionless-pin-v4',
  })
  upgraded.push(id)
}

for (const part of PARTS.filter(item => /^technic-brick-1x\d+$/.test(item.id))) {
  if (wrapPart(part.id, addTechnicBrickUnderside, 'parts-6-hollow-underside-technic-brick-v4')) upgraded.push(part.id)
}

for (const part of PARTS.filter(item => /^(?:thin-)?beam-\d+$/.test(item.id))) {
  if (wrapPart(part.id, addLiftarmMoldFinish, 'parts-6-liftarm-mold-finish-v4')) upgraded.push(part.id)
}
for (const id of ['beam-l-3x3', 'beam-angle-4x2']) {
  if (wrapPart(id, addLiftarmMoldFinish, 'parts-6-bent-liftarm-mold-finish-v4')) upgraded.push(id)
}

for (const part of PARTS.filter(item => /^axle-\d+$/.test(item.id))) {
  if (wrapPart(part.id, addAxleEndFinish, 'parts-6-cross-axle-end-fidelity-v4')) upgraded.push(part.id)
}
for (const id of ['bush', 'half-bush']) {
  if (wrapPart(id, addBushFinish, 'parts-6-bush-face-fidelity-v4')) upgraded.push(id)
}
if (wrapPart('axle-coupler', addCouplerFinish, 'parts-6-axle-coupler-fidelity-v4')) upgraded.push('axle-coupler')

for (const part of PARTS.filter(item => item.mechanics?.gear && (item.mechanics.gear.kind ?? 'spur') === 'spur')) {
  if (wrapPart(part.id, addSpurGearFaceFinish, 'parts-6-spur-face-fidelity-v4')) upgraded.push(part.id)
}
if (wrapPart('technic-frame-5x7', addFrameFinish, 'parts-6-frame-mold-fidelity-v4')) upgraded.push('technic-frame-5x7')

globalThis.BrickLabParts6CoreMoldedFidelity = Object.freeze({
  version: PARTS6_CORE_MOLDED_FIDELITY_VERSION,
  upgraded: [...new Set(upgraded)],
  focus: Object.freeze([
    'real open elastic slots on Technic-like pins',
    'hollow connector-aligned Technic brick undersides',
    'subtle liftarm/frame molded face finish',
    'cross-axle end chamfer caps',
    'bush/coupler shoulders and ribbing',
    'spur gear hub/root face relief',
  ]),
  physics: 'core detail preserves existing connector/mechanics/physics metadata; added finish meshes are physicsIgnore and replacement pin silhouettes stay inside prior nominal envelopes',
})

window.dispatchEvent(new CustomEvent('bricklab:partcatalogchange', {
  detail: { total: PARTS.length, pack: PARTS6_CORE_MOLDED_FIDELITY_VERSION },
}))
