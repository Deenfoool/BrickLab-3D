import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { PARTS } from '../parts.js'
import { patchPart } from '../parts3/part-schema-v1.js'
import {
  PARTS5_GEOMETRY_VERSION,
  TECHNIC_METRICS,
  bevelPitchConeAngle,
  gearMetrics,
  gearPitchRadius,
  wheelMetrics,
} from './part-geometry-metrics-v1.js'

export const PARTS5_VISUAL_VERSION = 'parts-5-visual-overhaul-v1'
const WHEEL_CENTER_Y = 1.15
const X_AXIS = new THREE.Vector3(1, 0, 0)

function absMaterial(color, options = {}) {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: options.roughness ?? 0.38,
    metalness: 0.01,
    clearcoat: options.clearcoat ?? 0.11,
    clearcoatRoughness: options.clearcoatRoughness ?? 0.48,
    ior: 1.47,
  })
}

function pomMaterial(color) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.32, metalness: 0.015 })
}

function rubberMaterial() {
  return new THREE.MeshStandardMaterial({ color: 0x111315, roughness: 0.97, metalness: 0 })
}

function darkMaterial() {
  return new THREE.MeshStandardMaterial({ color: 0x17191c, roughness: 0.82, metalness: 0.025 })
}

function root(id, color) {
  const group = new THREE.Group()
  group.userData.partId = id
  group.userData.color = color
  group.userData.visualVersion = PARTS5_VISUAL_VERSION
  return group
}

