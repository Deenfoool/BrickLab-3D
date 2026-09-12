export const PIN_RANKING_VERSION_V4 = 'pin-ranking-v4.1.0'
export const PIN_EXACT_MATE_SCORE_BONUS_V4 = 0.13
export const PIN_FALLBACK_MATE_SCORE_BONUS_V4 = 0.02

function rolesOf(activation) {
  return new Set([activation?.sourceRole,activation?.targetRole].filter(Boolean))
}

export function pinMatePreferenceV4(activation) {
  if (!activation?.active || activation?.family !== 'technic-pin-hole') {
    return Object.freeze({ tier:0, kind:'none', scoreBonus:0, reason:'not-technic-pin-hole' })
  }

  const roles=rolesOf(activation)
  if (roles.has('technic-pin') && roles.has('technic-pin-hole')) {
    return Object.freeze({
      tier:2,
      kind:'exact-pin-hole',
      scoreBonus:PIN_EXACT_MATE_SCORE_BONUS_V4,
      reason:'profile-verified-male-female-pair',
    })
  }

  if (roles.has('technic-pin') && roles.has('technic-round-hole')) {
    return Object.freeze({
      tier:1,
      kind:'compatible-round-hole',
      scoreBonus:PIN_FALLBACK_MATE_SCORE_BONUS_V4,
      reason:'compatible-round-receiver-fallback',
    })
  }

  return Object.freeze({ tier:0, kind:'none', scoreBonus:0, reason:'pin-role-pair-not-proven' })
}

export function applyPinMateScoreBonusV4(score,preference) {
  const base=Number(score)
  if (!Number.isFinite(base)) return score
  const bonus=Math.max(0,Number(preference?.scoreBonus)||0)
  return base-bonus
}
