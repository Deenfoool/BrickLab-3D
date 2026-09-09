import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { PARTS } from '../parts.js'
import { patchPart } from '../parts3/part-schema-v1.js'
import {
  PARTS5_GEOMETRY_VERSION,
  TECHNIC_METRICS,
  bevelPitchConeAngle,
  gearMetrics,
  wheelMetrics,
} from './part-geometry-metrics-v1.js'

export const PARTS5_REFINEMENT_VERSION = 'parts-5-visual-refinement-v2'
const WHEEL_CENTER_Y = 1.15
const X_AXIS = new THREE.Vector3(1, 0, 0)

function absMaterial(color, roughness = 0.37) {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness,
    metalness: 0.008,
    clearcoat: 0.09,
    clearcoatRoughness: 0.52,
    ior: 1.47,
  })
}

function pomMaterial(color) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.36, metalness: 0.008 })
}

function rubberMaterial() {
  return new THREE.MeshStandardMaterial({ color: 0x101214, roughness: 0.98, metalness: 0 })
}

function darkMaterial() {
  return new THREE.MeshStandardMaterial({ color: 0x15181b, roughness: 0.86, metalness: 0.02 })
}

function metalMaterial() {
  return new THREE.MeshStandardMaterial({ color: 0xaeb7c0, roughness: 0.28, metalness: 0.72 })
}

function root(id, color) {
  const group = new THREE.Group()
  group.userData.partId = id
  group.userData.color = color
  group.userData.visualVersion = PARTS5_REFINEMENT_VERSION
  return group
}

function visualOnly(object) {
  object.userData.physicsIgnore = true
  object.userData.parts5VisualDetail = true
  return object
}

function circleHole(x, y, radius) {
  const path = new THREE.Path()
  path.absarc(x, y, radius, 0, Math.PI * 2, true)
  return path
}

function crossPoints(radius = TECHNIC_METRICS.axleRadius, arm = TECHNIC_METRICS.axleArm) {
  return [
    [-arm, radius], [arm, radius], [arm, arm], [radius, arm], [radius, -arm], [arm, -arm],
    [arm, -radius], [-arm, -radius], [-arm, -arm], [-radius, -arm], [-radius, arm], [-arm, arm],
  ]
}

function crossPath(radius = 0.205, arm = 0.082) {
  const path = new THREE.Path()
  const points = crossPoints(radius, arm)
  path.moveTo(...points[0])
  for (let i = 1; i < points.length; i += 1) path.lineTo(...points[i])
  path.closePath()
  return path
}

function roundedRectShape(width, height, radius) {
  const x = -width / 2
  const y = -height / 2
  const r = Math.min(radius, width / 2, height / 2)
  const shape = new THREE.Shape()
  shape.moveTo(x + r, y)
  shape.lineTo(x + width - r, y)
  shape.quadraticCurveTo(x + width, y, x + width, y + r)
  shape.lineTo(x + width, y + height - r)
  shape.quadraticCurveTo(x + width, y + height, x + width - r, y + height)
  shape.lineTo(x + r, y + height)
  shape.quadraticCurveTo(x, y + height, x, y + height - r)
  shape.lineTo(x, y + r)
  shape.quadraticCurveTo(x, y, x + r, y)
  shape.closePath()
  return shape
}

function annulusShape(outer, inner) {
  const shape = new THREE.Shape()
  shape.absarc(0, 0, outer, 0, Math.PI * 2, false)
  shape.holes.push(circleHole(0, 0, inner))
  return shape
}

function crossBoreShape(outer, radius = 0.205, arm = 0.082) {
  const shape = new THREE.Shape()
  shape.absarc(0, 0, outer, 0, Math.PI * 2, false)
  shape.holes.push(crossPath(radius, arm))
  return shape
}

function extrudeShape(shape, depth, material, options = {}) {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: options.bevelEnabled ?? true,
    bevelSegments: options.bevelSegments ?? 2,
    bevelSize: options.bevelSize ?? 0.012,
    bevelThickness: options.bevelThickness ?? 0.012,
    curveSegments: options.curveSegments ?? 28,
    steps: 1,
  })
  geometry.translate(0, 0, -depth / 2)
  return new THREE.Mesh(geometry, material)
}

function extrudeAlongX(shape, depth, material, options = {}) {
  const mesh = extrudeShape(shape, depth, material, options)
  mesh.rotation.y = Math.PI / 2
  return mesh
}

function involutePolar(baseRadius, radius) {
  if (!(radius > baseRadius)) return 0
  const t = Math.sqrt(Math.max(0, radius * radius / (baseRadius * baseRadius) - 1))
  return t - Math.atan(t)
}

