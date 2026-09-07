import { PARTS } from './parts.js'

function install() {
  const mechanics = document.getElementById('mechanicsSection')
  const selectedName = document.getElementById('selectedName')
  if (!mechanics || !selectedName) return requestAnimationFrame(install)
  if (!document.getElementById('physicalPartMeta')) {
    const box = document.createElement('div')
    box.id = 'physicalPartMeta'
    box.className = 'physical-part-meta'
    const heading = mechanics.querySelector('h3')
    heading?.insertAdjacentElement('afterend', box)
  }
  const render = () => {
    const box = document.getElementById('physicalPartMeta')
    const part = PARTS.find(item => item.name === selectedName.textContent) || PARTS.find(item => item.__i18nEnglishName === selectedName.textContent)
    if (!box || !part?.physics) { if (box) box.innerHTML = ''; return }
    const p = part.physics
    box.innerHTML = `<div class="stat-row"><span>Mass</span><b>${((p.massKg ?? 0) * 1000).toFixed(2)} g</b></div><div class="stat-row"><span>Material</span><b>${String(p.material ?? '—').toUpperCase()}</b></div><div class="stat-row"><span>Collision</span><b>${String(p.collisionClass ?? 'structure').toUpperCase()}</b></div>`
  }
  new MutationObserver(render).observe(selectedName, { childList: true, characterData: true, subtree: true })
  window.addEventListener('bricklab:languagechange', () => requestAnimationFrame(render))
  render()
}
install()
