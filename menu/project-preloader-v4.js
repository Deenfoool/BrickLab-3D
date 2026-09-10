const LOADER_ID = 'bricklab-project-loader-v4'
const STYLE_ID = 'bricklab-project-loader-style-v4'
const AUDIO_CANDIDATES = ['./assets/audio/music/workbench.ogg']
const VIDEO_CANDIDATES = ['./assets/menu/background.webm', './assets/menu/background.mp4']
const MENU_ASSETS = ['./menu/main-menu-v4.js?v=main-menu-20260910-v4', './menu/main-menu-v4.css']

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
#${LOADER_ID}{position:fixed;inset:0;z-index:9000;overflow:hidden;background:#070b0d;color:#e9f3f0;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;opacity:1;transition:opacity .28s ease}
#${LOADER_ID}.is-leaving{opacity:0;pointer-events:none}#${LOADER_ID} *{box-sizing:border-box}
.bl-load-top{position:absolute;top:27px;left:50%;width:min(430px,42vw);transform:translateX(-50%);display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center}.bl-load-track{height:4px;border-radius:999px;background:rgba(255,255,255,.13);overflow:hidden;box-shadow:inset 0 0 9px rgba(0,0,0,.34)}.bl-load-fill{display:block;width:0;height:100%;border-radius:inherit;background:#67f2cb;box-shadow:0 0 18px rgba(103,242,203,.35);transition:width .11s linear}.bl-load-percent{min-width:34px;color:#7d8985;font-size:11px;font-variant-numeric:tabular-nums}.bl-load-center{position:absolute;left:50%;top:48%;transform:translate(-50%,-50%);text-align:center}.bl-load-logo{margin:0;text-transform:uppercase;font-size:clamp(32px,4vw,58px);font-weight:300;letter-spacing:.3em;text-indent:.3em}.bl-load-logo em{font-style:normal;font-weight:650;color:#67f2cb}.bl-load-stage{margin-top:18px;color:#7b8783;font-size:9px;letter-spacing:.32em;text-transform:uppercase;white-space:nowrap}.bl-load-count{margin-top:9px;color:#515c58;font-size:9px;font-variant-numeric:tabular-nums}.bl-load-orbit{position:absolute;left:50%;top:62%;width:260px;height:72px;transform:translate(-50%,-50%) rotateX(72deg);border:1px solid rgba(103,242,203,.12);border-radius:50%;box-shadow:0 0 42px rgba(103,242,203,.035)}.bl-load-orbit:before,.bl-load-orbit:after{content:"";position:absolute;inset:16%;border:1px solid rgba(142,167,160,.1);border-radius:50%}.bl-load-orbit:after{inset:34%}
@media(max-width:760px){.bl-load-top{width:calc(100vw - 44px)}.bl-load-stage{white-space:normal;line-height:1.7}.bl-load-orbit{width:210px}}@media(prefers-reduced-motion:reduce){#${LOADER_ID}{transition:none}.bl-load-fill{transition:none}}
`
  document.head.append(style)
}

function readImportMap() {
  const node = document.querySelector('script[type="importmap"]')
  if (!node) return {}
  try { return JSON.parse(node.textContent || '{}').imports || {} } catch { return {} }
}

function resolveMapped(specifier, baseUrl, imports) {
  if (!specifier) return null
  if (imports[specifier]) return new URL(imports[specifier], location.href).href
  if (specifier.startsWith('.') || specifier.startsWith('/')) {
    const absolute = new URL(specifier, baseUrl).href
    for (const [key, target] of Object.entries(imports)) {
      if (key.endsWith('/')) continue
      try {
        if (new URL(key, location.href).href === absolute) return new URL(target, location.href).href
      } catch { /* invalid map entry */ }
    }
    return absolute
  }
  const prefix = Object.keys(imports)
    .filter(key => key.endsWith('/') && specifier.startsWith(key))
    .sort((a, b) => b.length - a.length)[0]
  if (prefix) return new URL(imports[prefix] + specifier.slice(prefix.length), location.href).href
  if (/^(https?:)?\/\//.test(specifier)) return new URL(specifier, location.href).href
  return null
}

function moduleSpecifiers(source) {
  const found = new Set()
  const patterns = [
    /(?:import|export)\s+(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/g,
    /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ]
  for (const pattern of patterns) {
    let match
    while ((match = pattern.exec(source))) found.add(match[1])
  }
  return [...found]
}

function isJavaScript(url) {
  try { return /\.(?:m?js)(?:$|\?)/i.test(new URL(url).pathname + new URL(url).search) } catch { return false }
}

function initialResources(imports) {
  const urls = new Set()
  for (const [key, target] of Object.entries(imports)) {
    if (key.includes('/tests/') || key === './bootstrap.js' || key.endsWith('/')) continue
    const url = resolveMapped(key, location.href, imports) || new URL(target, location.href).href
    if (isJavaScript(url)) urls.add(url)
  }
  for (const asset of MENU_ASSETS) urls.add(new URL(asset, location.href).href)
  for (const asset of AUDIO_CANDIDATES) urls.add(new URL(asset, location.href).href)
  return [...urls]
}

async function consume(response, progress) {
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const totalBytes = Number(response.headers.get('content-length')) || 0
  const type = response.headers.get('content-type') || ''
  if (!response.body?.getReader) {
    const data = await response.arrayBuffer()
    progress(1)
    return type.includes('javascript') || type.includes('text/') ? new TextDecoder().decode(data) : null
  }
  const reader = response.body.getReader()
  const chunks = []
  let received = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    received += value.byteLength
    if (totalBytes) progress(Math.min(.98, received / totalBytes))
  }
  progress(1)
  if (!type.includes('javascript') && !type.includes('text/')) return null
  const merged = new Uint8Array(received)
  let offset = 0
  for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength }
  return new TextDecoder().decode(merged)
}

async function existingVideo() {
  for (const candidate of VIDEO_CANDIDATES) {
    const url = new URL(candidate, location.href).href
    try {
      const response = await fetch(url, { method: 'HEAD', cache: 'no-cache' })
      if (response.ok) return url
    } catch { /* optional */ }
  }
  return null
}

export function createProjectPreloader() {
  ensureStyle()
  const root = document.createElement('section')
  root.id = LOADER_ID
  root.setAttribute('aria-label', 'Загрузка BrickLab 3D')
  root.innerHTML = `<div class="bl-load-top"><div class="bl-load-track"><span class="bl-load-fill"></span></div><span class="bl-load-percent">0%</span></div><div class="bl-load-center"><h1 class="bl-load-logo">BrickLab <em>3D</em></h1><div class="bl-load-stage">Подготовка проекта</div><div class="bl-load-count">0 файлов</div></div><div class="bl-load-orbit" aria-hidden="true"></div>`
  document.body.append(root)

  const fill = root.querySelector('.bl-load-fill')
  const percent = root.querySelector('.bl-load-percent')
  const stage = root.querySelector('.bl-load-stage')
  const count = root.querySelector('.bl-load-count')
  let shown = 0
  let completed = 0
  let total = 1

  const render = (fraction, label = null) => {
    shown = Math.max(shown, Math.min(.985, Number(fraction) || 0))
    fill.style.width = `${(shown * 100).toFixed(1)}%`
    percent.textContent = `${Math.floor(shown * 100)}%`
    if (label) stage.textContent = label
    count.textContent = `${completed} / ${Math.max(total, completed)} файлов`
  }

  const preload = async () => {
    const imports = readImportMap()
    const queue = initialResources(imports)
    const seen = new Set(queue)
    const failures = []
    total = Math.max(1, queue.length)
    render(0, 'Загрузка интерфейса, моделей и механики')

    let cursor = 0
    const worker = async () => {
      while (cursor < queue.length) {
        const index = cursor++
        const url = queue[index]
        const baseline = completed
        try {
          const response = await fetch(url, { cache: 'force-cache', credentials: new URL(url).origin === location.origin ? 'same-origin' : 'omit' })
          const source = await consume(response, part => render((baseline + Math.max(0, Math.min(1, part))) / Math.max(total, 1)))
          if (source && isJavaScript(url)) {
            for (const specifier of moduleSpecifiers(source)) {
              const dependency = resolveMapped(specifier, url, imports)
              if (!dependency || seen.has(dependency)) continue
              seen.add(dependency)
              queue.push(dependency)
              total = queue.length
            }
          }
        } catch (error) {
          failures.push({ url, error: String(error?.message || error) })
        }
        completed += 1
        render(completed / Math.max(total, 1))
      }
    }

    await Promise.all(Array.from({ length: Math.min(6, Math.max(1, queue.length)) }, worker))

    const videoUrl = await existingVideo()
    if (videoUrl && !seen.has(videoUrl)) {
      total += 1
      render(completed / total, 'Предзагрузка фонового видео')
      try {
        const response = await fetch(videoUrl, { cache: 'force-cache' })
        await consume(response, part => render((completed + part) / total))
      } catch (error) {
        failures.push({ url: videoUrl, error: String(error?.message || error) })
      }
      completed += 1
    }

    render(Math.min(.94, completed / Math.max(total, 1)), failures.length ? 'Основные файлы готовы' : 'Все файлы загружены')
    return { total, completed, failures }
  }

  const stageProgress = (value, label) => render(.94 + Math.max(0, Math.min(1, value)) * .05, label)
  const finish = async (label = 'Готово') => {
    completed = Math.max(completed, total)
    shown = 1
    fill.style.width = '100%'
    percent.textContent = '100%'
    stage.textContent = label
    count.textContent = `${total} / ${total} файлов`
    await new Promise(resolve => setTimeout(resolve, 100))
    root.classList.add('is-leaving')
    await new Promise(resolve => setTimeout(resolve, 280))
    root.remove()
  }

  return { preload, stageProgress, finish, element: root }
}

export const BrickLabProjectPreloaderV4 = Object.freeze({ loaderId: LOADER_ID, menuAssets: MENU_ASSETS, audioCandidates: AUDIO_CANDIDATES, videoCandidates: VIDEO_CANDIDATES })
