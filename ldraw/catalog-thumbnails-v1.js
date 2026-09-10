const ROOT_SELECTOR = '#ldrawCatalogV3'
const IMAGE_ROOT = 'https://www.ldraw.org/library/official/images/parts/'
const STYLE_ID = 'bricklab-ldraw-catalog-thumbnails-v1-css'
let observer = null

function installStyles() {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    #ldrawCatalogV3 .ld2-thumb{isolation:isolate}
    #ldrawCatalogV3 .ld2-thumb .ldraw-thumb-image{position:absolute;inset:3px;width:calc(100% - 6px);height:calc(100% - 6px);object-fit:contain;opacity:0;transform:scale(.96);transition:opacity .16s ease,transform .16s ease;filter:drop-shadow(0 5px 5px rgba(0,0,0,.34));z-index:1}
    #ldrawCatalogV3 .ld2-thumb.has-ldraw-image .ldraw-thumb-image{opacity:1;transform:scale(1)}
    #ldrawCatalogV3 .ld2-thumb.has-ldraw-image>svg{opacity:0}
    #ldrawCatalogV3 .ld2-thumb>b{z-index:2}
    #ldrawCatalogV3.is-grid .ld2-thumb.has-ldraw-image{background:radial-gradient(circle at 48% 35%,#3c4648 0,#232a2d 55%,#151a1c 100%)}
    #ldrawCatalogV3.is-list .ld2-thumb .ldraw-thumb-image{inset:2px;width:calc(100% - 4px);height:calc(100% - 4px)}
    @media(prefers-reduced-motion:reduce){#ldrawCatalogV3 .ld2-thumb .ldraw-thumb-image{transition:none}}
  `
  document.head.append(style)
}

function decorate(card) {
  if (!(card instanceof HTMLElement) || card.dataset.ldrawThumb === 'true') return
  const file = card.dataset.file || ''
  const code = file.replace(/^parts\//i, '').replace(/\.dat$/i, '').trim()
  const thumb = card.querySelector('.ld2-thumb')
  if (!code || !thumb) return
  card.dataset.ldrawThumb = 'true'

  const image = document.createElement('img')
  image.className = 'ldraw-thumb-image'
  image.alt = ''
  image.loading = 'lazy'
  image.decoding = 'async'
  image.referrerPolicy = 'no-referrer'
  image.src = `${IMAGE_ROOT}${encodeURIComponent(code)}.png`
  image.addEventListener('load', () => thumb.classList.add('has-ldraw-image'), { once: true })
  image.addEventListener('error', () => image.remove(), { once: true })
  thumb.prepend(image)
}

function decorateAll(root) {
  root.querySelectorAll('.ld2-card[data-file]').forEach(decorate)
}

function install() {
  const root = document.querySelector(ROOT_SELECTOR)
  if (!root) {
    requestAnimationFrame(install)
    return
  }
  if (root.dataset.ldrawThumbnails === 'true') return
  root.dataset.ldrawThumbnails = 'true'
  installStyles()
  decorateAll(root)
  observer = new MutationObserver(() => decorateAll(root))
  const results = root.querySelector('[data-results]') || root
  observer.observe(results, { childList: true, subtree: true })
}

install()
