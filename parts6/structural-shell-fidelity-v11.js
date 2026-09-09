import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { PARTS } from '../parts.js'
import { patchPart } from '../parts3/part-schema-v1.js'
import { REAL_TECHNIC_NOMINAL } from './nominal-dimension-fidelity-v1.js'

export const PARTS6_STRUCTURAL_SHELL_FIDELITY_VERSION = 'parts-6-structural-shell-fidelity-v11'

const N = REAL_TECHNIC_NOMINAL
const Y_AXIS = new THREE.Vector3(0, 1, 0)

function absMaterial(color, roughness = 0.39) {
  return new THREE.MeshPhysicalMaterial({ color, roughness, metalness: 0.004, clearcoat: 0.028, clearcoatRoughness: 0.69, ior: 1.47 })
}
function darkMaterial(color = 0x111315) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.88, metalness: 0.004, side: THREE.DoubleSide })
}
function visualOnly(object, feature) {
  object.userData.physicsIgnore = true
  object.userData.parts6VisualDetail = true
  object.userData.parts6StructuralShellFeature = feature
  return object
}
function root(id, color) {
  const group = new THREE.Group()
  group.userData.partId = id
  group.userData.color = color
  group.userData.visualVersion = PARTS6_STRUCTURAL_SHELL_FIDELITY_VERSION
  return group
}
function circleHole(x, y, radius) {
  const path = new THREE.Path()
  path.absarc(x, y, radius, 0, Math.PI * 2, true)
  return path
}
function roundedRect(width, height, radius, cx = 0, cy = 0) {
  const x = cx - width / 2
  const y = cy - height / 2
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
function annulusShape(outer, inner) {
  const shape = new THREE.Shape()
  shape.absarc(0, 0, outer, 0, Math.PI * 2, false)
  shape.holes.push(circleHole(0, 0, inner))
  return shape
}
function extrude(shape, depth, material, options = {}) {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: options.bevelEnabled ?? true,
    bevelSegments: options.bevelSegments ?? 4,
    bevelSize: options.bevelSize ?? 0.010,
    bevelThickness: options.bevelThickness ?? 0.010,
    curveSegments: options.curveSegments ?? 40,
    steps: 1,
  })
  geometry.translate(0, 0, -depth / 2)
  return new THREE.Mesh(geometry, material)
}
function extrudeAlongY(shape, depth, material, options = {}) {
  const mesh = extrude(shape, depth, material, options)
  mesh.rotation.x = Math.PI / 2
  return mesh
}
function addHoleFinish(group, x, y, depth, color, prefix) {
  const liner = visualOnly(new THREE.Mesh(
    new THREE.CylinderGeometry(N.pinHoleRadius * 0.997, N.pinHoleRadius * 0.997, depth + 0.012, 44, 1, true),
    darkMaterial(new THREE.Color(color).multiplyScalar(0.43)),
  ), `${prefix}-bore-liner`)
  liner.rotation.x = Math.PI / 2
  liner.position.set(x, y, 0)
  group.add(liner)

  const centre = (N.pinCounterboreRadius + N.pinHoleRadius) / 2
  const tube = (N.pinCounterboreRadius - N.pinHoleRadius) / 2
  for (const side of [-1, 1]) {
    const ring = visualOnly(new THREE.Mesh(
      new THREE.TorusGeometry(centre, tube, 8, 44),
      absMaterial(color, 0.47),
    ), `${prefix}-counterbore`)
    ring.position.set(x, y, side * (depth / 2 + 0.004))
    group.add(ring)
  }
}

function legacyProxy(previousFactory, color) {
  const proxy = previousFactory(color)
  proxy.visible = false
  proxy.name = 'parts6-v11-legacy-structural-collider-proxy'
  proxy.userData.parts6LegacyStructuralColliderProxy = PARTS6_STRUCTURAL_SHELL_FIDELITY_VERSION
  proxy.traverse(child => {
    if (child.isMesh) child.raycast = () => {}
  })
  return proxy
}
function withLegacyProxy(group, previousFactory, color) {
  group.add(legacyProxy(previousFactory, color))
  return group
}