function involuteGearOutline(metrics) {
  const shape = new THREE.Shape()
  const base = Math.max(metrics.rootRadius, metrics.baseRadius)
  const pitchInvolute = involutePolar(metrics.baseRadius, metrics.pitchRadius)
  const halfThickness = metrics.toothAngle * 0.25
  const samples = 5

  const flankHalfAngle = radius => {
    const involute = involutePolar(metrics.baseRadius, Math.max(radius, metrics.baseRadius))
    return halfThickness - (involute - pitchInvolute)
  }

  for (let tooth = 0; tooth < metrics.teeth; tooth += 1) {
    const center = tooth * metrics.toothAngle
    const baseHalf = THREE.MathUtils.clamp(
      flankHalfAngle(base),
      metrics.toothAngle * 0.24,
      metrics.toothAngle * 0.43,
    )
    const rootHalf = Math.min(metrics.toothAngle * 0.44, baseHalf + metrics.toothAngle * 0.025)
    const leftRootAngle = center - rootHalf
    const leftRoot = [Math.cos(leftRootAngle) * metrics.rootRadius, Math.sin(leftRootAngle) * metrics.rootRadius]
    if (tooth === 0) shape.moveTo(...leftRoot)
    else shape.lineTo(...leftRoot)

    if (metrics.rootRadius < base - 1e-6) {
      const a = center - baseHalf
      shape.lineTo(Math.cos(a) * base, Math.sin(a) * base)
    }

    for (let i = 0; i <= samples; i += 1) {
      const radius = base + (metrics.outerRadius - base) * (i / samples)
      const a = center - flankHalfAngle(radius)
      shape.lineTo(Math.cos(a) * radius, Math.sin(a) * radius)
    }

    const tipHalf = Math.max(metrics.toothAngle * 0.08, flankHalfAngle(metrics.outerRadius))
    for (let i = 1; i <= 3; i += 1) {
      const a = center - tipHalf + (tipHalf * 2) * (i / 3)
      shape.lineTo(Math.cos(a) * metrics.outerRadius, Math.sin(a) * metrics.outerRadius)
    }

    for (let i = samples; i >= 0; i -= 1) {
      const radius = base + (metrics.outerRadius - base) * (i / samples)
      const a = center + flankHalfAngle(radius)
      shape.lineTo(Math.cos(a) * radius, Math.sin(a) * radius)
    }

    if (metrics.rootRadius < base - 1e-6) {
      const a = center + baseHalf
      shape.lineTo(Math.cos(a) * base, Math.sin(a) * base)
    }

    const rightRootAngle = center + rootHalf
    shape.lineTo(Math.cos(rightRootAngle) * metrics.rootRadius, Math.sin(rightRootAngle) * metrics.rootRadius)
    const valley = center + metrics.toothAngle * 0.5
    shape.lineTo(Math.cos(valley) * metrics.rootRadius, Math.sin(valley) * metrics.rootRadius)
  }

  shape.closePath()
  shape.holes.push(crossPath())

  if (metrics.teeth >= 20) {
    const count = metrics.teeth >= 36 ? 8 : metrics.teeth >= 24 ? 6 : 4
    const ring = Math.max(0.52, metrics.rootRadius * 0.58)
    const holeRadius = Math.min(0.18, Math.max(0.11, metrics.pitchRadius * 0.085))
    for (let i = 0; i < count; i += 1) {
      const a = i / count * Math.PI * 2
      const x = Math.cos(a) * ring
      const y = Math.sin(a) * ring
      if (ring - holeRadius > 0.40 && ring + holeRadius < metrics.rootRadius - 0.05) {
        shape.holes.push(circleHole(x, y, holeRadius))
      }
    }
  }
  return shape
}

function addGearFaceDetails(group, metrics, material) {
  const faceRadius = Math.max(0.39, Math.min(metrics.rootRadius * 0.72, metrics.pitchRadius * 0.72))
  const ring = new THREE.TorusGeometry(faceRadius, 0.014, 6, Math.max(36, metrics.teeth * 2))
  ring.rotateX(Math.PI / 2)
  for (const side of [-1, 1]) {
    const mesh = visualOnly(new THREE.Mesh(ring, material))
    mesh.position.y = 0.40 + side * (metrics.thickness / 2 + 0.008)
    group.add(mesh)
  }

  const boreRing = new THREE.TorusGeometry(0.226, 0.012, 6, 32)
  boreRing.rotateX(Math.PI / 2)
  for (const side of [-1, 1]) {
    const mesh = visualOnly(new THREE.Mesh(boreRing, darkMaterial()))
    mesh.position.y = 0.40 + side * (metrics.thickness / 2 + 0.012)
    group.add(mesh)
  }
}

