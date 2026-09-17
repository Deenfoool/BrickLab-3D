import * as THREE from 'three'

export const PARTS5_GEAR_MESH_UI_VERSION = 'parts-5-gear-mesh-ui-v3'

function isRussian() {
  return document.documentElement.lang === 'ru' || localStorage.getItem('bricklab.ui.language.v1') === 'ru'
}

function ensureHint() {
  const viewport = document.getElementById('viewport')
  if (!viewport) return null
  let hint = document.getElementById('gearMeshHintV1')
  if (hint) return hint

  hint = document.createElement('div')
  hint.id = 'gearMeshHintV1'
  hint.hidden = true
  hint.setAttribute('aria-live', 'polite')
  Object.assign(hint.style, {
    position: 'absolute', left: '50%', bottom: '76px', transform: 'translateX(-50%)', zIndex: '24',
    display: 'flex', alignItems: 'center', gap: '7px', minHeight: '28px', padding: '0 10px',
    border: '1px solid rgba(116,230,166,.38)', borderRadius: '7px', background: 'rgba(15,24,19,.90)',
    boxShadow: '0 8px 24px rgba(0,0,0,.28)', color: '#a8f2c7', fontSize: '10px', fontWeight: '750',
    letterSpacing: '.035em', pointerEvents: 'none', backdropFilter: 'blur(8px)',
  })
  viewport.parentElement?.append(hint)
  return hint
}

function ratioLabel(a, b) {
  if (!(a > 0) || !(b > 0)) return '—'
  const value = a / b
  return `${value.toFixed(value < 1 ? 3 : 2)}×`
}

function publicCandidate(candidate) {
  if (!candidate) return null
  if (candidate.movingTeeth != null) return candidate
  return { kind:candidate.gearKind, movingTeeth:candidate.movingGear?.teeth, fixedTeeth:candidate.fixedGear?.teeth }
}

let guides = []
let snapTimer = 0
let pendingDisengage = null
const movingGuideMaterial = new THREE.LineBasicMaterial({ color:0x74e6a6,transparent:true,opacity:.95,depthTest:false })
const fixedGuideMaterial = new THREE.LineBasicMaterial({ color:0x69a9ff,transparent:true,opacity:.82,depthTest:false })

function clearGuides() {
  for (const guide of guides) { guide.parent?.remove(guide); guide.geometry?.dispose?.() }
  guides = []
}

function addPitchCircle(descriptor, material) {
  const object=descriptor?.object,connector=descriptor?.connector,radius=Number(descriptor?.pitchRadius)
  if(!object||!connector||!(radius>0))return null
  const points=[]
  for(let i=0;i<72;i+=1){const angle=i/72*Math.PI*2;points.push(new THREE.Vector3(Math.cos(angle)*radius,0,Math.sin(angle)*radius))}
  const geometry=new THREE.BufferGeometry().setFromPoints(points)
  const line=new THREE.LineLoop(geometry,material)
  line.position.fromArray(connector.position)
  line.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(...connector.axis).normalize())
  line.renderOrder=30;line.frustumCulled=false;line.userData.parts5GearMeshGuide=true
  object.add(line);guides.push(line);return line
}

function refreshPitchGuides() {
  clearGuides()
  const candidate=globalThis.__bricklabGearMeshCandidate
  if(!candidate||candidate.kind!=='gear-mesh')return
  addPitchCircle(candidate.movingGear,movingGuideMaterial)
  addPitchCircle(candidate.fixedGear,fixedGuideMaterial)
}

function snapshotCandidatePose(detail) {
  const raw=globalThis.__bricklabGearMeshCandidate
  const object=raw?.movingGear?.object
  if(!raw||raw.kind!=='gear-mesh'||!object)return
  if(detail?.movingId&&object.userData?.instanceId!==detail.movingId)return
  if(detail?.fixedId&&raw.fixedGear?.object?.userData?.instanceId!==detail.fixedId)return
  pendingDisengage={
    object,
    movingId:object.userData?.instanceId??null,
    fixedId:raw.fixedGear?.object?.userData?.instanceId??null,
    position:object.position.clone(),
    quaternion:object.quaternion.clone(),
    scale:object.scale.clone(),
  }
}

