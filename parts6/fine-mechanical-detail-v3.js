import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { PARTS } from '../parts.js'
import { patchPart } from '../parts3/part-schema-v1.js'
import { REAL_TECHNIC_NOMINAL } from './nominal-dimension-fidelity-v1.js'

export const PARTS6_FINE_MECHANICAL_DETAIL_VERSION = 'parts-6-fine-mechanical-detail-v3'

const N = REAL_TECHNIC_NOMINAL
const X_AXIS = new THREE.Vector3(1, 0, 0)
const Y_AXIS = new THREE.Vector3(0, 1, 0)
const Z_AXIS = new THREE.Vector3(0, 0, 1)

function absMaterial(color, roughness = 0.41) {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness,
    metalness: 0.004,
    clearcoat: 0.028,
    clearcoatRoughness: 0.70,
    ior: 1.47,
  })
}

function pomMaterial(color = 0x2b2d31, roughness = 0.43) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.004 })
}

function darkMaterial() {
  return new THREE.MeshStandardMaterial({ color: 0x111315, roughness: 0.90, metalness: 0.008 })
}

function metalMaterial(color = 0xaeb6bd, roughness = 0.31) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.72 })
}

function visualOnly(object, feature) {
  object.userData.physicsIgnore = true
  object.userData.parts6VisualDetail = true
  object.userData.parts6FineFeature = feature
  return object
}

function axisOf(connector, fallback = Z_AXIS) {
  if (!connector?.axis) return fallback.clone()
  return new THREE.Vector3(...connector.axis).normalize()
}

function pointOf(connector, fallback = [0, 0, 0]) {
  return new THREE.Vector3(...(connector?.position ?? fallback))
}

function connector(part, id) {
  return part.connectors?.find(item => item.id === id) ?? null
}

function orientFromZ(object, axis) {
  object.quaternion.setFromUnitVectors(Z_AXIS, axis.clone().normalize())
  return object
}

function orientFromY(object, axis) {
  object.quaternion.setFromUnitVectors(Y_AXIS, axis.clone().normalize())
  return object
}

function torusAlong(axis, radius, tube, material, feature, radial = 8, tubular = 48) {
  const ring = visualOnly(new THREE.Mesh(new THREE.TorusGeometry(radius, tube, radial, tubular), material), feature)
  orientFromZ(ring, axis)
  return ring
}

function cylinderAlong(axis, radius, length, material, feature, segments = 36) {
  const mesh = visualOnly(new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, segments), material), feature)
  orientFromY(mesh, axis)
  return mesh
}

function shallowBox(size, material, feature, radius = 0.025) {
  return visualOnly(new THREE.Mesh(new RoundedBoxGeometry(size[0], size[1], size[2], 3, radius), material), feature)
}

function addConnectorFaceRing(group, port, options = {}) {
  if (!port) return
  const axis = axisOf(port)
  const center = pointOf(port)
  const radius = options.radius ?? N.pinCounterboreRadius
  const tube = options.tube ?? 0.018
  const offset = options.offset ?? 0
  const material = options.material ?? darkMaterial()
  const feature = options.feature ?? 'connector-retainer-ring'
  const ring = torusAlong(axis, radius, tube, material, feature, 8, 44)
  ring.position.copy(center).addScaledVector(axis, offset)
  group.add(ring)
}

function addBolt(group, position, axis, feature = 'retainer-fastener') {
  const bolt = cylinderAlong(axis, 0.043, 0.026, metalMaterial(0xa8afb6, 0.34), feature, 12)
  bolt.position.copy(position)
  group.add(bolt)
}

function addMoldWitness(group, position, axis, color, feature = 'mold-witness') {
  const disc = visualOnly(new THREE.Mesh(new THREE.CircleGeometry(0.040, 18), absMaterial(color, 0.50)), feature)
  orientFromZ(disc, axis)
  disc.position.copy(position)
  group.add(disc)
}

function wrapPart(id, decorate, quality) {
  const part = PARTS.find(item => item.id === id)
  if (!part || typeof part.create !== 'function') return false
  const previous = part.create
  patchPart(PARTS, id, {
    create: color => {
      const object = previous(color)
      decorate(object, part, color)
      object.userData.visualVersion = PARTS6_FINE_MECHANICAL_DETAIL_VERSION
      object.userData.parts6FineMechanicalDetail = true
      return object
    },
    visualQuality: quality,
  })
  return true
}

