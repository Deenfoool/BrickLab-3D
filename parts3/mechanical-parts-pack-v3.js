import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { PARTS } from '../parts.js'
import { installPart, patchPart, PART_SCHEMA_VERSION } from './part-schema-v1.js'

export const PARTS3_VERSION = 'parts-3-mechanical-v1'
const BRICK_HEIGHT = 1.2

function plastic(color, options = {}) {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: options.roughness ?? 0.31,
    metalness: options.metalness ?? 0.01,
    clearcoat: options.clearcoat ?? 0.20,
    clearcoatRoughness: options.clearcoatRoughness ?? 0.34,
    ior: 1.47,
  })
}
function rubber(options = {}) {
  return new THREE.MeshStandardMaterial({ color: options.color ?? 0x151719, roughness: options.roughness ?? 0.91, metalness: 0 })
}
function dark() { return new THREE.MeshStandardMaterial({ color: 0x17191c, roughness: 0.76, metalness: 0.03 }) }
function metal() { return new THREE.MeshStandardMaterial({ color: 0xaeb6bd, roughness: 0.30, metalness: 0.62 }) }
function roundedBox(w, h, d, r = 0.08, segments = 4) { return new RoundedBoxGeometry(w, h, d, segments, Math.min(r, w / 3, h / 3, d / 3)) }
function root(id, color) { const g = new THREE.Group(); g.userData.partId = id; g.userData.color = color; return g }

function roundedRectShape(width, height, radius) {
  const x = -width / 2
  const y = -height / 2
  const r = Math.min(radius, width / 2, height / 2)
  const s = new THREE.Shape()
  s.moveTo(x + r, y)
  s.lineTo(x + width - r, y)
  s.quadraticCurveTo(x + width, y, x + width, y + r)
  s.lineTo(x + width, y + height - r)
  s.quadraticCurveTo(x + width, y + height, x + width - r, y + height)
  s.lineTo(x + r, y + height)
  s.quadraticCurveTo(x, y + height, x, y + height - r)
  s.lineTo(x, y + r)
  s.quadraticCurveTo(x, y, x + r, y)
  s.closePath()
  return s
}

function circleHole(x, y, radius) {
  const hole = new THREE.Path()
  hole.absarc(x, y, radius, 0, Math.PI * 2, true)
  return hole
}

function crossPoints(radius = 0.18, arm = 0.074) {
  return [
    [-arm, radius], [arm, radius], [arm, arm], [radius, arm], [radius, -arm], [arm, -arm],
    [arm, -radius], [-arm, -radius], [-arm, -arm], [-radius, -arm], [-radius, arm], [-arm, arm],
  ]
}
function crossShape(radius = 0.18, arm = 0.074) {
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

function extrudedPlateWithHoles({ width, height, depth, holes = [], color, radius = 0.34, bevel = 0.025 }) {
  const shape = roundedRectShape(width, height, radius)
  for (const [x, y, r = 0.245] of holes) shape.holes.push(circleHole(x, y, r))
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: bevel,
    bevelThickness: bevel,
    curveSegments: 24,
  })
  geometry.translate(0, 0, -depth / 2)
  return new THREE.Mesh(geometry, plastic(color))
}

function addHoleLiners(group, holes, depth) {
  const linerMat = dark()
  for (const [x, y, r = 0.245] of holes) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.025, 8, 28), linerMat)
    ring.position.set(x, y, depth / 2 + 0.012)
    const back = ring.clone()
    back.position.z = -depth / 2 - 0.012
    group.add(ring, back)
  }
}

function addStuds(group, count, y, color) {
  const mat = plastic(color)
  const studGeo = new THREE.CylinderGeometry(0.295, 0.305, 0.18, 32)
  const lipGeo = new THREE.TorusGeometry(0.245, 0.016, 6, 28)
  for (let i = 0; i < count; i += 1) {
    const x = i - (count - 1) / 2
    const stud = new THREE.Mesh(studGeo, mat)
    stud.position.set(x, y + 0.09, 0)
    const lip = new THREE.Mesh(lipGeo, mat)
    lip.rotation.x = Math.PI / 2
    lip.position.set(x, y + 0.18, 0)
    group.add(stud, lip)
  }
}

