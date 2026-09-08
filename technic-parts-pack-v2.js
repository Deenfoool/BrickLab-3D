import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { PARTS } from './parts.js'

const BRICK_HEIGHT = 1.2
const PLATE_HEIGHT = 0.4

function plastic(color, options = {}) {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: options.roughness ?? 0.3,
    metalness: 0,
    clearcoat: options.clearcoat ?? 0.24,
    clearcoatRoughness: options.clearcoatRoughness ?? 0.26,
    ior: 1.47,
  })
}

function dark() {
  return new THREE.MeshStandardMaterial({ color: 0x15181b, roughness: 0.72, metalness: 0.02 })
}

function rubber() {
  return new THREE.MeshStandardMaterial({ color: 0x17191b, roughness: 0.86, metalness: 0 })
}

function roundedBox(width, height, depth, radius = 0.07, segments = 3) {
  return new RoundedBoxGeometry(width, height, depth, segments, Math.min(radius, width / 3, height / 3, depth / 3))
}

function root(id, color) {
  const g = new THREE.Group()
  g.userData.partId = id
  g.userData.color = color
  return g
}

function addPart(definition) {
  if (!PARTS.some(part => part.id === definition.id)) PARTS.push(definition)
}

function brickConnectors(width, depth, height) {
  const connectors = []
  for (let x = 0; x < width; x++) for (let z = 0; z < depth; z++) {
    const px = x - (width - 1) / 2
    const pz = z - (depth - 1) / 2
    connectors.push({ id: `stud-${x}-${z}`, type: 'stud', position: [px, height, pz], axis: [0, 1, 0] })
    connectors.push({ id: `tube-${x}-${z}`, type: 'tube', position: [px, 0, pz], axis: [0, -1, 0] })
  }
  return connectors
}

function addStuds(g, width, depth, height, color) {
  const mat = plastic(color)
  const side = new THREE.CylinderGeometry(0.30, 0.305, 0.18, 32)
  for (let x = 0; x < width; x++) for (let z = 0; z < depth; z++) {
    const stud = new THREE.Mesh(side, mat)
    stud.position.set(x - (width - 1) / 2, height + 0.09, z - (depth - 1) / 2)
    g.add(stud)
  }
}

function createStudded(id, width, depth, height, color) {
  const g = root(id, color)
  const body = new THREE.Mesh(roundedBox(width - 0.08, height, depth - 0.08, Math.min(0.09, height * 0.19), 4), plastic(color))
  body.position.y = height / 2
  g.add(body)
  addStuds(g, width, depth, height, color)
  return g
}

function crossPoints(radius = 0.18, arm = 0.074) {
  return [
    [-arm, radius], [arm, radius], [arm, arm], [radius, arm],
    [radius, -arm], [arm, -arm], [arm, -radius], [-arm, -radius],
    [-arm, -arm], [-radius, -arm], [-radius, arm], [-arm, arm],
  ]
}

function crossShape(radius = 0.18, arm = 0.074) {
  const shape = new THREE.Shape()
  const points = crossPoints(radius, arm)
  shape.moveTo(...points[0])
  for (let i = 1; i < points.length; i++) shape.lineTo(...points[i])
  shape.closePath()
  return shape
}

function crossPath(radius = 0.205, arm = 0.082) {
  const path = new THREE.Path()
  const points = crossPoints(radius, arm)
  path.moveTo(...points[0])
  for (let i = 1; i < points.length; i++) path.lineTo(...points[i])
  path.closePath()
  return path
}

function ringExtrusion(outer, inner, depth, color) {
  const shape = new THREE.Shape()
  shape.absarc(0, 0, outer, 0, Math.PI * 2)
  const hole = new THREE.Path()
  hole.absarc(0, 0, inner, 0, Math.PI * 2, true)
  shape.holes.push(hole)
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: 0.015,
    bevelThickness: 0.015,
    curveSegments: 28,
  })
  geo.translate(0, 0, -depth / 2)
  return new THREE.Mesh(geo, plastic(color))
}