function decorateSteeringBase(group, part, color) {
  const pivot = connector(part, 'pivot-hole')
  if (pivot) {
    const axis = axisOf(pivot)
    const center = pointOf(pivot)
    for (const side of [-1, 1]) {
      const ring = torusAlong(axis, N.pinHoleRadius + 0.055, 0.026, pomMaterial(0x22262a), 'pivot-bushing-retainer', 9, 48)
      ring.position.copy(center).addScaledVector(axis, side * 0.162)
      group.add(ring)
    }
    const inner = cylinderAlong(axis, N.pinHoleRadius * 0.99, 0.34, darkMaterial(), 'pivot-bore-shadow', 42)
    inner.position.copy(center)
    group.add(inner)
  }

  for (const port of part.connectors.filter(item => item.type === 'tube')) {
    const axis = axisOf(port)
    const ring = torusAlong(axis, 0.245, 0.020, absMaterial(color, 0.45), 'base-mount-seat', 7, 40)
    ring.position.copy(pointOf(port)).addScaledVector(axis, -0.012)
    group.add(ring)
  }

  for (const x of [-0.52, 0.52]) {
    const rib = shallowBox([0.10, 0.42, 0.86], absMaterial(color, 0.46), 'pivot-cheek-gusset', 0.030)
    rib.position.set(x, 0.38, 0)
    group.add(rib)
  }
  addMoldWitness(group, new THREE.Vector3(0, 0.246, 0.905), Z_AXIS, color, 'base-mold-witness')
}

function decorateSteeringKnuckle(group, part, color) {
  const bearing = connector(part, 'wheel-bearing')
  if (bearing) {
    const axis = axisOf(bearing)
    const center = pointOf(bearing)
    for (const side of [-1, 1]) {
      const seal = torusAlong(axis, N.pinHoleRadius + 0.035, 0.023, darkMaterial(), 'wheel-bearing-seal', 9, 48)
      seal.position.copy(center).addScaledVector(axis, side * 0.395)
      group.add(seal)
      const race = torusAlong(axis, N.pinHoleRadius + 0.080, 0.018, metalMaterial(), 'wheel-bearing-race', 8, 48)
      race.position.copy(center).addScaledVector(axis, side * 0.405)
      group.add(race)
    }
  }

  const pivot = connector(part, 'pivot-pin')
  if (pivot) {
    const axis = axisOf(pivot)
    const center = pointOf(pivot)
    for (const side of [-1, 1]) {
      const collar = torusAlong(axis, N.pinBodyRadius + 0.032, 0.020, pomMaterial(0x25292d), 'kingpin-retainer', 7, 40)
      collar.position.copy(center).addScaledVector(axis, side * 0.265)
      group.add(collar)
    }
  }

  const steeringArm = connector(part, 'steering-arm')
  if (steeringArm) {
    const web = shallowBox([0.24, 0.12, 0.50], absMaterial(color, 0.44), 'steering-arm-web', 0.040)
    web.position.set(0, 0.49, 0.47)
    web.rotation.x = -0.10
    group.add(web)
    addConnectorFaceRing(group, steeringArm, {
      radius: N.pinBodyRadius + 0.030,
      tube: 0.018,
      offset: 0.17,
      material: pomMaterial(0x25292d),
      feature: 'steering-arm-pin-retainer',
    })
  }

  for (const z of [-0.32, 0.05]) {
    const relief = shallowBox([0.32, 0.16, 0.055], darkMaterial(), 'knuckle-mold-relief', 0.018)
    relief.position.set(0, 0.63, z)
    group.add(relief)
  }
}

function decorateTieRod(group, part, color) {
  const holes = part.connectors.filter(item => item.type === 'pin-hole')
  for (const hole of holes) {
    const axis = axisOf(hole)
    for (const side of [-1, 1]) {
      const ring = torusAlong(axis, N.pinHoleRadius + 0.042, 0.016, pomMaterial(color, 0.48), 'tie-rod-eye-retainer', 7, 42)
      ring.position.copy(pointOf(hole)).addScaledVector(axis, side * 0.165)
      group.add(ring)
    }
  }
  const centerRib = shallowBox([1.70, 0.055, 0.055], pomMaterial(color, 0.47), 'tie-rod-center-rib', 0.016)
  centerRib.position.set(0, 0.39, 0)
  group.add(centerRib)
  addMoldWitness(group, new THREE.Vector3(0, 0.342, 0.108), Z_AXIS, color, 'tie-rod-mold-witness')
}

