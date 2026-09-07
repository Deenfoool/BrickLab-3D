import * as THREE from 'three'
import { PARTS } from './parts.js'

const LEGACY_MOTOR_MOUNTS = {
  'mount-0': 'mount-0-0',
  'mount-1': 'mount-1-0',
  'mount-2': 'mount-0-1',
  'mount-3': 'mount-1-1',
}

function migrateProjectKey(key) {
  const raw = localStorage.getItem(key)
  if (!raw) return
  try {
    const project = JSON.parse(raw)
    if (!Array.isArray(project?.connections) || !Array.isArray(project?.parts)) return
    const motorIds = new Set(project.parts.filter(part => part.partId === 'motor').map(part => part.instanceId))
    let changed = false

    for (const connection of project.connections) {
      for (const side of ['a', 'b']) {
        const endpoint = connection?.[side]
        if (!endpoint || !motorIds.has(endpoint.instanceId)) continue
        const next = LEGACY_MOTOR_MOUNTS[endpoint.connectorId]
        if (!next) continue
        endpoint.connectorId = next
        changed = true
      }
    }

    if (changed) localStorage.setItem(key, JSON.stringify(project))
  } catch (error) {
    console.warn(`BrickLab could not migrate ${key}`, error)
  }
}

migrateProjectKey('bricklab.project.v2')
migrateProjectKey('bricklab.demo.backup.v1')

function material(color) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.58, metalness: 0.04 })
}

function darkMaterial() {
  return new THREE.MeshStandardMaterial({ color: 0x17191b, roughness: 0.9 })
}

function addPart(definition) {
  if (!PARTS.some(part => part.id === definition.id)) PARTS.push(definition)
}

function createBearingBlock(color) {
  const g = new THREE.Group()
  g.userData.partId = 'bearing-block'
  g.userData.color = color

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.35, 1.2), material(color))
  body.position.y = 0.675
  g.add(body)

  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.1, 14, 28), darkMaterial())
  ring.rotation.y = Math.PI / 2
  ring.position.set(0, 0.9, 0.61)
  const back = ring.clone()
  back.position.z = -0.61
  g.add(ring, back)
  return g
}

function createSuspensionArm(color) {
  const g = new THREE.Group()
  g.userData.partId = 'suspension-arm-5'
  g.userData.color = color

  const body = new THREE.Mesh(new THREE.BoxGeometry(4.9, 0.72, 0.72), material(color))
  body.position.set(0, 0.45, 0)
  g.add(body)

  const holeGeo = new THREE.TorusGeometry(0.22, 0.08, 12, 22)
  const holeMat = darkMaterial()
  for (const x of [-1, 0, 1, 2]) {
    const front = new THREE.Mesh(holeGeo, holeMat)
    front.position.set(x, 0.45, 0.37)
    const back = front.clone()
    back.position.z = -0.37
    g.add(front, back)
  }

  const pivot = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 1.05, 20), material(0xadb5bd))
  pivot.rotation.x = Math.PI / 2
  pivot.position.set(-2, 0.45, 0)
  g.add(pivot)
  return g
}

addPart({
  id: 'bearing-block',
  name: 'Bearing Block',
  category: 'Axles',
  icon: '◎',
  description: 'Stud-mounted axle bearing for chassis and test benches',
  defaultColor: 0x59626c,
  mechanics: { bearingBlock: true },
  connectors: [
    { id: 'bearing', type: 'pin-hole', position: [0, 0.9, 0], axis: [1, 0, 0] },
    { id: 'mount-0-0', type: 'tube', position: [-0.5, 0, -0.5], axis: [0, -1, 0] },
    { id: 'mount-1-0', type: 'tube', position: [0.5, 0, -0.5], axis: [0, -1, 0] },
    { id: 'mount-0-1', type: 'tube', position: [-0.5, 0, 0.5], axis: [0, -1, 0] },
    { id: 'mount-1-1', type: 'tube', position: [0.5, 0, 0.5], axis: [0, -1, 0] },
  ],
  create: createBearingBlock,
})

addPart({
  id: 'suspension-arm-5',
  name: 'Suspension Arm 5L',
  category: 'Beams',
  icon: '⌁',
  description: 'Spring-loaded control arm with integrated pivot pin',
  defaultColor: 0xd7263d,
  mechanics: {
    suspensionArm: {
      pivotConnectorId: 'pivot',
      restAngle: 0,
      stiffness: 7.5,
      damping: 1.25,
    },
  },
  connectors: [
    { id: 'pivot', type: 'pin', position: [-2, 0.45, 0], axis: [0, 0, 1] },
    { id: 'hole-1', type: 'pin-hole', position: [-1, 0.45, 0], axis: [0, 0, 1] },
    { id: 'hole-2', type: 'pin-hole', position: [0, 0.45, 0], axis: [0, 0, 1] },
    { id: 'hole-3', type: 'pin-hole', position: [1, 0.45, 0], axis: [0, 0, 1] },
    { id: 'hole-4', type: 'pin-hole', position: [2, 0.45, 0], axis: [0, 0, 1] },
  ],
  create: createSuspensionArm,
})

document.getElementById('partSearch')?.dispatchEvent(new Event('input', { bubbles: true }))
