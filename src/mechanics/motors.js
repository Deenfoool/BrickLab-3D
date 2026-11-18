export const controlPlusBodies = new Set(['u9479c01', '10089c01'])
export const controlPlusHubs = new Set(['22127', '85824', '58119', '64228c01', '84599'])

const clamp = (value, min, max, fallback) => Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback

export const compatibleSupply = (body, hub) => controlPlusHubs.has(hub) &&
  ((body === '10089c01') === ['58119', '64228c01', '84599'].includes(hub))

export function motorSettings(part) {
  const settings = part?.electric ?? {}
  return { hubId: typeof settings.hubId === 'string' ? settings.hubId : '',
    port: Math.round(clamp(settings.port, 0, 3, 0)), power: clamp(settings.power, -100, 100, 0),
    stop: ['coast', 'brake', 'hold'].includes(settings.stop) ? settings.stop : 'coast' }
}

export function hubSettings(part) {
  return { on: part?.electric?.on === true, battery: clamp(part?.electric?.battery, 0, 100, 100) }
}

// Approximate Control+ L DC output curve at a nominal 9 V supply.
export function motorSupply(part, parts) {
  const settings = motorSettings(part)
  const hub = parts.find(candidate => candidate.id === settings.hubId && compatibleSupply(part.design, candidate.design))
  const pf = part.design === '10089c01'
  const freeRpm = pf ? 390 : 315
  const occupied = (pf && settings.port !== 0) || parts.filter(candidate => controlPlusBodies.has(candidate.design) &&
    motorSettings(candidate).hubId === settings.hubId && motorSettings(candidate).port === settings.port).length > 1
  const supply = hubSettings(hub)
  const powered = Boolean(hub && supply.on && supply.battery > 0 && !occupied)
  const voltage = powered ? (6 + 3 * supply.battery / 100) / 9 : 0
  return { ...settings, powered, occupied, voltage,
    freeRpm, speed: freeRpm * Math.PI / 30 * settings.power / 100 * voltage,
    torque: .18 * voltage, reason: occupied ? 'port' : !hub ? 'cable' : !supply.on ? 'off' : supply.battery <= 0 ? 'battery' : '' }
}

export function motorTorque(supply, velocity, position = 0, holdPosition = 0) {
  if (!supply.powered) return 0
  const maximum = supply.torque
  if (supply.power === 0 && supply.stop === 'coast') return 0
  if (supply.power === 0 && supply.stop === 'hold') {
    return Math.max(-maximum, Math.min(maximum, (holdPosition - position) * .8 - velocity * .025))
  }
  const torque = supply.power === 0 ? -velocity * .025
    : maximum * (supply.power / 100 - velocity / (supply.freeRpm * Math.PI / 30 * supply.voltage))
  return Math.max(-maximum, Math.min(maximum, torque))
}