function createSpurGearRefined(part, color) {
  const metrics = gearMetrics(part.mechanics.gear.teeth, 'spur')
  const group = root(part.id, color)
  const material = pomMaterial(color)
  const gear = extrudeShape(involuteGearOutline(metrics), metrics.thickness, material, {
    bevelSegments: 3,
    bevelSize: 0.008,
    bevelThickness: 0.011,
    curveSegments: 18,
  })
  gear.rotation.x = Math.PI / 2
  gear.position.y = 0.40
  group.add(gear)

  const hub = extrudeShape(crossBoreShape(0.34), metrics.thickness + 0.075, material, {
    bevelSegments: 3,
    bevelSize: 0.008,
    bevelThickness: 0.010,
  })
  hub.rotation.x = Math.PI / 2
  hub.position.y = 0.40
  group.add(hub)
  addGearFaceDetails(group, metrics, material)
  return group
}

function frustumRingGeometry(outerLarge, outerSmall, inner, height, segments = 72) {
  const positions = []
  const indices = []
  const half = height / 2
  for (let i = 0; i <= segments; i += 1) {
    const a = i / segments * Math.PI * 2
    const c = Math.cos(a)
    const s = Math.sin(a)
    positions.push(
      c * outerLarge, -half, s * outerLarge,
      c * outerSmall, half, s * outerSmall,
      c * inner, -half, s * inner,
      c * inner, half, s * inner,
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

function bevelToothGeometryRefined(metrics, coneAngle) {
  const slices = 4
  const half = metrics.thickness / 2
  const slope = Math.tan(coneAngle)
  const positions = []
  const indices = []
  const rings = []

  for (let s = 0; s <= slices; s += 1) {
    const u = s / slices
    const y = -half + metrics.thickness * u
    const pitch = metrics.pitchRadius + slope * (-y) * 0.48
    const addendum = metrics.addendum * THREE.MathUtils.lerp(0.96, 0.68, u)
    const dedendum = metrics.dedendum * THREE.MathUtils.lerp(0.78, 0.60, u)
    const root = Math.max(0.24, pitch - dedendum)
    const tip = pitch + addendum
    const rootHalf = metrics.toothAngle * THREE.MathUtils.lerp(0.34, 0.28, u)
    const tipHalf = metrics.toothAngle * THREE.MathUtils.lerp(0.145, 0.105, u)
    const ring = []
    for (const [radius, angle] of [
      [root, -rootHalf], [tip, -tipHalf], [tip, tipHalf], [root, rootHalf],
    ]) {
      positions.push(Math.cos(angle) * radius, y, Math.sin(angle) * radius)
      ring.push(positions.length / 3 - 1)
    }
    rings.push(ring)
  }

  for (let s = 0; s < slices; s += 1) {
    const a = rings[s]
    const b = rings[s + 1]
    for (let edge = 0; edge < 4; edge += 1) {
      const next = (edge + 1) % 4
      indices.push(a[edge], b[edge], b[next], a[edge], b[next], a[next])
    }
  }
  indices.push(
    rings[0][0], rings[0][1], rings[0][2], rings[0][0], rings[0][2], rings[0][3],
    rings[slices][2], rings[slices][1], rings[slices][0], rings[slices][3], rings[slices][2], rings[slices][0],
  )

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function createBevelGearRefined(part, color) {
  const metrics = gearMetrics(part.mechanics.gear.teeth, 'bevel')
  const coneAngle = bevelPitchConeAngle(metrics.teeth)
  const group = root(part.id, color)
  const material = pomMaterial(color)
  const half = metrics.thickness / 2
  const slope = Math.tan(coneAngle)
  const outerLarge = Math.max(0.40, metrics.pitchRadius + metrics.addendum * 0.25 + slope * half * 0.44)
  const outerSmall = Math.max(0.34, metrics.pitchRadius - metrics.addendum * 0.10 - slope * half * 0.44)
  const body = new THREE.Mesh(
    frustumRingGeometry(outerLarge, outerSmall, 0.315, metrics.thickness, Math.max(60, metrics.teeth * 4)),
    material,
  )
  body.position.y = 0.40
  group.add(body)

  const toothGeometry = bevelToothGeometryRefined(metrics, coneAngle)
  const teeth = new THREE.InstancedMesh(toothGeometry, material, metrics.teeth)
  const matrix = new THREE.Matrix4()
  const quaternion = new THREE.Quaternion()
  const scale = new THREE.Vector3(1, 1, 1)
  for (let i = 0; i < metrics.teeth; i += 1) {
    quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), i / metrics.teeth * Math.PI * 2)
    matrix.compose(new THREE.Vector3(0, 0.40, 0), quaternion, scale)
    teeth.setMatrixAt(i, matrix)
  }
  teeth.instanceMatrix.needsUpdate = true
  group.add(teeth)

  const hub = extrudeShape(crossBoreShape(0.35), metrics.thickness + 0.10, material, {
    bevelSegments: 3,
    bevelSize: 0.008,
    bevelThickness: 0.010,
  })
  hub.rotation.x = Math.PI / 2
  hub.position.y = 0.40
  group.add(hub)
  addGearFaceDetails(group, metrics, material)
  return group
}

function smoothTyreProfile(metrics) {
  const half = metrics.width / 2
  const inner = metrics.beadRadius
  const shoulderDrop = metrics.family === 'tractor' ? 0.080 : metrics.family === 'offroad' ? 0.060 : 0.040
  const points = [
    new THREE.Vector2(inner, -half * 0.72),
    new THREE.Vector2(inner * 1.015, -half * 0.86),
    new THREE.Vector2(inner * 1.055, -half * 0.95),
  ]

  const outerSamples = 12
  for (let i = 0; i <= outerSamples; i += 1) {
    const t = -1 + i * 2 / outerSamples
    const edge = Math.pow(Math.abs(t), 2.35)
    const radius = metrics.carcassRadius * (1 - shoulderDrop * edge)
    points.push(new THREE.Vector2(radius, half * t))
  }

  points.push(
    new THREE.Vector2(inner * 1.055, half * 0.95),
    new THREE.Vector2(inner * 1.015, half * 0.86),
    new THREE.Vector2(inner, half * 0.72),
    new THREE.Vector2(inner, -half * 0.72),
  )
  return points
}

function taperedSpokeGeometry(metrics) {
  const inner = metrics.hubRadius * 1.04
  const outer = metrics.rimOuterRadius * 0.84
  const innerHalf = Math.max(0.045, metrics.radius * 0.038)
  const outerHalf = Math.max(0.075, metrics.radius * 0.068)
  const shape = new THREE.Shape()
  shape.moveTo(-innerHalf, inner)
  shape.lineTo(-outerHalf, outer)
  shape.quadraticCurveTo(0, outer + metrics.radius * 0.025, outerHalf, outer)
  shape.lineTo(innerHalf, inner)
  shape.quadraticCurveTo(0, inner - metrics.radius * 0.015, -innerHalf, inner)
  shape.closePath()
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.10, metrics.width * 0.30),
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: Math.min(0.018, metrics.radius * 0.012),
    bevelThickness: Math.min(0.018, metrics.radius * 0.012),
    curveSegments: 10,
  })
  geometry.translate(0, 0, -Math.max(0.10, metrics.width * 0.30) / 2)
  geometry.rotateY(Math.PI / 2)
  return geometry
}

