import { beltLayout, grooveKey, grooveOf } from '../mechanics/belts.js?v=belt-drive'

export function mountBeltPanel(root, { t, language, nameOf, preview, add, remove, signal }) {
  root.innerHTML = `
    <label>${t.beltDrive}<select data-belt="first"></select></label>
    <label>${t.beltDriven}<select data-belt="second"></select></label>
    <p data-belt="status" role="status"></p>
    <button type="button" data-belt="connect">${t.beltConnect}</button>
    <div data-belt="list"></div>`
  const control = key => root.querySelector(`[data-belt="${key}"]`)
  const first = control('first')
  const second = control('second')
  const status = control('status')
  const connect = control('connect')
  const list = control('list')
  const format = new Intl.NumberFormat(language, { maximumFractionDigits: 2 })
  let parts = new Map()
  let names = new Map()
  let occupied = new Set()
  let choiceParts
  let current

  const endpoint = id => ({ part: id, groove: 'rim' })
  function inspect() {
    const a = endpoint(first.value)
    const b = endpoint(second.value)
    const plan = a.part !== b.part && beltLayout(grooveOf(parts.get(a.part)), grooveOf(parts.get(b.part)))
    const reason = !first.value ? 'first' : !second.value ? 'second' : !plan ? 'same' :
      [a, b].some(end => occupied.has(grooveKey(end))) ? 'occupied' : plan.reason
    connect.disabled = Boolean(reason)
    status.textContent = reason ? t.beltStatus[reason] : t.beltFit(format.format(Math.abs(plan.ratio)), format.format(plan.length * .4))
    preview(reason ? null : plan)
    return reason ? null : { a, b }
  }

  for (const select of [first, second]) select.addEventListener('change', inspect, { signal })
  connect.addEventListener('click', () => {
    const endpoints = inspect()
    if (!endpoints) return
    if (!add({ id: crypto.randomUUID(), ...endpoints })) {
      status.textContent = t.beltStatus.conflict
      return
    }
    first.value = ''
    second.value = ''
    inspect()
  }, { signal })
  list.addEventListener('click', event => {
    const id = event.target.closest('button[data-remove-belt]')?.dataset.removeBelt
    if (id) remove(id)
  }, { signal })

  return {
    pick(id) {
      if (root.hidden) return
      if (!grooveOf(parts.get(id))) {
        status.textContent = t.beltStatus.groove
        return
      }
      if (!first.value || second.value) {
        first.value = id
        second.value = ''
      } else {
        second.value = id
      }
      inspect()
    },
    render(active, items, belts) {
      root.hidden = !active
      if (!active) {
        current = undefined
        preview(null)
        return
      }
      if (choiceParts !== items) {
        choiceParts = items
        parts = new Map(items.map(part => [part.id, part]))
        const choices = items.filter(part => grooveOf(part))
        names = new Map(choices.map((part, index) => [part.id, `${index + 1}. ${nameOf(part).split(' · ')[0]}`]))
        for (const select of [first, second]) {
          const selected = select.value
          select.replaceChildren(new Option(t.beltChoose, ''), ...choices.map(part =>
            new Option(`${names.get(part.id)} (${part.design})`, part.id)))
          select.value = parts.has(selected) ? selected : ''
        }
      }
      if (current !== belts) {
        current = belts
        occupied = new Set(belts.flatMap(({ record }) => [grooveKey(record.a), grooveKey(record.b)]))
        list.replaceChildren(...belts.map(({ record, ratio }) => {
          const row = document.createElement('div')
          const label = document.createElement('small')
          label.textContent = `${names.get(record.a.part)} → ${names.get(record.b.part)} · ×${format.format(Math.abs(ratio))}`
          const button = document.createElement('button')
          button.className = 'editor-danger'
          button.type = 'button'
          button.dataset.removeBelt = record.id
          button.textContent = t.beltRemove
          row.append(label, button)
          return row
        }))
      }
      inspect()
    },
  }
}
