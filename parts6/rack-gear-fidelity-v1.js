import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { PARTS } from '../parts.js'
import { patchPart } from '../parts3/part-schema-v1.js'
import { GEAR_MODULE_STUD, GEAR_PRESSURE_ANGLE_DEG } from '../parts5/part-geometry-metrics-v1.js'
import { REAL_TECHNIC_NOMINAL } from './nominal-dimension-fidelity-v1.js'

export const PARTS6_RACK_GEAR_FIDELITY_VERSION = 'parts-6-rack-gear-fidelity-v1'

const N = REAL_TECHNIC_NOMINAL
const LINEAR_PITCH = Math.PI * GEAR_MODULE_STUD
const PRESSURE_ANGLE = GEAR_PRESSURE_ANGLE_DEG * Math.PI / 180

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

function rackToothGeometry(depth = 0.38) {
  const toothHeight = GEAR_MODULE_STUD * 0.92
  const rootHalf = LINEAR_PITCH * 0.34
  const tipHalf = Math.max(LINEAR_PITCH * 0.16, rootHalf - Math.tan(PRESSURE_ANGLE) * toothHeight)
  const shape = new THREE.Shape()
  shape.moveTo(-rootHalf, 0)
  shape.lineTo(-tipHalf, toothHeight)
  shape.lineTo(tipHalf, toothHeight)
  shape.lineTo(rootHalf, 0)
  shape.closePath()
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.006,
    bevelThickness: 0.006,
    curveSegments: 8,
    steps: 1,
  })
  geometry.translate(0, 0, -depth / 2)
  return geometry
}

function addTiePin(group, connector, color) {
  const pin = visualOnly(new THREE.Mesh(
    new THREE.CylinderGeometry(N.pinBodyRadius, N.pinBodyRadius, 0.42, 36),
    pom(color, 0.42),
  ), 'tie-pin')
  pin.position.fromArray(connector.position)
  pin.position.y += 0.08
  group.add(pin)

  const stop = visualOnly(new THREE.Mesh(
    new THREE.TorusGeometry(N.pinBodyRadius, 0.018, 8, 36),
    pom(color, 0.42),
  ), 'tie-pin-stop')
  stop.rotation.x = Math.PI / 2
  stop.position.fromArray(connector.position)
  stop.position.y += 0.20
  group.add(stop)
}

function createRack(part, color) {
  const group = root(part.id, color)
  const material = pom(color)
  const railLength = 6.20
  const rail = new THREE.Mesh(new RoundedBoxGeometry(railLength, 0.30, 0.38, 4, 0.065), material)
  rail.position.y = 0.62
  group.add(rail)

  const usableLength = 5.72
  const toothCount = Math.max(3, Math.floor(usableLength / LINEAR_PITCH) + 1)
  const occupied = (toothCount - 1) * LINEAR_PITCH
  const firstX = -occupied / 2
  const toothGeometry = rackToothGeometry(0.38)
  const teeth = visualOnly(new THREE.InstancedMesh(toothGeometry, material, toothCount), 'module-matched-teeth')
  const matrix = new THREE.Matrix4()
  for (let i = 0; i < toothCount; i += 1) {
    matrix.makeTranslation(firstX + i * LINEAR_PITCH, 0.77, 0)
    teeth.setMatrixAt(i, matrix)
  }
  teeth.instanceMatrix.needsUpdate = true
  group.add(teeth)

  const armMaterial = pom(color, 0.43)
  for (const connector of part.connectors.filter(item => item.type === 'pin')) {
    const x = connector.position[0]
    const arm = new THREE.Mesh(new RoundedBoxGeometry(0.44, 0.28, 1.02, 4, 0.075), armMaterial)
    arm.position.set(x, 0.62, 0.42)
    group.add(arm)
    const boss = new THREE.Mesh(new THREE.CylinderGeometry(0.37, 0.37, 0.26, 40), armMaterial)
    boss.position.set(x, connector.position[1], connector.position[2])
    group.add(boss)
    addTiePin(group, connector, color)
  }

  group.userData.rackGearMetrics = {
    moduleStud: GEAR_MODULE_STUD,
    pressureAngleDeg: GEAR_PRESSURE_ANGLE_DEG,
    linearPitchStud: LINEAR_PITCH,
    toothCount,
  }
  return group
}

const part = PARTS.find(item => item.id === 'steering-rack-7')
if (part) {
  patchPart(PARTS, part.id, {
    create: color => createRack(part, color),
    visualQuality: 'parts-6-module-matched-steering-rack',
    rackVisualMetrics: {
      moduleStud: GEAR_MODULE_STUD,
      pressureAngleDeg: GEAR_PRESSURE_ANGLE_DEG,
      linearPitchStud: LINEAR_PITCH,
    },
  })
}

globalThis.BrickLabParts6RackGearFidelity = Object.freeze({
  version: PARTS6_RACK_GEAR_FIDELITY_VERSION,
  upgraded: part ? [part.id] : [],
  moduleStud: GEAR_MODULE_STUD,
  pressureAngleDeg: GEAR_PRESSURE_ANGLE_DEG,
  linearPitchStud: LINEAR_PITCH,
  physics: 'teeth and tie-pin visual finish are physicsIgnore; existing rack mechanics and travel remain authoritative',
})

window.dispatchEvent(new CustomEvent('bricklab:partcatalogchange', {
  detail: { total: PARTS.length, pack: PARTS6_RACK_GEAR_FIDELITY_VERSION },
}))
