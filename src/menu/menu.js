import { sessionDiagnostics } from '../feedback/diagnostics.js?v=bug-report-v1'
import { mountBugReport } from '../feedback/dialog.js?v=events-1'
import { safeImage } from '../sets/data.js?v=catalog-engine-1'
import { editorLabels } from '../editor/labels.js?v=torque-clutch'
import { locales } from './locale.js?v=store-1'
import {mountStore} from './store.js?v=welcome-1'
import { mountHomeHub, mountHubSearch } from './home-hub.js?v=signature-art-1'
import { mergeProjectGallery } from './projects-client.js?v=profile-gallery-1'
import { createCloudAccount } from './account.js?v=welcome-2'
import { createNotificationPopover } from './notifications.js?v=gallery-1'
import { readPreference, writePreference, resetPreferences } from './preferences.js?v=full-settings'
import { readTutorial, dismissTutorialOffer, startTutorial } from './tutorial-state.js?v=onboarding-v1'
import { revealMenu, showEditorLoading, startStartup } from './startup.js?v=bold-brand'
import { downloadProject, makeRecord, newProject, parseProject, readProjects, writeProjects } from '../projects/documents.js'

const byId = id => document.getElementById(id)
const rows = byId('project-rows')
const query = byId('query')
const dashboard = byId('dashboard'), dashboardHome = dashboard.parentNode, dashboardNext = dashboard.nextSibling
const projectActions = byId('home-actions'), projectActionsHome = projectActions.parentNode
const examplePanel = byId('example-panel')
const exampleGrid = examplePanel.querySelector('.example-grid')
const featuredExample = exampleGrid.querySelector('.example-card-featured')
const status = byId('status')
const removeDialog = byId('remove-dialog')
const settingsDialog = byId('settings-dialog')
const tutorialPicker = byId('tutorial-picker')
const pages = ['home', 'projects', 'examples', 'library', 'sets', 'account', 'community', 'store']
let projects = readProjects()
let storageWarning = false
let activeMenu = null
let pendingRemoval = null
const editorRoot = byId('editor')
const startupRoot = byId('startup')
const loadingTemplate = startupRoot.cloneNode(true)
loadingTemplate.removeAttribute('id')
const shell = document.querySelector('.shell')
const workshopHeader=shell.querySelector('.topbar')
if(typeof ResizeObserver==='function'&&workshopHeader){const observer=new ResizeObserver(()=>{if(!shell.hidden)shell.style.setProperty('--workshop-header-height',workshopHeader.offsetHeight+'px')});observer.observe(workshopHeader)}
const libraryRoot = byId('library-panel')
const libraryStatus = byId('library-status')
const libraryRetry = byId('library-retry')
const libraryControls = libraryRoot.querySelector('[data-library-controls]')
const libraryScroll = libraryRoot.querySelector('[data-library-scroll]')
const librarySearch = libraryControls.querySelector('input')
let communitySession
let setSession
let editorSession
let librarySession
let storeSession
let hubSession,hubSearch,hubSearchLanguage,pendingLibraryQuery='',pendingSetQuery=''
let homePreviewSession
let projectPreviewSession
let projectPreviewObserver
let librarySection
let libraryGroup = ''
let language = 'ru'
const notificationPopover = createNotificationPopover({root:byId('notification-control'),trigger:byId('notification-trigger'),count:byId('notification-count'),panel:byId('notification-popover'),
  onRefresh:()=>cloudAccount.refreshNotifications(),
  onRead:()=>cloudAccount.readNotifications(),
  onOpen:()=>{cloudAccount.showNotifications();if(location.hash!=='#account')location.hash='#account'}
})
const cloudAccount = createCloudAccount({ root: byId('account-panel'), link: byId('account-link'),
  getProjects: () => projects, createBuild:()=>addProject(newProject(strings().untitled)), openLocal:openProject, previewsEnabled:()=>readPreference('previews')!=='off', download: downloadProject, openCopy: (data, cloud) => addProject(data, null, cloud), linkLocal: linkCloudProject, onNotifications: state => notificationPopover.update(state), onProjectsPanel:mountAccountProjects, onProjectsChanged:()=>{const signedIn=cloudAccount.projectState().signedIn;document.querySelector('[data-page="projects"]').href=signedIn?'#account/projects':'#projects';if(currentPage()==='projects'){if(signedIn)location.replace('#account/projects');else renderList()}else if(dashboard.parentNode!==dashboardHome&&!dashboard.hidden)renderList();if(currentPage()==='home')renderCloudContinue()} })

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
  try{localStorage.setItem('bricklab.lastOpenedProject',id)}catch{}
  const hash = `#project/${id}`
  if (location.hash === hash) render()
  else location.hash = hash
}

