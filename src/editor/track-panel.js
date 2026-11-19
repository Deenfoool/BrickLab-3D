import { isTread, sprockets } from '../mechanics/treads.js?v=track-builder'
import { oppositeSprockets, planTrackAssembly, treadChains } from './track-assembly.js?v=level-treads'

export const trackLabels = {
  ru: {
    tool: 'Гусеница', name: 'Собрать гусеницу', start: 'Собрать с нуля', reuse: 'Замкнуть начатую',
    first: 'Первая звёздочка', second: 'Вторая звёздочка', choose: 'Выбери в списке или на сцене',
    chain: 'Начатая цепочка', design: 'Звено', count: 'Количество звеньев', auto: 'Авто',
    adjust: 'Предлагать выравнивание звёздочек', repeat: 'Повторить на другой стороне',
    preparing: 'Загружаю звенья…', done: n => `Гусеница собрана · ${n} звеньев`,
    ready: (n, g) => `${n} звеньев · учтено катков: ${g}`,
    change: (a, r) => `Добавить ${a}, убрать ${r}`,
    uneven: 'При этой геометрии нижняя ветвь остаётся изогнутой.',
    shift: value => `Сдвиг второй звёздочки: ${value} мм`, phase: 'Поворот второй звёздочки на 90°',
    chainName: (index, n) => `Цепочка ${index} · ${n} звеньев`,
    errors: {
      pair: 'Выбери две одинаковые звёздочки 40,4 в списке или на сцене.',
      chain: 'Выбери начатую цепочку в списке или щёлкни по её звену.',
      parallel: 'Оси звёздочек должны быть параллельны.',
      distance: 'Расстояние между звёздочками не подходит для этого инструмента.',
      count: 'Укажи целое число звеньев от 8 до 160 или оставь поле пустым.',
      closure: 'При этих положениях и количестве звеньев лента не замыкается. Включи выравнивание или попробуй автоподбор.',
      occupied: 'На этом контуре уже есть звенья. Выбери «Замкнуть начатую».',
      attachments: 'На звеньях есть внешние крепления. Отсоедини их перед перекладкой.',
      mount: 'Предлагаемый сдвиг нарушает крепление звёздочки. Выровняй её вручную.',
      load: 'Не удалось загрузить модель звена.',
    },
    plane: value => `Плоскости звёздочек расходятся на ${value} мм. Выровняй их или включи выравнивание.`,
  },
  en: {
    tool: 'Track', name: 'Build track', start: 'Build from scratch', reuse: 'Close an existing chain',
    first: 'First sprocket', second: 'Second sprocket', choose: 'Choose from the list or scene',
    chain: 'Existing chain', design: 'Tread', count: 'Link count', auto: 'Auto',
    adjust: 'Suggest sprocket alignment', repeat: 'Repeat on the other side',
    preparing: 'Loading treads…', done: n => `Track built · ${n} links`,
    ready: (n, g) => `${n} links · support rollers used: ${g}`,
    change: (a, r) => `Add ${a}, remove ${r}`,
    uneven: 'This geometry leaves a curved lower run.',
    shift: value => `Second sprocket shift: ${value} mm`, phase: 'Second sprocket turned 90°',
    chainName: (index, n) => `Chain ${index} · ${n} links`,
    errors: {
      pair: 'Pick two matching 40.4 sprockets in the list or scene.',
      chain: 'Choose a chain in the list or click one of its treads.',
      parallel: 'The sprocket axes must be parallel.',
      distance: 'This sprocket spacing is outside the tool’s range.',
      count: 'Enter a whole number from 8 to 160 or leave the field blank.',
      closure: 'This position and link count do not close the track. Enable alignment or try automatic counting.',
      occupied: 'This track already contains treads. Choose “Close an existing chain”.',
      attachments: 'Some treads have external connections. Detach those before rerouting.',
      mount: 'The proposed adjustment would break the sprocket mount. Align it manually.',
      load: 'Could not load the tread model.',
    },
    plane: value => `The sprocket planes differ by ${value} mm. Align them or enable alignment.`,
  },
}

