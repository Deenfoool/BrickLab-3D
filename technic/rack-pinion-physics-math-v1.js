export const TECHNIC_RACK_PINION_PHYSICS_MATH_VERSION = 'technic-rack-pinion-physics-math-v1.0.0'

const EPS = 1e-12

export function rackPinionSurfaceSpeedV1(omegaRadPerSec, pitchRadiusStud, studMeters, travelSign = 1) {
  const omega = Number(omegaRadPerSec)
  const radiusStud = Number(pitchRadiusStud)
  const scale = Number(studMeters)
  const sign = Math.sign(Number(travelSign) || 1)
  if (!Number.isFinite(omega) || !(radiusStud > 0) || !(scale > 0)) return null
  return omega * radiusStud * scale * sign
}

export function solveRackPinionContactForceV1({
  relativeSpeedMps = 0,
  inverseEffectiveMassPinion = 0,
  inverseEffectiveMassRack = 0,
  dt = 0,
  maxForceN = 0,
  correctionFraction = 0.92,
} = {}) {
  const speed = Number(relativeSpeedMps)
  const invPinion = Math.max(0, Number(inverseEffectiveMassPinion) || 0)
  const invRack = Math.max(0, Number(inverseEffectiveMassRack) || 0)
  const step = Number(dt)
  const forceLimit = Math.max(0, Number(maxForceN) || 0)
  const fraction = Math.max(0, Math.min(1, Number(correctionFraction) || 0))
  const inverseMass = invPinion + invRack

  if (!Number.isFinite(speed) || !(step > 0) || !(inverseMass > EPS) || !(forceLimit > 0) || !(fraction > 0)) {
    return Object.freeze({
      forceN:0,
      requestedForceN:0,
      predictedRelativeSpeedMps:Number.isFinite(speed) ? speed : 0,
      inverseEffectiveMass:inverseMass,
      limited:false,
    })
  }

  // C = vRack - vPinion at the pitch contact along the rack travel tangent.
  // Equal/opposite contact forces change C by F * dt * (invRack + invPinion).
  // Solving the effective-mass equation and taking at most 92% of the exact
  // cancellation force makes this correction dissipative and prevents a single
  // explicit microstep from reversing contact slip.
  const exactForce = -speed / (inverseMass * step)
  const requestedForce = exactForce * fraction
  const forceN = Math.max(-forceLimit, Math.min(forceLimit, requestedForce))
  const predicted = speed + forceN * inverseMass * step

  return Object.freeze({
    forceN,
    requestedForceN:requestedForce,
    predictedRelativeSpeedMps:predicted,
    inverseEffectiveMass:inverseMass,
    limited:Math.abs(forceN) + EPS < Math.abs(requestedForce),
  })
}