function addProject(data, tutorialMode = null, cloud = null) {
  const record = makeRecord(data)
  if (cloud) record.cloud = cloud
  updateProjects([record, ...projects])
  if (tutorialMode) startTutorial(record.id, tutorialMode)
  openProject(record.id)
  return record.id
}

function linkCloudProject(id, cloud, expected) {
  const latest = storageWarning ? projects : readProjects()
  const record = latest.find(item => item.id === id)
  if (!record || JSON.stringify(record.cloud ?? null) !== JSON.stringify(expected ?? null)) return false
  updateProjects(latest.map(item => item.id === id ? { ...item, cloud } : item))
  return !storageWarning
}

async function beginTutorial(mode) {
  if (!['quick', 'first', 'mechanics'].includes(mode)) return
  const t = strings()
  let document
  try {
    if (mode === 'mechanics') {
      document = await loadExample('')
      document.name = t.tutorialMechanicsProject
    } else {
      // A real core Technic beam, displayed in a separate practice project.
      document = newProject(t.tutorialProjectName, {
        parts: [{ id: crypto.randomUUID(), design: '32316' }],
      })
    }
  } catch {
    tutorialPicker.close()
    setStatus('exampleUnavailable')
    return
  }
  if (settingsDialog.open) settingsDialog.close()
  if (tutorialPicker.open) tutorialPicker.close()
  addProject(document, mode)
}

function closeMenu(restoreFocus = false) {
  if (!activeMenu) return
  const { toggle, menu } = activeMenu
  menu.hidden = true
  toggle.setAttribute('aria-expanded', 'false')
  activeMenu = null
  if (restoreFocus) toggle.focus()
}

function projectCard(project, formatter, cloudHead) {
  const t = strings()
  // Older cached locale modules must not break the entire saved-builds page.
  const projectParts = count => typeof t.projectParts === 'function'
    ? t.projectParts(count) : language === 'ru' ? `${count} дет.` : `${count} parts`
  const projectDescription = count => typeof t.projectDescription === 'function'
    ? t.projectDescription(count) : language === 'ru'
      ? (count ? `Модель из ${count} деталей.` : 'Начните сборку с первых деталей.')
      : (count ? `A model with ${count} parts.` : 'Start adding parts to this build.')
  const projectSetDescription = number => typeof t.projectSetDescription === 'function'
    ? t.projectSetDescription(number) : language === 'ru'
      ? `Сборка по инструкции · набор №${number}` : `Building from instructions · set #${number}`
  const card = element('article', 'project-card')
  const art = element('div', 'project-card-image')
  art.setAttribute('aria-hidden', 'true')
  const placeholder = element('div', 'project-card-placeholder')
  placeholder.append(icon('layers'))
  if (!project.document.parts.length) placeholder.append(element('span', null, t.emptyModel))
  art.append(placeholder)

  const body = element('div', 'project-card-body')
  const title = element('h2', 'project-card-title', project.document.name)
  title.title = project.document.name
  const setNumber = project.document.buildingSet?.set?.number
  const customDescription = typeof project.document.description === 'string' ? project.document.description.trim() : ''
  const description = customDescription ||
    (typeof setNumber === 'string' && setNumber
      ? projectSetDescription(setNumber) : projectDescription(project.document.parts.length))
  const summary = element('p', 'project-card-description', description)
  const meta = element('div', 'project-card-meta')
  const date = element('time', null, formatter.format(new Date(project.modifiedAt)))
  date.dateTime = project.modifiedAt
  meta.append(element('span', null, (language==='ru'?'Локально · ':'Local · ')+projectParts(project.document.parts.length)), date)

  const actions = element('div', 'project-card-actions')
  const open = button('workspace-action primary project-card-open', t.projectOpen || t.open || (language === 'ru' ? 'Открыть' : 'Open'))
  open.addEventListener('click', () => openProject(project.id))
  const download = button('workspace-action project-card-download', t.projectDownload || t.export || (language === 'ru' ? 'Скачать' : 'Download'))
  download.addEventListener('click', () => downloadProject(project.document))
  const remove = button('project-card-remove')
  remove.append(icon('trash'))
  remove.title = t.remove
  remove.setAttribute('aria-label', `${t.remove}: ${project.document.name}`)
  remove.addEventListener('click', () => {
    pendingRemoval = project.id
    byId('remove-name').textContent = project.document.name
    removeDialog.returnValue = 'cancel'
    removeDialog.showModal()
  })
  actions.append(open, download, remove)
  body.append(title, summary, meta, actions, cloudAccount.localProjectControls(project))
  if(cloudHead)body.append(cloudAccount.remoteProjectControls(cloudHead))
  card.append(art, body)
  return { card, art, project }
}

