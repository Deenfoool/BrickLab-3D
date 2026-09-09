import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { PARTS } from '../parts.js'
import { patchPart } from '../parts3/part-schema-v1.js'

export const PARTS5_DETAIL_REFINEMENT_VERSION = 'parts-5-detail-refinement-v3'

function absMaterial(color, roughness = 0.40) {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness,
    metalness: 0.008,
    clearcoat: 0.08,
    clearcoatRoughness: 0.52,
    ior: 1.47,
  })
}

function pomMaterial(color) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.39, metalness: 0.008 })
}

function darkMaterial() {
  return new THREE.MeshStandardMaterial({ color: 0x15181b, roughness: 0.86, metalness: 0.025 })
}

function metalMaterial(color = 0xb6bec6) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.28, metalness: 0.72 })
}

function root(id, color) {
  const group = new THREE.Group()
  group.userData.partId = id
  group.userData.color = color
  group.userData.visualVersion = PARTS5_DETAIL_REFINEMENT_VERSION
  return group
}

function visualOnly(object) {
  object.userData.physicsIgnore = true
  object.userData.parts5VisualDetail = true
  return object
}

function circleHole(x, y, radius) {
  const path = new THREE.Path()
  path.absarc(x, y, radius, 0, Math.PI * 2, true)
  return path
}

function crossPoints(radius = 0.198, arm = 0.080) {
  return [
    [-arm, radius], [arm, radius], [arm, arm], [radius, arm], [radius, -arm], [arm, -arm],
    [arm, -radius], [-arm, -radius], [-arm, -arm], [-radius, -arm], [-radius, arm], [-arm, arm],
  ]
}

function crossPath(radius = 0.198, arm = 0.080) {
  const path = new THREE.Path()
  const points = crossPoints(radius, arm)
  path.moveTo(...points[0])
  for (let i = 1; i < points.length; i += 1) path.lineTo(...points[i])
  path.closePath()
  return path
}

function crossShape(radius = 0.18, arm = 0.073) {
  const shape = new THREE.Shape()
  const points = crossPoints(radius, arm)
  shape.moveTo(...points[0])
  for (let i = 1; i < points.length; i += 1) shape.lineTo(...points[i])
  shape.closePath()
  return shape
}

function annulusShape(outer, inner) {
  const shape = new THREE.Shape()
  shape.absarc(0, 0, outer, 0, Math.PI * 2, false)
  shape.holes.push(circleHole(0, 0, inner))
  return shape
}

function crossBoreShape(outer) {
  const shape = new THREE.Shape()
  shape.absarc(0, 0, outer, 0, Math.PI * 2, false)
  shape.holes.push(crossPath())
  return shape
}

function roundedRectShape(width, height, radius) {
  const x = -width / 2
  const y = -height / 2
  const r = Math.min(radius, width / 2, height / 2)
  const shape = new THREE.Shape()
  shape.moveTo(x + r, y)
  shape.lineTo(x + width - r, y)
  shape.quadraticCurveTo(x + width, y, x + width, y + r)
  shape.lineTo(x + width, y + height - r)
  shape.quadraticCurveTo(x + width, y + height, x + width - r, y + height)
  shape.lineTo(x + r, y + height)
  shape.quadraticCurveTo(x, y + height, x, y + height - r)
  shape.lineTo(x, y + r)
  shape.quadraticCurveTo(x, y, x + r, y)
  shape.closePath()
  return shape
}

function extrudeShape(shape, depth, material, options = {}) {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: options.bevelEnabled ?? true,
    bevelSegments: options.bevelSegments ?? 3,
    bevelSize: options.bevelSize ?? 0.012,
    bevelThickness: options.bevelThickness ?? 0.012,
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

function orientFromZ(mesh, axis) {
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...axis).normalize())
  return mesh
}

function addBoreFinish(group, position, axis, depth, color, radius = 0.245) {
  const liner = visualOnly(new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.985, radius * 0.985, depth + 0.010, 32, 1, true),
    darkMaterial(),
  ))
  liner.rotation.x = Math.PI / 2
  orientFromZ(liner, axis)
  liner.position.fromArray(position)
  group.add(liner)

  const lipGeometry = new THREE.TorusGeometry(radius + 0.006, 0.012, 6, 32)
  for (const side of [-1, 1]) {
    const lip = visualOnly(new THREE.Mesh(lipGeometry, absMaterial(color, 0.44)))
    orientFromZ(lip, axis)
    const normal = new THREE.Vector3(...axis).normalize()
    lip.position.fromArray(position).addScaledVector(normal, side * (depth / 2 + 0.008))
    group.add(lip)
  }
}

