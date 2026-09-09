import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { PARTS } from '../parts.js'
import { patchPart } from '../parts3/part-schema-v1.js'

export const PARTS5_DRIVELINE_VISUAL_VERSION = 'parts-5-driveline-refinement-v2'
const DEG = Math.PI / 180
const OUTPUT_ANGLE = 30 * DEG
const OUTPUT_AXIS = new THREE.Vector3(Math.cos(OUTPUT_ANGLE), 0, Math.sin(OUTPUT_ANGLE))
const X_AXIS = new THREE.Vector3(1, 0, 0)
const Y_AXIS = new THREE.Vector3(0, 1, 0)
const Z_AXIS = new THREE.Vector3(0, 0, 1)

function absMaterial(color, roughness = 0.39) {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness,
    metalness: 0.008,
    clearcoat: 0.08,
    clearcoatRoughness: 0.52,
    ior: 1.47,
  })
}

function pomMaterial(color) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.37, metalness: 0.01 })
}

function metalMaterial() {
  return new THREE.MeshStandardMaterial({ color: 0xb8c0c7, roughness: 0.26, metalness: 0.76 })
}

function darkMaterial() {
  return new THREE.MeshStandardMaterial({ color: 0x15181b, roughness: 0.84, metalness: 0.025 })
}

function root(id, color) {
  const group = new THREE.Group()
  group.userData.partId = id
  group.userData.color = color
  group.userData.visualVersion = PARTS5_DRIVELINE_VISUAL_VERSION
  return group
}

function visualOnly(object) {
  object.userData.physicsIgnore = true
  object.userData.parts5VisualDetail = true
  return object
}

function crossPoints(radius = 0.20, arm = 0.082) {
  return [
    [-arm, radius], [arm, radius], [arm, arm], [radius, arm], [radius, -arm], [arm, -arm],
    [arm, -radius], [-arm, -radius], [-arm, -arm], [-radius, -arm], [-radius, arm], [-arm, arm],
  ]
}

function crossPath(radius = 0.20, arm = 0.082) {
  const path = new THREE.Path()
  const points = crossPoints(radius, arm)
  path.moveTo(...points[0])
  for (let i = 1; i < points.length; i += 1) path.lineTo(...points[i])
  path.closePath()
  return path
}

function crossBoreShape(outer, radius = 0.20, arm = 0.082) {
  const shape = new THREE.Shape()
  shape.absarc(0, 0, outer, 0, Math.PI * 2, false)
  shape.holes.push(crossPath(radius, arm))
  return shape
}

function annulusShape(outer, inner) {
  const shape = new THREE.Shape()
  shape.absarc(0, 0, outer, 0, Math.PI * 2, false)
  const hole = new THREE.Path()
  hole.absarc(0, 0, inner, 0, Math.PI * 2, true)
  shape.holes.push(hole)
  return shape
}

function extrudeAlongX(shape, depth, material, bevel = 0.01) {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelSegments: bevel > 0 ? 3 : 1,
    bevelSize: bevel,
    bevelThickness: bevel,
    curveSegments: 32,
    steps: 1,
  })
  geometry.translate(0, 0, -depth / 2)
  geometry.rotateY(Math.PI / 2)
  return new THREE.Mesh(geometry, material)
}

function cylinderX(radius, length, material, segments = 32) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, segments), material)
  mesh.rotation.z = Math.PI / 2
  return mesh
}

function axisQuaternion(axis) {
  return new THREE.Quaternion().setFromUnitVectors(X_AXIS, axis.clone().normalize())
}

function createSocket(radius, length, color) {
  return extrudeAlongX(crossBoreShape(radius), length, absMaterial(color, 0.42), 0.009)
}

function addYoke(group, center, axis, side, color, forkPlane = 'z') {
  const yoke = new THREE.Group()
  yoke.position.copy(center)
  yoke.quaternion.copy(axisQuaternion(axis))
  const material = absMaterial(color, 0.40)

  const socket = createSocket(0.305, 0.34, color)
  socket.position.x = side * 0.47
  yoke.add(socket)

  const neck = cylinderX(0.255, 0.30, material, 36)
  neck.position.x = side * 0.30
  yoke.add(neck)

  const armLength = 0.36
  const armGeo = new RoundedBoxGeometry(armLength, 0.15, 0.16, 4, 0.055)
  const armCenterX = side * 0.13
  for (const sign of [-1, 1]) {
    const arm = new THREE.Mesh(armGeo, material)
    arm.position.x = armCenterX
    if (forkPlane === 'z') arm.position.z = sign * 0.245
    else arm.position.y = sign * 0.245
    yoke.add(arm)

    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.145, 0.145, 0.13, 28), material)
    if (forkPlane === 'z') {
      cap.rotation.x = Math.PI / 2
      cap.position.set(0, 0, sign * 0.245)
    } else {
      cap.position.set(0, sign * 0.245, 0)
    }
    yoke.add(cap)
  }

  group.add(yoke)
}

