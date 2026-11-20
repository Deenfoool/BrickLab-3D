import { node, control, setStrings } from './catalog.js?v=inline-pdf-instructions'
import { safeBook, validateSet } from './data.js?v=auto-pdf'
import {
  discoverBooks,
  instructionPagePreview,
  instructionSources,
} from './instruction-sources.js?v=inline-pdf-instructions'
import { addInstructionParts, instructionPartRegions } from './instruction-parts.js?v=guided-transition'
import { createInstructionPdfReader } from './instruction-pdf.js'

const maxUnknownPages = 5000
const pageWait = 6000
const personalPdfs = new Map()

export function prepareInstructionPage(progress) {
  const entry = progress?.set.books[progress.book]
  if (!entry) return null
  const display = instructionPagePreview(progress.set.number, entry.url, progress.page)
  if (!display?.image) return null
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
        set.books[book] ? (set.books[book].pages ?? maxUnknownPages) : 1,
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
  { language, signal, change, findPart, describePart, firstPage },
) {
  let progress = instructionState(initial)
  if (!progress) return null
  const t = setStrings(language),
    ru = language === 'ru'
  const pdf = createInstructionPdfReader()
  const localPageCounts = new Map()
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
  const frame = node('iframe')
  frame.title = ru ? 'Страница инструкции LEGO' : 'LEGO instructions page'
  frame.referrerPolicy = 'no-referrer'
  const preview = node('div', undefined, 'instruction-preview')
  const previewStatus = node('p')
  previewStatus.setAttribute('role', 'status')
  const file = node('input')
  file.type = 'file'
  file.accept = '.pdf,application/pdf'
  file.hidden = true
  const pdfLabel = ru ? 'Выбрать PDF' : 'Choose PDF'
  const choosePdf = control(pdfLabel, () => file.click(), signal)
  const fallback = control(pdfLabel, () => file.click(), signal)
  const retryPage = control(ru ? 'Повторить' : 'Retry', () => renderPreview(progress.set.books[progress.book]), signal)
  const recovery = node('div', undefined, 'instruction-actions')
  recovery.append(retryPage, fallback)
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
  body.append(actions, status, retry, previewStatus, recovery, file, preview, frame)
  panel.append(header, body)
  layer.append(panel)
  function setMoreOpen(open) {
    actions.hidden = !open
    more.setAttribute('aria-expanded', String(open))
  }
  function render() {
    setMoreOpen(false)
    const entry = progress.set.books[progress.book]
    tools.hidden = !entry
    book.hidden = progress.set.books.length < 2
    choosePdf.hidden = !entry
    credit.hidden = true
    status.hidden = Boolean(entry)
    retry.hidden = true
    if (entry) {
      book.replaceChildren(...progress.set.books.map((volume, i) => new Option(volume.title, String(i))))
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
    recovery.hidden = true
    frame.hidden = true
    frame.removeAttribute('src')
    const prepared = firstPage
    firstPage = null
    if (!entry) return
    const display = instructionPagePreview(progress.set.number, entry.url, progress.page)
    const creditUrl = display?.source ?? instructionSources[entry?.source]
    if (creditUrl) {
      credit.hidden = false
      credit.textContent = display?.source ? 'BrickInstructions' : entry.source
    }
    previewStatus.hidden = false
    previewStatus.textContent = ru ? 'Загружаем страницу…' : 'Loading page…'
    const pageNumber = progress.page
    const pageLabel = number => ru ? `Страница ${number} инструкции` : `Instruction page ${number}`
    const local = personalPdfs.get(entry.url)
    if (!local && display?.image) {
      pdf.close()
      const { image, decoded, regions } = prepared ?? prepareInstructionPage(progress)
      const ready = await decoded
      if (signal.aborted) return
      if (ready) {
        image.alt = pageLabel(pageNumber)
        preview.append(image)
        showPage(image.naturalWidth / image.naturalHeight, regions, signal)
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
    const canvas = node('canvas')
    canvas.setAttribute('role', 'img')
    try {
      const { pages, pageNumber: shown } = await pdf.render(local ?? entry.url, pageNumber, canvas, signal)
      if (signal.aborted) return
      const books = local || pages === entry.pages ? progress.set.books
        : progress.set.books.map((volume, index) => index === progress.book ? { ...volume, pages } : volume)
      if (local) localPageCounts.set(entry.url, pages)
      if (books !== progress.set.books || shown !== pageNumber) {
        progress = { ...progress, page: shown, set: { ...progress.set, books } }
        change(progress)
      }
      renderNavigation(books[progress.book])
      canvas.setAttribute('aria-label', pageLabel(shown))
      preview.append(canvas)
      const regions = !local && display?.pdfId
        ? instructionPartRegions(progress.set.number, display.pdfId, shown).catch(() => [])
        : null
      showPage(canvas.width / canvas.height, regions, signal)
    } catch {
      if (signal.aborted) return
      if (local) {
        personalPdfs.delete(entry.url)
        localPageCounts.delete(entry.url)
        renderNavigation(entry)
      }
      if (!local && display?.frame) {
        frame.src = display.frame
        frame.hidden = false
        previewStatus.hidden = true
        return
      }
      previewStatus.textContent = ru
        ? 'Страница недоступна. Можно выбрать PDF с устройства и открыть его здесь.'
        : 'Page unavailable. Choose a PDF from your device to open it here.'
      recovery.hidden = false
    }
  }
  function showPage(ratio, regions, signal) {
    preview.style.setProperty('--page-ratio', ratio)
    preview.hidden = false
    previewStatus.hidden = true
    if (findPart && regions) regions.then(parts => {
      if (!signal.aborted) addInstructionParts(preview, parts, { language, describe: describePart, find: findPart })
    })
  }
  async function lookupBooks() {
    if (progress.set.books.length) return
    status.textContent = t.findingBooks
    retry.hidden = true
    try {
      const books = await discoverBooks(progress.set.number, signal)
      if (signal.aborted || progress.set.books.length) return
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
      if (signal.aborted || progress.set.books.length) return
      status.textContent = t.booksUnavailable
      retry.hidden = false
    }
  }
  function turn(value) {
    const entry = progress.set.books[progress.book]
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
    const entry = progress.set.books[progress.book]
    const selected = file.files[0]
    file.value = ''
    if (!entry || !selected) return
    personalPdfs.set(entry.url, selected)
    localPageCounts.delete(entry.url)
    setMoreOpen(false)
    renderPreview(entry)
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
      frame.src = 'about:blank'
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
