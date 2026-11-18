import { Plane, Vector3 } from 'three'

export function mountCablePanel(panel, button, scene, language, save, signal) {
  const ru = language === 'ru'
  const cables = scene.motorCables
  panel.innerHTML = `<header>${ru ? 'Укладка проводов' : 'Cable routing'}<button data-close>×</button></header>
    <div data-drive="setup"><select aria-label="${ru ? 'Провод' : 'Cable'}"></select>
    <p>${ru ? 'Потяни за любой участок провода. Точки изгиба можно перемещать повторно. Поверни камеру, чтобы изменить глубину.' : 'Drag any cable segment or existing bend. Orbit the camera to adjust depth.'}</p>
    <button data-remove>${ru ? 'Удалить выбранный изгиб' : 'Remove selected bend'}</button>
    <button data-reset>${ru ? 'Сбросить укладку' : 'Reset route'}</button></div>`
  const select = panel.querySelector('select')
  const remove = panel.querySelector('[data-remove]')
  const reset = panel.querySelector('[data-reset]')
  let id, index = -1, drag
  const on = (node, type, fn, capture = false) => node.addEventListener(type, fn, { signal, capture })
  function choose(next) {
    id = next
    index = -1
    cables.select(id)
    select.value = id ?? ''
    buttons()
  }
  function buttons() {
    remove.disabled = index < 0
    reset.disabled = !cables.get(id)?.points.length
  }
  function refresh() {
    if (panel.hidden) return
    const ids = cables.ids()
    select.replaceChildren(...ids.map((key, i) => new Option((ru ? 'Провод ' : 'Cable ') + (i + 1), key)))
    if (!ids.length) select.add(new Option(ru ? 'Нет подключённых проводов' : 'No connected cables', ''))
    if (!ids.includes(id)) choose(ids[0])
    else select.value = id
    buttons()
  }
  function close() {
    drag = undefined
    panel.hidden = true
    choose(undefined)
    button.setAttribute('aria-pressed', 'false')
  }
  on(button, 'click', () => {
    if (!panel.hidden) return close()
    panel.hidden = false
    button.setAttribute('aria-pressed', 'true')
    refresh()
  })
  on(panel.querySelector('[data-close]'), 'click', close)
  on(select, 'change', () => choose(select.value))
  function write(points) {
    cables.select(id)
    save(id, points)
    buttons()
  }
  on(reset, 'click', () => { index = -1; write([]) })
  on(remove, 'click', () => {
    const points = cables.get(id)?.points.filter((_, i) => i !== index)
    index = -1
    if (points) write(points)
  })
  const canvas = scene.canvas
  const host = canvas.parentNode
  on(host, 'pointerdown', event => {
    if (panel.hidden || event.target !== canvas || event.button !== 0) return
    let hit
    for (const key of cables.ids()) {
      const cable = cables.get(key)
      const sample = (t, pointIndex) => {
        const point = cable.curve.getPoint(t)
        const screen = scene.project(point)
        if (!screen.visible) return
        const distance = Math.hypot(screen.clientX - event.clientX, screen.clientY - event.clientY)
        const score = distance - (pointIndex >= 0 ? 6 : 0)
        if (distance <= 12 && (!hit || score < hit.score)) hit = { key, t, pointIndex, point, score }
      }
      const segments = cable.points.length + 3
      for (let i = 1; i < segments * 32; i++) sample(i / (segments * 32), -1)
      cable.points.forEach((_, i) => sample((i + 2) / segments, i))
    }
    if (!hit) return
    event.stopImmediatePropagation()
    event.preventDefault()
    choose(hit.key)
    const cable = cables.get(id)
    const points = cable.points.slice()
    index = hit.pointIndex
    if (index < 0) {
      index = Math.max(0, Math.min(points.length, Math.floor(hit.t * (points.length + 3)) - 1))
      points.splice(index, 0, cable.local(hit.point))
    }
    const plane = new Plane().setFromNormalAndCoplanarPoint(scene.camera.getWorldDirection(new Vector3()), hit.point)
    drag = { pointer: event.pointerId, points, plane }
    canvas.setPointerCapture(event.pointerId)
    cables.preview(id, points)
    buttons()
  }, true)
  on(host, 'pointermove', event => {
    if (!drag || event.pointerId !== drag.pointer) return
    event.stopImmediatePropagation()
    const point = scene.pointer(event, false).ray.intersectPlane(drag.plane, new Vector3())
    if (point) {
      drag.points[index] = cables.get(id).local(point)
      cables.preview(id, drag.points)
    }
  }, true)
  on(host, 'pointerup', event => {
    if (!drag || event.pointerId !== drag.pointer) return
    event.stopImmediatePropagation()
    const points = drag.points
    drag = undefined
    write(points)
  }, true)
  on(host, 'pointercancel', () => { if (drag) { drag = undefined; choose(id) } }, true)
  return { close, refresh }
}
