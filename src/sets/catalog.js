import themes from '../../catalog/sets/themes.json' with { type: 'json' }
import { mountSetFilters } from './filter-panel.js'
import { filterSetItems } from './filters.js'
import {
  connectRebrickable,
  hasRebrickable,
  loadSetPage,
  importSet,
} from './rebrickable.js?v=set-filters'
import { safeImage, validateSet } from './data.js?v=auto-pdf'
import {
  discoverBooks,
  instructionSources,
} from './instruction-sources.js?v=inline-pdf-instructions'
const storageKey = 'bricklab.sets.v1'
export const setStrings = (language) =>
  language === 'ru'
    ? {
        search: 'Номер или название набора',
        connect: 'Подключить Rebrickable',
        disconnect: 'Отключить',
        key: 'API-ключ Rebrickable',
        keyHint: 'Ключ действует до перезагрузки страницы.',
        find: 'Найти',
        start: 'Начать сборку',
        resume: 'Продолжить',
        close: 'Закрыть',
        loading: 'Загрузка…',
        empty: 'Наборы не найдены.',
        more: 'Показать ещё',
        retry: 'Повторить загрузку',
        connectHint:
          'Подключите Rebrickable, чтобы увидеть полный каталог наборов.',
        pieces: 'деталей',
        error:
          'Не удалось загрузить данные. Проверьте ключ и соединение. При ограничении API попробуйте позже.',
        source: 'Данные Rebrickable',
        noBooks: 'PDF для этого набора не найден.',
        findingBooks: 'Ищем инструкцию…',
        booksUnavailable: 'Не удалось проверить источники инструкций.',
        retryBooks: 'Повторить поиск инструкции',
        books: 'PDF-инструкция',
        pages: 'Страниц в книге',
        addBook: 'Добавить книгу',
        invalidBook:
          'Укажите ссылку на PDF LEGO или BrickLink и количество страниц.',
        unavailable: 'Модель пока отсутствует в библиотеке',
        missing: 'Позиций без модели',
      }
    : {
        search: 'Set number or name',
        connect: 'Connect Rebrickable',
        disconnect: 'Disconnect',
        key: 'Rebrickable API key',
        keyHint: 'The key lasts until the page is reloaded.',
        find: 'Search',
        start: 'Start building',
        resume: 'Continue',
        close: 'Close',
        loading: 'Loading…',
        empty: 'No sets found.',
        more: 'Show more',
        retry: 'Retry loading',
        connectHint: 'Connect Rebrickable to browse the full set catalog.',
        pieces: 'parts',
        error:
          'Could not load data. Check the key and connection. If rate limited, try again later.',
        source: 'Data by Rebrickable',
        noBooks: 'No PDF found for this set.',
        findingBooks: 'Looking for instructions…',
        booksUnavailable: 'Could not check the instruction sources.',
        retryBooks: 'Retry instruction search',
        books: 'PDF instructions',
        pages: 'Pages in book',
        addBook: 'Add book',
        invalidBook: 'Enter a LEGO or BrickLink PDF URL and the page count.',
        unavailable: 'Model unavailable in the library',
        missing: 'Lots without models',
      }
