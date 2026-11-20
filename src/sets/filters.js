export const firstYear = 1945
export const lastYear = new Date().getUTCFullYear() + 1
export const setOrderings = [
  '-year',
  'year',
  '-num_parts',
  'num_parts',
  'name',
  '-name',
  'set_num',
]
export function normalizeFilters(value = {}) {
  const minYear = Math.max(
    firstYear,
    Math.min(lastYear, Math.trunc(Number(value.minYear)) || firstYear),
  )
  const maxYear = Math.max(
    minYear,
    Math.min(lastYear, Math.trunc(Number(value.maxYear)) || lastYear),
  )
  const minParts = Math.max(0, Math.trunc(Number(value.minParts)) || 0)
  const maxParts =
    value.maxParts === null ||
    value.maxParts === undefined ||
    value.maxParts === ''
      ? null
      : Math.max(minParts, Math.trunc(Number(value.maxParts)) || 0)
  return {
    themeId: /^\d+$/.test(String(value.themeId)) ? String(value.themeId) : '',
    minYear,
    maxYear,
    minParts,
    maxParts,
    ordering: setOrderings.includes(value.ordering) ? value.ordering : '-year',
  }
}
export function setSearchParams(query, value) {
  const filters = normalizeFilters(value)
  const params = new URLSearchParams({
    search: query,
    page_size: '24',
    ordering:
      filters.ordering === 'set_num'
        ? 'set_num'
        : `${filters.ordering},set_num`,
    min_year: String(filters.minYear),
    max_year: String(filters.maxYear),
    min_parts: String(filters.minParts),
  })
  if (filters.themeId) params.set('theme_id', filters.themeId)
  if (filters.maxParts !== null)
    params.set('max_parts', String(filters.maxParts))
  return params
}
function partCount(item) {
  return (
    item.numParts ??
    item.inventory
      ?.filter((part) => !part.spare)
      .reduce((sum, part) => sum + part.quantity, 0) ??
    0
  )
}
export function filterSetItems(items, query, value) {
  const filters = normalizeFilters(value)
  const collator = new Intl.Collator(undefined, {
    numeric: true,
    sensitivity: 'base',
  })
  const field = filters.ordering.replace('-', '')
  const sign = filters.ordering.startsWith('-') ? -1 : 1
  return items
    .filter((item) => {
      const count = partCount(item)
      return (
        `${item.number} ${item.name}`
          .toLowerCase()
          .includes(query.toLowerCase()) &&
        (!filters.themeId || String(item.themeId) === filters.themeId) &&
        item.year >= filters.minYear &&
        item.year <= filters.maxYear &&
        count >= filters.minParts &&
        (filters.maxParts === null || count <= filters.maxParts)
      )
    })
    .sort((a, b) => {
      const valueOf = (item) =>
        field === 'set_num'
          ? item.number
          : field === 'num_parts'
            ? partCount(item)
            : item[field]
      return (
        sign * collator.compare(String(valueOf(a)), String(valueOf(b))) ||
        collator.compare(a.number, b.number)
      )
    })
}
