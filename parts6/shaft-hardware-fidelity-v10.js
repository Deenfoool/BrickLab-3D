import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { PARTS } from '../parts.js'
import { patchPart } from '../parts3/part-schema-v1.js'
import { REAL_TECHNIC_NOMINAL } from './nominal-dimension-fidelity-v1.js'

export const PARTS6_SHAFT_HARDWARE_FIDELITY_VERSION = 'parts-6-shaft-hardware-fidelity-v10'

const N = REAL_TECHNIC_NOMINAL
const X_AXIS = new THREE.Vector3(1, 0, 0)
const Y_AXIS = new THREE.Vector3(0, 1, 0)
const Z_AXIS = new THREE.Vector3(0, 0, 1)

function pomMaterial(color, roughness = 0.44) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.004 })
}
function darkMaterial() {
  return new THREE.MeshStandardMaterial({ color: 0x101214, roughness: 0.91, metalness: 0.004, side: THREE.DoubleSide })
}
function visualOnly(object, feature) {
  object.userData.physicsIgnore = true
  object.userData.parts6VisualDetail = true
  object.userData.parts6ShaftHardwareFeature = feature
  return object
}
function root(id, color) {
  const group = new THREE.Group()
  group.userData.partId = id
  group.userData.color = color
  group.userData.visualVersion = PARTS6_SHAFT_HARDWARE_FIDELITY_VERSION
  return group
}
function circleHole(radius, x = 0, y = 0) {
  const path = new THREE.Path()
  path.absarc(x, y, radius, 0, Math.PI * 2, true)
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
function annulusShape(outer, inner) {
  const shape = new THREE.Shape()
  shape.absarc(0, 0, outer, 0, Math.PI * 2, false)
  shape.holes.push(circleHole(inner))
  return shape
}
function crossBoreShape(outer, clearance = 0.006) {
  const shape = new THREE.Shape()
  shape.absarc(0, 0, outer, 0, Math.PI * 2, false)
  shape.holes.push(crossPath(N.axleTipRadius + clearance, N.axleArmHalfWidth + clearance * 0.65))
  return shape
}
function extrude(shape, depth, material, options = {}) {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: options.bevelEnabled ?? true,
    bevelSegments: options.bevelSegments ?? 4,
    bevelSize: options.bevelSize ?? 0.008,
    bevelThickness: options.bevelThickness ?? 0.008,
    curveSegments: options.curveSegments ?? 40,
    steps: 1,
  })
  geometry.translate(0, 0, -depth / 2)
  return new THREE.Mesh(geometry, material)
}
function extrudeAlongX(shape, depth, material, options = {}) {
  const mesh = extrude(shape, depth, material, options)
  mesh.rotation.y = Math.PI / 2
  return mesh
}
function extrudeAlongY(shape, depth, material, options = {}) {
  const mesh = extrude(shape, depth, material, options)
  mesh.rotation.x = Math.PI / 2
  return mesh
}
function cylinderAlong(axis, radiusTop, radiusBottom, length, material, feature, segments = 36, thetaStart = 0, thetaLength = Math.PI * 2) {
  const mesh = visualOnly(new THREE.Mesh(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, length, segments, 1, false, thetaStart, thetaLength),
    material,
  ), feature)
  mesh.quaternion.setFromUnitVectors(Y_AXIS, axis.clone().normalize())
  return mesh
}
function roundedBarBetween(a, b, thickness, depth, material, feature) {
  const delta = b.clone().sub(a)
  const length = Math.max(0.04, Math.hypot(delta.x, delta.y))
  const mesh = visualOnly(new THREE.Mesh(
    new RoundedBoxGeometry(length, thickness, depth, 4, Math.min(0.07, thickness * 0.34, depth * 0.28)),
    material,
  ), feature)
  mesh.position.copy(a).add(b).multiplyScalar(0.5)
  mesh.rotation.z = Math.atan2(delta.y, delta.x)
  return mesh
}

// Keep the exact pre-v10 render tree as an invisible collision/bounds proxy. New
// visible geometry is physicsIgnore, so generic bounds/rotational collider logic sees
// the same non-ignored geometry it saw before this pass. The proxy is not raycastable.
function legacyProxy(previousFactory, color) {
  const proxy = previousFactory(color)
  proxy.visible = false
  proxy.name = 'parts6-v10-legacy-collider-proxy'
  proxy.userData.parts6LegacyColliderProxy = PARTS6_SHAFT_HARDWARE_FIDELITY_VERSION
  proxy.traverse(child => {
    if (child.isMesh) child.raycast = () => {}
  })
  return proxy
}
function withLegacyProxy(group, previousFactory, color) {
  group.add(legacyProxy(previousFactory, color))
  return group
}

