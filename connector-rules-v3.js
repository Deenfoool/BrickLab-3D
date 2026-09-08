export const CONNECTOR_SYSTEM_VERSION = 'connector-system-v3'

const rules = new Map([
  ['stud|tube', { kind: 'fixed', axis: 'opposed', captureDistance: 0.42, minAlignment: 0.94, contactTolerance: 0.105, contactAlignment: 0.96, multiContact: true }],
  ['pin|pin-hole', { kind: 'hinge', axis: 'parallel', captureDistance: 0.40, minAlignment: 0.92 }],
  ['axle|pin-hole', { kind: 'bearing', axis: 'parallel', captureDistance: 0.38, minAlignment: 0.94 }],
  ['axle|axle-hole', { kind: 'axle', axis: 'parallel', captureDistance: 0.36, minAlignment: 0.95, keyed: true, twistStep: Math.PI / 2 }],
])

const keyFor = (a, b) => [a, b].sort().join('|')

export function connectorRuleV3(typeA, typeB) {
  return rules.get(keyFor(typeA, typeB)) ?? null
}

export const CONNECTOR_RULES_V3 = Object.freeze(Object.fromEntries(rules))
