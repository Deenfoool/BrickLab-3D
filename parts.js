import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'

const BRICK_HEIGHT = 1.2
const PLATE_HEIGHT = 0.4

function material(color, options = {}) {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: options.roughness ?? 0.38,
    metalness: options.metalness ?? 0.02,
    clearcoat: options.clearcoat ?? 0.12,
    clearcoatRoughness: options.clearcoatRoughness ?? 0.5,
  })
}

function rubberMaterial() {
  return new THREE.MeshStandardMaterial({ color: 0x17191b, roughness: 0.96, metalness: 0 })
}

function darkMaterial() {
  return new THREE.MeshStandardMaterial({ color: 0x111315, roughness: 0.82, metalness: 0.04 })
}

function metalMaterial(color = 0xb7bdc4) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.68 })
}

function roundedBox(width, height, depth, radius = 0.08, segments = 3) {
  return new RoundedBoxGeometry(width, height, depth, segments, Math.min(radius, width / 3, height / 3, depth / 3))
}

function group(partId, color) {
  const g = new THREE.Group()
  g.userData.partId = partId
  g.userData.color = color
  return g
}

function brickConnectors(width, depth, height) {
  const connectors = []
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

function beamConnectors(length) {
  return Array.from({ length }, (_, i) => ({
    id: `hole-${i}`,
    type: 'pin-hole',
    position: [i - (length - 1) / 2, 0.45, 0],
    axis: [0, 0, 1],
  }))
}

function axleConnectors(length) {
  return Array.from({ length }, (_, i) => ({
    id: `axle-${i}`,
    type: 'axle',
    position: [i - (length - 1) / 2, 0.32, 0],
    axis: [1, 0, 0],
  }))
}

function bottomTubeMounts(width = 2, depth = 2, y = 0) {
  const mounts = []
  for (let x = 0; x < width; x += 1) {
    for (let z = 0; z < depth; z += 1) {
      mounts.push({
        id: `mount-${x}-${z}`,
        type: 'tube',
        position: [x - (width - 1) / 2, y, z - (depth - 1) / 2],
        axis: [0, -1, 0],
      })
    }
  }
  return mounts
}

function motorConnectors() {
  return [
    { id: 'output', type: 'axle', position: [1.75, 0.9, 0], axis: [1, 0, 0] },
    ...bottomTubeMounts(2, 2),
  ]
}

function crossPoints(radius = 0.22, arm = 0.09) {
  return [
    [-arm, radius], [arm, radius], [arm, arm], [radius, arm],
    [radius, -arm], [arm, -arm], [arm, -radius], [-arm, -radius],
    [-arm, -arm], [-radius, -arm], [-radius, arm], [-arm, arm],
  ]
}

function crossPath(radius = 0.22, arm = 0.09) {
  const path = new THREE.Path()
  const points = crossPoints(radius, arm)
  path.moveTo(points[0][0], points[0][1])
  for (let i = 1; i < points.length; i += 1) path.lineTo(points[i][0], points[i][1])
  path.closePath()
  return path
}

function crossShape(radius = 0.22, arm = 0.09) {
  const shape = new THREE.Shape()
  const points = crossPoints(radius, arm)
  shape.moveTo(points[0][0], points[0][1])
  for (let i = 1; i < points.length; i += 1) shape.lineTo(points[i][0], points[i][1])
  shape.closePath()
  return shape
}

function addCrossFace(g, position, rotation, radius = 0.2) {
  const geo = new THREE.ShapeGeometry(crossShape(radius, radius * 0.42))
  const face = new THREE.Mesh(geo, darkMaterial())
  face.position.copy(position)
  face.rotation.copy(rotation)
  g.add(face)
}

function addStuds(g, width, depth, y, color) {
  const mat = material(color)
  const studGeo = new THREE.CylinderGeometry(0.295, 0.305, 0.18, 32)
  const lipGeo = new THREE.TorusGeometry(0.245, 0.018, 6, 28)
  for (let x = 0; x < width; x += 1) {
    for (let z = 0; z < depth; z += 1) {
      const px = x - (width - 1) / 2
      const pz = z - (depth - 1) / 2
      const stud = new THREE.Mesh(studGeo, mat)
      stud.position.set(px, y, pz)
      const lip = new THREE.Mesh(lipGeo, mat)
      lip.rotation.x = Math.PI / 2
      lip.position.set(px, y + 0.091, pz)
      g.add(stud, lip)
    }
  }
}

function addUndersideTubes(g, width, depth, height) {
  if (height < 0.55) return
  const ringGeo = new THREE.TorusGeometry(0.255, 0.045, 8, 28)
  const ringMat = darkMaterial()
  for (let x = 0; x < width; x += 1) {
    for (let z = 0; z < depth; z += 1) {
      const ring = new THREE.Mesh(ringGeo, ringMat)
      ring.rotation.x = Math.PI / 2
      ring.position.set(x - (width - 1) / 2, 0.018, z - (depth - 1) / 2)
      g.add(ring)
    }
  }
}

function createBrick(id, width, depth, height, color) {
  const g = group(id, color)
  const body = new THREE.Mesh(roundedBox(width - 0.08, height, depth - 0.08, Math.min(0.09, height * 0.18), 4), material(color))
  body.position.y = height / 2
  g.add(body)
  addStuds(g, width, depth, height + 0.09, color)
  addUndersideTubes(g, width, depth, height)
  return g
}

function technicBrickConnectors(length) {
  const connectors = []
  for (let i = 0; i < length; i += 1) {
    const x = i - (length - 1) / 2
    connectors.push({ id: `stud-${i}`, type: 'stud', position: [x, BRICK_HEIGHT, 0], axis: [0, 1, 0] })
    connectors.push({ id: `tube-${i}`, type: 'tube', position: [x, 0, 0], axis: [0, -1, 0] })
  }
  for (let i = 0; i < length - 1; i += 1) {
    connectors.push({
      id: `side-hole-${i}`,
      type: 'pin-hole',
      position: [i - (length - 2) / 2, BRICK_HEIGHT / 2, 0],
      axis: [0, 0, 1],
    })
  }
  return connectors
}

function ringExtrusion(outerRadius, innerRadius, depth, color) {
  const shape = new THREE.Shape()
  shape.absarc(0, 0, outerRadius, 0, Math.PI * 2, false)
  const hole = new THREE.Path()
  hole.absarc(0, 0, innerRadius, 0, Math.PI * 2, true)
  shape.holes.push(hole)
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 24 })
  geo.translate(0, 0, -depth / 2)
  return new THREE.Mesh(geo, material(color))
}

