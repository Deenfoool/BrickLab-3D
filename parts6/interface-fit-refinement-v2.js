import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { PARTS } from '../parts.js'
import { patchPart } from '../parts3/part-schema-v1.js'
import { REAL_TECHNIC_NOMINAL } from './nominal-dimension-fidelity-v1.js'

export const PARTS6_INTERFACE_FIT_VERSION = 'parts-6-interface-fit-refinement-v2'

const N = REAL_TECHNIC_NOMINAL
const X_AXIS = new THREE.Vector3(1, 0, 0)
const Y_AXIS = new THREE.Vector3(0, 1, 0)
const Z_AXIS = new THREE.Vector3(0, 0, 1)

function absMaterial(color, roughness = 0.38) {
  return new THREE.MeshPhysicalMaterial({ color, roughness, metalness: 0.004, clearcoat: 0.04, clearcoatRoughness: 0.64, ior: 1.47 })
}
function pomMaterial(color) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.42, metalness: 0.004 })
}
function darkMaterial() {
  return new THREE.MeshStandardMaterial({ color: 0x111315, roughness: 0.88, metalness: 0.006, side: THREE.DoubleSide })
}
function metalMaterial() {
  return new THREE.MeshStandardMaterial({ color: 0xaeb6bd, roughness: 0.32, metalness: 0.70 })
}
function visualOnly(object, feature) {
  object.userData.physicsIgnore = true
  object.userData.parts6VisualDetail = true
  object.userData.parts6InterfaceFeature = feature
  return object
}
function axisVector(connector) {
  return new THREE.Vector3(...connector.axis).normalize()
}
function orientFromZ(object, axis) {
  object.quaternion.setFromUnitVectors(Z_AXIS, axis.clone().normalize())
  return object
}
function orientFromX(object, axis) {
  object.quaternion.setFromUnitVectors(X_AXIS, axis.clone().normalize())
  return object
}
function circleHole(radius) {
  const path = new THREE.Path()
  path.absarc(0, 0, radius, 0, Math.PI * 2, true)
  return path
}
function crossPoints(radius = N.axleTipRadius + 0.006, arm = N.axleArmHalfWidth + 0.004) {
  return [
    [-arm, radius], [arm, radius], [arm, arm], [radius, arm], [radius, -arm], [arm, -arm],
    [arm, -radius], [-arm, -radius], [-arm, -arm], [-radius, -arm], [-radius, arm], [-arm, arm],
  ]
}
function crossPath(radius = N.axleTipRadius + 0.006, arm = N.axleArmHalfWidth + 0.004) {
  const path = new THREE.Path()
  const points = crossPoints(radius, arm)
  path.moveTo(...points[0])
  for (let i = 1; i < points.length; i += 1) path.lineTo(...points[i])
  path.closePath()
  return path
}
function socketShape(outer = 0.40) {
  const shape = new THREE.Shape()
  shape.absarc(0, 0, outer, 0, Math.PI * 2, false)
  shape.holes.push(crossPath())
  return shape
}
function annulusShape(outer, inner) {
  const shape = new THREE.Shape()
  shape.absarc(0, 0, outer, 0, Math.PI * 2, false)
  shape.holes.push(circleHole(inner))
  return shape
}
function extrudeCentered(shape, depth, material, options = {}) {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: options.bevelEnabled ?? true,
    bevelSegments: options.bevelSegments ?? 2,
    bevelSize: options.bevelSize ?? 0.006,
    bevelThickness: options.bevelThickness ?? 0.006,
    curveSegments: options.curveSegments ?? 40,
    steps: 1,
  })
  geometry.translate(0, 0, -depth / 2)
  return new THREE.Mesh(geometry, material)
}
function addCrossSocketFace(group, connector, color, options = {}) {
  const axis = axisVector(connector)
  const outer = options.outer ?? 0.40
  const depth = options.depth ?? 0.055
  const offset = options.offset ?? 0
  const boss = visualOnly(extrudeCentered(socketShape(outer), depth, absMaterial(color, 0.43), {
    bevelSegments: 2,
    bevelSize: 0.004,
    bevelThickness: 0.005,
  }), 'axle-socket-boss')
  orientFromZ(boss, axis)
  boss.position.fromArray(connector.position).addScaledVector(axis, offset)
  group.add(boss)

  const face = visualOnly(new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(crossPoints())), darkMaterial()), 'axle-socket-face')
  // Shape(points) is not portable across all Three builds; rebuild explicitly below.
  face.geometry.dispose()
  const cross = new THREE.Shape()
  const points = crossPoints()
  cross.moveTo(...points[0])
  for (let i = 1; i < points.length; i += 1) cross.lineTo(...points[i])
  cross.closePath()
  face.geometry = new THREE.ShapeGeometry(cross, 18)
  orientFromZ(face, axis)
  face.position.fromArray(connector.position).addScaledVector(axis, offset + depth / 2 + 0.003)
  group.add(face)
  return { boss, face }
}
function addPinHoleFace(group, connector, color, options = {}) {
  const axis = axisVector(connector)
  const outer = options.outer ?? N.pinCounterboreRadius
  const depth = options.depth ?? 0.045
  const offset = options.offset ?? 0
  const ring = visualOnly(extrudeCentered(annulusShape(outer, N.pinHoleRadius), depth, absMaterial(color, 0.43), {
    bevelSegments: 2,
    bevelSize: 0.004,
    bevelThickness: 0.004,
  }), 'pin-hole-counterbore')
  orientFromZ(ring, axis)
  ring.position.fromArray(connector.position).addScaledVector(axis, offset)
  group.add(ring)
  return ring
}
function addCrossShaft(group, connector, color, options = {}) {
  const axis = axisVector(connector)
  const length = options.length ?? 0.40
  const outward = options.outward ?? 1
  const material = options.metal ? metalMaterial() : pomMaterial(color)
  const diameter = N.axleTipRadius * 2
  const arm = N.axleArmHalfWidth * 2
  const shaft = new THREE.Group()
  shaft.userData.physicsIgnore = true
  shaft.userData.parts6VisualDetail = true
  shaft.userData.parts6InterfaceFeature = 'nominal-cross-axle-stub'
  const a = new THREE.Mesh(new RoundedBoxGeometry(length, arm, diameter, 3, 0.022), material)
  const b = new THREE.Mesh(new RoundedBoxGeometry(length, diameter, arm, 3, 0.022), material)
  shaft.add(a, b)
  orientFromX(shaft, axis.clone().multiplyScalar(outward))
  shaft.position.fromArray(connector.position).addScaledVector(axis, outward * length * 0.28)
  group.add(shaft)
  return shaft
}
function addPinStub(group, connector, color, options = {}) {
  const axis = axisVector(connector)
  const length = options.length ?? 0.34
  const outward = options.outward ?? 1
  const pin = visualOnly(new THREE.Mesh(
    new THREE.CylinderGeometry(N.pinBodyRadius, N.pinBodyRadius, length, 40),
    pomMaterial(color),
  ), 'nominal-pin-stub')
  pin.quaternion.setFromUnitVectors(Y_AXIS, axis.clone().multiplyScalar(outward))
  pin.position.fromArray(connector.position).addScaledVector(axis, outward * length * 0.20)
  group.add(pin)
  return pin
}
function wrapPart(id, decorate, marker = PARTS6_INTERFACE_FIT_VERSION) {
  const part = PARTS.find(item => item.id === id)
  if (!part) return false
  const previous = part.create
  patchPart(PARTS, id, {
    create: color => {
      const object = previous(color)
      decorate(object, part, color)
      object.userData.visualVersion = marker
      object.userData.parts6InterfaceFit = true
      return object
    },
    interfaceFidelity: marker,
  })
  return true
}
function connector(part, id) {
  return part.connectors.find(item => item.id === id)
}

