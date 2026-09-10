import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const hero = await readFile(new URL('menu/hero-reducer.js', root), 'utf8')
const menu = await readFile(new URL('menu/main-menu-v4.js', root), 'utf8')
const css = await readFile(new URL('menu/main-menu-v4.css', root), 'utf8')
const preloader = await readFile(new URL('menu/project-preloader-v4.js', root), 'utf8')
const bootstrap = await readFile(new URL('bootstrap.js', root), 'utf8')
const index = await readFile(new URL('index.html', root), 'utf8')

test('main menu v4 hero is a fixed curated production-part transmission', () => {
  assert.match(menu, /import \* as THREE from 'three'/)
  assert.match(menu, /OrbitControls/)
  assert.match(menu, /RoomEnvironment/)
  assert.match(menu, /findPart/)
  assert.match(menu, /def\.create\(color \?\? def\.defaultColor\)/)
  assert.match(menu, /buildCuratedTransmission/)
  assert.match(menu, /fixedHero: true/)
  assert.doesNotMatch(menu, /savedAssembly|usingSavedProject|state\.position|state\.rotation/)
  for (const id of ['beam-9', 'beam-5', 'gear-12', 'gear-20', 'gear-36', 'axle-7']) {
    assert.match(hero, new RegExp(id))
  }
})

test('hero is a connector-aligned reducer with rigid shaft groups', () => {
  assert.match(menu, /buildHeroReducer\(root, tryPart\)/)
  assert.doesNotMatch(hero, /setScalar|centerPart|gearbox-fnr|open-differential|bevel-gear/)
  assert.match(hero, /setFromUnitVectors/)
  assert.match(hero, /pivot.rotation.z=/)
  assert.match(hero, /reduction: 5/)
})

test('hero camera uses geometry-aware fit and ignores hidden visual hierarchy', () => {
  assert.match(menu, /function hierarchyVisible/)
  assert.match(menu, /function visualBounds/)
  assert.match(menu, /hierarchyVisible\(object, root\)/)
  assert.match(menu, /function fitDistance/)
  assert.match(menu, /horizontalFov/)
  assert.match(menu, /byHeight/)
  assert.match(menu, /byWidth/)
  assert.match(menu, /homeDistance = fitDistance/)
  assert.match(menu, /new THREE\.PerspectiveCamera\(35/)
  assert.doesNotMatch(menu, /model\.scale\.setScalar\(8\.65 \/ largest\)/)
})

test('hero has restrained studio lighting and environment reflections', () => {
  assert.match(menu, /new THREE\.PMREMGenerator\(renderer\)/)
  assert.match(menu, /new RoomEnvironment\(renderer\)/)
  assert.match(menu, /scene\.environment = environment\.texture/)
  assert.match(menu, /toneMappingExposure = 1\.05/)
  assert.match(menu, /new THREE\.DirectionalLight\(0xf7fbff, 2\.65\)/)
  assert.match(menu, /new THREE\.PointLight\(0x67f2cb, 1\.45/)
})

test('hero interaction remains orbit-only and independent of physics', () => {
  assert.match(menu, /new OrbitControls\(camera, renderer\.domElement\)/)
  assert.match(menu, /controls\.enableZoom = true/)
  assert.match(menu, /controls\.enablePan = false/)
  assert.match(menu, /controls\.mouseButtons\.LEFT = THREE\.MOUSE\.ROTATE/)
  assert.match(menu, /controls\.autoRotate/)
  assert.match(menu, /addEventListener\('dblclick'/)
  assert.match(menu, /item\.object\.rotation\[item\.axis\] \+= item\.speed \* dt/)
  assert.doesNotMatch(menu, /PhysicsSession|Rapier|applyImpulse|setLinvel|setAngvel|RigidBody/)
})

test('saved project is only Recent/Continue data and never hero geometry', () => {
  assert.match(menu, /bricklab\.project\.v2/)
  assert.match(menu, /bricklab\.project\.v1/)
  assert.match(menu, /projectStats\(project\)/)
  assert.match(menu, /data-action=\"continue\"/)
  assert.match(menu, /const hero = mountHero\(menu\.querySelector\('#bl4Hero'\), menuSettings\)/)
})

test('main action buttons are isolated and cannot inherit editor primary button fill', () => {
  assert.match(menu, /class=\"bl4-action is-primary active\"/)
  assert.doesNotMatch(menu, /class=\"bl4-action primary/)
  assert.match(css, /\.bl4-action\{[^}]*border:0!important/)
  assert.match(css, /background:transparent!important/)
  assert.match(css, /grid-template-columns:minmax\(0,1fr\) 34px/)
  assert.match(css, /\.bl4-action:before\{[^}]*position:absolute/)
})

test('hero helper text and menu actions are separated from the 3D canvas', () => {
  assert.match(menu, /bl4-hero-meta/)
  assert.match(css, /\.bl4-hero-meta\{[^}]*margin-top:-5px/)
  assert.match(css, /\.bl4-actions\{[^}]*margin-top:18px/)
  assert.doesNotMatch(menu, /bl4-hero-badge/)
  assert.doesNotMatch(menu, /bl4-hero-hint/)
})

test('project loader preloads actual v4 menu assets and reports real transfer progress', () => {
  assert.match(preloader, /main-menu-v4\.js\?v=hero-reducer-20260910-v1/)
  assert.match(preloader, /main-menu-v4\.css/)
  assert.match(preloader, /script\[type=\"importmap\"\]/)
  assert.match(preloader, /fetch\(url/)
  assert.match(preloader, /moduleSpecifiers/)
  assert.match(preloader, /content-length/)
  assert.match(preloader, /received \/ totalBytes/)
  assert.match(preloader, /background\.webm/)
  assert.match(preloader, /workbench\.ogg/)
  assert.match(bootstrap, /project-preloader-v4\.js\?v=hero-reducer-20260910-v1/)
  assert.match(bootstrap, /await projectPreloader\.preload\(\)/)
  assert.match(bootstrap, /main-menu-v5\.js\?v=hero-reducer-20260910-v1/)
})

test('v4 boot cache tag and responsive composition are current', () => {
  assert.match(index, /bootstrap\.js\?v=parts-6-20260910-hero-v1/)
  for (const marker of ['bl4-left', 'bl4-center', 'bl4-right', 'bl4-top', 'bl4-footer', 'bl4-actions', 'bl4-hero']) {
    assert.match(css, new RegExp(`\\.${marker}`))
  }
  assert.match(css, /@media\(max-height:820px\)/)
  assert.match(css, /@media\(max-width:1200px\)/)
  assert.match(css, /@media\(max-width:980px\)/)
  assert.match(css, /@media\(max-width:760px\)/)
  assert.match(css, /prefers-reduced-motion/)
})