function createTechnicBrick(id, length, color) {
  const g = group(id, color)
  const mat = material(color)
  const width = length - 0.08
  const depth = 0.88
  const topRail = new THREE.Mesh(roundedBox(width, 0.3, depth, 0.08, 3), mat)
  topRail.position.y = 1.0
  const bottomRail = new THREE.Mesh(roundedBox(width, 0.3, depth, 0.08, 3), mat)
  bottomRail.position.y = 0.2
  const leftEnd = new THREE.Mesh(roundedBox(0.34, 0.72, depth, 0.08, 3), mat)
  const rightEnd = leftEnd.clone()
  leftEnd.position.set(-(length - 1) / 2 - 0.48, 0.6, 0)
  rightEnd.position.set((length - 1) / 2 + 0.48, 0.6, 0)
  g.add(topRail, bottomRail, leftEnd, rightEnd)
  addStuds(g, length, 1, BRICK_HEIGHT + 0.09, color)

  for (let i = 0; i < length - 1; i += 1) {
    const ring = ringExtrusion(0.33, 0.225, depth + 0.035, color)
    ring.position.set(i - (length - 2) / 2, BRICK_HEIGHT / 2, 0)
    g.add(ring)
  }
  return g
}

function createBeam(id, length, color) {
  const g = group(id, color)
  const mat = material(color)
  const depth = 0.78
  const width = length - 0.12

  const upperRail = new THREE.Mesh(roundedBox(width, 0.16, depth, 0.07, 3), mat)
  upperRail.position.y = 0.81
  const lowerRail = new THREE.Mesh(roundedBox(width, 0.16, depth, 0.07, 3), mat)
  lowerRail.position.y = 0.09
  g.add(upperRail, lowerRail)

  for (let i = 0; i < length; i += 1) {
    const ring = ringExtrusion(0.41, 0.245, depth + 0.03, color)
    ring.position.set(i - (length - 1) / 2, 0.45, 0)
    g.add(ring)
  }
  return g
}

