import * as THREE from 'three'
import { PARTS } from '../parts.js'
import { installPart } from '../parts3/part-schema-v1.js'

export const PARTS4_DRIVELINE_VERSION = 'parts-4-driveline-v1'
const DEG = Math.PI / 180

function plastic(color, roughness = 0.31) {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness,
    metalness: 0.01,
    clearcoat: 0.18,
    clearcoatRoughness: 0.34,
    ior: 1.47,
  })
}
function dark() { return new THREE.MeshStandardMaterial({ color: 0x15181b, roughness: 0.78, metalness: 0.04 }) }
function metal() { return new THREE.MeshStandardMaterial({ color: 0xb7bec5, roughness: 0.28, metalness: 0.72 }) }
function root(id, color) { const g = new THREE.Group(); g.userData.partId = id; g.userData.color = color; return g }

function crossPoints(radius = 0.20, arm = 0.082) {
  return [
    [-arm, radius], [arm, radius], [arm, arm], [radius, arm], [radius, -arm], [arm, -arm],
    [arm, -radius], [-arm, -radius], [-arm, -arm], [-radius, -arm], [-radius, arm], [-arm, arm],
  ]
}
function crossShape(radius = 0.20, arm = 0.082) {
  const shape = new THREE.Shape()
  const points = crossPoints(radius, arm)
  shape.moveTo(...points[0])
  for (let i = 1; i < points.length; i += 1) shape.lineTo(...points[i])
  shape.closePath()
  return shape
}
function crossFace(group, position, quaternion, radius = 0.20) {
  const face = new THREE.Mesh(new THREE.ShapeGeometry(crossShape(radius, radius * 0.41)), dark())
  face.position.copy(position)
  face.quaternion.copy(quaternion)
  group.add(face)
}
function axisQuaternion(axis) {
  return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), new THREE.Vector3(...axis).normalize())
}
function addAxleSocket(group, position, axis, color, length = 0.42, radius = 0.34) {
  const q = axisQuaternion(axis)
  const socket = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 32), plastic(color, 0.34))
  socket.rotation.z = Math.PI / 2
  socket.quaternion.premultiply(q)
  socket.position.fromArray(position)
  group.add(socket)
  const faceOffset = new THREE.Vector3(...axis).normalize().multiplyScalar(length / 2 + 0.006)
  const faceQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...axis).normalize())
  crossFace(group, new THREE.Vector3(...position).add(faceOffset), faceQ)
  crossFace(group, new THREE.Vector3(...position).sub(faceOffset), faceQ)
}

const OUTPUT_ANGLE = 30 * DEG
const OUTPUT_AXIS = [Math.cos(OUTPUT_ANGLE), 0, Math.sin(OUTPUT_ANGLE)]

function createUniversalJoint(color) {
  const g = root('universal-joint-30', color)
  const mat = plastic(color, 0.34)
  const center = new THREE.Vector3(0, 0.58, 0)

  const inputYoke = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.66, 0.46), mat)
  inputYoke.position.set(-0.24, 0.58, 0)
  inputYoke.rotation.z = 0.08
  g.add(inputYoke)

  const outputYoke = inputYoke.clone()
  outputYoke.position.set(0.26, 0.58, 0.19)
  outputYoke.rotation.y = -OUTPUT_ANGLE
  outputYoke.rotation.z = -0.08
  g.add(outputYoke)

  const cross = new THREE.Group()
  const barA = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.78, 20), metal())
  barA.rotation.z = Math.PI / 2
  const barB = barA.clone()
  barB.rotation.x = Math.PI / 2
  barB.rotation.z = 0
  cross.add(barA, barB)
  cross.position.copy(center)
  g.add(cross)

  addAxleSocket(g, [-0.62, 0.58, 0], [1, 0, 0], color, 0.38, 0.31)
  addAxleSocket(g, [0.54, 0.58, 0.31], OUTPUT_AXIS, color, 0.38, 0.31)
  return g
}

