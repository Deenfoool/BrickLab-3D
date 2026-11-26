const icons = {
  lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 1 1 8 0v3"/>',
  unlock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8-1"/>',
  folder: '<path d="M3 7V5h6l2 3h10v11H3z"/>',
  group: '<path d="M3 7V5h6l2 3h10v11H3zM9 13h6m-3-3v6"/>',
  show: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z"/><circle cx="12" cy="12" r="2.5"/>',
  hide: '<path d="m3 3 18 18M10 6.2c.6-.1 1.3-.2 2-.2 6.5 0 10 6 10 6a18 18 0 0 1-3.2 3.5M6.2 7.7A18 18 0 0 0 2 12s3.5 6 10 6c1.5 0 2.8-.3 4-.8"/>',
  isolate: '<path d="M8 3H3v5m13-5h5v5m0 8v5h-5m-8 0H3v-5"/><rect x="9" y="9" width="6" height="6" rx="1"/>',
  expand: '<path d="m9 5 7 7-7 7"/>',
  collapse: '<path d="m5 9 7 7 7-7"/>',
  rename: '<path d="m4 20 1-5L16 4l4 4L9 19l-5 1Zm10-14 4 4"/>',
  ungroup: '<path d="M3 7V5h6l2 3h10v11H3zM8 13h8"/>',
  remove: '<path d="M4 6h16M9 6V3h6v3M6 6l1 14h10l1-14M10 10v6m4-6v6"/>',
}
const svg = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`

function control(action, label, icon, aria = label) {
  const node = document.createElement('button')
  node.type = 'button'
  node.dataset.layerAction = action
  node.title = label
  node.setAttribute('aria-label', aria)
  if (icon) node.innerHTML = svg(icon)
  return node
}

function row(kind, id, hidden, selected) {
  const node = document.createElement('div')
  node.className = `editor-layer-row editor-layer-${kind}`
  node.dataset.id = id
  node.toggleAttribute('data-layer-hidden', hidden)
  node.toggleAttribute('data-layer-selected', selected)
  return node
}

export function mountScenePartsPanel(body, t, actions, signal) {
  const toolbar = document.createElement('div')
  toolbar.className = 'editor-layers-toolbar'
  const groupButton = control('createGroup', t.createGroup, 'group')
  const isolateButton = control('isolate', t.isolate, 'isolate')
  const showAllButton = control('showAll', t.showAll, 'show')
  toolbar.append(groupButton, isolateButton, showAllButton)
  const list = document.createElement('div')
  list.className = 'editor-layers-list'
  body.append(toolbar, list)
  const collapsed = new Set()
  let snapshot
  let editable
  let dragIds

  function partRow(part, grouped, directlyHidden) {
    const name = actions.nameOf(part)
    const isHidden = snapshot.hidden.has(part.id)
    const item = row('part', part.id, isHidden, snapshot.selected.has(part.id))
    item.classList.toggle('editor-layer-child', grouped)
    const eyeClosed = snapshot.isolated ? isHidden : directlyHidden.has(part.id)
    const label = eyeClosed ? t.showPart : t.hidePart
    const eye = control('togglePart', `${label} · ${name}`, eyeClosed ? 'hide' : 'show')
    const pick = control('selectPart', `${name} · ${part.design}`)
    pick.setAttribute('aria-pressed', String(snapshot.selected.has(part.id)))
    pick.draggable = true
    const swatch = document.createElement('i')
    swatch.style.backgroundColor = actions.colorOf(part)
    const title = document.createElement('span')
    title.textContent = name
    const design = document.createElement('small')
    design.textContent = part.design
    pick.append(swatch, title, design)
    const isLocked=snapshot.layers.lockedPartIds?.includes(part.id)===true;item.toggleAttribute('data-layer-locked',isLocked)
    const lock=control('toggleLock',actions.lockLabel(part.id),isLocked?'lock':'unlock');lock.setAttribute('aria-pressed',String(isLocked))
    item.append(eye,pick,lock,control('deletePart',`${t.delete} · ${name}`,'remove'))
    return item
  }

  function groupRow(group, members) {
    const open = !collapsed.has(group.id)
    const selected = members.length > 0 && members.every(part => snapshot.selected.has(part.id))
    const hidden = group.hidden || (members.length > 0 && members.every(part => snapshot.hidden.has(part.id)))
    const item = row('group', group.id, hidden, selected)
    const expand = control('expandGroup', open ? t.collapseGroup : t.expandGroup, open ? 'collapse' : 'expand')
    expand.setAttribute('aria-expanded', String(open))
    const label = group.hidden ? t.showGroup : t.hideGroup
    const eye = control('toggleGroup', `${label} · ${group.name}`, group.hidden ? 'hide' : 'show')
    const pick = control('selectGroup', group.name)
    pick.setAttribute('aria-pressed', String(selected))
    const title = document.createElement('span')
    title.textContent = group.name
    const count = document.createElement('small')
    count.textContent = members.length
    pick.innerHTML = svg('folder')
    pick.append(title, count)
    item.append(expand, eye, pick,
      control('renameGroup', `${t.renameGroup} · ${group.name}`, 'rename'),
      control('ungroup', `${t.ungroup} · ${group.name}`, 'ungroup'),
      control('deleteGroup', `${t.deleteGroup} · ${group.name}`, 'remove'))
    return item
  }

  function draw() {
    const focused = list.contains(document.activeElement) ? document.activeElement : undefined
    const focusedRow = focused?.closest('.editor-layer-row')
    const fragment = document.createDocumentFragment()
    const parts = new Map(snapshot.parts.map(part => [part.id, part]))
    const directlyHidden = new Set(snapshot.layers.hiddenPartIds)
    for (const group of snapshot.layers.groups) {
      const members = group.partIds.map(id => parts.get(id)).filter(Boolean)
      fragment.append(groupRow(group, members))
      if (!collapsed.has(group.id)) for (const part of members) fragment.append(partRow(part, true, directlyHidden))
      for (const part of members) parts.delete(part.id)
    }
    for (const part of parts.values()) fragment.append(partRow(part, false, directlyHidden))
    if (!fragment.childElementCount) {
      const empty = document.createElement('p')
      empty.className = 'editor-layers-empty'
      empty.textContent = t.noSceneParts
      fragment.append(empty)
    }
    list.replaceChildren(fragment)
    if (focusedRow) {
      const sameRow = [...list.children].find(item => item.className === focusedRow.className && item.dataset.id === focusedRow.dataset.id)
      sameRow?.querySelector(`[data-layer-action="${focused.dataset.layerAction}"]`)?.focus({ preventScroll: true })
    }
  }

  function rename(item) {
    const group = snapshot.layers.groups.find(group => group.id === item.dataset.id)
    const button = item.querySelector('[data-layer-action="selectGroup"]')
    const input = document.createElement('input')
    input.type = 'text'
    input.value = group.name
    input.maxLength = 80
    input.setAttribute('aria-label', t.renameGroup)
    button.replaceWith(input)
    input.focus()
    input.select()
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') input.blur()
      if (event.key === 'Escape') {
        input.value = group.name
        input.blur()
      }
    })
    input.addEventListener('blur', () => {
      input.replaceWith(button)
      const name = input.value.trim()
      if (name && name !== group.name) actions.renameGroup(group.id, name)
    }, { once: true })
  }

  body.addEventListener('click', event => {
    const button = event.target.closest('[data-layer-action]')
    if (!button) return
    const action = button.dataset.layerAction
    const item = button.closest('.editor-layer-row')
    const id = item?.dataset.id
    if (action === 'expandGroup') {
      if (collapsed.has(id)) collapsed.delete(id)
      else collapsed.add(id)
      draw()
      return
    }
    if (!editable) return
    if (action === 'renameGroup') rename(item)
    else actions[action](id, event.shiftKey || event.ctrlKey || event.metaKey)
  }, { signal })

  list.addEventListener('dragstart', event => {
    const part = event.target.closest('[data-layer-action="selectPart"]')
    if (!part || !editable) {
      event.preventDefault()
      return
    }
    const { id } = part.closest('.editor-layer-part').dataset
    dragIds = snapshot.selected.has(id) ? [...snapshot.selected] : [id]
    event.dataTransfer.setData('text/plain', part.title)
    event.dataTransfer.effectAllowed = 'move'
  }, { signal })
  list.addEventListener('dragend', () => { dragIds = undefined }, { signal })
  list.addEventListener('dragover', event => {
    if (!dragIds || !editable || !event.target.closest('.editor-layer-group')) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, { signal })
  list.addEventListener('drop', event => {
    const group = event.target.closest('.editor-layer-group')
    if (!dragIds || !editable || !group) return
    event.preventDefault()
    const { id } = group.dataset
    collapsed.delete(id)
    actions.moveToGroup(dragIds, id)
    dragIds = undefined
  }, { signal })

  return {
    render(next) {
      snapshot = next
      draw()
    },
    setEditable(value, isolated, hasHidden) {
      editable = value
      list.toggleAttribute('inert', !value)
      groupButton.disabled = !value
      isolateButton.disabled = !value || (!isolated && !snapshot?.selected.size)
      isolateButton.setAttribute('aria-pressed', String(isolated))
      isolateButton.title = isolated ? t.endIsolation : t.isolate
      isolateButton.setAttribute('aria-label', isolateButton.title)
      showAllButton.disabled = !value || !hasHidden
    },
  }
}
