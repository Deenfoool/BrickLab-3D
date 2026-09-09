import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { PARTS } from '../parts.js'
import { patchPart } from '../parts3/part-schema-v1.js'
import { wheelMetrics, gearMetrics, bevelPitchConeAngle, GEAR_PRESSURE_ANGLE_DEG } from '../parts5/part-geometry-metrics-v1.js'
import { REAL_TECHNIC_NOMINAL } from './nominal-dimension-fidelity-v1.js'

export const PARTS6_HERO_MECHANICAL_FIDELITY_VERSION = 'parts-6-hero-mechanical-fidelity-v2'

const N = REAL_TECHNIC_NOMINAL
const X_AXIS = new THREE.Vector3(1, 0, 0)
const Y_AXIS = new THREE.Vector3(0, 1, 0)
const Z_AXIS = new THREE.Vector3(0, 0, 1)
const WHEEL_CENTER_Y = 1.15
const PRESSURE_ANGLE = THREE.MathUtils.degToRad(GEAR_PRESSURE_ANGLE_DEG)

function absMaterial(color, roughness = 0.38) {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness,
    metalness: 0.004,
    clearcoat: 0.035,
    clearcoatRoughness: 0.68,
    ior: 1.47,
  })
}

function pomMaterial(color, roughness = 0.42) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.004 })
}

function rubberMaterial() {
  return new THREE.MeshStandardMaterial({ color: 0x111315, roughness: 0.99, metalness: 0 })
}

function darkRubberMaterial() {
  return new THREE.MeshStandardMaterial({ color: 0x090b0c, roughness: 1.0, metalness: 0 })
}

function metalMaterial(color = 0xb9c1c8, roughness = 0.27) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.76 })
}

function darkMaterial() {
  return new THREE.MeshStandardMaterial({ color: 0x14171a, roughness: 0.86, metalness: 0.02 })
}

function root(id, color) {
  const group = new THREE.Group()
  group.userData.partId = id
  group.userData.color = color
  group.userData.visualVersion = PARTS6_HERO_MECHANICAL_FIDELITY_VERSION
  return group
}

function visualOnly(object, feature) {
  object.userData.physicsIgnore = true
  object.userData.parts6VisualDetail = true
  object.userData.parts6HeroFeature = feature
  return object
}

function circlePath(radius) {
  const path = new THREE.Path()
  path.absarc(0, 0, radius, 0, Math.PI * 2, true)
  return path
}

function crossPoints(radius = N.axleTipRadius + 0.004, arm = N.axleArmHalfWidth + 0.003) {
  return [
    [-arm, radius], [arm, radius], [arm, arm], [radius, arm], [radius, -arm], [arm, -arm],
    [arm, -radius], [-arm, -radius], [-arm, -arm], [-radius, -arm], [-radius, arm], [-arm, arm],
  ]
}

function crossPath(radius = N.axleTipRadius + 0.004, arm = N.axleArmHalfWidth + 0.003) {
  const path = new THREE.Path()
  const points = crossPoints(radius, arm)
  path.moveTo(...points[0])
  for (let i = 1; i < points.length; i += 1) path.lineTo(...points[i])
  path.closePath()
  return path
}

function annulusShape(outer, inner) {
  const shape = new THREE.Shape()
  shape.absarc(0, 0, outer, 0, Math.PI * 2, false)
  shape.holes.push(circlePath(inner))
  return shape
}

function crossBoreShape(outer) {
  const shape = new THREE.Shape()
  shape.absarc(0, 0, outer, 0, Math.PI * 2, false)
  shape.holes.push(crossPath())
  return shape
}

function extrudeCentered(shape, depth, material, options = {}) {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: options.bevelEnabled ?? true,
    bevelSegments: options.bevelSegments ?? 3,
    bevelSize: options.bevelSize ?? 0.007,
    bevelThickness: options.bevelThickness ?? 0.007,
    curveSegments: options.curveSegments ?? 48,
    steps: 1,
  })
  geometry.translate(0, 0, -depth / 2)
  return new THREE.Mesh(geometry, material)
}

function extrudeAlongX(shape, depth, material, options = {}) {
  const mesh = extrudeCentered(shape, depth, material, options)
  mesh.rotation.y = Math.PI / 2
  return mesh
}

function cylinderAlong(axis, radius, length, material, segments = 40) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, segments), material)
  mesh.quaternion.setFromUnitVectors(Y_AXIS, axis.clone().normalize())
  return mesh
}

