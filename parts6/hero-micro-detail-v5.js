import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { PARTS } from '../parts.js'
import { patchPart } from '../parts3/part-schema-v1.js'
import { wheelMetrics, gearMetrics } from '../parts5/part-geometry-metrics-v1.js'
import { REAL_TECHNIC_NOMINAL } from './nominal-dimension-fidelity-v1.js'

export const PARTS6_HERO_MICRO_DETAIL_VERSION = 'parts-6-hero-micro-detail-v5'

const N = REAL_TECHNIC_NOMINAL
const X_AXIS = new THREE.Vector3(1, 0, 0)
const Y_AXIS = new THREE.Vector3(0, 1, 0)
const Z_AXIS = new THREE.Vector3(0, 0, 1)
const WHEEL_CENTER_Y = 1.15

function absMaterial(color, roughness = 0.44) {
  return new THREE.MeshPhysicalMaterial({ color, roughness, metalness: 0.004, clearcoat: 0.024, clearcoatRoughness: 0.72, ior: 1.47 })
}
function pomMaterial(color = 0x2b2d31, roughness = 0.46) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.004 })
}
function darkMaterial() {
  return new THREE.MeshStandardMaterial({ color: 0x111315, roughness: 0.91, metalness: 0.008 })
}
function metalMaterial(color = 0xaab2b9, roughness = 0.34) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.72 })
}
function visualOnly(object, feature) {
  object.userData.physicsIgnore = true
  object.userData.parts6VisualDetail = true
  object.userData.parts6HeroMicroFeature = feature
  return object
}
function connector(part, id) {
  return part.connectors?.find(item => item.id === id) ?? null
}
function axisOf(port, fallback = X_AXIS) {
  if (!port?.axis) return fallback.clone()
  return new THREE.Vector3(...port.axis).normalize()
}
function pointOf(port, fallback = [0, 0, 0]) {
  return new THREE.Vector3(...(port?.position ?? fallback))
}
function basisAround(axis) {
  const normal = axis.clone().normalize()
  const seed = Math.abs(normal.y) < 0.88 ? Y_AXIS : Z_AXIS
  const u = seed.clone().sub(normal.clone().multiplyScalar(seed.dot(normal))).normalize()
  const v = normal.clone().cross(u).normalize()
  return { u, v }
}
function torusAlong(axis, radius, tube, material, feature, radial = 8, tubular = 52) {
  const mesh = visualOnly(new THREE.Mesh(new THREE.TorusGeometry(radius, tube, radial, tubular), material), feature)
  mesh.quaternion.setFromUnitVectors(Z_AXIS, axis.clone().normalize())
  return mesh
}
function cylinderAlong(axis, radius, length, material, feature, segments = 24) {
  const mesh = visualOnly(new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, segments), material), feature)
  mesh.quaternion.setFromUnitVectors(Y_AXIS, axis.clone().normalize())
  return mesh
}
function smallBolt(group, position, axis, feature, radius = 0.038) {
  const bolt = cylinderAlong(axis, radius, 0.028, metalMaterial(0x9ba3aa, 0.36), feature, 12)
  bolt.position.copy(position)
  group.add(bolt)
}
function wrapPart(id, decorate, quality) {
  const part = PARTS.find(item => item.id === id)
  if (!part || typeof part.create !== 'function') return false
  const previous = part.create
  patchPart(PARTS, id, {
    create: color => {
      const object = previous(color)
      decorate(object, part, color)
      object.userData.visualVersion = PARTS6_HERO_MICRO_DETAIL_VERSION
      object.userData.parts6HeroMicroDetail = true
      return object
    },
    visualQuality: quality,
  })
  return true
}

