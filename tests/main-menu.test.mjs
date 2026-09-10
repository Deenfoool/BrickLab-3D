import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const menu = await readFile(new URL('main-menu.js', root), 'utf8')
const css = await readFile(new URL('main-menu.css', root), 'utf8')
const bootstrap = await readFile(new URL('bootstrap.js', root), 'utf8')
const index = await readFile(new URL('index.html', root), 'utf8')

test('main menu hero is real Three.js geometry from BrickLab part factories', () => {
  assert.match(menu, /import \* as THREE from 'three'/)
  assert.match(menu, /OrbitControls/)
  assert.match(menu, /findPart/)
  assert.match(menu, /new THREE\.WebGLRenderer/)
  assert.match(menu, /populateSavedProject/)
  assert.match(menu, /populateShowcase/)
  assert.match(menu, /part\.create\(state\.color \?\? part\.defaultColor\)/)
  assert.match(menu, /open-differential/)
  assert.match(menu, /gearbox-fnr/)
  assert.match(menu, /gear-36/)
})

test('hero can be rotated, zoomed, auto-rotated and reset without touching physics', () => {
  assert.match(menu, /new OrbitControls\(camera, renderer\.domElement\)/)
  assert.match(menu, /controls\.enableZoom = true/)
  assert.match(menu, /controls\.enablePan = false/)
  assert.match(menu, /controls\.autoRotate/)
  assert.match(menu, /addEventListener\('dblclick'/)
  assert.doesNotMatch(menu, /PhysicsSession|Rapier|applyImpulse|setLinvel|setAngvel/)
})

test('main menu uses real saved project state and preserves New/Open semantics', () => {
  assert.match(menu, /bricklab\.project\.v2/)
  assert.match(menu, /bricklab\.project\.v1/)
  assert.match(menu, /project\.parts/)
  assert.match(menu, /data-menu-action="continue"/)
  assert.match(bootstrap, /menuResult\.action === 'new' \|\| menuResult\.action === 'open'/)
  assert.match(bootstrap, /hiddenProjectEntries/)
  assert.match(bootstrap, /await import\('\.\/app\.js'\)/)
  assert.match(bootstrap, /querySelector\('#importBtn'\)\?\.click\(\)/)
})

test('background video is optional and has a dark fallback', () => {
  assert.match(menu, /background\.webm/)
  assert.match(menu, /background\.mp4/)
  assert.match(menu, /method: 'HEAD'/)
  assert.match(css, /\.bl-menu-bg/)
  assert.match(css, /linear-gradient/)
  assert.match(css, /\.bl-menu-video\.is-unavailable/)
})

test('layout covers reference composition and responsive behavior', () => {
  for (const marker of ['bl-menu-left', 'bl-menu-center', 'bl-menu-right', 'bl-menu-top', 'bl-menu-footer', 'bl-menu-actions', 'bl-hero-shell']) {
    assert.match(css, new RegExp(`\\.${marker}`))
  }
  assert.match(css, /@media\(max-width:1200px\)/)
  assert.match(css, /@media\(max-width:980px\)/)
  assert.match(css, /@media\(max-width:760px\)/)
  assert.match(css, /prefers-reduced-motion/)
})

test('production import map exposes main-menu as a canonical root module', () => {
  const imports = JSON.parse(index.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports
  const entryTag = index.match(/src="\.\/bootstrap\.js\?v=([^"]+)/)?.[1]
  assert.ok(entryTag)
  assert.equal(imports['./main-menu.js'], `./main-menu.js?v=${entryTag}`)
  assert.match(bootstrap, /await import\('\.\/main-menu\.js'\)/)
})
