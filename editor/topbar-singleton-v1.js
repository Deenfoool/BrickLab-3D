export const TOPBAR_SINGLETON_VERSION = 'topbar-singleton-v1.1.0'

const ROOT_SELECTOR = '#app'
const BAR_SELECTOR = '.topbar'
const LEGACY_ACTION_IDS = Object.freeze(['newBtn', 'saveBtn', 'exportBtn', 'shortcutsBtn'])
const REMOVED_TOPBAR_IDS = Object.freeze(['demoProjectBtn', 'transmissionControl'])
const STYLE_ID = 'bricklab-topbar-singleton-v1-style'

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
#app .topbar .legacy-topbar-action-bridge {
  display: none !important;
}
`
  document.head.append(style)
}

function hideLegacyActionBridges(primary) {
  for (const id of LEGACY_ACTION_IDS) {
    const button = document.getElementById(id)
    if (!button || !primary.contains(button)) continue
    button.classList.add('legacy-topbar-action-bridge')
    button.hidden = true
    button.tabIndex = -1
    button.setAttribute('aria-hidden', 'true')
  }
}

function removeRetiredTopbarControls(primary) {
  for (const id of REMOVED_TOPBAR_IDS) {
    const element = document.getElementById(id)
    if (element && primary.contains(element)) element.remove()
  }
}

function canonicalizeTopbar() {
  const root = document.querySelector(ROOT_SELECTOR)
  if (!root) return null

  const bars = [...root.querySelectorAll(BAR_SELECTOR)]
  const primary = bars.find(bar => bar.dataset.bricklabTopbar === 'production') || bars[0] || null
  if (!primary) return null

  primary.dataset.bricklabTopbar = 'production'
  primary.dataset.bricklabTopbarVersion = TOPBAR_SINGLETON_VERSION

  for (const bar of bars) {
    if (bar !== primary) bar.remove()
  }

  removeRetiredTopbarControls(primary)
  hideLegacyActionBridges(primary)
  return primary
}

ensureStyle()
const primary = canonicalizeTopbar()
const root = document.querySelector(ROOT_SELECTOR)
const observer = root ? new MutationObserver(() => canonicalizeTopbar()) : null
observer?.observe(root, { childList: true, subtree: true })

globalThis.BrickLabTopbar = Object.freeze({
  version: TOPBAR_SINGLETON_VERSION,
  element: () => canonicalizeTopbar(),
  count: () => document.querySelectorAll(`${ROOT_SELECTOR} ${BAR_SELECTOR}`).length,
  legacyActionIds: LEGACY_ACTION_IDS,
  removedTopbarIds: REMOVED_TOPBAR_IDS,
})

globalThis.dispatchEvent?.(new CustomEvent('bricklab:topbarready', {
  detail: { version: TOPBAR_SINGLETON_VERSION, primary: Boolean(primary) },
}))