function setExplicitCollider(part, specs) {
  part.physics = {
    ...(part.physics ?? {}),
    colliderProfile: {
      version: 'parts-5-explicit-v1',
      specs: specs.map(spec => ({ ...spec })),
    },
  }
}

function bentBeamOutline(points, half = 0.44) {
  const minY = Math.min(...points.map(([x, y]) => y))
  const maxY = Math.max(...points.map(([x, y]) => y))
  const horizontal = points.filter(([, y]) => Math.abs(y - minY) < 1e-5)
  const minX = Math.min(...horizontal.map(([x]) => x))
  const maxX = Math.max(...horizontal.map(([x]) => x))
  const verticalX = points.reduce((best, [x]) => x > best ? x : best, -Infinity)

  const shape = new THREE.Shape()
  shape.moveTo(minX - half, minY - half)
  shape.lineTo(maxX + half, minY - half)
  shape.lineTo(verticalX + half, maxY + half)
  shape.lineTo(verticalX - half, maxY + half)
  shape.lineTo(verticalX - half, minY + half)
  shape.lineTo(minX - half, minY + half)
  shape.closePath()
  for (const [x, y] of points) shape.holes.push(circleHole(x, y, 0.245))
  return shape
}

function createBentBeamRefined(part, color) {
  const points = part.connectors.filter(connector => connector.type === 'pin-hole').map(connector => [connector.position[0], connector.position[1]])
  const group = root(part.id, color)
  const depth = 0.78
  const material = absMaterial(color, 0.40)
  const body = extrudeShape(bentBeamOutline(points), depth, material, {
    bevelSegments: 4,
    bevelSize: 0.018,
    bevelThickness: 0.018,
  })
  group.add(body)
  for (const connector of part.connectors.filter(item => item.type === 'pin-hole')) {
    addBoreFinish(group, connector.position, connector.axis, depth, color)
  }
  return group
}

function bentBeamCollider(part) {
  const points = part.connectors.filter(connector => connector.type === 'pin-hole').map(connector => connector.position)
  const minY = Math.min(...points.map(point => point[1]))
  const maxY = Math.max(...points.map(point => point[1]))
  const low = points.filter(point => Math.abs(point[1] - minY) < 1e-5)
  const minX = Math.min(...low.map(point => point[0]))
  const maxX = Math.max(...low.map(point => point[0]))
  const verticalX = Math.max(...points.map(point => point[0]))
  return [
    { type: 'box', center: [(minX + maxX) / 2, minY, 0], size: [maxX - minX + 0.88, 0.38, 0.72] },
    { type: 'box', center: [verticalX, (minY + maxY) / 2, 0], size: [0.38, maxY - minY + 0.88, 0.72] },
  ]
}

function addPinRibs(group, length, material, friction) {
  if (!friction) return
  const ribGeometry = new RoundedBoxGeometry(0.045, 0.045, Math.max(0.18, length * 0.24), 2, 0.012)
  for (const side of [-1, 1]) {
    const z = side * length * 0.31
    for (let i = 0; i < 4; i += 1) {
      const angle = i * Math.PI / 2
      const rib = new THREE.Mesh(ribGeometry, material)
      rib.position.set(Math.cos(angle) * 0.166, 0.28 + Math.sin(angle) * 0.166, z)
      rib.rotation.z = angle
      group.add(rib)
    }
  }
}

