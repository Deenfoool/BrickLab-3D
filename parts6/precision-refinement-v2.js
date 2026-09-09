import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { PARTS } from '../parts.js'
import { patchPart } from '../parts3/part-schema-v1.js'
import { TECHNIC_METRICS, gearMetrics, wheelMetrics } from '../parts5/part-geometry-metrics-v1.js'

export const PARTS6_PRECISION_VERSION = 'parts-6-precision-refinement-v2'
const WHEEL_CENTER_Y = 1.15
const X_AXIS = new THREE.Vector3(1, 0, 0)
const Y_AXIS = new THREE.Vector3(0, 1, 0)

function absMaterial(color, roughness = 0.35) {
  return new THREE.MeshPhysicalMaterial({ color, roughness, metalness: 0.004, clearcoat: 0.05, clearcoatRoughness: 0.60, ior: 1.47 })
}
function pomMaterial(color) { return new THREE.MeshStandardMaterial({ color, roughness: 0.40, metalness: 0.004 }) }
function rubberMaterial() { return new THREE.MeshStandardMaterial({ color: 0x111315, roughness: 0.985, metalness: 0 }) }
function shade(color, factor = 0.58) {
  const value = new THREE.Color(color).multiplyScalar(factor)
  return new THREE.MeshStandardMaterial({ color: value, roughness: 0.70, metalness: 0.004, side: THREE.DoubleSide })
}
function root(id, color) {
  const group = new THREE.Group()
  group.userData.partId = id
  group.userData.color = color
  group.userData.visualVersion = PARTS6_PRECISION_VERSION
  return group
}
function visualOnly(object) {
  object.userData.physicsIgnore = true
  object.userData.parts6VisualDetail = true
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
function crossBoreShape(outer, radius = 0.205, arm = 0.082) {
  const shape = new THREE.Shape()
  shape.absarc(0, 0, outer, 0, Math.PI * 2, false)
  shape.holes.push(crossPath(radius, arm))
  return shape
}
function annulusShape(outer, inner) {
  const shape = new THREE.Shape()
  shape.absarc(0, 0, outer, 0, Math.PI * 2, false)
  shape.holes.push(circleHole(0, 0, inner))
  return shape
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
function extrudeShape(shape, depth, material, options = {}) {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: options.bevelEnabled ?? true,
    bevelSegments: options.bevelSegments ?? 3,
    bevelSize: options.bevelSize ?? 0.010,
    bevelThickness: options.bevelThickness ?? 0.010,
    curveSegments: options.curveSegments ?? 32,
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

function addBore(group, position, depth, color, radius = 0.225) {
  const liner = visualOnly(new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.985, radius * 0.985, depth + 0.010, 40, 1, true),
    shade(color, 0.55),
  ))
  liner.rotation.x = Math.PI / 2
  liner.position.fromArray(position)
  group.add(liner)
  const lipGeo = new THREE.TorusGeometry(radius + 0.004, 0.009, 7, 40)
  for (const side of [-1, 1]) {
    const lip = visualOnly(new THREE.Mesh(lipGeo, absMaterial(color, 0.42)))
    lip.position.set(position[0], position[1], position[2] + side * (depth / 2 + 0.007))
    group.add(lip)
  }
}

function addStud(group, x, color) {
  const material = absMaterial(color, 0.33)
  const stud = new THREE.Mesh(new THREE.CylinderGeometry(0.294, 0.304, 0.18, 40), material)
  stud.position.set(x, 1.29, 0)
  group.add(stud)
  const witness = visualOnly(new THREE.Mesh(new THREE.CircleGeometry(0.040, 20), shade(color, 0.82)))
  witness.rotation.x = -Math.PI / 2
  witness.position.set(x, 1.381, 0)
  group.add(witness)
}

function createPrecisionTechnicBrick(part, color, length) {
  const group = root(part.id, color)
  const material = absMaterial(color, 0.35)
  const width = Math.max(1, length - 0.08)
  const depth = 0.88
  const wall = 0.115
  const holeCount = Math.max(1, length - 1)
  const sideShape = roundedRectShape(width, 1.04, 0.092)
  for (let i = 0; i < holeCount; i += 1) sideShape.holes.push(circleHole(i - (holeCount - 1) / 2, 0, 0.225))
  for (const side of [-1, 1]) {
    const panel = extrudeShape(sideShape, wall, material, { bevelSegments: 3, bevelSize: 0.010, bevelThickness: 0.010 })
    panel.position.set(0, 0.60, side * (depth / 2 - wall / 2))
    group.add(panel)
  }
  const top = new THREE.Mesh(new RoundedBoxGeometry(width, 0.18, depth, 4, 0.060), material)
  top.position.y = 1.07
  group.add(top)
  for (const side of [-1, 1]) {
    const end = new THREE.Mesh(new RoundedBoxGeometry(0.17, 0.92, depth, 4, 0.058), material)
    end.position.set(side * (width / 2 - 0.085), 0.55, 0)
    group.add(end)
    const rail = new THREE.Mesh(new RoundedBoxGeometry(width - 0.16, 0.11, 0.12, 3, 0.030), material)
    rail.position.set(0, 0.095, side * 0.366)
    group.add(rail)
  }
  const bossMaterial = absMaterial(color, 0.40)
  for (let i = 0; i < holeCount; i += 1) {
    const x = i - (holeCount - 1) / 2
    const boss = visualOnly(extrudeShape(annulusShape(0.315, 0.225), depth - wall * 1.4, bossMaterial, {
      bevelSegments: 2,
      bevelSize: 0.006,
      bevelThickness: 0.006,
    }))
    boss.position.set(x, 0.60, 0)
    group.add(boss)
    addBore(group, [x, 0.60, 0], depth, color)
  }
  // Lower anti-crush ribs and shallow tube seats keep the underside visibly hollow.
  for (let i = 0; i < length - 1; i += 1) {
    const x = i - (length - 2) / 2
    const rib = visualOnly(new THREE.Mesh(new RoundedBoxGeometry(0.072, 0.43, depth - 0.20, 2, 0.020), absMaterial(color, 0.43)))
    rib.position.set(x, 0.29, 0)
    group.add(rib)
  }
  for (let i = 0; i < length; i += 1) addStud(group, i - (length - 1) / 2, color)
  return group
}

function createRoundedAxle(part, color) {
  const length = Math.max(0.5, Number(part?.dimensions?.lengthStud) || Number(part?.id?.match(/(\d+)$/)?.[1]) || 3)
  const group = root(part.id, color)
  const material = pomMaterial(color)
  const arm = TECHNIC_METRICS.axleArm * 2
  const diameter = TECHNIC_METRICS.axleRadius * 2
  const bodyLength = Math.max(0.30, length - 0.08)
  const barA = new THREE.Mesh(new RoundedBoxGeometry(bodyLength, arm, diameter, 3, 0.024), material)
  const barB = new THREE.Mesh(new RoundedBoxGeometry(bodyLength, diameter, arm, 3, 0.024), material)
  barA.position.y = 0.32
  barB.position.y = 0.32
  group.add(barA, barB)
  const endMaterial = shade(color, 0.72)
  for (const side of [-1, 1]) {
    const x = side * (bodyLength / 2 + 0.004)
    const faceA = visualOnly(new THREE.Mesh(new RoundedBoxGeometry(0.008, arm * 0.94, diameter * 0.94, 2, 0.010), endMaterial))
    const faceB = visualOnly(new THREE.Mesh(new RoundedBoxGeometry(0.008, diameter * 0.94, arm * 0.94, 2, 0.010), endMaterial))
    faceA.position.set(x, 0.32, 0)
    faceB.position.set(x, 0.32, 0)
    group.add(faceA, faceB)
  }
  return group
}

function createBush(part, color) {
  const width = Math.max(0.28, Number(part.dimensions?.lengthStud) || (part.id === 'half-bush' ? 0.38 : 0.72))
  const group = root(part.id, color)
  const material = pomMaterial(color)
  const shell = extrudeAlongX(crossBoreShape(0.385, 0.198, 0.078), width, material, { bevelSegments: 3, bevelSize: 0.009, bevelThickness: 0.011 })
  shell.position.y = 0.36
  group.add(shell)
  const ribLength = Math.max(0.16, width * 0.64)
  for (let i = 0; i < 6; i += 1) {
    const a = i / 6 * Math.PI * 2
    const rib = visualOnly(new THREE.Mesh(new RoundedBoxGeometry(ribLength, 0.045, 0.045, 2, 0.012), material))
    rib.position.set(0, 0.36 + Math.cos(a) * 0.355, Math.sin(a) * 0.355)
    rib.rotation.x = a
    group.add(rib)
  }
  const groove = visualOnly(new THREE.Mesh(new THREE.TorusGeometry(0.314, 0.020, 7, 40), shade(color, 0.45)))
  groove.rotateY(Math.PI / 2)
  groove.position.y = 0.36
  group.add(groove)
  return group
}

function createAxleCoupler(part, color) {
  const group = root(part.id, color)
  const material = pomMaterial(color)
  const shell = extrudeAlongX(crossBoreShape(0.395, 0.198, 0.078), 1.50, material, { bevelSegments: 3, bevelSize: 0.009, bevelThickness: 0.012 })
  shell.position.y = 0.38
  group.add(shell)
  for (const x of [-0.52, 0, 0.52]) {
    const band = visualOnly(new THREE.Mesh(new THREE.TorusGeometry(0.322, 0.019, 7, 40), shade(color, 0.48)))
    band.rotateY(Math.PI / 2)
    band.position.set(x, 0.38, 0)
    group.add(band)
  }
  for (let i = 0; i < 8; i += 1) {
    const a = i / 8 * Math.PI * 2
    const rib = visualOnly(new THREE.Mesh(new RoundedBoxGeometry(0.90, 0.035, 0.035, 2, 0.010), material))
    rib.position.set(0, 0.38 + Math.cos(a) * 0.363, Math.sin(a) * 0.363)
    rib.rotation.x = a
    group.add(rib)
  }
  return group
}

function involutePolar(baseRadius, radius) {
  if (!(radius > baseRadius)) return 0
  const t = Math.sqrt(Math.max(0, radius * radius / (baseRadius * baseRadius) - 1))
  return t - Math.atan(t)
}
function involuteOutline(metrics, innerRadius = null) {
  const shape = new THREE.Shape()
  const base = Math.max(metrics.rootRadius, metrics.baseRadius)
  const pitchInv = involutePolar(metrics.baseRadius, metrics.pitchRadius)
  const halfThickness = metrics.toothAngle * 0.25
  const flank = radius => halfThickness - (involutePolar(metrics.baseRadius, Math.max(radius, metrics.baseRadius)) - pitchInv)
  const samples = 6
  for (let tooth = 0; tooth < metrics.teeth; tooth += 1) {
    const center = tooth * metrics.toothAngle
    const baseHalf = THREE.MathUtils.clamp(flank(base), metrics.toothAngle * 0.24, metrics.toothAngle * 0.42)
    const rootHalf = Math.min(metrics.toothAngle * 0.44, baseHalf + metrics.toothAngle * 0.025)
    let angle = center - rootHalf
    if (tooth === 0) shape.moveTo(Math.cos(angle) * metrics.rootRadius, Math.sin(angle) * metrics.rootRadius)
    else shape.lineTo(Math.cos(angle) * metrics.rootRadius, Math.sin(angle) * metrics.rootRadius)
    if (metrics.rootRadius < base - 1e-6) {
      angle = center - baseHalf
      shape.lineTo(Math.cos(angle) * base, Math.sin(angle) * base)
    }
    for (let i = 0; i <= samples; i += 1) {
      const radius = base + (metrics.outerRadius - base) * (i / samples)
      angle = center - flank(radius)
      shape.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius)
    }
    const tipHalf = Math.max(metrics.toothAngle * 0.075, flank(metrics.outerRadius))
    for (let i = 1; i <= 4; i += 1) {
      angle = center - tipHalf + tipHalf * 2 * (i / 4)
      shape.lineTo(Math.cos(angle) * metrics.outerRadius, Math.sin(angle) * metrics.outerRadius)
    }
    for (let i = samples; i >= 0; i -= 1) {
      const radius = base + (metrics.outerRadius - base) * (i / samples)
      angle = center + flank(radius)
      shape.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius)
    }
    if (metrics.rootRadius < base - 1e-6) {
      angle = center + baseHalf
      shape.lineTo(Math.cos(angle) * base, Math.sin(angle) * base)
    }
    angle = center + rootHalf
    shape.lineTo(Math.cos(angle) * metrics.rootRadius, Math.sin(angle) * metrics.rootRadius)
    const valley = center + metrics.toothAngle * 0.5
    shape.lineTo(Math.cos(valley) * metrics.rootRadius, Math.sin(valley) * metrics.rootRadius)
  }
  shape.closePath()
  if (innerRadius) shape.holes.push(circleHole(0, 0, innerRadius))
  else shape.holes.push(crossPath())
  return shape
}

