import {boundedTask} from './instruction-task.js?v=recognition-v9-polish'
import {reconcileCallouts} from './instruction-study.js?v=recognition-v9'
import {createPageStudy} from './instruction-study-ui.js?v=recognition-v9-polish'
import {instructionEvent} from './instruction-events.js'
import {mountInstructionOffer} from './instruction-offer.js?v=welcome-1'
import { node, control, setStrings } from './catalog.js?v=ducati-instructions-1'
import { safeBook, validateSet } from './data.js?v=ducati-instructions-1'
import {
  discoverBooks,
  instructionPagePreview,
  instructionSources,
} from './instruction-sources.js?v=ducati-instructions-1'
import { addInstructionParts, instructionPartRegions, resetInstructionParts } from './instruction-parts.js?v=recognition-v9-polish'
import { canonicalInstructionUrl } from './instruction-url.js'
import { createInstructionPdfReader } from './instruction-pdf.js?v=recognition-v9'

const maxUnknownPages = 5000
const pageWait = 6000
const personalPdfs = new Map()
const localBookKey = set => `local:${set.number}`

export function prepareInstructionPage(progress, signal, reader) {
  const entry = progress?.set?.books?.[progress.book]
  if (!progress) return null
  const local = personalPdfs.get(entry?.url ?? localBookKey(progress.set))
  const display = entry && instructionPagePreview(progress.set.number, entry.url, progress.page)
  if (local || !display?.image || (reader&&signal&&canonicalInstructionUrl(entry?.url))) {
    const source = local ?? entry?.url
    if (!reader || !signal || !source) return null
    const canvas = node('canvas')
    const controller=new AbortController(),request=AbortSignal.any([signal,controller.signal,AbortSignal.timeout(18000)])
    const result=boundedTask(reader.render(source,progress.page,canvas,request),request,18000).then(value=>({value}),error=>({error}))
    return {canvas,result,source,page:progress.page,decoded:result.then(({value})=>Boolean(value)),cancel:()=>controller.abort()}
  }
  const image = new Image()
  image.src = display.image
  const decoded = image.decode().then(() => true, () => false)
  const regions = instructionPartRegions(progress.set.number, display.pdfId, progress.page)
    .catch(() => []) // Image viewing remains available if annotations fail to load.
  return { image, decoded, regions, source:entry.url, page:progress.page }
}

export async function waitForInstruction(prepared, signal) {
  if (signal.aborted || !prepared) return false
  return new Promise(resolve => {
    const timer = setTimeout(() => finish(false), pageWait)
    function finish(ready) {
      clearTimeout(timer)
      signal.removeEventListener('abort', cancel)
      resolve(ready)
    }
    function cancel() { finish(false) }
    signal.addEventListener('abort', cancel, { once: true })
    Promise.all([prepared.decoded, prepared.regions]).then(([ready]) => finish(ready),()=>finish(false))
  })
}

