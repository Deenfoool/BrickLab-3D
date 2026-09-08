import { PARTS } from './parts.js'

const CATALOG_VIEW_KEY = 'bricklab.ui.catalog-view.v2'
const FAVORITES_KEY = 'bricklab.catalog.favorites.v1'
const RECENTS_KEY = 'bricklab.catalog.recents.v1'
const VALID_VIEWS = new Set(['list', 'grid'])
const CATEGORY_ICONS = {
  Bricks: 'boxes',
  Beams: 'minus',
  Axles: 'move-horizontal',
  Connectors: 'workflow',
  Gears: 'settings',
  Wheels: 'circle-dot',
  Power: 'zap',
}
const CATEGORY_RU = {
  All: 'Все',
  Bricks: 'Кирпичи',
  Beams: 'Балки',
  Axles: 'Оси',
  Connectors: 'Коннекторы',
  Gears: 'Шестерни',
  Wheels: 'Колёса',
  Power: 'Привод',
}

function readJson(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null')
    return value ?? fallback
  } catch { return fallback }
}

function readView() {
  const saved = localStorage.getItem(CATALOG_VIEW_KEY)
  return VALID_VIEWS.has(saved) ? saved : 'grid'
}

function isRussian() {
  return document.documentElement.lang === 'ru' || localStorage.getItem('bricklab.ui.language.v1') === 'ru'
}

function categoryLabel(category) {
  return isRussian() ? (CATEGORY_RU[category] ?? category) : category
}

let view = readView()
let filter = 'All'
let query = ''
let favorites = new Set(readJson(FAVORITES_KEY, []))
let recents = readJson(RECENTS_KEY, []).filter(id => PARTS.some(part => part.id === id)).slice(0, 16)
let observer = null
let filtering = false

function persistFavorites() {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites]))
}

function persistRecents() {
  localStorage.setItem(RECENTS_KEY, JSON.stringify(recents))
}

function searchText(part) {
  return [part.id, part.name, part.description, part.category, ...(part.tags ?? [])].filter(Boolean).join(' ').toLocaleLowerCase()
}

function matchesFilter(part) {
  if (!part) return false
  if (filter === 'Favorites' && !favorites.has(part.id)) return false
  if (filter === 'Recent' && !recents.includes(part.id)) return false
  if (!['All', 'Favorites', 'Recent'].includes(filter) && part.category !== filter) return false
  return !query || searchText(part).includes(query)
}

function categoryCounts() {
  const counts = new Map()
  for (const part of PARTS) counts.set(part.category, (counts.get(part.category) ?? 0) + 1)
  return counts
}

function renderLucide() {
  window.lucide?.createIcons?.({ attrs: { 'stroke-width': 1.8, 'aria-hidden': 'true' } })
}

function decorateCard(card) {
  if (card.dataset.catalogV2 === 'true') return
  const part = PARTS.find(item => item.id === card.dataset.part)
  if (!part) return
  card.dataset.catalogV2 = 'true'
  card.dataset.category = part.category
  card.title = `${part.name}\n${part.description}`

  const fav = document.createElement('span')
  fav.className = 'catalog-favorite'
  fav.dataset.favoritePart = part.id
  fav.setAttribute('role', 'button')
  fav.setAttribute('tabindex', '0')
  fav.setAttribute('aria-label', `Favorite ${part.name}`)
  fav.innerHTML = '<i data-lucide="star"></i>'
  fav.classList.toggle('active', favorites.has(part.id))
  fav.addEventListener('pointerdown', event => event.stopPropagation())
  fav.addEventListener('click', event => {
    event.preventDefault()
    event.stopPropagation()
    if (favorites.has(part.id)) favorites.delete(part.id)
    else favorites.add(part.id)
    persistFavorites()
    refreshFilterBar()
    filterCards()
  })
  fav.addEventListener('keydown', event => {
    if (!['Enter', ' '].includes(event.key)) return
    event.preventDefault()
    fav.click()
  })
  card.append(fav)

  const meta = document.createElement('span')
  meta.className = 'catalog-card-meta'
  meta.textContent = categoryLabel(part.category)
  card.append(meta)
}

function decorateCards() {
  const list = document.getElementById('partsList')
  if (!list) return
  list.querySelectorAll('.part-card[data-part]').forEach(decorateCard)
  renderLucide()
}

