import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { PARTS } from '../parts.js'
import { patchPart } from '../parts3/part-schema-v1.js'

export const PARTS6_MECHANICAL_REALISM_VERSION = 'parts-6-mechanical-realism-v1'
const X_AXIS = new THREE.Vector3(1, 0, 0)
const Y_AXIS = new THREE.Vector3(0, 1, 0)
const Z_AXIS = new THREE.Vector3(0, 0, 1)
const OUTPUT_ANGLE = Math.PI / 6
const OUTPUT_AXIS = new THREE.Vector3(Math.cos(OUTPUT_ANGLE), 0, Math.sin(OUTPUT_ANGLE))

function absMaterial(color, roughness = 0.37) {
  return new THREE.MeshPhysicalMaterial({ color, roughness, metalness: 0.004, clearcoat: 0.05, clearcoatRoughness: 0.60, ior: 1.47 })
}
function pomMaterial(color) { return new THREE.MeshStandardMaterial({ color, roughness: 0.41, metalness: 0.004 }) }
function darkMaterial() { return new THREE.MeshStandardMaterial({ color: 0x171a1d, roughness: 0.83, metalness: 0.018 }) }
function springMetal() { return new THREE.MeshStandardMaterial({ color: 0xb7bec4, roughness: 0.34, metalness: 0.68 }) }
function root(id, color) {
  const group = new THREE.Group()
  group.userData.partId = id
  group.userData.color = color
  group.userData.visualVersion = PARTS6_MECHANICAL_REALISM_VERSION
  return group
}
function visualOnly(object) {
  object.userData.physicsIgnore = true
  object.userData.parts6VisualDetail = true
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
function extrudeAlongY(shape, depth, material, options = {}) {
  const mesh = extrudeShape(shape, depth, material, options)
  mesh.rotation.x = Math.PI / 2
  return mesh
}
function axisQuaternion(axis) {
  return new THREE.Quaternion().setFromUnitVectors(X_AXIS, axis.clone().normalize())
}

function createSteeringBase(part, color) {
  const group = root(part.id, color)
  const material = absMaterial(color, 0.39)
  const base = new THREE.Mesh(new RoundedBoxGeometry(1.78, 0.24, 1.78, 4, 0.10), material)
  base.position.y = 0.12
  group.add(base)

  // Two molded cheeks support the vertical pivot instead of one primitive tower.
  for (const x of [-0.34, 0.34]) {
    const cheek = new THREE.Mesh(new RoundedBoxGeometry(0.28, 0.72, 0.76, 4, 0.09), material)
    cheek.position.set(x, 0.53, 0)
    group.add(cheek)
    const gusset = visualOnly(new THREE.Mesh(new RoundedBoxGeometry(0.22, 0.30, 0.95, 3, 0.06), absMaterial(color, 0.43)))
    gusset.position.set(x, 0.31, 0)
    group.add(gusset)
  }

  const pivotRing = extrudeAlongY(annulusShape(0.34, 0.245), 0.30, material, { bevelSegments: 3, bevelSize: 0.009, bevelThickness: 0.009 })
  pivotRing.position.y = 0.88
  group.add(pivotRing)
  const bore = visualOnly(new THREE.Mesh(new THREE.CylinderGeometry(0.242, 0.242, 0.33, 36, 1, true), darkMaterial()))
  bore.position.y = 0.88
  group.add(bore)

  // Bottom tube seats correspond to the four actual mounting connectors.
  for (const x of [-0.5, 0.5]) for (const z of [-0.5, 0.5]) {
    const tube = visualOnly(extrudeAlongY(annulusShape(0.245, 0.165), 0.105, absMaterial(color, 0.43), { bevelSegments: 2, bevelSize: 0.006, bevelThickness: 0.006 }))
    tube.position.set(x, 0.055, z)
    group.add(tube)
  }
  return group
}

function createSteeringKnuckle(part, color) {
  const group = root(part.id, color)
  const material = absMaterial(color, 0.39)
  const bearing = extrudeAlongX(annulusShape(0.365, 0.245), 0.76, material, { bevelSegments: 4, bevelSize: 0.011, bevelThickness: 0.011 })
  bearing.position.y = 0.55
  group.add(bearing)
  const bearingShade = visualOnly(extrudeAlongX(annulusShape(0.288, 0.245), 0.79, darkMaterial(), { bevelEnabled: false }))
  bearingShade.position.y = 0.55
  group.add(bearingShade)

  const upright = new THREE.Mesh(new RoundedBoxGeometry(0.42, 0.82, 0.46, 4, 0.11), material)
  upright.position.set(0, 0.67, -0.16)
  upright.rotation.x = -0.10
  group.add(upright)

  const pivotBoss = new THREE.Mesh(new THREE.CylinderGeometry(0.255, 0.285, 0.28, 40), material)
  pivotBoss.position.y = 0.84
  group.add(pivotBoss)
  const pivotPin = new THREE.Mesh(new THREE.CylinderGeometry(0.168, 0.168, 0.50, 32), pomMaterial(0x2b2d31))
  pivotPin.position.y = 0.93
  group.add(pivotPin)

  // The PARTS-3 steering-arm connector lives at z=.72. Build the molded arm around it.
  const arm = new THREE.Mesh(new RoundedBoxGeometry(0.32, 0.18, 0.90, 4, 0.07), material)
  arm.position.set(0, 0.55, 0.42)
  group.add(arm)
  const armBoss = extrudeAlongY(annulusShape(0.255, 0.168), 0.25, material, { bevelSegments: 3, bevelSize: 0.008, bevelThickness: 0.008 })
  armBoss.position.set(0, 0.55, 0.72)
  group.add(armBoss)

  for (const z of [-0.23, 0.18]) {
    const rib = visualOnly(new THREE.Mesh(new RoundedBoxGeometry(0.50, 0.10, 0.10, 2, 0.025), absMaterial(color, 0.44)))
    rib.position.set(0, 0.57, z)
    group.add(rib)
  }
  return group
}

function createTieRod(part, color) {
  const group = root(part.id, color)
  const material = pomMaterial(color)
  const bar = new THREE.Mesh(new RoundedBoxGeometry(3.62, 0.16, 0.20, 4, 0.065), material)
  bar.position.y = 0.34
  group.add(bar)
  for (const x of [-2, 2]) {
    const eye = extrudeShape(annulusShape(0.305, 0.245), 0.30, material, { bevelSegments: 4, bevelSize: 0.011, bevelThickness: 0.011 })
    eye.rotation.x = Math.PI / 2
    eye.position.set(x, 0.34, 0)
    group.add(eye)
    const neck = new THREE.Mesh(new RoundedBoxGeometry(0.48, 0.20, 0.26, 4, 0.07), material)
    neck.position.set(x > 0 ? x - 0.28 : x + 0.28, 0.34, 0)
    group.add(neck)
    const bore = visualOnly(new THREE.Mesh(new THREE.CylinderGeometry(0.242, 0.242, 0.31, 36, 1, true), darkMaterial()))
    bore.rotation.x = Math.PI / 2
    bore.position.set(x, 0.34, 0)
    group.add(bore)
  }
  return group
}

function createWheelHub(part, color) {
  const group = root(part.id, color)
  const material = absMaterial(color, 0.40)
  const body = extrudeAlongX(annulusShape(0.47, 0.255), 0.68, material, { bevelSegments: 4, bevelSize: 0.010, bevelThickness: 0.010 })
  body.position.y = 0.58
  group.add(body)
  const flange = extrudeAlongX(annulusShape(0.56, 0.30), 0.15, material, { bevelSegments: 3, bevelSize: 0.008, bevelThickness: 0.008 })
  flange.position.set(0.25, 0.58, 0)
  group.add(flange)
  const bearing = visualOnly(extrudeAlongX(annulusShape(0.297, 0.245), 0.12, darkMaterial(), { bevelEnabled: false }))
  bearing.position.set(-0.35, 0.58, 0)
  group.add(bearing)

  // Radial ribs make the flange read as a molded wheel carrier instead of a cylinder.
  const ribGeo = new RoundedBoxGeometry(0.12, 0.11, 0.30, 3, 0.035)
  for (let i = 0; i < 6; i += 1) {
    const a = i / 6 * Math.PI * 2
    const rib = visualOnly(new THREE.Mesh(ribGeo, material))
    rib.position.set(0.31, 0.58 + Math.cos(a) * 0.40, Math.sin(a) * 0.40)
    rib.rotation.x = a - Math.PI / 2
    group.add(rib)
  }

  const stubShape = new THREE.Shape()
  const points = crossPoints(0.18, 0.074)
  stubShape.moveTo(...points[0])
  for (let i = 1; i < points.length; i += 1) stubShape.lineTo(...points[i])
  stubShape.closePath()
  const stub = extrudeAlongX(stubShape, 0.72, pomMaterial(color), { bevelSegments: 3, bevelSize: 0.009, bevelThickness: 0.012 })
  stub.position.set(0.47, 0.58, 0)
  group.add(stub)
  return group
}

function springGeometry(radius, wire, height, turns) {
  const points = []
  const segments = 132
  for (let i = 0; i <= segments; i += 1) {
    const u = i / segments
    const a = u * Math.PI * 2 * turns
    points.push(new THREE.Vector3(Math.cos(a) * radius, u * height, Math.sin(a) * radius))
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points, false, 'centripetal'), segments, wire, 10, false)
}

