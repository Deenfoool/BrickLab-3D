import * as THREE from 'three'

const BRICK_HEIGHT = 1.2
const PLATE_HEIGHT = 0.4

function material(color) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.04 })
}

function group(partId, color) {
  const g = new THREE.Group()
  g.userData.partId = partId
  g.userData.color = color
  return g
}

function brickConnectors(width, depth, height) {
  const connectors = []
  for (let x = 0; x < width; x++) {
    for (let z = 0; z < depth; z++) {
      const px = x - (width - 1) / 2
      const pz = z - (depth - 1) / 2
      connectors.push({ id: `stud-${x}-${z}`, type: 'stud', position: [px, height, pz], axis: [0, 1, 0] })
      connectors.push({ id: `tube-${x}-${z}`, type: 'tube', position: [px, 0, pz], axis: [0, -1, 0] })
    }
  }
  return connectors
}

function beamConnectors(length) {
  return Array.from({ length }, (_, i) => ({
    id: `hole-${i}`,
    type: 'pin-hole',
    position: [i - (length - 1) / 2, 0.45, 0],
    axis: [0, 0, 1],
  }))
}

function axleConnectors(length) {
  return [-length / 2, 0, length / 2].map((x, i) => ({
    id: `axle-${i}`,
    type: 'axle',
    position: [x, 0.32, 0],
    axis: [1, 0, 0],
  }))
}

function addStuds(g, width, depth, y, color) {
  const geo = new THREE.CylinderGeometry(0.3, 0.3, 0.18, 20)
  const mat = material(color)
  for (let x = 0; x < width; x++) {
    for (let z = 0; z < depth; z++) {
      const stud = new THREE.Mesh(geo, mat)
      stud.position.set(x - (width - 1) / 2, y, z - (depth - 1) / 2)
      g.add(stud)
    }
  }
}

function createBrick(id, width, depth, height, color) {
  const g = group(id, color)
  const body = new THREE.Mesh(new THREE.BoxGeometry(width - 0.08, height, depth - 0.08), material(color))
  body.position.y = height / 2
  g.add(body)
  addStuds(g, width, depth, height + 0.09, color)
  return g
}

function createBeam(id, length, color) {
  const g = group(id, color)
  const body = new THREE.Mesh(new THREE.BoxGeometry(length - 0.1, 0.82, 0.82), material(color))
  body.position.y = 0.45
  g.add(body)
  const holeGeo = new THREE.TorusGeometry(0.22, 0.085, 12, 20)
  const holeMat = new THREE.MeshStandardMaterial({ color: 0x17191b, roughness: 0.9 })
  for (let i = 0; i < length; i++) {
    const x = i - (length - 1) / 2
    const front = new THREE.Mesh(holeGeo, holeMat)
    front.position.set(x, 0.45, 0.42)
    const back = front.clone()
    back.position.z = -0.42
    g.add(front, back)
  }
  return g
}

function createAxle(id, length, color) {
  const g = group(id, color)
  const mat = material(color)
  const a = new THREE.Mesh(new THREE.BoxGeometry(length, 0.16, 0.32), mat)
  const b = new THREE.Mesh(new THREE.BoxGeometry(length, 0.32, 0.16), mat)
  a.position.y = b.position.y = 0.32
  g.add(a, b)
  return g
}

function createPin(id, color) {
  const g = group(id, color)
  const mat = material(color)
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 2, 20), mat)
  core.rotation.x = Math.PI / 2
  core.position.y = 0.28
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.16, 20), mat)
  collar.rotation.x = Math.PI / 2
  collar.position.y = 0.28
  g.add(core, collar)
  return g
}

function createGear(id, teeth, color) {
  const g = group(id, color)
  const radius = Math.max(0.65, teeth * 0.045)
  const shape = new THREE.Shape()
  const points = teeth * 2
  for (let i = 0; i < points; i++) {
    const angle = i / points * Math.PI * 2
    const r = i % 2 === 0 ? radius * 1.12 : radius
    const x = Math.cos(angle) * r
    const y = Math.sin(angle) * r
    if (!i) shape.moveTo(x, y); else shape.lineTo(x, y)
  }
  shape.closePath()
  const hole = new THREE.Path()
  hole.absarc(0, 0, 0.22, 0, Math.PI * 2, true)
  shape.holes.push(hole)
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.34, bevelEnabled: false })
  geo.center()
  const mesh = new THREE.Mesh(geo, material(color))
  mesh.rotation.x = Math.PI / 2
  mesh.position.y = 0.4
  g.add(mesh)
  return g
}

