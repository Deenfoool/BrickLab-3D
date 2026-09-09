import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { PARTS } from '../parts.js'
import { patchPart } from '../parts3/part-schema-v1.js'
import { REAL_TECHNIC_NOMINAL } from './nominal-dimension-fidelity-v1.js'

export const PARTS6_STEERING_CARRIER_FIDELITY_VERSION = 'parts-6-steering-carrier-fidelity-v8'

const N = REAL_TECHNIC_NOMINAL
const X_AXIS = new THREE.Vector3(1, 0, 0)
const Y_AXIS = new THREE.Vector3(0, 1, 0)
const Z_AXIS = new THREE.Vector3(0, 0, 1)

function absMaterial(color, roughness = 0.41) {
  return new THREE.MeshPhysicalMaterial({ color, roughness, metalness: 0.004, clearcoat: 0.028, clearcoatRoughness: 0.70, ior: 1.47 })
}
function pomMaterial(color = 0x2b2d31, roughness = 0.46) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.004 })
}
function darkMaterial() {
  return new THREE.MeshStandardMaterial({ color: 0x111315, roughness: 0.90, metalness: 0.008, side: THREE.DoubleSide })
}
function metalMaterial(color = 0xaeb6bd, roughness = 0.34) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.70 })
}
function visualOnly(object, feature) {
  object.userData.physicsIgnore = true
  object.userData.parts6VisualDetail = true
  object.userData.parts6SteeringCarrierFeature = feature
  return object
}
function root(id, color) {
  const group = new THREE.Group()
  group.userData.partId = id
  group.userData.color = color
  group.userData.visualVersion = PARTS6_STEERING_CARRIER_FIDELITY_VERSION
  return group
}
function circleHole(radius, x = 0, y = 0) {
  const path = new THREE.Path()
  path.absarc(x, y, radius, 0, Math.PI * 2, true)
  return path
}
function annulusShape(outer, inner) {
  const shape = new THREE.Shape()
  shape.absarc(0, 0, outer, 0, Math.PI * 2, false)
  shape.holes.push(circleHole(inner))
  return shape
}
function flangeShape(outer, inner, reliefRadius, reliefCount = 6) {
  const shape = annulusShape(outer, inner)
  if (reliefRadius > 0 && reliefCount > 0) {
    const orbit = (outer + inner) * 0.51
    for (let i = 0; i < reliefCount; i += 1) {
      const angle = i / reliefCount * Math.PI * 2
      shape.holes.push(circleHole(reliefRadius, Math.cos(angle) * orbit, Math.sin(angle) * orbit))
    }
  }
  return shape
}
function crossPoints(radius = N.axleTipRadius, arm = N.axleArmHalfWidth) {
  return [
    [-arm, radius], [arm, radius], [arm, arm], [radius, arm], [radius, -arm], [arm, -arm],
    [arm, -radius], [-arm, -radius], [-arm, -arm], [-radius, -arm], [-radius, arm], [-arm, arm],
  ]
}
function crossShape(radius = N.axleTipRadius, arm = N.axleArmHalfWidth) {
  const shape = new THREE.Shape()
  const points = crossPoints(radius, arm)
  shape.moveTo(...points[0])
  for (let i = 1; i < points.length; i += 1) shape.lineTo(...points[i])
  shape.closePath()
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
function torusAlong(axis, radius, tube, material, feature, radial = 8, tubular = 48) {
  const mesh = visualOnly(new THREE.Mesh(new THREE.TorusGeometry(radius, tube, radial, tubular), material), feature)
  mesh.quaternion.setFromUnitVectors(Z_AXIS, axis.clone().normalize())
  return mesh
}
function cylinderAlong(axis, radius, length, material, feature = null, segments = 40) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, segments), material)
  mesh.quaternion.setFromUnitVectors(Y_AXIS, axis.clone().normalize())
  if (feature) visualOnly(mesh, feature)
  return mesh
}
function roundedBarBetween(a, b, thickness, depth, material, feature = null) {
  const delta = b.clone().sub(a)
  const length = Math.max(0.04, Math.hypot(delta.x, delta.y))
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(length, thickness, depth, 4, Math.min(0.08, thickness * 0.34, depth * 0.28)), material)
  mesh.position.copy(a).add(b).multiplyScalar(0.5)
  mesh.rotation.z = Math.atan2(delta.y, delta.x)
  if (feature) visualOnly(mesh, feature)
  return mesh
}
function connector(part, id) {
  return part.connectors?.find(item => item.id === id) ?? null
}
function pointOf(port, fallback = [0, 0, 0]) {
  return new THREE.Vector3(...(port?.position ?? fallback))
}
function axisOf(port, fallback = X_AXIS) {
  return port?.axis ? new THREE.Vector3(...port.axis).normalize() : fallback.clone()
}

