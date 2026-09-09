// Optional observers are isolated from editor/physics errors; no solver dependencies.
const listeners = new Set()
export function observeAudioEvents(listener) { listeners.add(listener); return () => listeners.delete(listener) }
export function emitAudioEvent(type, detail = {}) {
  for (const listener of listeners) { try { listener(type, detail) } catch { /* Audio is secondary. */ } }
}
