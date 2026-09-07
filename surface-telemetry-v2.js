import { PhysicsSession } from './physics.js'

const oldUpdate = PhysicsSession.prototype.updateTelemetryReadings
PhysicsSession.prototype.updateTelemetryReadings = function updateActiveSurfaceTelemetry(...args) {
  const result = oldUpdate.apply(this, args)
  const active = this.surfaceOverride ?? this.scenarioData?.surface ?? 'concrete'
  this.activeSurfaceId = active
  const grid = document.querySelector('.physics-v2-grid')
  if (grid) {
    const surfaceRow = [...grid.querySelectorAll('span')].find(row => row.firstChild?.textContent?.trim().startsWith('SURFACE') || row.textContent?.trim().startsWith('ПОКРЫТИЕ'))
    const value = surfaceRow?.querySelector('b')
    if (value) value.textContent = active
  }
  const sample = this.telemetryLog?.at(-1)
  if (sample) sample.surface = active
  return result
}