function nonIgnoredBounds(object) {
  object.updateWorldMatrix(true, true)
  const inverse = object.matrixWorld.clone().invert()
  const box = new THREE.Box3().makeEmpty()
  const local = new THREE.Box3()
  const relative = new THREE.Matrix4()
  object.traverse(child => {
    if (!child.isMesh || !child.geometry || child.userData?.physicsIgnore) return
    if (!child.geometry.boundingBox) child.geometry.computeBoundingBox()
    if (!child.geometry.boundingBox) return
    local.copy(child.geometry.boundingBox)
    relative.multiplyMatrices(inverse, child.matrixWorld)
    local.applyMatrix4(relative)
    box.union(local)
  })
  if (box.isEmpty()) return null
  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  return {
    center: [center.x, center.y, center.z],
    size: [Math.max(size.x, 0.12), Math.max(size.y, 0.12), Math.max(size.z, 0.12)],
  }
}
function freezeLegacyBoundsCollider(part, previousFactory) {
  if (part.physics?.colliderProfile?.specs?.length) return 'existing-explicit'
  let sample = null
  try {
    sample = previousFactory(part.defaultColor ?? part.visual?.defaultColor ?? 0x59626c)
  } catch {
    return 'sample-failed'
  }
  const bounds = nonIgnoredBounds(sample)
  if (!bounds) return 'bounds-missing'
  part.physics = {
    ...(part.physics ?? {}),
    colliderProfile: {
      version: 'parts-6-frozen-pre-v8-bounds-v1',
      specs: [{ type: 'box', center: bounds.center, size: bounds.size }],
    },
  }
  return 'frozen-legacy-bounds'
}

function createSteeringBase(part, color) {
  const group = root(part.id, color)
  const material = absMaterial(color)
  const pivot = connector(part, 'pivot-hole')
  const pivotCenter = pointOf(pivot, [0, 0.88, 0])

  const footprint = new THREE.Mesh(new RoundedBoxGeometry(1.78, 0.22, 1.78, 5, 0.10), material)
  footprint.position.y = 0.11
  group.add(footprint)

  // Open U-shaped pivot bracket: two molded cheeks plus a bridge, not a solid tower.
  for (const x of [-0.36, 0.36]) {
    const cheek = new THREE.Mesh(new RoundedBoxGeometry(0.24, 0.70, 0.78, 5, 0.085), material)
    cheek.position.set(x, 0.52, 0)
    group.add(cheek)

    const frontGusset = roundedBarBetween(new THREE.Vector3(x, 0.24, -0.42), new THREE.Vector3(x, 0.48, -0.18), 0.16, 0.18, material)
    frontGusset.rotation.y = Math.PI / 2
    group.add(frontGusset)
    const rearGusset = frontGusset.clone()
    rearGusset.position.z *= -1
    group.add(rearGusset)
  }

  const bridge = new THREE.Mesh(new RoundedBoxGeometry(0.90, 0.18, 0.72, 4, 0.065), material)
  bridge.position.set(0, 0.76, 0)
  group.add(bridge)

  const pivotHousing = extrudeAlongY(annulusShape(0.355, N.pinHoleRadius), 0.30, material, { bevelSegments: 4, bevelSize: 0.009, bevelThickness: 0.009 })
  pivotHousing.position.copy(pivotCenter)
  group.add(pivotHousing)
  const bore = visualOnly(cylinderAlong(Y_AXIS, N.pinHoleRadius * 0.995, 0.315, darkMaterial(), null, 44), 'steering-base-true-bore')
  bore.position.copy(pivotCenter)
  group.add(bore)
  for (const side of [-1, 1]) {
    const retainer = torusAlong(Y_AXIS, N.pinCounterboreRadius * 0.94, 0.018, pomMaterial(0x25292d), 'steering-base-pivot-retainer', 8, 48)
    retainer.position.copy(pivotCenter).addScaledVector(Y_AXIS, side * 0.157)
    group.add(retainer)
  }

  for (const port of part.connectors.filter(item => item.type === 'tube')) {
    const seat = extrudeAlongY(annulusShape(0.245, 0.165), 0.095, material, { bevelSegments: 3, bevelSize: 0.005, bevelThickness: 0.005 })
    seat.position.fromArray(port.position)
    seat.position.y += 0.045
    visualOnly(seat, 'steering-base-mount-seat')
    group.add(seat)
  }

  group.userData.steeringCarrierFidelity = { openBracket: true, truePivotBore: true }
  return group
}

