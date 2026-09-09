import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { PARTS } from '../parts.js'
import { patchPart } from '../parts3/part-schema-v1.js'
import { PARTS5_GEOMETRY_VERSION, wheelMetrics } from './part-geometry-metrics-v1.js'

export const PARTS5_WHEEL_VISUAL_VERSION = 'parts-5-wheel-visual-v2'
const CENTER_Y = 1.15
const AXIS_X = new THREE.Vector3(1, 0, 0)
const AXIS_Y = new THREE.Vector3(0, 1, 0)

function absMaterial(color) {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.36,
    metalness: 0.008,
    clearcoat: 0.10,
    clearcoatRoughness: 0.48,
    ior: 1.47,
  })
}

function rubberMaterial() {
  return new THREE.MeshStandardMaterial({ color: 0x101214, roughness: 0.985, metalness: 0 })
}

function darkMaterial() {
  return new THREE.MeshStandardMaterial({ color: 0x181b1e, roughness: 0.86, metalness: 0.02 })
}

function root(part, color) {
  const g = new THREE.Group()
  g.userData.partId = part.id
  g.userData.color = color
  g.userData.visualVersion = PARTS5_WHEEL_VISUAL_VERSION
  return g
}

function markVisual(object) {
  object.userData.physicsIgnore = true
  object.userData.parts5WheelDetail = true
  return object
}

function crossPoints(radius = 0.205, arm = 0.082) {
  return [
    [-arm, radius], [arm, radius], [arm, arm], [radius, arm], [radius, -arm], [arm, -arm],
    [arm, -radius], [-arm, -radius], [-arm, -arm], [-radius, -arm], [-radius, arm], [-arm, arm],
  ]
}

function crossHole(radius = 0.205, arm = 0.082) {
  const p = new THREE.Path()
  const pts = crossPoints(radius, arm)
  p.moveTo(...pts[0])
  for (let i = 1; i < pts.length; i += 1) p.lineTo(...pts[i])
  p.closePath()
  return p
}

function circleHole(radius) {
  const p = new THREE.Path()
  p.absarc(0, 0, radius, 0, Math.PI * 2, true)
  return p
}

function ringShape(outer, inner) {
  const s = new THREE.Shape()
  s.absarc(0, 0, outer, 0, Math.PI * 2, false)
  s.holes.push(circleHole(inner))
  return s
}

function extrudeAlongX(shape, depth, material, bevel = 0.010) {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelSegments: bevel > 0 ? 2 : 1,
    bevelSize: bevel,
    bevelThickness: bevel,
    curveSegments: 36,
    steps: 1,
  })
  geometry.translate(0, 0, -depth / 2)
  geometry.rotateY(Math.PI / 2)
  return new THREE.Mesh(geometry, material)
}

function tyreProfile(metrics) {
  const half = metrics.width / 2
  const bead = metrics.beadRadius
  const crown = metrics.carcassRadius
  const shoulderFactor = metrics.family === 'tractor' ? 0.955 : metrics.family === 'offroad' ? 0.968 : 0.982
  const shoulder = crown * shoulderFactor
  const bulge = metrics.family === 'narrow' ? 0.93 : 1
  return [
    new THREE.Vector2(bead, -half * 0.68),
    new THREE.Vector2(bead * 1.025, -half * 0.84),
    new THREE.Vector2(shoulder * 0.975, -half * bulge),
    new THREE.Vector2(shoulder, -half * 0.82),
    new THREE.Vector2(crown * 0.995, -half * 0.44),
    new THREE.Vector2(crown, 0),
    new THREE.Vector2(crown * 0.995, half * 0.44),
    new THREE.Vector2(shoulder, half * 0.82),
    new THREE.Vector2(shoulder * 0.975, half * bulge),
    new THREE.Vector2(bead * 1.025, half * 0.84),
    new THREE.Vector2(bead, half * 0.68),
    new THREE.Vector2(bead, -half * 0.68),
  ]
}

