import { PARTS } from './parts.js'

const LANGUAGE_KEY = 'bricklab.ui.language.v1'
const SUPPORTED = new Set(['en', 'ru'])

const PART_TRANSLATIONS = {
  'brick-2x4': ['Кирпич 2×4', 'Классический кирпич 2×4'],
  'plate-2x4': ['Пластина 2×4', 'Низкая пластина 2×4'],
  'technic-brick-1x6': ['Technic-кирпич 1×6', 'Кирпич шасси с пятью боковыми отверстиями под оси и пины'],
  'beam-5': ['Technic-балка 1×5', 'Пять отверстий под пины и оси'],
  'beam-9': ['Technic-балка 1×9', 'Девять отверстий под пины и оси'],
  'axle-3': ['Ось 3L', 'Короткая крестовая ось с 3 точками крепления'],
  'axle-5': ['Ось 5L', 'Средняя крестовая ось с 5 точками крепления'],
  'axle-7': ['Ось 7L', 'Длинная крестовая ось с 7 точками крепления'],
  'axle-coupler': ['Муфта оси', 'Жёсткая муфта для удлинения приводного вала'],
  pin: ['Фрикционный пин', 'Technic-пин для соединения деталей'],
  'gear-8': ['Шестерня 8T', 'Малая прямозубая шестерня'],
  'gear-16': ['Шестерня 16T', 'Средняя прямозубая шестерня'],
  'gear-24': ['Шестерня 24T', 'Большая прямозубая шестерня'],
  wheel: ['Внедорожное колесо', 'Большое колесо с протектором'],
  motor: ['Лабораторный мотор', 'Приводной мотор 120 RPM с ограниченным моментом'],
  'gearbox-fnr': ['Коробка F/N/R', 'Переключаемая передача: вперёд / нейтраль / назад'],
  'open-differential': ['Открытый дифференциал', 'Один вход и две полуоси с разделением момента'],
  'bearing-block': ['Опорный подшипник', 'Опора оси для шасси и испытательных стендов'],
  'suspension-arm-5': ['Рычаг подвески 5L', 'Подпружиненный рычаг со встроенным шарниром'],
  'rpm-sensor': ['Датчик RPM', 'Встроенный датчик фактических оборотов вала'],
  'torque-sensor': ['Датчик момента', 'Встроенный датчик доступного момента вала'],
}