function technicBrickConnectors(length) {
  const connectors = []
  for (let i = 0; i < length; i++) {
    const x = i - (length - 1) / 2
    connectors.push({ id: `stud-${i}`, type: 'stud', position: [x, BRICK_HEIGHT, 0], axis: [0, 1, 0] })
    connectors.push({ id: `tube-${i}`, type: 'tube', position: [x, 0, 0], axis: [0, -1, 0] })
  }
  for (let i = 0; i < Math.max(1, length - 1); i++) {
    connectors.push({ id: `side-hole-${i}`, type: 'pin-hole', position: [i - (length - 2) / 2, BRICK_HEIGHT / 2, 0], axis: [0, 0, 1] })
  }
  return connectors
}

function createTechnicBrick(id, length, color) {
  const g = root(id, color)
  const mat = plastic(color)
  const depth = 0.88
  const width = Math.max(1.0, length - 0.08)
  const top = new THREE.Mesh(roundedBox(width, 0.3, depth, 0.075, 4), mat)
  top.position.y = 1.0
  const bottom = new THREE.Mesh(roundedBox(width, 0.3, depth, 0.075, 4), mat)
  bottom.position.y = 0.2
  g.add(top, bottom)
  for (const x of [-(length - 1) / 2 - 0.44, (length - 1) / 2 + 0.44]) {
    const cap = new THREE.Mesh(roundedBox(0.32, 0.72, depth, 0.07, 3), mat)
    cap.position.set(x, 0.6, 0)
    g.add(cap)
  }
  for (let i = 0; i < Math.max(1, length - 1); i++) {
    const ring = ringExtrusion(0.33, 0.225, depth + 0.03, color)
    ring.position.set(i - (length - 2) / 2, 0.6, 0)
    g.add(ring)
  }
  addStuds(g, length, 1, BRICK_HEIGHT, color)
  return g
}

function beamConnectors(length) {
  return Array.from({ length }, (_, i) => ({
    id: `hole-${i}`,
    type: 'pin-hole',
    position: [i - (length - 1) / 2, 0.45, 0],
    axis: [0, 0, 1],
  }))
}

function createBeam(id, length, color, depth = 0.78) {
  const g = root(id, color)
  const mat = plastic(color)
  const width = Math.max(0.9, length - 0.12)
  const upper = new THREE.Mesh(roundedBox(width, 0.16, depth, 0.06, 3), mat)
  upper.position.y = 0.81
  const lower = new THREE.Mesh(roundedBox(width, 0.16, depth, 0.06, 3), mat)
  lower.position.y = 0.09
  g.add(upper, lower)
  for (let i = 0; i < length; i++) {
    const ring = ringExtrusion(0.41, 0.245, depth + 0.025, color)
    ring.position.set(i - (length - 1) / 2, 0.45, 0)
    g.add(ring)
  }
  return g
}

function bentConnectors(points) {
  return points.map(([x, y], index) => ({ id: `hole-${index}`, type: 'pin-hole', position: [x, y, 0], axis: [0, 0, 1] }))
}

function createBentBeam(id, points, color) {
  const g = root(id, color)
  const depth = 0.78
  const mat = plastic(color)
  for (let i = 0; i < points.length - 1; i++) {
    const [x1, y1] = points[i], [x2, y2] = points[i + 1]
    const dx = x2 - x1, dy = y2 - y1
    const length = Math.hypot(dx, dy)
    const rail = new THREE.Mesh(roundedBox(length + 0.18, 0.22, depth, 0.07, 3), mat)
    rail.position.set((x1 + x2) / 2, (y1 + y2) / 2, 0)
    rail.rotation.z = Math.atan2(dy, dx)
    g.add(rail)
  }
  for (const [x, y] of points) {
    const ring = ringExtrusion(0.41, 0.245, depth + 0.025, color)
    ring.position.set(x, y, 0)
    g.add(ring)
  }
  return g
}

function axleConnectors(length) {
  return Array.from({ length }, (_, i) => ({ id: `axle-${i}`, type: 'axle', position: [i - (length - 1) / 2, 0.32, 0], axis: [1, 0, 0] }))
}

function createAxle(id, length, color) {
  const g = root(id, color)
  const geo = new THREE.ExtrudeGeometry(crossShape(), { depth: Math.max(0.25, length - 0.06), bevelEnabled: true, bevelSegments: 1, bevelSize: 0.01, bevelThickness: 0.01 })
  geo.center()
  geo.rotateY(Math.PI / 2)
  const shaft = new THREE.Mesh(geo, plastic(color, { roughness: 0.28, clearcoat: 0.14 }))
  shaft.position.y = 0.32
  g.add(shaft)
  return g
}