function instanceBlocks(group, geometry, material, transforms) {
  if (!transforms.length) return
  const mesh = markVisual(new THREE.InstancedMesh(geometry, material, transforms.length))
  const matrix = new THREE.Matrix4()
  for (let i = 0; i < transforms.length; i += 1) {
    const item = transforms[i]
    matrix.compose(item.position, item.quaternion, item.scale ?? new THREE.Vector3(1, 1, 1))
    mesh.setMatrixAt(i, matrix)
  }
  mesh.instanceMatrix.needsUpdate = true
  group.add(mesh)
}

function treadTransforms(metrics) {
  const transforms = []
  const radial = metrics.carcassRadius + metrics.lugHeight * 0.52
  const qRadial = new THREE.Quaternion()
  const qSkew = new THREE.Quaternion()
  const position = new THREE.Vector3()

  const add = (angle, x, skew = 0) => {
    qRadial.setFromAxisAngle(AXIS_X, angle)
    // Once qRadial has put local +Y on the tyre normal, rotating around local +Y
    // skews a lug across the axial/tangential tread plane without lifting one edge.
    qSkew.setFromAxisAngle(AXIS_Y, skew)
    position.set(x, radial, 0).applyAxisAngle(AXIS_X, angle)
    transforms.push({
      position: new THREE.Vector3(position.x, CENTER_Y + position.y, position.z),
      quaternion: qRadial.clone().multiply(qSkew),
    })
  }

  if (metrics.family === 'tractor') {
    for (let i = 0; i < metrics.treadCount; i += 1) {
      const a = i / metrics.treadCount * Math.PI * 2
      add(a, -metrics.width * 0.18, 0.58)
      add(a, metrics.width * 0.18, -0.58)
    }
    return transforms
  }

  if (metrics.family === 'offroad') {
    for (let i = 0; i < metrics.treadCount; i += 1) {
      const a = i / metrics.treadCount * Math.PI * 2
      const side = i % 2 ? 1 : -1
      add(a, side * metrics.width * 0.16, side * 0.14)
    }
    return transforms
  }

  if (metrics.family === 'narrow') {
    for (let i = 0; i < metrics.treadCount; i += 1) add(i / metrics.treadCount * Math.PI * 2, 0, 0)
    return transforms
  }

  for (let i = 0; i < metrics.treadCount; i += 1) {
    const a = i / metrics.treadCount * Math.PI * 2
    add(a, -metrics.width * 0.23, 0.06)
    add(a, metrics.width * 0.23, -0.06)
  }
  return transforms
}

function addTread(group, metrics, material) {
  let axialWidth
  let tangentDepth
  if (metrics.family === 'tractor') {
    axialWidth = metrics.width * 0.66
    tangentDepth = metrics.radius * 0.19
  } else if (metrics.family === 'offroad') {
    axialWidth = metrics.width * 0.60
    tangentDepth = metrics.radius * 0.145
  } else if (metrics.family === 'narrow') {
    axialWidth = metrics.width * 0.70
    tangentDepth = metrics.radius * 0.070
  } else {
    axialWidth = metrics.width * 0.30
    tangentDepth = metrics.radius * 0.065
  }
  const geometry = new RoundedBoxGeometry(
    Math.max(0.055, axialWidth),
    Math.max(0.024, metrics.lugHeight),
    Math.max(0.050, tangentDepth),
    2,
    Math.min(0.020, metrics.lugHeight * 0.26),
  )
  instanceBlocks(group, geometry, material, treadTransforms(metrics))
}

function addSidewallDetails(group, metrics, material) {
  const ringRadius = metrics.carcassRadius * 0.83
  const ringGeometry = new THREE.TorusGeometry(ringRadius, Math.max(0.009, metrics.radius * 0.008), 6, 64)
  for (const side of [-1, 1]) {
    const ring = markVisual(new THREE.Mesh(ringGeometry, material))
    ring.rotation.y = Math.PI / 2
    ring.position.set(side * metrics.width * 0.485, CENTER_Y, 0)
    group.add(ring)
  }
}

