// Progress is kept outside .bricklab documents so a tutorial cannot modify
// a user's existing projects. Losing storage never prevents editing.
const key = 'bricklab.tutorial.v1'
const modes = ['quick', 'first', 'mechanics']
const blank = () => ({ seen: false, active: null, completed: [] })

export function readTutorial() {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? 'null')
    if (!value || typeof value !== 'object') return blank()
    const active = value.active
    return {
      seen: Boolean(value.seen),
      completed: Array.isArray(value.completed) ? value.completed.filter(mode => modes.includes(mode)) : [],
      active: active && modes.includes(active.mode) && typeof active.projectId === 'string'
        ? { mode: active.mode, projectId: active.projectId, step: Math.max(0, Math.min(5, Number(active.step) || 0)) } : null,
    }
  } catch {
    return blank()
  }
}

function write(value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* preferences are optional */ }
  return value
}

export function dismissTutorialOffer() {
  return write({ ...readTutorial(), seen: true })
}

export function startTutorial(projectId, mode) {
  if (!modes.includes(mode) || typeof projectId !== 'string') return readTutorial()
  return write({ ...readTutorial(), seen: true, active: { projectId, mode, step: 0 } })
}

export function advanceTutorial(projectId, nextStep) {
  const current = readTutorial()
  if (current.active?.projectId !== projectId) return current
  return write({ ...current, active: { ...current.active, step: nextStep } })
}

export function leaveTutorial(projectId) {
  const current = readTutorial()
  if (current.active?.projectId !== projectId) return current
  return write({ ...current, seen: true, active: null })
}

export function finishTutorial(projectId) {
  const current = readTutorial()
  if (current.active?.projectId !== projectId) return current
  const mode = current.active.mode
  return write({ ...current, seen: true, active: null,
    completed: [...new Set([...current.completed, mode])] })
}
