const INSPECTOR_SECTIONS_KEY = 'bricklab.ui.inspector-sections.v1'

function readCollapsed() {
  try {
    const value = JSON.parse(localStorage.getItem(INSPECTOR_SECTIONS_KEY) || '[]')
    return new Set(Array.isArray(value) ? value : [])
  } catch {
    return new Set()
  }
}

function installInspectorSections() {
  const inspector = document.getElementById('inspector')
  if (!inspector) {
    requestAnimationFrame(installInspectorSections)
    return
  }
  if (inspector.dataset.collapsibleReady === 'true') return
  inspector.dataset.collapsibleReady = 'true'

  const collapsed = readCollapsed()
  const sections = [...inspector.querySelectorAll(':scope > section')]

  const persist = () => {
    localStorage.setItem(INSPECTOR_SECTIONS_KEY, JSON.stringify([...collapsed]))
  }

  sections.forEach((section, index) => {
    const heading = section.querySelector(':scope > h3')
    if (!heading) return
    const key = heading.textContent.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-') || `section-${index}`
    section.dataset.inspectorSection = key

    const label = heading.textContent.trim()
    heading.textContent = ''
    heading.classList.add('collapsible-heading')
    heading.innerHTML = `<span>${label}</span><button type="button" class="section-collapse" aria-label="Collapse ${label}" aria-expanded="true"><i data-lucide="chevron-down"></i></button>`

    const apply = () => {
      const isCollapsed = collapsed.has(key)
      section.classList.toggle('section-collapsed', isCollapsed)
      const button = heading.querySelector('.section-collapse')
      if (button) {
        button.setAttribute('aria-expanded', String(!isCollapsed))
        button.setAttribute('aria-label', `${isCollapsed ? 'Expand' : 'Collapse'} ${label}`)
        button.innerHTML = `<i data-lucide="${isCollapsed ? 'chevron-right' : 'chevron-down'}"></i>`
      }
    }

    const toggle = event => {
      event?.stopPropagation?.()
      if (collapsed.has(key)) collapsed.delete(key)
      else collapsed.add(key)
      persist()
      apply()
      window.lucide?.createIcons?.({ attrs: { 'stroke-width': 1.8, 'aria-hidden': 'true' } })
    }

    heading.addEventListener('click', toggle)
    apply()
  })

  window.lucide?.createIcons?.({ attrs: { 'stroke-width': 1.8, 'aria-hidden': 'true' } })
}

installInspectorSections()