function taperedSpokeGeometry(length, innerWidth, outerWidth, axialDepth) {
  const z0 = -length / 2
  const z1 = length / 2
  const x0 = -axialDepth / 2
  const x1 = axialDepth / 2
  const yi = innerWidth / 2
  const yo = outerWidth / 2
  const positions = [
    x0, -yi, z0, x1, -yi, z0, x1, yi, z0, x0, yi, z0,
    x0, -yo, z1, x1, -yo, z1, x1, yo, z1, x0, yo, z1,
  ]
  const indices = [
    0, 1, 2, 0, 2, 3,
    4, 6, 5, 4, 7, 6,
    0, 4, 5, 0, 5, 1,
    1, 5, 6, 1, 6, 2,
    2, 6, 7, 2, 7, 3,
    3, 7, 4, 3, 4, 0,
  ]
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function tyreProfile(metrics) {
  const half = metrics.width / 2
  const bead = metrics.rimOuterRadius * 0.985
  const crown = metrics.carcassRadius
  const family = metrics.family
  const shoulderFalloff = family === 'tractor' ? 0.072 : family === 'offroad' ? 0.052 : family === 'narrow' ? 0.034 : 0.028
  const bulgeScale = family === 'tractor' ? 0.024 : family === 'offroad' ? 0.018 : 0.010
  const points = [
    new THREE.Vector2(bead * 0.985, -half * 0.68),
    new THREE.Vector2(bead * 1.005, -half * 0.86),
    new THREE.Vector2(bead * 1.055, -half * 0.98),
  ]
  for (let i = 0; i <= 28; i += 1) {
    const t = -1 + i * 2 / 28
    const shoulder = Math.pow(Math.abs(t), family === 'tractor' ? 1.75 : 2.25)
    const crownFlatten = family === 'road' ? 1 - 0.012 * Math.cos(t * Math.PI) : 1
    const radial = crown * crownFlatten * (1 - shoulderFalloff * shoulder)
    const bulge = Math.sin((t + 1) * Math.PI / 2) * metrics.radius * bulgeScale
    points.push(new THREE.Vector2(radial + bulge, half * t))
  }
  points.push(
    new THREE.Vector2(bead * 1.055, half * 0.98),
    new THREE.Vector2(bead * 1.005, half * 0.86),
    new THREE.Vector2(bead * 0.985, half * 0.68),
    new THREE.Vector2(bead * 0.985, -half * 0.68),
  )
  return points
}

function placeTreadInstances(group, metrics, material) {
  const family = metrics.family
  const count = metrics.treadCount
  const radial = metrics.carcassRadius + metrics.lugHeight * 0.52
  const rows = family === 'offroad' ? 3 : family === 'road' ? 3 : family === 'tractor' ? 2 : 1
  const total = count * rows
  const tangent = family === 'tractor' ? metrics.radius * 0.22 : family === 'offroad' ? metrics.radius * 0.145 : family === 'road' ? metrics.radius * 0.050 : metrics.radius * 0.072
  const axial = family === 'tractor' ? metrics.width * 0.62 : family === 'offroad' ? metrics.width * 0.34 : family === 'road' ? metrics.width * 0.20 : metrics.width * 0.62
  const geometry = new RoundedBoxGeometry(
    Math.max(0.045, axial),
    Math.max(0.018, metrics.lugHeight),
    Math.max(0.050, tangent),
    3,
    Math.min(0.020, metrics.lugHeight * 0.25),
  )
  const mesh = visualOnly(new THREE.InstancedMesh(geometry, material, total), `${family}-tread`)
  const matrix = new THREE.Matrix4()
  const radialQ = new THREE.Quaternion()
  const tiltQ = new THREE.Quaternion()
  const q = new THREE.Quaternion()
  const scale = new THREE.Vector3(1, 1, 1)
  let index = 0
  const place = (angle, x, tilt, radialScale = 1) => {
    const offset = new THREE.Vector3(x, radial * radialScale, 0).applyAxisAngle(X_AXIS, angle)
    radialQ.setFromAxisAngle(X_AXIS, angle)
    tiltQ.setFromAxisAngle(Y_AXIS, tilt)
    q.copy(radialQ).multiply(tiltQ)
    matrix.compose(new THREE.Vector3(offset.x, WHEEL_CENTER_Y + offset.y, offset.z), q, scale)
    mesh.setMatrixAt(index++, matrix)
  }

  for (let i = 0; i < count; i += 1) {
    const a = i / count * Math.PI * 2
    if (family === 'tractor') {
      place(a, -metrics.width * 0.19, 0.62)
      place(a, metrics.width * 0.19, -0.62)
    } else if (family === 'offroad') {
      const shift = i % 2 ? 1 : -1
      place(a, 0, shift * 0.05, 1.006)
      place(a, -metrics.width * 0.25, 0.20, 0.995)
      place(a, metrics.width * 0.25, -0.20, 0.995)
    } else if (family === 'road') {
      place(a, 0, i % 2 ? 0.025 : -0.025, 1.002)
      place(a, -metrics.width * 0.29, 0.10, 0.992)
      place(a, metrics.width * 0.29, -0.10, 0.992)
    } else {
      place(a, 0, i % 2 ? 0.075 : -0.075)
    }
  }
  mesh.instanceMatrix.needsUpdate = true
  group.add(mesh)
}

function addSidewallDetails(group, metrics) {
  const rubber = darkRubberMaterial()
  const ringRadius = metrics.carcassRadius * (metrics.family === 'tractor' ? 0.76 : 0.80)
  for (const side of [-1, 1]) {
    const ring = visualOnly(new THREE.Mesh(
      new THREE.TorusGeometry(ringRadius, Math.max(0.006, metrics.radius * 0.005), 6, 96),
      rubber,
    ), 'sidewall-mold-ring')
    ring.rotation.y = Math.PI / 2
    ring.position.set(side * metrics.width * 0.486, WHEEL_CENTER_Y, 0)
    group.add(ring)

    const beadRing = visualOnly(new THREE.Mesh(
      new THREE.TorusGeometry(metrics.rimOuterRadius * 1.012, Math.max(0.006, metrics.radius * 0.004), 6, 96),
      rubber,
    ), 'bead-seat-shadow')
    beadRing.rotation.y = Math.PI / 2
    beadRing.position.set(side * metrics.width * 0.465, WHEEL_CENTER_Y, 0)
    group.add(beadRing)
  }
}

function createWheelHero(part, color) {
  const metrics = wheelMetrics(part)
  const group = root(part.id, color)
  const rubber = rubberMaterial()
  const rim = absMaterial(color, 0.34)

  const tyre = new THREE.Mesh(new THREE.LatheGeometry(tyreProfile(metrics), 128), rubber)
  tyre.rotation.z = -Math.PI / 2
  tyre.position.y = WHEEL_CENTER_Y
  tyre.userData.parts6HeroFeature = 'profiled-tyre-carcass'
  group.add(tyre)
  placeTreadInstances(group, metrics, rubber)
  addSidewallDetails(group, metrics)

  const barrelOuter = metrics.rimOuterRadius * 0.985
  const barrelInner = Math.max(metrics.hubRadius * 1.45, metrics.rimOuterRadius * 0.61)
  const barrel = extrudeAlongX(annulusShape(barrelOuter, barrelInner), metrics.width * 0.74, rim, {
    bevelSegments: 4,
    bevelSize: 0.007,
    bevelThickness: 0.008,
  })
  barrel.position.y = WHEEL_CENTER_Y
  barrel.userData.parts6HeroFeature = 'rim-barrel'
  group.add(barrel)

  const faceDepth = Math.max(0.045, metrics.width * 0.065)
  const lipShape = annulusShape(metrics.rimOuterRadius * 1.018, metrics.rimOuterRadius * 0.895)
  for (const side of [-1, 1]) {
    const lip = extrudeAlongX(lipShape, faceDepth, rim, { bevelSegments: 3, bevelSize: 0.005, bevelThickness: 0.006 })
    lip.position.set(side * metrics.width * 0.38, WHEEL_CENTER_Y, 0)
    lip.userData.parts6HeroFeature = 'rim-bead-lip'
    group.add(lip)

    const dish = extrudeAlongX(
      annulusShape(metrics.rimOuterRadius * 0.82, metrics.hubRadius * 1.20),
      Math.max(0.035, metrics.width * 0.05),
      rim,
      { bevelSegments: 3, bevelSize: 0.004, bevelThickness: 0.005 },
    )
    dish.position.set(side * metrics.width * 0.18, WHEEL_CENTER_Y, 0)
    dish.userData.parts6HeroFeature = 'recessed-rim-dish'
    group.add(dish)
  }

  const spokeCount = metrics.spokes
  const inner = metrics.hubRadius * 1.05
  const outer = metrics.rimOuterRadius * 0.80
  const length = Math.max(0.14, outer - inner)
  const mid = (inner + outer) / 2
  const innerWidth = Math.max(0.075, metrics.rimOuterRadius * 0.085)
  const outerWidth = Math.max(0.11, metrics.rimOuterRadius * (metrics.family === 'tractor' ? 0.14 : 0.11))
  const spokeGeo = taperedSpokeGeometry(length, innerWidth, outerWidth, Math.max(0.10, metrics.width * 0.28))
  for (let i = 0; i < spokeCount; i += 1) {
    const a = i / spokeCount * Math.PI * 2
    const spoke = new THREE.Mesh(spokeGeo, rim)
    spoke.position.set(0, WHEEL_CENTER_Y + Math.cos(a) * mid, Math.sin(a) * mid)
    spoke.rotation.x = a
    spoke.userData.parts6HeroFeature = 'tapered-spoke'
    group.add(spoke)
  }

  const hub = extrudeAlongX(crossBoreShape(metrics.hubRadius), metrics.width * 0.82, rim, {
    bevelSegments: 4,
    bevelSize: 0.006,
    bevelThickness: 0.007,
  })
  hub.position.y = WHEEL_CENTER_Y
  hub.userData.parts6HeroFeature = 'keyed-hub-core'
  group.add(hub)

  const driveRing = visualOnly(extrudeAlongX(
    annulusShape(metrics.hubRadius * 1.08, metrics.hubRadius * 0.78),
    Math.max(0.024, metrics.width * 0.035),
    darkMaterial(),
    { bevelEnabled: false },
  ), 'hub-recess-shadow')
  driveRing.position.set(metrics.width * 0.42, WHEEL_CENTER_Y, 0)
  group.add(driveRing)

  group.userData.wheelFidelity = {
    family: metrics.family,
    radiusStud: metrics.radius,
    widthStud: metrics.width,
    rimOuterRadiusStud: metrics.rimOuterRadius,
    treadRows: metrics.family === 'offroad' || metrics.family === 'road' ? 3 : metrics.family === 'tractor' ? 2 : 1,
    spokeCount,
  }
  return group
}

function frustumAnnulusGeometry(outerBottom, outerTop, innerBottom, innerTop, height, segments = 96) {
  const positions = []
  const indices = []
  const half = height / 2
  for (let i = 0; i <= segments; i += 1) {
    const a = i / segments * Math.PI * 2
    const c = Math.cos(a)
    const s = Math.sin(a)
    positions.push(
      c * outerBottom, -half, s * outerBottom,
      c * outerTop, half, s * outerTop,
      c * innerBottom, -half, s * innerBottom,
      c * innerTop, half, s * innerTop,
    )
  }
  for (let i = 0; i < segments; i += 1) {
    const a = i * 4
    const b = (i + 1) * 4
    indices.push(
      a, b, b + 1, a, b + 1, a + 1,
      a + 3, b + 3, b + 2, a + 3, b + 2, a + 2,
      a, a + 2, b + 2, a, b + 2, b,
      a + 1, b + 1, b + 3, a + 1, b + 3, a + 3,
    )
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function bevelToothGeometryV3(metrics, coneAngle) {
  const slices = 9
  const half = metrics.thickness / 2
  const pitchDelta = Math.tan(coneAngle) * metrics.thickness * 0.30
  const positions = []
  const indices = []
  const rings = []
  for (let slice = 0; slice <= slices; slice += 1) {
    const u = slice / slices
    const y = -half + metrics.thickness * u
    const pitch = THREE.MathUtils.lerp(metrics.pitchRadius + pitchDelta, metrics.pitchRadius - pitchDelta, u)
    const scale = THREE.MathUtils.lerp(1.0, 0.66, u)
    const addendum = metrics.addendum * scale
    const dedendum = metrics.dedendum * THREE.MathUtils.lerp(0.90, 0.60, u)
    const root = Math.max(N.axleTipRadius * 1.65, pitch - dedendum)
    const tip = pitch + addendum
    const pitchHalf = metrics.toothAngle * 0.25
    const flankShift = Math.tan(PRESSURE_ANGLE) * addendum / Math.max(0.2, pitch)
    const tipHalf = Math.max(metrics.toothAngle * 0.07, pitchHalf - flankShift)
    const rootHalf = Math.min(metrics.toothAngle * 0.44, pitchHalf + Math.tan(PRESSURE_ANGLE) * dedendum / Math.max(0.2, pitch))
    const ring = []
    for (const [radius, angle] of [[root, -rootHalf], [tip, -tipHalf], [tip, tipHalf], [root, rootHalf]]) {
      positions.push(Math.cos(angle) * radius, y, Math.sin(angle) * radius)
      ring.push(positions.length / 3 - 1)
    }
    rings.push(ring)
  }
  for (let slice = 0; slice < slices; slice += 1) {
    const a = rings[slice]
    const b = rings[slice + 1]
    for (let edge = 0; edge < 4; edge += 1) {
      const next = (edge + 1) % 4
      indices.push(a[edge], b[edge], b[next], a[edge], b[next], a[next])
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function createBevelGearHero(part, color) {
  const metrics = gearMetrics(part.mechanics.gear.teeth, 'bevel')
  const coneAngle = bevelPitchConeAngle(metrics.teeth)
  const group = root(part.id, color)
  const material = pomMaterial(color, 0.40)
  const half = metrics.thickness / 2
  const pitchDelta = Math.tan(coneAngle) * metrics.thickness * 0.30
  const largePitch = metrics.pitchRadius + pitchDelta
  const smallPitch = metrics.pitchRadius - pitchDelta
  const outerBottom = largePitch + metrics.addendum * 0.30
  const outerTop = Math.max(N.axleTipRadius * 2.2, smallPitch + metrics.addendum * 0.12)
  const hubOuter = metrics.teeth <= 12 ? 0.34 : 0.36
  const ringInnerBottom = Math.max(hubOuter + 0.13, metrics.rootRadius * 0.64)
  const ringInnerTop = Math.max(hubOuter + 0.10, ringInnerBottom * 0.82)

  const rim = new THREE.Mesh(
    frustumAnnulusGeometry(outerBottom, outerTop, ringInnerBottom, ringInnerTop, metrics.thickness, Math.max(96, metrics.teeth * 6)),
    material,
  )
  rim.position.y = 0.40
  rim.userData.parts6HeroFeature = 'conical-gear-rim'
  group.add(rim)

  const toothGeometry = bevelToothGeometryV3(metrics, coneAngle)
  const teeth = new THREE.InstancedMesh(toothGeometry, material, metrics.teeth)
  const matrix = new THREE.Matrix4()
  const quaternion = new THREE.Quaternion()
  for (let i = 0; i < metrics.teeth; i += 1) {
    quaternion.setFromAxisAngle(Y_AXIS, i / metrics.teeth * Math.PI * 2)
    matrix.compose(new THREE.Vector3(0, 0.40, 0), quaternion, new THREE.Vector3(1, 1, 1))
    teeth.setMatrixAt(i, matrix)
  }
  teeth.instanceMatrix.needsUpdate = true
  teeth.userData.parts6HeroFeature = 'tapered-bevel-teeth'
  group.add(teeth)

  const hub = extrudeCentered(crossBoreShape(hubOuter), metrics.thickness + 0.12, material, {
    bevelSegments: 4,
    bevelSize: 0.006,
    bevelThickness: 0.007,
  })
  hub.rotation.x = Math.PI / 2
  hub.position.y = 0.40
  hub.userData.parts6HeroFeature = 'bevel-keyed-hub'
  group.add(hub)

  const spokeCount = metrics.teeth <= 12 ? 4 : 6
  const spokeInner = hubOuter * 0.92
  const spokeOuter = ringInnerBottom * 0.93
  const spokeLength = Math.max(0.08, spokeOuter - spokeInner)
  const spokeMid = (spokeInner + spokeOuter) / 2
  const spokeGeo = new RoundedBoxGeometry(spokeLength, metrics.thickness * 0.58, Math.max(0.09, metrics.pitchRadius * 0.10), 3, 0.025)
  for (let i = 0; i < spokeCount; i += 1) {
    const a = i / spokeCount * Math.PI * 2
    const spoke = new THREE.Mesh(spokeGeo, material)
    spoke.position.set(Math.cos(a) * spokeMid, 0.40, Math.sin(a) * spokeMid)
    spoke.rotation.y = -a
    spoke.userData.parts6HeroFeature = 'bevel-molded-web'
    group.add(spoke)
  }

  const recess = visualOnly(extrudeCentered(
    annulusShape(Math.max(hubOuter * 1.12, ringInnerTop * 0.78), hubOuter * 0.92),
    0.022,
    darkMaterial(),
    { bevelEnabled: false },
  ), 'bevel-face-recess')
  recess.rotation.x = Math.PI / 2
  recess.position.y = 0.40 + metrics.thickness / 2 + 0.012
  group.add(recess)

  group.userData.bevelFidelity = {
    teeth: metrics.teeth,
    pitchRadiusStud: metrics.pitchRadius,
    pitchConeAngleRad: coneAngle,
    pressureAngleDeg: GEAR_PRESSURE_ANGLE_DEG,
    spokeCount,
  }
  return group
}

function connectorAxis(part, id) {
  const connector = part.connectors.find(item => item.id === id)
  return connector ? new THREE.Vector3(...connector.axis).normalize() : null
}

function connectorPosition(part, id) {
  const connector = part.connectors.find(item => item.id === id)
  return connector ? new THREE.Vector3(...connector.position) : null
}

function addCardanDetail(object, part, color) {
  const center = new THREE.Vector3(0, 0.58, 0)
  const metal = metalMaterial()
  const seal = darkMaterial()
  for (const axis of [Y_AXIS, Z_AXIS]) {
    for (const side of [-1, 1]) {
      const cap = visualOnly(cylinderAlong(axis, 0.124, 0.055, metal, 28), 'cardan-bearing-cap')
      cap.position.copy(center).addScaledVector(axis, side * 0.318)
      object.add(cap)
      const sealRing = visualOnly(new THREE.Mesh(new THREE.TorusGeometry(0.102, 0.012, 7, 28), seal), 'cardan-seal-ring')
      sealRing.quaternion.setFromUnitVectors(Z_AXIS, axis)
      sealRing.position.copy(center).addScaledVector(axis, side * 0.292)
      object.add(sealRing)
    }
  }
  const inputAxis = connectorAxis(part, 'input') ?? X_AXIS
  const outputAxis = connectorAxis(part, 'output') ?? new THREE.Vector3(Math.cos(Math.PI / 6), 0, Math.sin(Math.PI / 6))
  for (const [axis, position, feature] of [
    [inputAxis, connectorPosition(part, 'input'), 'cardan-input-collar'],
    [outputAxis, connectorPosition(part, 'output'), 'cardan-output-collar'],
  ]) {
    if (!position) continue
    const collar = visualOnly(cylinderAlong(axis, 0.325, 0.075, pomMaterial(color, 0.43), 40), feature)
    collar.position.copy(position).addScaledVector(axis, axis.dot(center.clone().sub(position)) >= 0 ? 0.12 : -0.12)
    object.add(collar)
  }
  object.userData.heroDriveline = 'cardan-bearing-caps-and-collars'
}

function addCvDetail(object, part, color) {
  const center = new THREE.Vector3(0.07, 0.58, 0.04)
  const inputAxis = connectorAxis(part, 'input') ?? X_AXIS
  const outputAxis = connectorAxis(part, 'output') ?? new THREE.Vector3(Math.cos(Math.PI / 6), 0, Math.sin(Math.PI / 6))
  const inputPosition = connectorPosition(part, 'input')
  const outputPosition = connectorPosition(part, 'output')
  const dark = darkMaterial()
  for (const [axis, position, inward, prefix] of [
    [inputAxis, inputPosition, 1, 'cv-input'],
    [outputAxis, outputPosition, -1, 'cv-output'],
  ]) {
    if (!position) continue
    for (let i = 0; i < 3; i += 1) {
      const radius = 0.30 - i * 0.018
      const ring = visualOnly(new THREE.Mesh(new THREE.TorusGeometry(radius, 0.018, 7, 40), dark), `${prefix}-bell-rib`)
      ring.quaternion.setFromUnitVectors(Z_AXIS, axis)
      ring.position.copy(position).addScaledVector(axis, inward * (0.10 + i * 0.055))
      object.add(ring)
    }
  }
  const bisector = inputAxis.clone().add(outputAxis).normalize()
  const cageRing = visualOnly(new THREE.Mesh(new THREE.TorusGeometry(0.282, 0.026, 8, 56), metalMaterial(0x9da7b0, 0.31)), 'cv-cage-retainer')
  cageRing.quaternion.setFromUnitVectors(Z_AXIS, bisector)
  cageRing.position.copy(center)
  object.add(cageRing)
  object.userData.heroDriveline = 'rzeppa-bell-ribs-and-cage-retainer'
}

function mountingTubeFeet(group, part, material) {
  for (const connector of part.connectors.filter(item => item.type === 'tube')) {
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.245, 0.275, 0.12, 32), material)
    foot.position.fromArray(connector.position)
    foot.position.y += 0.055
    foot.userData.parts6HeroFeature = 'mounting-tube-foot'
    group.add(foot)
  }
}

function createGearboxHero(part, color) {
  const group = root(part.id, color)
  const shell = absMaterial(color, 0.41)
  const dark = darkMaterial()
  const metal = metalMaterial()

  for (const side of [-1, 1]) {
    const half = new THREE.Mesh(new RoundedBoxGeometry(3.10, 1.54, 1.02, 5, 0.18), shell)
    half.position.set(0, 0.84, side * 0.53)
    half.userData.parts6HeroFeature = 'gearbox-shell-half'
    group.add(half)
  }

  const seam = visualOnly(new THREE.Mesh(new RoundedBoxGeometry(3.02, 1.38, 0.035, 3, 0.012), dark), 'gearbox-case-seam')
  seam.position.set(0, 0.84, 0)
  group.add(seam)

  for (const connector of part.connectors.filter(item => item.type === 'axle-hole')) {
    const axis = new THREE.Vector3(...connector.axis).normalize()
    const boss = cylinderAlong(axis, 0.46, 0.26, shell, 48)
    boss.position.fromArray(connector.position)
    boss.userData.parts6HeroFeature = 'gearbox-bearing-boss'
    group.add(boss)
    const retainer = visualOnly(new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.045, 10, 48), metal), 'gearbox-bearing-retainer')
    retainer.quaternion.setFromUnitVectors(Z_AXIS, axis)
    retainer.position.fromArray(connector.position).addScaledVector(axis, Math.sign(connector.position[0] || 1) * 0.14)
    group.add(retainer)
  }

  for (const z of [-1.035, 1.035]) {
    for (const x of [-1.05, -0.35, 0.35, 1.05]) {
      const rib = visualOnly(new THREE.Mesh(new RoundedBoxGeometry(0.075, 1.02, 0.055, 2, 0.018), shell), 'gearbox-casting-rib')
      rib.position.set(x, 0.78, z)
      group.add(rib)
    }
    for (const [x, y] of [[-1.25, 0.28], [-1.25, 1.40], [1.25, 0.28], [1.25, 1.40]]) {
      const bolt = visualOnly(cylinderAlong(Z_AXIS, 0.055, 0.045, metal, 16), 'gearbox-case-bolt')
      bolt.position.set(x, y, z + Math.sign(z) * 0.035)
      group.add(bolt)
    }
  }

  const selectorDeck = new THREE.Mesh(new RoundedBoxGeometry(1.08, 0.10, 0.68, 4, 0.04), dark)
  selectorDeck.position.set(0, 1.66, 0)
  selectorDeck.userData.parts6HeroFeature = 'selector-gate'
  group.add(selectorDeck)
  const lever = cylinderAlong(Y_AXIS, 0.075, 0.50, metal, 24)
  lever.rotation.z = 0.18
  lever.position.set(0.05, 1.93, 0)
  lever.userData.parts6HeroFeature = 'selector-lever'
  group.add(lever)
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.14, 28, 18), pomMaterial(0x74e6a6, 0.38))
  knob.position.set(0.10, 2.18, 0)
  knob.userData.parts6HeroFeature = 'selector-knob'
  group.add(knob)

  for (let i = -1; i <= 1; i += 1) {
    const detent = visualOnly(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.025, 16), metal), 'selector-detent')
    detent.position.set(i * 0.24, 1.725, 0.28)
    group.add(detent)
  }

  mountingTubeFeet(group, part, shell)
  group.userData.gearboxFidelity = { splitShell: true, bearingBosses: 2, selectorDetents: 3 }
  return group
}

