import * as THREE from 'three'

export const AUTO_LINK_VERSION_V4='connector-auto-link-v4.2.0'
export const AUTO_LINK_HOTKEY_V4='Shift+L'

const MAX_TRANSLATION_STUD=0.015
const MAX_ROTATION_RAD=THREE.MathUtils.degToRad(0.75)
const CAPTURE_DISTANCE_STUD=0.08
const MAX_CONTACTS_PER_PAIR=16
let running=false

function runtime(){return globalThis.BrickLabConnectorV4??null}
function subsystems(){return globalThis.BrickLabSubsystems??null}

function editableTarget(target){
  return target instanceof HTMLElement&&(/INPUT|TEXTAREA|SELECT/.test(target.tagName)||target.isContentEditable)
}

function toast(text){
  const node=document.querySelector('#toast')
  if(!node)return
  node.textContent=text
  node.classList.add('show')
  globalThis.setTimeout?.(()=>node.classList.remove('show'),2600)
}

function installShortcutHint(){
  const groups=[...document.querySelectorAll('.shortcut-group')]
  const mechanics=groups.find(group=>String(group.querySelector('h3')?.textContent||'').trim().toLowerCase()==='mechanics')
  if(!mechanics||mechanics.querySelector('[data-auto-link-shortcut]'))return
  const row=document.createElement('div')
  row.className='shortcut-row'
  row.dataset.autoLinkShortcut='true'
  row.innerHTML='<span>Auto-link safe contacts</span><kbd>Shift+L</kbd>'
  mechanics.append(row)
}

function worldPose(object){
  object?.updateWorldMatrix?.(true,false)
  const position=new THREE.Vector3()
  const quaternion=new THREE.Quaternion()
  const scale=new THREE.Vector3()
  object?.matrixWorld?.decompose?.(position,quaternion,scale)
  return {position,quaternion}
}

function candidatePoseDelta(candidate){
  const solution=candidate?.solution
  if(!solution?.valid||!Array.isArray(solution.worldPosition)||!Array.isArray(solution.worldQuaternion)){
    return {translation:Infinity,rotation:Infinity}
  }
  const current=worldPose(candidate.sourceObject)
  const targetPosition=new THREE.Vector3(...solution.worldPosition)
  const targetQuaternion=new THREE.Quaternion(...solution.worldQuaternion).normalize()
  return {
    translation:current.position.distanceTo(targetPosition),
    rotation:current.quaternion.angleTo(targetQuaternion),
  }
}

export function currentPoseSafeCandidateV4(candidate,{maxTranslationStud=MAX_TRANSLATION_STUD,maxRotationRad=MAX_ROTATION_RAD}={}){
  const delta=candidatePoseDelta(candidate)
  return Boolean(
    candidate?.v4Active===true&&candidate?.solution?.valid&&
    delta.translation<=maxTranslationStud&&delta.rotation<=maxRotationRad
  )
}

function pairKey(a,b){
  const ai=String(a?.userData?.instanceId||'')
  const bi=String(b?.userData?.instanceId||'')
  return ai<bi?`${ai}|${bi}`:`${bi}|${ai}`
}

async function hydrate(objects){
  const api=runtime()
  if(typeof api?.hydrateObjects!=='function')return
  try{await api.hydrateObjects(objects)}catch(error){
    console.debug?.('[BrickLab Auto Link] Connector hydration incomplete.',error)
  }
}

function activeSources(all){
  const editor=subsystems()?.editor
  const selected=editor?.selection?.()??[]
  return selected.length?selected:all
}