function pinLengthFor(part) {
  if (part.id === 'pin-long') return 3.0
  if (part.id === 'pin-half') return 0.90
  return 2.0
}
function addSplitPinEnd(group, side, totalLength, material, friction) {
  const collarHalf = Math.min(0.072, totalLength * 0.045)
  const available = Math.max(0.18, totalLength / 2 - collarHalf)
  const tipLength = Math.min(0.20, available * 0.34)
  const straightLength = Math.max(0.10, available - tipLength)
  const straightCenter = side * (collarHalf + straightLength / 2)
  const tipCenter = side * (totalLength / 2 - tipLength / 2)
  const lobeArc = Math.PI * 0.77
  const gapStart = Math.PI * 0.115

  for (const phase of [0, Math.PI]) {
    const shaft = cylinderAlong(Z_AXIS, N.pinBodyRadius, N.pinBodyRadius, straightLength + 0.012, material, 'pin-elastic-lobe', 32, gapStart + phase, lobeArc)
    shaft.position.set(0, 0.28, straightCenter)
    group.add(shaft)

    const tip = cylinderAlong(Z_AXIS, N.pinBodyRadius * 0.80, N.pinBodyRadius, tipLength, material, 'pin-lead-in-lobe', 32, gapStart + phase, lobeArc)
    tip.position.set(0, 0.28, tipCenter)
    if (side < 0) tip.rotation.x += Math.PI
    group.add(tip)
  }

  if (friction && available > 0.30) {
    const ridgeZ = side * Math.min(totalLength * 0.31, totalLength / 2 - tipLength * 0.70)
    for (const phase of [0.12 * Math.PI, 1.12 * Math.PI]) {
      const ridge = visualOnly(new THREE.Mesh(
        new THREE.TorusGeometry(N.pinFrictionRadius, 0.017, 7, 30, Math.PI * 0.72),
        material,
      ), 'pin-friction-ridge')
      ridge.rotation.z = phase
      ridge.position.set(0, 0.28, ridgeZ)
      group.add(ridge)
    }
  }
}
function createPin(part, color, previousFactory, friction) {
  const length = pinLengthFor(part)
  const group = withLegacyProxy(root(part.id, color), previousFactory, color)
  const material = pomMaterial(color, friction ? 0.48 : 0.40)
  const collarRadius = friction ? N.pinCounterboreRadius * 0.92 : N.pinCounterboreRadius * 0.84
  const collarLength = Math.min(0.145, Math.max(0.10, length * 0.08))

  const collar = cylinderAlong(Z_AXIS, collarRadius, collarRadius, collarLength, material, 'pin-center-collar', 44)
  collar.position.set(0, 0.28, 0)
  group.add(collar)
  const collarGroove = visualOnly(new THREE.Mesh(new THREE.TorusGeometry(collarRadius * 0.92, 0.012, 6, 42), darkMaterial()), 'pin-collar-mold-groove')
  collarGroove.position.set(0, 0.28, 0)
  group.add(collarGroove)

  addSplitPinEnd(group, -1, length, material, friction)
  addSplitPinEnd(group, 1, length, material, friction)

  for (const side of [-1, 1]) {
    const witness = visualOnly(new THREE.Mesh(new THREE.CircleGeometry(N.pinBodyRadius * 0.30, 18), pomMaterial(color, 0.52)), 'pin-end-gate-witness')
    witness.position.set(0, 0.28, side * (length / 2 + 0.002))
    if (side < 0) witness.rotation.y = Math.PI
    group.add(witness)
  }

  group.userData.shaftHardwareFidelity = {
    family: friction ? 'split-friction-pin' : 'split-frictionless-pin',
    trueElasticSlots: true,
    taperedLeadIn: true,
    lengthStud: length,
  }
  return group
}