function createPinRefined(part, color, length, friction) {
  const group = root(part.id, color)
  const material = pomMaterial(color)
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.164, 0.164, Math.max(0.20, length - 0.20), 36), material)
  core.rotation.x = Math.PI / 2
  core.position.y = 0.28
  group.add(core)

  for (const side of [-1, 1]) {
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.142, 0.170, 0.20, 36), material)
    tip.rotation.x = Math.PI / 2
    tip.position.set(0, 0.28, side * (length / 2 - 0.10))
    group.add(tip)

    const slit = visualOnly(new THREE.Mesh(new RoundedBoxGeometry(0.050, 0.12, 0.012, 2, 0.008), darkMaterial()))
    slit.position.set(0, 0.28, side * (length / 2 + 0.007))
    group.add(slit)
  }

  const collar = new THREE.Mesh(new THREE.CylinderGeometry(friction ? 0.263 : 0.235, friction ? 0.263 : 0.235, 0.13, 40), material)
  collar.rotation.x = Math.PI / 2
  collar.position.y = 0.28
  group.add(collar)

  addPinRibs(group, length, material, friction)
  if (friction) {
    for (const z of [-length * 0.31, length * 0.31]) {
      const ridge = new THREE.Mesh(new THREE.TorusGeometry(0.172, 0.019, 8, 32), material)
      ridge.position.set(0, 0.28, z)
      group.add(ridge)
    }
  }
  return group
}

function createAxlePinRefined(part, color) {
  const group = root(part.id, color)
  const material = pomMaterial(color)

  const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.164, 0.164, 0.92, 36), material)
  pin.rotation.x = Math.PI / 2
  pin.position.set(0, 0.30, -0.48)
  group.add(pin)

  const axleGeometry = new THREE.ExtrudeGeometry(crossShape(), {
    depth: 0.94,
    bevelEnabled: true,
    bevelSegments: 3,
    bevelSize: 0.010,
    bevelThickness: 0.018,
  })
  axleGeometry.translate(0, 0, 0)
  const axle = new THREE.Mesh(axleGeometry, material)
  axle.position.set(0, 0.30, 0.01)
  group.add(axle)

  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.268, 0.268, 0.13, 40), material)
  collar.rotation.x = Math.PI / 2
  collar.position.set(0, 0.30, 0)
  group.add(collar)

  const ribGeometry = new RoundedBoxGeometry(0.045, 0.045, 0.28, 2, 0.012)
  for (let i = 0; i < 4; i += 1) {
    const a = i * Math.PI / 2
    const rib = new THREE.Mesh(ribGeometry, material)
    rib.position.set(Math.cos(a) * 0.166, 0.30 + Math.sin(a) * 0.166, -0.58)
    rib.rotation.z = a
    group.add(rib)
  }
  return group
}

function createTripleConnectorRefined(part, color) {
  const group = root(part.id, color)
  const shape = roundedRectShape(2.88, 0.88, 0.42)
  for (const connector of part.connectors) shape.holes.push(circleHole(connector.position[0], 0, 0.245))
  const body = extrudeShape(shape, 0.78, absMaterial(color, 0.41), { bevelSegments: 4, bevelSize: 0.018, bevelThickness: 0.018 })
  body.position.y = 0.45
  group.add(body)
  for (const connector of part.connectors) addBoreFinish(group, connector.position, connector.axis, 0.78, color)
  return group
}

function createPerpendicularConnectorRefined(part, color) {
  const group = root(part.id, color)
  const material = absMaterial(color, 0.41)
  const axleBoss = extrudeAlongX(crossBoreShape(0.38), 1.38, material, { bevelSegments: 3, bevelSize: 0.012, bevelThickness: 0.012 })
  axleBoss.position.y = 0.42
  group.add(axleBoss)

  const pinBoss = extrudeShape(annulusShape(0.36, 0.245), 0.94, material, { bevelSegments: 3, bevelSize: 0.012, bevelThickness: 0.012 })
  pinBoss.position.y = 0.42
  group.add(pinBoss)

  const web = new THREE.Mesh(new RoundedBoxGeometry(0.62, 0.62, 0.52, 4, 0.16), material)
  web.position.y = 0.42
  group.add(web)
  return group
}

function createAngleConnectorRefined(part, color) {
  const group = root(part.id, color)
  const material = absMaterial(color, 0.41)
  const a = part.connectors.find(connector => connector.id === 'hole-a')
  const b = part.connectors.find(connector => connector.id === 'hole-b')

  const ringA = extrudeShape(annulusShape(0.36, 0.245), 0.62, material, { bevelSegments: 3, bevelSize: 0.012, bevelThickness: 0.012 })
  ringA.position.fromArray(a.position)
  group.add(ringA)

  const ringB = extrudeShape(annulusShape(0.36, 0.245), 0.62, material, { bevelSegments: 3, bevelSize: 0.012, bevelThickness: 0.012 })
  orientFromZ(ringB, b.axis)
  ringB.position.fromArray(b.position)
  group.add(ringB)

  const web = new THREE.Mesh(new RoundedBoxGeometry(0.76, 0.48, 0.48, 4, 0.13), material)
  web.position.set(0, 0.42, 0)
  web.rotation.z = -0.28
  group.add(web)
  return group
}