export async function autoLinkCurrentPoseV4({all:useAll=false,silent=false}={}){
  if(running)return {accepted:0,skipped:0,running:true}
  const api=runtime()
  const architecture=subsystems()
  if(!api?.findActiveCandidate||!api?.commitActiveCandidate||!architecture?.editor?.objects){
    return {accepted:0,skipped:0,reason:'runtime-unavailable'}
  }
  if(architecture.editor.mode?.()!=='build')return {accepted:0,skipped:0,reason:'build-only'}

  running=true
  try{
    const all=(architecture.editor.objects?.()??[]).filter(Boolean)
    const sources=(useAll?all:activeSources(all)).filter(Boolean)
    await hydrate(all)

    let accepted=0
    let skipped=0
    const processedPairs=new Set()

    for(const source of sources){
      for(const target of all){
        if(!target||target===source)continue
        const key=pairKey(source,target)
        if(processedPairs.has(key))continue
        processedPairs.add(key)

        const seenCandidates=new Set()
        for(let pass=0;pass<MAX_CONTACTS_PER_PAIR;pass+=1){
          const candidate=api.findActiveCandidate(source,[target],{
            captureDistanceStud:CAPTURE_DISTANCE_STUD,
            maxResults:96,
          })
          if(!candidate)break
          const candidateKey=String(candidate.key||`${candidate.source?.endpointId}>${candidate.target?.endpointId}`)
          if(seenCandidates.has(candidateKey))break
          seenCandidates.add(candidateKey)

          if(!currentPoseSafeCandidateV4(candidate)){
            skipped+=1
            break
          }

          const result=api.commitActiveCandidate(candidate)
          if(!result?.accepted){
            skipped+=1
            break
          }
          accepted+=Array.isArray(result.connectionIds)?Math.max(1,result.connectionIds.length):1
        }
      }
    }

    api.reconcileGraph?.(all,{persist:true})
    globalThis.BrickLabConnectorV4InspectorSync?.refresh?.()
    globalThis.dispatchEvent?.(new CustomEvent('bricklab:connectorv4autolink',{
      detail:{version:AUTO_LINK_VERSION_V4,accepted,skipped,scope:sources.length===all.length?'all':'selection'},
    }))
    return {accepted,skipped,scope:sources.length===all.length?'all':'selection'}
  } finally {
    running=false
  }
}

let backfillTimer=0
function scheduleExactContactBackfill(){
  globalThis.clearTimeout?.(backfillTimer)
  backfillTimer=globalThis.setTimeout?.(()=>{
    if(subsystems()?.editor?.mode?.()!=='build')return
    void autoLinkCurrentPoseV4({all:true,silent:true}).catch(error=>
      console.debug?.('[BrickLab Auto Link] Exact-contact backfill skipped.',error))
  },420)??0
}

// Projects created before multi-contact V4 can contain perfectly positioned Technic
// assemblies with no graph records. Rebuild only contacts whose current pose already
// satisfies the strict translation/rotation limits; this never moves a part.
for(const eventName of [
  'bricklab:ldrawloaded',
  'bricklab:projectlibrarychange',
  'bricklab:editorexternalmutation',
]) globalThis.addEventListener?.(eventName,scheduleExactContactBackfill)
scheduleExactContactBackfill()

async function onHotkey(event){
  if(event.code!=='KeyL'||!event.shiftKey||event.ctrlKey||event.metaKey||event.altKey)return
  if(editableTarget(event.target))return
  event.preventDefault()
  event.stopImmediatePropagation()

  const architecture=subsystems()
  if(architecture?.editor?.mode?.()!=='build'){
    toast('Автосвязь работает только в СБОРКЕ')
    return
  }

  const result=await autoLinkCurrentPoseV4()
  if(result.reason){
    toast('Автосвязь недоступна')
    return
  }
  if(result.accepted>0)toast(`Автосвязь: создано ${result.accepted}`)
  else toast('Автосвязь: новых безопасных связей нет')
}

window.addEventListener('keydown',onHotkey,true)
installShortcutHint()

export const BrickLabConnectorV4AutoLink=Object.freeze({
  version:AUTO_LINK_VERSION_V4,
  hotkey:AUTO_LINK_HOTKEY_V4,
  run:autoLinkCurrentPoseV4,
  currentPoseSafe:currentPoseSafeCandidateV4,
  limits:Object.freeze({
    captureDistanceStud:CAPTURE_DISTANCE_STUD,
    maxTranslationStud:MAX_TRANSLATION_STUD,
    maxRotationRad:MAX_ROTATION_RAD,
  }),
})

globalThis.BrickLabConnectorV4AutoLink=BrickLabConnectorV4AutoLink
