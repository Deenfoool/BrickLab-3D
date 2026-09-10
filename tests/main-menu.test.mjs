import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const menu = await readFile(new URL('menu/main-menu-v2.js', root), 'utf8')
const css = await readFile(new URL('menu/main-menu-v2.css', root), 'utf8')
const bootstrap = await readFile(new URL('bootstrap.js', root), 'utf8')

test('main menu v2 hero uses real BrickLab part factories', () => {
  assert.match(menu, /import \* as THREE from 'three'/)
  assert.match(menu, /OrbitControls/)
  assert.match(menu, /findPart/)
  assert.match(menu, /def\.create\(color \?\? def\.defaultColor\)/)
  assert.match(menu, /showcaseAssembly/)
  assert.match(menu, /savedAssembly/)
  for (const id of ['technic-frame-5x7', 'motor', 'gearbox-fnr', 'open-differential', 'gear-36', 'gear-20', 'bevel-gear-12', 'axle-7']) {
    assert.match(menu, new RegExp(id))
  }
})

test('hero supports orbit rotation, wheel zoom, reset and automatic resume', () => {
  assert.match(menu, /new OrbitControls\(camera, renderer\.domElement\)/)
  assert.match(menu, /controls\.enableZoom = true/)
  assert.match(menu, /controls\.enablePan = false/)
  assert.match(menu, /controls\.mouseButtons\.LEFT = THREE\.MOUSE\.ROTATE/)
  assert.match(menu, /controls\.autoRotate/)
  assert.match(menu, /setTimeout\(\(\) => \{ controls\.autoRotate/)
  assert.match(menu, /addEventListener\('dblclick'/)
})

test('showcase drivetrain has idle mechanical animation without physics coupling', () => {
  assert.match(menu, /mechanicalMotion/)
  assert.match(menu, /moving\.push/)
  assert.match(menu, /item\.object\.rotation\[item\.axis\] \+= item\.speed \* dt/)
  assert.doesNotMatch(menu, /PhysicsSession|Rapier|applyImpulse|setLinvel|setAngvel|RigidBody/)
})

test('saved build is used as the hero when present', () => {
  assert.match(menu, /bricklab\.project\.v2/)
  assert.match(menu, /bricklab\.project\.v1/)
  assert.match(menu, /project\.parts/)
  assert.match(menu, /usingSavedProject/)
  assert.match(menu, /state\.position/)
  assert.match(menu, /state\.rotation/)
})

test('background video is optional and reduced motion has a static fallback', () => {
  assert.match(menu, /background\.webm/)
  assert.match(menu, /background\.mp4/)
  assert.match(menu, /loadeddata/)
  assert.match(menu, /prefers-reduced-motion/)
  assert.match(css, /\.bl2-bg/)
  assert.match(css, /linear-gradient/)
  assert.match(css, /\.bl2-video\.missing/)
})

test('menu v2 keeps New Continue Open Settings flow and editor boot contract', () => {
  for (const action of ['new', 'continue', 'open', 'settings']) assert.match(menu, new RegExp(`data-action=\\"${action}\\"`))
  assert.match(bootstrap, /menuResult\.action === 'new' \|\| menuResult\.action === 'open'/)
  assert.match(bootstrap, /hiddenProjectEntries/)
  assert.match(bootstrap, /await import\('\.\/app\.js'\)/)
  assert.match(bootstrap, /querySelector\('#importBtn'\)\?\.click\(\)/)
  assert.match(bootstrap, /\.\/menu\/main-menu-v2\.js\?v=main-menu-20260910-v2/)
})

test('layout follows reference composition and remains responsive', () => {
  for (const marker of ['bl2-left', 'bl2-center', 'bl2-right', 'bl2-top', 'bl2-footer', 'bl2-actions', 'bl2-hero']) {
    assert.match(css, new RegExp(`\\.${marker}`))
  }
  assert.match(css, /@media\(max-width:1200px\)/)
  assert.match(css, /@media\(max-width:980px\)/)
  assert.match(css, /@media\(max-width:760px\)/)
  assert.match(css, /prefers-reduced-motion/)
})
