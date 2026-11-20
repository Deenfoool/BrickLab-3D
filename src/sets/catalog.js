import {
  connectRebrickable,
  hasRebrickable,
  searchSets,
  importSet,
} from './rebrickable.js'
import { safeImage, validateSet } from './data.js'
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
        pieces: 'деталей',
        error:
          'Не удалось загрузить данные. Проверьте ключ и соединение. При ограничении API попробуйте позже.',
        source: 'Данные Rebrickable',
        noBooks: 'Добавьте ссылку на PDF-инструкцию LEGO.',
        books: 'PDF-инструкция LEGO',
        pages: 'Страниц в книге',
        addBook: 'Добавить книгу',
        invalidBook:
          'Укажите HTTPS-ссылку на PDF с www.lego.com и количество страниц.',
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
        pieces: 'parts',
        error:
          'Could not load data. Check the key and connection. If rate limited, try again later.',
        source: 'Data by Rebrickable',
        noBooks: 'Add a LEGO PDF instruction URL.',
        books: 'LEGO PDF instructions',
        pages: 'Pages in book',
        addBook: 'Add book',
        invalidBook: 'Enter a www.lego.com HTTPS PDF URL and page count.',
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
      },
      signal,
    ),
    control(
      t.disconnect,
      () => {
        connectRebrickable('')
        key.value = ''
        authStatus.textContent = ''
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
  root.replaceChildren(form, connect, status, grid, credit)
  let requestId = 0
  const dialogs = new Set()
  signal.addEventListener(
    'abort',
    () => {
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
    const dialog = node('dialog', undefined, 'set-dialog')
    dialogs.add(dialog)
    const image = node('img')
    image.src = safeImage(set.image)
    image.alt = set.name
    const title = node('h2', `${set.number} · ${set.name}`)
    const count = set.inventory
      .filter((item) => !item.spare)
      .reduce((sum, item) => sum + item.quantity, 0)
    const description = node('p', `${set.year} · ${count} ${t.pieces}`)
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
              const updated = await importSet(set.number, signal)
              if (signal.aborted) return
              sets.set(updated.number, updated)
              saveCache()
              dialog.close()
              showDetails(updated)
            } catch {
              if (!signal.aborted) status.textContent = t.error
            } finally {
              button.disabled = false
            }
          },
          signal,
        ),
      )
    actions.append(control(t.close, () => dialog.close(), signal))
    dialog.append(
      image,
      title,
      description,
      node(
        'p',
        set.books.length ? `${t.books} · ${set.books.length}` : t.noBooks,
      ),
      actions,
    )
    dialog.addEventListener(
      'close',
      () => {
        dialogs.delete(dialog)
        dialog.remove()
      },
      { once: true },
    )
    document.body.append(dialog)
    dialog.showModal()
  }
  function render(items) {
    grid.replaceChildren()
    for (const item of items) {
      const card = node('button', undefined, 'set-card')
      card.type = 'button'
      const image = node('img')
      image.src = safeImage(item.image)
      image.alt = item.name
      image.loading = 'lazy'
      card.append(
        image,
        node('strong', item.name),
        node('span', `${item.number} · ${item.year}`),
      )
      card.addEventListener(
        'click',
        async () => {
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
            if (!signal.aborted && id === requestId)
              status.textContent = t.error
          } finally {
            card.disabled = false
          }
        },
        { signal },
      )
      grid.append(card)
    }
    if (!items.length) status.textContent = t.empty
  }
  form.addEventListener(
    'submit',
    async (event) => {
      event.preventDefault()
      const id = ++requestId,
        term = query.value.trim()
      status.textContent = t.loading
      try {
        const local = [...sets.values()].filter((set) =>
          `${set.number} ${set.name}`
            .toLowerCase()
            .includes(term.toLowerCase()),
        )
        const found =
          term && hasRebrickable() ? await searchSets(term, signal) : []
        if (signal.aborted || id !== requestId) return
        status.textContent = ''
        render([
          ...new Map(
            [...found, ...local].map((set) => [set.number, set]),
          ).values(),
        ])
      } catch (error) {
        if (!signal.aborted && id === requestId) status.textContent = t.error
      }
    },
    { signal },
  )
  render([...sets.values()])
}