const EN_RU = {
  'Mechanical construction sandbox': 'Механический конструктор',
  BUILD: 'СБОРКА',
  SIMULATE: 'СИМУЛЯЦИЯ',
  TEST: 'ТЕСТ',
  New: 'Новый',
  Save: 'Сохранить',
  Export: 'Экспорт',
  Import: 'Импорт',
  PARTS: 'ДЕТАЛИ',
  PROPERTIES: 'СВОЙСТВА',
  'Search parts': 'Поиск деталей',
  All: 'Все',
  Bricks: 'Кирпичи',
  Beams: 'Балки',
  Axles: 'Оси',
  Gears: 'Шестерни',
  Wheels: 'Колёса',
  Power: 'Привод',
  Move: 'Перемещение',
  Rotate: 'Вращение',
  Undo: 'Отменить',
  Redo: 'Повторить',
  Duplicate: 'Дублировать',
  Delete: 'Удалить',
  Connector: 'Коннектор',
  Grid: 'Сетка',
  World: 'Мир',
  Local: 'Локально',
  Pause: 'Пауза',
  Play: 'Старт',
  Reset: 'Сброс',
  'Physics idle': 'Физика не запущена',
  'No part selected': 'Деталь не выбрана',
  'Select a part in the scene to inspect and edit it.': 'Выберите деталь на сцене, чтобы посмотреть и изменить её свойства.',
  TRANSFORM: 'ПОЛОЖЕНИЕ',
  ROTATION: 'ВРАЩЕНИЕ',
  APPEARANCE: 'ВНЕШНИЙ ВИД',
  MECHANICS: 'МЕХАНИКА',
  Color: 'Цвет',
  'Connectors used': 'Коннекторы заняты',
  'Graph links': 'Связи графа',
  'Disconnect all': 'Разъединить всё',
  PROJECT: 'ПРОЕКТ',
  'Untitled Build': 'Новая сборка',
  'No matching parts': 'Подходящих деталей нет',
  'Keyboard shortcuts': 'Горячие клавиши',
  Tools: 'Инструменты',
  Edit: 'Редактирование',
  View: 'Вид',
  Mechanics: 'Механика',
  'Simulation & project': 'Симуляция и проект',
  'Focus selection': 'Фокус на выделении',
  'Frame whole build': 'Показать всю сборку',
  'Front / side / top': 'Спереди / сбоку / сверху',
  'Perspective / orthographic': 'Перспектива / ортографика',
  'Local / world axes': 'Локальные / мировые оси',
  'Connector snap': 'Привязка коннекторов',
  'Grid snap': 'Привязка к сетке',
  'Reset rotation': 'Сбросить вращение',
  'Reset position': 'Сбросить позицию',
  'Connector points': 'Точки коннекторов',
  'Connection graph': 'Граф связей',
  'Disconnect selected': 'Разъединить выбранное',
  'Mechanics properties': 'Параметры механики',
  'Play / pause': 'Старт / пауза',
  'Reset simulation': 'Сбросить симуляцию',
  'BUILD ↔ SIMULATE': 'СБОРКА ↔ СИМУЛЯЦИЯ',
  'Export .bricklab': 'Экспорт .bricklab',
  'Import .bricklab': 'Импорт .bricklab',
  'New project': 'Новый проект',
  'Clear selection': 'Снять выделение',
  'Select all': 'Выбрать всё',
  'Multi-select': 'Множественный выбор',
  'Group selected': 'Сгруппировать выбранное',
  Ungroup: 'Разгруппировать',
  'Rotate selected ±90°': 'Повернуть выбранное ±90°',
  'Quick move': 'Быстрое перемещение',
  'Shortcuts are disabled while typing in inputs. Press': 'Горячие клавиши отключаются при вводе текста. Нажмите',
  'any time to reopen this panel.': 'в любой момент, чтобы снова открыть эту панель.',
  'BUILD MODE': 'РЕЖИМ СБОРКИ',
  'Connector graph enabled': 'Граф коннекторов включён',
  'TEST LAB': 'ИСПЫТАНИЯ',
  DRIVETRAIN: 'ТРАНСМИССИЯ',
  'Live mechanics': 'Механика в реальном времени',
  'BODY SPEED': 'СКОРОСТЬ КОРПУСА',
  ACCEL: 'УСКОРЕНИЕ',
  motors: 'моторы',
  motor: 'мотор',
  shafts: 'валы',
  shaft: 'вал',
  meshes: 'зацепления',
  mesh: 'зацепление',
  'MOTORS · RPM · LOAD · TORQUE': 'МОТОРЫ · RPM · НАГРУЗКА · МОМЕНТ',
  'SHAFT · TARGET · ACTUAL · RATIO · TORQUE': 'ВАЛ · ЦЕЛЬ · ФАКТ · ПЕРЕДАЧА · МОМЕНТ',
  GEARS: 'ШЕСТЕРНИ',
  'WHEELS · GROUND SPEED · SLIP': 'КОЛЁСА · СКОРОСТЬ · ПРОБУКСОВКА',
  'Connect a Lab Motor to a shaft to measure load and stall.': 'Подключите мотор к валу, чтобы измерять нагрузку и остановку.',
  'No powered shaft.': 'Нет приводного вала.',
  'Place compatible gears at pitch distance to mesh them.': 'Разместите совместимые шестерни на правильном межосевом расстоянии.',
  'Add an Off-road Wheel to measure rolling speed and slip.': 'Добавьте внедорожное колесо для измерения скорости и пробуксовки.',
  'PLACEABLE SENSORS · VALUE · SHAFT': 'ДАТЧИКИ · ЗНАЧЕНИЕ · ВАЛ',
  'LIVE HISTORY · RPM / BODY SPEED': 'ИСТОРИЯ · RPM / СКОРОСТЬ КОРПУСА',
  SPEED: 'СКОРОСТЬ',
  TORQUE: 'МОМЕНТ',
  LOAD: 'НАГРУЗКА',
  RATIO: 'ПЕРЕДАЧА',
  ACTUAL: 'ФАКТ',
  TARGET: 'ЦЕЛЬ',
  RUNNING: 'ИДЁТ',
  STALLED: 'ОСТАНОВКА',
  PASSED: 'ПРОЙДЕНО',
  STALL: 'СТОП',
  TIME: 'ВРЕМЯ',
  'BEST TIME': 'ЛУЧШЕЕ ВРЕМЯ',
  'BEST LOAD': 'ЛУЧШАЯ НАГРУЗКА',
  Retry: 'Повторить',
  HILL: 'ГОРКА',
  PULL: 'ТЯГА',
  OBST: 'ПРЕПЯТСТВИЯ',
  'Hill Climb 22°': 'Подъём 22°',
  'Pull / Torque Bench': 'Тяговый стенд',
  'Obstacle Course': 'Полоса препятствий',
  'TEST · HILL CLIMB': 'ТЕСТ · ПОДЪЁМ',
  'TEST · TORQUE PULL': 'ТЕСТ · ТЯГА',
  'TEST · PULL / TORQUE': 'ТЕСТ · ТЯГА / МОМЕНТ',
  'TEST · OBSTACLE COURSE': 'ТЕСТ · ПРЕПЯТСТВИЯ',
  'HILL CLIMB': 'ПОДЪЁМ',
  'PULL / TORQUE': 'ТЯГА / МОМЕНТ',
  'OBSTACLE COURSE': 'ПОЛОСА ПРЕПЯТСТВИЙ',
  GEARBOX: 'КОРОБКА',
  DIFF: 'ДИФФ',
  OPEN: 'ОТКРЫТЫЙ',
  FORWARD: 'ВПЕРЁД',
  NEUTRAL: 'НЕЙТРАЛЬ',
  REVERSE: 'НАЗАД',
  'Focus scene': 'Фокус на сцене',
  'Restore floating panels': 'Вернуть плавающие панели',
  'Reset floating panel layout': 'Сбросить расположение панелей',
  'Show or hide Parts': 'Показать или скрыть каталог деталей',
  'Show or hide Properties': 'Показать или скрыть свойства',
  'Toggle Parts panel': 'Переключить панель деталей',
  'Toggle Properties panel': 'Переключить панель свойств',
  'Close floating panels': 'Закрыть плавающие панели',
  'Hide Parts': 'Скрыть каталог деталей',
  'Hide Properties': 'Скрыть свойства',
  'Switch Parts catalog to list view': 'Переключить каталог деталей в список',
  'Switch Parts catalog to grid view': 'Переключить каталог деталей в сетку',
  'F/N/R gearbox mode. Applies to F/N/R Gearbox parts.': 'Режим коробки F/N/R. Применяется к деталям коробки F/N/R.',
  'Powertrain bench': 'Стенд трансмиссии',
  'Load F/N/R Powertrain Bench': 'Загрузить стенд коробки F/N/R',
  'Restore build from before powertrain bench': 'Вернуть сборку до загрузки стенда',
  'Load Starter Hill Climber demo': 'Загрузить демо машины для подъёма',
  'Restore build from before demo': 'Вернуть сборку до демо',
  Demo: 'Демо',
  Restore: 'Вернуть',
  CSV: 'CSV',
}

