import { initializeProjectLibrary, PROJECT_TEMPLATES } from './library-v1.js?v=project-library-20260912-v1'

export const PROJECT_LIBRARY_UI_VERSION='project-library-ui-v1.0.0'
const STYLE_ID='bricklab-project-library-v1-css'
let modal=null
let busy=false

const ru=()=>globalThis.window?.__bricklabI18n?.getLanguage?.()!=='en'
const t=(r,e)=>ru()?r:e
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]))
const fmt=date=>{try{return new Intl.DateTimeFormat(ru()?'ru-RU':'en-US',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(date))}catch{return''}}

function ensureStyle(){if(document.getElementById(STYLE_ID))return;const link=document.createElement('link');link.id=STYLE_ID;link.rel='stylesheet';link.href=new URL('./library-v1.css?v=project-library-20260912-v1',import.meta.url).href;document.head.append(link)}
function icons(){globalThis.window?.lucide?.createIcons?.({attrs:{'stroke-width':1.7,'aria-hidden':'true'}})}
function active(){return globalThis.BrickLabProjectLibrary?.activeId?.()||null}

function injectButton(){
  if(document.getElementById('projectLibraryBtn'))return
  const actions=document.querySelector('.top-actions');if(!actions)return
  const button=document.createElement('button');button.id='projectLibraryBtn';button.className='ghost';button.title=t('Библиотека проектов','Project library');button.innerHTML='<i data-lucide="folder-kanban"></i><span>'+t('Проекты','Projects')+'</span>'
  const exportBtn=document.getElementById('exportBtn');actions.insertBefore(button,exportBtn||null);button.addEventListener('click',()=>void openLibrary());icons()
}

function templateCard(template){return `<button class="blpl-template" data-template="${esc(template.id)}" type="button"><span class="blpl-template-icon"><i data-lucide="${template.id==='empty'?'file-plus-2':template.id==='vehicle-chassis'?'car-front':template.id==='drivetrain-bench'?'settings-2':'move-3d'}"></i></span><span><strong>${esc(template.name)}</strong><small>${esc(template.description)}</small></span><em>${template.snapshot.parts.length}</em></button>`}
function projectCard(project){
  const current=project.id===active()
  const image=`data:image/svg+xml;charset=utf-8,${encodeURIComponent(project.thumbnailSvg||'')}`
  return `<article class="blpl-card ${current?'current':''}" data-project-id="${esc(project.id)}">
    <div class="blpl-preview"><img src="${image}" alt=""/>${current?`<span class="blpl-current">${t('Текущий','Current')}</span>`:''}</div>
    <div class="blpl-card-body"><div class="blpl-card-title"><strong>${esc(project.name)}</strong><button class="blpl-icon" data-action="rename" title="${t('Переименовать','Rename')}"><i data-lucide="pencil"></i></button></div><div class="blpl-meta"><span><i data-lucide="box"></i>${project.partCount} ${t('дет.','parts')}</span><span><i data-lucide="link-2"></i>${project.linkCount}</span><span>${esc(fmt(project.modifiedAt))}</span></div></div>
    <div class="blpl-actions"><button class="primary small" data-action="open" ${current?'disabled':''}><i data-lucide="folder-open"></i>${current?t('Открыт','Open'):t('Открыть','Open')}</button><button class="ghost small" data-action="duplicate" title="${t('Дублировать','Duplicate')}"><i data-lucide="copy"></i></button><button class="ghost small" data-action="export" title="${t('Экспорт','Export')}"><i data-lucide="download"></i></button><button class="ghost small danger" data-action="delete" title="${t('Удалить','Delete')}"><i data-lucide="trash-2"></i></button></div>
  </article>`
}

async function render(){
  if(!modal)return
  const library=globalThis.BrickLabProjectLibrary
  const projects=await library.list()
  modal.innerHTML=`<div class="blpl-shell" role="dialog" aria-modal="true" aria-labelledby="blplTitle">
    <header class="blpl-head"><div><small>BRICKLAB 3D</small><h2 id="blplTitle">${t('Библиотека проектов','Project Library')}</h2><p>${t('Локальные сборки, шаблоны и .bricklab — без облака.','Local builds, templates and .bricklab files — no cloud required.')}</p></div><button class="blpl-close icon-btn" data-close aria-label="Close"><i data-lucide="x"></i></button></header>
    <section class="blpl-toolbar"><button class="primary" data-new><i data-lucide="file-plus-2"></i>${t('Новый','New')}</button><button class="ghost" data-import><i data-lucide="upload"></i>${t('Импорт .bricklab','Import .bricklab')}</button><button class="ghost" data-sync><i data-lucide="save"></i>${t('Сохранить текущий','Save current')}</button><span class="blpl-count">${projects.length} ${t('проектов','projects')}</span></section>
    <section class="blpl-section"><div class="blpl-section-title"><div><small>${t('БЫСТРЫЙ СТАРТ','QUICK START')}</small><h3>${t('Шаблоны','Templates')}</h3></div></div><div class="blpl-templates">${PROJECT_TEMPLATES.map(templateCard).join('')}</div></section>
    <section class="blpl-section grow"><div class="blpl-section-title"><div><small>${t('РАБОЧЕЕ ПРОСТРАНСТВО','WORKSPACE')}</small><h3>${t('Мои проекты','My projects')}</h3></div><span>${t('Превью и метаданные загружаются без открытия 3D-сцены','Cards load without opening the 3D scene')}</span></div><div class="blpl-grid">${projects.length?projects.map(projectCard).join(''):`<div class="blpl-empty"><i data-lucide="folder-open"></i><strong>${t('Здесь пока пусто','No projects yet')}</strong><span>${t('Создай проект или выбери шаблон выше.','Create a project or choose a template above.')}</span></div>`}</div></section>
    <footer class="blpl-foot"><span>${t('Хранилище: IndexedDB · активный проект совместим с текущим autosave','Storage: IndexedDB · active project remains compatible with current autosave')}</span><span class="blpl-status"></span></footer>
  </div>`
  bind();icons()
}

