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

test('native project forbids legacy physics even when BUILD publication is missing',async()=>{
  const text=await source('mechanics-next/production/physics-owner.js')
  const fallback=text.slice(text.indexOf('async function legacyFallback('),text.indexOf('if(!PhysicsSession[marker])'))
  const mechanics={nativeProjectAuthoritative:()=>true}
  const run=new Function('mechanics','globalThis',fallback+';return legacyFallback')(mechanics,{})
  let legacyCalls=0
  await assert.rejects(()=>run(async()=>{legacyCalls++},[],[],[],{}),
    error=>error.code==='BRICKLAB_MECHANICS_NEXT_AUTHORITATIVE_PHYSICS_BLOCKED')
  assert.equal(legacyCalls,0)
})

test('resilient production Rapier creation installs native bootstrap options before build',async()=>{
  const text=await source('rapier-loader-v2.js')
  const factory=text.slice(text.indexOf('PhysicsSession.create ='),text.indexOf('export function resetRapierLoader'))
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