function addRim(group, metrics, color) {
  const rim = absMaterial(color)
  const dark = darkMaterial()
  const innerBarrel = Math.max(metrics.hubRadius * 1.45, metrics.rimOuterRadius * 0.66)
  const barrel = extrudeAlongX(ringShape(metrics.rimOuterRadius, innerBarrel), metrics.width * 0.76, rim, 0.010)
  barrel.position.y = CENTER_Y
  group.add(barrel)

  const lipShape = ringShape(metrics.rimOuterRadius * 1.025, metrics.rimOuterRadius * 0.90)
  for (const side of [-1, 1]) {
    const lip = extrudeAlongX(lipShape, Math.max(0.042, metrics.width * 0.052), rim, 0.007)
    lip.position.set(side * metrics.width * 0.39, CENTER_Y, 0)
    group.add(lip)
  }

  const radialLength = Math.max(0.10, metrics.rimOuterRadius * 0.84 - metrics.hubRadius * 1.04)
  const radialMid = metrics.hubRadius * 1.04 + radialLength / 2
  const spokeGeometry = new RoundedBoxGeometry(
    Math.max(0.09, metrics.width * 0.28),
    radialLength,
    Math.max(0.09, metrics.radius * 0.072),
    3,
    0.026,
  )
  const spokeTransforms = []
  for (let i = 0; i < metrics.spokes; i += 1) {
    const angle = i / metrics.spokes * Math.PI * 2
    const offset = new THREE.Vector3(0, radialMid, 0).applyAxisAngle(AXIS_X, angle)
    spokeTransforms.push({
      position: new THREE.Vector3(0, CENTER_Y + offset.y, offset.z),
      quaternion: new THREE.Quaternion().setFromAxisAngle(AXIS_X, angle),
    })
  }
  instanceBlocks(group, spokeGeometry, rim, spokeTransforms)

  const hubShape = new THREE.Shape()
  hubShape.absarc(0, 0, metrics.hubRadius, 0, Math.PI * 2, false)
  hubShape.holes.push(crossHole())
  const hub = extrudeAlongX(hubShape, metrics.width * 0.86, rim, 0.009)
  hub.position.y = CENTER_Y
  group.add(hub)

  const bore = markVisual(extrudeAlongX(ringShape(0.226, 0.207), metrics.width * 0.90, dark, 0))
  bore.position.y = CENTER_Y
  group.add(bore)
}

function createWheel(part, color) {
  const metrics = wheelMetrics(part)
  const g = root(part, color)
  const rubber = rubberMaterial()
  const tyre = new THREE.Mesh(new THREE.LatheGeometry(tyreProfile(metrics), 72), rubber)
  tyre.rotation.z = -Math.PI / 2
  tyre.position.y = CENTER_Y
  g.add(tyre)
  addTread(g, metrics, rubber)
  addSidewallDetails(g, metrics, rubber)
  addRim(g, metrics, color)
  return g
}

const upgraded = []
for (const part of PARTS) {
  if (!part.mechanics?.wheel) continue
  const metrics = wheelMetrics(part)
  part.mechanics = { ...part.mechanics, wheel: { ...part.mechanics.wheel, radius: metrics.radius, width: metrics.width } }
  part.dimensions = { ...(part.dimensions ?? {}), radiusStud: metrics.radius, widthStud: metrics.width }
  patchPart(PARTS, part.id, {
    create: color => createWheel(part, color),
    visualQuality: 'parts-5-wheel-profile-v2',
    geometryMetricsVersion: PARTS5_GEOMETRY_VERSION,
    wheelVisualVersion: PARTS5_WHEEL_VISUAL_VERSION,
  })
  upgraded.push(part.id)
}

globalThis.BrickLabParts5Wheels = Object.freeze({
  version: PARTS5_WHEEL_VISUAL_VERSION,
  upgraded,
})

window.dispatchEvent(new CustomEvent('bricklab:partcatalogchange', {
  detail: { total: PARTS.length, pack: PARTS5_WHEEL_VISUAL_VERSION },
}))