function createPin(id, length, color, ridge = true) {
  const g = root(id, color)
  const mat = plastic(color, { roughness: 0.38, clearcoat: 0.08 })
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, length, 24), mat)
  core.rotation.x = Math.PI / 2
  core.position.y = 0.28
  g.add(core)
  if (ridge) {
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.265, 0.265, 0.12, 28), mat)
    collar.rotation.x = Math.PI / 2
    collar.position.y = 0.28
    g.add(collar)
  }
  return g
}

function createAxlePin(id, color) {
  const g = root(id, color)
  const mat = plastic(color, { roughness: 0.36 })
  const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.95, 24), mat)
  pin.rotation.x = Math.PI / 2
  pin.position.set(0, 0.3, -0.48)
  g.add(pin)
  const cross = new THREE.ExtrudeGeometry(crossShape(0.17, 0.07), { depth: 0.95, bevelEnabled: false })
  const axle = new THREE.Mesh(cross, mat)
  axle.position.set(0, 0.3, 0.01)
  g.add(axle)
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.12, 28), mat)
  collar.rotation.x = Math.PI / 2
  collar.position.set(0, 0.3, 0)
  g.add(collar)
  return g
}

function createConnectorBlock(id, holes, color) {
  const g = root(id, color)
  const mat = plastic(color)
  const body = new THREE.Mesh(roundedBox(1.35, 0.82, 1.0, 0.13, 4), mat)
  body.position.y = 0.42
  g.add(body)
  for (const hole of holes) {
    const axis = new THREE.Vector3(...hole.axis).normalize()
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.245, 0.04, 8, 28), dark())
    ring.position.fromArray(hole.position)
    ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis)
    g.add(ring)
  }
  return g
}

function createTripleConnector(id, color) {
  const g = root(id, color)
  const mat = plastic(color)
  const rail = new THREE.Mesh(roundedBox(2.65, 0.76, 0.78, 0.12, 4), mat)
  rail.position.y = 0.45
  g.add(rail)
  for (const x of [-1, 0, 1]) {
    const ring = ringExtrusion(0.36, 0.245, 0.82, color)
    ring.position.set(x, 0.45, 0)
    g.add(ring)
  }
  return g
}

function gearPitchRadius(teeth) { return teeth / 16 }

function createGear(id, teeth, color) {
  const g = root(id, color)
  const pitch = gearPitchRadius(teeth)
  const outer = pitch * 1.12
  const inner = pitch * 0.87
  const shoulder = pitch * 1.02
  const shape = new THREE.Shape()
  for (let tooth = 0; tooth < teeth; tooth++) {
    const base = tooth / teeth * Math.PI * 2
    const pts = [
      [base, inner], [base + Math.PI * 0.35 / teeth, shoulder], [base + Math.PI * 0.7 / teeth, outer],
      [base + Math.PI * 1.3 / teeth, outer], [base + Math.PI * 1.65 / teeth, shoulder], [base + Math.PI * 2 / teeth, inner],
    ]
    for (const [angle, r] of pts) {
      const x = Math.cos(angle) * r, y = Math.sin(angle) * r
      if (tooth === 0 && angle === base) shape.moveTo(x, y)
      else shape.lineTo(x, y)
    }
  }
  shape.closePath()
  shape.holes.push(crossPath())
  if (teeth >= 36) {
    const radius = pitch * 0.54
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2
      const hole = new THREE.Path()
      hole.absarc(Math.cos(a) * radius, Math.sin(a) * radius, 0.14, 0, Math.PI * 2, true)
      shape.holes.push(hole)
    }
  }
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.34, bevelEnabled: true, bevelSegments: 1, bevelSize: 0.016, bevelThickness: 0.016, curveSegments: 20 })
  geo.center()
  const mesh = new THREE.Mesh(geo, plastic(color, { roughness: 0.34, clearcoat: 0.12 }))
  mesh.rotation.x = Math.PI / 2
  mesh.position.y = 0.4
  g.add(mesh)
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.42, 30), plastic(color))
  hub.position.y = 0.4
  g.add(hub)
  return g
}

