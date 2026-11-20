import { safeImage } from '../sets/data.js?v=browser-recognition'
import { editorLabels } from '../editor/labels.js?v=editor-feedback'
import { locales } from './locale.js?v=project-home-layout'
import { revealMenu, showEditorLoading, startStartup } from './startup.js?v=wrangler'
import { downloadProject, makeRecord, newProject, parseProject, readProjects, writeProjects } from '../projects/documents.js'

const byId = id => document.getElementById(id)
const rows = byId('project-rows')
const query = byId('query')
const examplePanel = byId('example-panel')
const exampleGrid = examplePanel.querySelector('.example-grid')
const featuredExample = exampleGrid.querySelector('.example-card-featured')
const status = byId('status')
const removeDialog = byId('remove-dialog')
const settingsDialog = byId('settings-dialog')
const pages = ['home', 'projects', 'examples', 'library', 'sets']
let projects = readProjects()
let storageWarning = false
let activeMenu = null
let pendingRemoval = null
const editorRoot = byId('editor')
const startupRoot = byId('startup')
const loadingTemplate = startupRoot.cloneNode(true)
loadingTemplate.removeAttribute('id')
const shell = document.querySelector('.shell')
const libraryRoot = byId('library-panel')
const libraryStatus = byId('library-status')
const libraryRetry = byId('library-retry')
const libraryControls = libraryRoot.querySelector('[data-library-controls]')
const libraryScroll = libraryRoot.querySelector('[data-library-scroll]')
const librarySearch = libraryControls.querySelector('input')
let setSession
let editorSession
let librarySession
let homePreviewSession
let librarySection
let libraryGroup = ''
let language = 'ru'

try {
  if (localStorage.getItem('bricklab.language') === 'en') language = 'en'
} catch {
  // The menu is still usable when storage is disabled.
}

const strings = () => locales[language]
const element = (tag, className, value) => {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (value !== undefined) node.textContent = value
  return node
}

function icon(name, className = 'icon') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  const use = document.createElementNS(svg.namespaceURI, 'use')
  svg.setAttribute('class', className)
  svg.setAttribute('aria-hidden', 'true')
  use.setAttribute('href', `#${name}`)
  svg.append(use)
  return svg
}

function button(className, value) {
  const node = element('button', className, value)
  node.type = 'button'
  return node
}

function setStatus(key) {
  status.dataset.key = key ?? ''
  status.hidden = !key
  status.textContent = key ? strings()[key] : ''
}

function updateProjects(next) {
  projects = next
  try {
    writeProjects(projects)
    storageWarning = false
  } catch {
    storageWarning = true
  }
}

function openProject(id) {
  const hash = `#project/${id}`
  if (location.hash === hash) render()
  else location.hash = hash
}

function addProject(data) {
  const record = makeRecord(data)
  updateProjects([record, ...projects])
  openProject(record.id)
}

function closeMenu(restoreFocus = false) {
  if (!activeMenu) return
  const { toggle, menu } = activeMenu
  menu.hidden = true
  toggle.setAttribute('aria-expanded', 'false')
  activeMenu = null
  if (restoreFocus) toggle.focus()
}

function projectRow(project, formatter) {
  const t = strings()
  const tr = element('tr')
  const title = element('td')
  const open = button('project-open')
  const fileIcon = element('span', 'file-icon')
  fileIcon.append(icon('file'))
  open.append(fileIcon, element('span', null, project.document.name))
  open.title = project.document.name
  open.addEventListener('click', () => openProject(project.id))
  title.append(open)
  const modified = element('td')
  const date = element('time', null, formatter.format(new Date(project.modifiedAt)))
  date.dateTime = project.modifiedAt
  modified.append(date)
  const actions = element('td', 'row-actions')
  const toggle = button('more')
  toggle.append(icon('more'))
  toggle.setAttribute('aria-label', `${t.actions}: ${project.document.name}`)
  toggle.setAttribute('aria-expanded', 'false')
  const menu = element('div', 'row-menu')
  menu.id = `actions-${project.id}`
  toggle.setAttribute('aria-controls', menu.id)
  menu.hidden = true
  const download = button(null, t.export)
  download.addEventListener('click', () => {
    downloadProject(project.document)
    closeMenu(true)
  })
  const remove = button('danger', t.remove)
  remove.addEventListener('click', () => {
    pendingRemoval = project.id
    byId('remove-name').textContent = project.document.name
    closeMenu(true)
    removeDialog.returnValue = 'cancel'
    removeDialog.showModal()
  })
  menu.append(download, remove)
  toggle.addEventListener('click', () => {
    if (activeMenu?.toggle === toggle) {
      closeMenu()
      return
    }
    closeMenu()
    activeMenu = { toggle, menu }
    menu.hidden = false
    toggle.setAttribute('aria-expanded', 'true')
  })
  actions.append(toggle, menu)
  tr.append(title, modified, actions)
  return tr
}

