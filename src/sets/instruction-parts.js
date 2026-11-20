export async function instructionPartRegions(set, pdfId, page) {
  const { default: sources } = await import(
    '../../catalog/sets/instruction-part-index.json?v=browser-recognition',
    { with: { type: 'json' } }
  )
  if (!Object.hasOwn(sources, `${set}/${pdfId}`)) return []
  const name = sources[`${set}/${pdfId}`]
  const { default: regions } = await import(
    new URL(`../../catalog/sets/${name}?v=guided-transition`, import.meta.url).href,
    { with: { type: 'json' } }
  )
  return regions[page] ?? []
}

export function addInstructionParts(preview, regions, { language, describe, find }) {
  if (!regions.length) return
  const byArea = [...regions].sort((a, b) => b[2] * b[3] - a[2] * a[3])
  const paintOrder = new Map(byArea.map((region, index) => [region, index]))
  preview.style.isolation = 'isolate'
  const tooltip = document.createElement('span')
  tooltip.className = 'instruction-part-label'
  tooltip.style.zIndex = String(regions.length)
  tooltip.hidden = true
  tooltip.setAttribute('aria-hidden', 'true')
  preview.append(tooltip)
  for (const region of regions) {
    const [x, y, width, height, partNum, colorId, elementId] = region
    const button = document.createElement('button')
    const name = partNum && describe?.(partNum, colorId)
    const label = [partNum, elementId && `LEGO ${elementId}`, name].filter(Boolean).join(' · ')
    button.className = 'instruction-part-region'
    button.type = 'button'
    button.setAttribute('aria-label', `${language === 'ru' ? 'Найти деталь' : 'Find part'} ${label}`)
    if (partNum) button.dataset.partNum = partNum
    if (elementId) button.dataset.elementId = elementId
    button.style.left = `${x / 100}%`
    button.style.top = `${y / 100}%`
    button.style.width = `${width / 100}%`
    button.style.height = `${height / 100}%`
    button.style.zIndex = String(paintOrder.get(region))
    function showLabel() {
      tooltip.textContent = label
      tooltip.style.left = `clamp(6.5rem, ${(x + width / 2) / 100}%, calc(100% - 6.5rem))`
      tooltip.style.top = `${(y < 1500 ? y + height : y) / 100}%`
      tooltip.classList.toggle('above', y >= 1500)
      tooltip.hidden = false
    }
    const hideLabel = () => { tooltip.hidden = true }
    button.addEventListener('pointerenter', showLabel)
    button.addEventListener('pointerleave', () => {
      if (!button.matches(':focus-visible')) hideLabel()
    })
    button.addEventListener('focus', showLabel)
    button.addEventListener('blur', hideLabel)
    button.addEventListener('click', () => find(partNum, colorId, elementId))
    preview.append(button)
  }
}
