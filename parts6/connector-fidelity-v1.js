import * as THREE from 'three'
import { PARTS } from '../parts.js'
import { patchPart } from '../parts3/part-schema-v1.js'
import { REAL_TECHNIC_NOMINAL } from './nominal-dimension-fidelity-v1.js'

export const PARTS6_CONNECTOR_FIDELITY_VERSION = 'parts-6-connector-fidelity-v3'
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

// Tie-rod eyes are handled here because their real connector IDs are eye-left /
// eye-right and the base mechanical factory already supplies the central link.
// Knuckle and wheel-hub ports are intentionally NOT decorated here: the later
// interface-fit layer owns those ports so two visual layers cannot overlap and z-fight.
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
}, 'parts-6-tie-rod-nominal-eye-fidelity-v3')) upgraded.push('steering-tie-rod-5')

globalThis.BrickLabParts6ConnectorFidelity = Object.freeze({
  version: PARTS6_CONNECTOR_FIDELITY_VERSION,
  upgraded,
  nominal: {
    pinHoleDiameterStud: N.pinHoleRadius * 2,
    pinBodyDiameterStud: N.pinBodyRadius * 2,
    axleTipWidthStud: N.axleTipRadius * 2,
  },
  finalPortOwner: 'interface-fit-refinement-v2 for knuckle/hub/housing ports',
  rule: 'one visual owner per mating port; visible shape must agree with connector type, axis and shared nominal dimensions',
})

window.dispatchEvent(new CustomEvent('bricklab:partcatalogchange', {
  detail: { total: PARTS.length, pack: PARTS6_CONNECTOR_FIDELITY_VERSION },
}))