function createBeamV3(id, length, color, depth = 0.78) {
  const g = root(id, color)
  const holes = Array.from({ length }, (_, i) => [i - (length - 1) / 2, 0, 0.245])
  const body = extrudedPlateWithHoles({ width: Math.max(0.88, length - 0.10), height: 0.88, depth, holes, color, radius: 0.42, bevel: 0.022 })
  body.position.y = 0.45
  g.add(body)
  addHoleLiners(g, holes.map(([x,,r]) => [x, 0.45, r]), depth)
  return g
}

function createTechnicBrickV3(id, length, color) {
  const g = root(id, color)
  const holeCount = Math.max(1, length - 1)
  const holes = Array.from({ length: holeCount }, (_, i) => [i - (holeCount - 1) / 2, 0, 0.225])
  const body = extrudedPlateWithHoles({ width: Math.max(1, length - 0.08), height: 1.12, depth: 0.88, holes, color, radius: 0.10, bevel: 0.018 })
  body.position.y = 0.60
  g.add(body)
  addHoleLiners(g, holes.map(([x,,r]) => [x, 0.60, r]), 0.88)
  addStuds(g, length, BRICK_HEIGHT, color)
  return g
}

function createAxleV3(id, length, color) {
  const g = root(id, color)
  const geo = new THREE.ExtrudeGeometry(crossShape(0.18, 0.074), {
    depth: Math.max(0.25, length - 0.08),
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.012,
    bevelThickness: 0.025,
  })
  geo.center()
  geo.rotateY(Math.PI / 2)
  const shaft = new THREE.Mesh(geo, plastic(color, { roughness: 0.29, clearcoat: 0.10 }))
  shaft.position.y = 0.32
  g.add(shaft)

  const faceGeometry = new THREE.ShapeGeometry(crossShape(0.172, 0.071))
  for (const x of [-(length - 0.05) / 2, (length - 0.05) / 2]) {
    const face = new THREE.Mesh(faceGeometry, dark())
    face.rotation.y = Math.PI / 2
    face.position.set(x, 0.32, 0)
    g.add(face)
  }
  return g
}

function createPinV3(id, length, color, friction = true) {
  const g = root(id, color)
  const mat = plastic(color, { roughness: friction ? 0.42 : 0.31, clearcoat: 0.06 })
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, length, 28), mat)
  core.rotation.x = Math.PI / 2
  core.position.y = 0.28
  g.add(core)

  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.265, 0.265, 0.13, 30), mat)
  collar.rotation.x = Math.PI / 2
  collar.position.y = 0.28
  g.add(collar)

  const ridgeCount = friction ? Math.max(2, Math.round(length)) : 0
  for (let i = 0; i < ridgeCount; i += 1) {
    const z = -length * 0.32 + i * (length * 0.64 / Math.max(1, ridgeCount - 1))
    const ridge = new THREE.Mesh(new THREE.TorusGeometry(0.176, 0.022, 6, 24), mat)
    ridge.position.set(0, 0.28, z)
    g.add(ridge)
  }

  for (const side of [-1, 1]) {
    const slit = new THREE.Mesh(new THREE.PlaneGeometry(0.075, Math.max(0.25, length * 0.30)), dark())
    slit.position.set(0, 0.28, side * (length / 2 + 0.002))
    slit.rotation.z = Math.PI / 2
    g.add(slit)
  }
  return g
}

