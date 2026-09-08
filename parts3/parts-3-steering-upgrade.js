import * as THREE from 'three'
import { PARTS } from '../parts.js'

export const PARTS3_STEERING_UPGRADE_VERSION = 'parts-3-steering-upgrade-v1'

function steeringMaterial(color) {
  return new THREE.MeshPhysicalMaterial({ color, roughness: 0.34, metalness: 0.02, clearcoat: 0.14, clearcoatRoughness: 0.42 })
}

// The hub itself is the rotating spindle. Its inboard connector must therefore
// be an axle engaging the knuckle's pin-hole bearing. The outer axle connector
// rigidly carries the wheel. This gives: knuckle --bearing--> hub+wheel.
const hub = PARTS.find(part => part.id === 'wheel-hub')
const hubBearing = hub?.connectors?.find(connector => connector.id === 'bearing')
if (hubBearing) hubBearing.type = 'axle'

// PHYSICS-11 introduced the semantic steering-arm pin. Give it matching visible
// geometry so the tie-rod connection is not a floating snap point in the editor.
const knuckle = PARTS.find(part => part.id === 'steering-knuckle')
if (knuckle && typeof knuckle.create === 'function' && !knuckle.__parts3SteeringArmVisual) {
  knuckle.__parts3SteeringArmVisual = true
  const create = knuckle.create
  knuckle.create = color => {
    const object = create(color)
    const material = steeringMaterial(color)
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.18, 1.05), material)
    arm.position.set(0, 0.55, 0.43)
    arm.geometry.translate(0, 0, 0.18)
    object.add(arm)

    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.52, 24), material)
    pin.position.set(0, 0.55, 0.72)
    object.add(pin)

    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.025, 7, 24), material)
    collar.rotation.x = Math.PI / 2
    collar.position.set(0, 0.81, 0.72)
    object.add(collar)
    return object
  }
}

globalThis.BrickLabParts3SteeringUpgrade = Object.freeze({
  version: PARTS3_STEERING_UPGRADE_VERSION,
  hubBearingType: hubBearing?.type ?? null,
  steeringArmVisual: Boolean(knuckle?.__parts3SteeringArmVisual),
})
