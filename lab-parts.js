import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
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

function material(color, options = {}) {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: options.roughness ?? 0.4,
    metalness: options.metalness ?? 0.02,
    clearcoat: options.clearcoat ?? 0.1,
    clearcoatRoughness: 0.5,
  })
}

function darkMaterial() {
  return new THREE.MeshStandardMaterial({ color: 0x111315, roughness: 0.84, metalness: 0.04 })
}

function metalMaterial() {
  return new THREE.MeshStandardMaterial({ color: 0xaeb6bd, roughness: 0.3, metalness: 0.66 })
}

function roundedBox(width, height, depth, radius = 0.08) {
  return new RoundedBoxGeometry(width, height, depth, 3, Math.min(radius, width / 3, height / 3, depth / 3))
}

function addPart(definition) {
  if (!PARTS.some(part => part.id === definition.id)) PARTS.push(definition)
}

function crossShape(radius = 0.19, arm = 0.078) {
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

function addCrossFace(group, x, y, z, side = 1, radius = 0.19) {
  const face = new THREE.Mesh(new THREE.ShapeGeometry(crossShape(radius, radius * 0.41)), darkMaterial())
  face.position.set(x, y, z)
  face.rotation.y = side * Math.PI / 2
  group.add(face)
}

function ringExtrusion(outerRadius, innerRadius, depth, color) {
  const shape = new THREE.Shape()
  shape.absarc(0, 0, outerRadius, 0, Math.PI * 2, false)
  const hole = new THREE.Path()
  hole.absarc(0, 0, innerRadius, 0, Math.PI * 2, true)
  shape.holes.push(hole)
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSegments: 1, bevelSize: 0.015, bevelThickness: 0.015, curveSegments: 28 })
  geo.translate(0, 0, -depth / 2)
  return new THREE.Mesh(geo, material(color))
}

function createBearingBlock(color) {
  const g = new THREE.Group()
  g.userData.partId = 'bearing-block'
  g.userData.color = color
  const mat = material(color)

  const base = new THREE.Mesh(roundedBox(1.4, 0.28, 1.2, 0.08), mat)
  base.position.y = 0.14
  g.add(base)

  const leftPillar = new THREE.Mesh(roundedBox(0.3, 0.78, 1.12, 0.08), mat)
  leftPillar.position.set(-0.55, 0.61, 0)
  const rightPillar = leftPillar.clone()
  rightPillar.position.x = 0.55
  g.add(leftPillar, rightPillar)

  const bearingRing = ringExtrusion(0.44, 0.245, 1.34, color)
  bearingRing.rotation.y = Math.PI / 2
  bearingRing.position.set(0, 0.9, 0)
  g.add(bearingRing)

  const liner = new THREE.Mesh(new THREE.TorusGeometry(0.245, 0.045, 8, 32), darkMaterial())
  liner.rotation.y = Math.PI / 2
  liner.position.set(0.69, 0.9, 0)
  const linerBack = liner.clone()
  linerBack.position.x = -0.69
  g.add(liner, linerBack)

  for (const x of [-0.5, 0.5]) {
    for (const z of [-0.5, 0.5]) {
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.27, 0.1, 24), mat)
      foot.position.set(x, 0.04, z)
      g.add(foot)
    }
  }
  return g
}

function createSuspensionArm(color) {
  const g = new THREE.Group()
  g.userData.partId = 'suspension-arm-5'
  g.userData.color = color
  const mat = material(color)

  const upperRail = new THREE.Mesh(roundedBox(4.15, 0.14, 0.7, 0.06), mat)
  upperRail.position.set(0.45, 0.76, 0)
  const lowerRail = upperRail.clone()
  lowerRail.position.y = 0.14
  g.add(upperRail, lowerRail)

  for (const x of [-1, 0, 1, 2]) {
    const ring = ringExtrusion(0.38, 0.235, 0.74, color)
    ring.position.set(x, 0.45, 0)
    g.add(ring)
  }

  const pivotHub = new THREE.Mesh(new THREE.CylinderGeometry(0.39, 0.39, 0.76, 30), mat)
  pivotHub.rotation.x = Math.PI / 2
  pivotHub.position.set(-2, 0.45, 0)
  g.add(pivotHub)

  const pivot = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 1.14, 24), metalMaterial())
  pivot.rotation.x = Math.PI / 2
  pivot.position.set(-2, 0.45, 0)
  g.add(pivot)

  for (const z of [-0.5, 0.5]) {
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.035, 8, 24), metalMaterial())
    collar.position.set(-2, 0.45, z)
    g.add(collar)
  }
  return g
}