function createTechnicBrick(part, color, previousFactory) {
  const group = withLegacyProxy(root(part.id, color), previousFactory, color)
  const material = absMaterial(color)
  const studs = part.connectors.filter(item => item.type === 'stud').sort((a, b) => a.position[0] - b.position[0])
  const tubes = part.connectors.filter(item => item.type === 'tube').sort((a, b) => a.position[0] - b.position[0])
  const holes = part.connectors.filter(item => item.type === 'pin-hole').sort((a, b) => a.position[0] - b.position[0])
  const length = Math.max(1, studs.length || Number(part.dimensions?.lengthStud) || 4)
  const width = Math.max(0.92, length - 0.08)
  const depth = 0.88
  const sideWall = 0.115
  const sideZ = depth / 2 - sideWall / 2

  // Two true side shells carry the horizontal pin bores. The underside remains open.
  const sideShape = roundedRect(width, 1.05, 0.09, 0, 0.60)
  for (const port of holes) sideShape.holes.push(circleHole(port.position[0], port.position[1], N.pinHoleRadius))
  for (const side of [-1, 1]) {
    const panel = visualOnly(extrude(sideShape, sideWall, material, { bevelSegments: 3, bevelSize: 0.008, bevelThickness: 0.008 }), 'technic-brick-side-shell')
    panel.position.z = side * sideZ
    group.add(panel)
  }

  // Top deck reaches the stud connector plane, and the end walls overlap it slightly,
  // so neither studs nor shell panels float when inspected from a glancing angle.
  const topDeck = visualOnly(new THREE.Mesh(new RoundedBoxGeometry(width, 0.20, depth, 4, 0.055), material), 'technic-brick-top-deck')
  topDeck.position.set(0, 1.10, 0)
  group.add(topDeck)
  for (const side of [-1, 1]) {
    const endWall = visualOnly(new THREE.Mesh(new RoundedBoxGeometry(0.15, 0.94, depth, 4, 0.050), material), 'technic-brick-end-wall')
    endWall.position.set(side * (width / 2 - 0.075), 0.55, 0)
    group.add(endWall)
  }

  // Hollow underside tubes follow actual tube connector centres. These are visible
  // through the open bottom and are tied together by thin injection-molded webs.
  for (const port of tubes) {
    const tube = visualOnly(extrudeAlongY(annulusShape(0.29, 0.185), 0.62, material, { bevelSegments: 3, bevelSize: 0.006, bevelThickness: 0.006 }), 'technic-brick-underside-tube-v11')
    tube.position.set(port.position[0], 0.31, port.position[2] ?? 0)
    group.add(tube)
  }
  for (let i = 0; i < tubes.length - 1; i += 1) {
    const x0 = tubes[i].position[0]
    const x1 = tubes[i + 1].position[0]
    const web = visualOnly(new THREE.Mesh(new RoundedBoxGeometry(Math.max(0.08, x1 - x0 - 0.48), 0.10, 0.12, 2, 0.025), material), 'technic-brick-underside-web-v11')
    web.position.set((x0 + x1) / 2, 0.20, 0)
    group.add(web)
  }

  const studMaterial = absMaterial(color, 0.34)
  for (const port of studs) {
    const stud = visualOnly(new THREE.Mesh(
      new THREE.CylinderGeometry(N.studDiameter / 2 * 0.985, N.studDiameter / 2, N.studHeight, 44),
      studMaterial,
    ), 'technic-brick-stud-v11')
    stud.position.set(port.position[0], port.position[1] + N.studHeight / 2, port.position[2] ?? 0)
    group.add(stud)
    const topWitness = visualOnly(new THREE.Mesh(new THREE.CircleGeometry(0.034, 18), absMaterial(color, 0.48)), 'technic-brick-stud-gate-witness')
    topWitness.rotation.x = -Math.PI / 2
    topWitness.position.set(port.position[0], port.position[1] + N.studHeight + 0.002, port.position[2] ?? 0)
    group.add(topWitness)
  }

  for (const port of holes) addHoleFinish(group, port.position[0], port.position[1], depth, color, 'technic-brick-side-hole')

  group.userData.structuralShellFidelity = {
    family: 'hollow-technic-brick',
    trueSideBores: holes.length,
    undersideTubes: tubes.length,
    openUnderside: true,
    studDeckContinuous: true,
  }
  return group
}