function createSteeringKnuckle(part, color) {
  const group = root(part.id, color)
  const material = absMaterial(color)
  const bearingPort = connector(part, 'wheel-bearing')
  const pivotPort = connector(part, 'pivot-pin')
  const armPort = connector(part, 'steering-arm')
  const bearingCenter = pointOf(bearingPort, [0, 0.55, 0])
  const pivotCenter = pointOf(pivotPort, [0, 0.88, 0])
  const armCenter = pointOf(armPort, [0, 0.55, 0.72])

  // Actual through-bearing barrel with separate race and seal geometry.
  const barrel = extrudeAlongX(annulusShape(0.37, N.pinHoleRadius), 0.76, material, { bevelSegments: 5, bevelSize: 0.010, bevelThickness: 0.010 })
  barrel.position.copy(bearingCenter)
  group.add(barrel)
  const liner = visualOnly(extrudeAlongX(annulusShape(N.pinHoleRadius + 0.050, N.pinHoleRadius), 0.785, darkMaterial(), { bevelEnabled: false }), 'knuckle-bearing-liner')
  liner.position.copy(bearingCenter)
  group.add(liner)
  for (const side of [-1, 1]) {
    const race = torusAlong(X_AXIS, N.pinHoleRadius + 0.080, 0.018, metalMaterial(), 'knuckle-bearing-race', 8, 52)
    race.position.copy(bearingCenter).addScaledVector(X_AXIS, side * 0.392)
    group.add(race)
    const seal = torusAlong(X_AXIS, N.pinHoleRadius + 0.036, 0.020, darkMaterial(), 'knuckle-bearing-seal', 8, 48)
    seal.position.copy(bearingCenter).addScaledVector(X_AXIS, side * 0.398)
    group.add(seal)
  }

  // Forged/molded upright uses two tapered diagonal webs instead of a block.
  const upperLeft = new THREE.Vector3(0, pivotCenter.y - 0.02, -0.18)
  const bearingBack = new THREE.Vector3(0, bearingCenter.y + 0.01, -0.08)
  const upright = roundedBarBetween(bearingBack, upperLeft, 0.26, 0.46, material)
  group.add(upright)
  const lowerBrace = roundedBarBetween(new THREE.Vector3(0, bearingCenter.y - 0.24, -0.08), new THREE.Vector3(0, pivotCenter.y - 0.25, -0.18), 0.18, 0.38, material)
  group.add(lowerBrace)

  const pivotAxis = axisOf(pivotPort, Y_AXIS)
  const pivotBoss = cylinderAlong(pivotAxis, 0.275, 0.30, material, null, 42)
  pivotBoss.position.copy(pivotCenter)
  group.add(pivotBoss)
  const pin = cylinderAlong(pivotAxis, N.pinBodyRadius, 0.52, pomMaterial(0x2b2d31), null, 40)
  pin.position.copy(pivotCenter).addScaledVector(pivotAxis, 0.045)
  group.add(pin)
  for (const side of [-1, 1]) {
    const collar = torusAlong(pivotAxis, N.pinBodyRadius + 0.034, 0.018, pomMaterial(0x25292d), 'knuckle-kingpin-retainer', 7, 42)
    collar.position.copy(pivotCenter).addScaledVector(pivotAxis, side * 0.255)
    group.add(collar)
  }

  // Steering arm has a slender tapered web and a real connector-centred pin boss.
  if (armPort) {
    const neck = roundedBarBetween(new THREE.Vector3(0, bearingCenter.y + 0.03, 0.16), armCenter.clone().setY(bearingCenter.y + 0.03), 0.18, 0.25, material)
    group.add(neck)
    const armAxis = axisOf(armPort, Y_AXIS)
    const boss = cylinderAlong(armAxis, 0.245, 0.24, material, null, 38)
    boss.position.copy(armCenter)
    group.add(boss)
    const armPin = cylinderAlong(armAxis, N.pinBodyRadius, 0.36, pomMaterial(color, 0.47), null, 38)
    armPin.position.copy(armCenter).addScaledVector(armAxis, 0.06)
    group.add(armPin)
    const witness = visualOnly(new THREE.Mesh(new THREE.CircleGeometry(0.034, 16), absMaterial(color, 0.50)), 'knuckle-arm-mold-witness')
    witness.quaternion.setFromUnitVectors(Z_AXIS, armAxis)
    witness.position.copy(armCenter).addScaledVector(armAxis, 0.185)
    group.add(witness)
  }

  group.userData.steeringCarrierFidelity = { forgedUpright: true, throughBearing: true, connectorArm: Boolean(armPort) }
  return group
}

