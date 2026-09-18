import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const singleton = await readFile(new URL('editor/topbar-singleton-v1.js', root), 'utf8')
const bootstrap = await readFile(new URL('bootstrap.js', root), 'utf8')
const index = await readFile(new URL('index.html', root), 'utf8')
const debugOverlay = await readFile(new URL('connectors-v4/debug-overlay-v4.js', root), 'utf8')
const projectMenuCss = await readFile(new URL('menu/project-menu-v1.css', root), 'utf8')

test('production editor owns a single visible topbar', () => {
  assert.match(singleton, /TOPBAR_SINGLETON_VERSION/)
  assert.match(singleton, /querySelectorAll\(BAR_SELECTOR\)/)
  assert.match(singleton, /if \(bar !== primary\) bar\.remove\(\)/)
  assert.match(singleton, /dataset\.bricklabTopbar = 'production'/)
})

test('legacy header actions remain only as invisible action bridges', () => {
  for (const id of ['newBtn', 'saveBtn', 'exportBtn', 'shortcutsBtn']) {
    assert.match(singleton, new RegExp(id))
  }
  assert.match(singleton, /legacy-topbar-action-bridge/)
  assert.match(singleton, /button\.hidden = true/)
  assert.match(singleton, /aria-hidden/)
})

test('demo and FNR powertrain controls are retired from the production topbar', () => {
  for (const id of ['demoProjectBtn', 'transmissionControl']) {
    assert.match(singleton, new RegExp(id))
  }
  assert.match(singleton, /removeRetiredTopbarControls/)
  assert.match(singleton, /element\.remove\(\)/)
  assert.match(singleton, /removedTopbarIds: REMOVED_TOPBAR_IDS/)
})

test('singleton takes ownership immediately after app mounts and before UI contributors', () => {
  const app = bootstrap.indexOf("await import('./app.js')")
  const singletonImport = bootstrap.indexOf("await import('./editor/topbar-singleton-v1.js?v=topbar-singleton-20260914-v1')")
  const projectLibrary = bootstrap.indexOf("await import('./projects/library-ui-v1.js")
  const overlay = bootstrap.indexOf("await import('./overlay-ui.js')")

  assert.ok(app >= 0 && app < singletonImport)
  assert.ok(singletonImport < projectLibrary)
  assert.ok(projectLibrary < overlay)
  const canonical = index.match(/\.\/app\.js\?v=([^\"]+)/)?.[1]
  assert.ok(canonical)
  assert.match(index, new RegExp(`bootstrap\\.js\\?v=${canonical}`))
})

test('production UI boot does not import the retired duplicate LDraw gear patch', () => {
  assert.doesNotMatch(debugOverlay, /gear-mechanics-patch-v1/)
})

test('standalone legacy Audio control stays hidden because audio lives in the ESC settings menu', () => {
  assert.match(projectMenuCss, /\.bricklab-audio-settings[^}]*display:none!important/)
})
