import { elementNumber, lookupElement } from '../editor/element-index.js'
import {
  previewColumns,
  previewRows,
  previewPageSize,
} from '../editor/library-data.js?v=system-tiles'
import { node, control, setStrings } from './catalog.js'
import {
  mapInventory,
  inventoryUsage,
  normalizeQuery,
  inventoryKey,
} from './data.js'
export function mountSetPalette(
  root,
  set,
  { language, catalog, groups, signal, select, readParts, focus, inspect },
) {
  const t = setStrings(language),
    ru = language === 'ru'
  const items = mapInventory(
    [...set.inventory].sort((a, b) => Number(a.spare) - Number(b.spare)),
    catalog,
  )
  const tools = node('div', undefined, 'set-palette-tools'),
    search = node('input'),
    color = node('select'),
    group = node('select')
  search.type = 'search'
  search.placeholder = ru ? 'Название или артикул' : 'Name or part number'
  search.setAttribute('aria-label', search.placeholder)
  color.setAttribute('aria-label', ru ? 'Цвет детали' : 'Part color')
  group.setAttribute('aria-label', ru ? 'Категория детали' : 'Part category')
  color.append(new Option(ru ? 'Все цвета' : 'All colors', ''))
  for (const [id, name] of new Map(
    items.map((item) => [item.colorId, item.colorName]),
  ))
    color.append(new Option(name, id))
  group.append(new Option(ru ? 'Все категории' : 'All categories', ''))
  for (const id of new Set(
    items.map((item) => item.model?.group).filter(Boolean),
  ))
    group.append(
      new Option(
        groups.find((g) => g[0] === id)?.[language === 'ru' ? 1 : 2] ?? id,
        id,
      ),
    )
  const status = node('p'),
    grid = node('div', undefined, 'set-parts-grid'),
    more = control(
      ru ? 'Показать ещё' : 'Show more',
      () => {
        limit += 48
        render()
      },
      signal,
    )
  tools.append(search, color, group)
  root.append(tools, status, grid, more)
  let used = inventoryUsage(items, readParts()),
    limit = 48,
    enabled = true
  let scrollPosition = 0
  let exactPart, exactColor
  const byKey = new Map(items.map((item) => [inventoryKey(item), item]))
  const printed = new Set()
  let resolved
  function resolveSearch() {
    const id = elementNumber(search.value)
    resolved = undefined
    if (!id) return
    lookupElement(id).then(record => {
      if (signal.aborted || elementNumber(search.value) !== id) return
      resolved = record
      render()
    }).catch(() => {})
  }
  function render() {
    scrollPosition = root.scrollTop
    const terms = normalizeQuery(search.value).split(/\s+/).filter(Boolean)
    const element = elementNumber(search.value)
    const filtered = used.filter(item => {
      if (color.value && item.colorId !== color.value || group.value && item.model?.group !== group.value) return false
      if (exactPart) return item.partNum === exactPart && (!exactColor || item.colorId === exactColor)
      if (element && (item.elementId === element || item.image.endsWith('/' + element + '.jpg') ||
          (resolved?.partNum === item.partNum && resolved.colorId === item.colorId))) return true
      const text = normalizeQuery([item.name, item.partNum, item.elementId, item.design, ...item.ldraw,
        item.model?.ru, item.colorName].join(' '))
      return terms.every(term => text.includes(term))
    })
    if (!filtered.length && !color.value && !group.value && (resolved || exactPart || printed.has(element))) {
      const record = resolved ?? { elementId: element, partNum: exactPart || '', name: exactPart || `LEGO ${element}`,
        colorId: exactColor || '', colorName: '', color: '', ldraw: [], image: '' }
      const [reference] = mapInventory([record], catalog)
      if (!reference.color) reference.color = reference.model?.color ?? '#999999'
      filtered.push(reference)
    }
    grid.replaceChildren()
    const missing = items.filter((item) => !item.model).length
    status.textContent = `${filtered.length} · ${t.missing}: ${missing}`
    for (const item of filtered.slice(0, limit)) {
      const card = node('article', undefined, 'set-part')
      card.dataset.inventory = inventoryKey(item)
      const take = control('', () =>
        select({
          ...item.model,
          color: item.color,
          inventory: inventoryKey(item),
        }),
      )
      take.className = 'set-part-take'
      take.dataset.placeable = String(Boolean(item.model))
      take.disabled = !enabled || !item.model
      const image = node('img')
      if (item.image) image.src = item.image
      else image.hidden = true
      image.alt = item.name
      image.loading = 'lazy'
      const fallback = node('span', undefined, 'set-image-fallback')
      fallback.hidden = true
      if (Number.isInteger(item.model?.preview)) {
        const part = item.model,
          tile = part.preview % previewPageSize
        const url = new URL(
          `../../assets/ldraw/${part.previewAssetPath ?? part.assetPath}/previews/${Math.floor(part.preview / previewPageSize)}.webp`,
          import.meta.url,
        )
        fallback.style.backgroundImage = `url("${url.href}")`
        fallback.style.backgroundSize = `${previewColumns * 100}% ${previewRows * 100}%`
        fallback.style.backgroundPosition = `${((tile % previewColumns) * 100) / (previewColumns - 1)}% ${(Math.floor(tile / previewColumns) * 100) / (previewRows - 1)}%`
        image.addEventListener(
          'error',
          () => {
            image.hidden = true
            fallback.hidden = false
          },
          { once: true },
        )
      }
      const swatch = node('i', undefined, 'set-color')
      swatch.style.backgroundColor = item.color
      swatch.title = item.colorName
      const name = item.model?.[language] ?? item.name
      take.title = name
      take.append(
        image,
        fallback,
        node('span', name),
        node('small', [item.partNum, (item.elementId || element) && `LEGO ${item.elementId || element}`, item.colorName,
          item.spare && (ru ? 'Запасная' : 'Spare')].filter(Boolean).join(' · ')),
        swatch,
      )
      card.append(take)
      if (!item.model) card.append(node('small', t.unavailable))
      const count = control(
        `${item.used} / ${item.quantity}${item.excess ? ` (+${item.excess})` : ''}`,
        () => focus(item),
      )
      count.title = ru ? 'Найти установленные детали' : 'Find placed parts'
      count.disabled = item.used === 0
      const detail = control(ru ? 'Рассмотреть' : 'Inspect', () =>
        inspect(item),
      )
      if (item.quantity) card.append(count)
      if (item.partNum && (item.image || item.model)) card.append(detail)
      grid.append(card)
    }
    more.hidden = filtered.length <= limit
    root.scrollTop = scrollPosition
  }
  for (const input of [search, color, group])
    input.addEventListener(
      input === search ? 'input' : 'change',
      () => {
        if (input === search) { exactPart = exactColor = undefined; resolveSearch() }
        if (input === color) exactColor = undefined
        limit = 48
        render()
      },
      { signal },
    )
  const help = node('a', t.source)
  help.href = `https://rebrickable.com/sets/${set.number}/`
  help.target = '_blank'
  help.rel = 'noopener'
  root.append(help)
  render()
  return {
    find(partNum, colorId, elementId) {
      if (elementId) printed.add(elementId)
      exactPart = partNum
      exactColor = colorId
      search.value = elementId || partNum
      resolveSearch()
      group.value = ''
      color.value = byKey.has(`${partNum}/${colorId}`) ? colorId : ''
      limit = 48
      root.scrollTop = 0
      render()
      search.focus({ preventScroll: true })
    },
    describe(partNum, colorId) {
      const item = byKey.get(`${partNum}/${colorId}`)
      const name = item?.model?.[language] ?? item?.name ?? catalog[partNum]?.[language]
      return ru ? name?.split(' · ', 1)[0] : name
    },
    update(parts) {
      used = inventoryUsage(items, parts)
      render()
    },
    setEnabled(value) {
      if (enabled === value) return
      enabled = value
      for (const button of grid.querySelectorAll('.set-part-take'))
        button.disabled = !enabled || button.dataset.placeable !== 'true'
    },
  }
}
