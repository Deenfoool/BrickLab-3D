import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { PARTS } from '../parts.js'
import { patchPart } from '../parts3/part-schema-v1.js'
import {
  TECHNIC_METRICS,
  gearMetrics,
  bevelPitchConeAngle,
  wheelMetrics,
} from '../parts5/part-geometry-metrics-v1.js'

export const PARTS6_REALISM_VERSION = 'parts-6-realism-refinement-v1'
const WHEEL_CENTER_Y = 1.15
const X_AXIS = new THREE.Vector3(1, 0, 0)
const Y_AXIS = new THREE.Vector3(0, 1, 0)

function absMaterial(color, roughness = 0.35) {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness,
    metalness: 0.004,
    clearcoat: 0.055,
    clearcoatRoughness: 0.58,
    ior: 1.47,
  })
}

function pomMaterial(color) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.40, metalness: 0.004 })
}

function rubberMaterial() {
  return new THREE.MeshStandardMaterial({ color: 0x111315, roughness: 0.985, metalness: 0 })
}

function shadedMaterial(color, factor = 0.58) {
  const value = new THREE.Color(color)
  value.multiplyScalar(factor)
  return new THREE.MeshStandardMaterial({ color: value, roughness: 0.68, metalness: 0.005, side: THREE.DoubleSide })
}

function root(id, color) {
  const group = new THREE.Group()
  group.userData.partId = id
  group.userData.color = color
  group.userData.visualVersion = PARTS6_REALISM_VERSION
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
    bevelSize: options.bevelSize ?? 0.012,
    bevelThickness: options.bevelThickness ?? 0.012,
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

function addBore(group, position, axis, depth, color, radius = TECHNIC_METRICS.pinHoleRadius) {
  const normal = new THREE.Vector3(...axis).normalize()
  const linerGeometry = new THREE.CylinderGeometry(radius * 0.985, radius * 0.985, depth + 0.012, 40, 1, true)
  const liner = visualOnly(new THREE.Mesh(linerGeometry, shadedMaterial(color, 0.54)))
  liner.quaternion.setFromUnitVectors(Y_AXIS, normal)
  liner.position.fromArray(position)
  group.add(liner)

  const ringGeometry = new THREE.TorusGeometry(radius + 0.004, 0.010, 7, 40)
  for (const side of [-1, 1]) {
    const ring = visualOnly(new THREE.Mesh(ringGeometry, absMaterial(color, 0.41)))
    ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal)
    ring.position.fromArray(position).addScaledVector(normal, side * (depth / 2 + 0.008))
    group.add(ring)
  }
}

function waistedLiftarmShape(length) {
  const half = TECHNIC_METRICS.beamHeight / 2
  const waist = half * 0.89
  const first = -(length - 1) / 2
  const last = (length - 1) / 2
  const shape = new THREE.Shape()
  shape.moveTo(first, half)
  for (let i = 0; i < length - 1; i += 1) {
    const a = first + i
    const b = a + 1
    shape.quadraticCurveTo((a + b) / 2, waist, b, half)
  }
  shape.quadraticCurveTo(last + half, half, last + half, 0)
  shape.quadraticCurveTo(last + half, -half, last, -half)
  for (let i = length - 1; i > 0; i -= 1) {
    const a = first + i
    const b = a - 1
    shape.quadraticCurveTo((a + b) / 2, -waist, b, -half)
  }
  shape.quadraticCurveTo(first - half, -half, first - half, 0)
  shape.quadraticCurveTo(first - half, half, first, half)
  shape.closePath()
  for (let i = 0; i < length; i += 1) {
    shape.holes.push(circleHole(first + i, 0, TECHNIC_METRICS.pinHoleRadius))
  }
  return shape
}