function createWheel(id, radius, width, color, treadStyle = 'road') {
  const g = root(id, color)
  const tireMat = rubber()
  const tube = Math.max(0.18, radius * (treadStyle === 'offroad' ? 0.25 : 0.20))
  const major = Math.max(0.25, radius - tube)
  const tire = new THREE.Mesh(new THREE.TorusGeometry(major, tube, 20, 52), tireMat)
  tire.rotation.y = Math.PI / 2
  tire.position.y = 1.15
  g.add(tire)

  const treadCount = treadStyle === 'offroad' ? 22 : 30
  const treadGeo = roundedBox(width * 0.92, Math.max(0.05, radius * 0.055), Math.max(0.09, radius * 0.12), 0.025, 2)
  for (let i = 0; i < treadCount; i++) {
    const a = i / treadCount * Math.PI * 2
    const block = new THREE.Mesh(treadGeo, tireMat)
    block.position.set(0, 1.15 + Math.cos(a) * radius, Math.sin(a) * radius)
    block.rotation.x = a
    block.rotation.z = treadStyle === 'offroad' ? (i % 2 ? 0.08 : -0.08) : 0
    g.add(block)
  }

  const rimMat = plastic(color, { roughness: 0.28 })
  const rimRadius = Math.max(0.26, radius * 0.48)
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(rimRadius, rimRadius, width * 0.78, 36), rimMat)
  rim.rotation.z = Math.PI / 2
  rim.position.y = 1.15
  g.add(rim)
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, width * 0.9, 28), dark())
  hub.rotation.z = Math.PI / 2
  hub.position.y = 1.15
  g.add(hub)
  return g
}

const bentL3x3 = [[-1, 0.45], [0, 0.45], [1, 0.45], [1, 1.45], [1, 2.45]]
const bent4x2 = [[-1.5, 0.45], [-0.5, 0.45], [0.5, 0.45], [1.5, 0.45], [1.5, 1.45]]