const RU_EN = Object.fromEntries(Object.entries(EN_RU).map(([en, ru]) => [ru, en]))

function detectLanguage() {
  const stored = localStorage.getItem(LANGUAGE_KEY)
  if (SUPPORTED.has(stored)) return stored
  return String(navigator.language || '').toLowerCase().startsWith('ru') ? 'ru' : 'en'
}

let language = detectLanguage()
let scheduled = false
let observer = null

function preserveWhitespace(source, translated) {
  const leading = source.match(/^\s*/)?.[0] ?? ''
  const trailing = source.match(/\s*$/)?.[0] ?? ''
  return `${leading}${translated}${trailing}`
}

function coreText(value) {
  return value.trim()
}

function dynamicToRu(text) {
  let match
  if ((match = text.match(/^BUILD MODE · (\d+) parts · (\d+) connections$/))) return `РЕЖИМ СБОРКИ · ${match[1]} деталей · ${match[2]} связей`
  if ((match = text.match(/^(\d+) parts · (\d+) links(?: · (\d+) selected)?$/))) return `${match[1]} деталей · ${match[2]} связей${match[3] ? ` · выбрано ${match[3]}` : ''}`
  if ((match = text.match(/^(\d+) parts selected$/))) return `Выбрано деталей: ${match[1]}`
  if ((match = text.match(/^Disconnected (\d+) links?$/))) return `Разъединено связей: ${match[1]}`
  if ((match = text.match(/^(\d+) parts? removed$/))) return `Удалено деталей: ${match[1]}`
  if ((match = text.match(/^(\d+) parts? duplicated$/))) return `Дублировано деталей: ${match[1]}`
  if ((match = text.match(/^(\d+) parts grouped$/))) return `Сгруппировано деталей: ${match[1]}`
  if ((match = text.match(/^(\d+) parts ungrouped$/))) return `Разгруппировано деталей: ${match[1]}`
  if ((match = text.match(/^Connected ([^:]+): (.+) → (.+)$/))) return `Соединено ${match[1]}: ${match[2]} → ${match[3]}`
  if ((match = text.match(/^Connector snap (on|off)$/))) return `Привязка коннекторов ${match[1] === 'on' ? 'включена' : 'выключена'}`
  if ((match = text.match(/^Grid snap (on|off)$/))) return `Привязка к сетке ${match[1] === 'on' ? 'включена' : 'выключена'}`
  if ((match = text.match(/^Connector points (shown|hidden)$/))) return `Точки коннекторов ${match[1] === 'shown' ? 'показаны' : 'скрыты'}`
  if ((match = text.match(/^Connection graph (shown|hidden)$/))) return `Граф связей ${match[1] === 'shown' ? 'показан' : 'скрыт'}`
  if ((match = text.match(/^(World|Local) transform axes$/))) return `${match[1] === 'World' ? 'Мировые' : 'Локальные'} оси трансформации`
  if ((match = text.match(/^Rotated ([+−-]90°) around ([XYZ])$/))) return `Поворот ${match[1]} вокруг ${match[2]}`
  if ((match = text.match(/^(\d+) drivetrain conflicts? detected$/))) return `Конфликтов трансмиссии: ${match[1]}`
  if ((match = text.match(/^Actual ([-+\d.]+) RPM · target ([-+\d.]+) RPM$/))) return `Факт ${match[1]} RPM · цель ${match[2]} RPM`
  if ((match = text.match(/^([-+\d.]+) A estimated · ([-+\d.]+) stall torque$/))) return `Оценка ${match[1]} A · момент остановки ${match[2]}`
  if ((match = text.match(/^TEST scenario: (.+)\. Click to switch\.$/))) return `Сценарий теста: ${translateCore(match[1], 'ru')}. Нажмите для переключения.`
  if ((match = text.match(/^Hide (Parts|Properties)$/))) return match[1] === 'Parts' ? 'Скрыть каталог деталей' : 'Скрыть свойства'
  if ((match = text.match(/^Scale is reserved.*$/))) return 'Масштабирование пока отключено — размеры деталей должны оставаться механически точными'
  if ((match = text.match(/^Select at least two parts to group$/))) return 'Выберите минимум две детали для группировки'
  if ((match = text.match(/^Selected parts are not grouped$/))) return 'Выбранные детали не сгруппированы'
  if (text === 'Rotation reset') return 'Вращение сброшено'
  if (text === 'Position reset') return 'Позиция сброшена'
  return null
}

