import { PARTS } from '../parts.js'

export const PARTS4_CATALOG_VERSION = 'parts-4-catalog-v1'

for (const id of ['shock-body-5', 'shock-rod-5']) {
  const part = PARTS.find(item => item.id === id)
  if (part) part.category = 'Suspension'
}

function isRussian() {
  return document.documentElement.lang === 'ru' || localStorage.getItem('bricklab.ui.language.v1') === 'ru'
}

function refreshCategory() {
  const ru = isRussian()
  const button = document.querySelector('[data-catalog-filter="Suspension"]')
  const label = button?.querySelector('span')
  if (label) label.textContent = ru ? 'Подвеска' : 'Suspension'
  const icon = button?.querySelector('[data-lucide]')
  if (icon) icon.setAttribute('data-lucide', 'activity')

  for (const card of document.querySelectorAll('.part-card[data-part]')) {
    const part = PARTS.find(item => item.id === card.dataset.part)
    if (part?.category !== 'Suspension') continue
    card.dataset.category = 'Suspension'
    const meta = card.querySelector('.catalog-card-meta')
    if (meta) meta.textContent = ru ? 'Подвеска' : 'Suspension'
  }
  window.lucide?.createIcons?.({ attrs: { 'stroke-width': 1.8, 'aria-hidden': 'true' } })
}

let scheduled = false
function schedule() {
  if (scheduled) return
  scheduled = true
  requestAnimationFrame(() => {
    scheduled = false
    refreshCategory()
  })
}

window.addEventListener('bricklab:partcatalogchange', schedule)
window.addEventListener('bricklab:languagechange', schedule)
window.addEventListener('DOMContentLoaded', schedule, { once: true })
window.dispatchEvent(new CustomEvent('bricklab:partcatalogchange', {
  detail: { pack: PARTS4_CATALOG_VERSION, category: 'Suspension' },
}))
schedule()

globalThis.BrickLabParts4Catalog = Object.freeze({ version: PARTS4_CATALOG_VERSION, refresh: refreshCategory })
