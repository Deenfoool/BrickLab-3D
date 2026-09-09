import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { PARTS } from '../parts.js'
import { patchPart } from '../parts3/part-schema-v1.js'
import { GEAR_MODULE_STUD, GEAR_PRESSURE_ANGLE_DEG, gearMetrics } from '../parts5/part-geometry-metrics-v1.js'
import { REAL_TECHNIC_NOMINAL } from './nominal-dimension-fidelity-v1.js'

export const PARTS6_RACK_GEAR_FIDELITY_VERSION = 'parts-6-rack-gear-fidelity-v4'

const N = REAL_TECHNIC_NOMINAL
const LINEAR_PITCH = Math.PI * GEAR_MODULE_STUD
const PRESSURE_ANGLE = GEAR_PRESSURE_ANGLE_DEG * Math.PI / 180
const REFERENCE_GEAR = gearMetrics(12, 'spur')
const ADDENDUM = REFERENCE_GEAR.addendum
const DEDENDUM = REFERENCE_GEAR.dedendum
const WHOLE_DEPTH = ADDENDUM + DEDENDUM
const PITCH_LINE_FROM_ROOT = DEDENDUM

const GUIDE_OPENING = Object.freeze({ lowerY: 0.30, upperY: 0.96, backZ: -0.43 })
const LEGACY_RACK_COLLIDER = Object.freeze({ center: [0, 0.695, 0.4425], size: [6.21, 0.43, 1.265] })
const LEGACY_GUIDE_COLLIDER = Object.freeze({ center: [0, 0.62, 0], size: [6.70, 1.06, 1.18] })

function pom(color, roughness = 0.40) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.004 })
}
function absMaterial(color, roughness = 0.40) {
  return new THREE.MeshPhysicalMaterial({ color, roughness, metalness: 0.004, clearcoat: 0.045, clearcoatRoughness: 0.62, ior: 1.47 })
}
function darkMaterial() {
  return new THREE.MeshStandardMaterial({ color: 0x17191c, roughness: 0.82, metalness: 0.015 })
}

function visualOnly(object, feature) {
  object.userData.physicsIgnore = true
  object.userData.parts6VisualDetail = true
  object.userData.parts6RackFeature = feature
  return object
}

function root(id, color) {
  const group = new THREE.Group()
  group.userData.partId = id
  group.userData.color = color
  group.userData.visualVersion = PARTS6_RACK_GEAR_FIDELITY_VERSION
  return group
}

function circleHole(radius) {
  const path = new THREE.Path()
  path.absarc(0, 0, radius, 0, Math.PI * 2, true)
  return path
}
function annulusShape(outer, inner) {
  const shape = new THREE.Shape()
  shape.absarc(0, 0, outer, 0, Math.PI * 2, false)
  shape.holes.push(circleHole(inner))
  return shape
}
function extrudeAlongY(shape, depth, material) {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.006,
    bevelThickness: 0.006,
    curveSegments: 36,
    steps: 1,
  })
  geometry.translate(0, 0, -depth / 2)
  geometry.rotateX(Math.PI / 2)
  return new THREE.Mesh(geometry, material)
}

function freezeLegacyBoundsCollider(part, profile, version) {
  part.physics = {
    ...(part.physics ?? {}),
    colliderProfile: {
      version,
      specs: [{ type: 'box', center: [...profile.center], size: [...profile.size] }],
    },
  }
}

// Standard 20° rack profile derived from the same module as the spur gears.
// At the pitch line the tooth thickness is exactly half the circular pitch.
function rackToothGeometry(depth = 0.38) {
  const pitchHalfThickness = LINEAR_PITCH / 4
  const rootHalf = pitchHalfThickness + Math.tan(PRESSURE_ANGLE) * DEDENDUM
  const tipHalf = Math.max(LINEAR_PITCH * 0.08, pitchHalfThickness - Math.tan(PRESSURE_ANGLE) * ADDENDUM)
  const shape = new THREE.Shape()
  shape.moveTo(-rootHalf, 0)
  shape.lineTo(-tipHalf, WHOLE_DEPTH)
  shape.lineTo(tipHalf, WHOLE_DEPTH)
  shape.lineTo(rootHalf, 0)
  shape.closePath()
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.005,
    bevelThickness: 0.005,
    curveSegments: 8,
    steps: 1,
  })
  geometry.translate(0, 0, -depth / 2)
  return geometry
}