function status(text,error=false){const el=modal?.querySelector('.blpl-status');if(!el)return;el.textContent=text;el.classList.toggle('error',error)}
async function run(label,fn){if(busy)return;busy=true;status(label);try{await fn();await render()}catch(error){console.warn('[BrickLab Project Library]',error);status(String(error?.message||error),true)}finally{busy=false}}

function bind(){
  modal.querySelector('[data-close]')?.addEventListener('click',closeLibrary)
  modal.querySelector('[data-new]')?.addEventListener('click',()=>void run(t('Создаём проект…','Creating project…'),async()=>{const meta=await globalThis.BrickLabProjectLibrary.createFromTemplate('empty',{open:false});await globalThis.BrickLabProjectLibrary.open(meta.id);closeLibrary()}))
  modal.querySelector('[data-import]')?.addEventListener('click',()=>{document.getElementById('importFile')?.click();closeLibrary()})
  modal.querySelector('[data-sync]')?.addEventListener('click',()=>void run(t('Сохраняем…','Saving…'),()=>globalThis.BrickLabProjectLibrary.syncCurrent()))
  modal.querySelectorAll('[data-template]').forEach(button=>button.addEventListener('click',()=>void run(t('Открываем шаблон…','Opening template…'),async()=>{const meta=await globalThis.BrickLabProjectLibrary.createFromTemplate(button.dataset.template,{open:false});await globalThis.BrickLabProjectLibrary.open(meta.id);closeLibrary()})))
  modal.querySelectorAll('[data-project-id]').forEach(card=>card.addEventListener('click',event=>{
    const action=event.target.closest('[data-action]')?.dataset.action;if(!action)return
    const id=card.dataset.projectId
    if(action==='open')return void run(t('Открываем проект…','Opening project…'),async()=>{await globalThis.BrickLabProjectLibrary.open(id);closeLibrary()})
    if(action==='duplicate')return void run(t('Создаём копию…','Duplicating…'),()=>globalThis.BrickLabProjectLibrary.duplicate(id))
    if(action==='export')return void run(t('Экспортируем…','Exporting…'),()=>globalThis.BrickLabProjectLibrary.exportProject(id))
    if(action==='rename'){
      const currentName=card.querySelector('.blpl-card-title strong')?.textContent||'';const name=prompt(t('Новое имя проекта','New project name'),currentName);if(name?.trim())void run(t('Переименовываем…','Renaming…'),()=>globalThis.BrickLabProjectLibrary.rename(id,name));return
    }
    if(action==='delete'){
      if(id===active()){status(t('Текущий проект нельзя удалить. Сначала открой другой.','The current project cannot be deleted. Open another project first.'),true);return}
      if(confirm(t('Удалить этот проект из локальной библиотеки?','Delete this project from the local library?')))void run(t('Удаляем…','Deleting…'),()=>globalThis.BrickLabProjectLibrary.remove(id))
    }
  }))
}

async function openLibrary(){
  ensureStyle();await globalThis.BrickLabProjectLibrary?.syncCurrent?.().catch(()=>null)
  if(!modal){modal=document.createElement('div');modal.className='blpl-backdrop';document.body.append(modal);modal.addEventListener('mousedown',event=>{if(event.target===modal)closeLibrary()})}
  modal.classList.add('open');await render()
}
function closeLibrary(){modal?.classList.remove('open')}

document.addEventListener('keydown',event=>{if(event.key==='Escape'&&modal?.classList.contains('open')){event.preventDefault();event.stopPropagation();closeLibrary()}},true)
globalThis.addEventListener?.('bricklab:projectlibrarychange',()=>{if(modal?.classList.contains('open'))void render()})

await initializeProjectLibrary()
ensureStyle();injectButton()
globalThis.BrickLabProjectLibraryUI=Object.freeze({version:PROJECT_LIBRARY_UI_VERSION,open:openLibrary,close:closeLibrary})