function markVisualDetail(object) {
  object.userData.physicsIgnore = true
  object.userData.parts5VisualDetail = true
  return object
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

function crossShape(radius = TECHNIC_METRICS.axleRadius, arm = TECHNIC_METRICS.axleArm) {
  const shape = new THREE.Shape()
  const points = crossPoints(radius, arm)
  shape.moveTo(...points[0])
  for (let i = 1; i < points.length; i += 1) shape.lineTo(...points[i])
  shape.closePath()
  return shape
}

function crossPath(radius = 0.205, arm = 0.082) {
  const path = new THREE.Path()
  const points = crossPoints(radius, arm)
  path.moveTo(...points[0])
  for (let i = 1; i < points.length; i += 1) path.lineTo(...points[i])
  path.closePath()
  return path
}

function annulusShape(outerRadius, innerRadius) {
  const shape = new THREE.Shape()
  shape.absarc(0, 0, outerRadius, 0, Math.PI * 2, false)
  shape.holes.push(circleHole(0, 0, innerRadius))
  return shape
}

function extrudeShape(shape, depth, material, options = {}) {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: options.bevelEnabled ?? true,
    bevelSegments: options.bevelSegments ?? 2,
    bevelSize: options.bevelSize ?? 0.014,
    bevelThickness: options.bevelThickness ?? 0.014,
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

function createBeamV5(part, color, depth = TECHNIC_METRICS.beamDepth) {
  const length = Number(part?.dimensions?.lengthStud) || Number(part?.id?.match(/(\d+)$/)?.[1]) || 2
  const g = root(part.id, color)
  const material = absMaterial(color)
  const shape = roundedRectShape(Math.max(0.90, length - 0.10), TECHNIC_METRICS.beamHeight, 0.43)
  for (let i = 0; i < length; i += 1) {
    shape.holes.push(circleHole(i - (length - 1) / 2, 0, TECHNIC_METRICS.pinHoleRadius))
  }
  const body = extrudeShape(shape, depth, material, { bevelSegments: 3, bevelSize: 0.018, bevelThickness: 0.018 })
  body.position.y = 0.45
  g.add(body)
  return g
}

function createTechnicBrickV5(part, color) {
  const length = Number(part?.dimensions?.lengthStud) || Number(part?.id?.match(/1x(\d+)$/)?.[1]) || 2
  const g = root(part.id, color)
  const material = absMaterial(color)
  const bodyShape = roundedRectShape(Math.max(1, length - 0.08), 1.12, 0.10)
  const holes = Math.max(1, length - 1)
  for (let i = 0; i < holes; i += 1) bodyShape.holes.push(circleHole(i - (holes - 1) / 2, 0, 0.225))
  const body = extrudeShape(bodyShape, 0.88, material, { bevelSegments: 3, bevelSize: 0.015, bevelThickness: 0.018 })
  body.position.y = 0.60
  g.add(body)

  const studGeometry = new THREE.CylinderGeometry(0.295, 0.305, 0.18, 36)
  for (let i = 0; i < length; i += 1) {
    const stud = new THREE.Mesh(studGeometry, material)
    stud.position.set(i - (length - 1) / 2, 1.29, 0)
    g.add(stud)
  }
  return g
}

function createAxleV5(part, color) {
  const length = Math.max(0.5, Number(part?.dimensions?.lengthStud) || Number(part?.id?.match(/(\d+)$/)?.[1]) || 3)
  const g = root(part.id, color)
  const geometry = new THREE.ExtrudeGeometry(crossShape(), {
    depth: Math.max(0.25, length - 0.08),
    bevelEnabled: true,
    bevelSegments: 3,
    bevelSize: 0.012,
    bevelThickness: 0.026,
  })
  geometry.center()
  geometry.rotateY(Math.PI / 2)
  const shaft = new THREE.Mesh(geometry, absMaterial(color, { roughness: 0.34, clearcoat: 0.06 }))
  shaft.position.y = 0.32
  g.add(shaft)
  return g
}

function createPinV5(part, color, length, friction = true) {
  const g = root(part.id, color)
  const material = absMaterial(color, { roughness: friction ? 0.44 : 0.36, clearcoat: 0.04 })

  const centerLength = Math.max(0.20, length - 0.22)
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.166, 0.166, centerLength, 32), material)
  core.rotation.x = Math.PI / 2
  core.position.y = 0.28
  g.add(core)

  for (const side of [-1, 1]) {
    const end = new THREE.Mesh(new THREE.CylinderGeometry(0.145, 0.171, 0.18, 32), material)
    end.rotation.x = Math.PI / 2
    end.position.set(0, 0.28, side * (length / 2 - 0.09))
    g.add(end)
  }

  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.264, 0.264, 0.13, 36), material)
  collar.rotation.x = Math.PI / 2
  collar.position.y = 0.28
  g.add(collar)

  if (friction) {
    for (const z of [-length * 0.31, length * 0.31]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.173, 0.022, 7, 28), material)
      ring.position.set(0, 0.28, z)
      g.add(ring)
    }
  }

  // The molded split at each end is recessed visual detail; it is deliberately
  // excluded from physics so the pin collider remains stable and cylindrical.
  for (const side of [-1, 1]) {
    const slit = markVisualDetail(new THREE.Mesh(new RoundedBoxGeometry(0.050, 0.11, 0.008, 2, 0.008), darkMaterial()))
    slit.position.set(0, 0.28, side * (length / 2 + 0.004))
    g.add(slit)
  }
  return g
}

function gearOutline(metrics) {
  const shape = new THREE.Shape()
  for (let tooth = 0; tooth < metrics.teeth; tooth += 1) {
    const center = tooth * metrics.toothAngle
    const points = [
      [center - metrics.toothAngle * 0.50, metrics.rootRadius],
      [center - metrics.toothAngle * 0.34, metrics.rootRadius],
      [center - metrics.toothAngle * 0.24, metrics.pitchRadius],
      [center - metrics.toothAngle * 0.135, metrics.outerRadius],
      [center + metrics.toothAngle * 0.135, metrics.outerRadius],
      [center + metrics.toothAngle * 0.24, metrics.pitchRadius],
      [center + metrics.toothAngle * 0.34, metrics.rootRadius],
      [center + metrics.toothAngle * 0.50, metrics.rootRadius],
    ]
    for (const [angle, radius] of points) {
      const x = Math.cos(angle) * radius
      const y = Math.sin(angle) * radius
      if (tooth === 0 && angle === points[0][0]) shape.moveTo(x, y)
      else shape.lineTo(x, y)
    }
  }
  shape.closePath()
  shape.holes.push(crossPath())

  if (metrics.teeth >= 20) {
    const holeCount = metrics.teeth >= 36 ? 8 : metrics.teeth >= 24 ? 6 : 4
    const holeRing = (metrics.rootRadius + 0.34) * 0.53
    const holeRadius = Math.min(0.16, Math.max(0.10, metrics.pitchRadius * 0.095))
    for (let i = 0; i < holeCount; i += 1) {
      const angle = i / holeCount * Math.PI * 2
      const x = Math.cos(angle) * holeRing
      const y = Math.sin(angle) * holeRing
      if (Math.hypot(x, y) - holeRadius > 0.36) shape.holes.push(circleHole(x, y, holeRadius))
    }
  }
  return shape
}

