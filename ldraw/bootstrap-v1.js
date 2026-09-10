import { registerLDrawPart } from './runtime-v1.js'

const PROJECT_KEYS = ['bricklab.project.v2', 'bricklab.project.v1']
const LDRAW_PREFIX = 'ldraw-'
const PREPARED = 'ldrawImportPrepared'

function registrationFromPartId(partId) {
  const id = String(partId || '')
  if (!id.startsWith(LDRAW_PREFIX)) return null
  const code = id.slice(LDRAW_PREFIX.length).trim()
  if (!code) return null
  return { code, file: `${code}.dat`, description: `LDraw ${code}` }
}

export function registerLDrawProjectParts(project) {
  if (!project || !Array.isArray(project.parts)) return 0
  let count = 0
  const seen = new Set()
  for (const item of project.parts) {
    const entry = registrationFromPartId(item?.partId)
    if (!entry || seen.has(entry.code)) continue
    seen.add(entry.code)
    registerLDrawPart(entry)
    count += 1
  }
  return count
}

export function registerPersistedLDrawParts() {
  let count = 0
  for (const key of PROJECT_KEYS) {
    try {
      const raw = localStorage.getItem(key)
      if (!raw) continue
      count += registerLDrawProjectParts(JSON.parse(raw))
    } catch (error) {
      console.warn(`[BrickLab LDraw] Could not inspect ${key}`, error)
    }
  }
  return count
}

function installImportPreparation() {
  document.addEventListener('change', event => {
    const input = event.target
    if (!(input instanceof HTMLInputElement) || input.id !== 'importFile' || input.dataset[PREPARED] === 'true') return
    const file = input.files?.[0]
    if (!file) return

    // app.js handles the real import. We only pause the first change event long
    // enough to register any dynamic ldraw-* definitions, then replay it.
    event.preventDefault()
    event.stopImmediatePropagation()

    void file.text().then(text => {
      try { registerLDrawProjectParts(JSON.parse(text)) }
      catch { /* app.js will report malformed project JSON to the user */ }
      input.dataset[PREPARED] = 'true'
      input.dispatchEvent(new Event('change', { bubbles: true }))
      delete input.dataset[PREPARED]
    }).catch(error => {
      console.warn('[BrickLab LDraw] Could not prepare imported project', error)
      input.dataset[PREPARED] = 'true'
      input.dispatchEvent(new Event('change', { bubbles: true }))
      delete input.dataset[PREPARED]
    })
  }, true)
}

registerPersistedLDrawParts()
installImportPreparation()

export const BrickLabLDrawBootstrap = Object.freeze({
  registerProjectParts: registerLDrawProjectParts,
  registerPersistedParts: registerPersistedLDrawParts,
})

globalThis.BrickLabLDrawBootstrap = BrickLabLDrawBootstrap