function createShockBody(part, color) {
  const group = root(part.id, color)
  const material = absMaterial(color, 0.40)
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.385, 0.425, 2.30, 44), material)
  shell.position.y = 1.55
  group.add(shell)
  const lowerEye = extrudeShape(annulusShape(0.31, 0.225), 0.30, material, { bevelSegments: 4, bevelSize: 0.010, bevelThickness: 0.010 })
  lowerEye.rotation.x = Math.PI / 2
  lowerEye.position.set(0, 0.32, 0)
  group.add(lowerEye)
  const lowerBore = visualOnly(new THREE.Mesh(new THREE.CylinderGeometry(0.222, 0.222, 0.31, 36, 1, true), darkMaterial()))
  lowerBore.rotation.x = Math.PI / 2
  lowerBore.position.set(0, 0.32, 0)
  group.add(lowerBore)
  const lowerSeat = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.13, 44), material)
  lowerSeat.position.y = 0.55
  group.add(lowerSeat)
  const upperSeat = new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.47, 0.17, 44), material)
  upperSeat.position.y = 2.70
  group.add(upperSeat)
  const guide = visualOnly(new THREE.Mesh(new THREE.CylinderGeometry(0.184, 0.184, 0.18, 32), darkMaterial()))
  guide.position.y = 2.77
  group.add(guide)
  return group
}