function createSpurGearV5(part, color) {
  const metrics = gearMetrics(part.mechanics.gear.teeth, 'spur')
  const g = root(part.id, color)
  const pom = pomMaterial(color)
  const gear = extrudeShape(gearOutline(metrics), metrics.thickness, pom, {
    bevelSegments: 2,
    bevelSize: 0.010,
    bevelThickness: 0.012,
    curveSegments: 16,
  })
  gear.rotation.x = Math.PI / 2
  gear.position.y = 0.40
  g.add(gear)

  const hubShape = new THREE.Shape()
  hubShape.absarc(0, 0, 0.33, 0, Math.PI * 2, false)
  hubShape.holes.push(crossPath())
  const hub = extrudeShape(hubShape, metrics.thickness + 0.08, pom, { bevelSegments: 2, bevelSize: 0.009, bevelThickness: 0.010 })
  hub.rotation.x = Math.PI / 2
  hub.position.y = 0.40
  g.add(hub)
  return g
}

function bevelToothGeometry(metrics, pitchConeAngle) {
  const halfHeight = metrics.thickness / 2
  const slope = Math.tan(pitchConeAngle)
  const pitchLarge = metrics.pitchRadius + slope * halfHeight * 0.50
  const pitchSmall = Math.max(0.30, metrics.pitchRadius - slope * halfHeight * 0.50)
  const addendum = metrics.addendum * 0.90
  const rootInset = metrics.dedendum * 0.70
  const angle = metrics.toothAngle

  const vertices = []
  const faces = []
  const addVertex = (radius, theta, y) => {
    vertices.push(Math.cos(theta) * radius, y, Math.sin(theta) * radius)
    return vertices.length / 3 - 1
  }

  const large = [
    addVertex(Math.max(0.24, pitchLarge - rootInset), -angle * 0.33, -halfHeight),
    addVertex(pitchLarge + addendum, -angle * 0.14, -halfHeight),
    addVertex(pitchLarge + addendum, angle * 0.14, -halfHeight),
    addVertex(Math.max(0.24, pitchLarge - rootInset), angle * 0.33, -halfHeight),
  ]
  const small = [
    addVertex(Math.max(0.23, pitchSmall - rootInset * 0.78), -angle * 0.30, halfHeight),
    addVertex(pitchSmall + addendum * 0.72, -angle * 0.12, halfHeight),
    addVertex(pitchSmall + addendum * 0.72, angle * 0.12, halfHeight),
    addVertex(Math.max(0.23, pitchSmall - rootInset * 0.78), angle * 0.30, halfHeight),
  ]

  faces.push(
    large[0], large[1], large[2], large[0], large[2], large[3],
    small[2], small[1], small[0], small[3], small[2], small[0],
  )
  for (let i = 0; i < 4; i += 1) {
    const next = (i + 1) % 4
    faces.push(large[i], small[i], small[next], large[i], small[next], large[next])
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geometry.setIndex(faces)
  geometry.computeVertexNormals()
  return geometry
}

function frustumRingGeometry(outerLarge, outerSmall, innerRadius, height, segments = 64) {
  const vertices = []
  const indices = []
  const half = height / 2
  for (let i = 0; i <= segments; i += 1) {
    const angle = i / segments * Math.PI * 2
    const c = Math.cos(angle)
    const s = Math.sin(angle)
    vertices.push(
      c * outerLarge, -half, s * outerLarge,
      c * outerSmall, half, s * outerSmall,
      c * innerRadius, -half, s * innerRadius,
      c * innerRadius, half, s * innerRadius,
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
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function createBevelGearV5(part, color) {
  const metrics = gearMetrics(part.mechanics.gear.teeth, 'bevel')
  const coneAngle = bevelPitchConeAngle(metrics.teeth)
  const g = root(part.id, color)
  const pom = pomMaterial(color)
  const half = metrics.thickness / 2
  const slope = Math.tan(coneAngle)
  const outerLarge = Math.max(0.40, metrics.pitchRadius + metrics.addendum * 0.35 + slope * half * 0.42)
  const outerSmall = Math.max(0.34, metrics.pitchRadius - metrics.addendum * 0.10 - slope * half * 0.42)
  const body = new THREE.Mesh(frustumRingGeometry(outerLarge, outerSmall, 0.31, metrics.thickness, Math.max(48, metrics.teeth * 3)), pom)
  body.position.y = 0.40
  g.add(body)

  const toothGeometry = bevelToothGeometry(metrics, coneAngle)
  for (let i = 0; i < metrics.teeth; i += 1) {
    const tooth = new THREE.Mesh(toothGeometry, pom)
    tooth.rotation.y = i / metrics.teeth * Math.PI * 2
    tooth.position.y = 0.40
    g.add(tooth)
  }

  const hubShape = new THREE.Shape()
  hubShape.absarc(0, 0, 0.34, 0, Math.PI * 2, false)
  hubShape.holes.push(crossPath())
  const hub = extrudeShape(hubShape, metrics.thickness + 0.10, pom, { bevelSegments: 2, bevelSize: 0.009, bevelThickness: 0.010 })
  hub.rotation.x = Math.PI / 2
  hub.position.y = 0.40
  g.add(hub)
  return g
}

function tyreProfile(metrics) {
  const half = metrics.width / 2
  const inner = metrics.beadRadius
  const outer = metrics.carcassRadius
  const shoulder = outer * (metrics.family === 'tractor' ? 0.965 : metrics.family === 'offroad' ? 0.972 : 0.982)
  return [
    new THREE.Vector2(inner, -half * 0.78),
    new THREE.Vector2(inner * 1.035, -half * 0.94),
    new THREE.Vector2(shoulder, -half),
    new THREE.Vector2(outer * 0.994, -half * 0.58),
    new THREE.Vector2(outer, 0),
    new THREE.Vector2(outer * 0.994, half * 0.58),
    new THREE.Vector2(shoulder, half),
    new THREE.Vector2(inner * 1.035, half * 0.94),
    new THREE.Vector2(inner, half * 0.78),
    new THREE.Vector2(inner, -half * 0.78),
  ]
}

function addSpokes(group, metrics, material) {
  const inner = metrics.hubRadius * 1.02
  const outer = metrics.rimOuterRadius * 0.88
  const radialLength = Math.max(0.12, outer - inner)
  const radialMid = inner + radialLength / 2
  const axial = Math.max(0.12, metrics.width * 0.34)
  const tangent = Math.max(0.10, metrics.radius * 0.075)
  const geometry = new RoundedBoxGeometry(axial, radialLength, tangent, 3, Math.min(0.035, tangent * 0.25))

  for (let i = 0; i < metrics.spokes; i += 1) {
    const angle = i / metrics.spokes * Math.PI * 2
    const spoke = new THREE.Mesh(geometry, material)
    const offset = new THREE.Vector3(0, radialMid, 0).applyAxisAngle(X_AXIS, angle)
    spoke.position.set(offset.x, WHEEL_CENTER_Y + offset.y, offset.z)
    spoke.rotation.x = angle
    group.add(spoke)
  }
}

function addWheelTread(group, metrics, material) {
  const radial = metrics.carcassRadius + metrics.lugHeight * 0.48
  const qRadial = new THREE.Quaternion()
  const qTilt = new THREE.Quaternion()

  const addBlock = (angle, x, axialWidth, tangentialDepth, tilt = 0, radialHeight = metrics.lugHeight) => {
    const geometry = new RoundedBoxGeometry(
      Math.max(0.055, axialWidth),
      Math.max(0.025, radialHeight),
      Math.max(0.055, tangentialDepth),
      2,
      Math.min(0.025, radialHeight * 0.25),
    )
    const block = markVisualDetail(new THREE.Mesh(geometry, material))
    const offset = new THREE.Vector3(x, radial, 0).applyAxisAngle(X_AXIS, angle)
    block.position.set(offset.x, WHEEL_CENTER_Y + offset.y, offset.z)
    qRadial.setFromAxisAngle(X_AXIS, angle)
    qTilt.setFromAxisAngle(new THREE.Vector3(0, 0, 1), tilt)
    block.quaternion.copy(qRadial).multiply(qTilt)
    group.add(block)
  }

  if (metrics.family === 'tractor') {
    for (let i = 0; i < metrics.treadCount; i += 1) {
      const angle = i / metrics.treadCount * Math.PI * 2
      addBlock(angle, -metrics.width * 0.20, metrics.width * 0.62, metrics.radius * 0.18, 0.48, metrics.lugHeight)
      addBlock(angle, metrics.width * 0.20, metrics.width * 0.62, metrics.radius * 0.18, -0.48, metrics.lugHeight)
    }
    return
  }

  if (metrics.family === 'offroad') {
    for (let i = 0; i < metrics.treadCount; i += 1) {
      const angle = i / metrics.treadCount * Math.PI * 2
      const side = i % 2 ? 1 : -1
      addBlock(angle, side * metrics.width * 0.18, metrics.width * 0.58, metrics.radius * 0.15, side * 0.10, metrics.lugHeight)
    }
    return
  }

  for (let i = 0; i < metrics.treadCount; i += 1) {
    const angle = i / metrics.treadCount * Math.PI * 2
    if (metrics.family === 'narrow') {
      addBlock(angle, 0, metrics.width * 0.72, metrics.radius * 0.075, 0, metrics.lugHeight)
    } else {
      addBlock(angle, -metrics.width * 0.22, metrics.width * 0.28, metrics.radius * 0.070, 0.05, metrics.lugHeight)
      addBlock(angle, metrics.width * 0.22, metrics.width * 0.28, metrics.radius * 0.070, -0.05, metrics.lugHeight)
    }
  }
}

function createWheelV5(part, color) {
  const metrics = wheelMetrics(part)
  const g = root(part.id, color)
  const tireMat = rubberMaterial()
  const rimMat = absMaterial(color, { roughness: 0.34, clearcoat: 0.08 })

  const tire = new THREE.Mesh(new THREE.LatheGeometry(tyreProfile(metrics), 72), tireMat)
  tire.rotation.z = -Math.PI / 2
  tire.position.y = WHEEL_CENTER_Y
  g.add(tire)
  addWheelTread(g, metrics, tireMat)

  const barrelShape = annulusShape(metrics.rimOuterRadius, Math.max(metrics.hubRadius * 1.35, metrics.rimOuterRadius * 0.68))
  const barrel = extrudeAlongX(barrelShape, metrics.width * 0.78, rimMat, { bevelSegments: 2, bevelSize: 0.012, bevelThickness: 0.012 })
  barrel.position.y = WHEEL_CENTER_Y
  g.add(barrel)

  const lipShape = annulusShape(metrics.rimOuterRadius * 1.025, metrics.rimOuterRadius * 0.90)
  for (const side of [-1, 1]) {
    const lip = extrudeAlongX(lipShape, Math.max(0.045, metrics.width * 0.055), rimMat, { bevelSegments: 2, bevelSize: 0.008, bevelThickness: 0.008 })
    lip.position.set(side * metrics.width * 0.39, WHEEL_CENTER_Y, 0)
    g.add(lip)
  }

  addSpokes(g, metrics, rimMat)

  const hubShape = new THREE.Shape()
  hubShape.absarc(0, 0, metrics.hubRadius, 0, Math.PI * 2, false)
  hubShape.holes.push(crossPath(0.205, 0.082))
  const hub = extrudeAlongX(hubShape, metrics.width * 0.88, rimMat, { bevelSegments: 2, bevelSize: 0.010, bevelThickness: 0.010 })
  hub.position.y = WHEEL_CENTER_Y
  g.add(hub)

  const boreShade = markVisualDetail(extrudeAlongX(annulusShape(0.228, 0.208), metrics.width * 0.92, darkMaterial(), {
    bevelEnabled: false,
  }))
  boreShade.position.y = WHEEL_CENTER_Y
  g.add(boreShade)
  return g
}

function patchCatalog() {
  const upgraded = []

  for (const part of PARTS) {
    if (part.mechanics?.wheel) {
      const metrics = wheelMetrics(part)
      part.mechanics = {
        ...part.mechanics,
        wheel: { ...part.mechanics.wheel, radius: metrics.radius, width: metrics.width },
      }
      part.dimensions = { ...(part.dimensions ?? {}), radiusStud: metrics.radius, widthStud: metrics.width }
      patchPart(PARTS, part.id, {
        create: color => createWheelV5(part, color),
        visualQuality: 'parts-5-profiled-tyre-rim',
        geometryMetricsVersion: PARTS5_GEOMETRY_VERSION,
      })
      upgraded.push(part.id)
      continue
    }

    if (part.mechanics?.gear) {
      const kind = part.mechanics.gear.kind ?? 'spur'
      const metrics = gearMetrics(part.mechanics.gear.teeth, kind)
      part.mechanics = {
        ...part.mechanics,
        gear: { ...part.mechanics.gear, pitchRadius: gearPitchRadius(metrics.teeth), module: metrics.module },
      }
      part.dimensions = {
        ...(part.dimensions ?? {}),
        pitchRadiusStud: metrics.pitchRadius,
        outerRadiusStud: metrics.outerRadius,
        thicknessStud: metrics.thickness,
      }
      patchPart(PARTS, part.id, {
        create: color => kind === 'bevel' ? createBevelGearV5(part, color) : createSpurGearV5(part, color),
        visualQuality: kind === 'bevel' ? 'parts-5-bevel-cone-teeth' : 'parts-5-module-tooth-profile',
        geometryMetricsVersion: PARTS5_GEOMETRY_VERSION,
      })
      upgraded.push(part.id)
      continue
    }

    if (/^beam-\d+$/.test(part.id) || /^thin-beam-\d+$/.test(part.id)) {
      const thin = part.id.startsWith('thin-beam-')
      patchPart(PARTS, part.id, {
        create: color => createBeamV5(part, color, thin ? TECHNIC_METRICS.thinBeamDepth : TECHNIC_METRICS.beamDepth),
        visualQuality: 'parts-5-clean-through-holes',
        geometryMetricsVersion: PARTS5_GEOMETRY_VERSION,
      })
      upgraded.push(part.id)
      continue
    }

    if (/^technic-brick-1x\d+$/.test(part.id)) {
      patchPart(PARTS, part.id, {
        create: color => createTechnicBrickV5(part, color),
        visualQuality: 'parts-5-clean-through-holes',
        geometryMetricsVersion: PARTS5_GEOMETRY_VERSION,
      })
      upgraded.push(part.id)
      continue
    }

    if (/^axle-\d+$/.test(part.id)) {
      patchPart(PARTS, part.id, {
        create: color => createAxleV5(part, color),
        visualQuality: 'parts-5-cross-axle',
        geometryMetricsVersion: PARTS5_GEOMETRY_VERSION,
      })
      upgraded.push(part.id)
      continue
    }
  }

  const pinSpecs = [
    ['pin', 2.0, true],
    ['pin-half', 0.9, true],
    ['pin-long', 3.0, true],
    ['pin-frictionless', 2.0, false],
  ]
  for (const [id, length, friction] of pinSpecs) {
    const part = PARTS.find(item => item.id === id)
    if (!part) continue
    patchPart(PARTS, id, {
      create: color => createPinV5(part, color, length, friction),
      visualQuality: 'parts-5-molded-pin',
      geometryMetricsVersion: PARTS5_GEOMETRY_VERSION,
    })
    upgraded.push(id)
  }

  return upgraded
}

const upgraded = patchCatalog()

globalThis.BrickLabParts5Visuals = Object.freeze({
  version: PARTS5_VISUAL_VERSION,
  geometry: PARTS5_GEOMETRY_VERSION,
  upgraded: [...new Set(upgraded)],
})

window.dispatchEvent(new CustomEvent('bricklab:partcatalogchange', {
  detail: { total: PARTS.length, pack: PARTS5_VISUAL_VERSION },
}))
