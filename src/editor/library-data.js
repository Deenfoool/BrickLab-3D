const colors = {
  beams: '#8ba5c1', axles: '#aeb7c2', pins: '#788995', gears: '#d6a652',
  joints: '#909fae', wheels: '#8895a1', plates: '#a0a9b8', pneumatics: '#ceaf73',
  panels: '#c97456', power: '#8c9bb0', other: '#a0a9b8',
}

export const previewColumns = 6
export const previewRows = 6
export const previewPageSize = previewColumns * previewRows

export function sectionsFor(library, curated, coreOrder) {
  const order = new Map(coreOrder.map((design, index) => [design, index]))
  return library.sections.map(({ id, ru, en, assetPath, groups, parts, aliases = {}, revision = library.source.release }) => {
    const entries = parts.map(([design, group, title, russianTitle, pack, commonPack], preview) => ({
      design, group, assetPath, pack, commonPack, preview, revision,
      ru: russianTitle || title, en: title, color: colors[group] ?? colors.other,
      ...curated[design],
      searchableTitle: title, aliases: aliases[design] ?? [],
    }))
    // Keep the parts supported by the mechanics editor at the front of the default view.
    entries.sort((a, b) => (order.get(a.design) ?? Infinity) - (order.get(b.design) ?? Infinity) ||
      a.preview - b.preview)
    return { id, ru, en, groups, parts: entries }
  })
}

const normalized = text => text.toLowerCase().replaceAll('ё', 'е').replace(/×|(?<=\d)\s*[xх]\s*(?=\d)/g, 'x').trim()

export function searchLibrary(section, group, query) {
  const terms = normalized(query).split(/\s+/).filter(Boolean)
  return section.parts.filter(part => {
    if (group && part.group !== group) return false
    if (!terms.length) return true
    const labels = section.groups.find(([id]) => id === part.group)
    const text = normalized([part.design, part.ru, part.en, part.searchableTitle, ...(part.aliases ?? []), ...labels.slice(1)].join(' '))
    return terms.every(term => text.includes(term))
  })
}
