export const AXIAL_OCCUPANCY_VERSION_V4 = 'axial-occupancy-v4.0.0'
export const AXIAL_EPSILON_V4 = 1e-5

function finite(value) { return Number.isFinite(value) }

export function normalizeIntervalV4(interval) {
  const values = Array.isArray(interval) ? interval : [interval?.start, interval?.end]
  if (!finite(values[0]) || !finite(values[1])) throw new TypeError('Axial interval requires two finite coordinates')
  const start = Math.min(values[0], values[1])
  const end = Math.max(values[0], values[1])
  if (end - start <= AXIAL_EPSILON_V4) throw new RangeError('Axial interval must have positive length')
  return [start, end]
}

export function axialOverlapV4(a, b, epsilon = AXIAL_EPSILON_V4) {
  const [a0, a1] = normalizeIntervalV4(a)
  const [b0, b1] = normalizeIntervalV4(b)
  const start = Math.max(a0, b0)
  const end = Math.min(a1, b1)
  const length = end - start
  return {
    overlaps: length > epsilon,
    touches: Math.abs(length) <= epsilon,
    interval: length > epsilon ? [start, end] : null,
    length: Math.max(0, length),
  }
}

function normalizeReservation(input) {
  if (!input || typeof input !== 'object') throw new TypeError('reservation must be an object')
  const [start, end] = normalizeIntervalV4(input.interval ?? [input.start, input.end])
  const connectionId = String(input.connectionId || '').trim()
  if (!connectionId) throw new TypeError('reservation.connectionId is required')
  return {
    connectionId,
    occupantId: String(input.occupantId || '').trim() || null,
    interval: [start, end],
    kind: String(input.kind || 'solid'),
    metadata: input.metadata == null ? null : input.metadata,
  }
}

function channelName(value) {
  const result = String(value || '').trim()
  if (!result) throw new TypeError('occupancy channel is required')
  return result
}

export function createAxialOccupancyV4() {
  const channels = new Map()

  function records(channel) {
    const key = channelName(channel)
    if (!channels.has(key)) channels.set(key, [])
    return channels.get(key)
  }

  function conflicts(channel, reservation, { ignoreConnectionId = null, epsilon = AXIAL_EPSILON_V4 } = {}) {
    const candidate = normalizeReservation(reservation)
    return records(channel).filter(existing => {
      if (ignoreConnectionId && existing.connectionId === ignoreConnectionId) return false
      if (existing.connectionId === candidate.connectionId) return false
      return axialOverlapV4(existing.interval, candidate.interval, epsilon).overlaps
    })
  }

  function canReserve(channel, reservation, options = {}) {
    return conflicts(channel, reservation, options).length === 0
  }

  function reserve(channel, reservation, { replace = false, allowOverlap = false } = {}) {
    const key = channelName(channel)
    const candidate = normalizeReservation(reservation)
    const list = records(key)
    if (replace) {
      for (let i = list.length - 1; i >= 0; i -= 1) if (list[i].connectionId === candidate.connectionId) list.splice(i, 1)
    }
    const blockedBy = conflicts(key, candidate)
    if (blockedBy.length && !allowOverlap) {
      return { accepted: false, reservation: candidate, conflicts: blockedBy.map(item => ({ ...item, interval: [...item.interval] })) }
    }
    list.push(candidate)
    list.sort((a, b) => a.interval[0] - b.interval[0] || a.interval[1] - b.interval[1] || a.connectionId.localeCompare(b.connectionId))
    return { accepted: true, reservation: { ...candidate, interval: [...candidate.interval] }, conflicts: blockedBy }
  }

  function releaseConnection(connectionId) {
    const wanted = String(connectionId || '')
    let removed = 0
    for (const [key, list] of channels) {
      for (let i = list.length - 1; i >= 0; i -= 1) {
        if (list[i].connectionId !== wanted) continue
        list.splice(i, 1)
        removed += 1
      }
      if (!list.length) channels.delete(key)
    }
    return removed
  }

  function releaseChannel(channel) {
    return channels.delete(channelName(channel))
  }

  function query(channel) {
    return records(channel).map(item => ({ ...item, interval: [...item.interval] }))
  }

  function freeIntervals(channel, bounds, epsilon = AXIAL_EPSILON_V4) {
    const [min, max] = normalizeIntervalV4(bounds)
    const occupied = query(channel)
      .map(item => [Math.max(min, item.interval[0]), Math.min(max, item.interval[1])])
      .filter(([start, end]) => end - start > epsilon)
      .sort((a, b) => a[0] - b[0])

    const merged = []
    for (const interval of occupied) {
      const last = merged.at(-1)
      if (!last || interval[0] > last[1] + epsilon) merged.push([...interval])
      else last[1] = Math.max(last[1], interval[1])
    }

    const free = []
    let cursor = min
    for (const [start, end] of merged) {
      if (start - cursor > epsilon) free.push([cursor, start])
      cursor = Math.max(cursor, end)
    }
    if (max - cursor > epsilon) free.push([cursor, max])
    return free
  }

  function snapshot() {
    return Object.fromEntries([...channels.entries()].map(([key, list]) => [key, list.map(item => ({ ...item, interval: [...item.interval] }))]))
  }

  return Object.freeze({
    version: AXIAL_OCCUPANCY_VERSION_V4,
    canReserve,
    conflicts,
    reserve,
    releaseConnection,
    releaseChannel,
    query,
    freeIntervals,
    snapshot,
    clear() { channels.clear() },
  })
}
