import * as THREE from 'three'

export const MECHANICS_NEXT_KINEMATICS_VERSION='mechanics-next-kinematics-owner-0.1.2'

let subsystems=null
let mechanics=null
let viewport=null
let modeBar=null
let listenersInstalled=false

function resolveDependencies(){
  subsystems=globalThis.BrickLabSubsystems??null
  mechanics=globalThis.BrickLabMechanicsNext??null
  viewport=document.querySelector('#viewport')
  modeBar=document.querySelector('.modes')
  const missing=[]
  if(!subsystems?.editor?.ready?.())missing.push('editor')
  if(!mechanics)missing.push('mechanics-runtime')
  if(!viewport)missing.push('viewport')
  if(!modeBar)missing.push('mode-bar')
  return Object.freeze({
    ready:missing.length===0,
    missing:Object.freeze(missing),
  })
}

let active=false
let entering=false
let entryBaseline=new Map()
let pointer=null
let previousStatus=''
let toolbarWasDisabled=false
let snapWasHidden=false
let lastGate=null
const raycaster=new THREE.Raycaster()
const pointerNdc=new THREE.Vector2()

const canvas=()=>viewport?.querySelector?.('canvas')??null
const objects=()=>subsystems?.editor?.objects?.()??[]
const camera=()=>globalThis.BrickLabViewportV1?.camera?.()??null

function toast(message,timeout=3200){
  const node=document.querySelector('#toast')
  if(!node)return
  node.textContent=message
  node.classList.add('show')
  globalThis.setTimeout?.(()=>node.classList.remove('show'),timeout)
}

function captureBaseline(){
  const result=new Map()
  for(const object of objects()){
    result.set(object.userData?.instanceId,{
      object,
      position:object.position.clone(),
      quaternion:object.quaternion.clone(),
      scale:object.scale.clone(),
    })
  }
  return result
}

function restoreBaseline(map){
  for(const pose of map.values()){
    pose.object.position.copy(pose.position)
    pose.object.quaternion.copy(pose.quaternion)
    pose.object.scale.copy(pose.scale)
    pose.object.updateMatrixWorld?.(true)
  }
}

function setModeVisual(){
  for(const button of document.querySelectorAll('.mode')){
    button.classList.toggle('active',button.dataset.mode==='kinematics')
  }
  document.body.classList.add('bricklab-kinematics-active','bricklab-mechanics-next-kinematics')
  const toolbar=document.querySelector('.viewport-toolbar')
  const snap=document.querySelector('#snapToolbar')
  toolbarWasDisabled=toolbar?.classList.contains('disabled')??false
  snapWasHidden=snap?.classList.contains('hidden')??false
  toolbar?.classList.add('disabled')
  snap?.classList.add('hidden')
  const status=document.querySelector('#statusText')
  previousStatus=status?.textContent??''
  if(status)status.textContent='KINEMATICS · Mechanics Next · LMB drag · Esc BUILD'
}

function restoreModeVisual(){
  document.body.classList.remove('bricklab-kinematics-active','bricklab-mechanics-next-kinematics')
  for(const button of document.querySelectorAll('.mode')){
    button.classList.toggle('active',button.dataset.mode==='build')
  }
  const toolbar=document.querySelector('.viewport-toolbar')
  const snap=document.querySelector('#snapToolbar')
  if(!toolbarWasDisabled)toolbar?.classList.remove('disabled')
  if(!snapWasHidden)snap?.classList.remove('hidden')
  const status=document.querySelector('#statusText')
  if(status&&previousStatus)status.textContent=previousStatus
}

