import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { PARTS } from './parts.js'

export const VEHICLE_PARTS_VERSION = 'vehicle-parts-v1'

function material(color) {
  return new THREE.MeshPhysicalMaterial({ color, roughness: 0.34, metalness: 0.02, clearcoat: 0.14, clearcoatRoughness: 0.42 })
}
function dark() { return new THREE.MeshStandardMaterial({ color: 0x171a1d, roughness: 0.8, metalness: 0.04 }) }
function roundedBox(w, h, d, r = 0.08) { return new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 3, h / 3, d / 3)) }
function root(id, color) { const g = new THREE.Group(); g.userData.partId = id; g.userData.color = color; return g }
function addPart(definition) { if (!PARTS.some(part => part.id === definition.id)) PARTS.push(definition) }

function steeringBase(color) {
  const g = root('steering-base', color)
  const mat = material(color)
  const plate = new THREE.Mesh(roundedBox(1.82, 0.28, 1.82, 0.10), mat)
  plate.position.y = 0.14
  g.add(plate)
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.54, 0.72, 32), mat)
  tower.position.y = 0.50
  g.add(tower)
  const socket = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.07, 10, 32), dark())
  socket.rotation.x = Math.PI / 2
  socket.position.y = 0.88
  g.add(socket)
  for (const x of [-0.5, 0.5]) for (const z of [-0.5, 0.5]) {
    const foot = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.045, 8, 28), dark())
    foot.rotation.x = Math.PI / 2
    foot.position.set(x, 0.015, z)
    g.add(foot)
  }
  return g
}

function steeringKnuckle(color) {
  const g = root('steering-knuckle', color)
  const mat = material(color)
  const upright = new THREE.Mesh(roundedBox(0.76, 1.05, 0.78, 0.12), mat)
  upright.position.y = 0.55
  g.add(upright)

  const pivot = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.82, 24), dark())
  pivot.position.y = 0.55
  g.add(pivot)

  const bearing = new THREE.Mesh(new THREE.TorusGeometry(0.30, 0.075, 10, 32), dark())
  bearing.rotation.y = Math.PI / 2
  bearing.position.set(0, 0.55, 0)
  g.add(bearing)

  const shoulder = new THREE.Mesh(roundedBox(0.98, 0.24, 0.44, 0.07), mat)
  shoulder.position.set(0, 0.55, 0)
  g.add(shoulder)
  return g
}

addPart({
  id: 'steering-base',
  name: 'Steering Pivot Base',
  category: 'Steering',
  icon: '↟',
  description: 'Stud-mounted vertical steering pivot socket',
  defaultColor: 0x59626c,
  mechanics: { steeringBase: true },
  connectors: [
    { id: 'pivot-hole', type: 'pin-hole', position: [0, 0.88, 0], axis: [0, 1, 0] },
    { id: 'mount-0-0', type: 'tube', position: [-0.5, 0, -0.5], axis: [0, -1, 0] },
    { id: 'mount-1-0', type: 'tube', position: [0.5, 0, -0.5], axis: [0, -1, 0] },
    { id: 'mount-0-1', type: 'tube', position: [-0.5, 0, 0.5], axis: [0, -1, 0] },
    { id: 'mount-1-1', type: 'tube', position: [0.5, 0, 0.5], axis: [0, -1, 0] },
  ],
  create: steeringBase,
})

addPart({
  id: 'steering-knuckle',
  name: 'Steering Knuckle',
  category: 'Steering',
  icon: '↻',
  description: 'Vertical steering hinge with a horizontal free-spinning axle bearing',
  defaultColor: 0x2d69c4,
  mechanics: { steeringKnuckle: { maxSteerDeg: 34, stiffness: 18, damping: 2.6 } },
  connectors: [
    { id: 'pivot-pin', type: 'pin', position: [0, 0.88, 0], axis: [0, 1, 0] },
    { id: 'wheel-bearing', type: 'pin-hole', position: [0, 0.55, 0], axis: [1, 0, 0] },
  ],
  create: steeringKnuckle,
})

// Refresh catalog filters/previews after runtime registration.
document.getElementById('partSearch')?.dispatchEvent(new Event('input', { bubbles: true }))
