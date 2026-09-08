import { PARTS } from '../parts.js'

export const PARTS4_I18N_VERSION = 'parts-4-i18n-v1'

const RU = Object.freeze({
  'universal-joint-30': ['Кардан 30°', 'Шарнирный карданный привод 1:1 с реальным сферическим соединением выходного вала'],
  'cv-joint-30': ['ШРУС 30°', 'Шарнир равных угловых скоростей 1:1 для приводных управляемых колёс'],
  'worm-drive-8': ['Червячный редуктор 8:1', 'Компактный угловой червячный редуктор с понижением скорости в 8 раз'],
  'bevel-gear-12': ['Коническая шестерня 12T', 'Коническая шестерня на 12 зубьев для передачи между перпендикулярными валами'],
  'bevel-gear-20': ['Коническая шестерня 20T', 'Коническая шестерня на 20 зубьев для передачи между перпендикулярными валами'],
})

function isRussian() {
  return document.documentElement.lang === 'ru' || localStorage.getItem('bricklab.ui.language.v1') === 'ru'
}

function applyParts4Language() {
  const ru = isRussian()
  for (const part of PARTS) {
    const translated = RU[part.id]
    if (!translated) continue
    part.__parts4EnglishName ??= part.name
    part.__parts4EnglishDescription ??= part.description
    part.name = ru ? translated[0] : part.__parts4EnglishName
    part.description = ru ? translated[1] : part.__parts4EnglishDescription
  }
  document.getElementById('partSearch')?.dispatchEvent(new Event('input', { bubbles: true }))
  window.dispatchEvent(new CustomEvent('bricklab:partcatalogchange', {
    detail: { pack: PARTS4_I18N_VERSION, translated: ru },
  }))
}

window.addEventListener('bricklab:languagechange', () => requestAnimationFrame(applyParts4Language))
applyParts4Language()
