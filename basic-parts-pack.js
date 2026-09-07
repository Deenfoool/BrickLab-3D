import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { PARTS } from './parts.js'

const BRICK_HEIGHT = 1.2
const PLATE_HEIGHT = 0.4

function plastic(color, options = {}) {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: options.roughness ?? 0.31,
    metalness: 0.015,
    clearcoat: options.clearcoat ?? 0.2,
    clearcoatRoughness: options.clearcoatRoughness ?? 0.36,
    ior: 1.46,
  })
}

function dark() {
  return new THREE.MeshStandardMaterial({ color: 0x111417, roughness: 0.82, metalness: 0.03 })
}

function roundedBox(width, height, depth, radius = 0.075, segments = 4) {
  return new RoundedBoxGeometry(width, height, depth, segments, Math.min(radius, width / 3, height / 3, depth / 3))
}

function root(id, color) {
  const group = new THREE.Group()
  group.userData.partId = id
  group.userData.color = color
  return group
}

function brickConnectors(width, depth, height) {
  const result = []
  for (let x = 0; x < width; x += 1) {
    for (let z = 0; z < depth; z += 1) {
      const px = x - (width - 1) / 2
      const pz = z - (depth - 1) / 2
      result.push({ id: `stud-${x}-${z}`, type: 'stud', position: [px, height, pz], axis: [0, 1, 0] })
      result.push({ id: `tube-${x}-${z}`, type: 'tube', position: [px, 0, pz], axis: [0, -1, 0] })
    }
  }
  return result
}

function beamConnectors(length) {
  return Array.from({ length }, (_, i) => ({
    id: `hole-${i}`,
    type: 'pin-hole',
    position: [i - (length - 1) / 2, 0.45, 0],
    axis: [0, 0, 1],
  }))
}

function technicBrickConnectors(length) {
  const result = []
  for (let i = 0; i < length; i += 1) {
    const x = i - (length - 1) / 2
    result.push({ id: `stud-${i}`, type: 'stud', position: [x, BRICK_HEIGHT, 0], axis: [0, 1, 0] })
    result.push({ id: `tube-${i}`, type: 'tube', position: [x, 0, 0], axis: [0, -1, 0] })
  }
  for (let i = 0; i < length - 1; i += 1) {
    result.push({ id: `side-hole-${i}`, type: 'pin-hole', position: [i - (length - 2) / 2, BRICK_HEIGHT / 2, 0], axis: [0, 0, 1] })
  }
  return result
}

function axleConnectors(length) {
  return Array.from({ length }, (_, i) => ({
    id: `axle-${i}`,
    type: 'axle',
    position: [i - (length - 1) / 2, 0.32, 0],
    axis: [1, 0, 0],
  }))
}

function crossShape(radius = 0.18, arm = 0.075) {
  const points = [
    [-arm, radius], [arm, radius], [arm, arm], [radius, arm],
    [radius, -arm], [arm, -arm], [arm, -radius], [-arm, -radius],
    [-arm, -arm], [-radius, -arm], [-radius, arm], [-arm, arm],
  ]
  const shape = new THREE.Shape()
  shape.moveTo(...points[0])
  for (let i = 1; i < points.length; i += 1) shape.lineTo(...points[i])
  shape.closePath()
  return shape
}

function crossPath(radius = 0.205, arm = 0.082) {
  const path = new THREE.Path()
  const points = [
    [-arm, radius], [arm, radius], [arm, arm], [radius, arm],
    [radius, -arm], [arm, -arm], [arm, -radius], [-arm, -radius],
    [-arm, -arm], [-radius, -arm], [-radius, arm], [-arm, arm],
  ]
  path.moveTo(...points[0])
  for (let i = 1; i < points.length; i += 1) path.lineTo(...points[i])
  path.closePath()
  return path
}