function remoteProjectCard(p, formatter, ownerId) {
  const card=element('article','project-card project-card-remote')
  const art=element('div','project-card-image')
  art.setAttribute('aria-hidden','true')
  const placeholder=element('div','project-card-placeholder')
  placeholder.append(icon('icon-cloud'))
  art.append(placeholder)
  const body=element('div','project-card-body')
  const title=element('h2','project-card-title',p.name)
  const description=element('p','project-card-description',language==='ru'?'Облачная сборка':'Cloud build')
  const meta=element('div','project-card-meta')
  const version=element('span',null,(language==='ru'?'Облако · версия ':'Cloud · revision ')+p.revision)
  const date=element('time',null,formatter.format(new Date(p.updatedAt)))
  date.dateTime=p.updatedAt
  meta.append(version,date)
  body.append(title,description,meta,cloudAccount.remoteProjectControls(p))
  card.append(art,body)
  return {card,art,remote:p,ownerId,description}
}

function stopProjectPreviews() {
  projectPreviewSession?.abort()
  projectPreviewSession = undefined
  projectPreviewObserver?.disconnect()
  projectPreviewObserver = undefined
}

const sortByModified = records => [...records].sort((a, b) => Date.parse(b.modifiedAt) - Date.parse(a.modifiedAt))

// Keep one gallery and its original controls and event handlers.
function mountAccountProjects(slot) {
  if (!slot) {
    if (dashboard.parentNode===dashboardHome) return
    stopProjectPreviews()
    dashboardHome.insertBefore(dashboard,dashboardNext)
    projectActionsHome.append(projectActions)
    dashboard.hidden=currentPage()!=='projects'
    projectActions.hidden=!['home','projects'].includes(currentPage())
    if(currentPage()==='account'&&location.hash!=='#account/projects'){
      document.querySelector('[data-page="projects"]').removeAttribute('aria-current')
      document.querySelector('[data-page="account"]')?.setAttribute('aria-current','page')
    }
    return
  }
  slot.append(projectActions,dashboard)
  projectActions.hidden=false
  dashboard.hidden=false
  renderList()
}