function createBearingBlockRefined(part, color) {
  const group = root(part.id, color)
  const material = absMaterial(color, 0.43)
  const base = new THREE.Mesh(new RoundedBoxGeometry(1.42, 0.24, 1.20, 4, 0.09), material)
  base.position.y = 0.12
  group.add(base)

  for (const x of [-0.54, 0.54]) {
    const pillar = new THREE.Mesh(new RoundedBoxGeometry(0.32, 0.92, 1.10, 4, 0.10), material)
    pillar.position.set(x, 0.60, 0)
    group.add(pillar)
  }

  const bearing = extrudeAlongX(annulusShape(0.45, 0.245), 1.34, material, { bevelSegments: 4, bevelSize: 0.014, bevelThickness: 0.014 })
  bearing.position.y = 0.90
  group.add(bearing)

  const liner = visualOnly(extrudeAlongX(annulusShape(0.285, 0.245), 1.39, darkMaterial(), { bevelEnabled: false }))
  liner.position.y = 0.90
  group.add(liner)
  return group
}

function createSuspensionArmRefined(part, color) {
  const group = root(part.id, color)
  const material = absMaterial(color, 0.42)
  const holeConnectors = part.connectors.filter(connector => connector.type === 'pin-hole')
  const shape = roundedRectShape(4.86, 0.88, 0.40)
  for (const connector of holeConnectors) shape.holes.push(circleHole(connector.position[0] - 0.08, 0, 0.245))
  const body = extrudeShape(shape, 0.70, material, { bevelSegments: 4, bevelSize: 0.016, bevelThickness: 0.016 })
  body.position.set(0.08, 0.45, 0)
  group.add(body)

  const pivot = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.34, 0.98, 36), material)
  pivot.rotation.x = Math.PI / 2
  pivot.position.set(-2, 0.45, 0)
  group.add(pivot)
  const pivotPin = new THREE.Mesh(new THREE.CylinderGeometry(0.166, 0.166, 1.12, 30), metalMaterial())
  pivotPin.rotation.x = Math.PI / 2
  pivotPin.position.set(-2, 0.45, 0)
  group.add(pivotPin)
  for (const connector of holeConnectors) addBoreFinish(group, connector.position, connector.axis, 0.70, color)
  return group
}

function createMotorRefined(part, color) {
  const group = root(part.id, color)
  const shell = absMaterial(color, 0.40)
  const body = new THREE.Mesh(new RoundedBoxGeometry(2.82, 1.72, 2.02, 5, 0.20), shell)
  body.position.y = 0.88
  group.add(body)

  const seam = visualOnly(new THREE.Mesh(new THREE.BoxGeometry(0.025, 1.45, 2.04), darkMaterial()))
  seam.position.set(-0.24, 0.88, 0)
  group.add(seam)

  const endBell = extrudeAlongX(annulusShape(0.72, 0.31), 0.18, darkMaterial(), { bevelSegments: 3, bevelSize: 0.010, bevelThickness: 0.010 })
  endBell.position.set(1.45, 0.90, 0)
  group.add(endBell)

  const bearing = extrudeAlongX(annulusShape(0.33, 0.205), 0.22, metalMaterial(), { bevelSegments: 2, bevelSize: 0.006, bevelThickness: 0.006 })
  bearing.position.set(1.58, 0.90, 0)
  group.add(bearing)

  const shaftGeometry = new THREE.ExtrudeGeometry(crossShape(0.16, 0.065), { depth: 0.52, bevelEnabled: true, bevelSegments: 2, bevelSize: 0.008, bevelThickness: 0.012 })
  shaftGeometry.center()
  shaftGeometry.rotateY(Math.PI / 2)
  const shaft = new THREE.Mesh(shaftGeometry, metalMaterial())
  shaft.position.set(1.86, 0.90, 0)
  group.add(shaft)

  for (let i = -2; i <= 2; i += 1) {
    const rib = new THREE.Mesh(new RoundedBoxGeometry(0.08, 0.82, 0.12, 2, 0.025), darkMaterial())
    rib.position.set(-0.72 + i * 0.28, 0.90, 0.99)
    group.add(rib)
  }

  for (const x of [-0.58, 0.58]) for (const z of [-0.58, 0.58]) {
    const mount = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.29, 0.12, 28), shell)
    mount.position.set(x, 0.06, z)
    group.add(mount)
  }
  return group
}

