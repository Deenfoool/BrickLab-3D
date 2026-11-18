import library from '../../catalog/parts-library.json?v=parts-library' with { type: 'json' }
import { sectionsFor } from './library-data.js?v=parts-library'
import buggyParts from '../../catalog/dune-buggy-parts.json?v=8845' with { type: 'json' }
import engineParts from '../../catalog/inline-engine-parts.json' with { type: 'json' }

export const curated = {
  32316: { ru: 'Балка 5L', en: 'Beam 5L', color: '#8094ac' },
  32278: { ru: 'Балка 15L', en: 'Beam 15L', color: '#8094ac' },
  43093: { ru: 'Штифт-ось 2L с трением', en: 'Friction axle pin 2L', color: '#626975' },
  6558: { ru: 'Длинный штифт 3L с трением', en: 'Long friction pin 3L', color: '#626975' },
  11214: { ru: 'Длинный штифт-ось 3L', en: 'Long axle pin 3L', color: '#626975' },
  30374: { ru: 'Стержень 4L', en: 'Bar 4L', color: '#aeb7c2' },
  3700: { ru: 'Кирпич Technic 1×2', en: 'Technic brick 1×2', color: '#bfc5cc' },
  3737: { ru: 'Крестовая ось 10L', en: 'Cross axle 10L', color: '#6b7480' },
  3705: { ru: 'Крестовая ось 4L', en: 'Cross axle 4L', color: '#aeb7c2' },
  3706: { ru: 'Крестовая ось 6L', en: 'Cross axle 6L', color: '#aeb7c2' },
  3707: { ru: 'Крестовая ось 8L', en: 'Cross axle 8L', color: '#aeb7c2' },
  3673: { ru: 'Гладкий штифт', en: 'Frictionless pin', color: '#aeb7c2' },
  2780: { ru: 'Штифт с трением', en: 'Friction pin', color: '#626975' },
  41679: { ru: 'Балка шарнира с фиксацией', en: 'Detent hinge arm', color: '#8094ac' },
  41680: { ru: 'Кольцо шарнира с фиксацией', en: 'Detent hinge ring', color: '#626975' },
  3713: { ru: 'Втулка 1L', en: 'Bush 1L', color: '#e4b047' },
  6538: { ru: 'Соединитель осей', en: 'Axle connector', color: '#aeb7c2' },
  10928: { ru: 'Шестерня 8T', en: '8T gear', color: '#e7ac3c' },
  3648: { ru: 'Шестерня 24T', en: '24T gear', color: '#b6bfca' },
}
export const partOrder = ['3700', '3705', '3706', '3707', '3737', '3673', '2780', '3713', '6538', '10928', '3648', '41679', '41680', '30374', '32316', '32278', '43093', '6558', '11214']
export const sections = sectionsFor(library, curated, partOrder)
export const parts = Object.assign(Object.create(null), ...sections.map(section =>
  Object.fromEntries(section.parts.map(part => [part.design, part]))))
// Supplementary designs needed to edit the complete downloadable examples.
for (const [assetPath, registry, revision] of [
  ['dune-buggy', buggyParts, '8845'],
  ['inline-engine', engineParts, '858'],
]) {
  for (const [design, { en, ru }] of Object.entries(registry)) {
    if (parts[design]) continue
    parts[design] = { design, en, ru, assetPath, pack: 'common', revision, color: '#9ba3ad' }
  }
}
const technicSection = sections.find(section => section.id === 'technic')
for (const design of ['4254', '4255', '8845-spring']) {
  if (technicSection.parts.some(part => part.design === design)) continue
  const part = parts[design]
  Object.assign(part, {
    group: 'joints', preview: technicSection.parts.length, previewAssetPath: technicSection.parts[0].assetPath,
    previewRevision: `${library.source.release}-8845`,
  })
  technicSection.parts.push(part)
}