function gearPitchRadius(teeth) { return teeth / 16 }
function createGearV3(id, teeth, color) {
  const g = root(id, color)
  const pitch = gearPitchRadius(teeth)
  const outer = pitch * 1.115
  const rootRadius = pitch * 0.865
  const shoulder = pitch * 1.015
  const shape = new THREE.Shape()
  for (let tooth = 0; tooth < teeth; tooth += 1) {
    const base = tooth / teeth * Math.PI * 2
    const points = [
      [base, rootRadius], [base + Math.PI * 0.30 / teeth, shoulder], [base + Math.PI * 0.72 / teeth, outer],
      [base + Math.PI * 1.28 / teeth, outer], [base + Math.PI * 1.70 / teeth, shoulder], [base + Math.PI * 2 / teeth, rootRadius],
    ]
    for (const [angle, radius] of points) {
      const x = Math.cos(angle) * radius
      const y = Math.sin(angle) * radius
      if (tooth === 0 && angle === base) shape.moveTo(x, y)
      else shape.lineTo(x, y)
    }
  }
  shape.closePath()
  shape.holes.push(crossPath())
  if (teeth >= 24) {
    const holeRing = pitch * 0.52
    const count = teeth >= 36 ? 8 : 6
    for (let i = 0; i < count; i += 1) {
      const a = i / count * Math.PI * 2
      shape.holes.push(circleHole(Math.cos(a) * holeRing, Math.sin(a) * holeRing, Math.min(0.16, pitch * 0.11)))
    }
  }
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.34, bevelEnabled: true, bevelSegments: 2, bevelSize: 0.012, bevelThickness: 0.015, curveSegments: 20 })
  geo.center()
  const mesh = new THREE.Mesh(geo, plastic(color, { roughness: 0.35, clearcoat: 0.08 }))
  mesh.rotation.x = Math.PI / 2
  mesh.position.y = 0.40
  g.add(mesh)
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.40, 32), plastic(color))
  hub.position.y = 0.40
  g.add(hub)
  return g
}

function createWheelV3(id, radius, width, color, tread = 'road') {
  const g = root(id, color)
  const tireMat = rubber({ roughness: tread === 'road' ? 0.84 : 0.94 })
  const sidewall = tread === 'tractor' ? 0.28 : tread === 'offroad' ? 0.245 : 0.19
  const tube = Math.max(0.16, radius * sidewall)
  const major = Math.max(0.22, radius - tube)
  const tire = new THREE.Mesh(new THREE.TorusGeometry(major, tube, 22, 64), tireMat)
  tire.rotation.y = Math.PI / 2
  tire.position.y = 1.15
  tire.scale.x = Math.max(0.75, width / Math.max(0.1, tube * 2))
  g.add(tire)

  const count = tread === 'tractor' ? 18 : tread === 'offroad' ? 24 : 34
  const treadHeight = radius * (tread === 'tractor' ? 0.105 : tread === 'offroad' ? 0.070 : 0.035)
  const treadDepth = radius * (tread === 'tractor' ? 0.19 : 0.13)
  const treadGeo = roundedBox(width * 0.92, Math.max(0.045, treadHeight), Math.max(0.08, treadDepth), 0.022, 2)
  for (let i = 0; i < count; i += 1) {
    const a = i / count * Math.PI * 2
    const block = new THREE.Mesh(treadGeo, tireMat)
    block.position.set(0, 1.15 + Math.cos(a) * radius, Math.sin(a) * radius)
    block.rotation.x = a
    if (tread !== 'road') block.rotation.z = (i % 2 ? 1 : -1) * (tread === 'tractor' ? 0.28 : 0.10)
    g.add(block)
  }

  const rimMat = plastic(color, { roughness: 0.27, clearcoat: 0.18 })
  const rimRadius = radius * 0.50
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(rimRadius, rimRadius, width * 0.72, 40), rimMat)
  rim.rotation.z = Math.PI / 2
  rim.position.y = 1.15
  g.add(rim)
  for (let i = 0; i < 6; i += 1) {
    const a = i / 6 * Math.PI * 2
    const spoke = new THREE.Mesh(roundedBox(width * 0.76, radius * 0.10, radius * 0.45, 0.035, 2), rimMat)
    spoke.position.set(0, 1.15, 0)
    spoke.rotation.x = a
    g.add(spoke)
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, width * 0.88, 30), dark())
  hub.rotation.z = Math.PI / 2
  hub.position.y = 1.15
  g.add(hub)
  return g
}