function dynamicToEn(text) {
  let match
  if ((match = text.match(/^РЕЖИМ СБОРКИ · (\d+) деталей · (\d+) связей$/))) return `BUILD MODE · ${match[1]} parts · ${match[2]} connections`
  if ((match = text.match(/^(\d+) деталей · (\d+) связей(?: · выбрано (\d+))?$/))) return `${match[1]} parts · ${match[2]} links${match[3] ? ` · ${match[3]} selected` : ''}`
  if ((match = text.match(/^Выбрано деталей: (\d+)$/))) return `${match[1]} parts selected`
  if ((match = text.match(/^Разъединено связей: (\d+)$/))) return `Disconnected ${match[1]} links`
  if ((match = text.match(/^Удалено деталей: (\d+)$/))) return `${match[1]} parts removed`
  if ((match = text.match(/^Дублировано деталей: (\d+)$/))) return `${match[1]} parts duplicated`
  if ((match = text.match(/^Сгруппировано деталей: (\d+)$/))) return `${match[1]} parts grouped`
  if ((match = text.match(/^Разгруппировано деталей: (\d+)$/))) return `${match[1]} parts ungrouped`
  if ((match = text.match(/^Соединено ([^:]+): (.+) → (.+)$/))) return `Connected ${match[1]}: ${match[2]} → ${match[3]}`
  if ((match = text.match(/^Привязка коннекторов (включена|выключена)$/))) return `Connector snap ${match[1] === 'включена' ? 'on' : 'off'}`
  if ((match = text.match(/^Привязка к сетке (включена|выключена)$/))) return `Grid snap ${match[1] === 'включена' ? 'on' : 'off'}`
  if ((match = text.match(/^Точки коннекторов (показаны|скрыты)$/))) return `Connector points ${match[1] === 'показаны' ? 'shown' : 'hidden'}`
  if ((match = text.match(/^Граф связей (показан|скрыт)$/))) return `Connection graph ${match[1] === 'показан' ? 'shown' : 'hidden'}`
  if ((match = text.match(/^(Мировые|Локальные) оси трансформации$/))) return `${match[1] === 'Мировые' ? 'World' : 'Local'} transform axes`
  if ((match = text.match(/^Поворот ([+−-]90°) вокруг ([XYZ])$/))) return `Rotated ${match[1]} around ${match[2]}`
  if ((match = text.match(/^Конфликтов трансмиссии: (\d+)$/))) return `${match[1]} drivetrain conflicts detected`
  if ((match = text.match(/^Факт ([-+\d.]+) RPM · цель ([-+\d.]+) RPM$/))) return `Actual ${match[1]} RPM · target ${match[2]} RPM`
  if ((match = text.match(/^Оценка ([-+\d.]+) A · момент остановки ([-+\d.]+)$/))) return `${match[1]} A estimated · ${match[2]} stall torque`
  if ((match = text.match(/^Сценарий теста: (.+)\. Нажмите для переключения\.$/))) return `TEST scenario: ${translateCore(match[1], 'en')}. Click to switch.`
  if (text === 'Вращение сброшено') return 'Rotation reset'
  if (text === 'Позиция сброшена') return 'Position reset'
  if (text === 'Выберите минимум две детали для группировки') return 'Select at least two parts to group'
  if (text === 'Выбранные детали не сгруппированы') return 'Selected parts are not grouped'
  return null
}