function createRealLiftarm(part, color, length, depth) {
  const group = root(part.id, color)
  const material = absMaterial(color, 0.36)
  const body = extrudeShape(waistedLiftarmShape(length), depth, material, {
    bevelSegments: 4,
    bevelSize: depth < 0.5 ? 0.010 : 0.017,
    bevelThickness: depth < 0.5 ? 0.010 : 0.016,
    curveSegments: 40,
  })
  body.position.y = 0.45
  group.add(body)

  for (let i = 0; i < length; i += 1) {
    addBore(group, [i - (length - 1) / 2, 0.45, 0], [0, 0, 1], depth, color)
  }

  // Very shallow molded face channel; unlike a dark decorative strip it follows
  // the actual injection-molded surface and remains almost flush with the beam.
  if (length >= 5) {
    const channel = visualOnly(new THREE.Mesh(
      new RoundedBoxGeometry(Math.max(0.6, length - 2.0), 0.030, 0.010, 3, 0.012),
      shadedMaterial(color, 0.82),
    ))
    for (const side of [-1, 1]) {
      const face = channel.clone()
      face.position.set(0, 0.45, side * (depth / 2 + 0.006))
      group.add(face)
    }
  }
  return group
}

function addStud(group, x, y, color) {
  const material = absMaterial(color, 0.33)
  const stud = new THREE.Mesh(new THREE.CylinderGeometry(0.294, 0.304, 0.18, 40), material)
  stud.position.set(x, y + 0.09, 0)
  group.add(stud)
  const top = visualOnly(new THREE.Mesh(new THREE.CircleGeometry(0.246, 40), shadedMaterial(color, 0.90)))
  top.rotation.x = -Math.PI / 2
  top.position.set(x, y + 0.1815, 0)
  group.add(top)
}

function createRealTechnicBrick(part, color, length) {
  const group = root(part.id, color)
  const material = absMaterial(color, 0.35)
  const width = Math.max(1, length - 0.08)
  const depth = 0.88
  const wall = 0.115
  const holeCount = Math.max(1, length - 1)
  const sideShape = roundedRectShape(width, 1.04, 0.092)
  for (let i = 0; i < holeCount; i += 1) sideShape.holes.push(circleHole(i - (holeCount - 1) / 2, 0, 0.225))

  for (const side of [-1, 1]) {
    const panel = extrudeShape(sideShape, wall, material, {
      bevelSegments: 3,
      bevelSize: 0.010,
      bevelThickness: 0.010,
    })
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
    const bottomRail = new THREE.Mesh(new RoundedBoxGeometry(width - 0.16, 0.11, 0.12, 3, 0.030), material)
    bottomRail.position.set(0, 0.095, side * 0.366)
    group.add(bottomRail)
  }

  // Reinforced cylindrical bosses bridge both side walls around every Technic bore.
  const bossMaterial = absMaterial(color, 0.40)
  for (let i = 0; i < holeCount; i += 1) {
    const x = i - (holeCount - 1) / 2
    const boss = visualOnly(extrudeShape(annulusShape(0.315, 0.225), depth - wall * 1.4, bossMaterial, {
      bevelSegments: 2,
      bevelSize: 0.006,
      bevelThickness: 0.006,
    }))
    boss.rotation.x = Math.PI / 2
    boss.position.set(x, 0.60, 0)
    group.add(boss)
    addBore(group, [x, 0.60, 0], [0, 0, 1], depth, color, 0.225)
  }

  // Open underside with narrow internal anti-crush ribs, rather than a solid block.
  for (let i = 0; i < length - 1; i += 1) {
    const x = i - (length - 2) / 2
    const rib = visualOnly(new THREE.Mesh(new RoundedBoxGeometry(0.075, 0.42, depth - 0.21, 2, 0.020), absMaterial(color, 0.43)))
    rib.position.set(x, 0.28, 0)
    group.add(rib)
  }
  for (let i = 0; i < length; i += 1) addStud(group, i - (length - 1) / 2, 1.20, color)
  return group
}