function createCvJoint(color) {
  const g = root('cv-joint-30', color)
  const mat = plastic(color, 0.33)
  const bell = new THREE.Mesh(new THREE.SphereGeometry(0.48, 32, 20, 0, Math.PI * 2, 0, Math.PI), mat)
  bell.scale.set(1.05, 0.86, 1.05)
  bell.position.set(0.08, 0.58, 0.05)
  g.add(bell)

  const cage = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.06, 10, 36), metal())
  cage.rotation.y = Math.PI / 2 - OUTPUT_ANGLE / 2
  cage.position.set(0.08, 0.58, 0.05)
  g.add(cage)

  for (let i = 0; i < 6; i += 1) {
    const a = i / 6 * Math.PI * 2
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 12), metal())
    ball.position.set(0.08, 0.58 + Math.cos(a) * 0.26, 0.05 + Math.sin(a) * 0.26)
    g.add(ball)
  }

  addAxleSocket(g, [-0.58, 0.58, 0], [1, 0, 0], color, 0.42, 0.32)
  addAxleSocket(g, [0.55, 0.58, 0.32], OUTPUT_AXIS, color, 0.42, 0.32)
  return g
}

function createWormDrive(color) {
  const g = root('worm-drive-8', color)
  const mat = plastic(color, 0.37)
  const housing = new THREE.Mesh(new THREE.BoxGeometry(2.35, 1.45, 2.05), mat)
  housing.position.y = 0.76
  g.add(housing)

  const cap = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.16, 1.35), dark())
  cap.position.y = 1.49
  g.add(cap)

  const worm = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 1.28, 28), metal())
  worm.rotation.x = Math.PI / 2
  worm.position.set(0, 0.92, 0)
  g.add(worm)
  for (let i = -4; i <= 4; i += 1) {
    const ridge = new THREE.Mesh(new THREE.TorusGeometry(0.225, 0.022, 6, 24), metal())
    ridge.position.set(0, 0.92, i * 0.13)
    ridge.rotation.z = i * 0.18
    g.add(ridge)
  }

  const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.34, 28), plastic(0xd7b741, 0.36))
  wheel.rotation.z = Math.PI / 2
  wheel.position.set(0, 0.92, 0)
  g.add(wheel)

  addAxleSocket(g, [0, 0.92, 1.05], [0, 0, 1], color, 0.38, 0.30)
  addAxleSocket(g, [1.18, 0.92, 0], [1, 0, 0], color, 0.38, 0.30)

  for (const x of [-0.5, 0.5]) for (const z of [-0.5, 0.5]) {
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.27, 0.10, 24), mat)
    foot.position.set(x, 0.05, z)
    g.add(foot)
  }
  return g
}

function createBevelGear(id, teeth, color) {
  const g = root(id, color)
  const pitch = teeth / 16
  const outer = pitch * 1.08
  const inner = Math.max(0.28, pitch * 0.56)
  const body = new THREE.Mesh(new THREE.CylinderGeometry(inner, outer, 0.42, Math.max(32, teeth * 2), 1, false), plastic(color, 0.35))
  body.position.y = 0.40
  g.add(body)

  const toothMat = plastic(color, 0.39)
  const toothGeo = new THREE.BoxGeometry(Math.max(0.10, pitch * 0.18), 0.24, Math.max(0.12, pitch * 0.16))
  for (let i = 0; i < teeth; i += 1) {
    const a = i / teeth * Math.PI * 2
    const tooth = new THREE.Mesh(toothGeo, toothMat)
    const r = outer * 0.92
    tooth.position.set(Math.cos(a) * r, 0.52, Math.sin(a) * r)
    tooth.rotation.y = -a
    tooth.rotation.z = 0.10
    g.add(tooth)
  }

  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.58, 32), plastic(color, 0.31))
  hub.position.y = 0.40
  g.add(hub)
  const topQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0))
  crossFace(g, new THREE.Vector3(0, 0.70, 0), topQ)
  crossFace(g, new THREE.Vector3(0, 0.10, 0), topQ)
  return g
}

function transmission(ratio, efficiency, extra = {}) {
  return {
    inputConnectorId: 'input',
    outputConnectorId: 'output',
    modes: { forward: ratio, neutral: ratio, reverse: ratio },
    efficiency,
    ...extra,
  }
}

