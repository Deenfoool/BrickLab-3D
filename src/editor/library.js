import { loadPartIndex, resolvePart, resolveInventoryPart } from '../catalog/part-resolver.js?v=catalog-engine-1'
import { elementNumber, lookupElement } from './element-index.js'
import { previewColumns, previewRows, previewPageSize, searchLibrary } from './library-data.js?v=system-tiles'

const batchSize = 48

function element(tag, className, value) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (value) node.textContent = value
  return node
}

export function mountLibrary(root, { sections, models, language, labels, selectPart, hasConnectors, initialSection, initialGroup = '', signal }) {
  const controls = root.querySelector('[data-library-controls]')
  const scroll = root.querySelector('[data-library-scroll]')
  const cards = root.querySelector('[data-library-cards]')
  const search = root.querySelector('input[type=search]')
  const sectionSelect = element('select', 'editor-library-section')
  const groupSelect = element('select')
  const total = element('output', 'editor-library-count')
  const more = element('button', 'editor-library-more', labels.moreParts)
  const empty = element('p', 'editor-library-empty', labels.noParts)
  const rendered = new Map()
  const options = { signal }
  const browsing = !selectPart
  const observerRoot = browsing ? null : scroll
  const catalog = browsing ? sections.map(section => {
    const order = new Map(section.groups.map(([id], index) => [id, index]))
    // Keep nearby cards on the same atlases where possible.
    const parts = [...section.parts].sort((a, b) => order.get(a.group) - order.get(b.group) || a.preview - b.preview)
    return { ...section, parts }
  }) : sections
  const byDesign = models ?? Object.fromEntries(catalog.flatMap(family => family.parts.map(part => [part.design, part])))
  let section = catalog.find(item => item.id === initialSection) ?? catalog[0]
  let matches = []
  let limit = 0
  let activeDesign
  let elementMatch
  let pendingDesign
  let enabled = true
  more.type = 'button'
  total.setAttribute('aria-live', 'polite')
  sectionSelect.setAttribute('aria-label', labels.librarySection)
  groupSelect.setAttribute('aria-label', labels.partFamily)
  for (const item of catalog) sectionSelect.add(new Option(item[language], item.id))
  sectionSelect.value = section.id
  if (!browsing || catalog.length > 1) controls.prepend(sectionSelect)
  controls.append(groupSelect, total)
  scroll.append(empty, more)

  const previews = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue
      const node = entry.target
      const card = rendered.get(node.dataset.design)
      if (!card?.node.contains(node)) continue
      const { assetPath, preview, revision, previewAssetPath = assetPath, previewRevision = revision } = card.part
      if (!Number.isInteger(preview)) {
        previews.unobserve(node)
        continue
      }
      const tile = preview % previewPageSize
      const image = new URL(`../../assets/ldraw/${previewAssetPath}/previews/${Math.floor(preview / previewPageSize)}.webp`, import.meta.url)
      image.searchParams.set('v', previewRevision)
      node.style.backgroundImage = `url("${image.href}")`
      node.style.backgroundPosition = `${tile % previewColumns * 100 / (previewColumns - 1)}% ${Math.floor(tile / previewColumns) * 100 / (previewRows - 1)}%`
      previews.unobserve(node)
    }
  }, { root: observerRoot, rootMargin: '75px 0px' })

  const pagination = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting && !more.hidden) appendBatch()
  }, { root: observerRoot, rootMargin: '120px 0px' })

  signal.addEventListener('abort', () => {
    previews.disconnect()
    pagination.disconnect()
    for (const node of [sectionSelect, groupSelect, total, empty, more]) node.remove()
    cards.replaceChildren()
  }, { once: true })

  function configureGroups() {
    const family = root.querySelector('.menu-library-family')
    if (family) family.textContent = `LEGO ${section.en}`
    groupSelect.replaceChildren(new Option(labels.allParts, ''))
    for (const [id, ru, en] of section.groups) {
      groupSelect.add(new Option(language === 'ru' ? ru : en, id))
    }
  }

  function updateCard(design) {
    const card = rendered.get(design)?.node
    if (!card) return
    card.disabled = !enabled
    card.setAttribute('aria-pressed', String(design === activeDesign))
    card.toggleAttribute('data-loading', design === pendingDesign)
    if (design === pendingDesign) card.setAttribute('aria-busy', 'true')
    else card.removeAttribute('aria-busy')
  }

  function appendBatch() {
    const fragment = document.createDocumentFragment()
    for (const part of matches.slice(limit, limit + batchSize)) {
      const card = element(browsing ? 'article' : 'button', 'editor-part-card')
      const preview = element('span', 'editor-part-preview')
      const details = element('span', 'editor-part-details')
      const name = element('span', 'editor-part-name', part[language])
      const info = element('span', 'editor-part-meta')
      card.dataset.design = part.design
      preview.dataset.design = part.design
      preview.setAttribute('aria-hidden', 'true')
      name.title = part[language]
      info.append(element('span', 'editor-part-id', elementMatch ? `${part.design} · LEGO ${elementMatch.elementId} · ${elementMatch.colorName}` : part.design))
      if (hasConnectors?.(part.design)) {
        const mechanics = element('span', 'editor-part-mechanics', labels.connectorsReady)
        info.append(mechanics)
      }
      details.append(name, info)
      card.append(preview, details)
      fragment.append(card)
      rendered.set(part.design, { node: card, part })
      if (!browsing) {
        card.type = 'button'
        updateCard(part.design)
      }
      previews.observe(preview)
    }
    cards.append(fragment)
    limit += batchSize
    more.hidden = limit >= matches.length
    pagination.unobserve(more)
    if (!more.hidden) pagination.observe(more)
  }

  function filter() {
    previews.disconnect()
    rendered.clear()
    cards.replaceChildren()
    scroll.scrollTop = 0
    const query = search.value.trim()
    matches = searchLibrary(section, groupSelect.value, query)
    const identity = resolvePart(query, byDesign)
    if (identity.design) matches = [identity.model]
    if (elementMatch) {
      const model = resolveInventoryPart(elementMatch, byDesign).model
      if (model) matches = [{ ...model, color: elementMatch.color }]
      else {
        matches = []
        const reference = element('article', 'editor-part-card')
        reference.append(element('span', 'editor-part-name', elementMatch.name),
          element('span', 'editor-part-meta', `${elementMatch.partNum} · LEGO ${elementMatch.elementId} · ${elementMatch.colorName}`),
          element('small', '', language === 'ru' ? '3D-модель пока отсутствует' : '3D model unavailable'))
        cards.append(reference)
      }
    }
    total.textContent = labels.libraryCount(matches.length || Number(Boolean(elementMatch)))
    empty.hidden = matches.length > 0 || Boolean(elementMatch)
    limit = 0
    appendBatch()
  }

  sectionSelect.addEventListener('change', () => {
    section = catalog.find(item => item.id === sectionSelect.value)
    configureGroups()
    filter()
  }, options)
  groupSelect.addEventListener('change', filter, options)
  search.addEventListener('input', () => {
    elementMatch = undefined
    filter()
    const id = elementNumber(search.value)
    if (id) lookupElement(id).then(record => {
      if (!signal.aborted && elementNumber(search.value) === id && record) {
        elementMatch = record
        filter()
      }
    }).catch(() => {})
  }, options)
  more.addEventListener('click', appendBatch, options)
  if (!browsing) {
    cards.addEventListener('click', event => {
      const design = event.target.closest('button')?.dataset.design
      if (design) selectPart(rendered.get(design).part)
    }, options)
  }

  configureGroups()
  if (section.groups.some(([id]) => id === initialGroup)) groupSelect.value = initialGroup
  filter()
  loadPartIndex().then(() => { if (!signal.aborted && search.value.trim()) filter() })

  return {
    get section() { return section.id },
    get group() { return groupSelect.value },
    setPlacement(design, pending, canPlace) {
      const previous = [activeDesign, pendingDesign]
      const changedMode = enabled !== canPlace
      activeDesign = design
      pendingDesign = pending
      enabled = canPlace
      if (changedMode) for (const id of rendered.keys()) updateCard(id)
      else if (previous[0] !== design || previous[1] !== pending) {
        for (const id of new Set([...previous, design, pending])) updateCard(id)
      }
    },
  }
}