function filterCards() {
  if (filtering) return
  filtering = true
  try {
    const list = document.getElementById('partsList')
    if (!list) return
    decorateCards()
    let visible = 0
    const recentOrder = new Map(recents.map((id, index) => [id, index]))
    list.querySelectorAll('.part-card[data-part]').forEach((card, index) => {
      const part = PARTS.find(item => item.id === card.dataset.part)
      const show = matchesFilter(part)
      card.hidden = !show
      card.style.order = filter === 'Recent' ? String(recentOrder.get(part?.id) ?? 1000) : String(index)
      card.querySelector('.catalog-favorite')?.classList.toggle('active', favorites.has(part?.id))
      if (show) visible += 1
    })

    let empty = document.getElementById('catalogV2Empty')
    if (!empty) {
      empty = document.createElement('div')
      empty.id = 'catalogV2Empty'
      empty.className = 'catalog-v2-empty'
      list.append(empty)
    }
    empty.hidden = visible > 0
    empty.textContent = isRussian()
      ? (filter === 'Favorites' ? 'Здесь появятся избранные детали ★' : 'Ничего не найдено')
      : (filter === 'Favorites' ? 'Favorite parts will appear here ★' : 'No matching parts')

    const count = document.getElementById('partCount')
    if (count) count.textContent = `${visible}/${PARTS.length}`
    const summary = document.querySelector('[data-catalog-summary]')
    if (summary) summary.textContent = isRussian() ? `${visible} из ${PARTS.length} деталей` : `${visible} of ${PARTS.length} parts`
  } finally {
    filtering = false
  }
}

function refreshFilterBar() {
  const bar = document.querySelector('[data-catalog-filters]')
  if (!bar) return
  const counts = categoryCounts()
  const categories = [...new Set(PARTS.map(part => part.category))]
  const special = [
    ['All', 'layout-grid', PARTS.length],
    ['Favorites', 'star', favorites.size],
    ['Recent', 'history', recents.length],
  ]
  const normal = categories.map(category => [category, CATEGORY_ICONS[category] ?? 'box', counts.get(category) ?? 0])

  bar.innerHTML = [...special, ...normal].map(([id, icon, count]) => {
    const label = id === 'Favorites'
      ? (isRussian() ? 'Избранное' : 'Favorites')
      : id === 'Recent'
        ? (isRussian() ? 'Недавние' : 'Recent')
        : categoryLabel(id)
    return `<button type="button" class="catalog-filter ${filter === id ? 'active' : ''}" data-catalog-filter="${id}"><i data-lucide="${icon}"></i><span>${label}</span><b>${count}</b></button>`
  }).join('')

  bar.querySelectorAll('[data-catalog-filter]').forEach(button => {
    button.onclick = () => {
      filter = button.dataset.catalogFilter || 'All'
      refreshFilterBar()
      filterCards()
    }
  })
  renderLucide()
}

function applyView(panel, button) {
  panel.classList.toggle('catalog-grid', view === 'grid')
  panel.classList.toggle('catalog-list', view === 'list')
  button.classList.toggle('active', view === 'grid')
  button.title = view === 'grid'
    ? (isRussian() ? 'Переключить на список' : 'Switch to list view')
    : (isRussian() ? 'Переключить на сетку' : 'Switch to grid view')
  button.setAttribute('aria-label', button.title)
  button.innerHTML = `<i data-lucide="${view === 'grid' ? 'list' : 'layout-grid'}"></i>`
  renderLucide()
}

