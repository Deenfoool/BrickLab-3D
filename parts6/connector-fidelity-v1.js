import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { PARTS } from '../parts.js'
import { patchPart } from '../parts3/part-schema-v1.js'
import { REAL_TECHNIC_NOMINAL } from './nominal-dimension-fidelity-v1.js'

export const PARTS6_CONNECTOR_FIDELITY_VERSION = 'parts-6-connector-fidelity-v2'
const N = REAL_TECHNIC_NOMINAL

function pom(color) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.40, metalness: 0.004 })
}

function visualOnly(object) {
  object.userData.physicsIgnore = true
  object.userData.parts6VisualDetail = true
  object.userData.parts6ConnectorVisual = true
  return object
}

function wrapFactory(id, decorate, quality) {
  const part = PARTS.find(item => item.id === id)
  if (!part) return false
  const previous = part.create
  patchPart(PARTS, id, {
    create: color => {
      const object = previous(color)
      decorate(object, part, color)
      object.userData.visualVersion = PARTS6_CONNECTOR_FIDELITY_VERSION
      return object
    },
    visualQuality: quality,
  })
  return true
}

const upgraded = []

if (wrapFactory('steering-knuckle', (group, part, color) => {
  const connector = part.connectors.find(item => item.id === 'steering-arm' && item.type === 'pin')
  if (!connector) return
  const pin = visualOnly(new THREE.Mesh(
    new THREE.CylinderGeometry(N.pinBodyRadius, N.pinBodyRadius, 0.43, 40),
    pom(color),
  ))
  pin.position.fromArray(connector.position)
  pin.position.y += 0.08
  group.add(pin)
  const collar = visualOnly(new THREE.Mesh(new THREE.TorusGeometry(N.pinBodyRadius, 0.018, 8, 40), pom(color)))
  collar.rotation.x = Math.PI / 2
  collar.position.fromArray(connector.position)
  collar.position.y += 0.20
  group.add(collar)
}, 'parts-6-steering-knuckle-pin-fidelity-v2')) upgraded.push('steering-knuckle')

if (wrapFactory('wheel-hub', (group, part, color) => {
  const bearing = part.connectors.find(item => item.id === 'bearing' && item.type === 'axle')
  if (!bearing) return
  // PARTS-3 upgrades this inboard bearing port to an axle. Use the same measured
  // cross section as free axles so the wheel carrier visibly keys into the knuckle.
  const material = pom(color)
  const length = 0.30
  const arm = N.axleArmHalfWidth * 2
  const diameter = N.axleTipRadius * 2
  const shaftA = visualOnly(new THREE.Mesh(new RoundedBoxGeometry(length, arm, diameter, 3, 0.022), material))
  const shaftB = visualOnly(new THREE.Mesh(new RoundedBoxGeometry(length, diameter, arm, 3, 0.022), material))
  const center = new THREE.Vector3(...bearing.position)
  center.x -= 0.10
  shaftA.position.copy(center)
  shaftB.position.copy(center)
  group.add(shaftA, shaftB)
  const stop = visualOnly(new THREE.Mesh(new THREE.TorusGeometry(N.axleTipRadius * 0.88, 0.017, 8, 40), material))
  stop.rotation.y = Math.PI / 2
  stop.position.fromArray(bearing.position)
  stop.position.x -= 0.24
  group.add(stop)
}, 'parts-6-wheel-hub-bearing-port-fidelity-v2')) upgraded.push('wheel-hub')

if (wrapFactory('steering-tie-rod-5', (group, part, color) => {
  const material = pom(color)
  const centerRadius = (N.pinCounterboreRadius + N.pinHoleRadius) / 2
  const tubeRadius = (N.pinCounterboreRadius - N.pinHoleRadius) / 2
  for (const connector of part.connectors.filter(item => item.type === 'pin-hole')) {
    for (const side of [-1, 1]) {
      const ring = visualOnly(new THREE.Mesh(new THREE.TorusGeometry(centerRadius, tubeRadius, 8, 40), material))
      ring.rotation.x = Math.PI / 2
      ring.position.fromArray(connector.position)
      ring.position.y += side * 0.155
      group.add(ring)
    }
  }
}, 'parts-6-tie-rod-nominal-eye-fidelity-v2')) upgraded.push('steering-tie-rod-5')

globalThis.BrickLabParts6ConnectorFidelity = Object.freeze({
  version: PARTS6_CONNECTOR_FIDELITY_VERSION,
  upgraded,
  nominal: {
    pinHoleDiameterStud: N.pinHoleRadius * 2,
    pinBodyDiameterStud: N.pinBodyRadius * 2,
    axleTipWidthStud: N.axleTipRadius * 2,
  },
  rule: 'visible port shape must agree with connector type, axis and shared nominal interface dimensions',
})

window.dispatchEvent(new CustomEvent('bricklab:partcatalogchange', {
  detail: { total: PARTS.length, pack: PARTS6_CONNECTOR_FIDELITY_VERSION },
}))