function addTiePin(group, connector, color) {
  const pinLength = 0.42
  const pin = visualOnly(new THREE.Mesh(
    new THREE.CylinderGeometry(N.pinBodyRadius, N.pinBodyRadius, pinLength, 40),
    pom(color, 0.42),
  ), 'tie-pin')
  pin.position.fromArray(connector.position)
  group.add(pin)

  const stop = visualOnly(new THREE.Mesh(
    new THREE.TorusGeometry(N.pinBodyRadius, 0.018, 8, 40),
    pom(color, 0.42),
  ), 'tie-pin-stop')
  stop.rotation.x = Math.PI / 2
  stop.position.fromArray(connector.position)
  stop.position.y += pinLength / 2 - 0.012
  group.add(stop)
}

function createRack(part, color) {
  const group = root(part.id, color)
  const material = pom(color)
  const railLength = 6.20
  const railHeight = 0.30
  const railCenterY = 0.50
  const rootLineY = railCenterY + railHeight / 2
  const pitchLineY = rootLineY + PITCH_LINE_FROM_ROOT
  const tipLineY = rootLineY + WHOLE_DEPTH

  const rail = new THREE.Mesh(new RoundedBoxGeometry(railLength, railHeight, 0.38, 4, 0.065), material)
  rail.position.y = railCenterY
  group.add(rail)

  const usableLength = 5.72
  const toothCount = Math.max(3, Math.floor(usableLength / LINEAR_PITCH) + 1)
  const occupied = (toothCount - 1) * LINEAR_PITCH
  const firstX = -occupied / 2
  const toothGeometry = rackToothGeometry(0.38)
  const teeth = visualOnly(new THREE.InstancedMesh(toothGeometry, material, toothCount), 'module-matched-teeth')
  const matrix = new THREE.Matrix4()
  for (let i = 0; i < toothCount; i += 1) {
    matrix.makeTranslation(firstX + i * LINEAR_PITCH, rootLineY, 0)
    teeth.setMatrixAt(i, matrix)
  }
  teeth.instanceMatrix.needsUpdate = true
  group.add(teeth)

  const armMaterial = pom(color, 0.43)
  for (const connector of part.connectors.filter(item => item.type === 'pin')) {
    const x = connector.position[0]
    const arm = new THREE.Mesh(new RoundedBoxGeometry(0.44, 0.28, 1.02, 4, 0.075), armMaterial)
    arm.position.set(x, connector.position[1], 0.42)
    group.add(arm)
    const boss = new THREE.Mesh(new THREE.CylinderGeometry(0.37, 0.37, 0.26, 40), armMaterial)
    boss.position.fromArray(connector.position)
    group.add(boss)
    addTiePin(group, connector, color)
  }

  group.userData.rackGearMetrics = {
    moduleStud: GEAR_MODULE_STUD,
    pressureAngleDeg: GEAR_PRESSURE_ANGLE_DEG,
    linearPitchStud: LINEAR_PITCH,
    addendumStud: ADDENDUM,
    dedendumStud: DEDENDUM,
    pitchLineOffsetStud: PITCH_LINE_FROM_ROOT,
    rootLineY,
    pitchLineY,
    tipLineY,
    toothCount,
  }
  return group
}

