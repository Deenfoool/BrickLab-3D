import { showMainMenu as showMainMenuV4, BrickLabMainMenuV4 } from './main-menu-v4.js?v=hero-reducer-20260910-v1'

const LOGO_URL = new URL('../assets/menu/bricklab-3d.png?v=main-menu-20260910-v5', import.meta.url).href
const STYLE_ID = 'bricklab-main-menu-v5-overrides'

function ensureOverrides() {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    #bricklab-main-menu-v4 .bl4-title {
      width: min(520px, 54vw);
      max-width: 92%;
      margin: 0;
      text-indent: 0;
      letter-spacing: 0;
      line-height: 0;
      font-size: 0;
      text-transform: none;
    }
    #bricklab-main-menu-v4 .bl4-title .bl5-logo {
      display: block;
      width: 100%;
      height: auto;
      object-fit: contain;
    }
    #bricklab-main-menu-v4 .bl4-center {
      padding-top: 24px;
    }
    @media (max-height: 820px) {
      #bricklab-main-menu-v4 .bl4-center { padding-top: 9px; }
      #bricklab-main-menu-v4 .bl4-title { width: min(460px, 52vw); }
    }
    @media (max-width: 980px) {
      #bricklab-main-menu-v4 .bl4-title { width: min(440px, 58vw); }
    }
    @media (max-width: 760px) {
      #bricklab-main-menu-v4 .bl4-title { width: min(420px, 88vw); }
    }
  `
  document.head.append(style)
}

function cleanMenu(menu) {
  if (!menu) return

  for (const selector of [
    '.bl4-sub',
    '.bl4-hero-meta',
    '.bl4-nav',
    '.bl4-tag',
    '.bl4-right',
    '.bl4-footer-left',
  ]) {
    menu.querySelector(selector)?.remove()
  }

  const title = menu.querySelector('.bl4-title')
  if (title && !title.querySelector('.bl5-logo')) {
    title.replaceChildren()
    const logo = document.createElement('img')
    logo.className = 'bl5-logo'
    logo.src = LOGO_URL
    logo.alt = 'BrickLab 3D'
    logo.width = 2172
    logo.height = 724
    logo.decoding = 'async'
    title.append(logo)
  }

  menu.querySelector('.bl4-hero-canvas')?.removeAttribute('aria-label')
}

function watchMenu() {
  ensureOverrides()

  const existing = document.getElementById('bricklab-main-menu-v4')
  if (existing) cleanMenu(existing)

  const observer = new MutationObserver(() => {
    const menu = document.getElementById('bricklab-main-menu-v4')
    if (menu) cleanMenu(menu)
  })
  observer.observe(document.documentElement, { childList: true, subtree: true })
  return observer
}

export async function showMainMenu() {
  const observer = watchMenu()
  try {
    return await showMainMenuV4()
  } finally {
    observer.disconnect()
  }
}

export const BrickLabMainMenuV5 = Object.freeze({
  ...BrickLabMainMenuV4,
  logoUrl: LOGO_URL,
})
