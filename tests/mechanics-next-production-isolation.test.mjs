import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here=dirname(fileURLToPath(import.meta.url))
const root=resolve(here,'..')
const source=path=>readFileSync(resolve(root,path),'utf8')

test('final production legacy physics writers declare Mechanics Next bypass', () => {
  const contracts=[
    {
      path:'joint-stability-v4.js',
      writer:'createJoint',
      marker:'PhysicsSession.prototype.createJoint.__mechanicsNextBypass = true',
      guard:'Legacy PhysicsSession.createJoint is forbidden in a Mechanics Next session',
    },
    {
      path:'physics-v2.js',
      writer:'applyMotorTorques',
      marker:'PhysicsSession.prototype.applyMotorTorques.__mechanicsNextBypass=true',
      guard:'applyMotorTorques=function(dt){if(this.mechanicsNextBootstrap)return;',
    },
    {
      path:'parts4/articulated-driveline-physics-v1.js',
      writer:'applyGearCouplingTorques',
      marker:'PhysicsSession.prototype.applyGearCouplingTorques.__mechanicsNextBypass = true',
      guard:'if (this.mechanicsNextBootstrap) return',
    },
    {
      path:'suspension-patch.js',
      writer:'initializeSuspensionJointsV1',
      marker:'PhysicsSession.prototype.initializeSuspensionJointsV1.__mechanicsNextBypass = true',
      guard:'if (this.mechanicsNextBootstrap)',
    },
    {
      path:'parts4/steering-suspension-physics-v1.js',
      writer:'initializeParts4LinearMechanisms',
      marker:'PhysicsSession.prototype.initializeParts4LinearMechanisms.__mechanicsNextBypass = true',
      guard:'if (this.mechanicsNextBootstrap)',
    },
    {
      path:'suspension-v2.js',
      writer:'updateSuspensionV2',
      marker:'PhysicsSession.prototype.updateSuspensionV2.__mechanicsNextBypass=true',
      guard:'if(this.mechanicsNextBootstrap)return',
    },
    {
      path:'parts4/steering-suspension-physics-v1.js',
      writer:'updateVehicleControlsV1',
      marker:'PhysicsSession.prototype.updateVehicleControlsV1.__mechanicsNextBypass = true',
      guard:'if (this.mechanicsNextBootstrap) return result',
    },
  ]

  for(const contract of contracts){
    const text=source(contract.path)
    assert.ok(
      text.includes(contract.marker),
      `${contract.writer} must declare __mechanicsNextBypass in ${contract.path}`,
    )
    assert.ok(
      text.includes(contract.guard),
      `${contract.writer} must hard-bypass Mechanics Next sessions in ${contract.path}`,
    )
  }
})

test('production module order leaves bypass-marked final writers authoritative', () => {
  const bootstrap=source('runtime-extensions.js')
  const index=specifier=>{
    const value=bootstrap.indexOf(specifier)
    assert.ok(value>=0,`missing production import: ${specifier}`)
    return value
  }

  const physicsV2=index("await import('./physics-v2.js')")
  const jointStability=index("await import('./joint-stability-v4.js')")
  assert.ok(jointStability>physicsV2,'joint-stability must be the final createJoint owner')

  const couplingBase=index("await import('./physics-stability-v3.js')")
  const couplingStress=index("await import('./drivetrain-stress-v2.js')")
  const couplingArticulated=index("await import('./parts4/articulated-driveline-physics-v1.js")
  assert.ok(couplingStress>couplingBase,'stress coupling wrapper must load after base coupling owner')
  assert.ok(
    couplingArticulated>couplingStress,
    'articulated coupling wrapper must be final applyGearCouplingTorques owner',
  )

  const suspensionPatch=index("await import('./suspension-patch.js')")
  const suspensionV2=index("await import('./suspension-v2.js')")
  const parts4Linear=index("await import('./parts4/steering-suspension-physics-v1.js")
  assert.ok(suspensionV2>suspensionPatch,'suspension V2 writer must load after registry patch')
  assert.ok(parts4Linear>suspensionV2,'Parts4 steering/suspension bridge must load after suspension V2')
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
    'activation must try Mechanics Next KINEMATICS before legacy runtime',
  )
  assert.match(
    activation,
    /stale legacy Kinematics fallback is forbidden/,
    'legacy KINEMATICS fallback must be blocked once Mechanics Next owns BUILD',
  )
})


test('production Mechanics Next entry modules are cache-versioned', () => {
  const bootstrap=source('bootstrap.js')
  const activation=source('kinematics/activation-v1.js')
  const index=source('index.html')

  assert.match(bootstrap,/mechanics-next\/runtime\.js\?v=mechanics-next-stage11-20260918-v2/)
  assert.match(bootstrap,/mechanics-next\/production\/physics-owner\.js\?v=mechanics-next-stage11-20260918-v2/)
  assert.match(activation,/mechanics-next\/production\/kinematics-owner\.js\?v=mechanics-next-stage11-20260918-v2/)
  assert.match(index,/bootstrap\.js\?v=runtime-27-mechanics-next-stage11-20260918-v1/)
})