installPart(PARTS, {
  identity: {
    id: 'universal-joint-30',
    name: 'Universal Joint 30°',
    category: 'Power',
    icon: '⨯',
    description: 'Articulated 1:1 shaft coupling with a real spherical output constraint',
  },
  visual: { defaultColor: 0x59626c, family: 'universal-joint' },
  mechanics: {
    transmission: transmission(1, 0.955, { rigidConnectorId: 'input' }),
    articulatedCoupler: { outputConnectorId: 'output', joint: 'spherical', maxAngleDeg: 35 },
  },
  connectors: [
    { id: 'input', type: 'axle-hole', position: [-0.62, 0.58, 0], axis: [1, 0, 0] },
    { id: 'output', type: 'axle-hole', position: [0.54, 0.58, 0.31], axis: OUTPUT_AXIS },
  ],
  tags: ['universal', 'joint', 'cardan', 'shaft', 'coupler', 'parts4'],
  create: createUniversalJoint,
})

installPart(PARTS, {
  identity: {
    id: 'cv-joint-30',
    name: 'CV Joint 30°',
    category: 'Power',
    icon: '◉',
    description: 'Constant-velocity 1:1 articulated shaft coupling for driven steering axles',
  },
  visual: { defaultColor: 0x39434d, family: 'cv-joint' },
  mechanics: {
    transmission: transmission(1, 0.985, { rigidConnectorId: 'input' }),
    articulatedCoupler: { outputConnectorId: 'output', joint: 'spherical', maxAngleDeg: 42, constantVelocity: true },
  },
  connectors: [
    { id: 'input', type: 'axle-hole', position: [-0.58, 0.58, 0], axis: [1, 0, 0] },
    { id: 'output', type: 'axle-hole', position: [0.55, 0.58, 0.32], axis: OUTPUT_AXIS },
  ],
  tags: ['cv', 'joint', 'shaft', 'steering', 'drive', 'parts4'],
  create: createCvJoint,
})

installPart(PARTS, {
  identity: {
    id: 'worm-drive-8',
    name: 'Worm Drive 8:1',
    category: 'Power',
    icon: '8:1',
    description: 'Compact 90° worm reduction with 8:1 speed reduction and high holding torque',
  },
  visual: { defaultColor: 0x59626c, family: 'worm-drive' },
  mechanics: {
    transmission: transmission(-0.125, 0.74),
    wormDrive: { reduction: 8, backdriveEfficiency: 0.10 },
  },
  connectors: [
    { id: 'input', type: 'axle-hole', position: [0, 0.92, 1.05], axis: [0, 0, 1] },
    { id: 'output', type: 'axle-hole', position: [1.18, 0.92, 0], axis: [1, 0, 0] },
    { id: 'mount-0-0', type: 'tube', position: [-0.5, 0, -0.5], axis: [0, -1, 0] },
    { id: 'mount-1-0', type: 'tube', position: [0.5, 0, -0.5], axis: [0, -1, 0] },
    { id: 'mount-0-1', type: 'tube', position: [-0.5, 0, 0.5], axis: [0, -1, 0] },
    { id: 'mount-1-1', type: 'tube', position: [0.5, 0, 0.5], axis: [0, -1, 0] },
  ],
  tags: ['worm', 'gear', 'reduction', '90-degree', '8:1', 'parts4'],
  create: createWormDrive,
})

for (const [teeth, color] of [[12, 0xd9d9d9], [20, 0xadb5bd]]) {
  installPart(PARTS, {
    identity: {
      id: `bevel-gear-${teeth}`,
      name: `Bevel Gear ${teeth}T`,
      category: 'Gears',
      icon: '⚙',
      description: `${teeth}-tooth bevel gear for true perpendicular shaft meshes`,
    },
    visual: { defaultColor: color, family: 'bevel-gear' },
    mechanics: {
      gear: { kind: 'bevel', teeth, pitchRadius: teeth / 16, efficiency: 0.90 },
    },
    connectors: [{ id: 'axle-hole', type: 'axle-hole', position: [0, 0.40, 0], axis: [0, 1, 0] }],
    tags: ['gear', 'bevel', `${teeth}t`, '90-degree', 'parts4'],
    create: c => createBevelGear(`bevel-gear-${teeth}`, teeth, c),
  })
}

globalThis.BrickLabParts4Driveline = Object.freeze({
  version: PARTS4_DRIVELINE_VERSION,
  added: ['universal-joint-30', 'cv-joint-30', 'worm-drive-8', 'bevel-gear-12', 'bevel-gear-20'],
})
window.dispatchEvent(new CustomEvent('bricklab:partcatalogchange', {
  detail: { total: PARTS.length, pack: PARTS4_DRIVELINE_VERSION },
}))
