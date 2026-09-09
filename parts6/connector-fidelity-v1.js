import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { PARTS } from '../parts.js'
import { patchPart } from '../parts3/part-schema-v1.js'

export const PARTS6_CONNECTOR_FIDELITY_VERSION = 'parts-6-connector-fidelity-v1'

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
  const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.166, 0.166, 0.43, 32), pom(color))
  pin.position.fromArray(connector.position)
  pin.position.y += 0.08
  group.add(pin)
  const collar = visualOnly(new THREE.Mesh(new THREE.TorusGeometry(0.172, 0.018, 7, 32), pom(color)))
  collar.rotation.x = Math.PI / 2
  collar.position.fromArray(connector.position)
  collar.position.y += 0.20
  group.add(collar)
}, 'parts-6-steering-knuckle-pin-fidelity')) upgraded.push('steering-knuckle')

if (wrapFactory('wheel-hub', (group, part, color) => {
  const bearing = part.connectors.find(item => item.id === 'bearing' && item.type === 'axle')
  if (!bearing) return
  // This inboard port is an axle after the PARTS-3 steering upgrade. Render the
  // same rounded cross section as the rest of BrickLab axles instead of a smooth pin.
  const material = pom(color)
  const length = 0.30
  const arm = 0.148
  const diameter = 0.36
  const shaftA = new THREE.Mesh(new RoundedBoxGeometry(length, arm, diameter, 3, 0.020), material)
  const shaftB = new THREE.Mesh(new RoundedBoxGeometry(length, diameter, arm, 3, 0.020), material)
  const center = new THREE.Vector3(...bearing.position)
  center.x -= 0.10
  shaftA.position.copy(center)
  shaftB.position.copy(center)
  group.add(shaftA, shaftB)
  const stop = visualOnly(new THREE.Mesh(new THREE.TorusGeometry(0.170, 0.017, 7, 32), material))
  stop.rotation.y = Math.PI / 2
  stop.position.fromArray(bearing.position)
  stop.position.x -= 0.24
  group.add(stop)
}, 'parts-6-wheel-hub-bearing-port-fidelity')) upgraded.push('wheel-hub')

globalThis.BrickLabParts6ConnectorFidelity = Object.freeze({
  version: PARTS6_CONNECTOR_FIDELITY_VERSION,
  upgraded,
  rule: 'visible port shape must agree with connector type and axis',
})

window.dispatchEvent(new CustomEvent('bricklab:partcatalogchange', {
  detail: { total: PARTS.length, pack: PARTS6_CONNECTOR_FIDELITY_VERSION },
}))
