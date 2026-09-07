import * as THREE from 'three'
import type { ConnectorDefinition, PartDefinition } from './types'

const STUD = 1
const BRICK_HEIGHT = 1.2
const PLATE_HEIGHT = 0.4

function brickConnectors(width: number, depth: number, height: number): ConnectorDefinition[] {
  const connectors: ConnectorDefinition[] = []
  for (let x = 0; x < width; x += 1) {
    for (let z = 0; z < depth; z += 1) {
      const px = x - (width - 1) / 2
      const pz = z - (depth - 1) / 2
      connectors.push({ id: `stud-${x}-${z}`, type: 'stud', position: [px, height, pz], axis: [0, 1, 0] })
      connectors.push({ id: `tube-${x}-${z}`, type: 'tube', position: [px, 0, pz], axis: [0, -1, 0] })
    }
  }
  return connectors
}

function beamConnectors(length: number): ConnectorDefinition[] {
  return Array.from({ length }, (_, i) => ({
    id: `hole-${i}`,
    type: 'pin-hole' as const,
    position: [i - (length - 1) / 2, 0.45, 0] as [number, number, number],
    axis: [0, 0, 1] as [number, number, number],
  }))
}

function axleConnectors(length: number): ConnectorDefinition[] {
  return [-length / 2, 0, length / 2].map((x, i) => ({
    id: `axle-${i}`,
    type: 'axle' as const,
    position: [x, 0.32, 0] as [number, number, number],
    axis: [1, 0, 0] as [number, number, number],
  }))
}

function material(color: number) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05 })
}

function groupWithUserData(partId: string, color: number) {
  const group = new THREE.Group()
  group.userData.partId = partId
  group.userData.color = color
  return group
}

function addStuds(group: THREE.Group, width: number, depth: number, y: number, color: number) {
  const geo = new THREE.CylinderGeometry(0.3, 0.3, 0.18, 24)
  const mat = material(color)
  for (let x = 0; x < width; x += 1) {
    for (let z = 0; z < depth; z += 1) {
      const stud = new THREE.Mesh(geo, mat)
      stud.position.set(x - (width - 1) / 2, y, z - (depth - 1) / 2)
      stud.castShadow = true
      stud.receiveShadow = true
      group.add(stud)
    }
  }
}

function brick(id: string, width: number, depth: number, height: number, color: number) {
  const group = groupWithUserData(id, color)
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(width * STUD - 0.08, height, depth * STUD - 0.08),
    material(color),
  )
  body.position.y = height / 2
  body.castShadow = true
  body.receiveShadow = true
  group.add(body)
  addStuds(group, width, depth, height + 0.09, color)
  return group
}

function technicBeam(id: string, length: number, color: number) {
  const group = groupWithUserData(id, color)
  const mat = material(color)
  const body = new THREE.Mesh(new THREE.BoxGeometry(length - 0.1, 0.82, 0.82), mat)
  body.position.y = 0.45
  body.castShadow = true
  group.add(body)

  const holeGeo = new THREE.TorusGeometry(0.22, 0.085, 12, 24)
  const holeMat = new THREE.MeshStandardMaterial({ color: 0x17191b, roughness: 0.8 })
  for (let i = 0; i < length; i += 1) {
    const hole = new THREE.Mesh(holeGeo, holeMat)
    hole.position.set(i - (length - 1) / 2, 0.45, 0.42)
    group.add(hole)
    const back = hole.clone()
    back.rotation.y = Math.PI
    back.position.z = -0.42
    group.add(back)
  }
  return group
}

function axle(id: string, length: number, color: number) {
  const group = groupWithUserData(id, color)
  const mat = material(color)
  const horizontal = new THREE.Mesh(new THREE.BoxGeometry(length, 0.16, 0.32), mat)
  const vertical = new THREE.Mesh(new THREE.BoxGeometry(length, 0.32, 0.16), mat)
  horizontal.position.y = 0.32
  vertical.position.y = 0.32
  group.add(horizontal, vertical)
  return group
}

function pin(id: string, color: number) {
  const group = groupWithUserData(id, color)
  const mat = material(color)
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 2, 20), mat)
  core.rotation.x = Math.PI / 2
  core.position.y = 0.28
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.16, 20), mat)
  collar.rotation.x = Math.PI / 2
  collar.position.y = 0.28
  group.add(core, collar)
  return group
}

function gear(id: string, teeth: number, color: number) {
  const group = groupWithUserData(id, color)
  const radius = Math.max(0.65, teeth * 0.045)
  const shape = new THREE.Shape()
  const points = teeth * 2
  for (let i = 0; i < points; i += 1) {
    const angle = (i / points) * Math.PI * 2
    const r = i % 2 === 0 ? radius * 1.12 : radius
    const x = Math.cos(angle) * r
    const y = Math.sin(angle) * r
    if (i === 0) shape.moveTo(x, y)
    else shape.lineTo(x, y)
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
  mesh.castShadow = true
  group.add(mesh)
  return group
}

function wheel(id: string, color: number) {
  const group = groupWithUserData(id, color)
  const tire = new THREE.Mesh(
    new THREE.TorusGeometry(1.05, 0.35, 18, 36),
    new THREE.MeshStandardMaterial({ color: 0x222426, roughness: 0.95 }),
  )
  tire.rotation.y = Math.PI / 2
  tire.position.y = 1.15
  tire.castShadow = true
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.48, 32), material(color))
  rim.rotation.z = Math.PI / 2
  rim.position.y = 1.15
  group.add(tire, rim)
  return group
}

