import { PARTS } from '../parts.js'

export const PARTS3_I18N_VERSION = 'parts-3-i18n-v1'

// axle-2 / axle-9 / bush / half-bush already live in i18n-basic-parts-v1.
// Keep this table limited to genuinely new PARTS-3 ids so the base translator
// remains the single owner of legacy English/Russian names.
const RU = Object.freeze({
  'steering-tie-rod-5': ['Рулевая тяга 5L', 'Жёсткая рулевая тяга 5L с вертикальными шарнирными проушинами'],
  'wheel-hub': ['Ступица колеса', 'Свободно вращающаяся ступица с подшипником и крестовой осью под колесо'],
  'wheel-narrow': ['Узкое колесо', 'Узкая дорожная шина с низким сопротивлением качению'],
  'wheel-offroad-large': ['Большое внедорожное колесо', 'Крупная внедорожная шина с глубоким чередующимся протектором'],
  'wheel-tractor': ['Тракторное колесо', 'Очень крупная сельскохозяйственная шина с агрессивными грунтозацепами'],
})

function isRussian() {
  return document.documentElement.lang === 'ru' || localStorage.getItem('bricklab.ui.language.v1') === 'ru'
}

function applyParts3Language() {
  const ru = isRussian()
  for (const part of PARTS) {
    const translated = RU[part.id]
    if (!translated) continue
    part.__parts3EnglishName ??= part.name
    part.__parts3EnglishDescription ??= part.description
    part.name = ru ? translated[0] : part.__parts3EnglishName
    part.description = ru ? translated[1] : part.__parts3EnglishDescription
  }
  document.getElementById('partSearch')?.dispatchEvent(new Event('input', { bubbles: true }))
  window.dispatchEvent(new CustomEvent('bricklab:partcatalogchange', { detail: { pack: PARTS3_I18N_VERSION, translated: ru } }))
}

window.addEventListener('bricklab:languagechange', () => requestAnimationFrame(applyParts3Language))
applyParts3Language()
