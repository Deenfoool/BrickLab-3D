import { PARTS } from './parts.js'

const TRANSLATIONS = {
  'brick-1x2': ['Кирпич 1×2', 'Компактный классический кирпич 1×2'],
  'brick-1x4': ['Кирпич 1×4', 'Длинный узкий кирпич 1×4'],
  'brick-2x2': ['Кирпич 2×2', 'Квадратный силовой кирпич 2×2'],
  'brick-2x6': ['Кирпич 2×6', 'Длинный силовой кирпич 2×6'],
  'plate-1x2': ['Пластина 1×2', 'Компактная низкая пластина 1×2'],
  'plate-1x4': ['Пластина 1×4', 'Узкая низкая пластина 1×4'],
  'plate-2x2': ['Пластина 2×2', 'Квадратная низкая пластина 2×2'],
  'plate-2x6': ['Пластина 2×6', 'Длинная пластина 2×6 для шасси'],
  'technic-brick-1x4': ['Technic-кирпич 1×4', 'Studded Technic-кирпич с тремя боковыми отверстиями'],
  'beam-3': ['Technic-балка 1×3', 'Короткая балка с тремя отверстиями под пины и оси'],
  'beam-7': ['Technic-балка 1×7', 'Средняя балка с семью отверстиями под пины и оси'],
  'beam-11': ['Technic-балка 1×11', 'Длинная балка с одиннадцатью отверстиями под пины и оси'],
  'axle-2': ['Ось 2L', 'Очень короткая крестовая ось с двумя точками крепления'],
  'axle-9': ['Ось 9L', 'Удлинённая крестовая ось с девятью точками крепления'],
  bush: ['Втулка', 'Полноразмерный упор и проставка для оси'],
  'half-bush': ['Полувтулка', 'Компактный упор и проставка половинной ширины'],
}

function isRussian() {
  return document.documentElement.lang === 'ru' || localStorage.getItem('bricklab.ui.language.v1') === 'ru'
}

function applyParts() {
  const ru = isRussian()
  for (const part of PARTS) {
    const translated = TRANSLATIONS[part.id]
    if (!translated) continue
    part.__i18nEnglishName ??= part.name
    part.__i18nEnglishDescription ??= part.description
    part.name = ru ? translated[0] : part.__i18nEnglishName
    part.description = ru ? translated[1] : part.__i18nEnglishDescription
  }

  const selectedName = document.getElementById('selectedName')
  if (selectedName) {
    for (const part of PARTS) {
      const translated = TRANSLATIONS[part.id]
      if (!translated) continue
      const english = part.__i18nEnglishName ?? part.name
      if ([english, translated[0]].includes(selectedName.textContent)) {
        selectedName.textContent = ru ? translated[0] : english
        break
      }
    }
  }

  document.getElementById('partSearch')?.dispatchEvent(new Event('input', { bubbles: true }))
}

window.addEventListener('bricklab:languagechange', () => requestAnimationFrame(applyParts))
applyParts()