function createBush(id, width, color) {
  const g = root(id, color)
  const mat = plastic(color, { roughness: 0.34, clearcoat: 0.10 })
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.39, 0.39, width, 36), mat)
  shell.rotation.z = Math.PI / 2
  shell.position.y = 0.36
  g.add(shell)
  const groove = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.035, 8, 30), dark())
  groove.rotation.y = Math.PI / 2
  groove.position.y = 0.36
  g.add(groove)
  for (const x of [-width / 2 - 0.006, width / 2 + 0.006]) {
    const face = new THREE.Mesh(new THREE.ShapeGeometry(crossShape(0.19, 0.077)), dark())
    face.rotation.y = Math.PI / 2
    face.position.set(x, 0.36, 0)
    g.add(face)
  }
  return g
}

function createAxleCouplerV3(color) {
  const g = root('axle-coupler', color)
  const mat = plastic(color, { roughness: 0.32 })
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.40, 0.40, 1.50, 40), mat)
  shell.rotation.z = Math.PI / 2
  shell.position.y = 0.38
  g.add(shell)
  for (const x of [-0.53, 0, 0.53]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.325, 0.028, 7, 30), dark())
    band.rotation.y = Math.PI / 2
    band.position.set(x, 0.38, 0)
    g.add(band)
  }
  for (const x of [-0.756, 0.756]) {
    const face = new THREE.Mesh(new THREE.ShapeGeometry(crossShape(0.195, 0.080)), dark())
    face.rotation.y = Math.PI / 2
    face.position.set(x, 0.38, 0)
    g.add(face)
  }
  return g
}

function createTieRod(color) {
  const g = root('steering-tie-rod-5', color)
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.10, 4.0, 20), metal())
  rod.rotation.z = Math.PI / 2
  rod.position.y = 0.34
  g.add(rod)
  for (const x of [-2, 2]) {
    const eye = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.08, 10, 32), plastic(color, { roughness: 0.35 }))
    eye.rotation.x = Math.PI / 2
    eye.position.set(x, 0.34, 0)
    g.add(eye)
  }
  return g
}

function createWheelHub(color) {
  const g = root('wheel-hub', color)
  const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.72, 36), plastic(color, { roughness: 0.34 }))
  housing.rotation.z = Math.PI / 2
  housing.position.y = 0.58
  g.add(housing)
  const bearing = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.06, 10, 34), dark())
  bearing.rotation.y = Math.PI / 2
  bearing.position.set(-0.37, 0.58, 0)
  g.add(bearing)
  const stubGeo = new THREE.ExtrudeGeometry(crossShape(0.18, 0.074), { depth: 0.72, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.01 })
  stubGeo.center()
  stubGeo.rotateY(Math.PI / 2)
  const stub = new THREE.Mesh(stubGeo, plastic(color, { roughness: 0.30 }))
  stub.position.set(0.46, 0.58, 0)
  g.add(stub)
  return g
}

function axleConnectors(length) {
  return Array.from({ length }, (_, i) => ({ id: `axle-${i}`, type: 'axle', position: [i - (length - 1) / 2, 0.32, 0], axis: [1, 0, 0] }))
}