function addStuds(group, width, depth, height, color) {
  const mat = plastic(color)
  const side = new THREE.CylinderGeometry(0.302, 0.306, 0.18, 36)
  const top = new THREE.CylinderGeometry(0.284, 0.292, 0.025, 36)
  const groove = new THREE.TorusGeometry(0.235, 0.014, 6, 32)
  for (let x = 0; x < width; x += 1) {
    for (let z = 0; z < depth; z += 1) {
      const px = x - (width - 1) / 2
      const pz = z - (depth - 1) / 2
      const stud = new THREE.Mesh(side, mat)
      stud.position.set(px, height + 0.09, pz)
      const cap = new THREE.Mesh(top, mat)
      cap.position.set(px, height + 0.192, pz)
      const seam = new THREE.Mesh(groove, dark())
      seam.rotation.x = Math.PI / 2
      seam.position.set(px, height + 0.205, pz)
      group.add(stud, cap, seam)
    }
  }
}

function addUnderside(group, width, depth, height) {
  const tubeMat = dark()
  const ringRadius = width === 1 || depth === 1 ? 0.215 : 0.255
  const ring = new THREE.TorusGeometry(ringRadius, 0.038, 7, 30)
  const recess = new THREE.CircleGeometry(Math.max(0.12, ringRadius - 0.05), 28)
  for (let x = 0; x < width; x += 1) {
    for (let z = 0; z < depth; z += 1) {
      const px = x - (width - 1) / 2
      const pz = z - (depth - 1) / 2
      const socket = new THREE.Mesh(ring, tubeMat)
      socket.rotation.x = Math.PI / 2
      socket.position.set(px, 0.018, pz)
      const shadow = new THREE.Mesh(recess, tubeMat)
      shadow.rotation.x = Math.PI / 2
      shadow.position.set(px, 0.012, pz)
      group.add(socket, shadow)
    }
  }

  const ribHeight = Math.max(0.06, Math.min(0.16, height * 0.18))
  if (width > 1) {
    for (let x = 0; x < width - 1; x += 1) {
      const rib = new THREE.Mesh(roundedBox(0.07, ribHeight, Math.max(0.28, depth - 0.3), 0.025, 2), tubeMat)
      rib.position.set(x - (width - 2) / 2, ribHeight / 2, 0)
      group.add(rib)
    }
  }
}

function createBrick(id, width, depth, height, color) {
  const group = root(id, color)
  const mat = plastic(color)
  const body = new THREE.Mesh(roundedBox(width - 0.075, height, depth - 0.075, Math.min(0.09, height * 0.2), 4), mat)
  body.position.y = height / 2
  group.add(body)

  const shoulder = new THREE.Mesh(roundedBox(width - 0.14, 0.055, depth - 0.14, 0.025, 2), plastic(color, { roughness: 0.27 }))
  shoulder.position.y = height - 0.055
  group.add(shoulder)

  addStuds(group, width, depth, height, color)
  addUnderside(group, width, depth, height)
  return group
}

function ringExtrusion(outerRadius, innerRadius, depth, color) {
  const shape = new THREE.Shape()
  shape.absarc(0, 0, outerRadius, 0, Math.PI * 2, false)
  const hole = new THREE.Path()
  hole.absarc(0, 0, innerRadius, 0, Math.PI * 2, true)
  shape.holes.push(hole)
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.018,
    bevelThickness: 0.018,
    curveSegments: 32,
  })
  geometry.translate(0, 0, -depth / 2)
  return new THREE.Mesh(geometry, plastic(color))
}

function createTechnicBrick(id, length, color) {
  const group = root(id, color)
  const mat = plastic(color)
  const depth = 0.88
  const width = length - 0.08
  const top = new THREE.Mesh(roundedBox(width, 0.3, depth, 0.075, 4), mat)
  top.position.y = 1.0
  const bottom = new THREE.Mesh(roundedBox(width, 0.3, depth, 0.075, 4), mat)
  bottom.position.y = 0.2
  group.add(top, bottom)

  for (const x of [-(length - 1) / 2 - 0.45, (length - 1) / 2 + 0.45]) {
    const end = new THREE.Mesh(roundedBox(0.35, 0.72, depth, 0.08, 4), mat)
    end.position.set(x, 0.6, 0)
    group.add(end)
  }

  for (let i = 0; i < length - 1; i += 1) {
    const x = i - (length - 2) / 2
    const ring = ringExtrusion(0.33, 0.225, depth + 0.035, color)
    ring.position.set(x, 0.6, 0)
    group.add(ring)
    const liner = new THREE.Mesh(new THREE.TorusGeometry(0.225, 0.026, 7, 30), dark())
    liner.position.set(x, 0.6, depth / 2 + 0.025)
    group.add(liner)
  }

  addStuds(group, length, 1, BRICK_HEIGHT, color)
  addUnderside(group, length, 1, BRICK_HEIGHT)
  return group
}