function createDifferentialHero(part, color) {
  const group = root(part.id, color)
  const shell = absMaterial(color, 0.42)
  const pom = pomMaterial(0x5c6570, 0.40)
  const metal = metalMaterial()

  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.79, 0.14, 14, 72), pom)
  ring.rotation.y = Math.PI / 2
  ring.position.y = 1.0
  ring.userData.parts6HeroFeature = 'differential-ring-carrier'
  group.add(ring)

  const ringToothGeo = new RoundedBoxGeometry(0.20, 0.11, 0.12, 2, 0.022)
  const ringTeeth = visualOnly(new THREE.InstancedMesh(ringToothGeo, pom, 28), 'differential-ring-teeth')
  const matrix = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  for (let i = 0; i < 28; i += 1) {
    const a = i / 28 * Math.PI * 2
    const pos = new THREE.Vector3(0, 1 + Math.cos(a) * 0.94, Math.sin(a) * 0.94)
    q.setFromAxisAngle(X_AXIS, a)
    matrix.compose(pos, q, new THREE.Vector3(1, 1, 1))
    ringTeeth.setMatrixAt(i, matrix)
  }
  ringTeeth.instanceMatrix.needsUpdate = true
  group.add(ringTeeth)

  for (const x of [-0.72, 0.72]) {
    const sideHub = cylinderAlong(X_AXIS, 0.46, 0.34, shell, 48)
    sideHub.position.set(x, 1.0, 0)
    sideHub.userData.parts6HeroFeature = 'differential-side-hub'
    group.add(sideHub)
    const retainer = visualOnly(new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.045, 10, 48), metal), 'differential-bearing-retainer')
    retainer.rotation.y = Math.PI / 2
    retainer.position.set(x + Math.sign(x) * 0.17, 1.0, 0)
    group.add(retainer)
  }

  const cageRadius = 0.57
  for (let i = 0; i < 4; i += 1) {
    const a = i / 4 * Math.PI * 2
    const rib = new THREE.Mesh(new RoundedBoxGeometry(1.18, 0.14, 0.16, 3, 0.045), shell)
    rib.position.set(0, 1 + Math.cos(a) * cageRadius, Math.sin(a) * cageRadius)
    rib.rotation.x = a
    rib.userData.parts6HeroFeature = 'open-carrier-rib'
    group.add(rib)
  }

  const spiderY = visualOnly(cylinderAlong(Y_AXIS, 0.075, 0.82, metal, 28), 'differential-spider-cross')
  spiderY.position.set(0, 1.0, 0)
  const spiderZ = visualOnly(cylinderAlong(Z_AXIS, 0.075, 0.82, metal, 28), 'differential-spider-cross')
  spiderZ.position.set(0, 1.0, 0)
  group.add(spiderY, spiderZ)

  for (const axis of [Y_AXIS, Z_AXIS]) {
    for (const side of [-1, 1]) {
      const cone = visualOnly(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.25, 0.18, 24), pom), 'differential-spider-gear')
      cone.quaternion.setFromUnitVectors(Y_AXIS, axis.clone().multiplyScalar(side))
      cone.position.set(0, 1.0, 0).addScaledVector(axis, side * 0.25)
      group.add(cone)
    }
  }

  const inputBoss = cylinderAlong(Z_AXIS, 0.44, 0.34, shell, 48)
  inputBoss.position.set(0, 1.0, 1.02)
  inputBoss.userData.parts6HeroFeature = 'differential-input-boss'
  group.add(inputBoss)
  const inputRetainer = visualOnly(new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.045, 10, 48), metal), 'differential-input-retainer')
  inputRetainer.position.set(0, 1.0, 1.19)
  group.add(inputRetainer)

  for (let i = 0; i < 8; i += 1) {
    const a = i / 8 * Math.PI * 2
    const bolt = visualOnly(cylinderAlong(X_AXIS, 0.045, 0.05, metal, 14), 'differential-carrier-bolt')
    bolt.position.set(0.83, 1 + Math.cos(a) * 0.57, Math.sin(a) * 0.57)
    group.add(bolt)
  }

  mountingTubeFeet(group, part, shell)
  group.userData.differentialFidelity = { openCarrier: true, ringTeeth: 28, spiderGears: 4 }
  return group
}