function createAxlePin(part, color, previousFactory) {
  const group = withLegacyProxy(root(part.id, color), previousFactory, color)
  const material = pomMaterial(color, 0.45)
  const pinPort = part.connectors.find(item => item.id === 'pin')
  const axlePort = part.connectors.find(item => item.id === 'axle')
  const y = pinPort?.position?.[1] ?? axlePort?.position?.[1] ?? 0.30

  // Pin half: real split lobes centred on the semantic pin side.
  const pinCenter = pinPort?.position?.[2] ?? -0.70
  const pinHalfLength = 1.05
  const lobeArc = Math.PI * 0.77
  for (const phase of [0.115 * Math.PI, 1.115 * Math.PI]) {
    const lobe = cylinderAlong(Z_AXIS, N.pinBodyRadius * 0.84, N.pinBodyRadius, pinHalfLength, material, 'axle-pin-elastic-pin-lobe', 32, phase, lobeArc)
    lobe.position.set(0, y, pinCenter + 0.20)
    group.add(lobe)
  }
  for (const phase of [0.12 * Math.PI, 1.12 * Math.PI]) {
    const ridge = visualOnly(new THREE.Mesh(new THREE.TorusGeometry(N.pinFrictionRadius, 0.017, 7, 30, Math.PI * 0.72), material), 'axle-pin-friction-ridge')
    ridge.rotation.z = phase
    ridge.position.set(0, y, pinCenter - 0.03)
    group.add(ridge)
  }

  const collar = cylinderAlong(Z_AXIS, N.pinCounterboreRadius * 0.93, N.pinCounterboreRadius * 0.93, 0.14, material, 'axle-pin-center-collar', 44)
  collar.position.set(0, y, 0)
  group.add(collar)

  // Axle half: one continuous nominal cross section with a chamfered end.
  const axleCenter = axlePort?.position?.[2] ?? 0.70
  const shape = new THREE.Shape()
  const points = crossPoints(N.axleTipRadius, N.axleArmHalfWidth)
  shape.moveTo(...points[0])
  for (let i = 1; i < points.length; i += 1) shape.lineTo(...points[i])
  shape.closePath()
  const axle = visualOnly(extrude(shape, 1.12, material, { bevelSegments: 3, bevelSize: 0.010, bevelThickness: 0.014 }), 'axle-pin-cross-shaft')
  axle.position.set(0, y, axleCenter - 0.16)
  group.add(axle)

  group.userData.shaftHardwareFidelity = { family: 'hybrid-axle-pin', trueElasticSlot: true, nominalCrossAxle: true }
  return group
}

function createBush(part, color, previousFactory) {
  const group = withLegacyProxy(root(part.id, color), previousFactory, color)
  const material = pomMaterial(color, 0.43)
  const width = Math.max(0.28, Number(part.dimensions?.lengthStud) || (part.id === 'half-bush' ? 0.38 : 0.72))
  const y = 0.36
  const shell = visualOnly(extrudeAlongX(crossBoreShape(0.385), width, material, { bevelSegments: 4, bevelSize: 0.010, bevelThickness: 0.010 }), 'bush-cross-bore-shell')
  shell.position.y = y
  group.add(shell)

  for (const side of [-1, 1]) {
    const shoulder = visualOnly(new THREE.Mesh(new THREE.TorusGeometry(0.345, 0.020, 7, 44), material), 'bush-face-shoulder')
    shoulder.rotation.y = Math.PI / 2
    shoulder.position.set(side * (width / 2 + 0.004), y, 0)
    group.add(shoulder)
  }

  const grooveCount = part.id === 'half-bush' ? 1 : 2
  for (let i = 0; i < grooveCount; i += 1) {
    const x = grooveCount === 1 ? 0 : (i ? 1 : -1) * width * 0.20
    const groove = visualOnly(new THREE.Mesh(new THREE.TorusGeometry(0.371, 0.011, 6, 44), darkMaterial()), 'bush-circumferential-groove')
    groove.rotation.y = Math.PI / 2
    groove.position.set(x, y, 0)
    group.add(groove)
  }

  group.userData.shaftHardwareFidelity = { family: part.id === 'half-bush' ? 'half-bush' : 'full-bush', trueCrossBore: true }
  return group
}