function decorateWheelHub(group, part, color) {
  const bearing = connector(part, 'bearing')
  const stub = connector(part, 'wheel-stub')
  for (const [port, offset, feature] of [
    [bearing, -0.18, 'hub-inboard-seal'],
    [stub, 0.20, 'hub-outboard-seal'],
  ]) {
    if (!port) continue
    const axis = axisOf(port)
    const ring = torusAlong(axis, N.axleTipRadius + 0.058, 0.020, darkMaterial(), feature, 8, 48)
    ring.position.copy(pointOf(port)).addScaledVector(axis, offset)
    group.add(ring)
  }

  const snapRing = torusAlong(X_AXIS, 0.315, 0.018, metalMaterial(0x90989f, 0.34), 'hub-snap-ring', 7, 48)
  snapRing.position.set(-0.36, 0.58, 0)
  group.add(snapRing)

  for (let i = 0; i < 6; i += 1) {
    const a = i / 6 * Math.PI * 2
    const pocket = shallowBox([0.018, 0.12, 0.20], darkMaterial(), 'hub-flange-relief', 0.012)
    pocket.position.set(0.335, 0.58 + Math.cos(a) * 0.38, Math.sin(a) * 0.38)
    pocket.rotation.x = a
    group.add(pocket)
  }
}

function decorateShockBody(group, part, color) {
  const mount = connector(part, 'mount')
  if (mount) {
    for (const side of [-1, 1]) addConnectorFaceRing(group, mount, {
      radius: N.pinHoleRadius + 0.045,
      tube: 0.016,
      offset: side * 0.165,
      material: absMaterial(color, 0.45),
      feature: 'shock-lower-eye-retainer',
    })
  }

  for (const y of [0.60, 0.66, 2.58, 2.65]) {
    const seat = torusAlong(Y_AXIS, 0.425, 0.020, absMaterial(color, 0.43), 'shock-spring-seat-lip', 7, 48)
    seat.position.set(0, y, 0)
    group.add(seat)
  }
  for (let i = 0; i < 4; i += 1) {
    const thread = torusAlong(Y_AXIS, 0.385, 0.010, absMaterial(color, 0.47), 'shock-preload-thread', 6, 48)
    thread.position.set(0, 2.42 + i * 0.055, 0)
    group.add(thread)
  }
  const seal = cylinderAlong(Y_AXIS, 0.190, 0.085, darkMaterial(), 'shock-rod-seal', 40)
  seal.position.set(0, 2.76, 0)
  group.add(seal)
  addMoldWitness(group, new THREE.Vector3(0, 1.56, 0.395), Z_AXIS, color, 'shock-body-mold-witness')
}

function decorateShockRod(group, part, color) {
  const mount = connector(part, 'mount')
  if (mount) {
    for (const side of [-1, 1]) addConnectorFaceRing(group, mount, {
      radius: N.pinHoleRadius + 0.045,
      tube: 0.016,
      offset: side * 0.165,
      material: absMaterial(color, 0.45),
      feature: 'shock-upper-eye-retainer',
    })
  }

  for (const y of [0.50, 2.50]) {
    const springSeat = torusAlong(Y_AXIS, 0.405, 0.021, absMaterial(color, 0.43), 'shock-spring-retainer-lip', 7, 48)
    springSeat.position.set(0, y, 0)
    group.add(springSeat)
  }

  const bumpStop = cylinderAlong(Y_AXIS, 0.205, 0.20, pomMaterial(0x262a2d, 0.54), 'shock-bump-stop', 36)
  bumpStop.position.set(0, 2.35, 0)
  group.add(bumpStop)
  for (let i = 0; i < 4; i += 1) {
    const boot = torusAlong(Y_AXIS, 0.215 - i * 0.010, 0.018, darkMaterial(), 'shock-dust-boot-rib', 7, 44)
    boot.position.set(0, 2.15 + i * 0.065, 0)
    group.add(boot)
  }
}

