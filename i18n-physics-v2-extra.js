import { getLanguage } from './i18n.js'

const EN_RU = new Map([
  ['SURFACE','ПОКРЫТИЕ'],['AUTO · TEST DEFAULT','АВТО · ПО УМОЛЧАНИЮ ТЕСТА'],['CONCRETE','БЕТОН'],['ASPHALT','АСФАЛЬТ'],['DIRT','ГРУНТ'],['GRAVEL','ГРАВИЙ'],['MUD','ГРЯЗЬ'],['ICE','ЛЁД'],
  ['OVERLOAD','ПЕРЕГРУЗКА'],['WARN / SLIP','ПРЕДУПР. / ПРОСКАЛЬЗЫВАНИЕ'],['BREAK','РАЗРУШЕНИЕ'],
  ['DRIVETRAIN STRESS · REQUEST · TRANSFER · LIMIT','НАГРУЗКА ТРАНСМИССИИ · ЗАПРОС · ПЕРЕДАЧА · ПРЕДЕЛ'],['FAILED','СЛОМАНО'],
  ['DYNO · RPM · TORQUE · POWER · CURRENT','ДИНО · RPM · МОМЕНТ · МОЩНОСТЬ · ТОК'],['CURRENT','ТОК']
])
const RU_EN = new Map([...EN_RU].map(([en, ru]) => [ru, en]))

function translateNode(node) {
  if (node.nodeType !== Node.TEXT_NODE) return
  const source = node.nodeValue
  const core = source.trim()
  if (!core) return
  const map = getLanguage() === 'ru' ? EN_RU : RU_EN
  const translated = map.get(core)
  if (translated) node.nodeValue = source.replace(core, translated)
}

function apply(root = document.body) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const nodes = []
  while (walker.nextNode()) nodes.push(walker.currentNode)
  nodes.forEach(translateNode)
}

let queued = false
const schedule = () => {
  if (queued) return
  queued = true
  requestAnimationFrame(() => { queued = false; apply() })
}
new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, characterData: true })
window.addEventListener('bricklab:languagechange', schedule)
apply()