export function instructionState(value) {
  if (!value?.set) return null
  try {
    const set = validateSet(value.set)
    const book = Math.max(
      0,
      Math.min(set.books.length - 1, Math.trunc(Number(value.book)) || 0),
    )
    const page = Math.max(
      1,
      Math.min(
        personalPdfs.has(set.books[book]?.url ?? localBookKey(set))
          ? maxUnknownPages : set.books[book]?.pages ?? (set.books.length ? maxUnknownPages : 1),
        Math.trunc(Number(value.page)) || 1,
      ),
    )
    return { set, book, page }
  } catch {
    return null
  }
}
export function mountInstructions(
  layer,
  initial,
  { language, signal, change, findPart, describePart, readInventoryUsage, firstPage, pdf = createInstructionPdfReader() },
) {
  let progress = instructionState(initial)
  if (!progress) return null
  const t = setStrings(language),
    ru = language === 'ru'
  const localPageCounts = new Map()
  const localOnly = { url: localBookKey(progress.set), pages: null }
  const currentEntry = () => progress.set.books[progress.book] ?? (personalPdfs.has(localOnly.url) ? localOnly : null)
  let recognition
  let recognitionEngine
  let recognitionSource
  let previewRequest
  const panel = node('aside', undefined, 'editor-panel instruction-panel')
  panel.dataset.panel = 'instruction'
  panel.setAttribute('aria-labelledby', 'editor-instruction-heading')
  const header = node('header', undefined, 'editor-panel-header')
  const title = node('h2')
  title.id = 'editor-instruction-heading'
  title.append(node('span', ru ? 'Инструкция' : 'Instructions'))
  title.setAttribute('data-panel-grip', '')
  title.tabIndex = 0
  const toggle = node('button')
  toggle.type = 'button'
  toggle.setAttribute('data-panel-toggle', '')
  const body = node('div', undefined, 'editor-panel-body')
  const tools = node('div', undefined, 'instruction-tools')
  const book = node('select')
  book.setAttribute('aria-label', ru ? 'Книга' : 'Book')
  const page = node('input')
  page.type = 'number'
  page.min = '1'
  page.setAttribute('aria-label', ru ? 'Страница' : 'Page')
  const total = node('span'),
    previous = control('←', () => turn(progress.page - 1), signal),
    next = control('→', () => turn(progress.page + 1), signal)
  previous.setAttribute(
    'aria-label',
    ru ? 'Предыдущая страница' : 'Previous page',
  )
  next.setAttribute('aria-label', ru ? 'Следующая страница' : 'Next page')
  tools.append(book, previous, page, total, next)
  const more = control('⋯', () => setMoreOpen(actions.hidden), signal)
  more.className = 'instruction-more-toggle'
  more.title = ru ? 'Действия с инструкцией' : 'Instruction actions'
  more.setAttribute('aria-label', more.title)
  more.setAttribute('aria-controls', 'editor-instruction-actions')
  header.append(title, tools, more, toggle)
  const actions = node('div', undefined, 'instruction-actions')
  actions.id = 'editor-instruction-actions'
  const preview = node('div', undefined, 'instruction-preview')
  const find=(...args)=>{instructionEvent(progress.set.number,'hint_use');return findPart?.(...args)}
  const study=createPageStudy({preview,inventory:progress.set.inventory,language,find,describe:describePart,readUsage:readInventoryUsage,onRegions:regions=>addInstructionParts(preview,regions,{language,describe:describePart,find,replace:true})})
  const previewStatus = node('p')
  previewStatus.setAttribute('role', 'status')
  const recognitionStatus = node('p', undefined, 'instruction-recognition-status')
  recognitionStatus.setAttribute('role', 'status')
  recognitionStatus.hidden = true
  const unlock=control(ru?'Открыть интерактивность':'Unlock hints',()=>{
    const dialog=node('dialog',undefined,'set-dialog set-details-dialog'),offer=node('section',undefined,'set-instruction-offer')
    const close=control(ru?'Вернуться к сборке':'Back to build',()=>dialog.close(),signal)
    const own=new AbortController(),request=AbortSignal.any([signal,own.signal])
    dialog.append(node('h2',progress.set.name),node('p',ru?'Перед переходом к оплате сохрани текущую сборку.':'Save your current build before going to checkout.'),offer,close)
    dialog.addEventListener('close',()=>{own.abort();dialog.remove();if(!signal.aborted)renderPreview(currentEntry())},{once:true})
    request.addEventListener('abort',()=>{if(dialog.open)dialog.close();dialog.remove()},{once:true})
    document.body.append(dialog);dialog.showModal()
    const start=node('button')
    void mountInstructionOffer(offer,{set:progress.set,language,signal:request,onStart:()=>dialog.close(),start})
  },signal)
  unlock.hidden=true
  const file = node('input')
  file.type = 'file'
  file.accept = '.pdf,application/pdf'
  file.hidden = true
  const pdfLabel = ru ? 'Выбрать PDF' : 'Choose PDF'
  const choosePdf = control(pdfLabel, () => file.click(), signal)
  const fallback = control(pdfLabel, () => file.click(), signal)
  const retryPage = control(ru ? 'Повторить' : 'Retry', () => renderPreview(currentEntry()), signal)
  const recovery = node('div', undefined, 'instruction-actions')
  const officialPdf = node('a', ru ? 'Открыть оригинал PDF' : 'Open original PDF')
  officialPdf.target = '_blank'
  officialPdf.rel = 'noopener noreferrer'
  officialPdf.hidden = true
  recovery.append(retryPage, fallback, officialPdf)
  const status = node('p')
  status.setAttribute('role', 'status')
  const credit = node('span')
  const retry = control(t.retryBooks, lookupBooks, signal)
  retry.hidden = true
  const add = node('details')
  add.append(node('summary', t.addBook))
  const form = node('form'),
    url = node('input'),
    pages = node('input'),
    error = node('p')
  url.type = 'url'
  url.required = true
  url.placeholder = t.books
  url.setAttribute('aria-label', t.books)
  pages.type = 'number'
  pages.min = '1'
  pages.max = '5000'
  pages.required = true
  pages.placeholder = t.pages
  pages.setAttribute('aria-label', t.pages)
  const submit = node('button', t.addBook, 'secondary')
  submit.type = 'submit'
  form.append(url, pages, submit, error)
  add.append(form)
  form.addEventListener(
    'submit',
    (event) => {
      event.preventDefault()
      const address = safeBook(url.value),
        length = Number(pages.value)
      if (
        !address ||
        !Number.isInteger(length) ||
        length < 1 ||
        length > 5000
      ) {
        error.textContent = t.invalidBook
        return
      }
      const books = [
        ...progress.set.books,
        {
          title: String(progress.set.books.length + 1),
          pages: length,
          url: address,
        },
      ]
      progress = {
        set: { ...progress.set, books },
        book: books.length - 1,
        page: 1,
      }
      error.textContent = ''
      url.value = ''
      pages.value = ''
      add.open = false
      render()
      change(progress)
    },
    { signal },
  )
  actions.append(choosePdf, credit, add)
  body.append(actions, status, retry, previewStatus, recovery, file, preview, recognitionStatus, study.root, unlock)
  panel.append(header, body)
  layer.append(panel)
  function setMoreOpen(open) {
    actions.hidden = !open
    more.setAttribute('aria-expanded', String(open))
  }
  function render() {
    setMoreOpen(false)
    const entry = currentEntry()
    tools.hidden = !entry
    book.hidden = progress.set.books.length < 2
    credit.hidden = true
    status.hidden = Boolean(entry)
    retry.hidden = true
    if (entry) {
      if (progress.set.books.length) book.replaceChildren(...progress.set.books.map((volume, i) => new Option(volume.title, String(i))))
      book.value = String(progress.book)
      renderNavigation(entry)
    }
    renderPreview(entry)
  }
  function renderNavigation(entry) {
    const pages = localPageCounts.get(entry.url) ?? entry.pages
    page.value = String(progress.page)
    page.max = String(pages ?? maxUnknownPages)
    total.textContent = pages ? `/ ${pages}` : ''
    previous.disabled = progress.page <= 1
    next.disabled = progress.page >= (pages ?? maxUnknownPages)
  }
  async function renderPreview(entry) {
    previewRequest?.abort()
    previewRequest = new AbortController()
    const signal = previewRequest.signal
    resetInstructionParts(preview)
    preview.replaceChildren()
    study.reset(signal)
    preview.hidden = true
    previewStatus.hidden = true
    recognitionStatus.hidden = true
    unlock.hidden=true
    recovery.hidden = true
    retryPage.hidden = false
    officialPdf.hidden = true
    const prepared = firstPage
    firstPage = null
    const local = personalPdfs.get(entry?.url)
    const source = local ?? entry?.url
    if (source !== recognitionSource) {
      recognitionSource = source
      recognitionEngine?.closeBook(source)
    }
    if (!entry) {
      pdf.close()
      return
    }
    const display = instructionPagePreview(progress.set.number, entry.url, progress.page)
    credit.hidden=true
    if(entry.source&&instructionSources[entry.source]){credit.hidden=false;credit.textContent=entry.source}
    previewStatus.hidden = false
    previewStatus.textContent = ru ? 'Загружаем страницу…' : 'Loading page…'
    const pageNumber = progress.page
    // Access is checked only for canonical remote books. User PDFs and OBT remain free.
    let interactive=true,serverOnly=false,locked=false
    const canonicalBook=canonicalInstructionUrl(entry.url)
    const privatePdfId=canonicalBook?new URL(canonicalBook).pathname.match(/\/(\d+)\.pdf$/)?.[1]:null
    if(!local&&canonicalBook&&findPart){
      // Never fall back to client recognition when a remote policy check fails.
      interactive=false
      try{
        const query=new URLSearchParams({set:progress.set.number,book:entry.url,page:String(pageNumber)})
        const response=await fetch('/api/commerce/instruction-access?'+query,{signal:AbortSignal.any([signal,AbortSignal.timeout(3000)]),credentials:'same-origin',cache:'no-store'})
        if(response.ok){const policy=await response.json();interactive=policy.interactive===true;serverOnly=policy.supported===true;locked=policy.mode==='release'&&!interactive}
      }catch{/* The original PDF is still available. Retry restores overlays when the API recovers. */}
    }
    if(signal.aborted)return
    if(!interactive){unlock.hidden=!locked;recognitionStatus.textContent=ru?'Интерактивность недоступна. PDF и ручной поиск остаются доступны.':'Interactive access unavailable. PDF and manual search remain available.';recognitionStatus.hidden=false}
    const pageLabel = number => ru ? `Страница ${number} инструкции` : `Instruction page ${number}`
    async function showIndexedPreview(){
      if(local||!display?.image||signal.aborted)return false
      const fallback=prepared?.image&&prepared.source===source&&prepared.page===pageNumber?prepared:prepareInstructionPage(progress)
      if(!fallback?.image)return false
      let ready=false
      try{ready=await boundedTask(fallback.decoded,signal,8000)}catch{}
      if(signal.aborted||!ready)return false
      const image=fallback.image
      image.alt=pageLabel(pageNumber)
      preview.append(image)
      credit.hidden=false;credit.textContent='BrickInstructions'
      // The alternate artwork is a viewing fallback, not proof of matching crop or edition.
      // Keep overlays tied to the exact original PDF coordinate system.
      showPage(image.naturalWidth/image.naturalHeight,false,signal)
      if(interactive&&findPart){
        recognitionStatus.textContent=ru?'Оригинальный PDF недоступен. Резервное изображение без подсказок.':'Original PDF unavailable. Preview image without hints.'
        recognitionStatus.hidden=false
      }
      return true
    }
    if(!canonicalBook&&await showIndexedPreview())return
    const warm = prepared?.result && prepared.source === source && prepared.page === pageNumber
    if(!warm)prepared?.cancel?.()
    else signal.addEventListener('abort',prepared.cancel,{once:true})
    const renderSignal=AbortSignal.any([signal,AbortSignal.timeout(18000)])
    const canvas = warm ? prepared.canvas : node('canvas')
    canvas.setAttribute('role', 'img')
    try {
      const {value,error}=warm?await boundedTask(prepared.result,renderSignal,18000):{value:await boundedTask(pdf.render(source,pageNumber,canvas,renderSignal),renderSignal,18000)}
      if (error) throw error
      const { pages, pageNumber: shown } = value
      if (signal.aborted) return
      const books = local || pages === entry.pages ? progress.set.books
        : progress.set.books.map((volume, index) => index === progress.book ? { ...volume, pages } : volume)
      if (local) localPageCounts.set(entry.url, pages)
      if (books !== progress.set.books || shown !== pageNumber) {
        progress = { ...progress, page: shown, set: { ...progress.set, books } }
        change(progress)
      }
      renderNavigation(books[progress.book] ?? entry)
      canvas.setAttribute('aria-label', pageLabel(shown))
      preview.append(canvas)
      const regions = interactive && findPart && (serverOnly?instructionPartRegions(progress.set.number,privatePdfId,shown).catch(()=>[]):resolvePdfRegions(local ? null : privatePdfId, source, shown, pages, canvas, signal))
      showPage(canvas.width / canvas.height, regions, signal)
    } catch {
      if (signal.aborted) return
      prepared?.cancel?.()
      pdf.close()
      if(await showIndexedPreview())return
      if(signal.aborted)return
      if (local) {
        personalPdfs.delete(entry.url)
        localPageCounts.delete(entry.url)
        if (entry === localOnly) tools.hidden = true
        else renderNavigation(entry)
      }
      if (!local) { officialPdf.href = source; officialPdf.hidden = false }
      previewStatus.textContent = ru
        ? 'Страница недоступна. Можно выбрать PDF с устройства и открыть его здесь.'
        : 'Page unavailable. Choose a PDF from your device to open it here.'
      recovery.hidden = false
    }
  }
  async function resolvePdfRegions(pdfId, source, page, pages, canvas, request, preparedRegions) {
    const ready = preparedRegions ? await preparedRegions : pdfId
      ? await instructionPartRegions(progress.set.number, pdfId, page).catch(() => [])
      : []
    if (request.aborted) return []
    if(ready.length)study.update(ready)
    recognitionStatus.textContent = ru ? 'Распознаём детали…' : 'Recognizing parts…'
    recognitionStatus.hidden = false
    try {
      recognition ??= import('./instruction-recognition.js?v=recognition-v9-polish').then(module => {
        recognitionEngine = module.createInstructionRecognition(pdf, progress.set, signal)
        return recognitionEngine
      })
      const engine = await recognition
      const additional=detected=>detected.filter(([x, y, w, h]) => !ready.some(([a, b, aw, ah]) =>
        Math.min(x + w, a + aw) - Math.max(x, a) > .5 * Math.min(w, aw) &&
        Math.min(y + h, b + ah) - Math.max(y, b) > .5 * Math.min(h, ah)))
      let detectedCount=0
      const detected=await engine.pageRegions(source,page,pages,canvas,request,({stage,regions,total,callouts,scope})=>{
        detectedCount=total
        if(request.aborted)return
        const found=additional(regions)
        study.update(found,{callouts:reconcileCallouts(callouts??[],ready),scope})
        recognitionStatus.textContent=(stage==='models'?(ru?'Сравниваем с 3D-библиотекой':'Comparing with 3D library'):(ru?'Сверяем с описью':'Checking inventory'))+' · '+regions.length+'/'+total
      })
      const extra=additional(detected)
      if(!request.aborted&&!ready.length&&!extra.length){recognitionStatus.textContent=ru?'На этой странице нет уверенно распознанных деталей.':'No confidently recognized parts on this page.';recognitionStatus.hidden=false;return extra}
      if(!request.aborted){
        recognitionStatus.hidden=!(detectedCount>detected.length)
        if(!recognitionStatus.hidden)recognitionStatus.textContent=ru?'Часть деталей не распознана уверенно.':'Some parts could not be confidently recognized.'
      }
      return extra
    } catch {
      if(!request.aborted){recognitionStatus.textContent=ru?'Не удалось завершить распознавание. PDF доступен.':'Recognition could not finish. PDF is available.';recognitionStatus.hidden=false}
      return []
    }
  }
  function showPage(ratio, regions, signal) {
    preview.style.setProperty('--page-ratio', ratio)
    preview.hidden = false
    previewStatus.hidden = true
    if (findPart && regions) regions.then(parts => {
      if(!signal.aborted)study.update(parts,{final:true})
    }).catch(()=>{})
  }
  async function lookupBooks() {
    if (progress.set.books.length) return
    status.textContent = t.findingBooks
    retry.hidden = true
    try {
      const books = await discoverBooks(progress.set.number, signal)
      if (signal.aborted || currentEntry()) return
      if (!books.length) {
        status.textContent = t.noBooks
        return
      }
      progress = instructionState({
        ...progress,
        set: { ...progress.set, books },
      })
      render()
      change(progress)
    } catch {
      if (signal.aborted || currentEntry()) return
      status.textContent = t.booksUnavailable
      retry.hidden = false
    }
  }
  function turn(value) {
    const entry = currentEntry()
    const limit = localPageCounts.get(entry?.url) ?? entry?.pages ?? maxUnknownPages
    progress = {
      ...progress,
      page: Math.max(1, Math.min(limit, Math.trunc(Number(value)) || 1)),
    }
    render()
    change(progress)
  }
  book.addEventListener(
    'change',
    () => {
      progress = { ...progress, book: Number(book.value), page: 1 }
      render()
      change(progress)
    },
    { signal },
  )
  page.addEventListener('change', () => turn(page.value), { signal })
  file.addEventListener('change', () => {
    const entry = currentEntry() ?? localOnly
    const selected = file.files[0]
    file.value = ''
    if (!selected) return
    personalPdfs.set(entry.url, selected)
    localPageCounts.delete(entry.url)
    render()
  }, { signal })
  panel.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || actions.hidden) return
    event.stopPropagation()
    setMoreOpen(false)
    more.focus()
  }, { signal })
  signal.addEventListener(
    'abort',
    () => {
      previewRequest?.abort()
      pdf.close()
      panel.remove()
    },
    { once: true },
  )
  render()
  lookupBooks()
  return {
    get value() {
      return progress
    },
    refreshInventory:()=>study.refresh(),
  }
}