function createRackGuide(part, color) {
  const group = root(part.id, color)
  const shell = absMaterial(color, 0.42)
  const wear = darkMaterial()
  const length = 6.70
  const depth = 1.18

  const bottom = new THREE.Mesh(new RoundedBoxGeometry(length, 0.26, depth, 4, 0.075), shell)
  bottom.position.y = 0.17
  const top = new THREE.Mesh(new RoundedBoxGeometry(length, 0.24, depth, 4, 0.075), shell)
  top.position.y = 1.08
  const back = new THREE.Mesh(new RoundedBoxGeometry(length, 0.66, 0.18, 4, 0.055), shell)
  back.position.set(0, 0.63, -0.52)
  group.add(bottom, top, back)

  const lowerWear = visualOnly(new THREE.Mesh(new RoundedBoxGeometry(6.05, 0.030, 0.50, 2, 0.010), wear), 'guide-wear-strip')
  lowerWear.position.set(0, GUIDE_OPENING.lowerY + 0.015, -0.08)
  const upperWear = visualOnly(new THREE.Mesh(new RoundedBoxGeometry(6.05, 0.030, 0.50, 2, 0.010), wear), 'guide-wear-strip')
  upperWear.position.set(0, GUIDE_OPENING.upperY - 0.015, -0.08)
  group.add(lowerWear, upperWear)

  // Real mounting tubes are built around the actual tube connector locations.
  for (const mount of part.connectors.filter(item => item.type === 'tube')) {
    const tube = visualOnly(extrudeAlongY(annulusShape(0.285, 0.165), 0.12, shell), 'guide-mount-tube')
    tube.position.fromArray(mount.position)
    tube.position.y += 0.06
    group.add(tube)
  }

  // Molded ribs stiffen the long housing without closing the open front channel.
  for (const x of [-2.55, -1.70, -0.85, 0, 0.85, 1.70, 2.55]) {
    const rib = visualOnly(new THREE.Mesh(new RoundedBoxGeometry(0.075, 0.60, 0.16, 2, 0.022), shell), 'guide-stiffening-rib')
    rib.position.set(x, 0.63, -0.39)
    group.add(rib)
  }

  group.userData.rackGuideMetrics = {
    lowerOpeningY: GUIDE_OPENING.lowerY,
    upperOpeningY: GUIDE_OPENING.upperY,
    backOpeningZ: GUIDE_OPENING.backZ,
    openingHeight: GUIDE_OPENING.upperY - GUIDE_OPENING.lowerY,
    mountTubeCount: part.connectors.filter(item => item.type === 'tube').length,
  }
  return group
}

const upgraded = []
const rackPart = PARTS.find(item => item.id === 'steering-rack-7')
if (rackPart) {
  patchPart(PARTS, rackPart.id, {
    create: color => createRack(rackPart, color),
    visualQuality: 'parts-6-module-matched-steering-rack-v4',
    rackVisualMetrics: {
      moduleStud: GEAR_MODULE_STUD,
      pressureAngleDeg: GEAR_PRESSURE_ANGLE_DEG,
      linearPitchStud: LINEAR_PITCH,
      addendumStud: ADDENDUM,
      dedendumStud: DEDENDUM,
      pitchLineOffsetStud: PITCH_LINE_FROM_ROOT,
    },
  })
  freezeLegacyBoundsCollider(rackPart, LEGACY_RACK_COLLIDER, 'parts-6-preserve-steering-rack-bounds-v1')
  upgraded.push(rackPart.id)
}

const guidePart = PARTS.find(item => item.id === 'steering-rack-guide')
if (guidePart) {
  patchPart(PARTS, guidePart.id, {
    create: color => createRackGuide(guidePart, color),
    visualQuality: 'parts-6-matched-rack-guide-v1',
    rackGuideVisualMetrics: { ...GUIDE_OPENING },
  })
  freezeLegacyBoundsCollider(guidePart, LEGACY_GUIDE_COLLIDER, 'parts-6-preserve-steering-rack-guide-bounds-v1')
  upgraded.push(guidePart.id)
}

globalThis.BrickLabParts6RackGearFidelity = Object.freeze({
  version: PARTS6_RACK_GEAR_FIDELITY_VERSION,
  upgraded,
  moduleStud: GEAR_MODULE_STUD,
  pressureAngleDeg: GEAR_PRESSURE_ANGLE_DEG,
  linearPitchStud: LINEAR_PITCH,
  addendumStud: ADDENDUM,
  dedendumStud: DEDENDUM,
  guideOpening: GUIDE_OPENING,
  colliderPolicy: 'explicit proxies reproduce the pre-PARTS-6 bounds envelopes while visual geometry gains real rack/guide clearance',
  physics: 'rack/guide mechanics, slider travel and connector coordinates remain unchanged',
})

window.dispatchEvent(new CustomEvent('bricklab:partcatalogchange', {
  detail: { total: PARTS.length, pack: PARTS6_RACK_GEAR_FIDELITY_VERSION },
}))