function createPrecisionSpurGear(part, color) {
  const metrics = gearMetrics(part.mechanics.gear.teeth, 'spur')
  const group = root(part.id, color)
  const material = pomMaterial(color)
  const large = metrics.teeth >= 16
  const hubRadius = metrics.teeth <= 12 ? 0.31 : 0.325
  const ringInner = large ? Math.max(hubRadius + 0.18, metrics.rootRadius * 0.68) : null
  const ring = extrudeShape(involuteOutline(metrics, ringInner), metrics.thickness, material, { bevelSegments: 3, bevelSize: 0.007, bevelThickness: 0.009, curveSegments: 18 })
  ring.rotation.x = Math.PI / 2
  ring.position.y = 0.40
  group.add(ring)
  const hub = extrudeShape(crossBoreShape(hubRadius), metrics.thickness + 0.075, material, { bevelSegments: 3, bevelSize: 0.007, bevelThickness: 0.009 })
  hub.rotation.x = Math.PI / 2
  hub.position.y = 0.40
  group.add(hub)
  if (large && ringInner > hubRadius + 0.08) {
    const count = metrics.teeth >= 36 ? 8 : metrics.teeth >= 20 ? 6 : 4
    const inner = hubRadius * 0.94
    const outer = ringInner + 0.045
    const length = Math.max(0.08, outer - inner)
    const mid = (inner + outer) / 2
    const tangent = Math.max(0.10, metrics.pitchRadius * 0.10)
    const spokeGeo = new RoundedBoxGeometry(tangent, metrics.thickness * 0.72, length, 3, Math.min(0.024, tangent * 0.22))
    for (let i = 0; i < count; i += 1) {
      const a = i / count * Math.PI * 2
      const spoke = new THREE.Mesh(spokeGeo, material)
      spoke.position.set(Math.sin(a) * mid, 0.40, Math.cos(a) * mid)
      spoke.rotation.y = a
      group.add(spoke)
    }
  }
  const bore = visualOnly(extrudeShape(annulusShape(0.224, 0.207), metrics.thickness + 0.10, shade(color, 0.38), { bevelEnabled: false }))
  bore.rotation.x = Math.PI / 2
  bore.position.y = 0.40
  group.add(bore)
  return group
}