function createFrame(part, color, previousFactory) {
  const group = withLegacyProxy(root(part.id, color), previousFactory, color)
  const material = absMaterial(color)
  const holes = part.connectors.filter(item => item.type === 'pin-hole')
  const xs = holes.map(item => item.position[0])
  const ys = holes.map(item => item.position[1])
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2
  const outerWidth = maxX - minX + 0.90
  const outerHeight = maxY - minY + 0.90
  const innerWidth = Math.max(0.80, outerWidth - 1.84)
  const innerHeight = Math.max(0.80, outerHeight - 1.84)
  const depth = 0.78

  const frameShape = roundedRect(outerWidth, outerHeight, 0.43, centerX, centerY)
  frameShape.holes.push(roundedRect(innerWidth, innerHeight, 0.34, centerX, centerY))
  for (const port of holes) frameShape.holes.push(circleHole(port.position[0], port.position[1], N.pinHoleRadius))

  const body = visualOnly(extrude(frameShape, depth, material, { bevelSegments: 5, bevelSize: 0.015, bevelThickness: 0.015, curveSegments: 48 }), 'technic-frame-main-shell-v11')
  group.add(body)
  for (const port of holes) addHoleFinish(group, port.position[0], port.position[1], depth, color, 'technic-frame-hole')

  // Four shallow inner-edge ribs reproduce the molded reinforcement surrounding the
  // open window. They sit just inside the frame faces instead of floating outside it.
  const innerHalfW = innerWidth / 2
  const innerHalfH = innerHeight / 2
  const faceZ = depth / 2 + 0.004
  for (const side of [-1, 1]) {
    for (const y of [centerY - innerHalfH - 0.11, centerY + innerHalfH + 0.11]) {
      const rib = visualOnly(new THREE.Mesh(new RoundedBoxGeometry(innerWidth - 0.20, 0.075, 0.018, 2, 0.018), material), 'technic-frame-inner-lip-v11')
      rib.position.set(centerX, y, side * faceZ)
      group.add(rib)
    }
    for (const x of [centerX - innerHalfW - 0.11, centerX + innerHalfW + 0.11]) {
      const rib = visualOnly(new THREE.Mesh(new RoundedBoxGeometry(0.075, innerHeight - 0.20, 0.018, 2, 0.018), material), 'technic-frame-inner-lip-v11')
      rib.position.set(x, centerY, side * faceZ)
      group.add(rib)
    }
  }

  // Corner gussets are inset around the window corners; they add the characteristic
  // stiff molded transition without covering any perimeter pin bore.
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    const gusset = visualOnly(new THREE.Mesh(new RoundedBoxGeometry(0.30, 0.16, depth * 0.78, 3, 0.045), material), 'technic-frame-corner-gusset-v11')
    gusset.position.set(centerX + sx * (innerHalfW + 0.12), centerY + sy * (innerHalfH + 0.12), 0)
    gusset.rotation.z = sx * sy * 0.68
    group.add(gusset)
  }

  group.userData.structuralShellFidelity = {
    family: 'open-technic-frame',
    truePerimeterBores: holes.length,
    reinforcedWindow: true,
    roundedMoldedCorners: true,
  }
  return group
}

const upgraded = []
const proxyParts = []

for (const part of PARTS.filter(item => /^technic-brick-1x\d+$/.test(item.id))) {
  if (typeof part.create !== 'function') continue
  const previous = part.create
  patchPart(PARTS, part.id, {
    create: color => createTechnicBrick(part, color, previous),
    visualQuality: 'parts-6-hollow-technic-brick-shell-v11',
  })
  upgraded.push(part.id)
  proxyParts.push(part.id)
}

const frame = PARTS.find(item => item.id === 'technic-frame-5x7')
if (frame && typeof frame.create === 'function') {
  const previous = frame.create
  patchPart(PARTS, frame.id, {
    create: color => createFrame(frame, color, previous),
    visualQuality: 'parts-6-open-reinforced-frame-v11',
  })
  upgraded.push(frame.id)
  proxyParts.push(frame.id)
}

globalThis.BrickLabParts6StructuralShellFidelity = Object.freeze({
  version: PARTS6_STRUCTURAL_SHELL_FIDELITY_VERSION,
  upgraded,
  proxyParts,
  geometry: 'hollow studded Technic brick shells with continuous stud deck and connector-aligned underside tubes + reinforced open 5x7 frame with true perimeter bores',
  physics: 'complete pre-v11 render trees remain invisible non-ignored collider/bounds proxies; every new visible v11 mesh is physicsIgnore and connector/mechanics metadata is untouched',
})

window.dispatchEvent(new CustomEvent('bricklab:partcatalogchange', {
  detail: { total: PARTS.length, pack: PARTS6_STRUCTURAL_SHELL_FIDELITY_VERSION },
}))
