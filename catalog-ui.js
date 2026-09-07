const CATALOG_VIEW_KEY = 'bricklab.ui.catalog-view.v1'
const VALID_VIEWS = new Set(['list', 'grid'])

function readView() {
  const saved = localStorage.getItem(CATALOG_VIEW_KEY)
  return VALID_VIEWS.has(saved) ? saved : 'list'
}

function installCatalogView() {
  const panel = document.querySelector('.parts-panel')
  const title = panel?.querySelector('.panel-title')
  if (!panel || !title) {
    requestAnimationFrame(installCatalogView)
    return
  }
  if (title.querySelector('[data-catalog-view]')) return

  let view = readView()
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'panel-view-toggle'
  button.dataset.catalogView = 'true'
  title.insertBefore(button, title.querySelector('.panel-float-close') || null)

  const apply = () => {
    panel.classList.toggle('catalog-grid', view === 'grid')
    button.classList.toggle('active', view === 'grid')
    button.title = view === 'grid' ? 'Switch Parts catalog to list view' : 'Switch Parts catalog to grid view'
    button.setAttribute('aria-label', button.title)
    button.innerHTML = `<i data-lucide="${view === 'grid' ? 'list' : 'layout-grid'}"></i>`
    window.lucide?.createIcons?.({ attrs: { 'stroke-width': 1.8, 'aria-hidden': 'true' } })
  }

  button.onclick = event => {
    event.stopPropagation()
    view = view === 'grid' ? 'list' : 'grid'
    localStorage.setItem(CATALOG_VIEW_KEY, view)
    apply()
  }

  apply()
}

installCatalogView()