function createCoupler(part, color, previousFactory) {
  const group = withLegacyProxy(root(part.id, color), previousFactory, color)
  const material = pomMaterial(color, 0.44)
  const width = 1.50
  const y = 0.38
  const shell = visualOnly(extrudeAlongX(crossBoreShape(0.405), width, material, { bevelSegments: 4, bevelSize: 0.012, bevelThickness: 0.012 }), 'coupler-through-cross-bore')
  shell.position.y = y
  group.add(shell)

  for (const side of [-1, 1]) {
    const lip = visualOnly(new THREE.Mesh(new THREE.TorusGeometry(0.358, 0.020, 7, 48), material), 'coupler-end-lip')
    lip.rotation.y = Math.PI / 2
    lip.position.set(side * (width / 2 + 0.003), y, 0)
    group.add(lip)
  }
  for (let i = 0; i < 8; i += 1) {
    const angle = i / 8 * Math.PI * 2
    const rib = visualOnly(new THREE.Mesh(new RoundedBoxGeometry(width * 0.76, 0.034, 0.034, 2, 0.009), material), 'coupler-longitudinal-mold-rib')
    rib.position.set(0, y + Math.cos(angle) * 0.392, Math.sin(angle) * 0.392)
    rib.rotation.x = angle
    group.add(rib)
  }
  for (const x of [-0.50, 0, 0.50]) {
    const band = visualOnly(new THREE.Mesh(new THREE.TorusGeometry(0.382, 0.012, 6, 48), darkMaterial()), 'coupler-circumferential-mold-line')
    band.rotation.y = Math.PI / 2
    band.position.set(x, y, 0)
    group.add(band)
  }

  group.userData.shaftHardwareFidelity = { family: 'axle-coupler', trueThroughCrossBore: true, moldedRibs: 8 }
  return group
}

function createTripleConnector(part, color, previousFactory) {
  const group = withLegacyProxy(root(part.id, color), previousFactory, color)
  const material = pomMaterial(color, 0.44)
  const holes = [...part.connectors].filter(item => item.type === 'pin-hole').sort((a, b) => a.position[0] - b.position[0])
  for (const port of holes) {
    const ring = visualOnly(extrude(annulusShape(0.405, N.pinHoleRadius), 0.78, material, { bevelSegments: 4, bevelSize: 0.011, bevelThickness: 0.011 }), 'triple-connector-bored-eye')
    ring.position.fromArray(port.position)
    group.add(ring)
    const liner = cylinderAlong(Z_AXIS, N.pinHoleRadius * 0.996, N.pinHoleRadius * 0.996, 0.79, darkMaterial(), 'triple-connector-bore-liner', 44)
    liner.position.fromArray(port.position)
    group.add(liner)
  }
  for (let i = 0; i < holes.length - 1; i += 1) {
    const a = new THREE.Vector3(...holes[i].position)
    const b = new THREE.Vector3(...holes[i + 1].position)
    for (const yOffset of [-0.22, 0.22]) {
      const web = roundedBarBetween(a.clone().add(new THREE.Vector3(0, yOffset, 0)), b.clone().add(new THREE.Vector3(0, yOffset, 0)), 0.18, 0.66, material, 'triple-connector-molded-web')
      group.add(web)
    }
  }
  group.userData.shaftHardwareFidelity = { family: 'triple-pin-connector', trueBores: holes.length }
  return group
}

function createPerpendicularConnector(part, color, previousFactory) {
  const group = withLegacyProxy(root(part.id, color), previousFactory, color)
  const material = pomMaterial(color, 0.43)
  const axlePorts = part.connectors.filter(item => item.type === 'axle-hole')
  const pinPort = part.connectors.find(item => item.type === 'pin-hole')
  const center = pinPort ? new THREE.Vector3(...pinPort.position) : new THREE.Vector3(0, 0.42, 0)

  const barrel = visualOnly(extrudeAlongX(crossBoreShape(0.405), 1.28, material, { bevelSegments: 4, bevelSize: 0.010, bevelThickness: 0.010 }), 'perpendicular-connector-axle-barrel')
  barrel.position.copy(center)
  group.add(barrel)

  if (pinPort) {
    const eye = visualOnly(extrude(annulusShape(0.405, N.pinHoleRadius), 0.80, material, { bevelSegments: 4, bevelSize: 0.010, bevelThickness: 0.010 }), 'perpendicular-connector-pin-eye')
    eye.position.copy(center)
    group.add(eye)
    const liner = cylinderAlong(Z_AXIS, N.pinHoleRadius * 0.996, N.pinHoleRadius * 0.996, 0.81, darkMaterial(), 'perpendicular-connector-pin-bore', 44)
    liner.position.copy(center)
    group.add(liner)
  }

  for (const port of axlePorts) {
    const lip = visualOnly(new THREE.Mesh(new THREE.TorusGeometry(0.355, 0.018, 7, 44), material), 'perpendicular-connector-axle-lip')
    lip.rotation.y = Math.PI / 2
    lip.position.fromArray(port.position)
    group.add(lip)
  }
  group.userData.shaftHardwareFidelity = { family: 'perpendicular-connector', trueAxleBore: true, truePinBore: Boolean(pinPort) }
  return group
}