function decorateSuspensionArm(group, part, color) {
  for (const hole of part.connectors.filter(item => item.type === 'pin-hole')) {
    const axis = axisOf(hole)
    for (const side of [-1, 1]) {
      const ring = torusAlong(axis, N.pinHoleRadius + 0.045, 0.014, absMaterial(color, 0.47), 'suspension-eye-retainer', 7, 40)
      ring.position.copy(pointOf(hole)).addScaledVector(axis, side * 0.375)
      group.add(ring)
    }
  }
  const pivot = connector(part, 'pivot')
  if (pivot) {
    const axis = axisOf(pivot)
    for (const side of [-1, 1]) {
      const washer = torusAlong(axis, N.pinBodyRadius + 0.050, 0.020, metalMaterial(), 'suspension-pivot-washer', 8, 40)
      washer.position.copy(pointOf(pivot)).addScaledVector(axis, side * 0.49)
      group.add(washer)
    }
  }
  for (const side of [-1, 1]) {
    const recess = shallowBox([3.10, 0.24, 0.018], darkMaterial(), 'suspension-arm-lightening-recess', 0.040)
    recess.position.set(0.45, 0.45, side * 0.362)
    group.add(recess)
  }
  const spine = shallowBox([3.40, 0.060, 0.52], absMaterial(color, 0.48), 'suspension-arm-spine', 0.020)
  spine.position.set(0.35, 0.45, 0)
  group.add(spine)
}

function decorateBearingBlock(group, part, color) {
  const bearing = connector(part, 'bearing')
  if (bearing) {
    const axis = axisOf(bearing)
    for (const side of [-1, 1]) {
      const race = torusAlong(axis, N.pinHoleRadius + 0.080, 0.030, metalMaterial(), 'bearing-block-race', 10, 52)
      race.position.copy(pointOf(bearing)).addScaledVector(axis, side * 0.675)
      group.add(race)
      const seal = torusAlong(axis, N.pinHoleRadius + 0.030, 0.020, darkMaterial(), 'bearing-block-seal', 8, 48)
      seal.position.copy(pointOf(bearing)).addScaledVector(axis, side * 0.685)
      group.add(seal)
    }
  }
  for (const foot of part.connectors.filter(item => item.type === 'tube')) {
    const ring = torusAlong(axisOf(foot), 0.235, 0.018, absMaterial(color, 0.47), 'bearing-block-mount-seat', 7, 40)
    ring.position.copy(pointOf(foot)).addScaledVector(axisOf(foot), -0.010)
    group.add(ring)
  }
  for (const x of [-0.37, 0.37]) {
    const gusset = shallowBox([0.18, 0.42, 0.86], absMaterial(color, 0.46), 'bearing-block-gusset', 0.045)
    gusset.position.set(x, 0.38, 0)
    group.add(gusset)
  }
}

function decorateMotor(group, part, color) {
  const output = connector(part, 'output')
  if (output) {
    const axis = axisOf(output)
    const center = pointOf(output)
    const retainer = torusAlong(axis, N.axleTipRadius + 0.105, 0.030, metalMaterial(0x8f979e, 0.30), 'motor-output-bearing-retainer', 10, 52)
    retainer.position.copy(center).addScaledVector(axis, -0.17)
    group.add(retainer)
    const seal = torusAlong(axis, N.axleTipRadius + 0.052, 0.018, darkMaterial(), 'motor-output-seal', 8, 48)
    seal.position.copy(center).addScaledVector(axis, -0.145)
    group.add(seal)
  }

  const rearCap = cylinderAlong(X_AXIS, 0.67, 0.10, darkMaterial(), 'motor-rear-endbell', 48)
  rearCap.position.set(-1.455, 0.90, 0)
  group.add(rearCap)

  for (let i = 0; i < 8; i += 1) {
    const a = i / 8 * Math.PI * 2
    const vent = shallowBox([0.018, 0.075, 0.24], darkMaterial(), 'motor-rear-vent', 0.016)
    vent.position.set(-1.515, 0.90 + Math.cos(a) * 0.46, Math.sin(a) * 0.46)
    vent.rotation.x = a
    group.add(vent)
  }

  const cableBoot = cylinderAlong(X_AXIS, 0.095, 0.20, darkMaterial(), 'motor-cable-gland', 28)
  cableBoot.position.set(-1.54, 1.20, 0.40)
  group.add(cableBoot)
  const cableStub = visualOnly(new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
      new THREE.Vector3(-1.62, 1.20, 0.40),
      new THREE.Vector3(-1.82, 1.24, 0.46),
      new THREE.Vector3(-1.98, 1.16, 0.54),
    ]), 24, 0.040, 8, false),
    darkMaterial(),
  ), 'motor-cable-stub')
  group.add(cableStub)

  for (const z of [-0.76, 0.76]) for (const y of [0.34, 1.46]) {
    addBolt(group, new THREE.Vector3(-1.515, y, z), X_AXIS, 'motor-case-fastener')
  }
}