const definitions = [
  ['brick-1x6', 'Brick 1×6', 'Bricks', '▦', 'Long narrow 1×6 brick', 0xd7263d, brickConnectors(6, 1, BRICK_HEIGHT), c => createStudded('brick-1x6', 6, 1, BRICK_HEIGHT, c), ['brick','stud','1x6']],
  ['brick-1x8', 'Brick 1×8', 'Bricks', '▦', 'Long narrow 1×8 brick', 0xf0f1f2, brickConnectors(8, 1, BRICK_HEIGHT), c => createStudded('brick-1x8', 8, 1, BRICK_HEIGHT, c), ['brick','stud','1x8']],
  ['brick-2x8', 'Brick 2×8', 'Bricks', '▦', 'Long structural 2×8 brick', 0x2d69c4, brickConnectors(8, 2, BRICK_HEIGHT), c => createStudded('brick-2x8', 8, 2, BRICK_HEIGHT, c), ['brick','chassis','2x8']],
  ['brick-2x10', 'Brick 2×10', 'Bricks', '▦', 'Extra-long structural 2×10 brick', 0x2b2d31, brickConnectors(10, 2, BRICK_HEIGHT), c => createStudded('brick-2x10', 10, 2, BRICK_HEIGHT, c), ['brick','chassis','2x10']],
  ['plate-1x6', 'Plate 1×6', 'Bricks', '▤', 'Long low-profile 1×6 plate', 0xf6c945, brickConnectors(6, 1, PLATE_HEIGHT), c => createStudded('plate-1x6', 6, 1, PLATE_HEIGHT, c), ['plate','1x6']],
  ['plate-1x8', 'Plate 1×8', 'Bricks', '▤', 'Long low-profile 1×8 plate', 0xd7263d, brickConnectors(8, 1, PLATE_HEIGHT), c => createStudded('plate-1x8', 8, 1, PLATE_HEIGHT, c), ['plate','1x8']],
  ['plate-2x8', 'Plate 2×8', 'Bricks', '▤', 'Wide chassis plate 2×8', 0x2d69c4, brickConnectors(8, 2, PLATE_HEIGHT), c => createStudded('plate-2x8', 8, 2, PLATE_HEIGHT, c), ['plate','chassis','2x8']],
  ['plate-2x10', 'Plate 2×10', 'Bricks', '▤', 'Extra-long chassis plate 2×10', 0x2b2d31, brickConnectors(10, 2, PLATE_HEIGHT), c => createStudded('plate-2x10', 10, 2, PLATE_HEIGHT, c), ['plate','chassis','2x10']],
  ['technic-brick-1x2', 'Technic Brick 1×2', 'Beams', '▥', 'Compact studded Technic brick', 0xd7263d, technicBrickConnectors(2), c => createTechnicBrick('technic-brick-1x2', 2, c), ['technic','brick','hole']],
  ['technic-brick-1x8', 'Technic Brick 1×8', 'Beams', '▥', 'Long studded Technic chassis brick', 0x2d69c4, technicBrickConnectors(8), c => createTechnicBrick('technic-brick-1x8', 8, c), ['technic','brick','hole']],
  ['technic-brick-1x10', 'Technic Brick 1×10', 'Beams', '▥', 'Long 1×10 studded Technic brick', 0x2b2d31, technicBrickConnectors(10), c => createTechnicBrick('technic-brick-1x10', 10, c), ['technic','brick','hole']],
  ['technic-brick-1x12', 'Technic Brick 1×12', 'Beams', '▥', 'Extra-long 1×12 studded Technic brick', 0xd7263d, technicBrickConnectors(12), c => createTechnicBrick('technic-brick-1x12', 12, c), ['technic','brick','hole']],
  ...[2,4,6,8,10,13,15].map((length, index) => [
    `beam-${length}`, `Technic Beam 1×${length}`, 'Beams', '•••', `${length}L liftarm with ${length} pin / bearing holes`, [0xd7263d,0xf6c945,0x2d69c4,0x2b2d31][index % 4], beamConnectors(length), c => createBeam(`beam-${length}`, length, c), ['beam','liftarm','technic',`${length}l`],
  ]),
  ...[3,5,7,9].map((length, index) => [
    `thin-beam-${length}`, `Thin Beam ${length}L`, 'Beams', '···', `Half-width ${length}L Technic liftarm`, [0xadb5bd,0xd7263d,0x2d69c4,0xf6c945][index], beamConnectors(length), c => createBeam(`thin-beam-${length}`, length, c, 0.40), ['thin','beam','liftarm',`${length}l`],
  ]),
  ['beam-l-3x3', 'L Beam 3×3', 'Beams', '∟', 'Right-angle Technic liftarm for rigid corners', 0xd7263d, bentConnectors(bentL3x3), c => createBentBeam('beam-l-3x3', bentL3x3, c), ['beam','angle','corner','l']],
  ['beam-angle-4x2', 'Angle Beam 4×2', 'Beams', '⌞', 'Asymmetric right-angle Technic liftarm', 0x2d69c4, bentConnectors(bent4x2), c => createBentBeam('beam-angle-4x2', bent4x2, c), ['beam','angle','corner']],
  ...[4,6,8,10,12].map((length, index) => [
    `axle-${length}`, `Axle ${length}L`, 'Axles', '━', `${length}L cross axle`, [0xadb5bd,0x2b2d31,0x2b2d31,0xadb5bd,0x2b2d31][index], axleConnectors(length), c => createAxle(`axle-${length}`, length, c), ['axle','shaft',`${length}l`], { shaft: true },
  ]),
  ['pin-half', 'Half Pin', 'Connectors', '●', 'Short Technic friction pin', 0x2d69c4, [{ id:'pin-0', type:'pin', position:[0,0.28,-0.35], axis:[0,0,1] },{ id:'pin-1', type:'pin', position:[0,0.28,0.35], axis:[0,0,1] }], c => createPin('pin-half', 0.9, c), ['pin','half','connector']],
  ['pin-long', 'Long Pin 3L', 'Connectors', '●', 'Long friction pin for multi-layer joints', 0x2b2d31, [-1,0,1].map((z,i)=>({id:`pin-${i}`,type:'pin',position:[0,0.28,z],axis:[0,0,1]})), c => createPin('pin-long', 3, c), ['pin','long','3l','connector']],
  ['axle-pin', 'Axle Pin', 'Connectors', '◐', 'Hybrid pin with cross-axle end', 0x2d69c4, [{ id:'pin',type:'pin',position:[0,0.3,-0.7],axis:[0,0,1] },{ id:'axle',type:'axle',position:[0,0.3,0.7],axis:[0,0,1] }], c => createAxlePin('axle-pin', c), ['pin','axle','hybrid'], { shaft:true }],
  ['connector-perpendicular', 'Perpendicular Connector', 'Connectors', '⊥', 'Axle pass-through with perpendicular pin hole', 0xadb5bd, [{id:'axle-left',type:'axle-hole',position:[-0.64,0.42,0],axis:[1,0,0]},{id:'axle-right',type:'axle-hole',position:[0.64,0.42,0],axis:[1,0,0]},{id:'pin-hole',type:'pin-hole',position:[0,0.42,0],axis:[0,0,1]}], c => createConnectorBlock('connector-perpendicular', [{position:[-0.64,0.42,0],axis:[1,0,0]},{position:[0.64,0.42,0],axis:[1,0,0]},{position:[0,0.42,0],axis:[0,0,1]}], c), ['connector','perpendicular','axle','pin'], { shaft:true }],
  ['connector-triple', 'Triple Pin Connector', 'Connectors', '•••', 'Rigid 3-hole Technic connector block', 0x2b2d31, [-1,0,1].map((x,i)=>({id:`hole-${i}`,type:'pin-hole',position:[x,0.45,0],axis:[0,0,1]})), c => createTripleConnector('connector-triple', c), ['connector','triple','pin-hole']],
  ['connector-angle', 'Angle Connector', 'Connectors', '⌜', 'Compact 90° connector with two pin holes', 0xf6c945, [{id:'hole-a',type:'pin-hole',position:[-0.45,0.42,0],axis:[0,0,1]},{id:'hole-b',type:'pin-hole',position:[0.45,0.42,0],axis:[0,1,0]}], c => createConnectorBlock('connector-angle', [{position:[-0.45,0.42,0],axis:[0,0,1]},{position:[0.45,0.42,0],axis:[0,1,0]}], c), ['connector','angle','90','pin-hole']],
  ...[12,20,36,40].map((teeth, index) => [
    `gear-${teeth}`, `Gear ${teeth}T`, 'Gears', '⚙', `${teeth}-tooth spur gear`, [0xadb5bd,0xd9d9d9,0xd9d9d9,0xadb5bd][index], [{ id:'axle-hole',type:'axle-hole',position:[0,0.4,0],axis:[0,1,0] }], c => createGear(`gear-${teeth}`, teeth, c), ['gear','spur',`${teeth}t`], { gear:{ teeth, pitchRadius:gearPitchRadius(teeth), efficiency:0.92 } },
  ]),
  ['wheel-small', 'Small Wheel', 'Wheels', '◉', 'Compact wheel for small mechanisms', 0xadb5bd, [{id:'axle-hole',type:'axle-hole',position:[0,1.15,0],axis:[1,0,0]}], c => createWheel('wheel-small', 0.90, 0.58, c, 'road'), ['wheel','small','tire'], { wheel:{radius:0.90}, shaft:true }],
  ['wheel-medium', 'Medium All-terrain Wheel', 'Wheels', '◉', 'Medium treaded wheel for compact vehicles', 0xb7bcc3, [{id:'axle-hole',type:'axle-hole',position:[0,1.15,0],axis:[1,0,0]}], c => createWheel('wheel-medium', 1.15, 0.66, c, 'offroad'), ['wheel','medium','tire','offroad'], { wheel:{radius:1.15}, shaft:true }],
  ['wheel-road', 'Road Wheel', 'Wheels', '◉', 'Low-profile road tyre and rim', 0xd9d9d9, [{id:'axle-hole',type:'axle-hole',position:[0,1.15,0],axis:[1,0,0]}], c => createWheel('wheel-road', 1.30, 0.62, c, 'road'), ['wheel','road','tire'], { wheel:{radius:1.30}, shaft:true }],
]

for (const entry of definitions) {
  const [id, name, category, icon, description, defaultColor, connectors, create, tags, mechanics] = entry
  addPart({ id, name, category, icon, description, defaultColor, connectors, create, tags, ...(mechanics ? { mechanics } : {}) })
}

window.dispatchEvent(new CustomEvent('bricklab:partcatalogchange', { detail: { total: PARTS.length, pack: 'technic-v2' } }))