function createUniversalJointRefined(part, color) {
  const group = root(part.id, color)
  const center = new THREE.Vector3(0, 0.58, 0)
  addYoke(group, center, X_AXIS, -1, color, 'z')
  addYoke(group, center, OUTPUT_AXIS, 1, color, 'y')

  const metal = metalMaterial()
  const trunnionY = new THREE.Mesh(new THREE.CylinderGeometry(0.090, 0.090, 0.64, 24), metal)
  trunnionY.position.copy(center)
  const trunnionZ = new THREE.Mesh(new THREE.CylinderGeometry(0.090, 0.090, 0.64, 24), metal)
  trunnionZ.rotation.x = Math.PI / 2
  trunnionZ.position.copy(center)
  const centerBoss = new THREE.Mesh(new THREE.SphereGeometry(0.135, 24, 16), metal)
  centerBoss.position.copy(center)
  group.add(trunnionY, trunnionZ, centerBoss)

  for (const axis of [Y_AXIS, Z_AXIS]) {
    for (const sign of [-1, 1]) {
      const cap = visualOnly(new THREE.Mesh(new THREE.CylinderGeometry(0.118, 0.118, 0.035, 24), darkMaterial()))
      cap.quaternion.setFromUnitVectors(Y_AXIS, axis)
      cap.position.copy(center).addScaledVector(axis, sign * 0.325)
      group.add(cap)
    }
  }
  return group
}

function basisAround(axis) {
  const u = Math.abs(axis.y) < 0.9 ? Y_AXIS.clone() : Z_AXIS.clone()
  u.sub(axis.clone().multiplyScalar(u.dot(axis))).normalize()
  const v = axis.clone().cross(u).normalize()
  return { u, v }
}

function createCvJointRefined(part, color) {
  const group = root(part.id, color)
  const center = new THREE.Vector3(0.07, 0.58, 0.04)
  const material = absMaterial(color, 0.40)
  const metal = metalMaterial()

  const inputSocket = createSocket(0.315, 0.38, color)
  inputSocket.position.set(-0.48, 0.58, 0)
  group.add(inputSocket)

  const outputSocket = createSocket(0.315, 0.38, color)
  outputSocket.position.copy(new THREE.Vector3(0.47, 0.58, 0.27))
  outputSocket.quaternion.copy(axisQuaternion(OUTPUT_AXIS))
  group.add(outputSocket)

  const inputBell = new THREE.Mesh(new THREE.SphereGeometry(0.43, 40, 24), material)
  inputBell.scale.set(0.72, 1.0, 1.0)
  inputBell.position.copy(center).addScaledVector(X_AXIS, -0.18)
  group.add(inputBell)
  const outputBell = new THREE.Mesh(new THREE.SphereGeometry(0.38, 40, 24), material)
  outputBell.scale.set(0.70, 0.94, 0.94)
  outputBell.position.copy(center).addScaledVector(OUTPUT_AXIS, 0.18)
  group.add(outputBell)

  const bisector = X_AXIS.clone().add(OUTPUT_AXIS).normalize()
  const cage = new THREE.Mesh(new THREE.TorusGeometry(0.285, 0.050, 10, 48), metal)
  cage.quaternion.setFromUnitVectors(Z_AXIS, bisector)
  cage.position.copy(center)
  group.add(cage)

  const { u, v } = basisAround(bisector)
  for (let i = 0; i < 6; i += 1) {
    const a = i / 6 * Math.PI * 2
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.071, 18, 12), metal)
    ball.position.copy(center)
      .addScaledVector(u, Math.cos(a) * 0.255)
      .addScaledVector(v, Math.sin(a) * 0.255)
    group.add(ball)
  }

  const star = new THREE.Group()
  star.position.copy(center)
  star.quaternion.copy(axisQuaternion(bisector))
  for (let i = 0; i < 3; i += 1) {
    const lobe = new THREE.Mesh(new RoundedBoxGeometry(0.20, 0.12, 0.54, 3, 0.045), darkMaterial())
    lobe.rotation.x = i / 3 * Math.PI
    star.add(lobe)
  }
  group.add(star)
  return group
}