function addRefinedSpokes(group, metrics, material) {
  const geometry = taperedSpokeGeometry(metrics)
  for (let i = 0; i < metrics.spokes; i += 1) {
    const spoke = new THREE.Mesh(geometry, material)
    spoke.position.y = WHEEL_CENTER_Y
    spoke.rotation.x = i / metrics.spokes * Math.PI * 2
    group.add(spoke)
  }
}

function addInstancedTread(group, metrics, material) {
  const family = metrics.family
  const radial = metrics.carcassRadius + metrics.lugHeight * 0.48
  const instances = family === 'tractor' ? metrics.treadCount * 2 : family === 'road' ? metrics.treadCount * 2 : metrics.treadCount
  const axialWidth = family === 'tractor'
    ? metrics.width * 0.60
    : family === 'offroad'
      ? metrics.width * 0.56
      : family === 'narrow'
        ? metrics.width * 0.70
        : metrics.width * 0.28
  const tangentDepth = family === 'tractor'
    ? metrics.radius * 0.18
    : family === 'offroad'
      ? metrics.radius * 0.145
      : family === 'narrow'
        ? metrics.radius * 0.060
        : metrics.radius * 0.064
  const radialHeight = Math.max(0.022, metrics.lugHeight)
  const geometry = new RoundedBoxGeometry(
    Math.max(0.055, axialWidth),
    radialHeight,
    Math.max(0.05, tangentDepth),
    2,
    Math.min(0.020, radialHeight * 0.24),
  )
  const mesh = visualOnly(new THREE.InstancedMesh(geometry, material, instances))
  const matrix = new THREE.Matrix4()
  const radialQ = new THREE.Quaternion()
  const chevronQ = new THREE.Quaternion()
  const quaternion = new THREE.Quaternion()
  const scale = new THREE.Vector3(1, 1, 1)
  let index = 0

  const place = (angle, x, tilt = 0) => {
    const offset = new THREE.Vector3(x, radial, 0).applyAxisAngle(X_AXIS, angle)
    radialQ.setFromAxisAngle(X_AXIS, angle)
    chevronQ.setFromAxisAngle(new THREE.Vector3(0, 1, 0), tilt)
    quaternion.copy(radialQ).multiply(chevronQ)
    matrix.compose(new THREE.Vector3(offset.x, WHEEL_CENTER_Y + offset.y, offset.z), quaternion, scale)
    mesh.setMatrixAt(index++, matrix)
  }

  for (let i = 0; i < metrics.treadCount; i += 1) {
    const angle = i / metrics.treadCount * Math.PI * 2
    if (family === 'tractor') {
      place(angle, -metrics.width * 0.20, 0.52)
      place(angle, metrics.width * 0.20, -0.52)
    } else if (family === 'offroad') {
      const side = i % 2 ? 1 : -1
      place(angle, side * metrics.width * 0.17, side * 0.13)
    } else if (family === 'road') {
      place(angle, -metrics.width * 0.22, 0.09)
      place(angle, metrics.width * 0.22, -0.09)
    } else {
      place(angle, 0, i % 2 ? 0.025 : -0.025)
    }
  }
  mesh.instanceMatrix.needsUpdate = true
  group.add(mesh)
}