function tyreProfile(metrics) {
  const half = metrics.width / 2
  const bead = metrics.beadRadius
  const crown = metrics.carcassRadius
  const shoulderDrop = metrics.family === 'tractor' ? 0.085 : metrics.family === 'offroad' ? 0.060 : 0.036
  const points = [new THREE.Vector2(bead, -half * 0.67), new THREE.Vector2(bead * 1.012, -half * 0.84), new THREE.Vector2(bead * 1.060, -half * 0.96)]
  for (let i = 0; i <= 18; i += 1) {
    const t = -1 + i * 2 / 18
    const edge = Math.pow(Math.abs(t), 2.15)
    points.push(new THREE.Vector2(crown * (1 - shoulderDrop * edge), half * t))
  }
  points.push(new THREE.Vector2(bead * 1.060, half * 0.96), new THREE.Vector2(bead * 1.012, half * 0.84), new THREE.Vector2(bead, half * 0.67), new THREE.Vector2(bead, -half * 0.67))
  return points
}

function addTread(group, metrics, material) {
  const family = metrics.family
  const radial = metrics.carcassRadius + metrics.lugHeight * 0.48
  const count = family === 'tractor' || family === 'road' ? metrics.treadCount * 2 : metrics.treadCount
  const axial = family === 'tractor' ? metrics.width * 0.62 : family === 'offroad' ? metrics.width * 0.52 : family === 'narrow' ? metrics.width * 0.68 : metrics.width * 0.24
  const tangent = family === 'tractor' ? metrics.radius * 0.19 : family === 'offroad' ? metrics.radius * 0.135 : metrics.radius * 0.056
  const geometry = new RoundedBoxGeometry(Math.max(0.05, axial), Math.max(0.020, metrics.lugHeight), Math.max(0.045, tangent), 2, Math.min(0.018, metrics.lugHeight * 0.22))
  const mesh = visualOnly(new THREE.InstancedMesh(geometry, material, count))
  const matrix = new THREE.Matrix4()
  const radialQ = new THREE.Quaternion()
  const tiltQ = new THREE.Quaternion()
  const q = new THREE.Quaternion()
  const scale = new THREE.Vector3(1, 1, 1)
  let index = 0
  const place = (angle, x, tilt) => {
    const offset = new THREE.Vector3(x, radial, 0).applyAxisAngle(X_AXIS, angle)
    radialQ.setFromAxisAngle(X_AXIS, angle)
    tiltQ.setFromAxisAngle(Y_AXIS, tilt)
    q.copy(radialQ).multiply(tiltQ)
    matrix.compose(new THREE.Vector3(offset.x, WHEEL_CENTER_Y + offset.y, offset.z), q, scale)
    mesh.setMatrixAt(index++, matrix)
  }
  for (let i = 0; i < metrics.treadCount; i += 1) {
    const a = i / metrics.treadCount * Math.PI * 2
    if (family === 'tractor') { place(a, -metrics.width * 0.20, 0.56); place(a, metrics.width * 0.20, -0.56) }
    else if (family === 'offroad') { const s = i % 2 ? 1 : -1; place(a, s * metrics.width * 0.16, s * 0.14) }
    else if (family === 'road') { place(a, -metrics.width * 0.21, 0.08); place(a, metrics.width * 0.21, -0.08) }
    else place(a, 0, i % 2 ? 0.03 : -0.03)
  }
  mesh.instanceMatrix.needsUpdate = true
  group.add(mesh)
}

