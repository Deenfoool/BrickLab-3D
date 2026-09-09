import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { PARTS } from '../parts.js'
import { patchPart } from '../parts3/part-schema-v1.js'
import { gearMetrics } from '../parts5/part-geometry-metrics-v1.js'

export const PARTS6_NOMINAL_DIMENSION_VERSION = 'parts-6-nominal-dimension-fidelity-v1'

// BrickLab uses one stud as 8 mm. These ratios intentionally describe visible
// nominal geometry only; connector centers remain on the existing BrickLab grid.
export const REAL_TECHNIC_NOMINAL = Object.freeze({
  studMm: 8,
  studDiameter: 4.8 / 8,
  studHeight: 1.8 / 8,
  pinHoleRadius: 2.4 / 8,
  pinCounterboreRadius: 3.0 / 8,
  pinCounterboreDepth: 0.8 / 8,
  axleTipRadius: 4.78 / 16,
  axleArmHalfWidth: 1.79 / 16,
  pinBodyRadius: 2.34 / 8,
  pinFrictionRadius: 2.45 / 8,
  gearTipDiameterOffsetMm: 1.494,
})

const N = REAL_TECHNIC_NOMINAL
const Y_AXIS = new THREE.Vector3(0, 1, 0)
const Z_AXIS = new THREE.Vector3(0, 0, 1)

function absMaterial(color, roughness = 0.36) {
  return new THREE.MeshPhysicalMaterial({ color, roughness, metalness: 0.004, clearcoat: 0.045, clearcoatRoughness: 0.62, ior: 1.47 })
}
function pomMaterial(color) { return new THREE.MeshStandardMaterial({ color, roughness: 0.41, metalness: 0.004 }) }
function shade(color, factor = 0.56) {
  return new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(factor), roughness: 0.72, metalness: 0.003, side: THREE.DoubleSide })
}
function root(id, color) {
  const group = new THREE.Group()
  group.userData.partId = id
  group.userData.color = color
  group.userData.visualVersion = PARTS6_NOMINAL_DIMENSION_VERSION
  return group
}
function visualOnly(object) {
  object.userData.physicsIgnore = true
  object.userData.parts6VisualDetail = true
  object.userData.parts6NominalDimension = true
  return object
}
function circleHole(x, y, radius) {
  const path = new THREE.Path()
  path.absarc(x, y, radius, 0, Math.PI * 2, true)
  return path
}
function roundedRect(width, height, radius) {
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
function crossPoints(radius = N.axleTipRadius, arm = N.axleArmHalfWidth) {
  return [
    [-arm, radius], [arm, radius], [arm, arm], [radius, arm], [radius, -arm], [arm, -arm],
    [arm, -radius], [-arm, -radius], [-arm, -arm], [-radius, -arm], [-radius, arm], [-arm, arm],
  ]
}
function crossPath(radius = N.axleTipRadius + 0.006, arm = N.axleArmHalfWidth + 0.004) {
  const path = new THREE.Path()
  const points = crossPoints(radius, arm)
  path.moveTo(...points[0])
  for (let i = 1; i < points.length; i += 1) path.lineTo(...points[i])
  path.closePath()
  return path
}
function crossBoreShape(outer, radius = N.axleTipRadius + 0.006, arm = N.axleArmHalfWidth + 0.004) {
  const shape = new THREE.Shape()
  shape.absarc(0, 0, outer, 0, Math.PI * 2, false)
  shape.holes.push(crossPath(radius, arm))
  return shape
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
    bevelSegments: options.bevelSegments ?? 3,
    bevelSize: options.bevelSize ?? 0.010,
    bevelThickness: options.bevelThickness ?? 0.010,
    curveSegments: options.curveSegments ?? 36,
    steps: 1,
  })
  geometry.translate(0, 0, -depth / 2)
  return new THREE.Mesh(geometry, material)
}
function extrudeX(shape, depth, material, options = {}) {
  const mesh = extrude(shape, depth, material, options)
  mesh.rotation.y = Math.PI / 2
  return mesh
}