function translatePartText(text, target) {
  for (const part of PARTS) {
    const translated = PART_TRANSLATIONS[part.id]
    if (!translated) continue
    const englishName = part.__i18nEnglishName ?? part.name
    const englishDescription = part.__i18nEnglishDescription ?? part.description
    if (target === 'ru') {
      if (text === englishName) return translated[0]
      if (text === englishDescription) return translated[1]
    } else {
      if (text === translated[0]) return englishName
      if (text === translated[1]) return englishDescription
    }
  }
  return null
}

function translateCore(text, target = language) {
  if (!text) return text
  const partText = translatePartText(text, target)
  if (partText) return partText
  if (target === 'ru') return EN_RU[text] ?? dynamicToRu(text) ?? text
  return RU_EN[text] ?? dynamicToEn(text) ?? text
}

function translateTextValue(value) {
  const core = coreText(value)
  if (!core) return value
  const translated = translateCore(core)
  return translated === core ? value : preserveWhitespace(value, translated)
}

function translateNode(node) {
  if (!node?.nodeValue) return
  const parent = node.parentElement
  if (!parent || parent.closest('script,style,textarea,code,pre,canvas')) return
  const next = translateTextValue(node.nodeValue)
  if (next !== node.nodeValue) node.nodeValue = next
}

