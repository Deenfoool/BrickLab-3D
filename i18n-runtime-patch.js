import { PARTS } from './parts.js'

const PART_NAMES = {
  'brick-2x4': ['Brick 2×4', 'Кирпич 2×4'],
  'plate-2x4': ['Plate 2×4', 'Пластина 2×4'],
  'technic-brick-1x6': ['Technic Brick 1×6', 'Technic-кирпич 1×6'],
  'beam-5': ['Technic Beam 1×5', 'Technic-балка 1×5'],
  'beam-9': ['Technic Beam 1×9', 'Technic-балка 1×9'],
  'axle-3': ['Axle 3L', 'Ось 3L'],
  'axle-5': ['Axle 5L', 'Ось 5L'],
  'axle-7': ['Axle 7L', 'Ось 7L'],
  'axle-coupler': ['Axle Coupler', 'Муфта оси'],
  pin: ['Friction Pin', 'Фрикционный пин'],
  'gear-8': ['Gear 8T', 'Шестерня 8T'],
  'gear-16': ['Gear 16T', 'Шестерня 16T'],
  'gear-24': ['Gear 24T', 'Шестерня 24T'],
  wheel: ['Off-road Wheel', 'Внедорожное колесо'],
  motor: ['Lab Motor', 'Лабораторный мотор'],
  'gearbox-fnr': ['F/N/R Gearbox', 'Коробка F/N/R'],
  'open-differential': ['Open Differential', 'Открытый дифференциал'],
  'bearing-block': ['Bearing Block', 'Опорный подшипник'],
  'suspension-arm-5': ['Suspension Arm 5L', 'Рычаг подвески 5L'],
  'rpm-sensor': ['RPM Sensor', 'Датчик RPM'],
  'torque-sensor': ['Torque Sensor', 'Датчик момента'],
}

const EN_RU = {
  'TEST · PULL / TORQUE': 'ТЕСТ · ТЯГА / МОМЕНТ',
  'TEST · HILL CLIMB': 'ТЕСТ · ПОДЪЁМ',
  'TEST · OBSTACLE COURSE': 'ТЕСТ · ПРЕПЯТСТВИЯ',
  'HILL CLIMB': 'ПОДЪЁМ',
  'PULL / TORQUE': 'ТЯГА / МОМЕНТ',
  'OBSTACLE COURSE': 'ПОЛОСА ПРЕПЯТСТВИЙ',
  'BUILD MODE · Connector graph enabled': 'РЕЖИМ СБОРКИ · Граф коннекторов включён',
  'M move': 'M перемещение',
  'R rotate': 'R вращение',
  'F focus': 'F фокус',
  'Tab simulate': 'Tab симуляция',
  '? shortcuts': '? клавиши',
  'Move (M)': 'Перемещение (M)',
  'Rotate (R)': 'Вращение (R)',
  'Undo (Ctrl+Z)': 'Отменить (Ctrl+Z)',
  'Redo (Ctrl+Shift+Z / Ctrl+Y)': 'Повторить (Ctrl+Shift+Z / Ctrl+Y)',
  'Duplicate (Ctrl+D)': 'Дублировать (Ctrl+D)',
  'Delete (X / Delete)': 'Удалить (X / Delete)',
  'Connector snapping (Shift+S)': 'Привязка коннекторов (Shift+S)',
  'Grid snapping (Shift+G)': 'Привязка к сетке (Shift+G)',
  'Transform space (Q)': 'Система координат (Q)',
  'New project (Ctrl+N)': 'Новый проект (Ctrl+N)',
  'Save (Ctrl+S)': 'Сохранить (Ctrl+S)',
  'Export .bricklab (Ctrl+Shift+S)': 'Экспорт .bricklab (Ctrl+Shift+S)',
  'Keyboard shortcuts (?)': 'Горячие клавиши (?)',
  'Import .bricklab (Ctrl+O)': 'Импорт .bricklab (Ctrl+O)',
  'Focus scene — hide both panels': 'Фокус на сцене — скрыть обе панели',
  'TEST scenario: Hill Climb 22°. Click to switch.': 'Сценарий теста: Подъём 22°. Нажмите для переключения.',
  'TEST scenario: Pull / Torque Bench. Click to switch.': 'Сценарий теста: Тяговый стенд. Нажмите для переключения.',
  'TEST scenario: Obstacle Course. Click to switch.': 'Сценарий теста: Полоса препятствий. Нажмите для переключения.',
}

const RU_EN = Object.fromEntries(Object.entries(EN_RU).map(([en, ru]) => [ru, en]))

function language() {
  return window.__bricklabI18n?.getLanguage?.() || 'en'
}

function partTranslation(text, lang) {
  for (const [id, names] of Object.entries(PART_NAMES)) {
    const part = PARTS.find(item => item.id === id)
    const english = part?.__i18nEnglishName || names[0]
    if (lang === 'ru' && text === english) return names[1]
    if (lang === 'en' && text === names[1]) return english
  }
  return null
}

function translate(text) {
  if (!text) return text
  const lang = language()
  return partTranslation(text, lang) || (lang === 'ru' ? EN_RU[text] : RU_EN[text]) || text
}

function apply(root = document.body) {
  if (!root) return
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node
  while ((node = walker.nextNode())) {
    if (node.parentElement?.closest('script,style,textarea,code,pre,canvas')) continue
    const raw = node.nodeValue
    const core = raw.trim()
    if (!core) continue
    const next = translate(core)
    if (next === core) continue
    const leading = raw.match(/^\s*/)?.[0] || ''
    const trailing = raw.match(/\s*$/)?.[0] || ''
    node.nodeValue = `${leading}${next}${trailing}`
  }

  root.querySelectorAll?.('[title],[aria-label],[placeholder]').forEach(element => {
    for (const attr of ['title', 'aria-label', 'placeholder']) {
      if (!element.hasAttribute(attr)) continue
      const current = element.getAttribute(attr)
      const next = translate(current)
      if (next !== current) element.setAttribute(attr, next)
    }
  })
}

let queued = false
function queueApply() {
  if (queued) return
  queued = true
  requestAnimationFrame(() => {
    queued = false
    apply()
  })
}

window.addEventListener('bricklab:languagechange', queueApply)
new MutationObserver(queueApply).observe(document.body, {
  childList: true,
  subtree: true,
  characterData: true,
  attributes: true,
  attributeFilter: ['title', 'aria-label', 'placeholder'],
})
queueApply()