function upgradeExisting() {
  for (const length of [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15]) {
    const id = `beam-${length}`
    if (PARTS.some(item => item.id === id)) patchPart(PARTS, id, { create: color => createBeamV3(id, length, color), visualQuality: 'parts-3-through-holes' })
  }
  for (const length of [3, 5, 7, 9]) {
    const id = `thin-beam-${length}`
    if (PARTS.some(item => item.id === id)) patchPart(PARTS, id, { create: color => createBeamV3(id, length, color, 0.40), visualQuality: 'parts-3-through-holes' })
  }
  for (const length of [2, 6, 8, 10, 12]) {
    const id = `technic-brick-1x${length}`
    if (PARTS.some(item => item.id === id)) patchPart(PARTS, id, { create: color => createTechnicBrickV3(id, length, color), visualQuality: 'parts-3-through-holes' })
  }
  for (const length of [3, 4, 5, 6, 7, 8, 10, 12]) {
    const id = `axle-${length}`
    if (PARTS.some(item => item.id === id)) patchPart(PARTS, id, { create: color => createAxleV3(id, length, color), visualQuality: 'parts-3-chamfered-cross' })
  }
  if (PARTS.some(item => item.id === 'axle-coupler')) patchPart(PARTS, 'axle-coupler', { create: createAxleCouplerV3, visualQuality: 'parts-3' })
  if (PARTS.some(item => item.id === 'pin')) patchPart(PARTS, 'pin', { create: color => createPinV3('pin', 2.0, color, true), visualQuality: 'parts-3-friction-relief' })
  if (PARTS.some(item => item.id === 'pin-half')) patchPart(PARTS, 'pin-half', { create: color => createPinV3('pin-half', 0.9, color, true), visualQuality: 'parts-3-friction-relief' })
  if (PARTS.some(item => item.id === 'pin-long')) patchPart(PARTS, 'pin-long', { create: color => createPinV3('pin-long', 3.0, color, true), visualQuality: 'parts-3-friction-relief' })
  for (const teeth of [8, 12, 16, 20, 24, 36, 40]) {
    const id = `gear-${teeth}`
    if (PARTS.some(item => item.id === id)) patchPart(PARTS, id, { create: color => createGearV3(id, teeth, color), visualQuality: 'parts-3-tooth-profile' })
  }
  for (const [id, radius, width, tread] of [
    ['wheel', 1.40, 0.76, 'offroad'], ['wheel-small', 0.90, 0.58, 'road'],
    ['wheel-medium', 1.15, 0.66, 'offroad'], ['wheel-road', 1.30, 0.62, 'road'],
  ]) {
    if (PARTS.some(item => item.id === id)) patchPart(PARTS, id, { create: color => createWheelV3(id, radius, width, color, tread), visualQuality: 'parts-3-tire-rim' })
  }

  const knuckle = PARTS.find(item => item.id === 'steering-knuckle')
  if (knuckle && !knuckle.connectors?.some(connector => connector.id === 'steering-arm')) {
    knuckle.connectors = [...(knuckle.connectors ?? []), { id: 'steering-arm', type: 'pin', position: [0, 0.55, 0.72], axis: [0, 1, 0] }]
  }
}