const upgraded = []

// Wheels: the axle opening is the highest-visibility mechanical interface on a rim.
// Place a true cross-shaped face on both sides of the rim while preserving the
// existing wheel radius/width and its authoritative cylinder collider.
for (const part of PARTS.filter(item => item.mechanics?.wheel)) {
  const id = part.id
  if (!wrapPart(id, (group, definition, color) => {
    const axle = definition.connectors.find(item => item.type === 'axle-hole')
    if (!axle) return
    const axis = axisVector(axle)
    const width = Math.max(0.18, Number(definition.mechanics?.wheel?.width ?? definition.dimensions?.widthStud ?? 0.62))
    const outer = Math.max(0.34, Math.min(0.47, Number(definition.mechanics?.wheel?.radius ?? 1) * 0.20))
    for (const side of [-1, 1]) addCrossSocketFace(group, axle, color, { outer, depth: 0.050, offset: side * width * 0.47 })
  })) upgraded.push(id)
}

// Bevel gears share the same nominal cross axle interface as spur gears.
for (const part of PARTS.filter(item => item.mechanics?.gear?.kind === 'bevel')) {
  const id = part.id
  if (!wrapPart(id, (group, definition, color) => {
    const axle = definition.connectors.find(item => item.type === 'axle-hole')
    if (!axle) return
    const thickness = Math.max(0.34, Number(definition.dimensions?.thicknessStud ?? 0.42))
    for (const side of [-1, 1]) addCrossSocketFace(group, axle, color, { outer: 0.37, depth: 0.045, offset: side * thickness * 0.48 })
  })) upgraded.push(id)
}

// Housing ports: use connector metadata as the source of truth, rather than painting
// arbitrary black crosses at hand-tuned positions.
for (const [id, ids, outer] of [
  ['gearbox-fnr', ['input', 'output'], 0.41],
  ['open-differential', ['input', 'left', 'right'], 0.42],
  ['universal-joint-30', ['input', 'output'], 0.35],
  ['cv-joint-30', ['input', 'output'], 0.36],
  ['worm-drive-8', ['input', 'output'], 0.36],
]) {
  if (!wrapPart(id, (group, definition, color) => {
    for (const connectorId of ids) {
      const port = connector(definition, connectorId)
      if (port?.type === 'axle-hole') addCrossSocketFace(group, port, color, { outer, depth: 0.050 })
    }
  })) continue
  upgraded.push(id)
}