function addPinHoleFinish(group, x, y, depth, color) {
  const liner = visualOnly(new THREE.Mesh(
    new THREE.CylinderGeometry(N.pinHoleRadius * 0.998, N.pinHoleRadius * 0.998, depth + 0.012, 44, 1, true),
    shade(color, 0.53),
  ))
  liner.rotation.x = Math.PI / 2
  liner.position.set(x, y, 0)
  group.add(liner)

  // A real liftarm has a visibly wider shallow counterbore around the 4.8 mm bore.
  const counterbore = new THREE.TorusGeometry(
    (N.pinCounterboreRadius + N.pinHoleRadius) / 2,
    (N.pinCounterboreRadius - N.pinHoleRadius) / 2,
    8,
    44,
  )
  for (const side of [-1, 1]) {
    const ring = visualOnly(new THREE.Mesh(counterbore, shade(color, 0.78)))
    ring.position.set(x, y, side * (depth / 2 + 0.004))
    group.add(ring)
  }
}

function liftarmShape(length) {
  const half = 0.45
  const first = -(length - 1) / 2
  const last = (length - 1) / 2
  const shape = new THREE.Shape()
  shape.moveTo(first, half)
  for (let i = 0; i < length - 1; i += 1) {
    const a = first + i
    const b = a + 1
    shape.quadraticCurveTo((a + b) / 2, half * 0.90, b, half)
  }
  shape.quadraticCurveTo(last + half, half, last + half, 0)
  shape.quadraticCurveTo(last + half, -half, last, -half)
  for (let i = length - 1; i > 0; i -= 1) {
    const a = first + i
    const b = a - 1
    shape.quadraticCurveTo((a + b) / 2, -half * 0.90, b, -half)
  }
  shape.quadraticCurveTo(first - half, -half, first - half, 0)
  shape.quadraticCurveTo(first - half, half, first, half)
  shape.closePath()
  for (let i = 0; i < length; i += 1) shape.holes.push(circleHole(first + i, 0, N.pinHoleRadius))
  return shape
}

function createLiftarm(part, color, length, depth) {
  const group = root(part.id, color)
  const material = absMaterial(color)
  const body = extrude(liftarmShape(length), depth, material, { bevelSegments: 4, bevelSize: 0.015, bevelThickness: 0.015 })
  body.position.y = 0.45
  group.add(body)
  for (let i = 0; i < length; i += 1) addPinHoleFinish(group, i - (length - 1) / 2, 0.45, depth, color)
  return group
}

function bentOutline(points) {
  const half = 0.45
  const minY = Math.min(...points.map(([, y]) => y))
  const maxY = Math.max(...points.map(([, y]) => y))
  const low = points.filter(([, y]) => Math.abs(y - minY) < 1e-6)
  const minX = Math.min(...low.map(([x]) => x))
  const maxX = Math.max(...low.map(([x]) => x))
  const verticalX = Math.max(...points.map(([x]) => x))
  const shape = new THREE.Shape()
  shape.moveTo(minX - half, minY - half)
  shape.lineTo(maxX + half, minY - half)
  shape.quadraticCurveTo(verticalX + half, minY - half, verticalX + half, minY)
  shape.lineTo(verticalX + half, maxY)
  shape.quadraticCurveTo(verticalX + half, maxY + half, verticalX, maxY + half)
  shape.lineTo(verticalX - half, maxY + half)
  shape.lineTo(verticalX - half, minY + half)
  shape.lineTo(minX - half, minY + half)
  shape.quadraticCurveTo(minX - half, minY + half, minX - half, minY)
  shape.closePath()
  for (const [x, y] of points) shape.holes.push(circleHole(x, y, N.pinHoleRadius))
  return shape
}

function createBentLiftarm(part, color) {
  const points = part.connectors.filter(item => item.type === 'pin-hole').map(item => [item.position[0], item.position[1]])
  const group = root(part.id, color)
  const depth = 0.78
  const body = extrude(bentOutline(points), depth, absMaterial(color), { bevelSegments: 4, bevelSize: 0.015, bevelThickness: 0.015 })
  group.add(body)
  for (const [x, y] of points) addPinHoleFinish(group, x, y, depth, color)
  return group
}