function addSidewallDetails(group, metrics, material) {
  const radius = metrics.carcassRadius * 0.84
  const ringGeometry = new THREE.TorusGeometry(radius, Math.max(0.010, metrics.radius * 0.008), 6, 64)
  ringGeometry.rotateY(Math.PI / 2)
  for (const side of [-1, 1]) {
    const ring = visualOnly(new THREE.Mesh(ringGeometry, material))
    ring.position.set(side * metrics.width * 0.46, WHEEL_CENTER_Y, 0)
    group.add(ring)
  }
}

function createWheelRefined(part, color) {
  const metrics = wheelMetrics(part)
  const group = root(part.id, color)
  const rubber = rubberMaterial()
  const rim = absMaterial(color, 0.35)

  const tyre = new THREE.Mesh(new THREE.LatheGeometry(smoothTyreProfile(metrics), 88), rubber)
  tyre.rotation.z = -Math.PI / 2
  tyre.position.y = WHEEL_CENTER_Y
  group.add(tyre)
  addInstancedTread(group, metrics, rubber)
  addSidewallDetails(group, metrics, rubber)

  const barrel = extrudeAlongX(
    annulusShape(metrics.rimOuterRadius, Math.max(metrics.hubRadius * 1.35, metrics.rimOuterRadius * 0.66)),
    metrics.width * 0.76,
    rim,
    { bevelSegments: 3, bevelSize: 0.010, bevelThickness: 0.010 },
  )
  barrel.position.y = WHEEL_CENTER_Y
  group.add(barrel)

  const dishOuter = metrics.rimOuterRadius * 0.79
  const dishInner = metrics.hubRadius * 1.20
  const dishShape = annulusShape(dishOuter, dishInner)
  for (const side of [-1, 1]) {
    const dish = extrudeAlongX(dishShape, Math.max(0.035, metrics.width * 0.045), rim, {
      bevelSegments: 2,
      bevelSize: 0.006,
      bevelThickness: 0.006,
    })
    dish.position.set(side * metrics.width * 0.22, WHEEL_CENTER_Y, 0)
    group.add(dish)
  }

  addRefinedSpokes(group, metrics, rim)

  const hub = extrudeAlongX(crossBoreShape(metrics.hubRadius), metrics.width * 0.86, rim, {
    bevelSegments: 3,
    bevelSize: 0.009,
    bevelThickness: 0.009,
  })
  hub.position.y = WHEEL_CENTER_Y
  group.add(hub)

  const flange = annulusShape(metrics.rimOuterRadius * 1.025, metrics.rimOuterRadius * 0.90)
  for (const side of [-1, 1]) {
    const lip = extrudeAlongX(flange, Math.max(0.04, metrics.width * 0.052), rim, {
      bevelSegments: 2,
      bevelSize: 0.006,
      bevelThickness: 0.006,
    })
    lip.position.set(side * metrics.width * 0.385, WHEEL_CENTER_Y, 0)
    group.add(lip)
  }

  const boreShade = visualOnly(extrudeAlongX(annulusShape(0.229, 0.207), metrics.width * 0.90, darkMaterial(), {
    bevelEnabled: false,
  }))
  boreShade.position.y = WHEEL_CENTER_Y
  group.add(boreShade)
  return group
}

