export async function instructionPartRegions(set, pdfId, page) {
  if (set !== '42223-1' || pdfId !== '6651409') return []
  const { default: regions } = await import(
    '../../catalog/sets/42223-parts-by-page.json?v=1',
    { with: { type: 'json' } }
  )
  return regions[page] ?? []
}

export function addInstructionParts(preview, regions, { language, describe, find }) {
  if (!regions.length) return
  const tooltip = document.createElement('span')
  tooltip.className = 'instruction-part-label'
  tooltip.hidden = true
  tooltip.setAttribute('aria-hidden', 'true')
  preview.append(tooltip)
  for (const [x, y, width, height, partNum, colorId] of regions) {
    const button = document.createElement('button')
    const name = describe?.(partNum, colorId)
    const label = name ? `${partNum} · ${name}` : partNum
    button.className = 'instruction-part-region'
    button.type = 'button'
    button.setAttribute('aria-label', `${language === 'ru' ? 'Найти деталь' : 'Find part'} ${label}`)
    button.dataset.partNum = partNum
    button.style.left = `${x / 100}%`
    button.style.top = `${y / 100}%`
    button.style.width = `${width / 100}%`
    button.style.height = `${height / 100}%`
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
    button.addEventListener('click', () => find(partNum, colorId))
    preview.append(button)
  }
}
