import {
  firstYear,
  lastYear,
  normalizeFilters,
  setOrderings,
} from './filters.js'
// Kept independent of the catalog so rendering filters cannot start a request.
export function mountSetFilters(form, themes, { language, signal, change }) {
  const ru = language === 'ru'
  const make = (tag, text, className) => {
    const node = document.createElement(tag)
    if (text !== undefined) node.textContent = text
    if (className) node.className = className
    return node
  }
  const panel = make('div', undefined, 'set-filters')
  const theme = make('select'),
    order = make('select')
  theme.name = 'theme'
  theme.setAttribute('aria-label', ru ? 'Тема' : 'Theme')
  theme.add(new Option(ru ? 'Все темы' : 'All themes', ''))
  const byId = new Map(themes.map((row) => [row[0], row]))
  function themeName(row) {
    const names = [],
      seen = new Set()
    while (row && !seen.has(row[0])) {
      seen.add(row[0])
      names.unshift(row[1])
      row = byId.get(row[2])
    }
    return names.join(' / ')
  }
  const entries = themes
    .map((row) => [String(row[0]), themeName(row)])
    .sort((a, b) => a[1].localeCompare(b[1]))
  for (const [id, name] of entries) theme.add(new Option(name, id))
  order.name = 'ordering'
  order.setAttribute('aria-label', ru ? 'Сортировка' : 'Sort order')
  const titles = ru
    ? [
        'Сначала новые',
        'Сначала старые',
        'Больше деталей',
        'Меньше деталей',
        'Название А–Я',
        'Название Я–А',
        'Номер набора',
      ]
    : [
        'Newest first',
        'Oldest first',
        'Most parts',
        'Fewest parts',
        'Name A–Z',
        'Name Z–A',
        'Set number',
      ]
  setOrderings.forEach((value, i) => order.add(new Option(titles[i], value)))
  const selects = make('div', undefined, 'set-filter-selects')
  selects.append(theme, order)
  form.append(selects)
  function range(name, caption, low, high, unlimited = false) {
    const field = make('fieldset', undefined, 'set-filter-range')
    field.append(make('legend', caption))
    const inputs = make('div', undefined, 'set-range-values')
    const min = make('input'),
      max = make('input'),
      start = make('input'),
      end = make('input')
    for (const [input, suffix, label] of [
      [min, 'Min', ru ? 'От' : 'From'],
      [max, 'Max', ru ? 'До' : 'To'],
    ]) {
      input.type = 'number'
      input.name = name + suffix
      input.min = String(low)
      input.step = '1'
      input.setAttribute('aria-label', `${caption} · ${label}`)
      const wrapper = make('label', label)
      wrapper.append(input)
      inputs.append(wrapper)
    }
    if (!unlimited) {
      min.max = String(high)
      max.max = String(high)
    }
    max.placeholder = ru ? 'Без ограничений' : 'Unlimited'
    const sliders = make('div', undefined, 'set-range-sliders')
    for (const [slider, label] of [
      [start, ru ? 'Нижняя граница' : 'Lower bound'],
      [end, ru ? 'Верхняя граница' : 'Upper bound'],
    ]) {
      slider.type = 'range'
      slider.min = String(low)
      slider.step = '1'
      slider.setAttribute('aria-label', `${caption} · ${label}`)
      sliders.append(slider)
    }
    function sync() {
      const ceiling = unlimited
        ? Math.max(high, Number(min.value), Number(max.value)) + 1
        : high
      start.max = end.max = String(ceiling)
      start.value = min.value
      end.value = max.value === '' ? String(ceiling) : max.value
      end.setAttribute(
        'aria-valuetext',
        max.value === '' ? max.placeholder : max.value,
      )
      sliders.style.setProperty(
        '--from',
        `${((Number(start.value) - low) / (ceiling - low)) * 100}%`,
      )
      sliders.style.setProperty(
        '--to',
        `${((Number(end.value) - low) / (ceiling - low)) * 100}%`,
      )
    }
    function commit(input) {
      let a = Math.max(low, Math.trunc(Number(min.value)) || low)
      let b =
        max.value === '' && unlimited
          ? null
          : Math.max(low, Math.trunc(Number(max.value)) || low)
      if (!unlimited) {
        a = Math.min(a, high)
        b = Math.min(b, high)
      }
      if (b !== null && a > b) {
        if (input === min) b = a
        else a = b
      }
      min.value = String(a)
      max.value = b === null ? '' : String(b)
      sync()
      change()
    }
    min.addEventListener('change', () => commit(min), { signal })
    max.addEventListener('change', () => commit(max), { signal })
    start.addEventListener(
      'input',
      () => {
        min.value = start.value
        commit(min)
      },
      { signal },
    )
    end.addEventListener(
      'input',
      () => {
        max.value = unlimited && end.value === end.max ? '' : end.value
        commit(max)
      },
      { signal },
    )
    field.append(inputs, sliders)
    panel.append(field)
    return { min, max, sync }
  }
  const years = range(
    'year',
    ru ? 'Годы выпуска' : 'Release years',
    firstYear,
    lastYear,
  )
  const pieces = range(
    'parts',
    ru ? 'Количество деталей' : 'Part count',
    0,
    5000,
    true,
  )
  const reset = make(
    'button',
    ru ? 'Сбросить фильтры' : 'Reset filters',
    'secondary set-filter-reset',
  )
  reset.type = 'button'
  reset.addEventListener(
    'click',
    () => {
      setDefaults()
      change()
    },
    { signal },
  )
  theme.addEventListener('change', change, { signal })
  order.addEventListener('change', change, { signal })
  panel.append(reset)
  const advanced = make('details', undefined, 'set-filter-disclosure')
  advanced.append(make('summary', ru ? 'Расширенные фильтры' : 'Advanced filters'), panel)
  form.append(advanced)
  function setDefaults() {
    theme.value = ''
    order.value = '-year'
    years.min.value = String(firstYear)
    years.max.value = String(lastYear)
    pieces.min.value = '0'
    pieces.max.value = ''
    years.sync()
    pieces.sync()
  }
  setDefaults()
  return {
    read: () =>
      normalizeFilters({
        themeId: theme.value,
        ordering: order.value,
        minYear: years.min.value,
        maxYear: years.max.value,
        minParts: pieces.min.value,
        maxParts: pieces.max.value,
      }),
  }
}