function createBushRefined(part, color) {
  const width = Math.max(0.30, Number(part.dimensions?.lengthStud) || (part.id === 'half-bush' ? 0.38 : 0.72))
  const group = root(part.id, color)
  const material = absMaterial(color, 0.39)
  const shell = extrudeAlongX(crossBoreShape(0.39, 0.198, 0.078), width, material, {
    bevelSegments: 3,
    bevelSize: 0.010,
    bevelThickness: 0.012,
  })
  shell.position.y = 0.36
  group.add(shell)
  const groove = new THREE.TorusGeometry(0.315, 0.025, 6, 36)
  groove.rotateY(Math.PI / 2)
  const grooveMesh = visualOnly(new THREE.Mesh(groove, darkMaterial()))
  grooveMesh.position.y = 0.36
  group.add(grooveMesh)
  return group
}

function createAxleCouplerRefined(part, color) {
  const group = root(part.id, color)
  const material = absMaterial(color, 0.39)
  const shell = extrudeAlongX(crossBoreShape(0.40, 0.198, 0.078), 1.50, material, {
    bevelSegments: 3,
    bevelSize: 0.010,
    bevelThickness: 0.014,
  })
  shell.position.y = 0.38
  group.add(shell)
  for (const x of [-0.50, 0.50]) {
    const bandGeo = new THREE.TorusGeometry(0.325, 0.021, 6, 36)
    bandGeo.rotateY(Math.PI / 2)
    const band = visualOnly(new THREE.Mesh(bandGeo, darkMaterial()))
    band.position.set(x, 0.38, 0)
    group.add(band)
  }
  return group
}

function createTieRodRefined(part, color) {
  const group = root(part.id, color)
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 3.56, 24), metalMaterial())
  rod.rotation.z = Math.PI / 2
  rod.position.y = 0.34
  group.add(rod)
  const eyeMat = absMaterial(color, 0.41)
  for (const x of [-2, 2]) {
    const eyeShape = annulusShape(0.30, 0.245)
    const eye = extrudeShape(eyeShape, 0.30, eyeMat, {
      bevelSegments: 3,
      bevelSize: 0.012,
      bevelThickness: 0.012,
    })
    eye.rotation.x = Math.PI / 2
    eye.position.set(x, 0.34, 0)
    group.add(eye)
    const neck = new THREE.Mesh(new RoundedBoxGeometry(0.42, 0.18, 0.24, 3, 0.055), eyeMat)
    neck.position.set(x > 0 ? x - 0.25 : x + 0.25, 0.34, 0)
    group.add(neck)
  }
  return group
}

function createWheelHubRefined(part, color) {
  const group = root(part.id, color)
  const material = absMaterial(color, 0.40)
  const barrel = extrudeAlongX(annulusShape(0.47, 0.255), 0.70, material, {
    bevelSegments: 3,
    bevelSize: 0.012,
    bevelThickness: 0.012,
  })
  barrel.position.y = 0.58
  group.add(barrel)

  const flange = extrudeAlongX(annulusShape(0.54, 0.30), 0.16, material, {
    bevelSegments: 3,
    bevelSize: 0.010,
    bevelThickness: 0.010,
  })
  flange.position.set(0.26, 0.58, 0)
  group.add(flange)

  const bearing = visualOnly(extrudeAlongX(annulusShape(0.295, 0.245), 0.14, darkMaterial(), { bevelEnabled: false }))
  bearing.position.set(-0.36, 0.58, 0)
  group.add(bearing)

  const stubShape = new THREE.Shape()
  const points = crossPoints(0.18, 0.074)
  stubShape.moveTo(...points[0])
  for (let i = 1; i < points.length; i += 1) stubShape.lineTo(...points[i])
  stubShape.closePath()
  const stub = extrudeAlongX(stubShape, 0.72, material, {
    bevelSegments: 2,
    bevelSize: 0.010,
    bevelThickness: 0.014,
  })
  stub.position.set(0.47, 0.58, 0)
  group.add(stub)
  return group
}