function createGearboxRefined(part, color) {
  const group = root(part.id, color)
  const shell = absMaterial(color, 0.42)
  const body = new THREE.Mesh(new RoundedBoxGeometry(3.12, 1.62, 2.12, 5, 0.19), shell)
  body.position.y = 0.84
  group.add(body)

  const seam = visualOnly(new THREE.Mesh(new THREE.BoxGeometry(3.14, 0.035, 2.14), darkMaterial()))
  seam.position.y = 0.95
  group.add(seam)

  for (const x of [-1.58, 1.58]) {
    const carrier = extrudeAlongX(crossBoreShape(0.42), 0.20, shell, { bevelSegments: 3, bevelSize: 0.010, bevelThickness: 0.010 })
    carrier.position.set(x, 0.88, 0)
    group.add(carrier)
  }

  for (const z of [-0.82, 0.82]) {
    for (const x of [-0.92, 0, 0.92]) {
      const rib = new THREE.Mesh(new RoundedBoxGeometry(0.10, 1.18, 0.10, 2, 0.025), shell)
      rib.position.set(x, 0.82, z)
      group.add(rib)
    }
  }

  const gate = new THREE.Mesh(new RoundedBoxGeometry(0.92, 0.08, 0.52, 3, 0.035), darkMaterial())
  gate.position.set(0, 1.68, 0)
  group.add(gate)
  const lever = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.52, 20), metalMaterial())
  lever.position.set(0, 1.96, 0)
  lever.rotation.z = 0.20
  group.add(lever)
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.15, 24, 16), absMaterial(0x74e6a6, 0.38))
  knob.position.set(0.10, 2.20, 0)
  group.add(knob)
  return group
}

function createDifferentialRefined(part, color) {
  const group = root(part.id, color)
  const shell = absMaterial(color, 0.43)
  const metal = metalMaterial()

  const carrier = new THREE.Mesh(new THREE.SphereGeometry(0.98, 52, 32), shell)
  carrier.scale.set(1.20, 0.96, 0.96)
  carrier.position.y = 1.00
  group.add(carrier)

  const waist = extrudeAlongX(annulusShape(1.02, 0.90), 0.16, darkMaterial(), { bevelSegments: 2, bevelSize: 0.008, bevelThickness: 0.008 })
  waist.position.y = 1.00
  group.add(waist)

  for (const x of [-0.92, 0.92]) {
    const cover = extrudeAlongX(crossBoreShape(0.44), 0.24, shell, { bevelSegments: 3, bevelSize: 0.010, bevelThickness: 0.010 })
    cover.position.set(x, 1.00, 0)
    group.add(cover)
    const bearing = visualOnly(extrudeAlongX(annulusShape(0.285, 0.205), 0.10, metal, { bevelEnabled: false }))
    bearing.position.set(x + Math.sign(x) * 0.13, 1.00, 0)
    group.add(bearing)
  }

  const inputBoss = extrudeShape(crossBoreShape(0.43), 0.34, shell, { bevelSegments: 3, bevelSize: 0.010, bevelThickness: 0.010 })
  inputBoss.position.set(0, 1.00, 1.02)
  group.add(inputBoss)

  for (let i = 0; i < 10; i += 1) {
    const angle = i / 10 * Math.PI * 2
    const bolt = visualOnly(new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.045, 12), metal))
    bolt.rotation.z = Math.PI / 2
    bolt.position.set(0.61, 1 + Math.cos(angle) * 0.74, Math.sin(angle) * 0.74)
    group.add(bolt)
  }
  return group
}

const upgraded = []

for (const id of ['beam-l-3x3', 'beam-angle-4x2']) {
  const part = PARTS.find(item => item.id === id)
  if (!part) continue
  patchPart(PARTS, id, { create: color => createBentBeamRefined(part, color), visualQuality: 'parts-5-continuous-bent-liftarm-v3' })
  setExplicitCollider(part, bentBeamCollider(part))
  upgraded.push(id)
}