function createRealAxle(part, color) {
  const length = Math.max(0.5, Number(part?.dimensions?.lengthStud) || Number(part?.id?.match(/(\d+)$/)?.[1]) || 3)
  const group = root(part.id, color)
  const material = pomMaterial(color)
  const arm = TECHNIC_METRICS.axleArm * 2
  const diameter = TECHNIC_METRICS.axleRadius * 2
  const bodyLength = Math.max(0.30, length - 0.08)
  const radius = 0.024
  const barA = new THREE.Mesh(new RoundedBoxGeometry(bodyLength, arm, diameter, 3, radius), material)
  const barB = new THREE.Mesh(new RoundedBoxGeometry(bodyLength, diameter, arm, 3, radius), material)
  barA.position.y = 0.32
  barB.position.y = 0.32
  group.add(barA, barB)

  for (const side of [-1, 1]) {
    const cap = visualOnly(extrudeAlongX(crossBoreShape(0.185, 0.0, 0.0), 0.008, shadedMaterial(color, 0.58), { bevelEnabled: false }))
    // Replace the circular placeholder with a cross-shaped face by using two tiny bars.
    cap.visible = false
    group.add(cap)
    const x = side * bodyLength / 2
    const faceA = visualOnly(new THREE.Mesh(new RoundedBoxGeometry(0.008, arm * 0.94, diameter * 0.94, 2, 0.010), shadedMaterial(color, 0.72)))
    const faceB = visualOnly(new THREE.Mesh(new RoundedBoxGeometry(0.008, diameter * 0.94, arm * 0.94, 2, 0.010), shadedMaterial(color, 0.72)))
    faceA.position.set(x + side * 0.005, 0.32, 0)
    faceB.position.set(x + side * 0.005, 0.32, 0)
    group.add(faceA, faceB)
  }
  return group
}

function addPinSlots(group, length, color) {
  const slotLength = Math.max(0.17, Math.min(0.42, length * 0.24))
  const material = shadedMaterial(color, 0.40)
  for (const end of [-1, 1]) {
    const z = end * (length / 2 - slotLength * 0.58)
    for (const xSide of [-1, 1]) {
      const slot = visualOnly(new THREE.Mesh(new RoundedBoxGeometry(0.010, 0.075, slotLength, 2, 0.004), material))
      slot.position.set(xSide * 0.166, 0.28, z)
      group.add(slot)
    }
  }
}

function createRealPin(part, color, length, friction) {
  const group = root(part.id, color)
  const material = pomMaterial(color)
  const coreLength = Math.max(0.20, length - 0.20)
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.164, 0.164, coreLength, 40), material)
  core.rotation.x = Math.PI / 2
  core.position.y = 0.28
  group.add(core)

  for (const side of [-1, 1]) {
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.142, 0.169, 0.20, 40), material)
    tip.rotation.x = Math.PI / 2
    tip.position.set(0, 0.28, side * (length / 2 - 0.10))
    group.add(tip)
  }

  const collarRadius = friction ? 0.263 : 0.236
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(collarRadius, collarRadius, 0.125, 40), material)
  collar.rotation.x = Math.PI / 2
  collar.position.y = 0.28
  group.add(collar)

  if (friction) {
    for (const z of [-length * 0.31, length * 0.31]) {
      const ridge = new THREE.Mesh(new THREE.TorusGeometry(0.172, 0.018, 8, 36), material)
      ridge.position.set(0, 0.28, z)
      group.add(ridge)
      for (let i = 0; i < 4; i += 1) {
        const a = i * Math.PI / 2
        const rib = new THREE.Mesh(new RoundedBoxGeometry(0.042, 0.042, Math.max(0.16, length * 0.21), 2, 0.010), material)
        rib.position.set(Math.cos(a) * 0.165, 0.28 + Math.sin(a) * 0.165, z)
        rib.rotation.z = a
        group.add(rib)
      }
    }
  }
  addPinSlots(group, length, color)
  return group
}

function involutePolar(baseRadius, radius) {
  if (!(radius > baseRadius)) return 0
  const t = Math.sqrt(Math.max(0, radius * radius / (baseRadius * baseRadius) - 1))
  return t - Math.atan(t)
}