function createBeam(id, length, color) {
  const group = root(id, color)
  const mat = plastic(color)
  const depth = 0.78
  const width = length - 0.12
  const upper = new THREE.Mesh(roundedBox(width, 0.16, depth, 0.065, 3), mat)
  upper.position.y = 0.81
  const lower = new THREE.Mesh(roundedBox(width, 0.16, depth, 0.065, 3), mat)
  lower.position.y = 0.09
  group.add(upper, lower)

  for (let i = 0; i < length; i += 1) {
    const x = i - (length - 1) / 2
    const ring = ringExtrusion(0.41, 0.245, depth + 0.03, color)
    ring.position.set(x, 0.45, 0)
    group.add(ring)
    const liner = new THREE.Mesh(new THREE.TorusGeometry(0.245, 0.025, 7, 30), dark())
    liner.position.set(x, 0.45, depth / 2 + 0.024)
    group.add(liner)
  }
  return group
}

function createAxle(id, length, color) {
  const group = root(id, color)
  const geometry = new THREE.ExtrudeGeometry(crossShape(), {
    depth: length - 0.06,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: 0.012,
    bevelThickness: 0.012,
  })
  geometry.center()
  geometry.rotateY(Math.PI / 2)
  const shaft = new THREE.Mesh(geometry, plastic(color, { roughness: 0.28, clearcoat: 0.12 }))
  shaft.position.y = 0.32
  group.add(shaft)

  for (const x of [-length / 2 + 0.015, length / 2 - 0.015]) {
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.145, 0.016, 6, 26), dark())
    collar.rotation.y = Math.PI / 2
    collar.position.set(x, 0.32, 0)
    group.add(collar)
  }
  return group
}

function createBush(id, width, color) {
  const group = root(id, color)
  const mat = plastic(color, { roughness: 0.29, clearcoat: 0.15 })
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, width, 36), mat)
  body.rotation.z = Math.PI / 2
  body.position.y = 0.32
  group.add(body)

  const flangeWidth = Math.min(0.09, width * 0.24)
  for (const x of [-width / 2, width / 2]) {
    const flange = new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.47, flangeWidth, 36), mat)
    flange.rotation.z = Math.PI / 2
    flange.position.set(x, 0.32, 0)
    group.add(flange)
    const faceShape = new THREE.Shape()
    faceShape.absarc(0, 0, 0.28, 0, Math.PI * 2, false)
    faceShape.holes.push(crossPath())
    const face = new THREE.Mesh(new THREE.ShapeGeometry(faceShape), dark())
    face.rotation.y = Math.PI / 2
    face.position.set(x + Math.sign(x || 1) * 0.006, 0.32, 0)
    group.add(face)
  }
  return group
}

function addPart(definition) {
  if (!PARTS.some(part => part.id === definition.id)) PARTS.push(definition)
}