// Inline sensors have one through axle-hole connector at the body centre. Expose the
// same nominal cross opening on both end caps instead of a smaller legacy symbol.
for (const id of ['rpm-sensor', 'torque-sensor']) {
  if (!wrapPart(id, (group, definition, color) => {
    const port = definition.connectors.find(item => item.type === 'axle-hole')
    if (!port) return
    for (const side of [-1, 1]) addCrossSocketFace(group, port, color, { outer: 0.37, depth: 0.046, offset: side * 0.315 })
  })) continue
  upgraded.push(id)
}

// Bearing / pin-hole families: standardize visible 4.8 mm bores and 6 mm shallow
// counterbores. This is a visual finish only; hole-safe collider profiles stay intact.
for (const [id, connectorIds, offsets] of [
  ['bearing-block', ['bearing'], [-0.68, 0.68]],
  ['steering-base', ['pivot-hole'], [-0.16, 0.16]],
  ['steering-tie-rod-5', ['left', 'right'], [-0.15, 0.15]],
  ['shock-body-5', ['mount'], [-0.15, 0.15]],
  ['shock-rod-5', ['mount'], [-0.15, 0.15]],
  ['connector-triple', ['hole-0', 'hole-1', 'hole-2'], [-0.33, 0.33]],
  ['suspension-arm-5', ['hole-1', 'hole-2', 'hole-3', 'hole-4'], [-0.35, 0.35]],
]) {
  if (!wrapPart(id, (group, definition, color) => {
    for (const connectorId of connectorIds) {
      const port = connector(definition, connectorId)
      if (!port || port.type !== 'pin-hole') continue
      for (const offset of offsets) addPinHoleFace(group, port, color, { offset })
    }
  })) continue
  upgraded.push(id)
}

// Angle/perpendicular connector axes differ per port, so decorate all pin-hole ports
// directly from their connector axis rather than assuming a global Z bore.
for (const id of ['connector-angle', 'connector-perpendicular']) {
  if (!wrapPart(id, (group, definition, color) => {
    for (const port of definition.connectors.filter(item => item.type === 'pin-hole')) {
      for (const offset of [-0.30, 0.30]) addPinHoleFace(group, port, color, { offset })
    }
    for (const port of definition.connectors.filter(item => item.type === 'axle-hole')) {
      for (const offset of [-0.34, 0.34]) addCrossSocketFace(group, port, color, { outer: 0.38, depth: 0.045, offset })
    }
  })) continue
  upgraded.push(id)
}

// Solid mechanical ports should visibly agree with their connector type.
if (wrapPart('motor', (group, definition, color) => {
  const output = connector(definition, 'output')
  if (output?.type === 'axle') addCrossShaft(group, output, color, { length: 0.48, outward: 1, metal: true })
})) upgraded.push('motor')

if (wrapPart('wheel-hub', (group, definition, color) => {
  const bearing = connector(definition, 'bearing')
  const stub = connector(definition, 'wheel-stub')
  if (bearing?.type === 'axle') addCrossShaft(group, bearing, color, { length: 0.30, outward: -1 })
  if (stub?.type === 'axle') addCrossShaft(group, stub, color, { length: 0.54, outward: 1 })
})) upgraded.push('wheel-hub')

if (wrapPart('steering-knuckle', (group, definition, color) => {
  const bearing = connector(definition, 'wheel-bearing')
  if (bearing?.type === 'pin-hole') {
    for (const offset of [-0.38, 0.38]) addPinHoleFace(group, bearing, color, { offset })
  }
  const arm = connector(definition, 'steering-arm')
  if (arm?.type === 'pin') addPinStub(group, arm, color, { length: 0.34, outward: 1 })
})) upgraded.push('steering-knuckle')

if (wrapPart('axle-pin', (group, definition, color) => {
  const axle = connector(definition, 'axle')
  const pin = connector(definition, 'pin')
  if (axle?.type === 'axle') addCrossShaft(group, axle, color, { length: 0.48, outward: 1 })
  if (pin?.type === 'pin') addPinStub(group, pin, color, { length: 0.38, outward: -1 })
})) upgraded.push('axle-pin')

globalThis.BrickLabParts6InterfaceFit = Object.freeze({
  version: PARTS6_INTERFACE_FIT_VERSION,
  nominal: {
    pinHoleDiameterStud: N.pinHoleRadius * 2,
    axleTipWidthStud: N.axleTipRadius * 2,
    pinBodyDiameterStud: N.pinBodyRadius * 2,
  },
  upgraded: [...new Set(upgraded)],
  rule: 'visible mating interface is derived from connector type, connector axis and one nominal Technic dimension source',
  physics: 'decorative interface finish meshes are physicsIgnore; mechanics/connectors are not mutated',
})

window.dispatchEvent(new CustomEvent('bricklab:partcatalogchange', {
  detail: { total: PARTS.length, pack: PARTS6_INTERFACE_FIT_VERSION },
}))