function decorateWormDrive(group, part, color) {
  for (const id of ['input', 'output']) {
    const port = connector(part, id)
    if (!port) continue
    const axis = axisOf(port)
    const center = pointOf(port)
    const race = torusAlong(axis, N.axleTipRadius + 0.090, 0.026, metalMaterial(), `worm-${id}-bearing-race`, 9, 48)
    race.position.copy(center)
    group.add(race)
    const seal = torusAlong(axis, N.axleTipRadius + 0.045, 0.018, darkMaterial(), `worm-${id}-bearing-seal`, 7, 44)
    seal.position.copy(center).addScaledVector(axis, 0.018)
    group.add(seal)
  }

  const wheelFace = torusAlong(X_AXIS, 0.405, 0.045, pomMaterial(0xd5b33f, 0.42), 'worm-wheel-face-rim', 9, 52)
  wheelFace.position.set(0.27, 0.92, 0)
  group.add(wheelFace)
  for (let i = 0; i < 6; i += 1) {
    const a = i / 6 * Math.PI * 2
    const spoke = shallowBox([0.035, 0.095, 0.34], pomMaterial(0xd5b33f, 0.43), 'worm-wheel-web', 0.025)
    spoke.position.set(0.285, 0.92 + Math.cos(a) * 0.23, Math.sin(a) * 0.23)
    spoke.rotation.x = a
    group.add(spoke)
  }

  for (const z of [-0.62, 0.62]) {
    const brace = shallowBox([1.36, 0.12, 0.10], absMaterial(color, 0.46), 'worm-housing-cross-brace', 0.035)
    brace.position.set(0, 1.18, z)
    group.add(brace)
  }

  for (const foot of part.connectors.filter(item => item.type === 'tube')) {
    const seat = torusAlong(axisOf(foot), 0.235, 0.018, absMaterial(color, 0.47), 'worm-mount-seat', 7, 40)
    seat.position.copy(pointOf(foot)).addScaledVector(axisOf(foot), -0.010)
    group.add(seat)
  }
}

function decorateSensor(group, part, color) {
  const port = part.connectors.find(item => item.type === 'axle-hole')
  if (port) {
    const axis = axisOf(port)
    const center = pointOf(port)
    for (const side of [-1, 1]) {
      const retainer = torusAlong(axis, N.axleTipRadius + 0.092, 0.022, metalMaterial(0x939ba2, 0.34), 'sensor-bearing-retainer', 8, 46)
      retainer.position.copy(center).addScaledVector(axis, side * 0.325)
      group.add(retainer)
    }
  }
  const accent = part.id === 'rpm-sensor' ? 0x74e6a6 : 0xffb65c
  const band = torusAlong(X_AXIS, 0.475, 0.018, pomMaterial(accent, 0.38), 'sensor-accent-band', 8, 48)
  band.position.set(0, 0.55, 0)
  group.add(band)
  for (const side of [-1, 1]) {
    addBolt(group, new THREE.Vector3(side * 0.30, 0.83, 0.40), X_AXIS, 'sensor-case-fastener')
  }
  addMoldWitness(group, new THREE.Vector3(0, 0.55, 0.566), Z_AXIS, color, 'sensor-mold-witness')
}