function createWheel(id, color) {
  const g = group(id, color)
  const tire = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.35, 18, 36), new THREE.MeshStandardMaterial({ color: 0x222426, roughness: 0.95 }))
  tire.rotation.y = Math.PI / 2
  tire.position.y = 1.15
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.48, 32), material(color))
  rim.rotation.z = Math.PI / 2
  rim.position.y = 1.15
  g.add(tire, rim)
  return g
}

function createMotor(id, color) {
  const g = group(id, color)
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.9, 1.8, 2.1), material(color))
  body.position.y = 0.9
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.8, 18), material(0xadb5bd))
  shaft.rotation.z = Math.PI / 2
  shaft.position.set(1.75, 0.9, 0)
  g.add(body, shaft)
  return g
}

export const PARTS = [
  { id: 'brick-2x4', name: 'Brick 2×4', category: 'Bricks', icon: '▦', description: 'Classic 2×4 brick', defaultColor: 0xd7263d, connectors: brickConnectors(4, 2, BRICK_HEIGHT), create: c => createBrick('brick-2x4', 4, 2, BRICK_HEIGHT, c) },
  { id: 'plate-2x4', name: 'Plate 2×4', category: 'Bricks', icon: '▤', description: 'Low-profile 2×4 plate', defaultColor: 0xf6c945, connectors: brickConnectors(4, 2, PLATE_HEIGHT), create: c => createBrick('plate-2x4', 4, 2, PLATE_HEIGHT, c) },
  { id: 'beam-5', name: 'Technic Beam 1×5', category: 'Beams', icon: '•••••', description: 'Five pin holes', defaultColor: 0xd7263d, connectors: beamConnectors(5), create: c => createBeam('beam-5', 5, c) },
  { id: 'beam-9', name: 'Technic Beam 1×9', category: 'Beams', icon: '•••••••••', description: 'Nine pin holes', defaultColor: 0x2d69c4, connectors: beamConnectors(9), create: c => createBeam('beam-9', 9, c) },
  { id: 'axle-3', name: 'Axle 3L', category: 'Axles', icon: '━', description: 'Short cross axle', defaultColor: 0xadb5bd, connectors: axleConnectors(3), create: c => createAxle('axle-3', 3, c) },
  { id: 'axle-5', name: 'Axle 5L', category: 'Axles', icon: '━━', description: 'Medium cross axle', defaultColor: 0x2b2d31, connectors: axleConnectors(5), create: c => createAxle('axle-5', 5, c) },
  { id: 'pin', name: 'Friction Pin', category: 'Axles', icon: '●', description: 'Technic connector pin', defaultColor: 0x2b2d31, connectors: [-1, 0, 1].map((z, i) => ({ id: `pin-${i}`, type: 'pin', position: [0, 0.28, z], axis: [0, 0, 1] })), create: c => createPin('pin', c) },
  { id: 'gear-8', name: 'Gear 8T', category: 'Gears', icon: '⚙', description: 'Small spur gear', defaultColor: 0xadb5bd, mechanics: { gear: { teeth: 8 } }, connectors: [{ id: 'axle-hole', type: 'axle-hole', position: [0, 0.4, 0], axis: [0, 1, 0] }], create: c => createGear('gear-8', 8, c) },
  { id: 'gear-16', name: 'Gear 16T', category: 'Gears', icon: '⚙', description: 'Medium spur gear', defaultColor: 0xd9d9d9, mechanics: { gear: { teeth: 16 } }, connectors: [{ id: 'axle-hole', type: 'axle-hole', position: [0, 0.4, 0], axis: [0, 1, 0] }], create: c => createGear('gear-16', 16, c) },
  { id: 'gear-24', name: 'Gear 24T', category: 'Gears', icon: '⚙', description: 'Large spur gear', defaultColor: 0xd9d9d9, mechanics: { gear: { teeth: 24 } }, connectors: [{ id: 'axle-hole', type: 'axle-hole', position: [0, 0.4, 0], axis: [0, 1, 0] }], create: c => createGear('gear-24', 24, c) },
  { id: 'wheel', name: 'Off-road Wheel', category: 'Wheels', icon: '◉', description: 'Large prototype wheel', defaultColor: 0xb7bcc3, mechanics: { wheel: { radius: 1.4 } }, connectors: [{ id: 'axle-hole', type: 'axle-hole', position: [0, 1.15, 0], axis: [1, 0, 0] }], create: c => createWheel('wheel', c) },
  { id: 'motor', name: 'Lab Motor', category: 'Power', icon: 'M', description: '120 RPM drivetrain motor', defaultColor: 0x6f7680, mechanics: { motor: { connectorId: 'output', rpm: 120, direction: 1, damping: 1.0 } }, connectors: [{ id: 'output', type: 'axle', position: [1.75, 0.9, 0], axis: [1, 0, 0] }], create: c => createMotor('motor', c) },
]

export const findPart = id => PARTS.find(part => part.id === id)