function renderList() {
  closeMenu()
  stopProjectPreviews()
  const keyword = query.value.trim().toLocaleLowerCase(language)
  const visible = sortByModified(projects.filter(
    project => project.document.name.toLocaleLowerCase(language).includes(keyword),
  ))
  const formatter = new Intl.DateTimeFormat(language, { month: 'short', day: 'numeric' })
  const state=cloudAccount.projectState()
  const matchingRemote=state.remote.filter(p=>p.name.toLocaleLowerCase(language).includes(keyword)||visible.some(r=>r.cloud?.kind!=='bureau'&&r.cloud?.ownerId===state.ownerId&&r.cloud?.id===p.id))
  const cards=mergeProjectGallery(visible,matchingRemote,state.ownerId).map(({project,cloud})=>project?projectCard(project,formatter,cloud):remoteProjectCard(cloud,formatter,state.ownerId))
  rows.replaceChildren(...cards.map(({ card }) => card))
  const info=byId('project-cloud-status')
  info.textContent=[state.message,state.warning].filter(Boolean).join(' · ')
  info.hidden=!info.textContent
  const refresh=byId('project-cloud-refresh')
  refresh.hidden=!state.signedIn
  refresh.disabled=state.busy
  const empty = byId('empty-state')
  empty.hidden = cards.length > 0
  empty.textContent = strings()[keyword ? 'noResults' : 'empty']
  if (!cards.length) return

  const controller = new AbortController()
  projectPreviewSession = controller
  const { signal } = controller
  const queue = []
  let loading = false

  async function loadQueuedPreviews() {
    if (loading || signal.aborted) return
    loading = true
    try {
      const { loadHomePreviews } = await import('./home-previews.js?v=profile-gallery-1')
      while (!signal.aborted && queue.length) {
        const batch=[]
        for(const entry of queue.splice(0,4)){
          if(signal.aborted)break
          if(entry.remote){
            try{
              const item=await cloudAccount.fetchProjectPreview(entry.remote.id,entry.ownerId,signal)
              if(!item||signal.aborted)continue
              const doc=item.document
              entry.description.textContent=(typeof doc.description==='string'&&doc.description.trim())||(language==='ru'?doc.parts.length+' деталей':doc.parts.length+' parts')
              const cover=safeImage(doc.buildingSet?.set?.image)
              if(cover)showPreview(entry.art,cover,signal)
              batch.push({project:{id:entry.remote.id,modifiedAt:entry.remote.updatedAt,document:doc},cache:false,show:entry.show})
            }catch{}
          }else batch.push(entry)
        }
        if(!signal.aborted)await loadHomePreviews(batch,signal)
      }
    } catch {
      // The saved builds and their actions remain available without WebGL or cache.
    } finally {
      loading = false
    }
  }

  const pending = new Map()
  for (const entry of cards) {
    if(entry.remote){pending.set(entry.card,entry);continue}
    const cover = safeImage(entry.project.document.buildingSet?.set?.image)
    if (cover) showPreview(entry.art, cover, signal)
    if (!entry.project.document.parts.length) continue
    pending.set(entry.card, entry)
  }
  if (readPreference('previews') === 'off') return
  const enqueue = entry => {
    queue.push({
      ...entry,
      show(preview) { if (preview && !signal.aborted) showPreview(entry.art, preview, signal) },
    })
  }
  if (typeof IntersectionObserver === 'function') {
    const observer = new IntersectionObserver(entries => {
      for (const item of entries) {
        if (!item.isIntersecting) continue
        observer.unobserve(item.target)
        const entry = pending.get(item.target)
        if (entry) enqueue(entry)
      }
      if (queue.length) void loadQueuedPreviews()
    }, { rootMargin: '250px 0px' })
    projectPreviewObserver = observer
    for (const card of pending.keys()) observer.observe(card)
  } else {
    for (const entry of pending.values()) enqueue(entry)
    void loadQueuedPreviews()
  }
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
  const progress=byId('home-instruction-progress');progress.hidden=!total;progress.max=total??1;progress.value=total?page:0
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

  let lastOpened;try{lastOpened=localStorage.getItem('bricklab.lastOpenedProject')}catch{}
  const latest=projects.find(p=>p.id===lastOpened)??sortByModified(projects)[0],recent=[]
  const t = strings()
  const formatter = new Intl.DateTimeFormat(language, { month: 'short', day: 'numeric' })
  const latestArt = byId('home-project-art')
  const fallback = element('div', 'home-fallback')
  const hint = element('span', null, t.emptyModel)
  const previewsEnabled = readPreference('previews') !== 'off'
  hint.hidden = previewsEnabled && latest.document.parts.length > 0
  if (!previewsEnabled && latest.document.parts.length) hint.textContent = t.previewDisabled
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
  if ((emptyModel || !previewsEnabled) && setCover) showPreview(latestArt, setCover, signal, t.setCover)

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
  if (previewsEnabled && entries.some(({ project }) => project.document.parts.length)) {
    import('./home-previews.js?v=project-shadows')
      .then(({ loadHomePreviews }) => loadHomePreviews(entries, signal))
      .catch(() => { if (!signal.aborted && latest.document.parts.length) entries[0].show(null) })
  }
}

function currentPage() {
  const hash = location.hash.slice(1)
  if (hash === 'account/projects' || hash.startsWith('account/admin/')) return 'account'
  if (hash.startsWith('community/')) return 'community'
  if (hash.startsWith('project/')) return 'project'
  return pages.includes(hash) ? hash : 'home'
}

