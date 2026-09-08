import * as THREE from 'three'
import { PARTS } from '../parts.js'
import { installPart } from './part-schema-v1.js'

export const PARTS3_EXTRA_VERSION = 'parts-3-extra-v1'

function mat(color, roughness = 0.32) {
  return new THREE.MeshPhysicalMaterial({ color, roughness, metalness: 0.01, clearcoat: 0.18, clearcoatRoughness: 0.34, ior: 1.47 })
}
function dark() { return new THREE.MeshStandardMaterial({ color: 0x17191c, roughness: 0.78, metalness: 0.02 }) }
function root(id, color) { const g = new THREE.Group(); g.userData.partId = id; g.userData.color = color; return g }
function roundedRect(width, height, radius) {
  const x = -width / 2, y = -height / 2, r = Math.min(radius, width / 2, height / 2)
  const s = new THREE.Shape()
  s.moveTo(x + r, y); s.lineTo(x + width - r, y); s.quadraticCurveTo(x + width, y, x + width, y + r)
  s.lineTo(x + width, y + height - r); s.quadraticCurveTo(x + width, y + height, x + width - r, y + height)
  s.lineTo(x + r, y + height); s.quadraticCurveTo(x, y + height, x, y + height - r)
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); s.closePath()
  return s
}
function hole(x, y, radius = 0.245) { const p = new THREE.Path(); p.absarc(x, y, radius, 0, Math.PI * 2, true); return p }
function plate(width, height, depth, holes, color, radius = 0.4) {
  const shape = roundedRect(width, height, radius)
  for (const [x, y, r] of holes) shape.holes.push(hole(x, y, r))
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSegments: 2, bevelSize: 0.02, bevelThickness: 0.02, curveSegments: 24 })
  geo.translate(0, 0, -depth / 2)
  return new THREE.Mesh(geo, mat(color))
}
function liners(g, holes, depth, yOffset = 0) {
  for (const [x, y, r = 0.245] of holes) {
    const a = new THREE.Mesh(new THREE.TorusGeometry(r, 0.024, 8, 28), dark())
    a.position.set(x, y + yOffset, depth / 2 + 0.012)
    const b = a.clone(); b.position.z = -depth / 2 - 0.012
    g.add(a, b)
  }
}
function beamConnectors(length) { return Array.from({ length }, (_, i) => ({ id: `hole-${i}`, type: 'pin-hole', position: [i - (length - 1) / 2, 0.45, 0], axis: [0, 0, 1] })) }
function createBeam(id, length, color) {
  const g = root(id, color)
  const holes = Array.from({ length }, (_, i) => [i - (length - 1) / 2, 0, 0.245])
  const mesh = plate(length - 0.10, 0.88, 0.78, holes, color, 0.42); mesh.position.y = 0.45; g.add(mesh)
  liners(g, holes, 0.78, 0.45)
  return g
}
function brickConnectors(length) {
  const connectors = []
  for (let i = 0; i < length; i += 1) {
    const x = i - (length - 1) / 2
    connectors.push({ id: `stud-${i}`, type: 'stud', position: [x, 1.2, 0], axis: [0, 1, 0] })
    connectors.push({ id: `tube-${i}`, type: 'tube', position: [x, 0, 0], axis: [0, -1, 0] })
  }
  for (let i = 0; i < length - 1; i += 1) connectors.push({ id: `side-hole-${i}`, type: 'pin-hole', position: [i - (length - 2) / 2, 0.6, 0], axis: [0, 0, 1] })
  return connectors
}
function createTechnicBrick(id, length, color) {
  const g = root(id, color)
  const holes = Array.from({ length: length - 1 }, (_, i) => [i - (length - 2) / 2, 0, 0.225])
  const mesh = plate(length - 0.08, 1.12, 0.88, holes, color, 0.10); mesh.position.y = 0.60; g.add(mesh)
  liners(g, holes, 0.88, 0.60)
  const studGeo = new THREE.CylinderGeometry(0.295, 0.305, 0.18, 30)
  for (let i = 0; i < length; i += 1) { const stud = new THREE.Mesh(studGeo, mat(color)); stud.position.set(i - (length - 1) / 2, 1.29, 0); g.add(stud) }
  return g
}