const definitions = [
  { id: 'brick-1x2', name: 'Brick 1×2', category: 'Bricks', icon: '▦', description: 'Compact classic 1×2 brick', defaultColor: 0xd7263d, connectors: brickConnectors(2, 1, BRICK_HEIGHT), create: c => createBrick('brick-1x2', 2, 1, BRICK_HEIGHT, c) },
  { id: 'brick-1x4', name: 'Brick 1×4', category: 'Bricks', icon: '▦', description: 'Long narrow 1×4 brick', defaultColor: 0xf0f1f2, connectors: brickConnectors(4, 1, BRICK_HEIGHT), create: c => createBrick('brick-1x4', 4, 1, BRICK_HEIGHT, c) },
  { id: 'brick-2x2', name: 'Brick 2×2', category: 'Bricks', icon: '▦', description: 'Square 2×2 structural brick', defaultColor: 0x2d69c4, connectors: brickConnectors(2, 2, BRICK_HEIGHT), create: c => createBrick('brick-2x2', 2, 2, BRICK_HEIGHT, c) },
  { id: 'brick-2x6', name: 'Brick 2×6', category: 'Bricks', icon: '▦', description: 'Long 2×6 structural brick', defaultColor: 0xd7263d, connectors: brickConnectors(6, 2, BRICK_HEIGHT), create: c => createBrick('brick-2x6', 6, 2, BRICK_HEIGHT, c) },
  { id: 'plate-1x2', name: 'Plate 1×2', category: 'Bricks', icon: '▤', description: 'Compact low-profile 1×2 plate', defaultColor: 0xf6c945, connectors: brickConnectors(2, 1, PLATE_HEIGHT), create: c => createBrick('plate-1x2', 2, 1, PLATE_HEIGHT, c) },
  { id: 'plate-1x4', name: 'Plate 1×4', category: 'Bricks', icon: '▤', description: 'Narrow low-profile 1×4 plate', defaultColor: 0x2d69c4, connectors: brickConnectors(4, 1, PLATE_HEIGHT), create: c => createBrick('plate-1x4', 4, 1, PLATE_HEIGHT, c) },
  { id: 'plate-2x2', name: 'Plate 2×2', category: 'Bricks', icon: '▤', description: 'Square low-profile 2×2 plate', defaultColor: 0xf6c945, connectors: brickConnectors(2, 2, PLATE_HEIGHT), create: c => createBrick('plate-2x2', 2, 2, PLATE_HEIGHT, c) },
  { id: 'plate-2x6', name: 'Plate 2×6', category: 'Bricks', icon: '▤', description: 'Long low-profile 2×6 chassis plate', defaultColor: 0xf6c945, connectors: brickConnectors(6, 2, PLATE_HEIGHT), create: c => createBrick('plate-2x6', 6, 2, PLATE_HEIGHT, c) },
  { id: 'technic-brick-1x4', name: 'Technic Brick 1×4', category: 'Beams', icon: '▥', description: 'Studded Technic brick with three side holes', defaultColor: 0x59626c, connectors: technicBrickConnectors(4), create: c => createTechnicBrick('technic-brick-1x4', 4, c) },
  { id: 'beam-3', name: 'Technic Beam 1×3', category: 'Beams', icon: '•••', description: 'Short beam with three pin / axle holes', defaultColor: 0xd7263d, connectors: beamConnectors(3), create: c => createBeam('beam-3', 3, c) },
  { id: 'beam-7', name: 'Technic Beam 1×7', category: 'Beams', icon: '•••••••', description: 'Medium beam with seven pin / axle holes', defaultColor: 0xf0f1f2, connectors: beamConnectors(7), create: c => createBeam('beam-7', 7, c) },
  { id: 'beam-11', name: 'Technic Beam 1×11', category: 'Beams', icon: '•••••••••••', description: 'Long beam with eleven pin / axle holes', defaultColor: 0x2d69c4, connectors: beamConnectors(11), create: c => createBeam('beam-11', 11, c) },
  { id: 'axle-2', name: 'Axle 2L', category: 'Axles', icon: '━', description: 'Very short cross axle with two attachment slots', defaultColor: 0xadb5bd, mechanics: { shaft: true }, connectors: axleConnectors(2), create: c => createAxle('axle-2', 2, c) },
  { id: 'axle-9', name: 'Axle 9L', category: 'Axles', icon: '━━━━', description: 'Extra-long cross axle with nine attachment slots', defaultColor: 0x2b2d31, mechanics: { shaft: true }, connectors: axleConnectors(9), create: c => createAxle('axle-9', 9, c) },
  { id: 'bush', name: 'Bush', category: 'Axles', icon: '◎', description: 'Full-width axle stop and spacer', defaultColor: 0xadb5bd, mechanics: { shaft: true }, connectors: [{ id: 'axle-hole', type: 'axle-hole', position: [0, 0.32, 0], axis: [1, 0, 0] }], create: c => createBush('bush', 0.55, c) },
  { id: 'half-bush', name: 'Half Bush', category: 'Axles', icon: '◉', description: 'Compact half-width axle stop and spacer', defaultColor: 0xadb5bd, mechanics: { shaft: true }, connectors: [{ id: 'axle-hole', type: 'axle-hole', position: [0, 0.32, 0], axis: [1, 0, 0] }], create: c => createBush('half-bush', 0.3, c) },
]

definitions.forEach(addPart)