function createSteeringKnuckleRefined(part, color) {
  const group = root(part.id, color)
  const material = absMaterial(color, 0.41)

  const bearing = extrudeAlongX(annulusShape(0.36, 0.245), 0.78, material, {
    bevelSegments: 3,
    bevelSize: 0.012,
    bevelThickness: 0.012,
  })
  bearing.position.y = 0.55
  group.add(bearing)

  const upright = new THREE.Mesh(new RoundedBoxGeometry(0.42, 0.86, 0.48, 4, 0.13), material)
  upright.position.set(0, 0.66, -0.19)
  upright.rotation.x = -0.12
  group.add(upright)

  const pivotBoss = new THREE.Mesh(new THREE.CylinderGeometry(0.255, 0.285, 0.30, 36), material)
  pivotBoss.position.y = 0.88
  group.add(pivotBoss)
  const pivotPin = new THREE.Mesh(new THREE.CylinderGeometry(0.168, 0.168, 0.46, 28), darkMaterial())
  pivotPin.position.y = 0.95
  group.add(pivotPin)

  const arm = new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.20, 0.92, 4, 0.08), material)
  arm.position.set(0, 0.55, 0.46)
  arm.rotation.x = 0.04
  group.add(arm)
  const armBoss = new THREE.Mesh(new THREE.CylinderGeometry(0.255, 0.255, 0.24, 32), material)
  armBoss.position.set(0, 0.55, 0.72)
  group.add(armBoss)
  return group
}

function createRackGuideRefined(part, color) {
  const group = root(part.id, color)
  const material = absMaterial(color, 0.43)
  const top = new THREE.Mesh(new RoundedBoxGeometry(6.70, 0.22, 1.18, 4, 0.08), material)
  top.position.y = 1.04
  const bottom = new THREE.Mesh(new RoundedBoxGeometry(6.70, 0.22, 1.18, 4, 0.08), material)
  bottom.position.y = 0.20
  const back = new THREE.Mesh(new RoundedBoxGeometry(6.70, 0.66, 0.18, 4, 0.06), material)
  back.position.set(0, 0.62, -0.50)
  group.add(top, bottom, back)
  const guide = visualOnly(new THREE.Mesh(new RoundedBoxGeometry(6.12, 0.08, 0.56, 3, 0.025), darkMaterial()))
  guide.position.set(0, 0.62, -0.34)
  group.add(guide)
  return group
}

function rackToothGeometry() {
  const shape = new THREE.Shape()
  shape.moveTo(-0.095, 0)
  shape.lineTo(-0.060, 0.15)
  shape.lineTo(0.060, 0.15)
  shape.lineTo(0.095, 0)
  shape.closePath()
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.38,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.008,
    bevelThickness: 0.008,
  })
  geometry.translate(0, 0, -0.19)
  return geometry
}

function createSteeringRackRefined(part, color) {
  const group = root(part.id, color)
  const metal = metalMaterial()
  const rail = new THREE.Mesh(new RoundedBoxGeometry(6.20, 0.28, 0.36, 3, 0.07), metal)
  rail.position.y = 0.62
  group.add(rail)
  const toothGeometry = rackToothGeometry()
  const teeth = new THREE.InstancedMesh(toothGeometry, metal, 31)
  const matrix = new THREE.Matrix4()
  for (let i = 0; i < 31; i += 1) {
    matrix.makeTranslation((i - 15) * 0.19, 0.76, 0)
    teeth.setMatrixAt(i, matrix)
  }
  teeth.instanceMatrix.needsUpdate = true
  group.add(teeth)

  const armMat = absMaterial(color, 0.41)
  for (const x of [-2.85, 2.85]) {
    const arm = new THREE.Mesh(new RoundedBoxGeometry(0.42, 0.26, 0.92, 3, 0.08), armMat)
    arm.position.set(x, 0.62, 0.40)
    group.add(arm)
    const boss = new THREE.Mesh(new THREE.CylinderGeometry(0.255, 0.255, 0.25, 32), armMat)
    boss.position.set(x, 0.62, 0.82)
    group.add(boss)
  }
  return group
}

function eyeGeometry(outer = 0.31, inner = 0.225, depth = 0.30) {
  return extrudeShape(annulusShape(outer, inner), depth, absMaterial(0xffffff), {
    bevelSegments: 3,
    bevelSize: 0.012,
    bevelThickness: 0.012,
  }).geometry
}