function pickRecords(event){
  const view=canvas()
  const cam=camera()
  const rect=view?.getBoundingClientRect?.()
  if(!view||!cam||!rect?.width||!rect?.height)return[]
  pointerNdc.set(
    ((event.clientX-rect.left)/rect.width)*2-1,
    -((event.clientY-rect.top)/rect.height)*2+1,
  )
  raycaster.setFromCamera(pointerNdc,cam)
  const seen=new Set()
  const result=[]
  for(const hit of raycaster.intersectObjects(objects(),true)){
    const root=hit.object?.userData?.instanceRoot
    const instanceId=root?.userData?.instanceId
    if(!root||!instanceId||seen.has(instanceId))continue
    seen.add(instanceId)
    result.push({root,instanceId,cam,rect})
  }
  return result
}

function beginPointer(event){
  if(!active||entering||event.button!==0||pointer)return
  for(const picked of pickRecords(event)){
    try{
      const started=mechanics?.beginDrag({
        instanceId:picked.instanceId,
        start:{x:event.clientX,y:event.clientY},
        camera:picked.cam,
        viewportRect:picked.rect,
        apply:true,
        balancedDifferentials:'auto',
      })
      pointer={
        pointerId:event.pointerId,
        canvas:canvas(),
        instanceId:picked.instanceId,
        started,
      }
      pointer.canvas?.setPointerCapture?.(event.pointerId)
      pointer.canvas?.classList.add('kinematics-dragging')
      event.preventDefault()
      event.stopImmediatePropagation()
      return
    }catch{}
  }
}

function movePointer(event){
  if(!active||!pointer||event.pointerId!==pointer.pointerId)return
  event.preventDefault()
  event.stopImmediatePropagation()
  const result=mechanics?.updateDrag(
    {x:event.clientX,y:event.clientY},
    {apply:true},
  )
  const status=document.querySelector('#statusText')
  if(status){
    const solved=result?.solution?.status??'unknown'
    status.textContent=`KINEMATICS · Mechanics Next · ${solved}`
  }
}

function finishPointer(event,{cancel=false}={}){
  if(!pointer||(event?.pointerId!=null&&event.pointerId!==pointer.pointerId))return
  event?.preventDefault?.()
  event?.stopImmediatePropagation?.()
  pointer.canvas?.releasePointerCapture?.(pointer.pointerId)
  pointer.canvas?.classList.remove('kinematics-dragging')
  if(cancel)mechanics?.cancelDrag?.()
  else mechanics?.endDrag?.({restore:false})
  pointer=null
}

function modeCapture(event){
  if(!active)return
  const button=event.target?.closest?.('.mode')
  if(!button||button.dataset.mode==='kinematics')return
  event.preventDefault()
  event.stopImmediatePropagation()
  const target=button.dataset.mode
  exit({restore:true})
  queueMicrotask(()=>document.querySelector(`.mode[data-mode="${target}"]`)?.click?.())
}

function keyCapture(event){
  if(!active)return
  if(event.code==='Escape'){
    event.preventDefault()
    event.stopImmediatePropagation()
    exit({restore:true})
    return
  }
  if(event.code==='Tab'){
    event.preventDefault()
    event.stopImmediatePropagation()
    exit({restore:true})
    queueMicrotask(()=>document.querySelector('.mode[data-mode="simulate"]')?.click?.())
    return
  }
  const safe=new Set(['Home','Digit1','Digit2','Digit3','Digit5','Slash'])
  if(safe.has(event.code))return
  event.preventDefault()
  event.stopImmediatePropagation()
}

function blockProjectActions(event){
  if(!active)return
  const id=event.target?.closest?.('button')?.id
  if(!['saveBtn','exportBtn','newBtn','importBtn'].includes(id))return
  event.preventDefault()
  event.stopImmediatePropagation()
  toast('Выйдите из кинематики перед изменением или сохранением проекта.')
}