const sortByModified = records => [...records].sort((a, b) => Date.parse(b.modifiedAt) - Date.parse(a.modifiedAt))

function renderList() {
  closeMenu()
  const keyword = query.value.trim().toLocaleLowerCase(language)
  const visible = sortByModified(projects.filter(
    project => project.document.name.toLocaleLowerCase(language).includes(keyword),
  ))
  const formatter = new Intl.DateTimeFormat(language, { month: 'short', day: 'numeric' })
  rows.replaceChildren(...visible.map(project => projectRow(project, formatter)))
  const empty = byId('empty-state')
  empty.hidden = visible.length > 0
  empty.textContent = strings()[keyword ? 'noResults' : 'empty']
}

function recentBuild(project, formatter) {
  const item = element('li')
  const open = button('home-recent-open')
  open.title = project.document.name
  const art = element('span', 'home-recent-art')
  art.setAttribute('aria-hidden', 'true')
  art.append(icon('layers'))
  const details = element('span', 'home-recent-detail')
  const date = element('time', null, formatter.format(new Date(project.modifiedAt)))
  date.dateTime = project.modifiedAt
  details.append(element('strong', null, project.document.name), date)
  open.append(art, details)
  open.addEventListener('click', () => openProject(project.id))
  item.append(open)
  return { item, art }
}

function showPreview(target, source, signal, caption) {
  const image = element('img')
  image.alt = ''
  image.decoding = 'async'
  image.referrerPolicy = 'no-referrer'
  const removable = source instanceof Blob
  const url = removable ? URL.createObjectURL(source) : source
  if (removable) signal.addEventListener('abort', () => URL.revokeObjectURL(url), { once: true })
  image.addEventListener('load', () => {
    if (signal.aborted) return
    if (caption) {
      const figure = element('figure', 'home-feature-cover')
      figure.append(image, element('figcaption', null, caption))
      target.replaceChildren(figure)
    } else target.replaceChildren(image)
  }, { once: true, signal })
  image.src = url
}

function homeInstruction(project, signal, emptyModelArt) {
  const section = byId('home-instruction')
  const { set, book: bookIndex, page } = project.document.buildingSet ?? {}
  section.hidden = typeof set?.number !== 'string' || !Number.isSafeInteger(page) || page < 1
  if (section.hidden) return
  const book = Array.isArray(set.books) ? set.books[bookIndex] : undefined
  const total = Number.isSafeInteger(book?.pages) && book.pages >= page ? book.pages : undefined
  byId('home-instruction-page').textContent = strings().instructionPage(page, total)
  const preview = byId('home-instruction-art')
  preview.replaceChildren(icon('book'))
  if (!book?.url) return
  import('../sets/instruction-sources.js?v=browser-recognition').then(({ instructionPagePreview }) => {
    if (signal.aborted) return
    const image = instructionPagePreview(set.number, book.url, page)?.image
    if (image) {
      showPreview(preview, image, signal)
      if (emptyModelArt) showPreview(emptyModelArt, image, signal, strings().instruction)
    }
  }).catch(() => {})
}

