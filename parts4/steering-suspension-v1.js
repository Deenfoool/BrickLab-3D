import * as THREE from 'three'
import { PARTS } from '../parts.js'
import { installPart } from '../parts3/part-schema-v1.js'

export const PARTS4_STEERING_SUSPENSION_VERSION = 'parts-4-steering-suspension-v1'

function plastic(color, roughness = 0.32) {
  return new THREE.MeshPhysicalMaterial({ color, roughness, metalness: 0.01, clearcoat: 0.16, clearcoatRoughness: 0.36, ior: 1.47 })
}
function dark() { return new THREE.MeshStandardMaterial({ color: 0x17191c, roughness: 0.80, metalness: 0.03 }) }
function metal() { return new THREE.MeshStandardMaterial({ color: 0xb7bec5, roughness: 0.27, metalness: 0.72 }) }
function root(id, color) { const g = new THREE.Group(); g.userData.partId = id; g.userData.color = color; return g }

function addTubeFeet(g, color, xs, zs = [-0.5, 0.5]) {
  const mat = plastic(color)
  for (const x of xs) for (const z of zs) {
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.27, 0.10, 24), mat)
    foot.position.set(x, 0.05, z)
    g.add(foot)
  }
}

function createRackGuide(color) {
  const g = root('steering-rack-guide', color)
  const mat = plastic(color, 0.35)
  const top = new THREE.Mesh(new THREE.BoxGeometry(6.7, 0.24, 1.20), mat)
  top.position.y = 1.05
  const bottom = new THREE.Mesh(new THREE.BoxGeometry(6.7, 0.24, 1.20), mat)
  bottom.position.y = 0.20
  const back = new THREE.Mesh(new THREE.BoxGeometry(6.7, 0.72, 0.18), mat)
  back.position.set(0, 0.62, -0.52)
  g.add(top, bottom, back)

  const liner = new THREE.Mesh(new THREE.BoxGeometry(6.15, 0.48, 0.68), dark())
  liner.position.set(0, 0.62, 0.03)
  liner.scale.set(1, 1, 0.06)
  g.add(liner)
  addTubeFeet(g, color, [-2.5, -1.5, 1.5, 2.5])
  return g
}

function createSteeringRack(color) {
  const g = root('steering-rack-7', color)
  const rackMat = metal()
  const beam = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.30, 0.38), rackMat)
  beam.position.y = 0.62
  g.add(beam)

  const toothGeo = new THREE.BoxGeometry(0.18, 0.16, 0.42)
  for (let i = -15; i <= 15; i += 1) {
    const tooth = new THREE.Mesh(toothGeo, rackMat)
    tooth.position.set(i * 0.19, 0.84, 0)
    tooth.rotation.z = (i % 2 ? 1 : -1) * 0.04
    g.add(tooth)
  }

  const armMat = plastic(color, 0.34)
  for (const x of [-2.85, 2.85]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.28, 1.05), armMat)
    arm.position.set(x, 0.62, 0.40)
    g.add(arm)
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.58, 24), armMat)
    pin.position.set(x, 0.62, 0.82)
    g.add(pin)
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.025, 7, 24), armMat)
    collar.rotation.x = Math.PI / 2
    collar.position.set(x, 0.92, 0.82)
    g.add(collar)
  }
  return g
}

function createShockBody(color) {
  const g = root('shock-body-5', color)
  const bodyMat = plastic(color, 0.34)
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.44, 2.35, 32), bodyMat)
  shell.position.y = 1.55
  g.add(shell)

  const lowerEye = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.10, 10, 32), bodyMat)
  lowerEye.position.set(0, 0.32, 0)
  g.add(lowerEye)
  const lowerBore = new THREE.Mesh(new THREE.CylinderGeometry(0.225, 0.225, 0.32, 26, 1, true), dark())
  lowerBore.rotation.x = Math.PI / 2
  lowerBore.position.set(0, 0.32, 0)
  g.add(lowerBore)

  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.47, 0.20, 32), bodyMat)
  collar.position.y = 2.72
  g.add(collar)
  const bore = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 2.30, 24), dark())
  bore.position.y = 1.65
  g.add(bore)
  return g
}

function createShockRod(color) {
  const g = root('shock-rod-5', color)
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 2.55, 24), metal())
  rod.position.y = 1.55
  g.add(rod)

  const springMat = plastic(color, 0.38)
  const spring = new THREE.Mesh(new THREE.TorusKnotGeometry(0.32, 0.055, 88, 10, 2, 9), springMat)
  spring.scale.set(0.85, 0.85, 1.65)
  spring.rotation.x = Math.PI / 2
  spring.position.y = 1.45
  g.add(spring)

  const topEye = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.10, 10, 32), springMat)
  topEye.position.set(0, 2.88, 0)
  g.add(topEye)
  const topBore = new THREE.Mesh(new THREE.CylinderGeometry(0.225, 0.225, 0.32, 26, 1, true), dark())
  topBore.rotation.x = Math.PI / 2
  topBore.position.set(0, 2.88, 0)
  g.add(topBore)
  return g
}

