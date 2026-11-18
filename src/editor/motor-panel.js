import { compatibleSupply, controlPlusBodies, controlPlusHubs, hubSettings, motorSettings, motorSupply } from '../mechanics/motors.js'

export function mountMotorPanel(root, { language, read, change, signal }) {
  const ru = language === 'ru'
  root.innerHTML = `
    <div data-hub hidden>
      <label><input data-on type="checkbox"> ${ru ? 'Питание хаба' : 'Hub power'}</label>
      <label>${ru ? 'Заряд батарей, %' : 'Battery charge, %'} <input data-battery type="number" min="0" max="100" value="100"></label>
    </div>
    <div data-motor hidden>
      <label>${ru ? 'Кабель к хабу' : 'Cable to hub'} <select data-hub-id></select></label>
      <label>${ru ? 'Порт' : 'Port'} <select data-port><option value="0">A</option><option value="1">B</option><option value="2">C</option><option value="3">D</option></select></label>
      <label>${ru ? 'Мощность и реверс, %' : 'Power and reverse, %'} <input data-power type="range" min="-100" max="100" step="1" value="0"><output data-power-value></output></label>
      <label>${ru ? 'При нулевой мощности' : 'At zero power'} <select data-stop>
        <option value="coast">${ru ? 'Свободный ход' : 'Coast'}</option>
        <option value="brake">${ru ? 'Тормоз' : 'Brake'}</option>
        <option value="hold">${ru ? 'Удержание угла' : 'Hold position'}</option>
      </select></label>
      <button type="button" data-stop-now>${ru ? 'Остановить мотор' : 'Stop motor'}</button>
      <p data-status role="status"></p>
      <fieldset><legend>${ru ? 'Изгиб кабеля' : 'Cable bend'}</legend>
        ${['X','Y','Z'].map(axis => `<label>${axis}<input data-bend="${axis}" type="range" min="-200" max="200" step="2"></label>`).join('')}
      </fieldset><small>${ru ? 'Расчётная модель 9 В. Нагрузка и торможение работают в «Физике сборки». Кабель назначается выбором хаба и порта.' : 'Approximate 9 V model. Load and braking operate in Assembly Physics. Assign a cable by selecting its hub and port.'}</small>
    </div>`
  const el = name => root.querySelector(`[data-${name}]`)
  let selected
  const update = patch => {
    const part = read().find(part => part.id === selected)
    if (part) change(part.id, { ...part.electric, ...patch })
  }
  for (const [name, key] of [['battery', 'battery'], ['port', 'port'], ['power', 'power']]) {
    el(name).addEventListener('change', event => update({ [key]: Number(event.target.value) }), { signal })
  }
  const bends = Array.from(root.querySelectorAll('[data-bend]'))
  for (const input of bends) input.addEventListener('change', () => update({ bend: bends.map(item => Number(item.value)) }), { signal })
  el('power').addEventListener('input', event => { el('power-value').textContent = event.target.value + '%' }, { signal })
  el('on').addEventListener('change', event => update({ on: event.target.checked }), { signal })
  el('hub-id').addEventListener('change', event => update({ hubId: event.target.value }), { signal })
  el('stop').addEventListener('change', event => update({ stop: event.target.value }), { signal })
  el('stop-now').addEventListener('click', () => update({ power: 0 }), { signal })
  return {
    render(part, parts) {
      selected = part?.id
      const motor = controlPlusBodies.has(part?.design)
      const hub = controlPlusHubs.has(part?.design)
      root.hidden = !motor && !hub
      el('hub').hidden = !hub
      el('motor').hidden = !motor
      if (hub) {
        const settings = hubSettings(part)
        el('on').checked = settings.on
        el('battery').value = settings.battery
      }
      if (!motor) return
      const settings = motorSettings(part)
      const supply = motorSupply(part, parts)
      bends.forEach((input, i) => { input.value = part.electric?.bend?.[i] ?? 0 })
      el('port').disabled = part.design === '10089c01'
      const options = [new Option(ru ? 'Не подключён' : 'Disconnected', ''),
        ...parts.filter(hub => compatibleSupply(part.design, hub.design)).map((hub, index) =>
          new Option(`${part.design === '10089c01' ? 'PF' : 'Control+'} ${hub.design} · ${index + 1}`, hub.id))]
      el('hub-id').replaceChildren(...options)
      el('hub-id').value = settings.hubId
      el('port').value = settings.port
      el('power').value = settings.power
      el('power-value').textContent = settings.power + '%'
      el('stop').value = settings.stop
      const reasons = ru ? { port: 'Порт занят несколькими моторами.', cable: 'Подключи кабель к хабу.', off: 'Хаб выключен.', battery: 'Батареи разряжены.' }
        : { port: 'Multiple motors occupy this port.', cable: 'Connect the cable to a hub.', off: 'Hub is off.', battery: 'Battery is empty.' }
      el('status').textContent = supply.reason ? reasons[supply.reason]
        : `${ru ? 'Подключён' : 'Connected'} · ${'ABCD'[settings.port]} · ${Math.round(supply.speed * 30 / Math.PI)} ${ru ? 'об/мин без нагрузки' : 'rpm unloaded'}`
    },
  }
}
