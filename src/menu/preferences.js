// Global user preferences. Kept separately from the saved build documents.
// Storage failures are treated as defaults rather than blocking the editor.
const preferences = Object.freeze({
  sound: { storage: 'bricklab.editor.sound', defaultValue: 'on', values: ['on', 'off'] },
  snap: { storage: 'bricklab.editor.snap', defaultValue: 'on', values: ['on', 'off'] },
  rotationSnap: { storage: 'bricklab.editor.rotationSnap', defaultValue: 'on', values: ['on', 'off'] },
  grid: { storage: 'bricklab.editor.grid', defaultValue: 'on', values: ['on', 'off'] },
  axes: { storage: 'bricklab.editor.axes', defaultValue: 'on', values: ['on', 'off'] },
  previews: { storage: 'bricklab.ui.previews', defaultValue: 'on', values: ['on', 'off'] },
  quality: { storage: 'bricklab.editor.quality', defaultValue: 'high', values: ['low', 'balanced', 'high'] },
})

export function readPreference(name) {
  const definition = preferences[name]
  if (!definition) throw new RangeError(`Unknown preference: ${name}`)
  try {
    const value = localStorage.getItem(definition.storage)
    return definition.values.includes(value) ? value : definition.defaultValue
  } catch {
    return definition.defaultValue
  }
}

export function writePreference(name, value) {
  const definition = preferences[name]
  if (!definition || !definition.values.includes(value)) return false
  try {
    localStorage.setItem(definition.storage, value)
    return true
  } catch {
    return false
  }
}

export function resetPreferences() {
  try {
    for (const definition of Object.values(preferences)) localStorage.removeItem(definition.storage)
    return true
  } catch {
    return false
  }
}
