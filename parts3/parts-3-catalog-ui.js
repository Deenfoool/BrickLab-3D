export const PARTS3_CATALOG_UI_VERSION = 'parts-3-catalog-ui-v1'

function isRussian() {
  return document.documentElement.lang === 'ru' || localStorage.getItem('bricklab.ui.language.v1') === 'ru'
}

function patchSteeringCategory() {
  const button = document.querySelector('[data-catalog-filter="Steering"]')
  const label = button?.querySelector('span')
  if (label) label.textContent = isRussian() ? 'Рулевое' : 'Steering'

  document.querySelectorAll('.part-card[data-category="Steering"] .catalog-card-meta').forEach(meta => {
    meta.textContent = isRussian() ? 'Рулевое' : 'Steering'
  })
}

function schedule() { requestAnimationFrame(patchSteeringCategory) }
window.addEventListener('bricklab:partcatalogchange', schedule)
window.addEventListener('bricklab:languagechange', schedule)
window.addEventListener('DOMContentLoaded', schedule, { once: true })
schedule()

globalThis.BrickLabParts3CatalogUI = Object.freeze({ version: PARTS3_CATALOG_UI_VERSION, refresh: patchSteeringCategory })