function render(initial = false) {
  closeMenu()
  const t = strings()
  const page = currentPage()
  if(page==='projects'&&cloudAccount.projectState().signedIn){location.replace('#account/projects');return}
  const home = page === 'home'
  const listVisible = page === 'projects'
  const requestedId = page === 'project' ? location.hash.slice('#project/'.length) : null
  const activeProject = requestedId ? projects.find(project => project.id === requestedId) : null
  const returning = shell.hidden && !activeProject
  shell.hidden = Boolean(activeProject)
  editorRoot.hidden = !activeProject
  if (!activeProject) closeEditor()
  else try{localStorage.setItem('bricklab.lastOpenedProject',activeProject.id)}catch{}
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
    const selected = link.dataset.page === (page === 'project' || location.hash==='#account/projects' ? 'projects' : page)
    if (selected) link.setAttribute('aria-current', 'page')
    else link.removeAttribute('aria-current')
  })
  byId('settings-button').setAttribute('aria-label', t.settings)
  byId('language').value = language
  byId('settings-language').value = language
  syncSettingsControls()
  query.placeholder = t.search
  query.setAttribute('aria-label', t.search)
  byId('tutorial-offer').hidden = !home || projects.length > 0 || readTutorial().seen
  byId('dashboard').hidden = !listVisible
  if (!listVisible) stopProjectPreviews()
  byId('hub-hero').hidden = !home
  byId('home-title').hidden = true
  byId('hub-tutorial').hidden = !home
  byId('home-actions').hidden = !home && !listVisible
  byId('home-sets').hidden = !home
  byId('home-example-heading').hidden = true
  examplePanel.hidden = page !== 'examples'
  examplePanel.classList.toggle('home-examples', home)
  examplePanel.setAttribute('aria-labelledby', home ? 'home-example-title' : 'page-title')
  if (home && exampleGrid.firstElementChild !== featuredExample) exampleGrid.prepend(featuredExample)
  if (!home && exampleGrid.lastElementChild !== featuredExample) exampleGrid.append(featuredExample)
  renderHome(home)
  renderCloudContinue()
  renderHub(home)
  if(!hubSearch||hubSearchLanguage!==language){hubSearch?.dispose();hubSearchLanguage=language;hubSearch=mountHubSearch({language,getProjects:()=>projects,getCloud:()=>cloudAccount.projectState(),openLocal:openProject,openCloud:async(id,owner)=>{try{const item=await cloudAccount.fetchProjectPreview(id,owner);if(item&&cloudAccount.projectState().ownerId===owner)addProject(item.document,null,{ownerId:owner,id:item.id,revision:item.revision})}catch{setStatus('exampleUnavailable')}},goLibrary:q=>{pendingLibraryQuery=q;closeLibrary();if(currentPage()==='library')void openLibrary();else location.hash='#library'},goSets:q=>{pendingSetQuery=q;closeSets();if(currentPage()==='sets')void openSets();else location.hash='#sets'}})}
  libraryRoot.hidden = page !== 'library'
  byId('sets-panel').hidden = page !== 'sets'
  byId('account-panel').hidden = page !== 'account'
  const storeRoot=byId('store-panel');storeRoot.hidden=page!=='store'
  if(page==='store'){if(storeSession?.language!==language){storeSession?.controller.abort();const controller=new AbortController();storeSession={controller,language};mountStore(storeRoot,{language,signal:controller.signal})}}else{storeSession?.controller.abort();storeSession=null;storeRoot.replaceChildren()}
  cloudAccount.update(language, page === 'account')
  byId('community-panel').hidden=page!=='community'
  if(page==='community')openCommunity()
  else closeCommunity()
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