function renderHome(visible) {
  homePreviewSession?.abort()
  homePreviewSession = undefined
  const overview = byId('home-overview')
  overview.hidden = !visible || projects.length === 0
  if (overview.hidden) return

  const [latest, ...recent] = sortByModified(projects).slice(0, 4)
  const t = strings()
  const formatter = new Intl.DateTimeFormat(language, { month: 'short', day: 'numeric' })
  const latestArt = byId('home-project-art')
  const fallback = element('div', 'home-fallback')
  const hint = element('span', null, t.emptyModel)
  hint.hidden = latest.document.parts.length > 0
  fallback.append(icon('layers'), hint)
  latestArt.replaceChildren(fallback)
  byId('home-project-name').textContent = latest.document.name
  byId('home-project-meta').textContent = t.partCount(latest.document.parts.length)
  byId('continue-project').onclick = () => openProject(latest.id)
  byId('home-recent').hidden = recent.length === 0

  homePreviewSession = new AbortController()
  const { signal } = homePreviewSession
  const setCover = safeImage(latest.document.buildingSet?.set?.image)
  const emptyModel = latest.document.parts.length === 0
  homeInstruction(latest, signal, emptyModel && !setCover ? latestArt : null)
  if (emptyModel && setCover) showPreview(latestArt, setCover, signal, t.setCover)

  const recentList = recent.map(project => ({ project, ...recentBuild(project, formatter) }))
  byId('home-recent-list').replaceChildren(...recentList.map(({ item }) => item))
  const entries = [{
    project: latest,
    show(preview) {
      if (preview) showPreview(latestArt, preview, signal)
      else {
        hint.textContent = t.previewUnavailable
        hint.hidden = false
      }
    },
  }, ...recentList.map(({ project, art }) => ({
    project,
    show(preview) { if (preview) showPreview(art, preview, signal) },
  }))]
  if (entries.some(({ project }) => project.document.parts.length)) {
    import('./home-previews.js?v=project-home')
      .then(({ loadHomePreviews }) => loadHomePreviews(entries, signal))
      .catch(() => { if (!signal.aborted && latest.document.parts.length) entries[0].show(null) })
  }
}

function currentPage() {
  const hash = location.hash.slice(1)
  if (hash.startsWith('project/')) return 'project'
  return pages.includes(hash) ? hash : 'home'
}

function render(initial = false) {
  closeMenu()
  const t = strings()
  const page = currentPage()
  const home = page === 'home'
  const listVisible = page === 'projects'
  const requestedId = page === 'project' ? location.hash.slice('#project/'.length) : null
  const activeProject = requestedId ? projects.find(project => project.id === requestedId) : null
  const returning = shell.hidden && !activeProject
  shell.hidden = Boolean(activeProject)
  editorRoot.hidden = !activeProject
  if (!activeProject) closeEditor()
  document.documentElement.lang = language
  document.querySelectorAll('[data-text]').forEach(node => {
    node.textContent = t[node.dataset.text]
  })
  document.querySelectorAll('[data-link-label]').forEach(link => {
    const label = t[link.dataset.linkLabel]
    link.setAttribute('aria-label', label)
    link.title = label
  })
  document.querySelector('.navigation').setAttribute('aria-label', t.sections)
  document.querySelectorAll('[data-page]').forEach(link => {
    const selected = link.dataset.page === (page === 'project' ? 'projects' : page)
    if (selected) link.setAttribute('aria-current', 'page')
    else link.removeAttribute('aria-current')
  })
  byId('settings-button').setAttribute('aria-label', t.settings)
  byId('language').value = language
  byId('settings-language').value = language
  query.placeholder = t.search
  query.setAttribute('aria-label', t.search)
  byId('dashboard').hidden = !listVisible
  byId('home-title').hidden = !home
  byId('home-actions').hidden = !home && !listVisible
  byId('home-sets').hidden = !home
  byId('home-example-heading').hidden = !home
  examplePanel.hidden = !home && page !== 'examples'
  examplePanel.classList.toggle('home-examples', home)
  examplePanel.setAttribute('aria-labelledby', home ? 'home-example-title' : 'page-title')
  if (home && exampleGrid.firstElementChild !== featuredExample) exampleGrid.prepend(featuredExample)
  if (!home && exampleGrid.lastElementChild !== featuredExample) exampleGrid.append(featuredExample)
  renderHome(home)
  libraryRoot.hidden = page !== 'library'
  byId('sets-panel').hidden = page !== 'sets'
  if (page === 'sets') openSets()
  else closeSets()
  byId('page-title').hidden = home
  byId('page-title').textContent = page === 'home' ? t.workspace :
    page === 'project' ? activeProject?.document.name ?? t.projects : t[page]
  if (listVisible) renderList()
  const editorReady = activeProject ? openEditor(activeProject, !initial && startupRoot.hidden) : undefined
  if (page === 'library') openLibrary()
  else closeLibrary()
  setStatus(requestedId && !activeProject ? 'missing' : storageWarning ? 'storageError' : null)
  if (returning && startupRoot.hidden) revealMenu(shell)
  return editorReady
}