function installStyles() {
  if (document.getElementById('bricklabCatalogBrowserV2Styles')) return
  const style = document.createElement('style')
  style.id = 'bricklabCatalogBrowserV2Styles'
  style.textContent = `
    .parts-panel>.search,.parts-panel>#categoryTabs{display:none!important}
    .catalog-browser-v2{display:flex;flex-direction:column;gap:8px;padding:0 10px 9px;border-bottom:1px solid rgba(255,255,255,.07)}
    .catalog-search-v2{height:34px;display:flex;align-items:center;gap:7px;padding:0 8px 0 10px;border:1px solid rgba(255,255,255,.11);border-radius:8px;background:rgba(11,14,16,.72);transition:border-color .15s,box-shadow .15s}
    .catalog-search-v2:focus-within{border-color:#4c765d;box-shadow:0 0 0 2px rgba(116,230,166,.08)}
    .catalog-search-v2>i{width:14px;height:14px;opacity:.5;flex:none}.catalog-search-v2 input{min-width:0;flex:1;border:0;outline:0;background:transparent;color:#e8ecea;font:500 11px/1.2 inherit}
    .catalog-search-v2 input::placeholder{color:#69737b}.catalog-search-v2 kbd{font-size:8px;opacity:.45}.catalog-search-v2 button{width:24px;height:24px;border:0;border-radius:5px;background:transparent;color:#89939a;display:grid;place-items:center;cursor:pointer}.catalog-search-v2 button:hover{background:#262c30;color:#fff}.catalog-search-v2 button i{width:13px;height:13px}
    .catalog-filter-strip{display:flex;gap:5px;overflow-x:auto;padding:1px 0 4px;scrollbar-width:thin;overscroll-behavior-x:contain}.catalog-filter-strip::-webkit-scrollbar{height:4px}
    .catalog-filter{height:28px;flex:none;display:flex;align-items:center;gap:5px;padding:0 7px;border:1px solid rgba(255,255,255,.09);border-radius:7px;background:#181d21;color:#98a2a9;font:650 9px/1 inherit;cursor:pointer;white-space:nowrap}.catalog-filter i{width:12px;height:12px}.catalog-filter b{min-width:14px;padding:1px 4px;border-radius:9px;background:rgba(255,255,255,.06);font-size:8px;text-align:center;color:#78838a}.catalog-filter:hover{color:#dbe3df;border-color:#3e4b44}.catalog-filter.active{background:#183023;border-color:#417459;color:#82ebb0}.catalog-filter.active b{background:rgba(116,230,166,.12);color:#92efbb}
    .catalog-meta-row{display:flex;align-items:center;justify-content:space-between;min-height:16px;color:#677179;font-size:8px;letter-spacing:.03em}.catalog-meta-row strong{font-weight:650;color:#89949b}.catalog-meta-row span:last-child{opacity:.75}
    .catalog-favorite{position:absolute;z-index:5;top:5px;right:5px;width:23px;height:23px;display:grid;place-items:center;border-radius:6px;background:rgba(13,16,18,.68);border:1px solid rgba(255,255,255,.08);color:#6f777d;opacity:0;transition:opacity .12s,color .12s,background .12s;cursor:pointer}.catalog-favorite i{width:13px;height:13px;fill:transparent}.part-card:hover .catalog-favorite,.catalog-favorite.active,.catalog-favorite:focus{opacity:1}.catalog-favorite.active{color:#f4cf67;background:rgba(60,49,20,.82);border-color:rgba(244,207,103,.28)}.catalog-favorite.active i{fill:currentColor}
    .catalog-card-meta{position:absolute;left:7px;bottom:5px;max-width:calc(100% - 14px);font-size:7px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#667078;pointer-events:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .parts-panel .part-card{position:relative}.parts-panel.catalog-grid .parts-list{display:grid!important;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));align-content:start;gap:7px;padding:9px!important}.parts-panel.catalog-grid .part-card{display:flex!important;min-width:0;min-height:144px;padding:7px 7px 20px!important;flex-direction:column;align-items:stretch;text-align:left;border-radius:9px}.parts-panel.catalog-grid .part-card[hidden]{display:none!important}.parts-panel.catalog-grid .part-card>span:nth-child(2){display:block;min-width:0;padding:5px 1px 0}.parts-panel.catalog-grid .part-card strong{display:block;font-size:10px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.parts-panel.catalog-grid .part-card small{display:-webkit-box;margin-top:3px;font-size:8px;line-height:1.3;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;color:#778188}.parts-panel.catalog-grid .part-icon{width:100%!important;height:78px!important;border-radius:7px}.parts-panel.catalog-grid .plus{display:none!important}
    .parts-panel.catalog-list .parts-list{padding-top:7px}.parts-panel.catalog-list .part-card{padding-right:34px;padding-bottom:17px}.parts-panel.catalog-list .catalog-card-meta{left:51px}.parts-panel.catalog-list .catalog-favorite{opacity:.45}.parts-panel.catalog-list .part-card:hover .catalog-favorite,.parts-panel.catalog-list .catalog-favorite.active{opacity:1}
    .catalog-v2-empty{grid-column:1/-1!important;order:99999!important;padding:28px 14px;text-align:center;color:#6f7980;font-size:10px}.catalog-v2-empty[hidden]{display:none!important}
    @media(max-width:800px){.catalog-browser-v2{padding-left:8px;padding-right:8px}.catalog-filter{height:30px}.parts-panel.catalog-grid .parts-list{grid-template-columns:repeat(2,minmax(0,1fr))}.catalog-search-v2 kbd{display:none}}
  `
  document.head.append(style)
}