function renderCloudContinue(){
 const root=byId('hub-cloud-continue'),cta=byId('hub-account-cta'),state=cloudAccount.projectState()
 const visible=currentPage()==='home'
 cta.hidden=!visible||!state.checked||state.signedIn
 root.hidden=!visible||projects.length>0||!state.signedIn||!state.remote.length
 root.replaceChildren()
 if(root.hidden)return
 const latest=[...state.remote].sort((a,b)=>Date.parse(b.updatedAt)-Date.parse(a.updatedAt))[0]
 const detail=element('div','hub-cloud-detail'),action=button('workspace-action primary',strings().continueBuild)
 detail.append(element('p','home-feature-label',strings().hubCloudLatest),element('h2',null,latest.name))
 action.onclick=async()=>{action.disabled=true;try{const item=await cloudAccount.fetchProjectPreview(latest.id,state.ownerId);if(item&&currentPage()==='home'&&cloudAccount.projectState().ownerId===state.ownerId)addProject(item.document,null,{ownerId:state.ownerId,id:item.id,revision:item.revision})}catch{setStatus('exampleUnavailable')}finally{action.disabled=false}}
 root.append(detail,action)
}
function renderHub(visible){
 const root=byId('home-hub');root.hidden=!visible
 if(!visible){hubSession?.controller.abort();hubSession=null;return}
 if(hubSession?.language===language)return
 hubSession?.controller.abort()
 const controller=new AbortController();hubSession={language,controller}
 void mountHomeHub(root,{language,signal:controller.signal}).catch(()=>{if(!controller.signal.aborted)root.textContent=language==='ru'?'Не удалось загрузить главную.':'Could not load home.'})
}
function closeCommunity(){communitySession?.controller.abort();communitySession=null;byId('community-panel').replaceChildren()}
async function openCommunity(){
 const route=location.hash.slice(1),key=language+':'+route
 if(communitySession?.key===key)return
 closeCommunity()
 const controller=new AbortController();communitySession={key,controller}
 const root=byId('community-panel');root.textContent=strings().loadingLibrary
 try{const {mountCommunity}=await import('./community-gallery.js?v=welcome-2');if(!controller.signal.aborted)await mountCommunity(root,{language,route,signal:controller.signal,openCopy:doc=>addProject(doc)})}
 catch(e){if(!controller.signal.aborted)root.textContent=language==='ru'?'Не удалось открыть сообщество.':'Could not open community.'}
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
    const { mountSetCatalog } = await import('../sets/catalog.js?v=welcome-2')
    if (controller.signal.aborted) return
    let initialQuery=pendingSetQuery;pendingSetQuery=''
    try{const target=sessionStorage.getItem('bricklab-instruction-return');if(/^\d{3,7}-\d{1,2}$/.test(target??'')){initialQuery=target;sessionStorage.removeItem('bricklab-instruction-return')}}catch{}
    await mountSetCatalog(root, { language, signal: controller.signal, initialQuery, projects: () => projects,
      resume: openProject,
      practice:()=>beginTutorial('quick'),
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
      import('../editor/library.js?v=catalog-engine-1'),
      import('../editor/parts-data.js?v=system-complete'),
    ])
    if (controller.signal.aborted) return
    librarySearch.placeholder = labels.search
    librarySearch.setAttribute('aria-label', labels.search)
    session.view = mountLibrary(libraryRoot, {
      sections, models: parts, language: session.language, labels, initialSection: librarySection, initialGroup: libraryGroup, signal: controller.signal,
    })
    if(pendingLibraryQuery){librarySearch.value=pendingLibraryQuery;pendingLibraryQuery='';librarySearch.dispatchEvent(new Event('input'))}
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
    const { mountEditor } = await import('../editor/editor.js?v=commerce-plus-2')
    if (controller.signal.aborted) return
    phase = 'startEditorError'
    await mountEditor(editorRoot, {
      document: project.document, projectId: project.id, language, signal: controller.signal,
      download: downloadProject,
      async publish(document,capture) {
        if(controller.signal.aborted)return
        const record=projects.find(item=>item.id===project.id)
        if(!record)return
        const {openPublishDialog}=await import('./publish-dialog.js?v=community-options-1')
        if(controller.signal.aborted)return
        await openPublishDialog({record:{...record,document},language,signal:controller.signal,linkLocal:linkCloudProject,capture,onPublished:()=>{void cloudAccount.refreshProjects()}})
      },
      // An initial deep link uses the main loader and still waits for the first instruction page.
      reportLoad: guidedSet ? transition?.report ?? (() => {}) : undefined,
      save(document) {
        if (controller.signal.aborted) return false
        const record = makeRecord(document, project.id)
        const latest = storageWarning ? projects : readProjects()
        const existing = latest.find(item => item.id === project.id)
        if (existing?.cloud) record.cloud = existing.cloud
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

function syncSettingsControls() {
  for (const input of settingsDialog.querySelectorAll('[data-pref]')) {
    const value = readPreference(input.dataset.pref)
    if (input.type === 'checkbox') input.checked = value === 'on'
    else input.value = value
  }
}

function settingsNotice(key) {
  const status = byId('settings-status')
  status.hidden = !key
  status.textContent = key ? strings()[key] : ''
}

function refreshSettingsPreviews() {
  if (currentPage() === 'home') renderHome(true)
  if (currentPage() === 'projects' || location.hash==='#account/projects'&&!dashboard.hidden) renderList()
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
byId('project-cloud-refresh').addEventListener('click',()=>cloudAccount.refreshProjects())
libraryRetry.addEventListener('click', () => location.reload())
byId('language').addEventListener('change', event => setLanguage(event.target.value))
byId('settings-language').addEventListener('change', event => setLanguage(event.target.value))
const bugReport = mountBugReport({ getLanguage: () => language, diagnostics: sessionDiagnostics, version: new URL(import.meta.url).searchParams.get('v') ?? 'dev' })
byId('bug-report-button').addEventListener('click', () => bugReport.open())
byId('settings-button').addEventListener('click', () => {
  syncSettingsControls()
  settingsNotice(null)
  settingsDialog.showModal()
})
for (const input of settingsDialog.querySelectorAll('[data-pref]')) {
  input.addEventListener('change', () => {
    const name = input.dataset.pref
    const value = input.type === 'checkbox' ? input.checked ? 'on' : 'off' : input.value
    if (!writePreference(name, value)) {
      syncSettingsControls()
      settingsNotice('settingsSaveError')
      return
    }
    settingsNotice(null)
    if (name === 'previews') refreshSettingsPreviews()
  })
}
byId('settings-tutorial').addEventListener('click', () => {
  settingsDialog.close()
  tutorialPicker.showModal()
})
byId('hub-tutorial').addEventListener('click',()=>tutorialPicker.showModal())
byId('hub-search-button').addEventListener('click',()=>hubSearch?.open())
document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'&&!shell.hidden&&!document.querySelector('dialog[open]')){event.preventDefault();hubSearch?.open()}})
byId('tutorial-offer-start').addEventListener('click', () => tutorialPicker.showModal())
byId('tutorial-offer-later').addEventListener('click', () => {
  dismissTutorialOffer()
  byId('tutorial-offer').hidden = true
})
for (const choice of tutorialPicker.querySelectorAll('[data-tutorial-mode]')) {
  choice.addEventListener('click', async () => {
    for (const control of tutorialPicker.querySelectorAll('[data-tutorial-mode]')) control.disabled = true
    try { await beginTutorial(choice.dataset.tutorialMode) }
    finally {
      for (const control of tutorialPicker.querySelectorAll('[data-tutorial-mode]')) control.disabled = false
    }
  })
}
document.addEventListener('bricklab-tutorial-next', event => {
  const mode = event.detail?.mode
  if (['first', 'mechanics'].includes(mode)) void beginTutorial(mode)
})
byId('settings-reset').addEventListener('click', () => {
  if (!resetPreferences()) {
    settingsNotice('settingsResetError')
    return
  }
  language = 'ru'
  render()
  syncSettingsControls()
  settingsNotice('settingsResetDone')
})
byId('settings-clear-previews').addEventListener('click', async event => {
  const control = event.currentTarget
  control.disabled = true
  try {
    if (!globalThis.caches) throw Error('Cache Storage unavailable')
    await Promise.all(['bricklab-project-previews-v1', 'bricklab-project-previews-v2'].map(name => caches.delete(name)))
    refreshSettingsPreviews()
    settingsNotice('settingsCacheCleared')
  } catch {
    settingsNotice('settingsCacheError')
  } finally {
    control.disabled = false
  }
})
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
    import('./home-previews.js?v=project-shadows').then(({ removeHomePreview }) => removeHomePreview(id)).catch(() => {})
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
  notificationPopover.close()
  query.value = ''
  if (['library','account'].includes(currentPage()) || ['#library','#account'].includes(new URL(event.oldURL).hash)) window.scrollTo(0, 0)
  render()
  if(currentPage()==='projects')void cloudAccount.refreshProjects()
})
window.addEventListener('focus',()=>{if(!document.hidden&&currentPage()!=='project'&&currentPage()!=='account')void cloudAccount.refreshNotifications()})
window.addEventListener('storage', event => {
  if (event.key === 'bricklab.projects.v1' || event.key === null) {
    projects = readProjects()
    render()
  }
})
startStartup(startupRoot, language, [shell, editorRoot], () => render(true))