function involuteToothOutline(metrics, innerHole = null) {
  const shape = new THREE.Shape()
  const base = Math.max(metrics.rootRadius, metrics.baseRadius)
  const pitchInvolute = involutePolar(metrics.baseRadius, metrics.pitchRadius)
  const halfThickness = metrics.toothAngle * 0.25
  const samples = 6
  const flank = radius => halfThickness - (involutePolar(metrics.baseRadius, Math.max(radius, metrics.baseRadius)) - pitchInvolute)

  for (let tooth = 0; tooth < metrics.teeth; tooth += 1) {
    const center = tooth * metrics.toothAngle
    const baseHalf = THREE.MathUtils.clamp(flank(base), metrics.toothAngle * 0.24, metrics.toothAngle * 0.42)
    const rootHalf = Math.min(metrics.toothAngle * 0.44, baseHalf + metrics.toothAngle * 0.025)
    let a = center - rootHalf
    if (tooth === 0) shape.moveTo(Math.cos(a) * metrics.rootRadius, Math.sin(a) * metrics.rootRadius)
    else shape.lineTo(Math.cos(a) * metrics.rootRadius, Math.sin(a) * metrics.rootRadius)
    if (metrics.rootRadius < base - 1e-6) {
      a = center - baseHalf
      shape.lineTo(Math.cos(a) * base, Math.sin(a) * base)
    }
    for (let i = 0; i <= samples; i += 1) {
      const radius = base + (metrics.outerRadius - base) * (i / samples)
      a = center - flank(radius)
      shape.lineTo(Math.cos(a) * radius, Math.sin(a) * radius)
    }
    const tipHalf = Math.max(metrics.toothAngle * 0.075, flank(metrics.outerRadius))
    for (let i = 1; i <= 4; i += 1) {
      a = center - tipHalf + tipHalf * 2 * (i / 4)
      shape.lineTo(Math.cos(a) * metrics.outerRadius, Math.sin(a) * metrics.outerRadius)
    }
    for (let i = samples; i >= 0; i -= 1) {
      const radius = base + (metrics.outerRadius - base) * (i / samples)
      a = center + flank(radius)
      shape.lineTo(Math.cos(a) * radius, Math.sin(a) * radius)
    }
    if (metrics.rootRadius < base - 1e-6) {
      a = center + baseHalf
      shape.lineTo(Math.cos(a) * base, Math.sin(a) * base)
    }
    a = center + rootHalf
    shape.lineTo(Math.cos(a) * metrics.rootRadius, Math.sin(a) * metrics.rootRadius)
    const valley = center + metrics.toothAngle * 0.5
    shape.lineTo(Math.cos(valley) * metrics.rootRadius, Math.sin(valley) * metrics.rootRadius)
  }
  shape.closePath()
  if (innerHole) shape.holes.push(circleHole(0, 0, innerHole))
  else shape.holes.push(crossPath())
  return shape
}

function radialSpokeGeometry(inner, outer, tangentWidth, depth) {
  const length = Math.max(0.08, outer - inner)
  return new RoundedBoxGeometry(tangentWidth, depth, length, 3, Math.min(0.025, tangentWidth * 0.22))
}