function createWheelHub(part, color) {
  const group = root(part.id, color)
  const material = absMaterial(color)
  const bearingPort = connector(part, 'bearing')
  const stubPort = connector(part, 'wheel-stub')
  const bearingCenter = pointOf(bearingPort, [-0.38, 0.58, 0])
  const stubCenter = pointOf(stubPort, [0.72, 0.58, 0])

  const carrier = extrudeAlongX(annulusShape(0.46, N.pinHoleRadius), 0.67, material, { bevelSegments: 5, bevelSize: 0.010, bevelThickness: 0.010 })
  carrier.position.set(-0.02, bearingCenter.y, bearingCenter.z)
  group.add(carrier)

  // Outboard flange is a true plate with six lightening holes, not relief stickers.
  const flange = extrudeAlongX(flangeShape(0.57, N.axleTipRadius + 0.055, 0.070, 6), 0.14, material, { bevelSegments: 4, bevelSize: 0.007, bevelThickness: 0.007, curveSegments: 48 })
  flange.position.set(0.29, bearingCenter.y, bearingCenter.z)
  group.add(flange)

  const seal = visualOnly(extrudeAlongX(annulusShape(N.pinHoleRadius + 0.058, N.pinHoleRadius), 0.10, darkMaterial(), { bevelEnabled: false }), 'hub-bearing-seal')
  seal.position.set(-0.355, bearingCenter.y, bearingCenter.z)
  group.add(seal)
  const race = torusAlong(X_AXIS, N.pinHoleRadius + 0.082, 0.018, metalMaterial(), 'hub-bearing-race', 8, 48)
  race.position.set(-0.405, bearingCenter.y, bearingCenter.z)
  group.add(race)

  for (const side of [-1, 1]) {
    const shoulder = torusAlong(X_AXIS, 0.315, 0.016, metalMaterial(0x90989f, 0.36), 'hub-snap-ring', 7, 48)
    shoulder.position.set(side < 0 ? -0.37 : 0.355, bearingCenter.y, bearingCenter.z)
    group.add(shoulder)
  }

  const stubLength = 0.58
  const stub = extrudeAlongX(crossShape(), stubLength, pomMaterial(color), { bevelSegments: 3, bevelSize: 0.007, bevelThickness: 0.010 })
  stub.position.copy(stubCenter).addScaledVector(X_AXIS, -stubLength * 0.23)
  group.add(stub)

  const rootCollar = extrudeAlongX(annulusShape(0.285, N.axleTipRadius + 0.020), 0.10, material, { bevelSegments: 3, bevelSize: 0.006, bevelThickness: 0.006 })
  rootCollar.position.set(0.43, bearingCenter.y, bearingCenter.z)
  group.add(rootCollar)

  group.userData.steeringCarrierFidelity = { trueFlangeOpenings: 6, keyedStub: true, bearingRace: true }
  return group
}

function createTieRod(part, color) {
  const group = root(part.id, color)
  const material = pomMaterial(color)
  const holes = part.connectors.filter(item => item.type === 'pin-hole').sort((a, b) => a.position[0] - b.position[0])
  const left = pointOf(holes[0], [-2, 0.34, 0])
  const right = pointOf(holes.at(-1), [2, 0.34, 0])

  // Slightly faceted forged bar with tapered necks into proper bored eyes.
  const rodLength = Math.max(0.20, right.x - left.x - 0.74)
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, rodLength, 10), material)
  rod.rotation.z = Math.PI / 2
  rod.position.set((left.x + right.x) / 2, left.y, 0)
  group.add(rod)

  for (const hole of holes) {
    const center = pointOf(hole)
    const eye = extrudeAlongY(annulusShape(0.305, N.pinHoleRadius), 0.30, material, { bevelSegments: 4, bevelSize: 0.010, bevelThickness: 0.010 })
    eye.position.copy(center)
    group.add(eye)

    const inward = center.x < 0 ? 1 : -1
    const neckCenter = center.clone().add(new THREE.Vector3(inward * 0.34, 0, 0))
    const neck = roundedBarBetween(center, neckCenter, 0.20, 0.26, material)
    group.add(neck)

    const liner = visualOnly(cylinderAlong(Y_AXIS, N.pinHoleRadius * 0.995, 0.31, darkMaterial(), null, 44), 'tie-rod-eye-bore')
    liner.position.copy(center)
    group.add(liner)
    for (const side of [-1, 1]) {
      const retainer = torusAlong(Y_AXIS, N.pinCounterboreRadius * 0.93, 0.014, pomMaterial(color, 0.50), 'tie-rod-eye-retainer', 7, 42)
      retainer.position.copy(center).addScaledVector(Y_AXIS, side * 0.157)
      group.add(retainer)
    }
  }

  group.userData.steeringCarrierFidelity = { forgedRod: true, trueEyes: holes.length }
  return group
}

