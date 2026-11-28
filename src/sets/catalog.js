import themes from '../../catalog/sets/themes.json' with { type: 'json' }
import { mountSetFilters } from './filter-panel.js'
import { filterSetItems } from './filters.js'
import {
  initRebrickable,
  hasRebrickable,
  loadSetPage,
  importSet,
} from './rebrickable.js?v=browser-recognition'
import { safeImage, validateSet, normalizeSetBooks } from './data.js?v=ducati-instructions-1'
import {
  discoverBooks, indexedBooks,
  instructionSources,
} from './instruction-sources.js?v=feedback-2'
import {mountSandboxPack} from './sandbox-pack.js'
import {instructionEvent} from './instruction-events.js'
import { mountInstructionOffer } from './instruction-offer.js?v=welcome-1'
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
          'Полный каталог временно недоступен. Показаны локальные наборы.',
        pieces: 'деталей',
        error:
          'Не удалось загрузить данные. Повторите попытку позже. При ограничении API попробуйте позже.',
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
        connectHint: 'Full catalog temporarily unavailable. Showing local sets.',
        pieces: 'parts',
        error:
          'Could not load data. Please try again later. If rate limited, try again later.',
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
  { language, signal, projects, begin, resume, practice, initialQuery = '' },
) {
  const t = setStrings(language)
  const ru = language === 'ru', tr = (a,b) => ru ? a : b
  const partCount = item => item.numParts ?? item.inventory?.filter(p=>!p.spare).reduce((sum,p)=>sum+p.quantity,0) ?? 0
  const formatCount = n => Number(n).toLocaleString(ru?'ru-RU':'en-US')
  await initRebrickable(signal)
  if (signal.aborted) return
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
  query.value = initialQuery
  query.placeholder = t.search
  query.setAttribute('aria-label', t.search)
  const submit = node('button', t.find, 'secondary')
  submit.type = 'submit'
  const searchBar = node('div',undefined,'set-search-bar')
  searchBar.append(query,submit)
  form.append(searchBar)
  const filters = mountSetFilters(form, themes, {
    language,
    signal,
    change: scheduleSearch,
  })
  const status = node('p',undefined,'set-catalog-status')
  status.setAttribute('role', 'status')
  const grid = node('div', undefined, 'set-grid')
  const credit = node('a', t.source)
  credit.href = 'https://rebrickable.com/'
  credit.target = '_blank'
  credit.rel = 'noopener'
  const more = control(t.more, () => loadMore(), signal)
  more.classList.add('set-load-more')
  const header=node('header',undefined,'set-catalog-header')
  const copy=node('div',undefined,'set-catalog-copy')
  copy.append(node('span','BRICKLAB / BUILD GUIDES','set-catalog-kicker'),node('h2',tr('Что собираем сегодня?','What will you build today?')),node('p',tr('Выбери набор, открой инструкцию и собирай прямо в редакторе.','Choose a set and build with its instructions in the editor.')))
  const tip=node('div',undefined,'set-catalog-tip')
  tip.append(node('strong',tr('PDF всегда бесплатны','PDFs are always free')),node('span',tr('До 600 деталей — интерактивность без оплаты','Interactive hints free up to 600 pieces')))
  header.append(copy,tip)
  const listHead=node('div',undefined,'set-catalog-list-head'),resultCount=node('span',undefined,'set-result-count')
  listHead.append(node('h3',tr('Каталог наборов','Set catalog')),resultCount)
  credit.classList.add('set-catalog-credit')
  const recommended=node('section',undefined,'set-recommendations')
  recommended.hidden=true
  const sandboxPack=node('section',undefined,'set-sandbox-pack');sandboxPack.hidden=true
  root.replaceChildren(header,recommended,sandboxPack,form,listHead,status,grid,more,credit)
  void mountSandboxPack(sandboxPack,{language,signal})
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
    instructionEvent(set.number,'set_open')
    const describe = () => {
      const count = set.inventory
        .filter((item) => !item.spare)
        .reduce((sum, item) => sum + item.quantity, 0)
      return `${set.year} · ${formatCount(count)} ${t.pieces}`
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
    const title = node('h2', set.name)
    const closeIcon=control('×',()=>dialog.close(),lookupSignal)
    closeIcon.classList.add('set-dialog-close');closeIcon.setAttribute('aria-label',t.close)
    const description = node('p', describe())
    const last = projects().find(
      (project) => project.document.buildingSet?.set?.number === set.number,
    )
    const actions = node('div', undefined, 'set-actions')
    const start = control(t.start, () => {
      dialog.close()
      instructionEvent(set.number,'build_start');begin(set)
    }, lookupSignal)
    start.classList.add('set-primary-action')
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
              void refreshOffer()
            } catch {
              if (!lookupSignal.aborted) status.textContent = t.error
            } finally {
              button.disabled = false
            }
          },
          signal,
        ),
      )
    const retryBooks = control(t.retryBooks, lookupBooks, lookupSignal)
    const detail=node('div',undefined,'set-dialog-content'),art=node('div',undefined,'set-dialog-art'),identity=node('div',undefined,'set-dialog-identity'),offer=node('section',undefined,'set-instruction-offer')
    art.append(image);identity.append(node('span',set.number,'set-catalog-kicker'),title,description,booksStatus,retryBooks)
    detail.append(art,identity);dialog.classList.add('set-details-dialog');dialog.append(closeIcon,detail,offer,start,actions)
    const refreshOffer=()=>mountInstructionOffer(offer,{set,language,signal:lookupSignal,onStart:()=>{dialog.close();instructionEvent(set.number,'build_start');begin(set)},start})
    void refreshOffer()
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
  // Recommendations use only actual catalog results and local build history.
  const existing=projects().map(p=>p.document?.buildingSet?.set).filter(Boolean)
  const seenSets=new Set(existing.map(s=>s.number))
  const recent=existing[0],favoriteTheme=recent?.themeId
  function recommend(items){
    if(activeQuery||recommended.childElementCount||signal.aborted)return
    const eligible=items.filter(i=>!seenSets.has(i.number)&&partCount(i)>0)
    const matched=eligible.filter(i=>favoriteTheme&&String(i.themeId)===String(favoriteTheme))
    const selection=(matched.length?matched:eligible).sort((a,b)=>Math.abs(partCount(a)-(recent?partCount(recent):300))-Math.abs(partCount(b)-(recent?partCount(recent):300))).slice(0,3)
    if(!selection.length)return
    const title=node('h3',matched.length?tr('В твоём стиле','In your style'):recent?tr('Следующие идеи','Next ideas'):tr('С чего начать','Start here'))
    const cards=node('div',undefined,'set-recommendation-grid')
    for(const item of selection){
      const b=control('',async()=>{
        const id=++requestId;b.disabled=true
        try{const set=sets.get(item.number)??await importSet(item.number,signal);if(signal.aborted||id!==requestId)return;const verified={...set,books:normalizeSetBooks(set.number,item.books?.length?item.books:set.books)};sets.set(verified.number,verified);saveCache();showDetails(verified)}
        catch{if(!signal.aborted)status.textContent=t.error}finally{b.disabled=false}
      },signal)
      const image=node('img');image.src=safeImage(item.image);image.alt='';image.loading='lazy'
      const info=node('span');info.append(node('strong',item.name),node('small',formatCount(partCount(item))+' '+t.pieces))
      b.append(image,info);cards.append(b)
    }
    recommended.append(title,cards);recommended.hidden=false
  }
  const verifiedBooks=new Map()
  async function withInstructions(items,request,onBatch){
    const result=[]
    for(let offset=0;offset<items.length;offset+=4){
      request.throwIfAborted()
      const batch=await Promise.all(items.slice(offset,offset+4).map(async item=>{
        let books=normalizeSetBooks(item.number,sets.get(item.number)?.books??item.books)
        if(!books?.length)books=verifiedBooks.get(item.number)
        if(!books?.length){try{books=await indexedBooks(item.number,request)}catch{request.throwIfAborted();books=[]}}
        if(!books?.length){try{books=await discoverBooks(item.number,AbortSignal.any([request,AbortSignal.timeout(10000)]))}catch{request.throwIfAborted();return null}}
        if(!books?.length)return null
        verifiedBooks.set(item.number,books);return {...item,books}
      }))
      const found=batch.filter(Boolean);result.push(...found);onBatch?.(found)
    }
    return result
  }
  function appendItems(items) {
    recommend(items)
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
      const media=node('div',undefined,'set-card-art'),body=node('div',undefined,'set-card-body'),meta=node('div',undefined,'set-card-meta'),foot=node('div',undefined,'set-card-foot')
      const count=partCount(item)
      media.append(image,node('span',item.number,'set-card-number'))
      image.addEventListener('error',()=>{image.hidden=true;media.classList.add('set-card-no-image')},{once:true,signal})
      meta.append(node('span',String(item.year||'—')),node('span',count?formatCount(count)+' '+t.pieces:tr('Опись','Inventory')))
      body.append(node('strong',item.name),meta)
      foot.append(node('span',count>0&&count<=600?tr('Бесплатные подсказки','Free hints'):tr('Сборка по инструкции','Build guide')),node('span','→','set-card-arrow'))
      body.append(foot);card.append(media,body)
      card.addEventListener('click', async () => {
        const id = ++requestId
        card.disabled = true
        status.textContent = t.loading
        try {
          const set =
            sets.get(item.number) ?? (await importSet(item.number, signal))
          if (signal.aborted || id !== requestId) return
          const verified={...set,books:normalizeSetBooks(set.number,item.books?.length?item.books:set.books)}
          sets.set(verified.number, verified)
          status.textContent = ''
          saveCache()
          showDetails(verified)
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
    if (!more.hidden && !loading && !retry && displayed.size) observer.observe(more)
  }
  async function loadMore() {
    if (loading || signal.aborted || more.hidden) return
    const generation = listGeneration
    loading = true
    status.textContent = t.loading
    updateMore()
    let failed = false
    const appendVerified=items=>{if(!signal.aborted&&generation===listGeneration){appendItems(items);resultCount.textContent=tr('Показано: ','Shown: ')+formatCount(displayed.size)}}
    try {
      if (localOffset < localItems.length) {
        await withInstructions(localItems.slice(localOffset,localOffset+pageSize),listController.signal,appendVerified)
        if(signal.aborted||generation!==listGeneration)return
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
        await withInstructions(page.items,listController.signal,appendVerified)
        if(signal.aborted||generation!==listGeneration)return
        if (cursor) pages.add(cursor)
        nextPage = page.next && !pages.has(page.next) ? page.next : null
        remoteStarted = true
      }
      resultCount.textContent = tr('Показано: ','Shown: ')+formatCount(displayed.size)
      status.textContent = displayed.size
        ? !hasRebrickable()
          ? t.connectHint
          : ''
        : tr('Нет подтверждённых инструкций на этой странице. Продолжи поиск.','No confirmed instructions on this page. Continue searching.')
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
    recommended.hidden=Boolean(activeQuery)||!recommended.childElementCount
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
    resultCount.textContent=''
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