function addStud(group, x, color) {
  const material = absMaterial(color, 0.33)
  const stud = new THREE.Mesh(new THREE.CylinderGeometry(N.studDiameter / 2 * 0.99, N.studDiameter / 2, N.studHeight, 44), material)
  stud.position.set(x, 1.20 + N.studHeight / 2, 0)
  group.add(stud)
  const witness = visualOnly(new THREE.Mesh(new THREE.CircleGeometry(0.038, 20), shade(color, 0.82)))
  witness.rotation.x = -Math.PI / 2
  witness.position.set(x, 1.20 + N.studHeight + 0.001, 0)
  group.add(witness)
}

function createTechnicBrick(part, color, length) {
  const group = root(part.id, color)
  const material = absMaterial(color)
  const width = Math.max(1, length - 0.08)
  const depth = 0.88
  const wall = 0.115
  const count = Math.max(1, length - 1)
  const side = roundedRect(width, 1.04, 0.092)
  for (let i = 0; i < count; i += 1) side.holes.push(circleHole(i - (count - 1) / 2, 0, N.pinHoleRadius))
  for (const sign of [-1, 1]) {
    const panel = extrude(side, wall, material, { bevelSegments: 3, bevelSize: 0.010, bevelThickness: 0.010 })
    panel.position.set(0, 0.60, sign * (depth / 2 - wall / 2))
    group.add(panel)
    const rail = new THREE.Mesh(new RoundedBoxGeometry(width - 0.16, 0.11, 0.12, 3, 0.030), material)
    rail.position.set(0, 0.095, sign * 0.366)
    group.add(rail)
  }
  const top = new THREE.Mesh(new RoundedBoxGeometry(width, 0.18, depth, 4, 0.060), material)
  top.position.y = 1.07
  group.add(top)
  for (const sign of [-1, 1]) {
    const end = new THREE.Mesh(new RoundedBoxGeometry(0.17, 0.92, depth, 4, 0.058), material)
    end.position.set(sign * (width / 2 - 0.085), 0.55, 0)
    group.add(end)
  }
  for (let i = 0; i < count; i += 1) {
    const x = i - (count - 1) / 2
    const boss = visualOnly(extrude(annulus(N.pinCounterboreRadius, N.pinHoleRadius), depth - wall * 1.5, absMaterial(color, 0.40), { bevelSegments: 2, bevelSize: 0.006, bevelThickness: 0.006 }))
    boss.position.set(x, 0.60, 0)
    group.add(boss)
    addPinHoleFinish(group, x, 0.60, depth, color)
  }
  for (let i = 0; i < length - 1; i += 1) {
    const rib = visualOnly(new THREE.Mesh(new RoundedBoxGeometry(0.072, 0.42, depth - 0.20, 2, 0.020), absMaterial(color, 0.43)))
    rib.position.set(i - (length - 2) / 2, 0.29, 0)
    group.add(rib)
  }
  for (let i = 0; i < length; i += 1) addStud(group, i - (length - 1) / 2, color)
  return group
}

function framePoints() {
  const points = []
  for (let x = 0; x < 7; x += 1) {
    points.push([x - 3, -2], [x - 3, 2])
  }
  for (let y = 1; y < 4; y += 1) points.push([-3, y - 2], [3, y - 2])
  return points
}
function createFrame(part, color) {
  const group = root(part.id, color)
  const depth = 0.78
  const outer = roundedRect(6.90, 4.90, 0.43)
  outer.holes.push(roundedRect(5.05, 3.05, 0.30))
  const points = framePoints()
  for (const [x, y] of points) outer.holes.push(circleHole(x, y, N.pinHoleRadius))
  const body = extrude(outer, depth, absMaterial(color), { bevelSegments: 4, bevelSize: 0.015, bevelThickness: 0.015 })
  body.position.y = 2.45
  group.add(body)
  for (const [x, y] of points) addPinHoleFinish(group, x, y + 2.45, depth, color)
  return group
}