function createAngleConnector(part, color, previousFactory) {
  const group = withLegacyProxy(root(part.id, color), previousFactory, color)
  const material = pomMaterial(color, 0.43)
  const ports = part.connectors.filter(item => item.type === 'pin-hole')
  for (const port of ports) {
    const axis = new THREE.Vector3(...port.axis).normalize()
    const eye = visualOnly(extrude(annulusShape(0.405, N.pinHoleRadius), 0.72, material, { bevelSegments: 4, bevelSize: 0.010, bevelThickness: 0.010 }), 'angle-connector-bored-eye')
    eye.quaternion.setFromUnitVectors(Z_AXIS, axis)
    eye.position.fromArray(port.position)
    group.add(eye)
    const liner = cylinderAlong(axis, N.pinHoleRadius * 0.996, N.pinHoleRadius * 0.996, 0.73, darkMaterial(), 'angle-connector-bore-liner', 44)
    liner.position.fromArray(port.position)
    group.add(liner)
  }
  if (ports.length >= 2) {
    const a = new THREE.Vector3(...ports[0].position)
    const b = new THREE.Vector3(...ports[1].position)
    const bridge = roundedBarBetween(a, b, 0.28, 0.42, material, 'angle-connector-molded-bridge')
    group.add(bridge)
    const gusset = visualOnly(new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.30, 0.34, 4, 0.08), material), 'angle-connector-corner-gusset')
    gusset.position.copy(a).lerp(b, 0.5)
    group.add(gusset)
  }
  group.userData.shaftHardwareFidelity = { family: 'right-angle-pin-connector', trueBores: ports.length }
  return group
}

const upgraded = []
const proxyParts = []

function replaceWithProxyPreserved(id, factory, quality) {
  const part = PARTS.find(item => item.id === id)
  if (!part || typeof part.create !== 'function') return
  const previous = part.create
  patchPart(PARTS, id, {
    create: color => factory(part, color, previous),
    visualQuality: quality,
  })
  upgraded.push(id)
  proxyParts.push(id)
}

for (const id of ['pin', 'pin-half', 'pin-long']) {
  replaceWithProxyPreserved(id, (part, color, previous) => createPin(part, color, previous, true), 'parts-6-split-friction-pin-v10')
}
replaceWithProxyPreserved('pin-frictionless', (part, color, previous) => createPin(part, color, previous, false), 'parts-6-split-frictionless-pin-v10')
replaceWithProxyPreserved('axle-pin', createAxlePin, 'parts-6-hybrid-axle-pin-v10')
replaceWithProxyPreserved('bush', createBush, 'parts-6-true-cross-bore-bush-v10')
replaceWithProxyPreserved('half-bush', createBush, 'parts-6-true-cross-bore-half-bush-v10')
replaceWithProxyPreserved('axle-coupler', createCoupler, 'parts-6-through-cross-bore-coupler-v10')
replaceWithProxyPreserved('connector-triple', createTripleConnector, 'parts-6-open-triple-connector-v10')
replaceWithProxyPreserved('connector-perpendicular', createPerpendicularConnector, 'parts-6-open-perpendicular-connector-v10')
replaceWithProxyPreserved('connector-angle', createAngleConnector, 'parts-6-open-angle-connector-v10')

globalThis.BrickLabParts6ShaftHardwareFidelity = Object.freeze({
  version: PARTS6_SHAFT_HARDWARE_FIDELITY_VERSION,
  upgraded,
  proxyParts,
  geometry: 'split/tapered pins + true cross-bore bushes/coupler + open bored connector eyes/barrels',
  physics: 'pre-v10 render trees are retained invisibly as non-ignored collider/bounds proxies; every new visible v10 mesh is collider-independent and semantic connector data is untouched',
})

window.dispatchEvent(new CustomEvent('bricklab:partcatalogchange', {
  detail: { total: PARTS.length, pack: PARTS6_SHAFT_HARDWARE_FIDELITY_VERSION },
}))
