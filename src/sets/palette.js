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
    set.inventory.filter((item) => !item.spare),
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
  let exactPart
  const byKey = new Map(items.map((item) => [inventoryKey(item), item]))
  function render() {
    scrollPosition = root.scrollTop
    const terms = normalizeQuery(search.value).split(/\s+/).filter(Boolean)
    const filtered = used.filter(
      (item) =>
        (!color.value || item.colorId === color.value) &&
        (!group.value || item.model?.group === group.value) &&
        (exactPart ? item.partNum === exactPart : terms.every((term) =>
          normalizeQuery(
            `${item.name} ${item.partNum} ${item.design ?? ''} ${item.model?.ru ?? ''} ${item.colorName}`,
          ).includes(term),
        )),
    )
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
      take.disabled = !enabled || !item.model
      const image = node('img')
      image.src = item.image
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
        node('small', `${item.partNum} · ${item.colorName}`),
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
      card.append(count, detail)
      grid.append(card)
    }
    more.hidden = filtered.length <= limit
    root.scrollTop = scrollPosition
  }
  for (const input of [search, color, group])
    input.addEventListener(
      input === search ? 'input' : 'change',
      () => {
        if (input === search) exactPart = undefined
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
    find(partNum, colorId) {
      exactPart = search.value = partNum
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
        button.disabled =
          !enabled ||
          !byKey.get(button.closest('article').dataset.inventory)?.model
    },
  }
}