function createShockRod(part, color) {
  const group = root(part.id, color)
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.145, 0.145, 2.52, 32), springMetal())
  rod.position.y = 1.55
  group.add(rod)
  const spring = new THREE.Mesh(springGeometry(0.335, 0.041, 2.08, 7.25), springMetal())
  spring.position.y = 0.40
  group.add(spring)
  const seatMaterial = absMaterial(color, 0.40)
  const lowerRetainer = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.12, 40), seatMaterial)
  lowerRetainer.position.y = 0.48
  const upperRetainer = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.12, 40), seatMaterial)
  upperRetainer.position.y = 2.54
  group.add(lowerRetainer, upperRetainer)
  const topEye = extrudeShape(annulusShape(0.31, 0.225), 0.30, seatMaterial, { bevelSegments: 4, bevelSize: 0.010, bevelThickness: 0.010 })
  topEye.rotation.x = Math.PI / 2
  topEye.position.set(0, 2.88, 0)
  group.add(topEye)
  const topBore = visualOnly(new THREE.Mesh(new THREE.CylinderGeometry(0.222, 0.222, 0.31, 36, 1, true), darkMaterial()))
  topBore.rotation.x = Math.PI / 2
  topBore.position.set(0, 2.88, 0)
  group.add(topBore)
  return group
}

function createSocket(radius, length, color) {
  return extrudeAlongX(crossBoreShape(radius), length, pomMaterial(color), { bevelSegments: 3, bevelSize: 0.008, bevelThickness: 0.010 })
}

function addUniversalYoke(group, center, axis, side, color, forkPlane) {
  const yoke = new THREE.Group()
  yoke.position.copy(center)
  yoke.quaternion.copy(axisQuaternion(axis))
  const material = pomMaterial(color)
  const socket = createSocket(0.305, 0.34, color)
  socket.position.x = side * 0.47
  yoke.add(socket)
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.245, 0.260, 0.30, 36), material)
  neck.rotation.z = Math.PI / 2
  neck.position.x = side * 0.30
  yoke.add(neck)
  const armGeo = new RoundedBoxGeometry(0.38, 0.15, 0.15, 4, 0.052)
  for (const sign of [-1, 1]) {
    const arm = new THREE.Mesh(armGeo, material)
    arm.position.x = side * 0.13
    if (forkPlane === 'z') arm.position.z = sign * 0.245
    else arm.position.y = sign * 0.245
    yoke.add(arm)
  }
  group.add(yoke)
}

