const storageKey = 'bricklab.projects.v1'
const format = 'bricklab-3d'
const version = 1

function isDocument(value) {
  return value?.format === format && value.version === version &&
    typeof value.name === 'string' && value.name.trim().length > 0 && value.name.length <= 120 &&
    Array.isArray(value.parts) && Array.isArray(value.connections)
}

export function readProjects() {
  try {
    const records = JSON.parse(localStorage.getItem(storageKey) ?? '[]')
    if (!Array.isArray(records)) return []
    return records.filter(record => isDocument(record?.document) &&
      typeof record.id === 'string' && Number.isFinite(new Date(record.modifiedAt).getTime()))
  } catch {
    return []
  }
}

export function writeProjects(records) {
  localStorage.setItem(storageKey, JSON.stringify(records))
}

export function newProject(name, { parts = [], connections = [], gears = [] } = {}) {
  return { format, version, name, parts, connections, gears }
}

export function parseProject(text) {
  const document = JSON.parse(text)
  if (!isDocument(document)) throw new Error('Invalid project document')
  return document
}

export function makeRecord(document, id = crypto.randomUUID()) {
  return { id, document, modifiedAt: new Date().toISOString() }
}

export function downloadProject(document) {
  const blob = new Blob([JSON.stringify(document, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = window.document.createElement('a')
  link.href = url
  link.download = `${document.name.replace(/[\\/:*?"<>|]/g, '-').trim() || 'BrickLab'}.bricklab`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