function createRealSpurGear(part, color) {
  const metrics = gearMetrics(part.mechanics.gear.teeth, 'spur')
  const group = root(part.id, color)
  const material = pomMaterial(color)
  const large = metrics.teeth >= 16
  const hubRadius = metrics.teeth <= 12 ? 0.31 : 0.325
  const ringInner = large ? Math.max(hubRadius + 0.18, metrics.rootRadius * 0.68) : null
  const toothBody = extrudeShape(involuteToothOutline(metrics, ringInner), metrics.thickness, material, {
    bevelSegments: 3,
    bevelSize: 0.007,
    bevelThickness: 0.009,
    curveSegments: 18,
  })
  toothBody.rotation.x = Math.PI / 2
  toothBody.position.y = 0.40
  group.add(toothBody)

  const hub = extrudeShape(crossBoreShape(hubRadius), metrics.thickness + 0.075, material, {
    bevelSegments: 3,
    bevelSize: 0.007,
    bevelThickness: 0.009,
  })
  hub.rotation.x = Math.PI / 2
  hub.position.y = 0.40
  group.add(hub)

  if (large && ringInner > hubRadius + 0.08) {
    const spokeCount = metrics.teeth >= 36 ? 8 : metrics.teeth >= 20 ? 6 : 4
    const inner = hubRadius * 0.94
    const outer = ringInner + 0.045
    const spokeGeo = radialSpokeGeometry(inner, outer, Math.max(0.10, metrics.pitchRadius * 0.10), metrics.thickness * 0.72)
    const mid = (inner + outer) / 2
    for (let i = 0; i < spokeCount; i += 1) {
      const angle = i / spokeCount * Math.PI * 2
      const spoke = new THREE.Mesh(spokeGeo, material)
      spoke.position.set(Math.sin(angle) * mid, 0.40, Math.cos(angle) * mid)
      spoke.rotation.y = -angle
      group.add(spoke)
    }
  }

  const boreShade = visualOnly(extrudeShape(annulusShape(0.224, 0.207), metrics.thickness + 0.10, shadedMaterial(color, 0.38), { bevelEnabled: false }))
  boreShade.rotation.x = Math.PI / 2
  boreShade.position.y = 0.40
  group.add(boreShade)
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

function bevelToothGeometry(metrics, coneAngle) {
  const slices = 6
  const half = metrics.thickness / 2
  const slope = Math.tan(coneAngle)
  const positions = []
  const indices = []
  const rings = []
  for (let s = 0; s <= slices; s += 1) {
    const u = s / slices
    const y = -half + metrics.thickness * u
    const pitch = metrics.pitchRadius + slope * (-y) * 0.48
    const addendum = metrics.addendum * THREE.MathUtils.lerp(0.96, 0.64, u)
    const dedendum = metrics.dedendum * THREE.MathUtils.lerp(0.78, 0.58, u)
    const rootRadius = Math.max(0.24, pitch - dedendum)
    const tipRadius = pitch + addendum
    const rootHalf = metrics.toothAngle * THREE.MathUtils.lerp(0.34, 0.27, u)
    const tipHalf = metrics.toothAngle * THREE.MathUtils.lerp(0.14, 0.095, u)
    const ring = []
    for (const [radius, angle] of [[rootRadius, -rootHalf], [tipRadius, -tipHalf], [tipRadius, tipHalf], [rootRadius, rootHalf]]) {
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
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function createRealBevelGear(part, color) {
  const metrics = gearMetrics(part.mechanics.gear.teeth, 'bevel')
  const coneAngle = bevelPitchConeAngle(metrics.teeth)
  const group = root(part.id, color)
  const material = pomMaterial(color)
  const half = metrics.thickness / 2
  const slope = Math.tan(coneAngle)
  const outerLarge = Math.max(0.40, metrics.pitchRadius + metrics.addendum * 0.24 + slope * half * 0.45)
  const outerSmall = Math.max(0.34, metrics.pitchRadius - metrics.addendum * 0.12 - slope * half * 0.45)
  const body = new THREE.Mesh(frustumRingGeometry(outerLarge, outerSmall, 0.33, metrics.thickness, Math.max(72, metrics.teeth * 5)), material)
  body.position.y = 0.40
  group.add(body)

  const toothGeometry = bevelToothGeometry(metrics, coneAngle)
  const teeth = new THREE.InstancedMesh(toothGeometry, material, metrics.teeth)
  const matrix = new THREE.Matrix4()
  const quaternion = new THREE.Quaternion()
  const scale = new THREE.Vector3(1, 1, 1)
  for (let i = 0; i < metrics.teeth; i += 1) {
    quaternion.setFromAxisAngle(Y_AXIS, i / metrics.teeth * Math.PI * 2)
    matrix.compose(new THREE.Vector3(0, 0.40, 0), quaternion, scale)
    teeth.setMatrixAt(i, matrix)
  }
  teeth.instanceMatrix.needsUpdate = true
  group.add(teeth)

  const hub = extrudeShape(crossBoreShape(0.34), metrics.thickness + 0.11, material, {
    bevelSegments: 3,
    bevelSize: 0.007,
    bevelThickness: 0.009,
  })
  hub.rotation.x = Math.PI / 2
  hub.position.y = 0.40
  group.add(hub)
  return group
}

function realisticTyreProfile(metrics) {
  const half = metrics.width / 2
  const bead = metrics.beadRadius
  const crown = metrics.carcassRadius
  const family = metrics.family
  const shoulderDrop = family === 'tractor' ? 0.085 : family === 'offroad' ? 0.060 : 0.036
  const points = [
    new THREE.Vector2(bead * 0.995, -half * 0.67),
    new THREE.Vector2(bead * 1.010, -half * 0.84),
    new THREE.Vector2(bead * 1.060, -half * 0.96),
  ]
  for (let i = 0; i <= 18; i += 1) {
    const t = -1 + i * 2 / 18
    const shoulder = Math.pow(Math.abs(t), 2.15)
    const radial = crown * (1 - shoulderDrop * shoulder)
    const bulge = Math.sin((t + 1) * Math.PI / 2) * metrics.radius * (family === 'road' ? 0.008 : 0.014)
    points.push(new THREE.Vector2(radial + bulge, half * t))
  }
  points.push(
    new THREE.Vector2(bead * 1.060, half * 0.96),
    new THREE.Vector2(bead * 1.010, half * 0.84),
    new THREE.Vector2(bead * 0.995, half * 0.67),
    new THREE.Vector2(bead * 0.995, -half * 0.67),
  )
  return points
}

function addTread(group, metrics, material) {
  const family = metrics.family
  const radial = metrics.carcassRadius + metrics.lugHeight * 0.48
  const instances = family === 'tractor' || family === 'road' ? metrics.treadCount * 2 : metrics.treadCount
  const axialWidth = family === 'tractor' ? metrics.width * 0.62 : family === 'offroad' ? metrics.width * 0.52 : family === 'narrow' ? metrics.width * 0.68 : metrics.width * 0.24
  const tangentDepth = family === 'tractor' ? metrics.radius * 0.19 : family === 'offroad' ? metrics.radius * 0.135 : metrics.radius * 0.056
  const geometry = new RoundedBoxGeometry(
    Math.max(0.05, axialWidth),
    Math.max(0.020, metrics.lugHeight),
    Math.max(0.045, tangentDepth),
    2,
    Math.min(0.018, metrics.lugHeight * 0.22),
  )
  const mesh = visualOnly(new THREE.InstancedMesh(geometry, material, instances))
  const matrix = new THREE.Matrix4()
  const qRadial = new THREE.Quaternion()
  const qTilt = new THREE.Quaternion()
  const q = new THREE.Quaternion()
  const scale = new THREE.Vector3(1, 1, 1)
  let index = 0
  const place = (angle, x, tilt) => {
    const offset = new THREE.Vector3(x, radial, 0).applyAxisAngle(X_AXIS, angle)
    qRadial.setFromAxisAngle(X_AXIS, angle)
    qTilt.setFromAxisAngle(Y_AXIS, tilt)
    q.copy(qRadial).multiply(qTilt)
    matrix.compose(new THREE.Vector3(offset.x, WHEEL_CENTER_Y + offset.y, offset.z), q, scale)
    mesh.setMatrixAt(index++, matrix)
  }
  for (let i = 0; i < metrics.treadCount; i += 1) {
    const a = i / metrics.treadCount * Math.PI * 2
    if (family === 'tractor') {
      place(a, -metrics.width * 0.20, 0.56)
      place(a, metrics.width * 0.20, -0.56)
    } else if (family === 'offroad') {
      const side = i % 2 ? 1 : -1
      place(a, side * metrics.width * 0.16, side * 0.14)
    } else if (family === 'road') {
      place(a, -metrics.width * 0.21, 0.08)
      place(a, metrics.width * 0.21, -0.08)
    } else {
      place(a, 0, i % 2 ? 0.03 : -0.03)
    }
  }
  mesh.instanceMatrix.needsUpdate = true
  group.add(mesh)
}

function createSpokeGeometry(metrics) {
  const inner = metrics.hubRadius * 1.04
  const outer = metrics.rimOuterRadius * 0.83
  const length = Math.max(0.10, outer - inner)
  const mid = (inner + outer) / 2
  const tangential = Math.max(0.075, metrics.radius * 0.060)
  const axial = Math.max(0.10, metrics.width * 0.28)
  return { geometry: new RoundedBoxGeometry(axial, tangential, length, 3, Math.min(0.024, tangential * 0.28)), mid }
}

function createRealWheel(part, color) {
  const metrics = wheelMetrics(part)
  const group = root(part.id, color)
  const rubber = rubberMaterial()
  const rimMaterial = absMaterial(color, 0.34)
  const tyre = new THREE.Mesh(new THREE.LatheGeometry(realisticTyreProfile(metrics), 96), rubber)
  tyre.rotation.z = -Math.PI / 2
  tyre.position.y = WHEEL_CENTER_Y
  group.add(tyre)
  addTread(group, metrics, rubber)

  const barrel = extrudeAlongX(
    annulusShape(metrics.rimOuterRadius, Math.max(metrics.hubRadius * 1.34, metrics.rimOuterRadius * 0.65)),
    metrics.width * 0.74,
    rimMaterial,
    { bevelSegments: 3, bevelSize: 0.009, bevelThickness: 0.009 },
  )
  barrel.position.y = WHEEL_CENTER_Y
  group.add(barrel)

  const lipShape = annulusShape(metrics.rimOuterRadius * 1.025, metrics.rimOuterRadius * 0.91)
  for (const side of [-1, 1]) {
    const lip = extrudeAlongX(lipShape, Math.max(0.035, metrics.width * 0.048), rimMaterial, {
      bevelSegments: 2,
      bevelSize: 0.005,
      bevelThickness: 0.005,
    })
    lip.position.set(side * metrics.width * 0.385, WHEEL_CENTER_Y, 0)
    group.add(lip)

    const sidewallRing = visualOnly(new THREE.Mesh(
      new THREE.TorusGeometry(metrics.carcassRadius * 0.82, Math.max(0.007, metrics.radius * 0.006), 6, 72),
      shadedMaterial(0x202326, 0.72),
    ))
    sidewallRing.rotation.y = Math.PI / 2
    sidewallRing.position.set(side * metrics.width * 0.475, WHEEL_CENTER_Y, 0)
    group.add(sidewallRing)
  }

  const dishOuter = metrics.rimOuterRadius * 0.80
  const dishInner = metrics.hubRadius * 1.18
  for (const side of [-1, 1]) {
    const dish = extrudeAlongX(annulusShape(dishOuter, dishInner), Math.max(0.032, metrics.width * 0.040), rimMaterial, {
      bevelSegments: 2,
      bevelSize: 0.005,
      bevelThickness: 0.005,
    })
    dish.position.set(side * metrics.width * 0.19, WHEEL_CENTER_Y, 0)
    group.add(dish)
  }

  const { geometry: spokeGeometry, mid } = createSpokeGeometry(metrics)
  for (let i = 0; i < metrics.spokes; i += 1) {
    const a = i / metrics.spokes * Math.PI * 2
    const spoke = new THREE.Mesh(spokeGeometry, rimMaterial)
    spoke.position.set(0, WHEEL_CENTER_Y + Math.cos(a) * mid, Math.sin(a) * mid)
    spoke.rotation.x = a
    group.add(spoke)
  }

  const hub = extrudeAlongX(crossBoreShape(metrics.hubRadius), metrics.width * 0.84, rimMaterial, {
    bevelSegments: 3,
    bevelSize: 0.008,
    bevelThickness: 0.009,
  })
  hub.position.y = WHEEL_CENTER_Y
  group.add(hub)

  const bore = visualOnly(extrudeAlongX(annulusShape(0.225, 0.207), metrics.width * 0.88, shadedMaterial(color, 0.36), { bevelEnabled: false }))
  bore.position.y = WHEEL_CENTER_Y
  group.add(bore)
  return group
}

function frameHoleCoordinates(width = 7, height = 5) {
  const points = []
  for (let x = 0; x < width; x += 1) {
    points.push([x - (width - 1) / 2, -(height - 1) / 2])
    points.push([x - (width - 1) / 2, (height - 1) / 2])
  }
  for (let y = 1; y < height - 1; y += 1) {
    points.push([-(width - 1) / 2, y - (height - 1) / 2])
    points.push([(width - 1) / 2, y - (height - 1) / 2])
  }
  return points
}

function createRealFrame(part, color) {
  const group = root(part.id, color)
  const material = absMaterial(color, 0.37)
  const depth = 0.78
  const outer = roundedRectShape(6.90, 4.90, 0.43)
  outer.holes.push(roundedRectShape(5.05, 3.05, 0.30))
  const points = frameHoleCoordinates()
  for (const [x, y] of points) outer.holes.push(circleHole(x, y, TECHNIC_METRICS.pinHoleRadius))
  const body = extrudeShape(outer, depth, material, {
    bevelSegments: 4,
    bevelSize: 0.016,
    bevelThickness: 0.016,
  })
  body.position.y = 2.45
  group.add(body)
  for (const [x, y] of points) addBore(group, [x, y + 2.45, 0], [0, 0, 1], depth, color)

  // Molded gussets at the four inner corners, kept subtle and collider-independent.
  for (const [x, y, r] of [[-2.45, -1.45, 0], [2.45, -1.45, Math.PI / 2], [2.45, 1.45, Math.PI], [-2.45, 1.45, -Math.PI / 2]]) {
    const gusset = visualOnly(new THREE.Mesh(new RoundedBoxGeometry(0.55, 0.18, depth * 0.72, 3, 0.055), absMaterial(color, 0.42)))
    gusset.position.set(x, y + 2.45, 0)
    gusset.rotation.z = r
    group.add(gusset)
  }
  return group
}

const upgraded = []
for (const part of PARTS) {
  let match = part.id.match(/^beam-(\d+)$/)
  if (match) {
    const length = Number(match[1])
    patchPart(PARTS, part.id, { create: color => createRealLiftarm(part, color, length, TECHNIC_METRICS.beamDepth), visualQuality: 'parts-6-waisted-liftarm-realism' })
    upgraded.push(part.id)
    continue
  }
  match = part.id.match(/^thin-beam-(\d+)$/)
  if (match) {
    const length = Number(match[1])
    patchPart(PARTS, part.id, { create: color => createRealLiftarm(part, color, length, TECHNIC_METRICS.thinBeamDepth), visualQuality: 'parts-6-waisted-thin-liftarm-realism' })
    upgraded.push(part.id)
    continue
  }
  match = part.id.match(/^technic-brick-1x(\d+)$/)
  if (match) {
    const length = Number(match[1])
    patchPart(PARTS, part.id, { create: color => createRealTechnicBrick(part, color, length), visualQuality: 'parts-6-hollow-bossed-technic-brick' })
    upgraded.push(part.id)
    continue
  }
  if (/^axle-\d+$/.test(part.id)) {
    patchPart(PARTS, part.id, { create: color => createRealAxle(part, color), visualQuality: 'parts-6-rounded-cross-axle' })
    upgraded.push(part.id)
    continue
  }
  if (part.mechanics?.wheel) {
    patchPart(PARTS, part.id, { create: color => createRealWheel(part, color), visualQuality: `parts-6-${wheelMetrics(part).family}-wheel-realism` })
    upgraded.push(part.id)
    continue
  }
  if (part.mechanics?.gear) {
    const kind = part.mechanics.gear.kind ?? 'spur'
    patchPart(PARTS, part.id, { create: color => kind === 'bevel' ? createRealBevelGear(part, color) : createRealSpurGear(part, color), visualQuality: kind === 'bevel' ? 'parts-6-bevel-gear-realism' : 'parts-6-involute-spoked-gear-realism' })
    upgraded.push(part.id)
  }
}

for (const [id, length, friction] of [['pin', 2.0, true], ['pin-half', 0.9, true], ['pin-long', 3.0, true], ['pin-frictionless', 2.0, false]]) {
  const part = PARTS.find(item => item.id === id)
  if (!part) continue
  patchPart(PARTS, id, { create: color => createRealPin(part, color, length, friction), visualQuality: friction ? 'parts-6-friction-pin-realism' : 'parts-6-frictionless-pin-realism' })
  upgraded.push(id)
}

const frame = PARTS.find(item => item.id === 'technic-frame-5x7')
if (frame) {
  patchPart(PARTS, frame.id, { create: color => createRealFrame(frame, color), visualQuality: 'parts-6-frame-molded-realism' })
  upgraded.push(frame.id)
}

globalThis.BrickLabParts6Realism = Object.freeze({
  version: PARTS6_REALISM_VERSION,
  upgraded: [...new Set(upgraded)],
  principles: Object.freeze([
    'waisted molded liftarm silhouettes',
    'true bores and reinforced Technic brick bosses',
    'rounded POM axle and pin profiles',
    'involute tooth rings with molded hubs and spokes',
    'family-specific profiled tyres and recessed rims',
    'visual detail remains independent from authoritative physics',
  ]),
})

window.dispatchEvent(new CustomEvent('bricklab:partcatalogchange', {
  detail: { total: PARTS.length, pack: PARTS6_REALISM_VERSION },
}))
