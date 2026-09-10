import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const menu = await readFile(new URL('menu/main-menu-v3.js', root), 'utf8')
const css = await readFile(new URL('menu/main-menu-v3.css', root), 'utf8')
const preloader = await readFile(new URL('menu/project-preloader.js', root), 'utf8')
const bootstrap = await readFile(new URL('bootstrap.js', root), 'utf8')

test('main menu v3 hero always uses the fixed production drivetrain', () => {
  assert.match(menu, /import \* as THREE from 'three'/)
  assert.match(menu, /OrbitControls/)
  assert.match(menu, /findPart/)
  assert.match(menu, /def\.create\(color \?\? def\.defaultColor\)/)
  assert.match(menu, /showcaseAssembly/)
  assert.match(menu, /heroSource: 'fixed-production-drivetrain'/)
  assert.doesNotMatch(menu, /savedAssembly|usingSavedProject/)
  for (const id of ['technic-frame-5x7', 'motor', 'gearbox-fnr', 'open-differential', 'gear-36', 'gear-20', 'gear-16', 'bevel-gear-12', 'axle-7']) {
    assert.match(menu, new RegExp(id))
  }
})

test('hero uses rendered visual bounds so hidden physics proxies cannot shrink it', () => {
  assert.match(menu, /function renderedBounds/)
  assert.match(menu, /hierarchyVisible/)
  assert.match(menu, /geometry\.boundingBox\.clone\(\)\.applyMatrix4/)
  assert.match(menu, /model\.scale\.setScalar\(8\.65 \/ largest\)/)
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

test('saved project is only used for Recent and Continue, never for hero geometry', () => {
  assert.match(menu, /bricklab\.project\.v2/)
  assert.match(menu, /bricklab\.project\.v1/)
  assert.match(menu, /projectStats\(project\)/)
  assert.match(menu, /data-action=\"continue\"/)
  assert.doesNotMatch(menu, /state\.position|state\.rotation/)
})

test('action button markup is isolated from editor primary button CSS', () => {
  assert.match(menu, /class=\"bl3-action is-primary active\"/)
  assert.doesNotMatch(menu, /class=\"bl3-action primary/)
  assert.match(css, /#bricklab-main-menu-v3 button\.bl3-action/)
  assert.match(css, /position:absolute;left:8px;top:50%/)
  assert.match(css, /grid-template-columns:minmax\(0,1fr\) 32px/)
})

test('project loader reports real asset completion before the menu is shown', () => {
  assert.match(preloader, /script\[type=\"importmap\"\]/)
  assert.match(preloader, /fetch\(url/)
  assert.match(preloader, /moduleSpecifiers/)
  assert.match(preloader, /content-length/)
  assert.match(preloader, /received \/ total/)
  assert.match(preloader, /background\.webm/)
  assert.match(preloader, /workbench\.ogg/)
  assert.match(bootstrap, /createProjectPreloader/)
  assert.match(bootstrap, /await projectPreloader\.preload\(\)/)
  assert.match(bootstrap, /await projectPreloader\.finish\('Готово'\)/)
  assert.match(bootstrap, /main-menu-v3\.js\?v=main-menu-20260910-v3/)
})

test('background video is optional and reduced motion has a static fallback', () => {
  assert.match(menu, /background\.webm/)
  assert.match(menu, /background\.mp4/)
  assert.match(menu, /loadeddata/)
  assert.match(menu, /prefers-reduced-motion/)
  assert.match(css, /\.bl3-bg/)
  assert.match(css, /linear-gradient/)
  assert.match(css, /\.bl3-video\.missing/)
})

test('menu v3 keeps New Continue Open Settings flow and editor boot contract', () => {
  for (const action of ['new', 'continue', 'open', 'settings']) assert.match(menu, new RegExp(`data-action=\\"${action}\\"`))
  assert.match(bootstrap, /menuResult\.action === 'new' \|\| menuResult\.action === 'open'/)
  assert.match(bootstrap, /hiddenProjectEntries/)
  assert.match(bootstrap, /await import\('\.\/app\.js'\)/)
  assert.match(bootstrap, /querySelector\('#importBtn'\)\?\.click\(\)/)
})

test('layout follows reference composition and remains responsive', () => {
  for (const marker of ['bl3-left', 'bl3-center', 'bl3-right', 'bl3-top', 'bl3-footer', 'bl3-actions', 'bl3-hero']) {
    assert.match(css, new RegExp(`\\.${marker}`))
  }
  assert.match(css, /@media\(max-width:1200px\)/)
  assert.match(css, /@media\(max-width:980px\)/)
  assert.match(css, /@media\(max-width:760px\)/)
  assert.match(css, /prefers-reduced-motion/)
})
