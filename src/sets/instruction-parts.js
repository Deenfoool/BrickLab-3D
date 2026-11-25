export async function instructionPartRegions(set, pdfId, page) {
  if(!pdfId)return []
  const query=new URLSearchParams({set,pdf:String(pdfId),page:String(page)})
  const response=await fetch('/api/commerce/instruction-regions?'+query,{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(5000)})
  if(!response.ok)return []
  const {regions}=await response.json()
  return Array.isArray(regions)?regions:[]
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