function createAxle(id, length, color) {
  const g = group(id, color)
  const shape = crossShape(0.18, 0.075)
  const geo = new THREE.ExtrudeGeometry(shape, { depth: length, bevelEnabled: false })
  geo.center()
  geo.rotateY(Math.PI / 2)
  const shaft = new THREE.Mesh(geo, material(color, { roughness: 0.32 }))
  shaft.position.y = 0.32
  g.add(shaft)

  const capGeo = new THREE.ShapeGeometry(crossShape(0.18, 0.075))
  for (const x of [-length / 2 - 0.001, length / 2 + 0.001]) {
    const cap = new THREE.Mesh(capGeo, material(color, { roughness: 0.3 }))
    cap.rotation.y = Math.PI / 2
    cap.position.set(x, 0.32, 0)
    g.add(cap)
  }
  return g
}

function createAxleCoupler(id, color) {
  const g = group(id, color)
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.39, 0.39, 1.5, 32), material(color))
  body.rotation.z = Math.PI / 2
  body.position.y = 0.38
  g.add(body)

  const collarGeo = new THREE.TorusGeometry(0.31, 0.035, 8, 32)
  for (const x of [-0.72, 0.72]) {
    const collar = new THREE.Mesh(collarGeo, material(color))
    collar.rotation.y = Math.PI / 2
    collar.position.set(x, 0.38, 0)
    g.add(collar)
    addCrossFace(g, new THREE.Vector3(x + Math.sign(x) * 0.035, 0.38, 0), new THREE.Euler(0, Math.PI / 2, 0), 0.2)
  }
  return g
}

function createPin(id, color) {
  const g = group(id, color)
  const mat = material(color, { roughness: 0.4 })
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 2, 24), mat)
  core.rotation.x = Math.PI / 2
  core.position.y = 0.28
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.16, 28), mat)
  collar.rotation.x = Math.PI / 2
  collar.position.y = 0.28
  g.add(core, collar)

  for (const z of [-0.72, 0.72]) {
    const ridge = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.026, 6, 22), mat)
    ridge.position.set(0, 0.28, z)
    g.add(ridge)
  }
  return g
}

function gearPitchRadius(teeth) {
  return teeth / 16
}