export async function enter(){
  if(active||entering)return Object.freeze({accepted:active,gate:lastGate})
  const dependencies=resolveDependencies()
  if(!dependencies.ready){
    return Object.freeze({
      accepted:false,
      reason:'runtime-dependencies-not-ready',
      missing:dependencies.missing,
    })
  }
  installListeners()
  if(subsystems?.editor?.mode?.()!=='build'){
    return Object.freeze({accepted:false,reason:'build-mode-required'})
  }
  if(!objects().length){
    toast('Добавьте детали перед запуском кинематики.')
    return Object.freeze({accepted:false,reason:'empty-scene'})
  }

  entering=true
  try{
    lastGate=await mechanics?.prepareMigration?.({scope:'kinematics'})
    if(!lastGate?.pass){
      return Object.freeze({
        accepted:false,
        reason:'migration-gate-blocked',
        gate:lastGate,
      })
    }

    let buildOwnership=null
    if(mechanics?.nativeProjectAuthoritative?.()!==true){
      buildOwnership=mechanics?.adoptNativeProjectOwnership?.({
        gateScope:'kinematics',
        preparedGate:lastGate,
      })??null
      if(!buildOwnership?.accepted){
        return Object.freeze({
          accepted:false,
          reason:'native-build-ownership-required',
          gate:lastGate,
          buildOwnership,
        })
      }
    }
    const buildOwner=globalThis.BrickLabMechanicsNextBuildOwner
    if(buildOwner?.active!==true||buildOwner?.authoritative?.()!==true){
      return Object.freeze({
        accepted:false,
        reason:'native-build-owner-not-published',
        gate:lastGate,
        buildOwnership,
      })
    }

    entryBaseline=captureBaseline()
    mechanics?.handoffDomains?.(['kinematics'],'validated Mechanics Next KINEMATICS entry')
    active=true
    setModeVisual()
    globalThis.dispatchEvent?.(new CustomEvent('bricklab:kinematicsenter',{
      detail:{
        version:MECHANICS_NEXT_KINEMATICS_VERSION,
        owner:'mechanics-next',
        gate:lastGate.summary??null,
      },
    }))
    return Object.freeze({accepted:true,gate:lastGate})
  }finally{
    entering=false
  }
}

export function exit({restore=true}={}){
  if(pointer)finishPointer(null,{cancel:true})
  if(!active)return api
  if(restore)restoreBaseline(entryBaseline)
  mechanics?.syncScene?.()
  active=false
  entryBaseline.clear()
  restoreModeVisual()
  globalThis.dispatchEvent?.(new CustomEvent('bricklab:kinematicsexit',{
    detail:{version:MECHANICS_NEXT_KINEMATICS_VERSION,owner:'mechanics-next'},
  }))
  return api
}

export function reset(){
  if(!active)return false
  if(pointer)finishPointer(null,{cancel:true})
  restoreBaseline(entryBaseline)
  mechanics?.syncScene?.()
  return true
}

function installListeners(){
  if(listenersInstalled)return true
  const dependencies=resolveDependencies()
  if(!dependencies.ready)return false
  modeBar?.addEventListener?.('click',modeCapture,true)
  document.querySelector('.top-actions')?.addEventListener('click',blockProjectActions,true)
  const view=canvas()
  view?.addEventListener?.('pointerdown',beginPointer,true)
  view?.addEventListener?.('pointermove',movePointer,true)
  view?.addEventListener?.('pointerup',event=>finishPointer(event),true)
  view?.addEventListener?.('pointercancel',event=>finishPointer(event,{cancel:true}),true)
  globalThis.addEventListener?.('keydown',keyCapture,true)
  listenersInstalled=true
  return true
}

resolveDependencies()
installListeners()
for(const eventName of [
  'bricklab:subsystemsready',
  'bricklab:editorcontractready',
  'bricklab:mechanicsnextready',
]){
  globalThis.addEventListener?.(eventName,()=>{
    resolveDependencies()
    installListeners()
  },{once:false})
}

const api=Object.freeze({
  version:MECHANICS_NEXT_KINEMATICS_VERSION,
  owner:'mechanics-next',
  enter,
  exit,
  reset,
  active:()=>active,
  gate:()=>lastGate,
  status:()=>Object.freeze({
    active,
    entering,
    dragging:Boolean(pointer),
    gate:lastGate,
  }),
})

export default api
globalThis.BrickLabMechanicsNextKinematics=api