function registerNewParts() {
  for (const [length, color] of [[2, 0xd9d9d9], [9, 0x2b2d31]]) {
    installPart(PARTS, {
      identity: { id: `axle-${length}`, name: `Axle ${length}L`, category: 'Axles', icon: '━', description: `${length}L chamfered cross axle` },
      visual: { defaultColor: color, family: 'cross-axle-v3' },
      dimensions: { lengthStud: length },
      connectors: axleConnectors(length),
      mechanics: { shaft: true },
      tags: ['axle', 'shaft', `${length}l`, 'parts3'],
      create: c => createAxleV3(`axle-${length}`, length, c),
    })
  }

  installPart(PARTS, {
    identity: { id: 'bush', name: 'Axle Bush', category: 'Axles', icon: '◍', description: 'Full-width keyed axle stop and spacer' },
    visual: { defaultColor: 0xadb5bd, family: 'axle-stop' },
    dimensions: { lengthStud: 0.72 },
    connectors: [{ id: 'axle-hole', type: 'axle-hole', position: [0, 0.36, 0], axis: [1, 0, 0] }],
    mechanics: { shaft: true, axleStop: true },
    tags: ['bush', 'axle', 'stop', 'spacer', 'parts3'],
    create: c => createBush('bush', 0.72, c),
  })
  installPart(PARTS, {
    identity: { id: 'half-bush', name: 'Half Bush', category: 'Axles', icon: '◌', description: 'Compact half-width keyed axle stop and spacer' },
    visual: { defaultColor: 0xf6c945, family: 'axle-stop' },
    dimensions: { lengthStud: 0.38 },
    connectors: [{ id: 'axle-hole', type: 'axle-hole', position: [0, 0.36, 0], axis: [1, 0, 0] }],
    mechanics: { shaft: true, axleStop: true },
    tags: ['half-bush', 'axle', 'stop', 'spacer', 'parts3'],
    create: c => createBush('half-bush', 0.38, c),
  })

  installPart(PARTS, {
    identity: { id: 'steering-tie-rod-5', name: 'Steering Tie Rod 5L', category: 'Steering', icon: '↔', description: 'Rigid 5L steering link with vertical hinge eyes' },
    visual: { defaultColor: 0xadb5bd, family: 'steering-link' },
    dimensions: { lengthStud: 5 },
    connectors: [
      { id: 'eye-left', type: 'pin-hole', position: [-2, 0.34, 0], axis: [0, 1, 0] },
      { id: 'eye-right', type: 'pin-hole', position: [2, 0.34, 0], axis: [0, 1, 0] },
    ],
    tags: ['steering', 'tie-rod', 'linkage', 'parts3'],
    create: createTieRod,
  })

  installPart(PARTS, {
    identity: { id: 'wheel-hub', name: 'Wheel Hub', category: 'Steering', icon: '◎', description: 'Free-spinning bearing hub with keyed wheel axle stub' },
    visual: { defaultColor: 0x59626c, family: 'wheel-hub' },
    connectors: [
      { id: 'bearing', type: 'pin-hole', position: [-0.38, 0.58, 0], axis: [1, 0, 0] },
      { id: 'wheel-stub', type: 'axle', position: [0.72, 0.58, 0], axis: [1, 0, 0] },
    ],
    mechanics: { wheelHub: true },
    tags: ['wheel', 'hub', 'bearing', 'steering', 'parts3'],
    create: createWheelHub,
  })

  const wheels = [
    { id: 'wheel-narrow', name: 'Narrow Wheel', radius: 1.05, width: 0.42, tread: 'road', color: 0xd9d9d9, description: 'Narrow low-drag tyre for lightweight vehicles', tire: { rollingResistanceScale: 0.82, longitudinalStiffness: 6.7, lateralStiffness: 4.5 } },
    { id: 'wheel-offroad-large', name: 'Large Off-road Wheel', radius: 1.70, width: 0.92, tread: 'offroad', color: 0xb7bcc3, description: 'Large all-terrain tyre with deep alternating tread', tire: { rollingResistanceScale: 1.28, longitudinalStiffness: 7.8, lateralStiffness: 5.3 } },
    { id: 'wheel-tractor', name: 'Tractor Wheel', radius: 2.05, width: 1.12, tread: 'tractor', color: 0xadb5bd, description: 'Very large agricultural tyre with aggressive chevron lugs', tire: { rollingResistanceScale: 1.55, longitudinalStiffness: 8.2, lateralStiffness: 5.0 } },
  ]
  for (const wheel of wheels) {
    installPart(PARTS, {
      identity: { id: wheel.id, name: wheel.name, category: 'Wheels', icon: '◉', description: wheel.description },
      visual: { defaultColor: wheel.color, family: `tire-${wheel.tread}` },
      dimensions: { radiusStud: wheel.radius, widthStud: wheel.width },
      connectors: [{ id: 'axle-hole', type: 'axle-hole', position: [0, 1.15, 0], axis: [1, 0, 0] }],
      mechanics: { wheel: { radius: wheel.radius, width: wheel.width, tire: wheel.tire }, shaft: true },
      tags: ['wheel', 'tire', wheel.tread, 'parts3'],
      create: c => createWheelV3(wheel.id, wheel.radius, wheel.width, c, wheel.tread),
    })
  }
}

upgradeExisting()
registerNewParts()

globalThis.BrickLabParts3 = Object.freeze({
  version: PARTS3_VERSION,
  schema: PART_SCHEMA_VERSION,
  added: ['axle-2', 'axle-9', 'bush', 'half-bush', 'steering-tie-rod-5', 'wheel-hub', 'wheel-narrow', 'wheel-offroad-large', 'wheel-tractor'],
})

window.dispatchEvent(new CustomEvent('bricklab:partcatalogchange', { detail: { total: PARTS.length, pack: PARTS3_VERSION } }))