function createGear(id, teeth, color) {
  const g = group(id, color)
  const pitch = gearPitchRadius(teeth)
  const outer = pitch * 1.12
  const root = pitch * 0.88
  const shoulder = pitch * 1.025
  const shape = new THREE.Shape()

  for (let tooth = 0; tooth < teeth; tooth += 1) {
    const base = tooth / teeth * Math.PI * 2
    const points = [
      [base, root],
      [base + Math.PI * 0.34 / teeth, shoulder],
      [base + Math.PI * 0.68 / teeth, outer],
      [base + Math.PI * 1.32 / teeth, outer],
      [base + Math.PI * 1.66 / teeth, shoulder],
      [base + Math.PI * 2 / teeth, root],
    ]
    for (const [angle, r] of points) {
      const x = Math.cos(angle) * r
      const y = Math.sin(angle) * r
      if (tooth === 0 && angle === base) shape.moveTo(x, y)
      else shape.lineTo(x, y)
    }
  }
  shape.closePath()
  shape.holes.push(crossPath(0.205, 0.082))

  if (teeth >= 24) {
    const holeRadius = pitch * 0.5
    for (let i = 0; i < 6; i += 1) {
      const angle = i / 6 * Math.PI * 2
      const hole = new THREE.Path()
      hole.absarc(Math.cos(angle) * holeRadius, Math.sin(angle) * holeRadius, 0.13, 0, Math.PI * 2, true)
      shape.holes.push(hole)
    }
  }

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.34,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.018,
    bevelThickness: 0.018,
    curveSegments: 24,
  })
  geo.center()
  const mesh = new THREE.Mesh(geo, material(color, { roughness: 0.34 }))
  mesh.rotation.x = Math.PI / 2
  mesh.position.y = 0.4
  g.add(mesh)

  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.42, 32), material(color))
  hub.position.y = 0.4
  g.add(hub)

  addCrossFace(g, new THREE.Vector3(0, 0.615, 0), new THREE.Euler(-Math.PI / 2, 0, 0), 0.205)
  addCrossFace(g, new THREE.Vector3(0, 0.185, 0), new THREE.Euler(Math.PI / 2, 0, 0), 0.205)
  return g
}

function createWheel(id, color) {
  const g = group(id, color)
  const tireMat = rubberMaterial()
  const tire = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.35, 24, 56), tireMat)
  tire.rotation.y = Math.PI / 2
  tire.position.y = 1.15
  g.add(tire)

  const treadGeo = roundedBox(0.74, 0.15, 0.28, 0.04, 2)
  for (let i = 0; i < 24; i += 1) {
    const angle = i / 24 * Math.PI * 2
    const tread = new THREE.Mesh(treadGeo, tireMat)
    const radius = 1.38
    tread.position.set(0, 1.15 + Math.sin(angle) * radius, Math.cos(angle) * radius)
    tread.rotation.x = angle
    tread.rotation.z = (i % 2 ? 1 : -1) * 0.08
    g.add(tread)
  }

  const rimMat = material(color, { roughness: 0.31 })
  const rimBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.64, 0.64, 0.5, 40), rimMat)
  rimBarrel.rotation.z = Math.PI / 2
  rimBarrel.position.y = 1.15
  g.add(rimBarrel)

  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.58, 28), darkMaterial())
  hub.rotation.z = Math.PI / 2
  hub.position.y = 1.15
  g.add(hub)

  const spokeGeo = roundedBox(0.42, 0.12, 0.72, 0.04, 2)
  for (let i = 0; i < 6; i += 1) {
    const angle = i / 6 * Math.PI * 2
    const spoke = new THREE.Mesh(spokeGeo, rimMat)
    spoke.position.set(0, 1.15 + Math.sin(angle) * 0.34, Math.cos(angle) * 0.34)
    spoke.rotation.x = angle
    g.add(spoke)
  }

  addCrossFace(g, new THREE.Vector3(0.296, 1.15, 0), new THREE.Euler(0, Math.PI / 2, 0), 0.2)
  addCrossFace(g, new THREE.Vector3(-0.296, 1.15, 0), new THREE.Euler(0, -Math.PI / 2, 0), 0.2)
  return g
}