for (const [id, length, friction] of [
  ['pin', 2.0, true],
  ['pin-half', 0.9, true],
  ['pin-long', 3.0, true],
  ['pin-frictionless', 2.0, false],
]) {
  const part = PARTS.find(item => item.id === id)
  if (!part) continue
  patchPart(PARTS, id, { create: color => createPinRefined(part, color, length, friction), visualQuality: friction ? 'parts-5-molded-friction-pin-v3' : 'parts-5-smooth-hinge-pin-v3' })
  setExplicitCollider(part, [{ type: 'cylinder-z', center: [0, 0.28, 0], radius: friction ? 0.178 : 0.168, halfLength: length / 2 }])
  upgraded.push(id)
}

for (const [id, factory, quality, colliderSpecs] of [
  ['axle-pin', createAxlePinRefined, 'parts-5-hybrid-axle-pin-v3', [{ type: 'cylinder-z', center: [0, 0.30, 0], radius: 0.19, halfLength: 0.98 }]],
  ['connector-triple', createTripleConnectorRefined, 'parts-5-true-hole-triple-v3', null],
  ['connector-perpendicular', createPerpendicularConnectorRefined, 'parts-5-orthogonal-boss-v3', [
    { type: 'cylinder-x', center: [0, 0.42, 0], radius: 0.38, halfLength: 0.69 },
    { type: 'cylinder-z', center: [0, 0.42, 0], radius: 0.36, halfLength: 0.47 },
  ]],
  ['connector-angle', createAngleConnectorRefined, 'parts-5-angle-boss-v3', [
    { type: 'cylinder-z', center: [-0.45, 0.42, 0], radius: 0.36, halfLength: 0.31 },
    { type: 'cylinder-y', center: [0.45, 0.42, 0], radius: 0.36, halfLength: 0.31 },
    { type: 'box', center: [0, 0.42, 0], size: [0.78, 0.44, 0.44] },
  ]],
  ['bearing-block', createBearingBlockRefined, 'parts-5-open-bearing-block-v3', [
    { type: 'box', center: [0, 0.12, 0], size: [1.42, 0.24, 1.20] },
    { type: 'box', center: [-0.54, 0.60, 0], size: [0.32, 0.92, 1.10] },
    { type: 'box', center: [0.54, 0.60, 0], size: [0.32, 0.92, 1.10] },
  ]],
  ['suspension-arm-5', createSuspensionArmRefined, 'parts-5-forged-suspension-arm-v3', [
    { type: 'box', center: [0.08, 0.45, 0], size: [4.86, 0.70, 0.70] },
    { type: 'cylinder-z', center: [-2, 0.45, 0], radius: 0.34, halfLength: 0.49 },
  ]],
  ['motor', createMotorRefined, 'parts-5-motor-shell-v3', [{ type: 'box', center: [0, 0.88, 0], size: [2.82, 1.72, 2.02] }]],
  ['gearbox-fnr', createGearboxRefined, 'parts-5-gearbox-shell-v3', [{ type: 'box', center: [0, 0.84, 0], size: [3.12, 1.62, 2.12] }]],
  ['open-differential', createDifferentialRefined, 'parts-5-differential-carrier-v3', [
    { type: 'cylinder-x', center: [0, 1.00, 0], radius: 0.94, halfLength: 0.93 },
    { type: 'cylinder-z', center: [0, 1.00, 0.96], radius: 0.42, halfLength: 0.26 },
  ]],
]) {
  const part = PARTS.find(item => item.id === id)
  if (!part) continue
  patchPart(PARTS, id, { create: color => factory(part, color), visualQuality: quality })
  if (colliderSpecs) setExplicitCollider(part, colliderSpecs)
  upgraded.push(id)
}

globalThis.BrickLabParts5DetailRefinement = Object.freeze({
  version: PARTS5_DETAIL_REFINEMENT_VERSION,
  upgraded: [...new Set(upgraded)],
  colliderProfile: 'explicit geometry-independent proxies for visually complex parts',
})

window.dispatchEvent(new CustomEvent('bricklab:partcatalogchange', {
  detail: { total: PARTS.length, pack: PARTS5_DETAIL_REFINEMENT_VERSION },
}))
