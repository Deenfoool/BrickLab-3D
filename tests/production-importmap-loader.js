(() => {
  'use strict'

  const current = document.currentScript
  const moduleSpecifier = current?.dataset?.module
  if (!moduleSpecifier) throw new Error('BrickLab QA loader requires data-module')

  // QA must exercise the exact import-map generation served by production, not a
  // duplicated snapshot embedded in a test page. This script is parser-blocking and
  // no module script exists before it, so the import map is installed before module
  // resolution starts.
  const url = new URL('./index.html', document.baseURI)
  url.searchParams.set('qa-map', String(Date.now()))
  const request = new XMLHttpRequest()
  request.open('GET', url.href, false)
  request.setRequestHeader('Cache-Control', 'no-cache')
  request.send(null)
  if (request.status < 200 || request.status >= 300) {
    throw new Error(`Could not load production import map: HTTP ${request.status}`)
  }

  const parsed = new DOMParser().parseFromString(request.responseText, 'text/html')
  const source = parsed.querySelector('script[type="importmap"]')
  if (!source?.textContent?.trim()) throw new Error('Production index.html has no import map')
  const data = JSON.parse(source.textContent)
  const appTarget = data?.imports?.['./app.js']
  const canonical = typeof appTarget === 'string' ? appTarget.match(/\?v=(.+)$/)?.[1] : null
  if (!canonical) throw new Error('Production import map has no canonical runtime tag')

  const map = document.createElement('script')
  map.type = 'importmap'
  map.textContent = source.textContent
  document.head.append(map)
  globalThis.__bricklabQaRuntimeTag = canonical

  const boot = () => {
    const script = document.createElement('script')
    script.type = 'module'
    const moduleUrl = new URL(moduleSpecifier, document.baseURI)
    moduleUrl.searchParams.set('v', canonical)
    script.src = moduleUrl.href
    script.dataset.productionRuntime = canonical
    document.body.append(script)
  }
  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', boot, { once:true })
  else boot()
})()
