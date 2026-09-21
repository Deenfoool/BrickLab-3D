// Optional observers are isolated from editor/physics errors; no solver dependencies.
const listeners = new Set()
const listenerErrorTimes = new WeakMap()
const ERROR_LOG_INTERVAL_MS = 5000

export function observeAudioEvents(listener) {
  if (typeof listener !== 'function') throw new TypeError('Audio event listener must be a function')
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function emitAudioEvent(type, detail = {}) {
  for (const listener of [...listeners]) {
    try {
      listener(type, detail)
    } catch (error) {
      // Audio must never break editor/physics, but a dead listener must remain diagnosable.
      const now = Date.now()
      const previous = listenerErrorTimes.get(listener) ?? -Infinity
      if (now - previous >= ERROR_LOG_INTERVAL_MS) {
        listenerErrorTimes.set(listener, now)
        console.warn('[BrickLab Audio] Event listener failed.', { type, error })
      }
    }
  }
}