function closeSets() {
  setSession?.controller.abort()
  setSession = null
}
async function openSets() {
  if (setSession?.language === language) return
  closeSets()
  const controller = new AbortController()
  setSession = { controller, language }
  const root = byId('sets-panel')
  root.textContent = strings().loadingLibrary
  try {
    const { mountSetCatalog } = await import('../sets/catalog.js?v=browser-recognition')
    if (controller.signal.aborted) return
    await mountSetCatalog(root, { language, signal: controller.signal, projects: () => projects,
      resume: openProject,
      begin(set) {
        const data = newProject(set.name)
        data.buildingSet = { set, book: 0, page: 1 }
        addProject(data)
      },
    })
  } catch (error) {
    if (controller.signal.aborted) return
    root.textContent = strings().exampleUnavailable
    root.append(button('secondary', editorLabels[language].retry))
    root.lastElementChild.addEventListener('click', () => { closeSets(); openSets() }, { signal: controller.signal })
  }
}

function closeLibrary() {
  if (!librarySession) return
  if (librarySession.view) {
    librarySection = librarySession.view.section
    libraryGroup = librarySession.view.group
  }
  librarySession.controller.abort()
  librarySession = null
}

async function openLibrary() {
  if (librarySession?.language === language) return
  closeLibrary()
  const controller = new AbortController()
  const session = { controller, language, view: null }
  librarySession = session
  const labels = editorLabels[language]
  libraryControls.hidden = true
  libraryScroll.hidden = true
  libraryStatus.hidden = false
  libraryStatus.textContent = strings().loadingLibrary
  libraryRetry.hidden = true
  try {
    const [{ mountLibrary }, { sections, parts }] = await Promise.all([
      import('../editor/library.js?v=element-search'),
      import('../editor/parts-data.js?v=turntable-parts'),
    ])
    if (controller.signal.aborted) return
    librarySearch.placeholder = labels.search
    librarySearch.setAttribute('aria-label', labels.search)
    session.view = mountLibrary(libraryRoot, {
      sections, models: parts, language: session.language, labels, initialSection: librarySection, initialGroup: libraryGroup, signal: controller.signal,
    })
    libraryControls.hidden = false
    libraryScroll.hidden = false
    libraryStatus.hidden = true
  } catch (error) {
    if (controller.signal.aborted) return
    console.error(error)
    libraryStatus.textContent = labels.loadPartsError
    libraryRetry.textContent = labels.retry
    libraryRetry.hidden = false
  }
}

function closeEditor() {
  if (!editorSession) return
  editorSession.controller.abort()
  editorSession = null
  editorRoot.replaceChildren()
}