export function mountTrackPanel(root, { language, nameOf, colorOf, prepare, preview, apply, signal }) {
  const t = trackLabels[language]
  root.innerHTML = `
    <select data-track="mode" aria-label="${t.name}"><option value="new">${t.start}</option><option value="reuse">${t.reuse}</option></select>
    <label>${t.first}<select data-track="first"></select></label>
    <label>${t.second}<select data-track="second"></select></label>
    <label data-track="chainField" hidden>${t.chain}<select data-track="chain"></select></label>
    <label>${t.design}<select data-track="design"></select></label>
    <label>${t.count}<input data-track="count" type="number" min="8" max="160" step="1" placeholder="${t.auto}"></label>
    <label class="editor-track-adjust"><input data-track="adjust" type="checkbox" checked>${t.adjust}</label>
    <p data-track="status" role="status"></p>
    <button type="button" data-track="build" disabled>${t.name}</button>
    <button type="button" data-track="repeat" hidden>${t.repeat}</button>`
  const el = key => root.querySelector(`[data-track="${key}"]`)
  const fields = Object.fromEntries(['mode', 'first', 'second', 'chain', 'design', 'count', 'adjust',
    'chainField', 'status', 'build', 'repeat'].map(key => [key, el(key)]))
  const format = new Intl.NumberFormat(language, { maximumFractionDigits: 2 })
  const visible = part => !hidden.has(part.id)
  let state, hidden, active, current, last, chains = []
  let version = 0

  fields.design.replaceChildren(...['57518', '88323'].map(design => new Option(`${nameOf(design)} (${design})`, design)))

  function clear() {
    version++
    current = undefined
    fields.build.disabled = true
    preview(null)
  }

  function refreshChoices() {
    const wheels = state.parts.filter(part => visible(part) && sprockets[part.design])
    for (const select of [fields.first, fields.second]) {
      const value = select.value
      select.replaceChildren(new Option(t.choose, ''), ...wheels.map((part, index) =>
        new Option(`${index + 1}. ${nameOf(part.design)} (${part.design})`, part.id)))
      select.value = wheels.some(part => part.id === value) ? value : ''
    }
    const chainValue = fields.chain.value
    chains = treadChains(state.parts, state.links).filter(chain => chain.every(visible)).sort((a, b) => b.length - a.length)
    fields.chain.replaceChildren(new Option(t.choose, ''), ...chains.map((chain, i) =>
      new Option(t.chainName(i + 1, chain.length), chain[0].id)))
    fields.chain.value = chains.some(chain => chain[0].id === chainValue) ? chainValue : ''
    fields.repeat.hidden = !last || !oppositeSprockets(state.parts.filter(visible), last.wheels).length
  }

  async function inspect() {
    clear()
    const request = version
    const reuseMode = fields.mode.value === 'reuse'
    fields.chainField.hidden = !reuseMode
    const reuse = fields.chain.value
    const wheelIds = [fields.first.value, fields.second.value]
    if (wheelIds.some(id => !id) || wheelIds[0] === wheelIds[1]) {
      fields.status.textContent = t.errors.pair
      return
    }
    if (reuseMode && !reuse) {
      fields.status.textContent = t.errors.chain
      return
    }
    const count = fields.count.value === '' ? undefined : fields.count.valueAsNumber
    const design = fields.design.value
    const result = planTrackAssembly(state, { wheelIds, reuse: reuseMode && reuse,
      design, count, adjust: fields.adjust.checked, color: colorOf(design), hidden })
    if (result.reason) {
      fields.status.textContent = result.reason === 'plane' ? t.plane(format.format(Math.abs(result.offset) * .4))
        : t.errors[result.reason]
      return
    }
    fields.status.textContent = t.preparing
    try {
      await Promise.all([...new Set(result.treads.map(part => part.design))].map(prepare))
    } catch {
      if (request === version) fields.status.textContent = t.errors.load
      return
    }
    if (request !== version || signal.aborted) return
    current = result
    fields.build.disabled = false
    fields.status.textContent = [t.ready(result.treads.length, result.guides),
      reuseMode && t.change(result.added, result.removed),
      result.shift > .005 && t.shift(format.format(result.shift * .4)), result.phase && t.phase,
      result.groundFlat === false && t.uneven].filter(Boolean).join(' · ')
    preview(result)
  }

  for (const key of ['mode', 'first', 'second', 'chain', 'design', 'count', 'adjust']) {
    fields[key].addEventListener('change', inspect, { signal })
  }
  fields.build.addEventListener('click', () => {
    const plan = current
    if (!plan) return
    last = { wheels: [fields.first.value, fields.second.value].map(id => state.parts.find(part => part.id === id)),
      count: plan.treads.length, design: fields.design.value }
    fields.first.value = fields.second.value = fields.chain.value = ''
    clear()
    apply(plan)
    fields.status.textContent = t.done(plan.treads.length)
  }, { signal })
  fields.repeat.addEventListener('click', () => {
    const [a, b] = oppositeSprockets(state.parts.filter(visible), last.wheels)
    if (!a || !b) return
    fields.first.value = a
    fields.second.value = b
    fields.design.value = last.design
    fields.count.value = last.count
    fields.mode.value = 'new'
    inspect()
  }, { signal })

  return {
    pick(id) {
      const part = state.parts.find(item => item.id === id)
      if (!part || !visible(part)) return
      if (sprockets[part.design]) {
        if (!fields.first.value || fields.second.value) {
          fields.first.value = id
          fields.second.value = ''
        } else if (fields.first.value !== id) fields.second.value = id
      } else if (isTread(part.design)) {
        const chain = chains.find(items => items.some(item => item.id === part.id))
        if (!chain) return
        fields.mode.value = 'reuse'
        fields.chain.value = chain[0].id
      } else return
      inspect()
    },
    render(show, next, nextHidden, selection) {
      root.hidden = !show
      if (!show) {
        if (active) clear()
        active = false
        return
      }
      if (active && state === next && hidden === nextHidden) return
      const entering = !active
      active = true
      state = next
      hidden = nextHidden
      refreshChoices()
      if (entering) {
        const picked = next.parts.filter(p => selection.includes(p.id) && sprockets[p.design] && visible(p))
        if (picked.length === 2) [fields.first.value, fields.second.value] = picked.map(p => p.id)
        const chain = chains.find(items => items.some(p => selection.includes(p.id)))
        if (chain) {
          fields.mode.value = 'reuse'
          fields.chain.value = chain[0].id
        }
      }
      inspect()
    },
  }
}