function helicalTube(radius, length, turns, tubeRadius) {
  const points = []
  const segments = 112
  for (let i = 0; i <= segments; i += 1) {
    const u = i / segments
    const a = u * Math.PI * 2 * turns
    points.push(new THREE.Vector3(
      Math.cos(a) * radius,
      Math.sin(a) * radius,
      -length / 2 + length * u,
    ))
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points, false, 'centripetal'), segments, tubeRadius, 8, false)
}

function createWormWheel(material) {
  const group = new THREE.Group()
  const core = cylinderX(0.49, 0.30, material, 40)
  group.add(core)
  const toothGeo = new RoundedBoxGeometry(0.32, 0.115, 0.17, 2, 0.025)
  const teeth = new THREE.InstancedMesh(toothGeo, material, 24)
  const matrix = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const pos = new THREE.Vector3()
  for (let i = 0; i < 24; i += 1) {
    const a = i / 24 * Math.PI * 2
    pos.set(0, Math.cos(a) * 0.51, Math.sin(a) * 0.51)
    q.setFromAxisAngle(X_AXIS, a)
    matrix.compose(pos, q, new THREE.Vector3(1, 1, 1))
    teeth.setMatrixAt(i, matrix)
  }
  teeth.instanceMatrix.needsUpdate = true
  group.add(teeth)
  return group
}

function createWormDriveRefined(part, color) {
  const group = root(part.id, color)
  const housing = absMaterial(color, 0.44)
  const metal = metalMaterial()
  const gearMaterial = pomMaterial(0xd5b33f)

  const base = new THREE.Mesh(new RoundedBoxGeometry(2.34, 0.18, 2.02, 4, 0.08), housing)
  base.position.y = 0.11
  group.add(base)

  for (const x of [-0.92, 0.92]) {
    const pillar = new THREE.Mesh(new RoundedBoxGeometry(0.28, 1.18, 1.72, 4, 0.10), housing)
    pillar.position.set(x, 0.73, 0)
    group.add(pillar)
  }

  const topBrace = new THREE.Mesh(new RoundedBoxGeometry(2.12, 0.18, 0.34, 4, 0.07), housing)
  topBrace.position.set(0, 1.37, -0.72)
  group.add(topBrace)

  const wormShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.145, 0.145, 1.42, 28), metal)
  wormShaft.rotation.x = Math.PI / 2
  wormShaft.position.set(0, 0.92, 0)
  group.add(wormShaft)
  const helix = new THREE.Mesh(helicalTube(0.205, 1.18, 5.2, 0.041), metal)
  helix.position.set(0, 0.92, 0)
  group.add(helix)

  const wormWheel = createWormWheel(gearMaterial)
  wormWheel.position.set(0.10, 0.92, 0)
  group.add(wormWheel)

  const inputBearing = visualOnly(extrudeAlongX(annulusShape(0.285, 0.205), 0.12, darkMaterial(), 0))
  inputBearing.rotation.y = -Math.PI / 2
  inputBearing.rotation.x = Math.PI / 2
  inputBearing.position.set(0, 0.92, 1.02)
  group.add(inputBearing)

  const outputBearing = visualOnly(extrudeAlongX(annulusShape(0.285, 0.205), 0.12, darkMaterial(), 0))
  outputBearing.position.set(1.05, 0.92, 0)
  group.add(outputBearing)

  for (const [x, z] of [[-0.5, -0.5], [-0.5, 0.5], [0.5, -0.5], [0.5, 0.5]]) {
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.255, 0.265, 0.10, 28), housing)
    foot.position.set(x, 0.05, z)
    group.add(foot)
  }
  return group
}

const upgraded = []
for (const [id, factory, quality] of [
  ['universal-joint-30', createUniversalJointRefined, 'parts-5-forked-cardan-v2'],
  ['cv-joint-30', createCvJointRefined, 'parts-5-caged-cv-v2'],
  ['worm-drive-8', createWormDriveRefined, 'parts-5-open-worm-drive-v2'],
]) {
  const part = PARTS.find(item => item.id === id)
  if (!part) continue
  patchPart(PARTS, id, { create: color => factory(part, color), visualQuality: quality })
  upgraded.push(id)
}

globalThis.BrickLabParts5DrivelineVisuals = Object.freeze({
  version: PARTS5_DRIVELINE_VISUAL_VERSION,
  upgraded,
})

window.dispatchEvent(new CustomEvent('bricklab:partcatalogchange', {
  detail: { total: PARTS.length, pack: PARTS5_DRIVELINE_VISUAL_VERSION },
}))
