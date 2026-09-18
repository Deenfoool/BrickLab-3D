import test from 'node:test'
import assert from 'node:assert/strict'
import { Window } from 'happy-dom'
import * as THREE from 'three'

function installDom(){
  const window=new Window({url:'https://bricklab.test/'})
  window.document.body.innerHTML=`
    <header>
      <nav class="modes">
        <button class="mode active" data-mode="build">BUILD</button>
        <button class="mode" data-mode="kinematics">KINEMATICS</button>
        <button class="mode" data-mode="simulate">SIMULATE</button>
      </nav>
      <div class="top-actions">
        <button id="saveBtn"></button>
        <button id="exportBtn"></button>
        <button id="newBtn"></button>
        <button id="importBtn"></button>
      </div>
    </header>
    <main>
      <div id="viewport"><canvas></canvas></div>
      <div class="viewport-toolbar"></div>
      <div id="snapToolbar"></div>
      <div id="statusText">BUILD MODE</div>
      <div id="toast"></div>
    </main>
  `
  const canvas=window.document.querySelector('canvas')
  canvas.getBoundingClientRect=()=>({
    left:0,top:0,width:800,height:600,right:800,bottom:600,x:0,y:0,
    toJSON(){return this},
  })

  const previous={
    window:globalThis.window,
    document:globalThis.document,
    CustomEvent:globalThis.CustomEvent,
    HTMLElement:globalThis.HTMLElement,
    navigator:globalThis.navigator,
    dispatchEvent:globalThis.dispatchEvent,
    addEventListener:globalThis.addEventListener,
    removeEventListener:globalThis.removeEventListener,
    subsystems:globalThis.BrickLabSubsystems,
    mechanics:globalThis.BrickLabMechanicsNext,
    buildOwner:globalThis.BrickLabMechanicsNextBuildOwner,
    owner:globalThis.BrickLabMechanicsNextKinematics,
    viewport:globalThis.BrickLabViewportV1,
  }

  globalThis.window=window
  globalThis.document=window.document
  globalThis.CustomEvent=window.CustomEvent
  globalThis.HTMLElement=window.HTMLElement
  Object.defineProperty(globalThis,'navigator',{value:window.navigator,configurable:true,writable:true})
  globalThis.dispatchEvent=window.dispatchEvent.bind(window)
  globalThis.addEventListener=window.addEventListener.bind(window)
  globalThis.removeEventListener=window.removeEventListener.bind(window)

  return{
    window,
    cleanup(){
      for(const key of [
        'BrickLabSubsystems',
        'BrickLabMechanicsNext',
        'BrickLabMechanicsNextBuildOwner',
        'BrickLabMechanicsNextKinematics',
        'BrickLabViewportV1',
      ])delete globalThis[key]
      if(previous.subsystems!==undefined)globalThis.BrickLabSubsystems=previous.subsystems
      if(previous.mechanics!==undefined)globalThis.BrickLabMechanicsNext=previous.mechanics
      if(previous.buildOwner!==undefined)globalThis.BrickLabMechanicsNextBuildOwner=previous.buildOwner
      if(previous.owner!==undefined)globalThis.BrickLabMechanicsNextKinematics=previous.owner
      if(previous.viewport!==undefined)globalThis.BrickLabViewportV1=previous.viewport
      if(previous.window===undefined)delete globalThis.window
      else globalThis.window=previous.window
      if(previous.document===undefined)delete globalThis.document
      else globalThis.document=previous.document
      if(previous.CustomEvent===undefined)delete globalThis.CustomEvent
      else globalThis.CustomEvent=previous.CustomEvent
      if(previous.HTMLElement===undefined)delete globalThis.HTMLElement
      else globalThis.HTMLElement=previous.HTMLElement
      Object.defineProperty(globalThis,'navigator',{
        value:previous.navigator,
        configurable:true,
        writable:true,
      })
      if(previous.dispatchEvent===undefined)delete globalThis.dispatchEvent
      else globalThis.dispatchEvent=previous.dispatchEvent
      if(previous.addEventListener===undefined)delete globalThis.addEventListener
      else globalThis.addEventListener=previous.addEventListener
      if(previous.removeEventListener===undefined)delete globalThis.removeEventListener
      else globalThis.removeEventListener=previous.removeEventListener
      window.close()
    },
  }
}

