import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { PARTS } from '../parts.js'
import { patchPart } from '../parts3/part-schema-v1.js'
import { GEAR_MODULE_STUD, GEAR_PRESSURE_ANGLE_DEG, gearMetrics } from '../parts5/part-geometry-metrics-v1.js'
import { REAL_TECHNIC_NOMINAL } from './nominal-dimension-fidelity-v1.js'

export const PARTS6_RACK_GEAR_FIDELITY_VERSION = 'parts-6-rack-gear-fidelity-v2'

const N = REAL_TECHNIC_NOMINAL
const LINEAR_PITCH = Math.PI * GEAR_MODULE_STUD
const PRESSURE_ANGLE = GEAR_PRESSURE_ANGLE_DEG * Math.PI / 180
const REFERENCE_GEAR = gearMetrics(12, 'spur')
const ADDENDUM = REFERENCE_GEAR.addendum
const DEDENDUM = REFERENCE_GEAR.dedendum
const WHOLE_DEPTH = ADDENDUM + DEDENDUM
const PITCH_LINE_FROM_ROOT = DEDENDUM

function pom(color, roughness = 0.40) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.004 })
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
  // The connector position is the hinge centre, so the visible pin is centred on
  // that exact point instead of being artistically offset from the actual joint.
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
  const railCenterY = 0.62
  const railTop = railCenterY + railHeight / 2
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
    matrix.makeTranslation(firstX + i * LINEAR_PITCH, railTop, 0)
    teeth.setMatrixAt(i, matrix)
  }
  teeth.instanceMatrix.needsUpdate = true
  group.add(teeth)

  const armMaterial = pom(color, 0.43)
  for (const connector of part.connectors.filter(item => item.type === 'pin')) {
    const x = connector.position[0]
    const arm = new THREE.Mesh(new RoundedBoxGeometry(0.44, 0.28, 1.02, 4, 0.075), armMaterial)
    arm.position.set(x, railCenterY, 0.42)
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
    pitchLineY: railTop + PITCH_LINE_FROM_ROOT,
    toothCount,
  }
  return group
}

const part = PARTS.find(item => item.id === 'steering-rack-7')
if (part) {
  patchPart(PARTS, part.id, {
    create: color => createRack(part, color),
    visualQuality: 'parts-6-module-matched-steering-rack-v2',
    rackVisualMetrics: {
      moduleStud: GEAR_MODULE_STUD,
      pressureAngleDeg: GEAR_PRESSURE_ANGLE_DEG,
      linearPitchStud: LINEAR_PITCH,
      addendumStud: ADDENDUM,
      dedendumStud: DEDENDUM,
      pitchLineOffsetStud: PITCH_LINE_FROM_ROOT,
    },
  })
}

globalThis.BrickLabParts6RackGearFidelity = Object.freeze({
  version: PARTS6_RACK_GEAR_FIDELITY_VERSION,
  upgraded: part ? [part.id] : [],
  moduleStud: GEAR_MODULE_STUD,
  pressureAngleDeg: GEAR_PRESSURE_ANGLE_DEG,
  linearPitchStud: LINEAR_PITCH,
  addendumStud: ADDENDUM,
  dedendumStud: DEDENDUM,
  physics: 'teeth and tie-pin visual finish are physicsIgnore; existing rack mechanics and travel remain authoritative',
})

window.dispatchEvent(new CustomEvent('bricklab:partcatalogchange', {
  detail: { total: PARTS.length, pack: PARTS6_RACK_GEAR_FIDELITY_VERSION },
}))