function createShockBodyRefined(part, color) {
  const group = root(part.id, color)
  const material = absMaterial(color, 0.42)
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.39, 0.43, 2.30, 40), material)
  shell.position.y = 1.55
  group.add(shell)
  const lowerEye = extrudeShape(annulusShape(0.31, 0.225), 0.30, material, {
    bevelSegments: 3,
    bevelSize: 0.012,
    bevelThickness: 0.012,
  })
  lowerEye.rotation.x = Math.PI / 2
  lowerEye.position.set(0, 0.32, 0)
  group.add(lowerEye)
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.47, 0.18, 40), material)
  collar.position.y = 2.70
  group.add(collar)
  const innerGuide = visualOnly(new THREE.Mesh(new THREE.CylinderGeometry(0.185, 0.185, 0.20, 32), darkMaterial()))
  innerGuide.position.y = 2.76
  group.add(innerGuide)
  return group
}

function helicalSpringGeometry(radius, tubeRadius, height, turns) {
  const points = []
  const segments = 96
  for (let i = 0; i <= segments; i += 1) {
    const u = i / segments
    const a = u * Math.PI * 2 * turns
    points.push(new THREE.Vector3(Math.cos(a) * radius, u * height, Math.sin(a) * radius))
  }
  const path = new THREE.CatmullRomCurve3(points, false, 'centripetal')
  return new THREE.TubeGeometry(path, segments, tubeRadius, 8, false)
}

function createShockRodRefined(part, color) {
  const group = root(part.id, color)
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.145, 0.145, 2.52, 28), metalMaterial())
  rod.position.y = 1.55
  group.add(rod)

  const spring = new THREE.Mesh(helicalSpringGeometry(0.33, 0.045, 2.12, 7.5), absMaterial(color, 0.46))
  spring.position.y = 0.38
  group.add(spring)

  const topEye = extrudeShape(annulusShape(0.31, 0.225), 0.30, absMaterial(color, 0.42), {
    bevelSegments: 3,
    bevelSize: 0.012,
    bevelThickness: 0.012,
  })
  topEye.rotation.x = Math.PI / 2
  topEye.position.set(0, 2.88, 0)
  group.add(topEye)
  return group
}

const upgraded = []

for (const part of PARTS) {
  if (part.mechanics?.wheel) {
    patchPart(PARTS, part.id, {
      create: color => createWheelRefined(part, color),
      visualQuality: 'parts-5-refined-profiled-wheel-v2',
      geometryMetricsVersion: PARTS5_GEOMETRY_VERSION,
    })
    upgraded.push(part.id)
    continue
  }

  if (part.mechanics?.gear) {
    const kind = part.mechanics.gear.kind ?? 'spur'
    patchPart(PARTS, part.id, {
      create: color => kind === 'bevel' ? createBevelGearRefined(part, color) : createSpurGearRefined(part, color),
      visualQuality: kind === 'bevel' ? 'parts-5-refined-bevel-v2' : 'parts-5-involute-spur-v2',
      geometryMetricsVersion: PARTS5_GEOMETRY_VERSION,
    })
    upgraded.push(part.id)
  }
}

for (const id of ['bush', 'half-bush']) {
  const part = PARTS.find(item => item.id === id)
  if (!part) continue
  patchPart(PARTS, id, { create: color => createBushRefined(part, color), visualQuality: 'parts-5-true-cross-bore-v2' })
  upgraded.push(id)
}

for (const [id, factory, quality] of [
  ['axle-coupler', createAxleCouplerRefined, 'parts-5-true-cross-bore-v2'],
  ['steering-tie-rod-5', createTieRodRefined, 'parts-5-steering-link-v2'],
  ['wheel-hub', createWheelHubRefined, 'parts-5-wheel-hub-v2'],
  ['steering-knuckle', createSteeringKnuckleRefined, 'parts-5-steering-knuckle-v2'],
  ['steering-rack-guide', createRackGuideRefined, 'parts-5-rack-guide-v2'],
  ['steering-rack-7', createSteeringRackRefined, 'parts-5-rack-v2'],
  ['shock-body-5', createShockBodyRefined, 'parts-5-shock-body-v2'],
  ['shock-rod-5', createShockRodRefined, 'parts-5-helical-spring-v2'],
]) {
  const part = PARTS.find(item => item.id === id)
  if (!part) continue
  patchPart(PARTS, id, { create: color => factory(part, color), visualQuality: quality })
  upgraded.push(id)
}

globalThis.BrickLabParts5Refinement = Object.freeze({
  version: PARTS5_REFINEMENT_VERSION,
  upgraded: [...new Set(upgraded)],
  gearProfile: 'approximate involute flank derived from canonical base/pitch/outer radii',
  wheelProfile: 'smooth lathed carcass + instanced family-specific tread + tapered rim spokes',
})

window.dispatchEvent(new CustomEvent('bricklab:partcatalogchange', {
  detail: { total: PARTS.length, pack: PARTS5_REFINEMENT_VERSION },
}))