function installCatalogBrowser() {
  const panel = document.querySelector('.parts-panel')
  const title = panel?.querySelector('.panel-title')
  const list = document.getElementById('partsList')
  const legacySearch = document.getElementById('partSearch')
  if (!panel || !title || !list || !legacySearch) {
    requestAnimationFrame(installCatalogBrowser)
    return
  }
  if (document.getElementById('catalogBrowserV2')) return

  installStyles()
  legacySearch.value = ''
  legacySearch.dispatchEvent(new Event('input', { bubbles: true }))

  const viewButton = document.createElement('button')
  viewButton.type = 'button'
  viewButton.className = 'panel-view-toggle'
  viewButton.dataset.catalogView = 'true'
  title.insertBefore(viewButton, title.querySelector('.panel-float-close') || null)
  viewButton.onclick = event => {
    event.stopPropagation()
    view = view === 'grid' ? 'list' : 'grid'
    localStorage.setItem(CATALOG_VIEW_KEY, view)
    applyView(panel, viewButton)
  }

  const browser = document.createElement('div')
  browser.id = 'catalogBrowserV2'
  browser.className = 'catalog-browser-v2'
  browser.innerHTML = `
    <label class="catalog-search-v2"><i data-lucide="search"></i><input id="catalogSearchV2" autocomplete="off" spellcheck="false" placeholder="${isRussian() ? 'Поиск: балка, ось, 20T…' : 'Search: beam, axle, 20T…'}"><kbd>Ctrl K</kbd><button type="button" data-catalog-clear aria-label="Clear"><i data-lucide="x"></i></button></label>
    <div class="catalog-filter-strip" data-catalog-filters></div>
    <div class="catalog-meta-row"><strong data-catalog-summary></strong><span>${isRussian() ? '★ — в избранное' : '★ favorite'}</span></div>
  `
  title.insertAdjacentElement('afterend', browser)

  const input = browser.querySelector('#catalogSearchV2')
  const clear = browser.querySelector('[data-catalog-clear]')
  input.addEventListener('input', () => {
    query = input.value.trim().toLocaleLowerCase()
    filterCards()
  })
  clear.onclick = () => {
    input.value = ''
    query = ''
    input.focus()
    filterCards()
  }

  list.addEventListener('click', event => {
    if (event.target.closest('[data-favorite-part]')) return
    const card = event.target.closest('.part-card[data-part]')
    if (!card) return
    const id = card.dataset.part
    recents = [id, ...recents.filter(item => item !== id)].slice(0, 16)
    persistRecents()
    requestAnimationFrame(refreshFilterBar)
  }, true)

  observer?.disconnect()
  observer = new MutationObserver(() => {
    if (filtering) return
    requestAnimationFrame(() => {
      decorateCards()
      filterCards()
    })
  })
  observer.observe(list, { childList: true })

  document.addEventListener('keydown', event => {
    if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'k') return
    if (document.querySelector('.parts-panel')?.classList.contains('panel-hidden')) return
    event.preventDefault()
    input.focus()
    input.select()
  })

  window.addEventListener('bricklab:languagechange', () => requestAnimationFrame(() => {
    input.placeholder = isRussian() ? 'Поиск: балка, ось, 20T…' : 'Search: beam, axle, 20T…'
    refreshFilterBar()
    decorateCards()
    filterCards()
  }))

  window.addEventListener('bricklab:partcatalogchange', () => requestAnimationFrame(() => {
    refreshFilterBar()
    decorateCards()
    filterCards()
  }))

  applyView(panel, viewButton)
  refreshFilterBar()
  decorateCards()
  filterCards()
}

installCatalogBrowser()
