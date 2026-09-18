export const MECHANICS_DOMAINS = Object.freeze([
  'connector-hydration',
  'snapping',
  'connection-graph',
  'persistence',
  'kinematics',
  'physics-constraints',
])

export const LEGACY_OWNERSHIP = Object.freeze({
  'connector-hydration':'legacy-v4',
  snapping:'legacy-v4',
  'connection-graph':'legacy-v4',
  persistence:'legacy-v4',
  kinematics:'legacy-v1',
  'physics-constraints':'legacy-v4',
})

export class OwnershipLedger {
  #owners = new Map()
  #history = []

  constructor(initial = LEGACY_OWNERSHIP) {
    for (const domain of MECHANICS_DOMAINS) {
      const owner = initial?.[domain]
      if (!owner) throw new TypeError(`Missing initial owner for ${domain}`)
      this.#owners.set(domain, String(owner))
    }
  }

  owner(domain) {
    if (!MECHANICS_DOMAINS.includes(domain)) throw new TypeError(`Unknown mechanics domain: ${domain}`)
    return this.#owners.get(domain)
  }

  isOwner(domain, owner) {
    return this.owner(domain) === String(owner)
  }

  handoff(domain, from, to, {
    reason,
    checks = {},
  } = {}) {
    if (!MECHANICS_DOMAINS.includes(domain)) throw new TypeError(`Unknown mechanics domain: ${domain}`)
    const current = this.#owners.get(domain)
    if (current !== String(from)) {
      throw new Error(`Ownership handoff rejected for ${domain}: expected ${from}, current owner is ${current}`)
    }
    if (!to || String(to) === current) throw new TypeError('Handoff requires a different target owner')

    const required = ['tests', 'migration', 'diagnostics', 'rollback']
    const missing = required.filter(key => checks?.[key] !== true)
    if (missing.length) {
      throw new Error(`Ownership handoff rejected for ${domain}; missing checks: ${missing.join(', ')}`)
    }

    const entry = Object.freeze({
      domain,
      from:current,
      to:String(to),
      reason:String(reason || 'explicit migration'),
      at:Date.now(),
    })
    this.#owners.set(domain, String(to))
    this.#history.push(entry)
    return entry
  }

  snapshot() {
    return Object.freeze({
      owners:Object.freeze(Object.fromEntries(this.#owners)),
      history:Object.freeze(this.#history.slice()),
    })
  }
}

export function createOwnershipLedger(initial) {
  return new OwnershipLedger(initial)
}