function createBearingBlock(part, color) {
  const group = root(part.id, color)
  const material = absMaterial(color)
  const bearingPort = connector(part, 'bearing')
  const bearingCenter = pointOf(bearingPort, [0, 0.90, 0])

  const base = new THREE.Mesh(new RoundedBoxGeometry(1.40, 0.22, 1.18, 5, 0.085), material)
  base.position.y = 0.11
  group.add(base)

  const outer = 0.45
  const inner = N.pinHoleRadius
  const bearing = extrudeAlongX(annulusShape(outer, inner), 1.32, material, { bevelSegments: 5, bevelSize: 0.010, bevelThickness: 0.010 })
  bearing.position.copy(bearingCenter)
  group.add(bearing)

  for (const x of [-0.53, 0.53]) {
    const pillar = new THREE.Mesh(new RoundedBoxGeometry(0.26, 0.78, 1.02, 4, 0.08), material)
    pillar.position.set(x, 0.55, 0)
    group.add(pillar)
    for (const z of [-0.38, 0.38]) {
      const gusset = roundedBarBetween(new THREE.Vector3(x, 0.18, z), new THREE.Vector3(x, 0.54, z * 0.52), 0.14, 0.16, material)
      gusset.rotation.y = Math.PI / 2
      group.add(gusset)
    }
  }

  const liner = visualOnly(extrudeAlongX(annulusShape(inner + 0.050, inner), 1.34, darkMaterial(), { bevelEnabled: false }), 'bearing-block-liner')
  liner.position.copy(bearingCenter)
  group.add(liner)
  for (const side of [-1, 1]) {
    const race = torusAlong(X_AXIS, inner + 0.085, 0.018, metalMaterial(), 'bearing-block-race', 8, 52)
    race.position.copy(bearingCenter).addScaledVector(X_AXIS, side * 0.672)
    group.add(race)
    const seal = torusAlong(X_AXIS, inner + 0.040, 0.019, darkMaterial(), 'bearing-block-seal', 8, 48)
    seal.position.copy(bearingCenter).addScaledVector(X_AXIS, side * 0.676)
    group.add(seal)
  }

  for (const port of part.connectors.filter(item => item.type === 'tube')) {
    const foot = extrudeAlongY(annulusShape(0.245, 0.165), 0.09, material, { bevelSegments: 3, bevelSize: 0.005, bevelThickness: 0.005 })
    foot.position.fromArray(port.position)
    foot.position.y += 0.045
    visualOnly(foot, 'bearing-block-mount-seat')
    group.add(foot)
  }

  group.userData.steeringCarrierFidelity = { trueBearingBore: true, moldedPillars: true }
  return group
}

const definitions = [
  ['steering-base', createSteeringBase, 'parts-6-open-pivot-bracket-v8'],
  ['steering-knuckle', createSteeringKnuckle, 'parts-6-forged-steering-knuckle-v8'],
  ['wheel-hub', createWheelHub, 'parts-6-open-flange-wheel-hub-v8'],
  ['steering-tie-rod-5', createTieRod, 'parts-6-forged-tie-rod-v8'],
  ['bearing-block', createBearingBlock, 'parts-6-bearing-carrier-v8'],
]

const upgraded = []
const colliderFreeze = {}
for (const [id, factory, quality] of definitions) {
  const part = PARTS.find(item => item.id === id)
  if (!part || typeof part.create !== 'function') continue
  const previous = part.create
  colliderFreeze[id] = freezeLegacyBoundsCollider(part, previous)
  patchPart(PARTS, id, {
    create: color => factory(part, color),
    visualQuality: quality,
  })
  upgraded.push(id)
}

globalThis.BrickLabParts6SteeringCarrierFidelity = Object.freeze({
  version: PARTS6_STEERING_CARRIER_FIDELITY_VERSION,
  upgraded,
  colliderFreeze: Object.freeze(colliderFreeze),
  geometry: 'open pivot bracket + forged knuckle/tie rod + true hub flange openings + bearing carrier',
  physics: 'pre-v8 non-ignored render bounds are frozen into explicit collider profiles before visual replacement; connectors and mechanics remain unchanged',
})

window.dispatchEvent(new CustomEvent('bricklab:partcatalogchange', {
  detail: { total: PARTS.length, pack: PARTS6_STEERING_CARRIER_FIDELITY_VERSION },
}))