function motor(id: string, color: number) {
  const group = groupWithUserData(id, color)
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.9, 1.8, 2.1), material(color))
  body.position.y = 0.9
  body.castShadow = true
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.8, 18), material(0xadb5bd))
  shaft.rotation.z = Math.PI / 2
  shaft.position.set(1.75, 0.9, 0)
  group.add(body, shaft)
  return group
}

export const PARTS: PartDefinition[] = [
  { id: 'brick-2x4', name: 'Brick 2×4', category: 'Bricks', icon: '▦', description: 'Classic 2×4 construction brick.', defaultColor: 0xd7263d, connectors: brickConnectors(4, 2, BRICK_HEIGHT), create: c => brick('brick-2x4', 4, 2, BRICK_HEIGHT, c) },
  { id: 'plate-2x4', name: 'Plate 2×4', category: 'Bricks', icon: '▤', description: 'Low-profile 2×4 plate.', defaultColor: 0xf6c945, connectors: brickConnectors(4, 2, PLATE_HEIGHT), create: c => brick('plate-2x4', 4, 2, PLATE_HEIGHT, c) },
  { id: 'beam-5', name: 'Technic Beam 1×5', category: 'Beams', icon: '•••••', description: 'Short liftarm with five pin holes.', defaultColor: 0xd7263d, connectors: beamConnectors(5), create: c => technicBeam('beam-5', 5, c) },
  { id: 'beam-9', name: 'Technic Beam 1×9', category: 'Beams', icon: '•••••••••', description: 'Medium liftarm with nine pin holes.', defaultColor: 0x2d69c4, connectors: beamConnectors(9), create: c => technicBeam('beam-9', 9, c) },
  { id: 'axle-3', name: 'Axle 3L', category: 'Axles', icon: '━', description: 'Short cross axle.', defaultColor: 0xadb5bd, connectors: axleConnectors(3), create: c => axle('axle-3', 3, c) },
  { id: 'axle-5', name: 'Axle 5L', category: 'Axles', icon: '━━', description: 'Medium cross axle.', defaultColor: 0x2b2d31, connectors: axleConnectors(5), create: c => axle('axle-5', 5, c) },
  { id: 'pin', name: 'Friction Pin', category: 'Axles', icon: '●', description: 'Connector pin for Technic holes.', defaultColor: 0x2b2d31, connectors: [-1, 0, 1].map((z, i) => ({ id: `pin-${i}`, type: 'pin' as const, position: [0, 0.28, z] as [number, number, number], axis: [0, 0, 1] as [number, number, number] })), create: c => pin('pin', c) },
  { id: 'gear-8', name: 'Gear 8T', category: 'Gears', icon: '⚙', description: 'Small 8-tooth spur gear.', defaultColor: 0xadb5bd, connectors: [{ id: 'axle-hole', type: 'axle-hole', position: [0, 0.4, 0], axis: [0, 1, 0] }], create: c => gear('gear-8', 8, c) },
  { id: 'gear-16', name: 'Gear 16T', category: 'Gears', icon: '⚙', description: 'Medium 16-tooth spur gear.', defaultColor: 0xd9d9d9, connectors: [{ id: 'axle-hole', type: 'axle-hole', position: [0, 0.4, 0], axis: [0, 1, 0] }], create: c => gear('gear-16', 16, c) },
  { id: 'gear-24', name: 'Gear 24T', category: 'Gears', icon: '⚙', description: 'Large 24-tooth spur gear.', defaultColor: 0xd9d9d9, connectors: [{ id: 'axle-hole', type: 'axle-hole', position: [0, 0.4, 0], axis: [0, 1, 0] }], create: c => gear('gear-24', 24, c) },
  { id: 'wheel', name: 'Off-road Wheel', category: 'Wheels', icon: '◉', description: 'Large wheel for vehicle prototypes.', defaultColor: 0xb7bcc3, connectors: [{ id: 'axle-hole', type: 'axle-hole', position: [0, 1.15, 0], axis: [1, 0, 0] }], create: c => wheel('wheel', c) },
  { id: 'motor', name: 'Lab Motor', category: 'Power', icon: 'M', description: 'Placeholder motor body for drivetrain prototyping.', defaultColor: 0x6f7680, connectors: [{ id: 'output', type: 'axle', position: [1.75, 0.9, 0], axis: [1, 0, 0] }], create: c => motor('motor', c) },
]

export function findPart(id: string) {
  return PARTS.find(part => part.id === id)
}