function decorateConnectorBlock(group, part, color) {
  const pinHoles = part.connectors.filter(item => item.type === 'pin-hole')
  const axleHoles = part.connectors.filter(item => item.type === 'axle-hole')
  for (const port of [...pinHoles, ...axleHoles]) {
    const axis = axisOf(port)
    for (const side of [-1, 1]) {
      const ring = torusAlong(axis, port.type === 'pin-hole' ? N.pinHoleRadius + 0.040 : N.axleTipRadius + 0.060, 0.012, absMaterial(color, 0.48), 'connector-molded-lip', 6, 38)
      ring.position.copy(pointOf(port)).addScaledVector(axis, side * 0.34)
      group.add(ring)
    }
  }
  const seam = shallowBox([0.70, 0.018, 0.60], darkMaterial(), 'connector-parting-line', 0.008)
  seam.position.set(0, 0.42, 0.505)
  group.add(seam)
}

function decorateAxlePin(group, part, color) {
  const axle = connector(part, 'axle')
  const pin = connector(part, 'pin')
  if (axle) addConnectorFaceRing(group, axle, {
    radius: N.axleTipRadius + 0.060,
    tube: 0.014,
    offset: 0.20,
    material: pomMaterial(color, 0.46),
    feature: 'axle-pin-axle-collar',
  })
  if (pin) addConnectorFaceRing(group, pin, {
    radius: N.pinBodyRadius + 0.035,
    tube: 0.014,
    offset: -0.20,
    material: pomMaterial(color, 0.46),
    feature: 'axle-pin-pin-collar',
  })
  const transition = torusAlong(Z_AXIS, 0.255, 0.022, pomMaterial(color, 0.44), 'axle-pin-transition-ring', 8, 42)
  transition.position.set(0, 0.30, 0)
  group.add(transition)
}

const upgraded = []

for (const [id, decorator, quality] of [
  ['steering-base', decorateSteeringBase, 'parts-6-fine-steering-base-v3'],
  ['steering-knuckle', decorateSteeringKnuckle, 'parts-6-fine-steering-knuckle-v3'],
  ['steering-tie-rod-5', decorateTieRod, 'parts-6-fine-tie-rod-v3'],
  ['wheel-hub', decorateWheelHub, 'parts-6-fine-wheel-hub-v3'],
  ['shock-body-5', decorateShockBody, 'parts-6-fine-shock-body-v3'],
  ['shock-rod-5', decorateShockRod, 'parts-6-fine-shock-rod-v3'],
  ['suspension-arm-5', decorateSuspensionArm, 'parts-6-fine-suspension-arm-v3'],
  ['bearing-block', decorateBearingBlock, 'parts-6-fine-bearing-block-v3'],
  ['motor', decorateMotor, 'parts-6-fine-motor-v3'],
  ['worm-drive-8', decorateWormDrive, 'parts-6-fine-worm-drive-v3'],
  ['rpm-sensor', decorateSensor, 'parts-6-fine-rpm-sensor-v3'],
  ['torque-sensor', decorateSensor, 'parts-6-fine-torque-sensor-v3'],
  ['connector-triple', decorateConnectorBlock, 'parts-6-fine-triple-connector-v3'],
  ['connector-perpendicular', decorateConnectorBlock, 'parts-6-fine-perpendicular-connector-v3'],
  ['connector-angle', decorateConnectorBlock, 'parts-6-fine-angle-connector-v3'],
  ['axle-pin', decorateAxlePin, 'parts-6-fine-axle-pin-v3'],
]) {
  if (wrapPart(id, decorator, quality)) upgraded.push(id)
}

globalThis.BrickLabParts6FineMechanicalDetail = Object.freeze({
  version: PARTS6_FINE_MECHANICAL_DETAIL_VERSION,
  upgraded,
  focus: Object.freeze([
    'steering bearing and kingpin retainers',
    'wheel-hub seals and retaining details',
    'shock preload, dust-boot and spring-seat details',
    'suspension and bearing-block molded reinforcement',
    'motor endbell, vents, cable gland and bearing retainer',
    'worm-drive bearing/support details',
    'sensor retainers and case details',
    'connector molded lips and parting lines',
  ]),
  physics: 'all detail geometry is physicsIgnore; previous core factories and collider owners remain authoritative',
})

window.dispatchEvent(new CustomEvent('bricklab:partcatalogchange', {
  detail: { total: PARTS.length, pack: PARTS6_FINE_MECHANICAL_DETAIL_VERSION },
}))