function showCandidate(value) {
  const detail=publicCandidate(value),hint=ensureHint()
  refreshPitchGuides()
  if(!hint)return
  if(!detail?.movingTeeth||!detail?.fixedTeeth){hint.hidden=true;hint.replaceChildren();return}
  snapshotCandidatePose(value)
  const ru=isRussian()
  const kind=detail.kind==='bevel'?(ru?'КОНИЧЕСКОЕ ЗАЦЕПЛЕНИЕ':'BEVEL MESH'):(ru?'ЗАЦЕПЛЕНИЕ ШЕСТЕРЁН':'GEAR MESH')
  const phase=detail.kind==='spur'?(ru?' · ФАЗА ЗУБЬЕВ':' · TOOTH PHASE'):''
  hint.textContent=`${kind} · ${detail.movingTeeth}T ↔ ${detail.fixedTeeth}T · ${ratioLabel(detail.movingTeeth,detail.fixedTeeth)}${phase}`
  hint.hidden=false;hint.style.pointerEvents='none';hint.style.borderColor='rgba(116,230,166,.38)';hint.style.color='#a8f2c7'
}

export function disengageLastGearMesh() {
  const record=pendingDisengage
  if(!record?.object)return {disengaged:false,reason:'no-snap-pose'}
  const object=record.object
  if(record.movingId&&object.userData?.instanceId!==record.movingId)return {disengaged:false,reason:'moving-part-changed'}
  object.position.copy(record.position);object.quaternion.copy(record.quaternion);object.scale.copy(record.scale);object.updateMatrixWorld?.(true)
  pendingDisengage=null
  globalThis.__bricklabGearMeshCandidate=null
  clearGuides()
  window.dispatchEvent(new CustomEvent('bricklab:gearmeshdisengage',{detail:{movingId:record.movingId,fixedId:record.fixedId}}))
  window.dispatchEvent(new CustomEvent('bricklab:editorexternalmutation',{detail:{reason:'gear-mesh-disengage',instanceId:record.movingId}}))
  return {disengaged:true,movingId:record.movingId,fixedId:record.fixedId}
}

function disengageButton(ru,hint) {
  const button=document.createElement('button')
  button.type='button';button.className='gear-mesh-disengage';button.textContent=ru?'РАСЦЕПИТЬ':'DISENGAGE'
  Object.assign(button.style,{border:'1px solid rgba(255,255,255,.24)',borderRadius:'5px',background:'rgba(255,255,255,.08)',color:'inherit',font:'inherit',fontWeight:'800',letterSpacing:'.04em',padding:'3px 7px',cursor:'pointer',pointerEvents:'auto'})
  button.addEventListener('click',event=>{
    event.preventDefault();event.stopPropagation()
    const result=disengageLastGearMesh()
    if(result.disengaged){clearTimeout(snapTimer);hint.hidden=true;hint.replaceChildren();hint.style.pointerEvents='none'}
  })
  return button
}

function showSnap(detail) {
  const hint=ensureHint()
  if(!hint||!detail)return
  const ru=isRussian(),phase=detail.phaseAligned?(ru?' · зубья совмещены':' · teeth phased'):''
  const label=document.createElement('span')
  label.textContent=`${ru?'ЗАЦЕПЛЕНИЕ УСТАНОВЛЕНО':'GEAR MESH SNAPPED'} · ${detail.movingTeeth}T ↔ ${detail.fixedTeeth}T${phase}`
  hint.replaceChildren(label,disengageButton(ru,hint))
  hint.hidden=false;hint.style.pointerEvents='auto';hint.style.borderColor='rgba(116,230,166,.70)';hint.style.color='#d5ffe6'
  clearTimeout(snapTimer)
  snapTimer=setTimeout(()=>{hint.hidden=true;hint.style.pointerEvents='none'},6000)
}

window.addEventListener('bricklab:gearmeshcandidate',event=>showCandidate(event.detail))
window.addEventListener('bricklab:gearmeshsnap',event=>showSnap(event.detail))
window.addEventListener('bricklab:languagechange',()=>showCandidate(globalThis.__bricklabGearMeshCandidate))
window.addEventListener('beforeunload',clearGuides,{once:true})

globalThis.BrickLabParts5GearMeshUI=Object.freeze({version:PARTS5_GEAR_MESH_UI_VERSION,refresh:()=>showCandidate(globalThis.__bricklabGearMeshCandidate),clearGuides,disengage:disengageLastGearMesh})