function createAxle(part, color) {
  const length = Math.max(0.5, Number(part.dimensions?.lengthStud) || Number(part.id.match(/(\d+)$/)?.[1]) || 3)
  const group = root(part.id, color)
  const material = pomMaterial(color)
  const diameter = N.axleTipRadius * 2
  const arm = N.axleArmHalfWidth * 2
  const bodyLength = Math.max(0.30, length - 0.08)
  const a = new THREE.Mesh(new RoundedBoxGeometry(bodyLength, arm, diameter, 3, 0.026), material)
  const b = new THREE.Mesh(new RoundedBoxGeometry(bodyLength, diameter, arm, 3, 0.026), material)
  a.position.y = 0.32
  b.position.y = 0.32
  group.add(a, b)
  for (const sign of [-1, 1]) {
    const x = sign * (bodyLength / 2 + 0.005)
    for (const [h, d] of [[arm, diameter], [diameter, arm]]) {
      const face = visualOnly(new THREE.Mesh(new RoundedBoxGeometry(0.008, h * 0.95, d * 0.95, 2, 0.010), shade(color, 0.70)))
      face.position.set(x, 0.32, 0)
      group.add(face)
    }
  }
  // Preserve the pre-realism collision proxy so nominal visual sizing alone cannot
  // inject a new physical clearance/energy change into existing mechanisms.
  part.physics = {
    ...(part.physics ?? {}),
    colliderProfile: {
      version: 'parts-6-preserve-axle-proxy-v1',
      specs: [{ type: 'cylinder-x', center: [0, 0.32, 0], radius: 0.176, halfLength: bodyLength / 2 }],
    },
  }
  return group
}

function createPin(part, color, length, friction) {
  const group = root(part.id, color)
  const material = pomMaterial(color)
  const radius = N.pinBodyRadius
  const core = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, Math.max(0.20, length - 0.20), 44), material)
  core.rotation.x = Math.PI / 2
  core.position.y = 0.28
  group.add(core)
  for (const sign of [-1, 1]) {
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.88, radius, 0.20, 44), material)
    tip.rotation.x = Math.PI / 2
    tip.position.set(0, 0.28, sign * (length / 2 - 0.10))
    group.add(tip)
    const slit = visualOnly(new THREE.Mesh(new RoundedBoxGeometry(0.055, radius * 1.42, 0.012, 2, 0.006), shade(color, 0.42)))
    slit.position.set(0, 0.28, sign * (length / 2 + 0.007))
    group.add(slit)
  }
  const collarRadius = friction ? 0.345 : 0.315
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(collarRadius, collarRadius, 0.13, 44), material)
  collar.rotation.x = Math.PI / 2
  collar.position.y = 0.28
  group.add(collar)
  if (friction) {
    for (const z of [-length * 0.31, length * 0.31]) {
      const ridge = new THREE.Mesh(new THREE.TorusGeometry(N.pinFrictionRadius, 0.018, 8, 40), material)
      ridge.position.set(0, 0.28, z)
      group.add(ridge)
      for (let i = 0; i < 4; i += 1) {
        const angle = i * Math.PI / 2
        const rib = new THREE.Mesh(new RoundedBoxGeometry(0.050, 0.050, Math.max(0.16, length * 0.20), 2, 0.012), material)
        rib.position.set(Math.cos(angle) * radius, 0.28 + Math.sin(angle) * radius, z)
        rib.rotation.z = angle
        group.add(rib)
      }
    }
  }
  return group
}

function createBush(part, color) {
  const width = Math.max(0.28, Number(part.dimensions?.lengthStud) || (part.id === 'half-bush' ? 0.38 : 0.72))
  const group = root(part.id, color)
  const material = pomMaterial(color)
  const shell = extrudeX(crossBoreShape(0.405), width, material, { bevelSegments: 3, bevelSize: 0.009, bevelThickness: 0.011 })
  shell.position.y = 0.36
  group.add(shell)
  for (let i = 0; i < 6; i += 1) {
    const angle = i / 6 * Math.PI * 2
    const rib = visualOnly(new THREE.Mesh(new RoundedBoxGeometry(Math.max(0.16, width * 0.62), 0.045, 0.045, 2, 0.012), material))
    rib.position.set(0, 0.36 + Math.cos(angle) * 0.372, Math.sin(angle) * 0.372)
    rib.rotation.x = angle
    group.add(rib)
  }
  return group
}