function decorateWheel(group, part, color) {
  const metrics = wheelMetrics(part)
  const rubber = darkMaterial()
  const rim = absMaterial(color, 0.45)
  const axle = part.connectors.find(item => item.type === 'axle-hole')
  const axis = axisOf(axle, X_AXIS)
  const hubCenter = pointOf(axle, [0, WHEEL_CENTER_Y, 0])

  // Real molded tyres show a very fine centre parting line. Keep it subtle and
  // continuous so it reads at close range without becoming another tread row.
  const seamRadius = metrics.carcassRadius + metrics.lugHeight * 0.08
  const seam = torusAlong(axis, seamRadius, Math.max(0.0035, metrics.radius * 0.0028), rubber, 'tyre-centre-mold-seam', 5, 128)
  seam.position.copy(hubCenter)
  group.add(seam)

  // Sparse sidewall vent nibs make the tyre read as a molded rubber part rather
  // than a mathematically perfect lathe. They are deliberately tiny.
  const nibGeometry = new THREE.CylinderGeometry(0.0065, 0.0050, 0.022, 8)
  const nibMaterial = rubber
  const countPerSide = metrics.family === 'tractor' ? 6 : 8
  const nibs = visualOnly(new THREE.InstancedMesh(nibGeometry, nibMaterial, countPerSide * 2), 'sidewall-mold-vent-nibs')
  const matrix = new THREE.Matrix4()
  const q = new THREE.Quaternion().setFromUnitVectors(Y_AXIS, axis)
  const scale = new THREE.Vector3(1, 1, 1)
  let index = 0
  const nibRadius = metrics.carcassRadius * (metrics.family === 'tractor' ? 0.72 : 0.76)
  for (const side of [-1, 1]) {
    for (let i = 0; i < countPerSide; i += 1) {
      const a = i / countPerSide * Math.PI * 2 + (side > 0 ? 0.17 : 0)
      const p = hubCenter.clone()
      p.addScaledVector(axis, side * metrics.width * 0.492)
      p.y += Math.cos(a) * nibRadius
      p.z += Math.sin(a) * nibRadius
      matrix.compose(p, q, scale)
      nibs.setMatrixAt(index++, matrix)
    }
  }
  nibs.instanceMatrix.needsUpdate = true
  group.add(nibs)

  for (const side of [-1, 1]) {
    const retainingRing = torusAlong(axis, Math.max(metrics.hubRadius * 1.04, N.axleTipRadius + 0.085), 0.014, rim, 'rim-hub-retaining-shoulder', 7, 48)
    retainingRing.position.copy(hubCenter).addScaledVector(axis, side * metrics.width * 0.415)
    group.add(retainingRing)
  }

  const witness = visualOnly(new THREE.Mesh(new THREE.CircleGeometry(Math.max(0.020, metrics.hubRadius * 0.10), 18), rim), 'rim-mold-witness')
  witness.quaternion.setFromUnitVectors(Z_AXIS, axis)
  witness.position.copy(hubCenter).addScaledVector(axis, metrics.width * 0.424)
  const { u } = basisAround(axis)
  witness.position.addScaledVector(u, metrics.hubRadius * 0.56)
  group.add(witness)
}

function decorateBevel(group, part, color) {
  const metrics = gearMetrics(part.mechanics.gear.teeth, 'bevel')
  const axle = part.connectors.find(item => item.type === 'axle-hole')
  const axis = axisOf(axle, Y_AXIS)
  const center = pointOf(axle, [0, 0.40, 0])
  const material = pomMaterial(color, 0.48)
  const faceOffset = metrics.thickness / 2 + 0.010
  const shoulderRadius = Math.max(N.axleTipRadius + 0.075, metrics.teeth <= 12 ? 0.30 : 0.32)

  for (const side of [-1, 1]) {
    const shoulder = torusAlong(axis, shoulderRadius, 0.014, material, 'bevel-hub-face-shoulder', 7, 48)
    shoulder.position.copy(center).addScaledVector(axis, side * faceOffset)
    group.add(shoulder)
  }

  const rootRelief = torusAlong(axis, Math.max(shoulderRadius + 0.08, metrics.rootRadius * 0.76), 0.012, pomMaterial(color, 0.52), 'bevel-root-face-relief', 6, Math.max(48, metrics.teeth * 3))
  rootRelief.position.copy(center).addScaledVector(axis, faceOffset + 0.002)
  group.add(rootRelief)

  const { u, v } = basisAround(axis)
  const witnessCount = metrics.teeth <= 12 ? 2 : 3
  for (let i = 0; i < witnessCount; i += 1) {
    const a = i / witnessCount * Math.PI * 2 + 0.22
    const witness = visualOnly(new THREE.Mesh(new THREE.CircleGeometry(0.020, 14), material), 'bevel-mold-witness')
    witness.quaternion.setFromUnitVectors(Z_AXIS, axis)
    witness.position.copy(center).addScaledVector(axis, faceOffset + 0.003)
    witness.position.addScaledVector(u, Math.cos(a) * shoulderRadius * 1.34)
    witness.position.addScaledVector(v, Math.sin(a) * shoulderRadius * 1.34)
    group.add(witness)
  }
}