function wrapFactory(id, decorate, quality) {
  const part = PARTS.find(item => item.id === id)
  if (!part) return false
  const previous = part.create
  patchPart(PARTS, id, {
    create: color => {
      const object = previous(color)
      decorate(object, part, color)
      object.userData.visualVersion = PARTS6_HERO_MECHANICAL_FIDELITY_VERSION
      return object
    },
    visualQuality: quality,
  })
  return true
}

const upgraded = []

for (const part of PARTS.filter(item => item.mechanics?.wheel)) {
  patchPart(PARTS, part.id, {
    create: color => createWheelHero(part, color),
    visualQuality: `parts-6-wheel-fidelity-v3-${wheelMetrics(part).family}`,
  })
  upgraded.push(part.id)
}

for (const part of PARTS.filter(item => item.mechanics?.gear?.kind === 'bevel')) {
  patchPart(PARTS, part.id, {
    create: color => createBevelGearHero(part, color),
    visualQuality: 'parts-6-bevel-fidelity-v3',
  })
  upgraded.push(part.id)
}

if (wrapFactory('universal-joint-30', addCardanDetail, 'parts-6-cardan-fidelity-v3')) upgraded.push('universal-joint-30')
if (wrapFactory('cv-joint-30', addCvDetail, 'parts-6-rzeppa-cv-fidelity-v3')) upgraded.push('cv-joint-30')

for (const [id, factory, quality] of [
  ['gearbox-fnr', createGearboxHero, 'parts-6-gearbox-housing-fidelity-v3'],
  ['open-differential', createDifferentialHero, 'parts-6-open-differential-fidelity-v3'],
]) {
  const part = PARTS.find(item => item.id === id)
  if (!part) continue
  patchPart(PARTS, id, { create: color => factory(part, color), visualQuality: quality })
  upgraded.push(id)
}

globalThis.BrickLabParts6HeroMechanicalFidelity = Object.freeze({
  version: PARTS6_HERO_MECHANICAL_FIDELITY_VERSION,
  upgraded: [...new Set(upgraded)],
  priorities: Object.freeze(['wheels', 'bevel gears', 'Cardan/CV joints', 'gearbox', 'open differential']),
  physics: 'wheel/gear colliders remain metadata-driven; gearbox/differential retain existing explicit collider profiles; Cardan/CV are decoration-only wrappers over their prior bounds',
})

window.dispatchEvent(new CustomEvent('bricklab:partcatalogchange', {
  detail: { total: PARTS.length, pack: PARTS6_HERO_MECHANICAL_FIDELITY_VERSION },
}))
