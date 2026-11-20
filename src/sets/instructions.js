import { node, control, setStrings } from './catalog.js?v=instruction-parts'
import { safeBook, validateSet } from './data.js?v=auto-pdf'
import {
  discoverBooks,
  instructionPagePreview,
  instructionSources,
} from './instruction-sources.js?v=instruction-parts'
import { addInstructionParts, instructionPartRegions } from './instruction-parts.js?v=guided-transition'

const maxUnknownPages = 5000
const pageWait = 6000

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
  const panel = node('aside', undefined, 'editor-panel instruction-panel')
  panel.dataset.panel = 'instruction'
  const header = node('header', undefined, 'editor-panel-header')
  const title = node('h2', ru ? 'Инструкция' : 'Instructions')
  title.setAttribute('data-panel-grip', '')
  title.tabIndex = 0
  const toggle = node('button')
  toggle.type = 'button'
  toggle.setAttribute('data-panel-toggle', '')
  header.append(title, toggle)
  const body = node('div', undefined, 'editor-panel-body')
  const name = node('p', `${progress.set.number} · ${progress.set.name}`)
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
  const frame = node('iframe')
  frame.title = ru ? 'Страница инструкции LEGO' : 'LEGO instructions page'
  frame.referrerPolicy = 'no-referrer'
  const preview = node('div', undefined, 'instruction-preview')
  const previewStatus = node('p')
  previewStatus.setAttribute('role', 'status')
  const external = node(
    'a',
    ru ? 'Открыть PDF отдельно' : 'Open PDF in a new tab',
  )
  external.target = '_blank'
  external.rel = 'noopener'
  const hint = node(
    'small',
    ru
      ? 'Листайте кнопками панели, чтобы сохранить страницу.'
      : 'Use panel buttons to save the current page.',
  )
  const status = node('p')
  status.setAttribute('role', 'status')
  const credit = node('a')
  credit.target = '_blank'
  credit.rel = 'noopener'
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
  body.append(name, status, retry, tools, previewStatus, preview, frame, external, credit, hint, add)
  panel.append(header, body)
  layer.append(panel)
  function render() {
    book.replaceChildren(
      ...progress.set.books.map(
        (entry, i) => new Option(entry.title, String(i)),
      ),
    )
    book.value = String(progress.book)
    page.value = String(progress.page)
    const entry = progress.set.books[progress.book]
    tools.hidden = !entry
    external.hidden = !entry
    hint.hidden = !entry
    credit.hidden = true
    status.hidden = Boolean(entry)
    retry.hidden = true
    if (entry) {
      page.max = String(entry.pages ?? maxUnknownPages)
      total.textContent = entry.pages ? `/ ${entry.pages}` : ''
      previous.disabled = progress.page <= 1
      next.disabled = progress.page >= (entry.pages ?? maxUnknownPages)
      external.href = `${entry.url}#page=${progress.page}&view=FitH`
    }
    renderPreview(entry)
  }
  function renderPreview(entry) {
    preview.replaceChildren()
    preview.hidden = true
    previewStatus.hidden = true
    frame.hidden = true
    const display = entry && instructionPagePreview(progress.set.number, entry.url, progress.page)
    if (display?.frame) {
      frame.hidden = false
      if (frame.src !== display.frame) frame.src = display.frame
    } else if (frame.hasAttribute('src')) frame.removeAttribute('src')
    const creditUrl = display?.source ?? instructionSources[entry?.source]
    if (creditUrl) {
      credit.hidden = false
      credit.href = creditUrl
      credit.textContent = display?.source ? 'BrickInstructions' : entry.source
    }
    if (!entry || display?.frame) return
    previewStatus.hidden = false
    if (!display?.image) {
      previewStatus.textContent = ru
        ? 'Для этой книги доступен просмотр PDF в отдельной вкладке.'
        : 'This book is available as a PDF in a new tab.'
      return
    }
    previewStatus.textContent = ru ? 'Загружаем страницу…' : 'Loading page…'
    const prepared = firstPage ?? prepareInstructionPage(progress)
    firstPage = null
    const { image, decoded, regions } = prepared
    const pageNumber = progress.page
    image.alt = ru ? `Страница ${pageNumber} инструкции` : `Instruction page ${pageNumber}`
    const enlarged = node('a', undefined, 'instruction-image-link')
    enlarged.target = '_blank'
    enlarged.rel = 'noopener'
    enlarged.title = ru ? 'Открыть страницу крупнее' : 'Open full-size page'
    enlarged.href = display.image
    enlarged.append(image)
    preview.append(enlarged)
    decoded.then(ready => {
      if (!image.isConnected) return
      if (!ready) {
        previewStatus.textContent = ru
          ? 'Страница не загрузилась. Откройте её в оригинальном PDF.'
          : 'The page could not be loaded. Open it in the original PDF.'
        return
      }
      preview.style.setProperty('--page-ratio', image.naturalWidth / image.naturalHeight)
      preview.hidden = false
      previewStatus.hidden = true
      if (findPart) regions.then(parts => {
          if (image.isConnected) addInstructionParts(preview, parts, {
            language, describe: describePart, find: findPart,
          })
        })
      if (entry.pages && pageNumber < entry.pages && !navigator.connection?.saveData) {
        const following = instructionPagePreview(progress.set.number, entry.url, pageNumber + 1)
        if (following?.image) {
          const ahead = new Image()
          ahead.fetchPriority = 'low'
          ahead.src = following.image
        }
      }
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
    const limit = progress.set.books[progress.book]?.pages ?? maxUnknownPages
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
  signal.addEventListener(
    'abort',
    () => {
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