function createShaftSensor(id, color, accent) {
  const g = new THREE.Group()
  g.userData.partId = id
  g.userData.color = color

  const housingMat = material(color, { roughness: 0.34 })
  const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.56, 0.58, 36), housingMat)
  housing.rotation.z = Math.PI / 2
  housing.position.y = 0.55
  g.add(housing)

  const endCapGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.045, 32)
  for (const x of [-0.31, 0.31]) {
    const cap = new THREE.Mesh(endCapGeo, darkMaterial())
    cap.rotation.z = Math.PI / 2
    cap.position.set(x, 0.55, 0)
    g.add(cap)
    addCrossFace(g, x + Math.sign(x) * 0.026, 0.55, 0, 1, 0.19)
  }

  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.055, 8, 34), material(accent, { roughness: 0.3, clearcoat: 0.2 }))
  ring.rotation.y = Math.PI / 2
  ring.position.y = 0.55
  g.add(ring)

  const badge = new THREE.Mesh(roundedBox(0.22, 0.06, 0.52, 0.025), material(accent, { roughness: 0.3, clearcoat: 0.2 }))
  badge.position.set(0, 1.08, 0)
  g.add(badge)

  const status = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.55, roughness: 0.35 }))
  status.position.set(0, 0.9, 0.49)
  g.add(status)
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
  mechanics: { suspensionArm: { pivotConnectorId: 'pivot', restAngle: 0, stiffness: 7.5, damping: 1.25 } },
  connectors: [
    { id: 'pivot', type: 'pin', position: [-2, 0.45, 0], axis: [0, 0, 1] },
    { id: 'hole-1', type: 'pin-hole', position: [-1, 0.45, 0], axis: [0, 0, 1] },
    { id: 'hole-2', type: 'pin-hole', position: [0, 0.45, 0], axis: [0, 0, 1] },
    { id: 'hole-3', type: 'pin-hole', position: [1, 0.45, 0], axis: [0, 0, 1] },
    { id: 'hole-4', type: 'pin-hole', position: [2, 0.45, 0], axis: [0, 0, 1] },
  ],
  create: createSuspensionArm,
})

addPart({
  id: 'rpm-sensor',
  name: 'RPM Sensor',
  category: 'Power',
  icon: 'RPM',
  description: 'Inline shaft sensor for actual RPM history',
  defaultColor: 0x2f7f8f,
  mechanics: { shaft: true, sensor: { kind: 'rpm' } },
  connectors: [{ id: 'axle-hole', type: 'axle-hole', position: [0, 0.55, 0], axis: [1, 0, 0] }],
  create: color => createShaftSensor('rpm-sensor', color, 0x74e6a6),
})

addPart({
  id: 'torque-sensor',
  name: 'Torque Sensor',
  category: 'Power',
  icon: 'TQ',
  description: 'Inline shaft sensor for available torque telemetry',
  defaultColor: 0x8a6338,
  mechanics: { shaft: true, sensor: { kind: 'torque' } },
  connectors: [{ id: 'axle-hole', type: 'axle-hole', position: [0, 0.55, 0], axis: [1, 0, 0] }],
  create: color => createShaftSensor('torque-sensor', color, 0xffb65c),
})

document.getElementById('partSearch')?.dispatchEvent(new Event('input', { bubbles: true }))