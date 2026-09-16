import { applyLDrawMechanismPose, ldrawMechanismDescriptor, normalizeLDrawMechanismPose } from './mechanism-registry-v1.js'

export const LDRAW_MECHANISM_INSPECTOR_VERSION='ldraw-mechanism-inspector-v1.0.0'

const LABELS={
  angleDeg:['Hinge angle','Угол шарнира'],inputDeg:['Input yoke','Входная вилка'],
  outputDeg:['Output yoke','Выходная вилка'],phaseDeg:['Shaft phase','Фаза вала'],
  bendXDeg:['Bend X','Изгиб X'],bendYDeg:['Bend Y','Изгиб Y'],twistDeg:['Twist','Скручивание'],
}
const t=pair=>document.documentElement.lang==='ru'?pair[1]:pair[0]
const editor=()=>globalThis.BrickLabSubsystems?.editor

function ensureSection(){
  const inspector=document.querySelector('#inspector')
  if(!inspector)return null
  let section=document.querySelector('#ldrawMechanismPose')
  if(section)return section
  section=document.createElement('section');section.id='ldrawMechanismPose';section.hidden=true
  section.innerHTML='<h3>ARTICULATION</h3><div class="mechanism-pose-fields"></div><small class="mechanism-pose-note"></small>'
  document.querySelector('#mechanicsSection')?.before(section)
  return section
}

function selected(){return editor()?.primarySelection?.()||null}

function render(){
  const section=ensureSection(),object=selected()
  if(!section)return
  const descriptor=ldrawMechanismDescriptor(object?.userData?.partId)
  section.hidden=!descriptor?.pose
  if(!descriptor?.pose)return
  const pose=normalizeLDrawMechanismPose(descriptor.code,object.userData.mechanismPose||descriptor.pose)
  object.userData.mechanismPose={...pose}
  const fields=section.querySelector('.mechanism-pose-fields')
  if(descriptor.kind==='flex-axle'){
    fields.innerHTML=`<div class="flex-axle-help">${t(['Drag the three green handles directly on the axle','Тяните три зелёные точки прямо на оси'])}</div><button type="button" class="flex-axle-reset">${t(['Reset shape','Сбросить форму'])}</button>`
    section.querySelector('.mechanism-pose-note').textContent=t(['Handles move in the camera plane; the shape is stored in the project','Точки двигаются в плоскости камеры; форма сохраняется в проекте'])
    fields.querySelector('.flex-axle-reset').addEventListener('click',()=>{
      const current=selected();if(current!==object)return
      applyLDrawMechanismPose(object,{bendXDeg:0,bendYDeg:0})
      globalThis.dispatchEvent?.(new CustomEvent('bricklab:flexaxlereset',{detail:{instanceId:object.userData.instanceId}}))
      document.querySelector('#saveBtn')?.click()
      globalThis.dispatchEvent?.(new CustomEvent('bricklab:editorexternalmutation',{detail:{type:'mechanism-pose',instanceId:object.userData.instanceId}}))
    })
    return
  }
  fields.innerHTML=Object.keys(descriptor.pose).map(key=>{
    const [min,max]=descriptor.limits[key]
    return `<label><span>${t(LABELS[key]||[key,key])}</span><input type="range" min="${min}" max="${max}" step="1" value="${pose[key]}" data-mechanism-pose="${key}"><output>${Math.round(pose[key])}°</output></label>`
  }).join('')
  section.querySelector('.mechanism-pose-note').textContent=t(['Pose is stored in the project','Положение сохраняется в проекте'])
  for(const input of fields.querySelectorAll('[data-mechanism-pose]')){
    input.addEventListener('input',()=>{
      const current=selected();if(current!==object)return
      const next={...object.userData.mechanismPose,[input.dataset.mechanismPose]:Number(input.value)}
      applyLDrawMechanismPose(object,next)
      input.nextElementSibling.textContent=`${Math.round(Number(input.value))}°`
    })
    input.addEventListener('change',()=>{
      document.querySelector('#saveBtn')?.click()
      globalThis.dispatchEvent?.(new CustomEvent('bricklab:editorexternalmutation',{detail:{type:'mechanism-pose',instanceId:object.userData.instanceId}}))
    })
  }
}

const style=document.createElement('style');style.textContent=`
#ldrawMechanismPose[hidden]{display:none}.mechanism-pose-fields{display:grid;gap:9px}
.mechanism-pose-fields label{display:grid;grid-template-columns:minmax(82px,1fr) minmax(80px,1.35fr) 38px;align-items:center;gap:7px;color:#849099;font-size:9px}
.mechanism-pose-fields input{width:100%;accent-color:#74e6a6}.mechanism-pose-fields output{text-align:right;color:#d6dde2;font-variant-numeric:tabular-nums}
.flex-axle-help{color:#aeb9c0;font-size:10px;line-height:1.45}.flex-axle-reset{justify-self:start;border:1px solid #3c4a52;border-radius:6px;background:#20272c;color:#d6dde2;padding:6px 9px;font-size:9px;cursor:pointer}.flex-axle-reset:hover{border-color:#74e6a6;color:#74e6a6}
.mechanism-pose-note{display:block;margin-top:8px;color:#68747c;font-size:8px}`
document.head.append(style)

for(const event of ['bricklab:selectionchange','bricklab:editorselectionchange','bricklab:ldrawloaded','bricklab:languagechange'])globalThis.addEventListener?.(event,render)
new MutationObserver(render).observe(document.querySelector('#inspector')||document.body,{attributes:true,attributeFilter:['class']})
render()

globalThis.BrickLabLDrawMechanismInspector=Object.freeze({version:LDRAW_MECHANISM_INSPECTOR_VERSION,render})
