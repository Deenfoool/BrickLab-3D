import { bomToCsv, instructionManifest, normalizeInstructionProject } from './core-v1.js?v=instructions-20260913-v1'

export const INSTRUCTION_UI_VERSION='instructions-ui-v1.0.0'
const STYLE_ID='bricklab-instructions-v1-css'
let modal=null,previewRenderer=null,previewToken=0,pdfAbort=null

const ru=()=>globalThis.window?.__bricklabI18n?.getLanguage?.()!=='en'
const t=(r,e)=>ru()?r:e
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]))
const safeName=value=>(String(value||'bricklab').trim().replace(/[\\/:*?"<>|]+/g,'-').replace(/\s+/g,' ').slice(0,80)||'bricklab')
const colorHex=value=>value==null?'—':`#${Number(value).toString(16).padStart(6,'0').slice(-6).toUpperCase()}`
function ensureStyle(){if(document.getElementById(STYLE_ID))return;const link=document.createElement('link');link.id=STYLE_ID;link.rel='stylesheet';link.href=new URL('./instructions-v1.css?v=instructions-20260913-v1',import.meta.url).href;document.head.append(link)}
function icons(){globalThis.window?.lucide?.createIcons?.({attrs:{'stroke-width':1.7,'aria-hidden':'true'}})}
function currentProject(){return globalThis.BrickLabSubsystems?.projects?.current?.()??globalThis.BrickLabSubsystems?.editor?.projectState?.()??null}
function definitionFor(id){return globalThis.BrickLabSubsystems?.parts?.get?.(id)??null}
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500)}
function textBlob(value,type='application/json'){return new Blob([value],{type:`${type};charset=utf-8`})}

function injectButton(){
  if(document.getElementById('instructionsBtn'))return
  const actions=document.querySelector('.top-actions');if(!actions)return requestAnimationFrame(injectButton)
  const button=document.createElement('button');button.id='instructionsBtn';button.className='ghost';button.title=t('BOM и инструкции по сборке','BOM and build instructions');button.innerHTML=`<i data-lucide="book-open"></i><span>${t('Инструкция','Instructions')}</span>`
  const exportBtn=document.getElementById('exportBtn');actions.insertBefore(button,exportBtn||null);button.addEventListener('click',()=>void openInstructions());icons()
}

function bomRows(manifest){return manifest.bom.map(row=>`<tr><td><span class="bli-color" style="--bli-color:${colorHex(row.color)==='—'?'#c8cecb':colorHex(row.color)}"></span></td><td><strong>${esc(row.designId)}</strong><small>${esc(row.source)}</small></td><td><strong>${esc(row.name)}</strong><small>${esc(row.mechanicalCategory||row.category||'')}</small></td><td>${row.quantity}</td></tr>`).join('')}
function stepRows(manifest){return manifest.plan.steps.map(step=>`<button type="button" class="bli-step" data-step="${step.index}"><span>${step.index}</span><div><strong>${step.callouts.map(item=>`${esc(item.designId)} ×${item.quantity}`).join(' · ')}</strong><small>${step.subassembly?t('Подсборка','Subassembly')+' · ':''}${step.confidence}${step.paired?' · pair':''}</small></div><em>${step.assembledCount}/${manifest.plan.partCount}</em></button>`).join('')}
function warnings(manifest){if(!manifest.plan.warnings.length)return`<div class="bli-ok"><i data-lucide="badge-check"></i><span>${t('План построен без предупреждений.','Plan generated without warnings.')}</span></div>`;return manifest.plan.warnings.map(item=>`<div class="bli-warning"><i data-lucide="triangle-alert"></i><span>${esc(item.message||item.code)}</span></div>`).join('')}

function shell(project,manifest){return `<div class="bli-shell" role="dialog" aria-modal="true" aria-labelledby="bliTitle">
<header class="bli-head"><div><small>BRICKLAB 3D · BUILD DOCUMENTATION</small><h2 id="bliTitle">${t('Инструкции по сборке','Build Instructions')}</h2><p>${esc(project.name)} · ${manifest.plan.partCount} ${t('деталей','parts')} · ${manifest.plan.steps.length} ${t('шагов','steps')}</p></div><button class="icon-btn" data-close aria-label="Close"><i data-lucide="x"></i></button></header>
<section class="bli-toolbar"><button class="ghost" data-bom-csv><i data-lucide="table-2"></i>BOM CSV</button><button class="ghost" data-bom-json><i data-lucide="braces"></i>BOM JSON</button><button class="primary" data-pdf ${manifest.plan.partCount?'':'disabled'}><i data-lucide="file-down"></i>${t('Создать PDF','Generate PDF')}</button><button class="ghost danger hidden" data-cancel><i data-lucide="x-circle"></i>${t('Отмена','Cancel')}</button><span class="bli-status" data-status>${t('Готово к экспорту','Ready to export')}</span></section>
<div class="bli-layout"><aside class="bli-left"><section><div class="bli-section-title"><div><small>BOM</small><h3>${t('Состав модели','Model inventory')}</h3></div><b>${manifest.bom.length}</b></div><div class="bli-bom-wrap"><table class="bli-bom"><thead><tr><th></th><th>ID</th><th>${t('Деталь','Part')}</th><th>QTY</th></tr></thead><tbody>${bomRows(manifest)}</tbody></table></div></section><section><div class="bli-section-title"><div><small>ASSEMBLY SOLVER</small><h3>${t('Проверки плана','Plan diagnostics')}</h3></div></div><div class="bli-warnings">${warnings(manifest)}</div></section></aside>
<main class="bli-main"><div class="bli-preview"><div class="bli-preview-stage" data-preview><div class="bli-preview-empty"><i data-lucide="box"></i><span>${t('Выбери шаг сборки','Select an assembly step')}</span></div></div><div class="bli-preview-info" data-preview-info></div></div><div class="bli-step-list">${stepRows(manifest)||`<div class="bli-empty">${t('В проекте нет деталей.','Project contains no parts.')}</div>`}</div></main></div>
<footer class="bli-foot"><span>${t('Источник: текущий Project snapshot + Connector V4 graph','Source: current Project snapshot + Connector V4 graph')}</span><span>${t('PDF создаётся локально в браузере','PDF is generated locally in the browser')}</span></footer></div>`}

async function renderPreview(project,manifest,index){
  const stage=modal?.querySelector('[data-preview]'),info=modal?.querySelector('[data-preview-info]');if(!stage||!info)return
  const token=++previewToken,step=manifest.plan.steps.find(item=>item.index===index);if(!step)return
  modal.querySelectorAll('.bli-step').forEach(button=>button.classList.toggle('active',Number(button.dataset.step)===index));stage.innerHTML=`<div class="bli-preview-loading"><i data-lucide="loader-circle"></i>${t('Рендер шага…','Rendering step…')}</div>`;icons()
  try{
    const {InstructionSceneRenderer}=await import('./render-v1.js?v=instructions-20260913-v1');if(token!==previewToken)return
    previewRenderer??=new InstructionSceneRenderer({subsystems:globalThis.BrickLabSubsystems,width:1040,height:660})
    const included=manifest.plan.steps.filter(item=>item.index<=index).flatMap(item=>item.instanceIds)
    const result=previewRenderer.render({project,includedIds:included,newIds:step.instanceIds,insertions:step.insertions??[step.insertion],exploded:true});if(token!==previewToken)return
    const image=document.createElement('img');image.alt=`Step ${index}`;image.src=result.canvas.toDataURL('image/jpeg',.9);stage.replaceChildren(image)
    info.innerHTML=`<div><b>STEP ${step.index}</b><span>${step.callouts.map(row=>`${esc(row.designId)} × ${row.quantity}`).join(' · ')}</span></div><div><span class="bli-confidence ${step.confidence}">${step.confidence}</span><small>${esc(step.insertion?.source||'unknown')}</small>${result.missing.length?`<small class="warn">${result.missing.length} ${t('визуал(ов) не готово','visual(s) unavailable')}</small>`:''}</div>`
  }catch(error){console.warn('[BrickLab Instructions] Preview failed',error);stage.innerHTML=`<div class="bli-preview-empty error"><i data-lucide="triangle-alert"></i><span>${esc(error?.message||error)}</span></div>`;icons()}
}

function bind(project,manifest){
  modal.querySelector('[data-close]')?.addEventListener('click',closeInstructions)
  modal.querySelector('[data-bom-csv]')?.addEventListener('click',()=>download(textBlob('\ufeff'+bomToCsv(manifest.bom),'text/csv'),`${safeName(project.name)}-BOM.csv`))
  modal.querySelector('[data-bom-json]')?.addEventListener('click',()=>download(textBlob(JSON.stringify({version:manifest.version,project:manifest.project,items:manifest.bom},null,2)),`${safeName(project.name)}-BOM.json`))
  modal.querySelectorAll('[data-step]').forEach(button=>button.addEventListener('click',()=>void renderPreview(project,manifest,Number(button.dataset.step))))
  modal.querySelector('[data-pdf]')?.addEventListener('click',()=>void createPdf(project,manifest))
  modal.querySelector('[data-cancel]')?.addEventListener('click',()=>pdfAbort?.abort())
  if(manifest.plan.steps.length)void renderPreview(project,manifest,1)
}

async function createPdf(project,manifest){
  if(pdfAbort)return
  const pdf=modal.querySelector('[data-pdf]'),cancel=modal.querySelector('[data-cancel]'),status=modal.querySelector('[data-status]');pdf.disabled=true;cancel.classList.remove('hidden');pdfAbort=new AbortController()
  try{
    const {generateInstructionPdf}=await import('./pdf-export-v1.js?v=instructions-20260913-v1')
    const blob=await generateInstructionPdf({manifest,project,subsystems:globalThis.BrickLabSubsystems,signal:pdfAbort.signal,onProgress:value=>{
      if(!status)return
      const labels={cover:t('Обложка','Cover'),steps:t('Шаги','Steps'),final:t('Финальная модель','Final model'),bom:'BOM',encode:t('Упаковка PDF','Encoding PDF'),done:t('Готово','Done')}
      status.textContent=`${labels[value.phase]||value.phase}${value.total?` · ${value.current}/${value.total}`:''}`
    }})
    download(blob,`${safeName(project.name)}-Build-Instructions.pdf`);status.textContent=t('PDF создан локально','PDF generated locally')
  }catch(error){if(error?.name==='AbortError')status.textContent=t('Создание PDF отменено','PDF generation cancelled');else{console.warn('[BrickLab Instructions] PDF failed',error);status.textContent=t('Ошибка PDF: ','PDF error: ')+String(error?.message||error)}}finally{pdfAbort=null;cancel.classList.add('hidden');pdf.disabled=!manifest.plan.partCount}
}

async function openInstructions(){
  ensureStyle();const source=currentProject();if(!source)return
  const project=normalizeInstructionProject(source),manifest=instructionManifest(project,definitionFor)
  if(!modal){modal=document.createElement('div');modal.className='bli-backdrop';document.body.append(modal);modal.addEventListener('mousedown',event=>{if(event.target===modal)closeInstructions()})}
  modal.innerHTML=shell(project,manifest);modal.classList.add('open');bind(project,manifest);icons()
}
function closeInstructions(){pdfAbort?.abort();pdfAbort=null;previewToken++;previewRenderer?.dispose?.();previewRenderer=null;modal?.classList.remove('open')}

document.addEventListener('keydown',event=>{if(event.key==='Escape'&&modal?.classList.contains('open')){event.preventDefault();event.stopPropagation();closeInstructions()}},true)
ensureStyle();injectButton()
globalThis.BrickLabInstructions=Object.freeze({version:INSTRUCTION_UI_VERSION,open:openInstructions,manifest:()=>{const project=currentProject();return project?instructionManifest(project,definitionFor):null}})