async function openEditor(project, showLoading = startupRoot.hidden) {
  if (editorSession?.id === project.id && editorSession.language === language) return
  closeEditor()
  const controller = new AbortController()
  const session = { id: project.id, language, controller }
  editorSession = session
  const t = editorLabels[language]
  const set = project.document.buildingSet?.set
  const guidedSet = typeof set?.name === 'string' && typeof set.number === 'string' ? set : undefined
  const transition = showLoading ? showEditorLoading(loadingTemplate.cloneNode(true), editorRoot, {
    language, set: guidedSet, signal: controller.signal,
  }) : null
  let phase = 'loadEditorError'
  try {
    const { mountEditor } = await import('../editor/editor.js?v=editor-feedback')
    if (controller.signal.aborted) return
    phase = 'startEditorError'
    await mountEditor(editorRoot, {
      document: project.document, language, signal: controller.signal,
      download: downloadProject,
      // An initial deep link uses the main loader and still waits for the first instruction page.
      reportLoad: guidedSet ? transition?.report ?? (() => {}) : undefined,
      save(document) {
        if (controller.signal.aborted) return false
        const record = makeRecord(document, project.id)
        const latest = storageWarning ? projects : readProjects()
        updateProjects([record, ...latest.filter(item => item.id !== project.id)])
        return !storageWarning
      },
    })
    if (!controller.signal.aborted) await transition?.finish()
  } catch (error) {
    if (controller.signal.aborted) return
    console.error(error)
    const panel = element('div', 'editor-loading')
    const back = element('a', null, t.home)
    back.href = '#projects'
    const retry = button(null, t.retry)
    const key = error?.code === 'webgl-init' ? 'noWebgl' :
      error?.code === 'palette-load' ? 'loadPartsError' : phase
    const message = element('p', null, t[key])
    message.setAttribute('role', 'alert')
    retry.addEventListener('click', () => {
      // A failed dependency can stay in the current document's module map.
      // Reload the document at the current project URL to retry the whole graph.
      if (key === 'loadEditorError' && !storageWarning) {
        location.reload()
        return
      }
      closeEditor()
      openEditor(project)
    })
    panel.append(message, retry, back)
    editorRoot.replaceChildren(panel)
    await transition?.finish(true)
    controller.abort()
  }
}

function setLanguage(value) {
  language = value === 'en' ? 'en' : 'ru'
  try {
    localStorage.setItem('bricklab.language', language)
  } catch {
    storageWarning = true
  }
  render()
}

query.addEventListener('input', renderList)
libraryRetry.addEventListener('click', () => location.reload())
byId('language').addEventListener('change', event => setLanguage(event.target.value))
byId('settings-language').addEventListener('change', event => setLanguage(event.target.value))
byId('settings-button').addEventListener('click', () => settingsDialog.showModal())
byId('create').addEventListener('click', () => addProject(newProject(strings().untitled)))
byId('open').addEventListener('click', () => byId('import-file').click())
byId('import-file').addEventListener('change', async event => {
  const [file] = event.target.files
  event.target.value = ''
  if (!file) return
  try {
    addProject(parseProject(await file.text()))
  } catch {
    setStatus('invalidFile')
  }
})
async function loadExample(file) {
  if (!file) {
    const { drivetrain } = await import('../projects/drivetrain.js')
    return newProject(strings().exampleTitle, drivetrain)
  }
  const url = new URL(`../../examples/${file}`, import.meta.url)
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Example ${url.pathname}: HTTP ${response.status}`)
  return parseProject(await response.text())
}

async function openExample(event) {
  const control = event.currentTarget
  const page = currentPage()
  control.disabled = true
  try {
    const example = await loadExample(control.dataset.exampleFile)
    if (currentPage() === page) addProject(example)
  } catch {
    if (currentPage() === page) setStatus('exampleUnavailable')
  } finally {
    control.disabled = false
  }
}
for (const control of document.querySelectorAll('[data-example-file]')) {
  control.addEventListener('click', openExample)
}
removeDialog.addEventListener('close', () => {
  if (removeDialog.returnValue === 'remove' && pendingRemoval) {
    const id = pendingRemoval
    updateProjects(projects.filter(project => project.id !== id))
    import('./home-previews.js?v=project-home').then(({ removeHomePreview }) => removeHomePreview(id)).catch(() => {})
    render()
    query.focus()
  }
  pendingRemoval = null
})
document.addEventListener('click', event => {
  if (activeMenu && !activeMenu.toggle.parentElement.contains(event.target)) closeMenu()
})
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeMenu(true)
})
window.addEventListener('hashchange', event => {
  query.value = ''
  if (currentPage() === 'library' || new URL(event.oldURL).hash === '#library') window.scrollTo(0, 0)
  render()
})
window.addEventListener('storage', event => {
  if (event.key === 'bricklab.projects.v1' || event.key === null) {
    projects = readProjects()
    render()
  }
})
startStartup(startupRoot, language, [shell, editorRoot], () => render(true))