installPart(PARTS, {
  identity: {
    id: 'steering-rack-guide',
    name: 'Steering Rack Guide',
    category: 'Steering',
    icon: '▭',
    description: 'Chassis-mounted linear guide for the moving steering rack',
  },
  visual: { defaultColor: 0x59626c, family: 'steering-rack-guide' },
  mechanics: { steeringRackGuide: { railConnectorId: 'rail' } },
  connectors: [
    { id: 'rail', type: 'slider-rail', position: [0, 0.62, 0], axis: [1, 0, 0] },
    ...[-2.5, -1.5, 1.5, 2.5].flatMap((x, xi) => [-0.5, 0.5].map((z, zi) => ({
      id: `mount-${xi}-${zi}`,
      type: 'tube',
      position: [x, 0, z],
      axis: [0, -1, 0],
    }))),
  ],
  tags: ['steering', 'rack', 'guide', 'slider', 'parts4'],
  create: createRackGuide,
})

installPart(PARTS, {
  identity: {
    id: 'steering-rack-7',
    name: 'Steering Rack 7L',
    category: 'Steering',
    icon: '↔',
    description: 'Moving 7L steering rack with left/right tie-rod pins',
  },
  visual: { defaultColor: 0xadb5bd, family: 'steering-rack' },
  mechanics: {
    steeringRack: {
      sliderConnectorId: 'slider',
      leftConnectorId: 'tie-left',
      rightConnectorId: 'tie-right',
      maxTravelStud: 1.0,
      stiffness: 4.0,
      damping: 0.42,
    },
  },
  connectors: [
    { id: 'slider', type: 'slider', position: [0, 0.62, 0], axis: [1, 0, 0] },
    { id: 'tie-left', type: 'pin', position: [-2.85, 0.62, 0.82], axis: [0, 1, 0] },
    { id: 'tie-right', type: 'pin', position: [2.85, 0.62, 0.82], axis: [0, 1, 0] },
  ],
  tags: ['steering', 'rack', 'ackermann', 'tie-rod', 'slider', 'parts4'],
  create: createSteeringRack,
})

installPart(PARTS, {
  identity: {
    id: 'shock-body-5',
    name: 'Shock Absorber Body 5L',
    category: 'Steering',
    icon: '⇅',
    description: 'Lower damper body with a guided telescopic spring rail',
  },
  visual: { defaultColor: 0xd7263d, family: 'shock-body' },
  mechanics: {
    shockBody: {
      railConnectorId: 'rail',
      minTravelStud: -1.25,
      maxTravelStud: 0.25,
      springStiffness: 3.2,
      damping: 0.38,
      restTravelStud: 0,
    },
  },
  connectors: [
    { id: 'mount', type: 'pin-hole', position: [0, 0.32, 0], axis: [0, 0, 1] },
    { id: 'rail', type: 'slider-rail', position: [0, 2.65, 0], axis: [0, 1, 0] },
  ],
  tags: ['shock', 'absorber', 'spring', 'damper', 'suspension', 'parts4'],
  create: createShockBody,
})

installPart(PARTS, {
  identity: {
    id: 'shock-rod-5',
    name: 'Shock Absorber Rod 5L',
    category: 'Steering',
    icon: '⇵',
    description: 'Upper telescopic shock rod and spring section',
  },
  visual: { defaultColor: 0xf6c945, family: 'shock-rod' },
  mechanics: { shockRod: { sliderConnectorId: 'slider' } },
  connectors: [
    { id: 'slider', type: 'slider', position: [0, 0.32, 0], axis: [0, 1, 0] },
    { id: 'mount', type: 'pin-hole', position: [0, 2.88, 0], axis: [0, 0, 1] },
  ],
  tags: ['shock', 'absorber', 'spring', 'damper', 'suspension', 'parts4'],
  create: createShockRod,
})

globalThis.BrickLabParts4SteeringSuspension = Object.freeze({
  version: PARTS4_STEERING_SUSPENSION_VERSION,
  added: ['steering-rack-guide', 'steering-rack-7', 'shock-body-5', 'shock-rod-5'],
})
window.dispatchEvent(new CustomEvent('bricklab:partcatalogchange', {
  detail: { total: PARTS.length, pack: PARTS4_STEERING_SUSPENSION_VERSION },
}))
