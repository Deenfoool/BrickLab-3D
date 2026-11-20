import { node, control, setStrings } from './catalog.js?v=auto-pdf'
import { safeBook, validateSet } from './data.js?v=auto-pdf'
import {
  discoverBooks,
  instructionSources,
} from './instruction-sources.js?v=auto-pdf'

const maxUnknownPages = 5000

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
  { language, signal, change },
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
  const external = node(
    'a',
    ru ? 'Открыть PDF отдельно' : 'Open PDF in a new tab',
  )
  external.target = '_blank'
  external.rel = 'noopener'
  const hint = node(
    'small',
    ru
      ? 'Листайте кнопками панели, чтобы сохранить страницу. Масштаб — в просмотрщике PDF.'
      : 'Use panel buttons to save the page. Zoom inside the PDF viewer.',
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
  body.append(name, status, retry, tools, frame, external, credit, hint, add)
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
    frame.hidden = !entry
    external.hidden = !entry
    hint.hidden = !entry
    credit.hidden = !instructionSources[entry?.source]
    status.hidden = Boolean(entry)
    retry.hidden = true
    if (entry) {
      page.max = String(entry.pages ?? maxUnknownPages)
      total.textContent = entry.pages ? `/ ${entry.pages}` : ''
      if (!credit.hidden) {
        credit.href = instructionSources[entry.source]
        credit.textContent = entry.source
      }
      previous.disabled = progress.page <= 1
      next.disabled = progress.page >= (entry.pages ?? maxUnknownPages)
      const url = `${entry.url}#page=${progress.page}&view=FitH`
      if (frame.src !== url) frame.src = url
      external.href = url
    }
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