function createCoupler(part, color) {
  const group = root(part.id, color)
  const material = pomMaterial(color)
  const shell = extrudeX(crossBoreShape(0.415), 1.50, material, { bevelSegments: 3, bevelSize: 0.009, bevelThickness: 0.012 })
  shell.position.y = 0.38
  group.add(shell)
  for (const x of [-0.52, 0, 0.52]) {
    const band = visualOnly(new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.019, 8, 40), shade(color, 0.50)))
    band.rotation.y = Math.PI / 2
    band.position.set(x, 0.38, 0)
    group.add(band)
  }
  return group
}

function involutePolar(baseRadius, radius) {
  if (!(radius > baseRadius)) return 0
  const t = Math.sqrt(Math.max(0, radius * radius / (baseRadius * baseRadius) - 1))
  return t - Math.atan(t)
}
function realGearMetrics(part) {
  const canonical = gearMetrics(part.mechanics.gear.teeth, 'spur')
  const addendum = N.gearTipDiameterOffsetMm / 16
  const outerRadius = canonical.pitchRadius + addendum
  const dedendum = 1.05 / 8
  const rootRadius = Math.max(0.25, canonical.pitchRadius - dedendum)
  const baseRadius = Math.max(rootRadius, canonical.pitchRadius * Math.cos(20 * Math.PI / 180))
  return { ...canonical, addendum, dedendum, outerRadius, rootRadius, baseRadius }
}
function gearOutline(metrics, innerRadius = null) {
  const shape = new THREE.Shape()
  const base = Math.max(metrics.rootRadius, metrics.baseRadius)
  const pitchInv = involutePolar(metrics.baseRadius, metrics.pitchRadius)
  const halfThickness = metrics.toothAngle * 0.25
  const flank = radius => halfThickness - (involutePolar(metrics.baseRadius, Math.max(radius, metrics.baseRadius)) - pitchInv)
  const samples = 7
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
    const valley = center + metrics.toothAngle / 2
    shape.lineTo(Math.cos(valley) * metrics.rootRadius, Math.sin(valley) * metrics.rootRadius)
  }
  shape.closePath()
  if (innerRadius) shape.holes.push(circleHole(0, 0, innerRadius))
  else shape.holes.push(crossPath())
  return shape
}
function createSpurGear(part, color) {
  const metrics = realGearMetrics(part)
  const group = root(part.id, color)
  const material = pomMaterial(color)
  const hubRadius = metrics.teeth <= 12 ? 0.355 : 0.37
  const ringInner = metrics.teeth >= 16 ? Math.max(hubRadius + 0.16, metrics.rootRadius * 0.68) : null
  const teeth = extrude(gearOutline(metrics, ringInner), metrics.thickness, material, { bevelSegments: 3, bevelSize: 0.006, bevelThickness: 0.008, curveSegments: 18 })
  teeth.rotation.x = Math.PI / 2
  teeth.position.y = 0.40
  group.add(teeth)
  const hub = extrude(crossBoreShape(hubRadius), metrics.thickness + 0.075, material, { bevelSegments: 3, bevelSize: 0.006, bevelThickness: 0.008 })
  hub.rotation.x = Math.PI / 2
  hub.position.y = 0.40
  group.add(hub)
  if (ringInner) {
    const count = metrics.teeth >= 36 ? 8 : metrics.teeth >= 20 ? 6 : 4
    const inner = hubRadius * 0.96
    const outer = ringInner + 0.04
    const length = Math.max(0.08, outer - inner)
    const mid = (inner + outer) / 2
    const tangent = Math.max(0.10, metrics.pitchRadius * 0.09)
    const spokeGeo = new RoundedBoxGeometry(tangent, metrics.thickness * 0.70, length, 3, Math.min(0.022, tangent * 0.22))
    for (let i = 0; i < count; i += 1) {
      const angle = i / count * Math.PI * 2
      const spoke = new THREE.Mesh(spokeGeo, material)
      spoke.position.set(Math.sin(angle) * mid, 0.40, Math.cos(angle) * mid)
      spoke.rotation.y = angle
      group.add(spoke)
    }
  }
  return group
}

