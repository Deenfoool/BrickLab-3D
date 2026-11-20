import { setSearchParams } from './filters.js'
import { knownBooks, validateSet } from './data.js?v=set-filters'
const endpoint = 'https://rebrickable.com/api/v3/'
let apiKey = ''
export function connectRebrickable(key) {
  apiKey = key.trim()
}
export const hasRebrickable = () => Boolean(apiKey)
async function request(path, signal) {
  if (!apiKey) throw Error('api-key-required')
  const url = new URL(path, endpoint)
  if (
    url.origin !== new URL(endpoint).origin ||
    !url.pathname.startsWith('/api/v3/')
  )
    throw Error('invalid-page')
  const response = await fetch(url, {
    headers: { Authorization: `key ${apiKey}` },
    signal,
    credentials: 'omit',
  })
  if (!response.ok) throw Error(`api-${response.status}`)
  return response.json()
}
export async function loadSetPage(query, signal, next, filters) {
  const params = setSearchParams(query, filters)
  const data = await request(next ?? `lego/sets/?${params}`, signal)
  return {
    next: data.next ?? null,
    items: data.results.map((set) => ({
      number: set.set_num,
      name: set.name,
      year: set.year,
      numParts: set.num_parts,
      themeId: set.theme_id,
      image: set.set_img_url,
    })),
  }
}
export async function searchSets(query, signal) {
  const page = await loadSetPage(query, signal)
  return page.items
}
export async function importSet(number, signal) {
  const info = await request(`lego/sets/${encodeURIComponent(number)}/`, signal)
  const inventory = []
  let next = `lego/sets/${encodeURIComponent(number)}/parts/?page_size=1000&inc_part_details=1`
  while (next) {
    const page = await request(next, signal)
    for (const row of page.results)
      inventory.push({
        partNum: row.part.part_num,
        name: row.part.name,
        colorId: String(row.color.id),
        colorName: row.color.name,
        color: `#${row.color.rgb}`,
        quantity: row.quantity,
        spare: row.is_spare,
        image: row.part.part_img_url,
        ldraw: row.part.external_ids?.LDraw ?? [],
      })
    next = page.next
  }
  return validateSet({
    number: info.set_num,
    name: info.name,
    year: info.year,
    themeId: info.theme_id,
    image: info.set_img_url,
    inventory,
    books: knownBooks[info.set_num] ?? [],
  })
}