function translateAttributes(root = document) {
  root.querySelectorAll?.('[title],[aria-label],[placeholder]').forEach(element => {
    for (const attr of ['title', 'aria-label', 'placeholder']) {
      if (!element.hasAttribute(attr)) continue
      const current = element.getAttribute(attr)
      const next = translateCore(current)
      if (next !== current) element.setAttribute(attr, next)
    }
  })
}

function translateTree(root = document.body) {
  if (!root) return
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node
  while ((node = walker.nextNode())) translateNode(node)
  translateAttributes(root)
}

function localizeParts() {
  for (const part of PARTS) {
    part.__i18nEnglishName ??= part.name
    part.__i18nEnglishDescription ??= part.description
    const ru = PART_TRANSLATIONS[part.id]
    if (language === 'ru' && ru) {
      part.name = ru[0]
      part.description = ru[1]
    } else {
      part.name = part.__i18nEnglishName
      part.description = part.__i18nEnglishDescription
    }
  }
}

function rerenderCatalog() {
  const search = document.getElementById('partSearch')
  if (search) search.dispatchEvent(new Event('input', { bubbles: true }))
}

function updateMeta() {
  document.documentElement.lang = language
  const description = document.querySelector('meta[name="description"]')
  if (description) description.content = language === 'ru'
    ? 'BrickLab 3D — браузерный механический конструктор с физикой и испытаниями.'
    : 'BrickLab 3D — browser-based mechanical brick construction sandbox.'
}

function updateSwitcher() {
  const switcher = document.getElementById('languageSwitcher')
  if (!switcher) return
  switcher.querySelectorAll('[data-language]').forEach(button => {
    const active = button.dataset.language === language
    button.classList.toggle('active', active)
    const pressed = String(active)
    if (button.getAttribute('aria-pressed') !== pressed) button.setAttribute('aria-pressed', pressed)
  })
  const label = language === 'ru' ? 'Язык интерфейса' : 'Interface language'
  if (switcher.title !== label) switcher.title = label
  if (switcher.getAttribute('aria-label') !== label) switcher.setAttribute('aria-label', label)
}

function scheduleTranslate() {
  if (scheduled) return
  scheduled = true
  requestAnimationFrame(() => {
    scheduled = false
    translateTree(document.body)
    updateSwitcher()
  })
}

function installSwitcher() {
  const actions = document.querySelector('.top-actions')
  if (!actions) {
    requestAnimationFrame(installSwitcher)
    return
  }
  if (document.getElementById('languageSwitcher')) return
  const switcher = document.createElement('div')
  switcher.id = 'languageSwitcher'
  switcher.className = 'language-switcher'
  switcher.setAttribute('role', 'group')
  switcher.innerHTML = `
    <button type="button" data-language="ru" aria-pressed="false">RU</button>
    <button type="button" data-language="en" aria-pressed="false">EN</button>
  `
  const panelControls = document.getElementById('overlayPanelToggles')
  actions.insertBefore(switcher, panelControls || actions.firstChild)
  switcher.querySelectorAll('[data-language]').forEach(button => {
    button.onclick = () => setLanguage(button.dataset.language)
  })
  updateSwitcher()
}

export function setLanguage(next) {
  if (!SUPPORTED.has(next) || next === language) return
  language = next
  localStorage.setItem(LANGUAGE_KEY, language)
  localizeParts()
  updateMeta()
  rerenderCatalog()
  scheduleTranslate()
  window.dispatchEvent(new CustomEvent('bricklab:languagechange', { detail: { language } }))
}

export function getLanguage() {
  return language
}

export function t(text) {
  return translateCore(text)
}

window.__bricklabI18n = { setLanguage, getLanguage, t }

localizeParts()
updateMeta()
installSwitcher()
scheduleTranslate()

observer = new MutationObserver(mutations => {
  if (!mutations.length) return
  scheduleTranslate()
})
observer.observe(document.body, {
  childList: true,
  subtree: true,
  characterData: true,
  attributes: true,
  attributeFilter: ['title', 'aria-label', 'placeholder'],
})