export function node(tag, text, className) {
  const el = document.createElement(tag)
  if (text !== undefined) el.textContent = text
  if (className) el.className = className
  return el
}
export function control(text, action, signal) {
  const button = node('button', text, 'secondary')
  button.type = 'button'
  button.addEventListener('click', action, { signal })
  return button
}
function storedSets() {
  try {
    return JSON.parse(localStorage.getItem(storageKey) ?? '[]').map(validateSet)
  } catch {
    return []
  }
}
export async function mountSetCatalog(
  root,
  { language, signal, projects, begin, resume },
) {
  const t = setStrings(language)
  const cached = storedSets()
  const response = await fetch(
    new URL('../../catalog/sets/42215-1.json', import.meta.url),
    { signal },
  )
  if (!response.ok) throw Error('set-unavailable')
  const starter = validateSet(await response.json())
  if (signal.aborted) return
  const sets = new Map([starter, ...cached].map((set) => [set.number, set]))
  const form = node('form', undefined, 'set-search')
  const query = node('input')
  query.type = 'search'
  query.placeholder = t.search
  query.setAttribute('aria-label', t.search)
  const submit = node('button', t.find, 'secondary')
  submit.type = 'submit'
  form.append(query, submit)
  const filters = mountSetFilters(form, themes, {
    language,
    signal,
    change: scheduleSearch,
  })
  const connect = node('details', undefined, 'set-connect')
  connect.append(node('summary', t.connect))
  const key = node('input')
  key.type = 'password'
  key.placeholder = t.key
  key.setAttribute('aria-label', t.key)
  key.autocomplete = 'off'
  const info = node('p', t.keyHint)
  const authStatus = node('span')
  connect.append(
    key,
    control(
      t.connect,
      () => {
        connectRebrickable(key.value)
        key.value = ''
        authStatus.textContent = hasRebrickable() ? '✓' : ''
        resetList()
      },
      signal,
    ),
    control(
      t.disconnect,
      () => {
        connectRebrickable('')
        key.value = ''
        authStatus.textContent = ''
        resetList()
      },
      signal,
    ),
    authStatus,
    info,
  )
  const status = node('p')
  status.setAttribute('role', 'status')
  const grid = node('div', undefined, 'set-grid')
  const credit = node('a', t.source)
  credit.href = 'https://rebrickable.com/'
  credit.target = '_blank'
  credit.rel = 'noopener'
  const more = control(t.more, () => loadMore(), signal)
  more.classList.add('set-load-more')
  root.replaceChildren(form, connect, status, grid, more, credit)
  const pageSize = 24
  let localItems = []
  let localOffset = 0
  let nextPage
  let remoteStarted = false
  let loading = false
  let listGeneration = 0
  let listController
  let searchTimer
  let activeQuery = ''
  let activeFilters = filters.read()
  const displayed = new Set()
  const pages = new Set()
  const observer = new IntersectionObserver(
    ([entry]) => {
      if (entry.isIntersecting && !more.hidden) loadMore()
    },
    { rootMargin: '300px 0px' },
  )
  let requestId = 0
  const dialogs = new Set()
  signal.addEventListener(
    'abort',
    () => {
      clearTimeout(searchTimer)
      listController?.abort()
      observer.disconnect()
      for (const dialog of dialogs) dialog.remove()
      root.replaceChildren()
    },
    { once: true },
  )
  function saveCache() {
    try {
      localStorage.setItem(storageKey, JSON.stringify([...sets.values()]))
    } catch {
      status.textContent =
        language === 'ru'
          ? 'Каталог не поместился в память браузера. Опись сохранится в проекте.'
          : 'Catalog storage is full. The inventory will be saved in your project.'
    }
  }
  function showDetails(set) {
    const describe = () => {
      const count = set.inventory
        .filter((item) => !item.spare)
        .reduce((sum, item) => sum + item.quantity, 0)
      return `${set.year} · ${count} ${t.pieces}`
    }
    const dialog = node('dialog', undefined, 'set-dialog')
    dialogs.add(dialog)
    const lookupController = new AbortController()
    const lookupSignal = AbortSignal.any([signal, lookupController.signal])
    const booksStatus = node('p')
    booksStatus.setAttribute('role', 'status')
    const image = node('img')
    image.src = safeImage(set.image)
    image.alt = set.name
    const title = node('h2', `${set.number} · ${set.name}`)
    const description = node('p', describe())
    const last = projects().find(
      (project) => project.document.buildingSet?.set?.number === set.number,
    )
    const actions = node('div', undefined, 'set-actions')
    actions.append(
      control(
        t.start,
        () => {
          dialog.close()
          begin(set)
        },
        signal,
      ),
    )
    if (last)
      actions.append(
        control(
          t.resume,
          () => {
            dialog.close()
            resume(last.id)
          },
          signal,
        ),
      )
    if (hasRebrickable())
      actions.append(
        control(
          language === 'ru' ? 'Обновить опись' : 'Refresh inventory',
          async (event) => {
            const button = event.currentTarget
            button.disabled = true
            try {
              const updated = await importSet(set.number, lookupSignal)
              if (lookupSignal.aborted) return
              set = {
                ...updated,
                books: set.books.length ? set.books : updated.books,
              }
              sets.set(set.number, set)
              saveCache()
              description.textContent = describe()
              lookupBooks()
            } catch {
              if (!lookupSignal.aborted) status.textContent = t.error
            } finally {
              button.disabled = false
            }
          },
          signal,
        ),
      )
    actions.append(control(t.close, () => dialog.close(), signal))
    const retryBooks = control(t.retryBooks, lookupBooks, lookupSignal)
    dialog.append(image, title, description, booksStatus, retryBooks, actions)
    function lookupBooks() {
      retryBooks.hidden = true
      if (set.books.length) {
        booksStatus.textContent = `${t.books} · ${set.books.length}`
        const source = set.books.find(
          (book) => instructionSources[book.source],
        )?.source
        if (source) booksStatus.append(` · ${source}`)
        return
      }
      booksStatus.textContent = t.findingBooks
      discoverBooks(set.number, lookupSignal)
        .then((books) => {
          if (lookupSignal.aborted) return
          if (!books.length) {
            booksStatus.textContent = t.noBooks
            return
          }
          set = { ...set, books }
          sets.set(set.number, set)
          saveCache()
          lookupBooks()
        })
        .catch(() => {
          if (lookupSignal.aborted) return
          booksStatus.textContent = t.booksUnavailable
          retryBooks.hidden = false
        })
    }
    dialog.addEventListener(
      'close',
      () => {
        lookupController.abort()
        dialogs.delete(dialog)
        dialog.remove()
      },
      { once: true },
    )
    document.body.append(dialog)
    dialog.showModal()
    lookupBooks()
  }
  function appendItems(items) {
    for (const item of items) {
      if (displayed.has(item.number)) continue
      displayed.add(item.number)
      const card = node('button', undefined, 'set-card')
      card.type = 'button'
      card.dataset.set = item.number
      const image = node('img')
      image.src = safeImage(item.image)
      image.alt = item.name
      image.loading = 'lazy'
      card.append(
        image,
        node('strong', item.name),
        node('span', `${item.number} · ${item.year}`),
      )
      card.addEventListener('click', async () => {
        const id = ++requestId
        card.disabled = true
        status.textContent = t.loading
        try {
          const set =
            sets.get(item.number) ?? (await importSet(item.number, signal))
          if (signal.aborted || id !== requestId) return
          sets.set(set.number, set)
          status.textContent = ''
          saveCache()
          showDetails(set)
        } catch (error) {
          if (!signal.aborted && id === requestId) status.textContent = t.error
        } finally {
          card.disabled = false
        }
      })
      grid.append(card)
    }
  }
  function updateMore(retry = false) {
    observer.unobserve(more)
    more.hidden =
      localOffset >= localItems.length &&
      (!hasRebrickable() || (remoteStarted && !nextPage))
    more.disabled = loading
    more.textContent = loading ? t.loading : retry ? t.retry : t.more
    if (!more.hidden && !loading && !retry) observer.observe(more)
  }
  async function loadMore() {
    if (loading || signal.aborted || more.hidden) return
    const generation = listGeneration
    loading = true
    status.textContent = t.loading
    updateMore()
    let failed = false
    try {
      if (localOffset < localItems.length) {
        appendItems(localItems.slice(localOffset, localOffset + pageSize))
        localOffset += pageSize
      } else if (hasRebrickable() && (!remoteStarted || nextPage)) {
        const cursor = nextPage
        const page = await loadSetPage(
          activeQuery,
          listController.signal,
          cursor,
          activeFilters,
        )
        if (signal.aborted || generation !== listGeneration) return
        appendItems(page.items)
        if (cursor) pages.add(cursor)
        nextPage = page.next && !pages.has(page.next) ? page.next : null
        remoteStarted = true
      }
      status.textContent = displayed.size
        ? !hasRebrickable()
          ? t.connectHint
          : ''
        : t.empty
    } catch (error) {
      if (signal.aborted || generation !== listGeneration) return
      failed = true
      status.textContent = t.error
    } finally {
      if (!signal.aborted && generation === listGeneration) {
        loading = false
        updateMore(failed)
      }
    }
  }
  function resetList() {
    clearTimeout(searchTimer)
    listController?.abort()
    listController = new AbortController()
    listGeneration++
    requestId++
    loading = false
    activeQuery = query.value.trim()
    activeFilters = filters.read()
    // Let the server order the full catalog, without a locally cached prefix.
    localItems = hasRebrickable()
      ? []
      : filterSetItems([...sets.values()], activeQuery, activeFilters)
    localOffset = 0
    nextPage = undefined
    remoteStarted = false
    displayed.clear()
    pages.clear()
    grid.replaceChildren()
    more.hidden = false
    loadMore()
  }
  form.addEventListener(
    'submit',
    (event) => {
      event.preventDefault()
      resetList()
    },
    { signal },
  )
  function scheduleSearch() {
    // Invalidate immediately so a prior page cannot append during the debounce.
    listController?.abort()
    listGeneration++
    requestId++
    observer.unobserve(more)
    more.disabled = true
    clearTimeout(searchTimer)
    searchTimer = setTimeout(resetList, 250)
  }
  query.addEventListener('input', scheduleSearch, { signal })
  resetList()
}
