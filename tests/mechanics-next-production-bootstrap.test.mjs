import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source=path=>readFile(new URL('../'+path,import.meta.url),'utf8')

test('validated native Open publishes BUILD before convergence gate runs',async()=>{
  const {createMechanicsNextRuntime}=await import('../mechanics-next/runtime.js')
  const globals={addEventListener(){},dispatchEvent(){},
    BrickLabLDraw:{readText:async()=>null},
    BrickLabMechanicsNextPhysicsOwner:{createOwner:'mechanics-next-physics-owner-0.1.0'},
  }
  const subsystems={parts:{list:()=>[],get:()=>null},
    editor:{ready:()=>true,objects:()=>[],objectById:()=>null,projectState:()=>({connections:[]})},
  }
  const runtime=createMechanicsNextRuntime({globals,subsystems,legacyProvider:null})
  runtime.syncScene()
  const result=runtime.restoreProjectState({schemaVersion:1,engine:'mechanics-next',connections:[],relations:[]},{replace:true})
  assert.equal(result.rejected,0)
  assert.equal(runtime.nativeProjectAuthoritative(),true)
  assert.equal(globals.BrickLabMechanicsNextBuildOwner.active,true)
  assert.equal(globals.BrickLabMechanicsNextBuildOwner.authoritative(),true)
  for(const domain of ['connector-hydration','snapping','connection-graph','persistence']){
    assert.equal(runtime.ownership.owner(domain),'mechanics-next')
  }
  const gate=await runtime.prepareMigration()
  assert.equal(gate.pass,true)
})

test('production native physics gate rejects before any base or legacy session is created',async()=>{
  const text=await source('mechanics-next/production/physics-owner.js')
  assert.doesNotMatch(text,/legacyFallback|legacyCreate|legacyGuard|createBaseSession/)
  const code=text.replace(/^import .*\r?\n/gm,'').replaceAll('export const ','const ')
  for(const authoritative of [false,true]){
    let calls=0
    class Session{}
    Session.create=async()=>{throw Error('Retired create called')}
    const globals={BrickLabMechanicsNext:{prepareMigration:async()=>({pass:false,blockers:[{id:'fixture-blocked'}],summary:{blockers:1}}),physicsPreview:()=>({pass:true}),nativeProjectAuthoritative:()=>authoritative}}
    new Function('PhysicsSession','createRapierBaseSession','auditMechanicsNextPhysicsIsolation','globalThis',code)(Session,async()=>{calls++},()=>({pass:true}),globals)
    await assert.rejects(()=>Session.create([],[]),error=>error.code==='BRICKLAB_MECHANICS_NEXT_PHYSICS_BLOCKED')
    assert.equal(calls,0)
    assert.equal(globals.BrickLabMechanicsNextPhysicsOwner.stats().fallbackSessions,0)
    assert.equal(globals.BrickLabMechanicsNextPhysicsOwner.lastAttempt().owner,'blocked')
  }
})

test('resilient production Rapier creation installs native bootstrap options before build',async()=>{
  const text=await source('rapier-loader-v2.js')
  const factory=text.slice(text.indexOf('export async function createRapierBaseSession'),text.indexOf('export function resetRapierLoader')).replace('export async function','async function')
  const calls=[]
  class Session{
    constructor(rapier,objects,connections,scenario){Object.assign(this,{rapier,objects,connections,scenario})}
    build(){calls.push({native:this.mechanicsNextBootstrap,options:this.creationOptions})}
  }
  const rapier={}
  const window={__bricklabNextScenario:'flat'}
  new Function('PhysicsSession','window','loadRapierResilient','report','describeError',factory)(Session,window,async()=>rapier,()=>{},String)
  const options={mechanicsNextOwned:true,mechanicsNextOwnerVersion:'fixture-owner'}
  const session=await Session.create([],[],options)
  assert.equal(session.rapier,rapier)
  assert.equal(calls[0].native,true)
  assert.equal(session.mechanicsNextBaseInfrastructure,true)
  assert.deepEqual(calls[0].options,options)
  assert.notEqual(session.creationOptions,options)
  const compatibility=await Session.create([],[])
  assert.equal(compatibility.mechanicsNextBootstrap,false)
})

test('production stage diagnostics retain native bypass and preserve error context',async()=>{
  const text=(await source('physics-stage-diagnostics.js')).replace(/^import .*\r?\n/,'')
  class Session{}
  Session.prototype.createJoint=function(){throw new Error('joint-error')}
  Session.prototype.createJoint.__bricklabOwner='fixture-joint-owner'
  Session.prototype.createJoint.__mechanicsNextBypass=true
  const window={}
  new Function('PhysicsSession','window',text)(Session,window)
  assert.equal(Session.prototype.createJoint.__mechanicsNextBypass,true)
  assert.equal(Session.prototype.createJoint.__bricklabOwner,'fixture-joint-owner')
  assert.throws(()=>new Session().createJoint(),error=>error.bricklabStage==='createJoint')
})

test('final production controls cannot touch native motor or transmission worklists',async()=>{
  const text=await source('mechanism-controls-core.js')
  const wrappers=text.slice(text.indexOf('const oldApplyMotorTorques ='),text.indexOf('const oldDispose ='))
  class Session{}
  let writes=0
  Session.prototype.applyMotorTorques=()=>{writes++}
  Session.prototype.applyGearCouplingTorques=()=>{writes++}
  const runtime={get(){throw new Error('legacy runtime touched')}}
  new Function('PhysicsSession','runtime',wrappers)(Session,runtime)
  const session=new Session()
  session.mechanicsNextBootstrap=true
  session.motorDrives=[{id:'motor'}]
  session.gearCouplers=[{controlId:'gearbox'}]
  session.applyMotorTorques(1/120)
  session.applyGearCouplingTorques(1/120)
  assert.equal(writes,0)
  for(const key of ['applyMotorTorques','applyGearCouplingTorques']){
    assert.equal(Session.prototype[key].__mechanicsNextBypass,true)
  }
})

test('migration preparation restores deferred native state and blocks takeover while it is pending',async()=>{
  const {createMechanicsNextRuntime}=await import('../mechanics-next/runtime.js')
  const pending={schemaVersion:1,engine:'mechanics-next',connections:[],relations:[],compoundState:{version:'mechanics-compound-state-0.1.0',states:{box:{mode:'reverse'}}}}
  const globals={__bricklabPendingMechanicsNextProject:pending,addEventListener(){},dispatchEvent(){},BrickLabLDraw:{readText:async()=>null},BrickLabMechanicsNextPhysicsOwner:{createOwner:'mechanics-next-physics-owner-0.1.0'}}
  const subsystems={parts:{list:()=>[],get:()=>null},editor:{ready:()=>true,objects:()=>[],objectById:()=>null,projectState:()=>({connections:[]})}}
  const runtime=createMechanicsNextRuntime({globals,subsystems,legacyProvider:null})
  runtime.syncScene()
  assert.equal(runtime.migrationGate().pass,false)
  assert.ok(runtime.migrationGate().blockers.some(b=>b.id==='native-project-restore-pending'))
  assert.equal(runtime.adoptNativeProjectOwnership().accepted,false)
  const prepared=await runtime.prepareMigration()
  assert.equal(prepared.pass,true)
  assert.equal(globals.__bricklabPendingMechanicsNextProject,undefined)
  assert.deepEqual(runtime.getCompoundState('box'),{mode:'reverse'})
})
