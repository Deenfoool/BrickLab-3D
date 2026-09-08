import { PARTS } from './parts.js'

const TRANSLATIONS = {
  'brick-1x2': ['Кирпич 1×2', 'Компактный классический кирпич 1×2'],
  'brick-1x4': ['Кирпич 1×4', 'Длинный узкий кирпич 1×4'],
  'brick-1x6': ['Кирпич 1×6', 'Длинный узкий кирпич 1×6'],
  'brick-1x8': ['Кирпич 1×8', 'Длинный узкий кирпич 1×8'],
  'brick-2x2': ['Кирпич 2×2', 'Квадратный силовой кирпич 2×2'],
  'brick-2x6': ['Кирпич 2×6', 'Длинный силовой кирпич 2×6'],
  'brick-2x8': ['Кирпич 2×8', 'Длинный силовой кирпич 2×8 для шасси'],
  'brick-2x10': ['Кирпич 2×10', 'Очень длинный силовой кирпич 2×10'],
  'plate-1x2': ['Пластина 1×2', 'Компактная низкая пластина 1×2'],
  'plate-1x4': ['Пластина 1×4', 'Узкая низкая пластина 1×4'],
  'plate-1x6': ['Пластина 1×6', 'Длинная низкая пластина 1×6'],
  'plate-1x8': ['Пластина 1×8', 'Длинная низкая пластина 1×8'],
  'plate-2x2': ['Пластина 2×2', 'Квадратная низкая пластина 2×2'],
  'plate-2x6': ['Пластина 2×6', 'Длинная пластина 2×6 для шасси'],
  'plate-2x8': ['Пластина 2×8', 'Широкая пластина 2×8 для шасси'],
  'plate-2x10': ['Пластина 2×10', 'Очень длинная пластина 2×10 для шасси'],
  'technic-brick-1x2': ['Technic-кирпич 1×2', 'Компактный Technic-кирпич с боковым отверстием'],
  'technic-brick-1x4': ['Technic-кирпич 1×4', 'Studded Technic-кирпич с тремя боковыми отверстиями'],
  'technic-brick-1x8': ['Technic-кирпич 1×8', 'Длинный Technic-кирпич для рам и шасси'],
  'technic-brick-1x10': ['Technic-кирпич 1×10', 'Длинный Technic-кирпич 1×10 с боковыми отверстиями'],
  'technic-brick-1x12': ['Technic-кирпич 1×12', 'Очень длинный Technic-кирпич 1×12'],
  'beam-2': ['Technic-балка 1×2', 'Очень короткая балка с двумя отверстиями'],
  'beam-3': ['Technic-балка 1×3', 'Короткая балка с тремя отверстиями под пины и оси'],
  'beam-4': ['Technic-балка 1×4', 'Короткая балка с четырьмя отверстиями'],
  'beam-6': ['Technic-балка 1×6', 'Балка 6L с шестью отверстиями'],
  'beam-7': ['Technic-балка 1×7', 'Средняя балка с семью отверстиями под пины и оси'],
  'beam-8': ['Technic-балка 1×8', 'Балка 8L для рам и подвески'],
  'beam-10': ['Technic-балка 1×10', 'Длинная балка 10L'],
  'beam-11': ['Technic-балка 1×11', 'Длинная балка с одиннадцатью отверстиями под пины и оси'],
  'beam-13': ['Technic-балка 1×13', 'Длинная балка 13L для шасси'],
  'beam-15': ['Technic-балка 1×15', 'Очень длинная балка 15L для рам'],
  'thin-beam-3': ['Тонкая балка 3L', 'Тонкая Technic-балка длиной 3L'],
  'thin-beam-5': ['Тонкая балка 5L', 'Тонкая Technic-балка длиной 5L'],
  'thin-beam-7': ['Тонкая балка 7L', 'Тонкая Technic-балка длиной 7L'],
  'thin-beam-9': ['Тонкая балка 9L', 'Тонкая Technic-балка длиной 9L'],
  'beam-l-3x3': ['L-балка 3×3', 'Угловая Technic-балка для жёстких рам'],
  'beam-angle-4x2': ['Угловая балка 4×2', 'Асимметричная угловая Technic-балка'],
  'axle-2': ['Ось 2L', 'Очень короткая крестовая ось с двумя точками крепления'],
  'axle-4': ['Ось 4L', 'Крестовая ось длиной 4L'],
  'axle-6': ['Ось 6L', 'Крестовая ось длиной 6L'],
  'axle-8': ['Ось 8L', 'Крестовая ось длиной 8L'],
  'axle-9': ['Ось 9L', 'Удлинённая крестовая ось с девятью точками крепления'],
  'axle-10': ['Ось 10L', 'Длинная крестовая ось 10L'],
  'axle-12': ['Ось 12L', 'Очень длинная крестовая ось 12L'],
  bush: ['Втулка', 'Полноразмерный упор и проставка для оси'],
  'half-bush': ['Полувтулка', 'Компактный упор и проставка половинной ширины'],
  'pin-half': ['Короткий пин', 'Короткий Technic-пин с трением'],
  'pin-long': ['Длинный пин 3L', 'Длинный пин для соединения нескольких слоёв'],
  'axle-pin': ['Пин-ось', 'Комбинированный элемент: пин и крестовая ось'],
  'connector-perpendicular': ['Перпендикулярный коннектор', 'Проход оси с перпендикулярным отверстием под пин'],
  'connector-triple': ['Тройной коннектор', 'Жёсткий Technic-коннектор с тремя отверстиями'],
  'connector-angle': ['Угловой коннектор', 'Компактный коннектор 90° с двумя отверстиями'],
  'steering-base': ['Основание рулевого шарнира', 'Основание с вертикальным шарниром для поворотного кулака'],
  'steering-knuckle': ['Поворотный кулак', 'Рулевой поворотный кулак с вертикальным шарниром и горизонтальной опорой оси'],
  'gear-12': ['Шестерня 12T', 'Прямозубая шестерня на 12 зубьев'],
  'gear-20': ['Шестерня 20T', 'Прямозубая шестерня на 20 зубьев'],
  'gear-36': ['Шестерня 36T', 'Большая прямозубая шестерня на 36 зубьев'],
  'gear-40': ['Шестерня 40T', 'Очень большая прямозубая шестерня на 40 зубьев'],
  'wheel-small': ['Малое колесо', 'Компактное колесо для небольших механизмов'],
  'wheel-medium': ['Среднее внедорожное колесо', 'Среднее колесо с выраженным протектором'],
  'wheel-road': ['Дорожное колесо', 'Низкопрофильная дорожная шина с диском'],
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
  window.dispatchEvent(new CustomEvent('bricklab:partcatalogchange', { detail: { translated: true } }))
}

window.addEventListener('bricklab:languagechange', () => requestAnimationFrame(applyParts))
applyParts()