const upgraded = []
for (const part of PARTS) {
  let match = part.id.match(/^beam-(\d+)$/)
  if (match) {
    patchPart(PARTS, part.id, { create: color => createLiftarm(part, color, Number(match[1]), 0.78), visualQuality: 'parts-6-nominal-4p8mm-hole-liftarm' })
    upgraded.push(part.id)
    continue
  }
  match = part.id.match(/^thin-beam-(\d+)$/)
  if (match) {
    patchPart(PARTS, part.id, { create: color => createLiftarm(part, color, Number(match[1]), 0.40), visualQuality: 'parts-6-nominal-4p8mm-hole-thin-liftarm' })
    upgraded.push(part.id)
    continue
  }
  match = part.id.match(/^technic-brick-1x(\d+)$/)
  if (match) {
    patchPart(PARTS, part.id, { create: color => createTechnicBrick(part, color, Number(match[1])), visualQuality: 'parts-6-nominal-4p8mm-hole-technic-brick' })
    upgraded.push(part.id)
    continue
  }
  if (/^axle-\d+$/.test(part.id)) {
    patchPart(PARTS, part.id, { create: color => createAxle(part, color), visualQuality: 'parts-6-nominal-4p78mm-cross-axle' })
    upgraded.push(part.id)
    continue
  }
  if (part.mechanics?.gear && (part.mechanics.gear.kind ?? 'spur') === 'spur') {
    patchPart(PARTS, part.id, { create: color => createSpurGear(part, color), visualQuality: 'parts-6-measured-tip-involute-gear' })
    upgraded.push(part.id)
  }
}
for (const id of ['beam-l-3x3', 'beam-angle-4x2']) {
  const part = PARTS.find(item => item.id === id)
  if (!part) continue
  patchPart(PARTS, id, { create: color => createBentLiftarm(part, color), visualQuality: 'parts-6-nominal-4p8mm-hole-bent-liftarm' })
  upgraded.push(id)
}
for (const [id, length, friction] of [['pin', 2, true], ['pin-half', 0.9, true], ['pin-long', 3, true], ['pin-frictionless', 2, false]]) {
  const part = PARTS.find(item => item.id === id)
  if (!part) continue
  patchPart(PARTS, id, { create: color => createPin(part, color, length, friction), visualQuality: friction ? 'parts-6-nominal-friction-pin' : 'parts-6-nominal-frictionless-pin' })
  upgraded.push(id)
}
for (const id of ['bush', 'half-bush']) {
  const part = PARTS.find(item => item.id === id)
  if (!part) continue
  patchPart(PARTS, id, { create: color => createBush(part, color), visualQuality: 'parts-6-nominal-cross-bore-bush' })
  upgraded.push(id)
}
const coupler = PARTS.find(item => item.id === 'axle-coupler')
if (coupler) {
  patchPart(PARTS, coupler.id, { create: color => createCoupler(coupler, color), visualQuality: 'parts-6-nominal-cross-bore-coupler' })
  upgraded.push(coupler.id)
}
const frame = PARTS.find(item => item.id === 'technic-frame-5x7')
if (frame) {
  patchPart(PARTS, frame.id, { create: color => createFrame(frame, color), visualQuality: 'parts-6-nominal-4p8mm-hole-frame' })
  upgraded.push(frame.id)
}

globalThis.BrickLabParts6NominalDimensions = Object.freeze({
  version: PARTS6_NOMINAL_DIMENSION_VERSION,
  nominal: REAL_TECHNIC_NOMINAL,
  upgraded: [...new Set(upgraded)],
  preserved: 'connector centers and drivetrain pitch radii remain unchanged; axle collider proxy explicitly preserves pre-realism radius',
})

window.dispatchEvent(new CustomEvent('bricklab:partcatalogchange', {
  detail: { total: PARTS.length, pack: PARTS6_NOMINAL_DIMENSION_VERSION },
}))
