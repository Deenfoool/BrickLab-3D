import { PARTS } from '../parts.js'
import { patchPart } from '../parts3/part-schema-v1.js'

export const PARTS6_STEERING_CARRIER_PORT_DEDUP_VERSION = 'parts-6-steering-carrier-port-dedup-v8'

function removeTaggedChildren(root, predicate) {
  const removals = []
  root.traverse(node => {
    if (node === root) return
    if (predicate(node)) removals.push(node)
  })
  for (const node of removals) node.parent?.remove(node)
  return removals.length
}

function wrapFinal(id, cleanup) {
  const part = PARTS.find(item => item.id === id)
  if (!part || typeof part.create !== 'function') return false
  const previous = part.create
  patchPart(PARTS, id, {
    create: color => {
      const object = previous(color)
      const removed = cleanup(object)
      object.userData.parts6SteeringCarrierPortDedup = PARTS6_STEERING_CARRIER_PORT_DEDUP_VERSION
      object.userData.parts6SteeringCarrierRemovedDuplicates = removed
      return object
    },
  })
  return true
}

const cleaned = []

for (const id of ['steering-base', 'steering-knuckle', 'bearing-block']) {
  if (wrapFinal(id, object => removeTaggedChildren(object, node => Boolean(node.userData?.parts6InterfaceFeature)))) cleaned.push(id)
}

if (wrapFinal('steering-tie-rod-5', object => removeTaggedChildren(object, node => Boolean(node.userData?.parts6ConnectorVisual)))) {
  cleaned.push('steering-tie-rod-5')
}

if (wrapFinal('wheel-hub', object => removeTaggedChildren(object, node => {
  const feature = node.userData?.parts6InterfaceFeature
  if (!feature) return false
  // Keep the inboard bearing cross axle supplied by the canonical interface layer.
  // Remove only the outboard nominal stub because the v8 hub already owns that
  // connector-aligned cross shaft as part of its molded hub geometry.
  if (feature === 'nominal-cross-axle-stub') return Number(node.position?.x ?? 0) > 0
  return true
}))) cleaned.push('wheel-hub')

globalThis.BrickLabParts6SteeringCarrierPortDedup = Object.freeze({
  version: PARTS6_STEERING_CARRIER_PORT_DEDUP_VERSION,
  cleaned,
  rule: 'steering-carrier v8 owns its molded port surfaces; later generic interface/connector decorations are removed where they would overlap, while the hub inboard bearing axle remains canonical',
})

window.dispatchEvent(new CustomEvent('bricklab:partcatalogchange', {
  detail: { total: PARTS.length, pack: PARTS6_STEERING_CARRIER_PORT_DEDUP_VERSION },
}))