function createMotor(id, color) {
  const g = group(id, color)
  const bodyMat = material(color, { roughness: 0.34 })
  const body = new THREE.Mesh(roundedBox(2.9, 1.8, 2.1, 0.16, 4), bodyMat)
  body.position.y = 0.9
  g.add(body)

  const frontCap = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.18, 36), darkMaterial())
  frontCap.rotation.z = Math.PI / 2
  frontCap.position.set(1.47, 0.9, 0)
  const bearing = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.24, 30), metalMaterial(0x8f969d))
  bearing.rotation.z = Math.PI / 2
  bearing.position.set(1.61, 0.9, 0)
  g.add(frontCap, bearing)

  const shaftShape = crossShape(0.16, 0.065)
  const shaftGeo = new THREE.ExtrudeGeometry(shaftShape, { depth: 0.48, bevelEnabled: false })
  shaftGeo.center()
  shaftGeo.rotateY(Math.PI / 2)
  const shaft = new THREE.Mesh(shaftGeo, metalMaterial())
  shaft.position.set(1.91, 0.9, 0)
  g.add(shaft)

  const panel = new THREE.Mesh(roundedBox(1.25, 0.08, 1.2, 0.035, 2), darkMaterial())
  panel.position.set(-0.25, 1.81, 0)
  g.add(panel)

  const accent = new THREE.Mesh(roundedBox(0.72, 0.035, 0.62, 0.02, 2), material(0x74e6a6, { roughness: 0.42, clearcoat: 0 }))
  accent.position.set(-0.25, 1.86, 0)
  g.add(accent)

  const ventMat = darkMaterial()
  for (let i = -2; i <= 2; i += 1) {
    const vent = new THREE.Mesh(roundedBox(0.04, 0.55, 0.16, 0.02, 2), ventMat)
    vent.position.set(-0.65 + i * 0.25, 0.88, 1.045)
    g.add(vent)
  }

  for (const x of [-0.65, 0.65]) {
    for (const z of [-0.65, 0.65]) {
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.29, 0.12, 24), bodyMat)
      foot.position.set(x, 0.06, z)
      g.add(foot)
    }
  }
  return g
}

function createGearbox(id, color) {
  const g = group(id, color)
  const body = new THREE.Mesh(roundedBox(3.2, 1.7, 2.2, 0.16, 4), material(color, { roughness: 0.36 }))
  body.position.y = 0.85
  g.add(body)

  const sidePlate = new THREE.Mesh(roundedBox(2.25, 0.05, 1.35, 0.03, 2), darkMaterial())
  sidePlate.position.set(0, 1.71, 0)
  g.add(sidePlate)

  const ringGeo = new THREE.TorusGeometry(0.28, 0.09, 12, 28)
  const ringMat = darkMaterial()
  for (const x of [-1.63, 1.63]) {
    const ring = new THREE.Mesh(ringGeo, ringMat)
    ring.rotation.y = Math.PI / 2
    ring.position.set(x, 0.88, 0)
    g.add(ring)
    addCrossFace(g, new THREE.Vector3(x + Math.sign(x) * 0.025, 0.88, 0), new THREE.Euler(0, Math.PI / 2, 0), 0.2)
  }

  const selectorBase = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.12, 28), darkMaterial())
  selectorBase.position.set(0, 1.74, 0)
  const selector = new THREE.Mesh(roundedBox(0.28, 0.55, 0.28, 0.05, 3), material(0x74e6a6))
  selector.position.set(0, 2.0, 0)
  g.add(selectorBase, selector)
  return g
}

function createDifferential(id, color) {
  const g = group(id, color)
  const housing = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 1.7, 40), material(color, { roughness: 0.37 }))
  housing.rotation.z = Math.PI / 2
  housing.position.y = 1.0
  g.add(housing)

  const centerBand = new THREE.Mesh(new THREE.TorusGeometry(1.01, 0.08, 8, 40), darkMaterial())
  centerBand.rotation.y = Math.PI / 2
  centerBand.position.y = 1.0
  g.add(centerBand)

  const ringGeo = new THREE.TorusGeometry(0.25, 0.08, 12, 28)
  const ringMat = darkMaterial()
  for (const x of [-0.88, 0.88]) {
    const ring = new THREE.Mesh(ringGeo, ringMat)
    ring.rotation.y = Math.PI / 2
    ring.position.set(x, 1.0, 0)
    g.add(ring)
    addCrossFace(g, new THREE.Vector3(x + Math.sign(x) * 0.025, 1.0, 0), new THREE.Euler(0, Math.PI / 2, 0), 0.19)
  }
  const inputRing = new THREE.Mesh(ringGeo, ringMat)
  inputRing.rotation.x = Math.PI / 2
  inputRing.position.set(0, 1.0, 1.08)
  g.add(inputRing)
  addCrossFace(g, new THREE.Vector3(0, 1.0, 1.105), new THREE.Euler(0, 0, 0), 0.19)
  return g
}