function decorateUniversal(group, part, color) {
  const center = new THREE.Vector3(0, 0.58, 0)
  const material = pomMaterial(color, 0.49)
  for (const id of ['input', 'output']) {
    const port = connector(part, id)
    if (!port) continue
    const axis = axisOf(port)
    const portCenter = pointOf(port)
    const inward = Math.sign(center.clone().sub(portCenter).dot(axis)) || 1
    const seam = torusAlong(axis, 0.286, 0.010, material, `cardan-${id}-yoke-parting-line`, 6, 44)
    seam.position.copy(portCenter).addScaledVector(axis, inward * 0.215)
    group.add(seam)
  }

  for (const axis of [Y_AXIS, Z_AXIS]) {
    for (const side of [-1, 1]) {
      const snap = torusAlong(axis, 0.094, 0.010, metalMaterial(0x8f979e, 0.35), 'cardan-trunnion-snap-ring', 6, 36)
      snap.position.copy(center).addScaledVector(axis, side * 0.326)
      group.add(snap)
    }
  }
}

function decorateCv(group, part, color) {
  const input = connector(part, 'input')
  const output = connector(part, 'output')
  const inputAxis = axisOf(input, X_AXIS)
  const outputAxis = axisOf(output, X_AXIS)
  const bisector = inputAxis.clone().add(outputAxis).normalize()
  const center = new THREE.Vector3(0.07, 0.58, 0.04)

  const bellSeam = torusAlong(bisector, 0.338, 0.012, pomMaterial(color, 0.50), 'cv-bell-parting-line', 7, 56)
  bellSeam.position.copy(center)
  group.add(bellSeam)

  const { u, v } = basisAround(bisector)
  for (let i = 0; i < 6; i += 1) {
    const a = i / 6 * Math.PI * 2
    const window = visualOnly(new THREE.Mesh(new RoundedBoxGeometry(0.030, 0.085, 0.155, 3, 0.016), darkMaterial()), 'cv-cage-window-shadow')
    window.position.copy(center)
    window.position.addScaledVector(u, Math.cos(a) * 0.258)
    window.position.addScaledVector(v, Math.sin(a) * 0.258)
    const tangent = u.clone().multiplyScalar(-Math.sin(a)).add(v.clone().multiplyScalar(Math.cos(a))).normalize()
    const radial = u.clone().multiplyScalar(Math.cos(a)).add(v.clone().multiplyScalar(Math.sin(a))).normalize()
    const basis = new THREE.Matrix4().makeBasis(bisector, tangent, radial)
    window.quaternion.setFromRotationMatrix(basis)
    group.add(window)
  }
}

function addBearingBoltCircle(group, port, radius, count, prefix) {
  const axis = axisOf(port)
  const center = pointOf(port)
  const outward = Math.sign(center.dot(axis)) || 1
  const { u, v } = basisAround(axis)
  for (let i = 0; i < count; i += 1) {
    const a = i / count * Math.PI * 2 + Math.PI / count
    const p = center.clone().addScaledVector(axis, outward * 0.155)
    p.addScaledVector(u, Math.cos(a) * radius)
    p.addScaledVector(v, Math.sin(a) * radius)
    smallBolt(group, p, axis.clone().multiplyScalar(outward), `${prefix}-bearing-bolt`)
  }
}