function createUniversalJoint(part, color) {
  const group = root(part.id, color)
  const center = new THREE.Vector3(0, 0.58, 0)
  addUniversalYoke(group, center, X_AXIS, -1, color, 'z')
  addUniversalYoke(group, center, OUTPUT_AXIS, 1, color, 'y')
  const cross = pomMaterial(0x59626c)
  const y = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.088, 0.62, 28), cross)
  y.position.copy(center)
  const z = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.088, 0.62, 28), cross)
  z.rotation.x = Math.PI / 2
  z.position.copy(center)
  const boss = new THREE.Mesh(new THREE.SphereGeometry(0.130, 28, 18), cross)
  boss.position.copy(center)
  group.add(y, z, boss)
  for (const axis of [Y_AXIS, Z_AXIS]) for (const sign of [-1, 1]) {
    const cap = visualOnly(new THREE.Mesh(new THREE.CylinderGeometry(0.112, 0.112, 0.030, 24), darkMaterial()))
    cap.quaternion.setFromUnitVectors(Y_AXIS, axis)
    cap.position.copy(center).addScaledVector(axis, sign * 0.315)
    group.add(cap)
  }
  return group
}

function basisAround(axis) {
  const u = Math.abs(axis.y) < 0.9 ? Y_AXIS.clone() : Z_AXIS.clone()
  u.sub(axis.clone().multiplyScalar(u.dot(axis))).normalize()
  const v = axis.clone().cross(u).normalize()
  return { u, v }
}

function createCvJoint(part, color) {
  const group = root(part.id, color)
  const center = new THREE.Vector3(0.07, 0.58, 0.04)
  const material = pomMaterial(color)
  const dark = pomMaterial(0x59626c)
  const input = createSocket(0.31, 0.36, color)
  input.position.set(-0.48, 0.58, 0)
  group.add(input)
  const output = createSocket(0.31, 0.36, color)
  output.position.set(0.47, 0.58, 0.27)
  output.quaternion.copy(axisQuaternion(OUTPUT_AXIS))
  group.add(output)

  const bellA = new THREE.Mesh(new THREE.SphereGeometry(0.40, 44, 28), material)
  bellA.scale.set(0.72, 1.0, 1.0)
  bellA.position.copy(center).addScaledVector(X_AXIS, -0.17)
  const bellB = new THREE.Mesh(new THREE.SphereGeometry(0.36, 44, 28), material)
  bellB.scale.set(0.72, 0.95, 0.95)
  bellB.position.copy(center).addScaledVector(OUTPUT_AXIS, 0.17)
  group.add(bellA, bellB)

  const bisector = X_AXIS.clone().add(OUTPUT_AXIS).normalize()
  const cage = visualOnly(new THREE.Mesh(new THREE.TorusGeometry(0.268, 0.038, 10, 56), dark))
  cage.quaternion.setFromUnitVectors(Z_AXIS, bisector)
  cage.position.copy(center)
  group.add(cage)
  const { u, v } = basisAround(bisector)
  for (let i = 0; i < 6; i += 1) {
    const a = i / 6 * Math.PI * 2
    const ball = visualOnly(new THREE.Mesh(new THREE.SphereGeometry(0.064, 20, 14), dark))
    ball.position.copy(center).addScaledVector(u, Math.cos(a) * 0.245).addScaledVector(v, Math.sin(a) * 0.245)
    group.add(ball)
  }
  return group
}

const upgraded = []
for (const [id, factory, quality] of [
  ['steering-base', createSteeringBase, 'parts-6-steering-base-molded'],
  ['steering-knuckle', createSteeringKnuckle, 'parts-6-steering-knuckle-molded'],
  ['steering-tie-rod-5', createTieRod, 'parts-6-molded-tie-rod'],
  ['wheel-hub', createWheelHub, 'parts-6-wheel-hub-carrier'],
  ['shock-body-5', createShockBody, 'parts-6-shock-body-realism'],
  ['shock-rod-5', createShockRod, 'parts-6-metal-coil-shock'],
  ['universal-joint-30', createUniversalJoint, 'parts-6-pom-universal-joint'],
  ['cv-joint-30', createCvJoint, 'parts-6-compact-cv-joint'],
]) {
  const part = PARTS.find(item => item.id === id)
  if (!part) continue
  patchPart(PARTS, id, { create: color => factory(part, color), visualQuality: quality })
  upgraded.push(id)
}

globalThis.BrickLabParts6MechanicalRealism = Object.freeze({
  version: PARTS6_MECHANICAL_REALISM_VERSION,
  upgraded,
  materialIntent: Object.freeze({
    structuralShells: 'ABS-like molded plastic',
    linksAndJoints: 'POM-like low-gloss engineering plastic',
    spring: 'metal coil',
  }),
})

window.dispatchEvent(new CustomEvent('bricklab:partcatalogchange', {
  detail: { total: PARTS.length, pack: PARTS6_MECHANICAL_REALISM_VERSION },
}))