export const PARTS = [
  { id: 'brick-2x4', name: 'Brick 2×4', category: 'Bricks', icon: '▦', description: 'Classic 2×4 brick', defaultColor: 0xd7263d, connectors: brickConnectors(4, 2, BRICK_HEIGHT), create: c => createBrick('brick-2x4', 4, 2, BRICK_HEIGHT, c) },
  { id: 'plate-2x4', name: 'Plate 2×4', category: 'Bricks', icon: '▤', description: 'Low-profile 2×4 plate', defaultColor: 0xf6c945, connectors: brickConnectors(4, 2, PLATE_HEIGHT), create: c => createBrick('plate-2x4', 4, 2, PLATE_HEIGHT, c) },
  { id: 'technic-brick-1x6', name: 'Technic Brick 1×6', category: 'Beams', icon: '▥', description: 'Studded chassis brick with five side bearing holes', defaultColor: 0x2d69c4, connectors: technicBrickConnectors(6), create: c => createTechnicBrick('technic-brick-1x6', 6, c) },
  { id: 'beam-5', name: 'Technic Beam 1×5', category: 'Beams', icon: '•••••', description: 'Five bearing / pin holes', defaultColor: 0xd7263d, connectors: beamConnectors(5), create: c => createBeam('beam-5', 5, c) },
  { id: 'beam-9', name: 'Technic Beam 1×9', category: 'Beams', icon: '•••••••••', description: 'Nine bearing / pin holes', defaultColor: 0x2d69c4, connectors: beamConnectors(9), create: c => createBeam('beam-9', 9, c) },
  { id: 'axle-3', name: 'Axle 3L', category: 'Axles', icon: '━', description: 'Short cross axle with 3 attachment slots', defaultColor: 0xadb5bd, mechanics: { shaft: true }, connectors: axleConnectors(3), create: c => createAxle('axle-3', 3, c) },
  { id: 'axle-5', name: 'Axle 5L', category: 'Axles', icon: '━━', description: 'Medium cross axle with 5 attachment slots', defaultColor: 0x2b2d31, mechanics: { shaft: true }, connectors: axleConnectors(5), create: c => createAxle('axle-5', 5, c) },
  { id: 'axle-7', name: 'Axle 7L', category: 'Axles', icon: '━━━', description: 'Long cross axle with 7 attachment slots', defaultColor: 0x2b2d31, mechanics: { shaft: true }, connectors: axleConnectors(7), create: c => createAxle('axle-7', 7, c) },
  {
    id: 'axle-coupler',
    name: 'Axle Coupler',
    category: 'Axles',
    icon: '◫',
    description: 'Rigid coupler for extending a driven shaft',
    defaultColor: 0xb7bcc3,
    mechanics: { shaft: true },
    connectors: [
      { id: 'hole-left', type: 'axle-hole', position: [-0.75, 0.38, 0], axis: [1, 0, 0] },
      { id: 'hole-right', type: 'axle-hole', position: [0.75, 0.38, 0], axis: [1, 0, 0] },
    ],
    create: c => createAxleCoupler('axle-coupler', c),
  },
  { id: 'pin', name: 'Friction Pin', category: 'Axles', icon: '●', description: 'Technic connector pin', defaultColor: 0x2b2d31, connectors: [-1, 0, 1].map((z, i) => ({ id: `pin-${i}`, type: 'pin', position: [0, 0.28, z], axis: [0, 0, 1] })), create: c => createPin('pin', c) },
  { id: 'gear-8', name: 'Gear 8T', category: 'Gears', icon: '⚙', description: 'Small spur gear', defaultColor: 0xadb5bd, mechanics: { gear: { teeth: 8, pitchRadius: gearPitchRadius(8), efficiency: 0.92 } }, connectors: [{ id: 'axle-hole', type: 'axle-hole', position: [0, 0.4, 0], axis: [0, 1, 0] }], create: c => createGear('gear-8', 8, c) },
  { id: 'gear-16', name: 'Gear 16T', category: 'Gears', icon: '⚙', description: 'Medium spur gear', defaultColor: 0xd9d9d9, mechanics: { gear: { teeth: 16, pitchRadius: gearPitchRadius(16), efficiency: 0.92 } }, connectors: [{ id: 'axle-hole', type: 'axle-hole', position: [0, 0.4, 0], axis: [0, 1, 0] }], create: c => createGear('gear-16', 16, c) },
  { id: 'gear-24', name: 'Gear 24T', category: 'Gears', icon: '⚙', description: 'Large spur gear', defaultColor: 0xd9d9d9, mechanics: { gear: { teeth: 24, pitchRadius: gearPitchRadius(24), efficiency: 0.92 } }, connectors: [{ id: 'axle-hole', type: 'axle-hole', position: [0, 0.4, 0], axis: [0, 1, 0] }], create: c => createGear('gear-24', 24, c) },
  { id: 'wheel', name: 'Off-road Wheel', category: 'Wheels', icon: '◉', description: 'Large prototype wheel', defaultColor: 0xb7bcc3, mechanics: { wheel: { radius: 1.4 }, shaft: true }, connectors: [{ id: 'axle-hole', type: 'axle-hole', position: [0, 1.15, 0], axis: [1, 0, 0] }], create: c => createWheel('wheel', c) },
  {
    id: 'motor',
    name: 'Lab Motor',
    category: 'Power',
    icon: 'M',
    description: '120 RPM torque-limited drivetrain motor',
    defaultColor: 0x6f7680,
    mechanics: { motor: { connectorId: 'output', rpm: 120, direction: 1, damping: 1.0, stallTorque: 5.5, freeCurrent: 0.15, stallCurrent: 2.2 } },
    connectors: motorConnectors(),
    create: c => createMotor('motor', c),
  },
  {
    id: 'gearbox-fnr',
    name: 'F/N/R Gearbox',
    category: 'Power',
    icon: 'FNR',
    description: 'Selectable forward / neutral / reverse transmission',
    defaultColor: 0x59626c,
    mechanics: {
      transmission: {
        inputConnectorId: 'input',
        outputConnectorId: 'output',
        modes: { forward: 1, neutral: 0, reverse: -1 },
        efficiency: 0.9,
      },
    },
    connectors: [
      { id: 'input', type: 'axle-hole', position: [-1.65, 0.88, 0], axis: [1, 0, 0] },
      { id: 'output', type: 'axle-hole', position: [1.65, 0.88, 0], axis: [1, 0, 0] },
      ...bottomTubeMounts(2, 2),
    ],
    create: c => createGearbox('gearbox-fnr', c),
  },
  {
    id: 'open-differential',
    name: 'Open Differential',
    category: 'Power',
    icon: 'DIFF',
    description: 'One input, two half-shaft outputs with torque split',
    defaultColor: 0x6b747e,
    mechanics: {
      differential: {
        inputConnectorId: 'input',
        leftConnectorId: 'left',
        rightConnectorId: 'right',
        ratio: 1,
        efficiency: 0.92,
        torqueSplit: 0.5,
      },
    },
    connectors: [
      { id: 'input', type: 'axle-hole', position: [0, 1.0, 1.1], axis: [0, 0, 1] },
      { id: 'left', type: 'axle-hole', position: [-0.9, 1.0, 0], axis: [1, 0, 0] },
      { id: 'right', type: 'axle-hole', position: [0.9, 1.0, 0], axis: [1, 0, 0] },
      ...bottomTubeMounts(2, 2),
    ],
    create: c => createDifferential('open-differential', c),
  },
]

export const findPart = id => PARTS.find(part => part.id === id)