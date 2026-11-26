import {instructionEvent} from './instruction-events.js'
import {mountInstructionOffer} from './instruction-offer.js?v=welcome-1'
import { node, control, setStrings } from './catalog.js?v=browser-recognition'
import { safeBook, validateSet } from './data.js?v=browser-recognition'
import {
  discoverBooks,
  instructionPagePreview,
  instructionSources,
} from './instruction-sources.js?v=browser-recognition'
import { addInstructionParts, instructionPartRegions } from './instruction-parts.js?v=commerce-regions-1'
import { canonicalInstructionUrl } from './instruction-url.js'
import { createInstructionPdfReader } from './instruction-pdf.js?v=same-origin-pdf'

const maxUnknownPages = 5000
const pageWait = 6000
const personalPdfs = new Map()
const localBookKey = set => `local:${set.number}`

export function prepareInstructionPage(progress, signal, reader) {
  const entry = progress?.set.books[progress.book]
  if (!progress) return null
  const local = personalPdfs.get(entry?.url ?? localBookKey(progress.set))
  const display = entry && instructionPagePreview(progress.set.number, entry.url, progress.page)
  if (local || !display?.image) {
    const source = local ?? entry?.url
    if (!reader || !signal || !source) return null
    const canvas = node('canvas')
    const result = reader.render(source, progress.page, canvas, signal).then(
      value => ({ value }), error => ({ error }),
    )
    return { canvas, result, source, page: progress.page, decoded: result.then(({ value }) => Boolean(value)) }
  }
  const image = new Image()
  image.src = display.image
  const decoded = image.decode().then(() => true, () => false)
  const regions = instructionPartRegions(progress.set.number, display.pdfId, progress.page)
    .catch(() => []) // Image viewing remains available if annotations fail to load.
  return { image, decoded, regions }
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
    Promise.all([prepared.decoded, prepared.regions]).then(([ready]) => finish(ready))
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
  { language, signal, change, findPart, describePart, firstPage, pdf = createInstructionPdfReader() },
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
  body.append(actions, status, retry, previewStatus, recovery, file, preview, recognitionStatus, unlock)
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
    preview.replaceChildren()
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
    const creditUrl = display?.source ?? instructionSources[entry?.source]
    if (creditUrl) {
      credit.hidden = false
      credit.textContent = display?.source ? 'BrickInstructions' : entry.source
    }
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
        if(response.ok){const policy=await response.json();interactive=policy.interactive===true;serverOnly=policy.supported===true;locked=policy.mode==='release'&&policy.supported===true&&!interactive}
      }catch{/* The original PDF is still available. Retry restores overlays when the API recovers. */}
    }
    if(signal.aborted)return
    if(!interactive){unlock.hidden=!locked;recognitionStatus.textContent=ru?'Интерактивность недоступна. PDF и ручной поиск остаются доступны.':'Interactive access unavailable. PDF and manual search remain available.';recognitionStatus.hidden=false}
    const pageLabel = number => ru ? `Страница ${number} инструкции` : `Instruction page ${number}`
    if (!local && display?.image) {
      const { image, decoded, regions } = prepared?.image ? prepared : prepareInstructionPage(progress)
      const ready = await decoded
      if (signal.aborted) return
      if (ready) {
        image.alt = pageLabel(pageNumber)
        preview.append(image)
        showPage(image.naturalWidth / image.naturalHeight, interactive && findPart &&
          (serverOnly?instructionPartRegions(progress.set.number,privatePdfId,pageNumber).catch(()=>[]):resolvePdfRegions(display.pdfId, source, pageNumber, entry.pages, null, signal, regions)), signal)
        if (entry.pages && pageNumber < entry.pages && !navigator.connection?.saveData) {
          const following = instructionPagePreview(progress.set.number, entry.url, pageNumber + 1)
          if (following?.image) {
            const ahead = new Image()
            ahead.fetchPriority = 'low'
            ahead.src = following.image
          }
        }
        return
      }
    }
    const warm = prepared?.result && prepared.source === source && prepared.page === pageNumber
    const canvas = warm ? prepared.canvas : node('canvas')
    canvas.setAttribute('role', 'img')
    try {
      const { value, error } = warm ? await prepared.result : { value: await pdf.render(source, pageNumber, canvas, signal) }
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
      const regions = interactive && findPart && (serverOnly?instructionPartRegions(progress.set.number,privatePdfId,shown).catch(()=>[]):resolvePdfRegions(local ? null : display?.pdfId, source, shown, pages, canvas, signal))
      showPage(canvas.width / canvas.height, regions, signal)
    } catch {
      if (signal.aborted) return
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
    if (ready.length) addInstructionParts(preview, ready, { language, describe: describePart, find: (...args)=>{instructionEvent(progress.set.number,'hint_use');return findPart(...args)} })
    recognitionStatus.textContent = ru ? 'Распознаём детали…' : 'Recognizing parts…'
    recognitionStatus.hidden = false
    try {
      recognition ??= import('./instruction-recognition.js?v=instruction-artwork-v3').then(module => {
        recognitionEngine = module.createInstructionRecognition(pdf, progress.set, signal)
        return recognitionEngine
      })
      const engine = await recognition
      const detected = await engine.pageRegions(source, page, pages, canvas, request)
      return detected.filter(([x, y, w, h]) => !ready.some(([a, b, aw, ah]) =>
        Math.min(x + w, a + aw) - Math.max(x, a) > .5 * Math.min(w, aw) &&
        Math.min(y + h, b + ah) - Math.max(y, b) > .5 * Math.min(h, ah)))
    } catch {
      return []
    } finally {
      if (!request.aborted) recognitionStatus.hidden = true
    }
  }
  function showPage(ratio, regions, signal) {
    preview.style.setProperty('--page-ratio', ratio)
    preview.hidden = false
    previewStatus.hidden = true
    if (findPart && regions) regions.then(parts => {
      if (!signal.aborted) addInstructionParts(preview, parts, { language, describe: describePart, find: (...args)=>{instructionEvent(progress.set.number,'hint_use');return findPart(...args)} })
    })
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
  }
}