function createPrecisionWheel(part, color) {
  const metrics = wheelMetrics(part)
  const group = root(part.id, color)
  const rubber = rubberMaterial()
  const rimMaterial = absMaterial(color, 0.34)
  const tyre = new THREE.Mesh(new THREE.LatheGeometry(tyreProfile(metrics), 96), rubber)
  tyre.rotation.z = -Math.PI / 2
  tyre.position.y = WHEEL_CENTER_Y
  group.add(tyre)
  addTread(group, metrics, rubber)
  const barrel = extrudeAlongX(annulusShape(metrics.rimOuterRadius, Math.max(metrics.hubRadius * 1.34, metrics.rimOuterRadius * 0.65)), metrics.width * 0.74, rimMaterial, { bevelSegments: 3, bevelSize: 0.009, bevelThickness: 0.009 })
  barrel.position.y = WHEEL_CENTER_Y
  group.add(barrel)
  const lipShape = annulusShape(metrics.rimOuterRadius * 1.025, metrics.rimOuterRadius * 0.91)
  for (const side of [-1, 1]) {
    const lip = extrudeAlongX(lipShape, Math.max(0.035, metrics.width * 0.048), rimMaterial, { bevelSegments: 2, bevelSize: 0.005, bevelThickness: 0.005 })
    lip.position.set(side * metrics.width * 0.385, WHEEL_CENTER_Y, 0)
    group.add(lip)
    const sidewall = visualOnly(new THREE.Mesh(new THREE.TorusGeometry(metrics.carcassRadius * 0.82, Math.max(0.007, metrics.radius * 0.006), 6, 72), shade(0x202326, 0.72)))
    sidewall.rotation.y = Math.PI / 2
    sidewall.position.set(side * metrics.width * 0.475, WHEEL_CENTER_Y, 0)
    group.add(sidewall)
  }
  const dishOuter = metrics.rimOuterRadius * 0.80
  const dishInner = metrics.hubRadius * 1.18
  for (const side of [-1, 1]) {
    const dish = extrudeAlongX(annulusShape(dishOuter, dishInner), Math.max(0.032, metrics.width * 0.040), rimMaterial, { bevelSegments: 2, bevelSize: 0.005, bevelThickness: 0.005 })
    dish.position.set(side * metrics.width * 0.19, WHEEL_CENTER_Y, 0)
    group.add(dish)
  }
  const inner = metrics.hubRadius * 1.04
  const outer = metrics.rimOuterRadius * 0.83
  const length = Math.max(0.10, outer - inner)
  const mid = (inner + outer) / 2
  const tangential = Math.max(0.075, metrics.radius * 0.060)
  const axial = Math.max(0.10, metrics.width * 0.28)
  const spokeGeo = new RoundedBoxGeometry(axial, tangential, length, 3, Math.min(0.024, tangential * 0.28))
  for (let i = 0; i < metrics.spokes; i += 1) {
    const a = i / metrics.spokes * Math.PI * 2
    const spoke = new THREE.Mesh(spokeGeo, rimMaterial)
    spoke.position.set(0, WHEEL_CENTER_Y + Math.cos(a) * mid, Math.sin(a) * mid)
    spoke.rotation.x = a - Math.PI / 2
    group.add(spoke)
  }
  const hub = extrudeAlongX(crossBoreShape(metrics.hubRadius), metrics.width * 0.84, rimMaterial, { bevelSegments: 3, bevelSize: 0.008, bevelThickness: 0.009 })
  hub.position.y = WHEEL_CENTER_Y
  group.add(hub)
  const bore = visualOnly(extrudeAlongX(annulusShape(0.225, 0.207), metrics.width * 0.88, shade(color, 0.36), { bevelEnabled: false }))
  bore.position.y = WHEEL_CENTER_Y
  group.add(bore)
  return group
}