function mechanicalObject(){
  const object=new THREE.Object3D()
  object.userData.instanceId='kinematics-instance'
  object.userData.partId='gear-20'
  object.position.set(1,2,3)
  object.updateMatrixWorld(true)
  return object
}

function subsystemFor(object){
  return{
    editor:{
      ready:()=>true,
      mode:()=> 'build',
      objects:()=>[object],
    },
  }
}

test('Mechanics Next KINEMATICS adopts BUILD first and restores entry baseline on exit',async()=>{
  const env=installDom()
  const object=mechanicalObject()
  let authoritative=false
  let adoptionCalls=0
  let syncCalls=0
  const handoffs=[]

  globalThis.BrickLabSubsystems=subsystemFor(object)
  globalThis.BrickLabMechanicsNext={
    async prepareMigration(){return{pass:true,summary:{blockers:0}}},
    nativeProjectAuthoritative:()=>authoritative,
    adoptNativeProjectOwnership(){
      adoptionCalls+=1
      authoritative=true
      globalThis.BrickLabMechanicsNextBuildOwner={
        active:true,
        authoritative:()=>true,
      }
      return{accepted:true}
    },
    handoffDomains(domains,reason){
      handoffs.push({domains:[...domains],reason})
      return[]
    },
    syncScene(){syncCalls+=1},
    beginDrag(){throw new Error('not used in lifecycle test')},
    updateDrag(){return null},
    endDrag(){return null},
    cancelDrag(){return false},
  }
  globalThis.BrickLabViewportV1={camera:()=>new THREE.PerspectiveCamera()}

  try{
    const module=await import('../mechanics-next/production/kinematics-owner.js?test=native-owner-success')
    const api=module.default
    const entered=await api.enter()
    assert.equal(entered.accepted,true)
    assert.equal(api.active(),true)
    assert.equal(adoptionCalls,1)
    assert.equal(handoffs.length,1)
    assert.deepEqual(handoffs[0].domains,['kinematics'])
    assert.match(handoffs[0].reason,/validated Mechanics Next KINEMATICS entry/)
    assert.equal(env.window.document.body.classList.contains('bricklab-mechanics-next-kinematics'),true)
    assert.match(env.window.document.querySelector('#statusText').textContent,/Mechanics Next/)

    object.position.set(9,8,7)
    object.updateMatrixWorld(true)
    api.exit({restore:true})
    assert.equal(api.active(),false)
    assert.deepEqual(object.position.toArray(),[1,2,3])
    assert.equal(syncCalls,1)
    assert.equal(env.window.document.body.classList.contains('bricklab-mechanics-next-kinematics'),false)
  }finally{
    env.cleanup()
  }
})

test('Mechanics Next KINEMATICS fails closed when BUILD adoption is rejected',async()=>{
  const env=installDom()
  const object=mechanicalObject()
  let handoffCalls=0

  globalThis.BrickLabSubsystems=subsystemFor(object)
  globalThis.BrickLabMechanicsNext={
    async prepareMigration(){return{pass:true,summary:{blockers:0}}},
    nativeProjectAuthoritative:()=>false,
    adoptNativeProjectOwnership:()=>({accepted:false,reason:'fixture-rejected'}),
    handoffDomains(){handoffCalls+=1;return[]},
    syncScene(){},
  }

  try{
    const module=await import('../mechanics-next/production/kinematics-owner.js?test=native-owner-blocked')
    const api=module.default
    const entered=await api.enter()
    assert.equal(entered.accepted,false)
    assert.equal(entered.reason,'native-build-ownership-required')
    assert.equal(api.active(),false)
    assert.equal(handoffCalls,0)
    assert.equal(env.window.document.body.classList.contains('bricklab-mechanics-next-kinematics'),false)
  }finally{
    env.cleanup()
  }
})