function frameHoleCoordinates(width, height) {
  const points = []
  for (let x = 0; x < width; x += 1) {
    points.push([x - (width - 1) / 2, 0])
    if (height > 1) points.push([x - (width - 1) / 2, height - 1])
  }
  for (let y = 1; y < height - 1; y += 1) {
    points.push([-(width - 1) / 2, y])
    points.push([(width - 1) / 2, y])
  }
  return points
}
function createFrame(color) {
  const g = root('technic-frame-5x7', color)
  const width = 7, height = 5, depth = 0.78
  const outer = roundedRect(width - 0.10, height - 0.10, 0.42)
  // A real open center plus real perimeter pin bores: the connector locations
  // and the visible geometry now describe the same mechanical part.
  const inner = roundedRect(width - 1.90, height - 1.90, 0.28)
  outer.holes.push(inner)
  const framePoints = frameHoleCoordinates(width, height)
  for (const [x, row] of framePoints) outer.holes.push(hole(x, row - (height - 1) / 2, 0.245))
  const geo = new THREE.ExtrudeGeometry(outer, { depth, bevelEnabled: true, bevelSegments: 2, bevelSize: 0.02, bevelThickness: 0.02, curveSegments: 24 })
  geo.translate(0, 0, -depth / 2)
  const mesh = new THREE.Mesh(geo, mat(color)); mesh.position.y = 2.45; g.add(mesh)
  const holes = framePoints.map(([x, row]) => [x, 0.45 + row, 0.245])
  liners(g, holes, depth, 0)
  return g
}
function frameConnectors() {
  return frameHoleCoordinates(7, 5).map(([x, row], i) => ({ id: `hole-${i}`, type: 'pin-hole', position: [x, 0.45 + row, 0], axis: [0, 0, 1] }))
}
function createSmoothPin(color) {
  const g = root('pin-frictionless', color)
  const material = mat(color, 0.30)
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 2.0, 30), material)
  core.rotation.x = Math.PI / 2; core.position.y = 0.28; g.add(core)
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.245, 0.245, 0.12, 30), material)
  collar.rotation.x = Math.PI / 2; collar.position.y = 0.28; g.add(collar)
  return g
}

for (const [length, color] of [[3, 0xd7263d], [7, 0x2d69c4], [11, 0x2b2d31]]) {
  installPart(PARTS, {
    identity: { id: `beam-${length}`, name: `Technic Beam 1×${length}`, category: 'Beams', icon: '•••', description: `${length}L liftarm with true through-holes` },
    visual: { defaultColor: color, family: 'liftarm-v3' },
    dimensions: { lengthStud: length },
    connectors: beamConnectors(length),
    tags: ['beam', 'liftarm', 'technic', `${length}l`, 'parts3'],
    create: c => createBeam(`beam-${length}`, length, c),
  })
}

installPart(PARTS, {
  identity: { id: 'technic-brick-1x4', name: 'Technic Brick 1×4', category: 'Beams', icon: '▥', description: 'Compact studded Technic brick with three true side holes' },
  visual: { defaultColor: 0xd7263d, family: 'technic-brick-v3' },
  dimensions: { lengthStud: 4 },
  connectors: brickConnectors(4),
  tags: ['technic', 'brick', 'hole', '1x4', 'parts3'],
  create: c => createTechnicBrick('technic-brick-1x4', 4, c),
})

installPart(PARTS, {
  identity: { id: 'technic-frame-5x7', name: 'Technic Frame 5×7', category: 'Beams', icon: '▣', description: 'Rigid rectangular 5×7 frame for chassis, gearboxes and suspension mounts' },
  visual: { defaultColor: 0x59626c, family: 'technic-frame-v3' },
  dimensions: { widthStud: 7, heightStud: 5 },
  connectors: frameConnectors(),
  tags: ['frame', 'technic', 'chassis', '5x7', 'parts3'],
  create: createFrame,
})

installPart(PARTS, {
  identity: { id: 'pin-frictionless', name: 'Frictionless Pin 2L', category: 'Connectors', icon: '○', description: 'Smooth 2L hinge pin without molded friction ridges' },
  visual: { defaultColor: 0xadb5bd, family: 'pin-smooth' },
  connectors: [
    { id: 'pin-a', type: 'pin', position: [0, 0.28, -0.5], axis: [0, 0, 1] },
    { id: 'pin-b', type: 'pin', position: [0, 0.28, 0.5], axis: [0, 0, 1] },
  ],
  mechanics: { pinFriction: 0 },
  tags: ['pin', 'frictionless', 'hinge', 'parts3'],
  create: createSmoothPin,
})

globalThis.BrickLabParts3Extra = Object.freeze({
  version: PARTS3_EXTRA_VERSION,
  added: ['beam-3', 'beam-7', 'beam-11', 'technic-brick-1x4', 'technic-frame-5x7', 'pin-frictionless'],
})
window.dispatchEvent(new CustomEvent('bricklab:partcatalogchange', { detail: { total: PARTS.length, pack: PARTS3_EXTRA_VERSION } }))