const upgraded = []
for (const part of PARTS) {
  const brick = part.id.match(/^technic-brick-1x(\d+)$/)
  if (brick) {
    const length = Number(brick[1])
    patchPart(PARTS, part.id, { create: color => createPrecisionTechnicBrick(part, color, length), visualQuality: 'parts-6-precision-hollow-technic-brick' })
    upgraded.push(part.id)
    continue
  }
  if (/^axle-\d+$/.test(part.id)) {
    patchPart(PARTS, part.id, { create: color => createRoundedAxle(part, color), visualQuality: 'parts-6-rounded-cross-axle-v2' })
    upgraded.push(part.id)
    continue
  }
  if (part.mechanics?.wheel) {
    patchPart(PARTS, part.id, { create: color => createPrecisionWheel(part, color), visualQuality: `parts-6-${wheelMetrics(part).family}-wheel-v2` })
    upgraded.push(part.id)
    continue
  }
  if (part.mechanics?.gear && (part.mechanics.gear.kind ?? 'spur') === 'spur') {
    patchPart(PARTS, part.id, { create: color => createPrecisionSpurGear(part, color), visualQuality: 'parts-6-involute-spoked-gear-v2' })
    upgraded.push(part.id)
  }
}
for (const id of ['bush', 'half-bush']) {
  const part = PARTS.find(item => item.id === id)
  if (!part) continue
  patchPart(PARTS, id, { create: color => createBush(part, color), visualQuality: 'parts-6-molded-bush-v2' })
  upgraded.push(id)
}
const coupler = PARTS.find(item => item.id === 'axle-coupler')
if (coupler) {
  patchPart(PARTS, coupler.id, { create: color => createAxleCoupler(coupler, color), visualQuality: 'parts-6-molded-axle-coupler-v2' })
  upgraded.push(coupler.id)
}

globalThis.BrickLabParts6Precision = Object.freeze({
  version: PARTS6_PRECISION_VERSION,
  upgraded: [...new Set(upgraded)],
  corrections: Object.freeze([
    'Technic bore bosses aligned with side-hole axis',
    'wheel spokes radially aligned in the wheel plane',
    'spur gear spokes radially aligned in the gear plane',
    'axle end faces avoid degenerate helper geometry',
  ]),
})

window.dispatchEvent(new CustomEvent('bricklab:partcatalogchange', {
  detail: { total: PARTS.length, pack: PARTS6_PRECISION_VERSION },
}))