function decorateGearbox(group, part, color) {
  const ports = part.connectors.filter(item => item.type === 'axle-hole')
  for (const port of ports) addBearingBoltCircle(group, port, 0.50, 4, 'gearbox')

  const fillPlug = cylinderAlong(Z_AXIS, 0.075, 0.055, metalMaterial(0x8f979e, 0.36), 'gearbox-fill-plug', 6)
  fillPlug.position.set(-0.72, 1.34, 1.075)
  group.add(fillPlug)

  const drainPlug = cylinderAlong(Y_AXIS, 0.070, 0.050, metalMaterial(0x8f979e, 0.38), 'gearbox-drain-plug', 6)
  drainPlug.position.set(0.74, 0.085, 0.58)
  group.add(drainPlug)

  const vent = cylinderAlong(Y_AXIS, 0.052, 0.085, darkMaterial(), 'gearbox-breather-cap', 20)
  vent.position.set(-0.72, 1.66, -0.30)
  group.add(vent)

  for (const x of [-1.18, 1.18]) {
    const dowel = cylinderAlong(Z_AXIS, 0.040, 0.035, pomMaterial(color, 0.50), 'gearbox-alignment-dowel', 18)
    dowel.position.set(x, 1.36, 1.075)
    group.add(dowel)
  }
}

function decorateDifferential(group, part, color) {
  const ports = part.connectors.filter(item => item.type === 'axle-hole')
  for (const port of ports) {
    const axis = axisOf(port)
    const center = pointOf(port)
    const sidePort = Math.abs(axis.x) > 0.75
    addBearingBoltCircle(group, port, sidePort ? 0.44 : 0.40, sidePort ? 6 : 4, 'differential')

    const seal = torusAlong(axis, N.axleTipRadius + 0.072, 0.018, darkMaterial(), 'differential-axle-seal', 8, 48)
    const outward = Math.sign(center.dot(axis)) || 1
    seal.position.copy(center).addScaledVector(axis, outward * 0.175)
    group.add(seal)
  }

  for (const axis of [Y_AXIS, Z_AXIS]) {
    for (const side of [-1, 1]) {
      const cap = cylinderAlong(axis, 0.100, 0.030, metalMaterial(0x8f979e, 0.35), 'differential-spider-pin-retainer', 18)
      cap.position.set(0, 1.0, 0).addScaledVector(axis, side * 0.42)
      group.add(cap)
    }
  }

  const ringWitness = visualOnly(new THREE.Mesh(new THREE.CircleGeometry(0.026, 14), pomMaterial(color, 0.50)), 'differential-carrier-mold-witness')
  ringWitness.quaternion.setFromUnitVectors(Z_AXIS, X_AXIS)
  ringWitness.position.set(0.846, 1.0, 0.30)
  group.add(ringWitness)
}

const upgraded = []

for (const part of PARTS.filter(item => item.mechanics?.wheel)) {
  if (wrapPart(part.id, decorateWheel, `parts-6-wheel-micro-detail-v5-${wheelMetrics(part).family}`)) upgraded.push(part.id)
}
for (const part of PARTS.filter(item => item.mechanics?.gear?.kind === 'bevel')) {
  if (wrapPart(part.id, decorateBevel, 'parts-6-bevel-micro-detail-v5')) upgraded.push(part.id)
}
for (const [id, decorator, quality] of [
  ['universal-joint-30', decorateUniversal, 'parts-6-cardan-micro-detail-v5'],
  ['cv-joint-30', decorateCv, 'parts-6-cv-micro-detail-v5'],
  ['gearbox-fnr', decorateGearbox, 'parts-6-gearbox-micro-detail-v5'],
  ['open-differential', decorateDifferential, 'parts-6-differential-micro-detail-v5'],
]) {
  if (wrapPart(id, decorator, quality)) upgraded.push(id)
}

globalThis.BrickLabParts6HeroMicroDetail = Object.freeze({
  version: PARTS6_HERO_MICRO_DETAIL_VERSION,
  upgraded: [...new Set(upgraded)],
  focus: Object.freeze([
    'tyre mould seam and sparse vent nibs',
    'rim hub retention and mold witness detail',
    'bevel hub/root face mold finish',
    'Cardan trunnion snap rings and yoke parting lines',
    'CV bell seam and cage-window depth cues',
    'gearbox bearing fasteners, fill/drain plugs and breather',
    'differential bearing fasteners, axle seals and spider-pin retainers',
  ]),
  physics: 'all v5 micro-detail is render-only and excluded from bounds-derived colliders',
})

window.dispatchEvent(new CustomEvent('bricklab:partcatalogchange', {
  detail: { total: PARTS.length, pack: PARTS6_HERO_MICRO_DETAIL_VERSION },
}))
