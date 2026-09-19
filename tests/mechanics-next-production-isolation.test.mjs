import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here=dirname(fileURLToPath(import.meta.url))
const root=resolve(here,'..')
const source=path=>readFileSync(resolve(root,path),'utf8')

test('production fixed-step path contains only Mechanics Next mechanical writers', () => {
  const pipeline=source('physics-pipeline-v1.js')
  const base=source('physics-v2.js')
  const controls=source('simulation-runtime-v2.js')
  for(const writer of ['applyMotorTorques','updateSuspensionV2','applyGearCouplingTorques']){
    assert.doesNotMatch(pipeline,new RegExp(`call\\(session, '${writer}'`))
  }
  assert.doesNotMatch(base,/prototype\.applyMotorTorques/)
  assert.doesNotMatch(controls,/prototype\.applyMotorTorques/)
  assert.match(pipeline,/session\.mechanicsNextPhysics\?\.beforeStep/)
  assert.match(pipeline,/session\.mechanicsNextPhysics\?\.afterStep/)
})

test('production no longer loads legacy physics ownership modules', () => {
  const bootstrap=source('runtime-extensions.js')
  assert.match(bootstrap,/await import\('\.\/physics-v2\.js'\)/)
  for(const retired of [
    'joint-stability-v4','physics-stability-v3','drivetrain-stress-v2',
    'articulated-driveline-physics-v1','suspension-patch','suspension-v2',
    'steering-suspension-physics-v1',
  ])assert.doesNotMatch(bootstrap,new RegExp(retired))
})


test('production KINEMATICS and SIMULATE require native BUILD ownership first', () => {
  const kinematics=source('mechanics-next/production/kinematics-owner.js')
  const physics=source('mechanics-next/production/physics-owner.js')
  const activation=source('kinematics/activation-v1.js')

  for(const [name,text] of [['KINEMATICS',kinematics],['SIMULATE',physics]]){
    assert.match(text,/nativeProjectAuthoritative\?\.\(\)!==true/, `${name} must verify native project authority`)
    assert.match(text,/adoptNativeProjectOwnership\?\.\(\)/, `${name} must finish BUILD handoff when needed`)
    assert.match(text,/BrickLabMechanicsNextBuildOwner/, `${name} must require the published BUILD owner`)
    assert.match(text,/native-build-owner-not-published/, `${name} must fail closed if BUILD owner is missing`)
  }

  assert.match(
    activation,
    /\.\.\/mechanics-next\/production\/kinematics-owner\.js/,
    'activation must load Mechanics Next KINEMATICS',
  )
  assert.doesNotMatch(
    activation,
    /runtime-v1\.js|lifecycle-guard|rack-pinion-runtime|legacy fallback/,
    'legacy KINEMATICS runtime paths must be absent',
  )
})


test('production Mechanics Next entry modules share the canonical import-map generation', () => {
  const bootstrap=source('bootstrap.js')
  const activation=source('kinematics/activation-v1.js')
  const index=source('index.html')
  const match=index.match(/<script type="importmap">([\s\S]*?)<\/script>/)
  assert.ok(match,'production import map is present')
  const imports=JSON.parse(match[1]).imports
  const canonical=imports['./app.js']?.match(/\?v=(.+)$/)?.[1]
  assert.match(canonical,/^runtime-\d+-mechanics-next-/)

  assert.match(bootstrap,/import\('\.\/mechanics-next\/runtime\.js'\)/)
  assert.match(bootstrap,/import\('\.\/mechanics-next\/production\/physics-owner\.js'\)/)
  assert.match(activation,/import\('\.\.\/mechanics-next\/production\/kinematics-owner\.js'\)/)

  for(const specifier of [
    './mechanics-next/runtime.js',
    './mechanics-next/production/physics-owner.js',
    './mechanics-next/production/kinematics-owner.js',
  ]){
    assert.equal(imports[specifier],`${specifier}?v=${canonical}`)
  }
  assert.match(index,new RegExp(`bootstrap\\.js\\?v=${canonical}`))
})


test('project clear honors explicit BUILD authority retention policy', () => {
  const runtime=source('mechanics-next/runtime.js')
  assert.match(runtime,/const retainAuthority=keepAuthority===true&&nativeProjectAuthoritative===true/)
  assert.match(runtime,/nativeProjectAuthoritative=retainAuthority/)
  assert.match(runtime,/if\(!retainAuthority\)\{/)
  assert.match(runtime,/keepAuthority:retainAuthority/)
  assert.doesNotMatch(
    runtime,
    /clearProjectState\(\{keepAuthority=true\}=\{\}\)[\s\S]{0,900}nativeProjectAuthoritative=false/,
    'clearProjectState must not unconditionally revoke validated BUILD ownership',
  )
})
