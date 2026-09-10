import { getPhysicsV2Settings, setPhysicsV2Settings } from '../physics-v2.js'
import { TIME_SCALES, normalizeTimeScale } from '../simulation-time.js'

const KEYMAP_KEY = 'bricklab.controls.v1'
const TIME_SCALE_KEY = 'bricklab.physics.time-scale.v1'
const MASS_OVERLAY_KEY = 'bricklab.physics.v2.mass-overlay'
const STYLE_ID = 'bricklab-project-menu-v1-css'

const bind = (code, ctrl = false, shift = false, alt = false) => ({ code, ctrl, shift, alt })

const ACTIONS = Object.freeze([
  { id:'move', group:'tools', ru:'Перемещение', en:'Move', legacy:bind('KeyM') },
  { id:'rotate', group:'tools', ru:'Вращение', en:'Rotate', legacy:bind('KeyR') },
  { id:'scale', group:'tools', ru:'Масштаб (зарезервировано)', en:'Scale (reserved)', legacy:bind('KeyS') },
  { id:'quickMove', group:'tools', ru:'Быстрое перемещение', en:'Quick move', legacy:bind('KeyG') },
  { id:'delete', group:'tools', ru:'Удалить', en:'Delete', legacy:bind('Delete') },
  { id:'duplicate', group:'tools', ru:'Дублировать', en:'Duplicate', legacy:bind('KeyD', true) },
  { id:'rotateLeft', group:'tools', ru:'Повернуть −90°', en:'Rotate −90°', legacy:bind('BracketLeft') },
  { id:'rotateRight', group:'tools', ru:'Повернуть +90°', en:'Rotate +90°', legacy:bind('BracketRight') },

  { id:'undo', group:'edit', ru:'Отменить', en:'Undo', legacy:bind('KeyZ', true) },
  { id:'redo', group:'edit', ru:'Повторить', en:'Redo', legacy:bind('KeyZ', true, true) },
  { id:'selectAll', group:'edit', ru:'Выбрать всё', en:'Select all', legacy:bind('KeyA', true) },
  { id:'group', group:'edit', ru:'Сгруппировать', en:'Group selected', legacy:bind('KeyG', true) },
  { id:'ungroup', group:'edit', ru:'Разгруппировать', en:'Ungroup', legacy:bind('KeyG', true, true) },

  { id:'focus', group:'view', ru:'Фокус на выделении', en:'Focus selection', legacy:bind('KeyF') },
  { id:'frameAll', group:'view', ru:'Показать всю сборку', en:'Frame whole build', legacy:bind('Home') },
  { id:'front', group:'view', ru:'Вид спереди', en:'Front view', legacy:bind('Digit1') },
  { id:'side', group:'view', ru:'Вид сбоку', en:'Side view', legacy:bind('Digit2') },
  { id:'top', group:'view', ru:'Вид сверху', en:'Top view', legacy:bind('Digit3') },
  { id:'projection', group:'view', ru:'Перспектива / ортографика', en:'Perspective / orthographic', legacy:bind('Digit5') },
  { id:'transformSpace', group:'view', ru:'Локальные / мировые оси', en:'Local / world axes', legacy:bind('KeyQ') },

  { id:'connectorSnap', group:'mechanics', ru:'Привязка коннекторов', en:'Connector snap', legacy:bind('KeyS', false, true) },
  { id:'gridSnap', group:'mechanics', ru:'Привязка к сетке', en:'Grid snap', legacy:bind('KeyG', false, true) },
  { id:'resetRotation', group:'mechanics', ru:'Сбросить вращение', en:'Reset rotation', legacy:bind('KeyR', false, false, true) },
  { id:'resetPosition', group:'mechanics', ru:'Сбросить позицию', en:'Reset position', legacy:bind('KeyG', false, false, true) },
  { id:'connectorPoints', group:'mechanics', ru:'Точки коннекторов', en:'Connector points', legacy:bind('KeyC') },
  { id:'connectionGraph', group:'mechanics', ru:'Граф связей', en:'Connection graph', legacy:bind('KeyL') },
  { id:'disconnect', group:'mechanics', ru:'Разъединить выбранное', en:'Disconnect selected', legacy:bind('KeyD') },
  { id:'mechanicsProps', group:'mechanics', ru:'Свойства механики', en:'Mechanics properties', legacy:bind('KeyI') },

  { id:'playPause', group:'simulation', ru:'Старт / пауза симуляции', en:'Play / pause simulation', legacy:bind('Space') },
  { id:'resetSimulation', group:'simulation', ru:'Сбросить симуляцию', en:'Reset simulation', legacy:bind('Space', false, true) },
  { id:'toggleBuildSim', group:'simulation', ru:'СБОРКА ↔ СИМУЛЯЦИЯ', en:'BUILD ↔ SIMULATE', legacy:bind('Tab') },
  { id:'physicsDebug', group:'simulation', ru:'Physics Debug', en:'Physics Debug', legacy:bind('F8') },

  { id:'save', group:'project', ru:'Сохранить проект', en:'Save project', legacy:bind('KeyS', true) },
  { id:'export', group:'project', ru:'Экспортировать .bricklab', en:'Export .bricklab', legacy:bind('KeyS', true, true) },
  { id:'import', group:'project', ru:'Импортировать .bricklab', en:'Import .bricklab', legacy:bind('KeyO', true) },
  { id:'newProject', group:'project', ru:'Новый проект', en:'New project', legacy:bind('KeyN', true) },
])

const GROUPS = Object.freeze({
  all:{ru:'Все',en:'All'}, tools:{ru:'Инструменты',en:'Tools'}, edit:{ru:'Редактирование',en:'Edit'}, view:{ru:'Вид',en:'View'}, mechanics:{ru:'Механика',en:'Mechanics'}, simulation:{ru:'Симуляция',en:'Simulation'}, project:{ru:'Проект',en:'Project'},
})

const COPY = {
  ru:{
    pause:'Меню проекта', continue:'Продолжить', project:'Проект', settings:'Настройки', controls:'Управление', mainMenu:'В главное меню',
    escHint:'ESC — назад / закрыть', projectTitle:'Проект', projectText:'Сохранение, загрузка и перенос сборок BrickLab.',
    newProject:'Новый проект', newProjectHint:'Очистить сцену и начать новую сборку', save:'Сохранить', saveHint:'Сохранить текущую сборку в браузере', load:'Загрузить сохранение', loadHint:'Вернуть последнее локальное сохранение', import:'Импортировать', importHint:'Открыть файл .bricklab', export:'Экспортировать', exportHint:'Скачать проект как .bricklab',
    settingsTitle:'Настройки', settingsText:'Общие параметры BrickLab, звук и физика.', general:'Общие', audio:'Аудио', physics:'Физика',
    language:'Язык интерфейса', languageHint:'Переключение применяется ко всему редактору.', autosave:'Автосохранение', autosaveHint:'BrickLab сохраняет подтверждённые изменения локально автоматически.', alwaysOn:'Всегда включено',
    master:'Общая громкость', sfx:'Эффекты', music:'Музыка', mute:'Без звука', audioHint:'Изменения применяются сразу и сохраняются локально.',
    quality:'Качество симуляции', qualityHint:'Частота физики и число итераций решателя.', selfCollision:'Самоколлизия', selfCollisionHint:'Какие детали одной конструкции сталкиваются между собой.', debug:'Physics Debug', debugHint:'Диагностическая визуализация физики.', massOverlay:'Масса / центр масс', massOverlayHint:'Показывать физическую массу и COM в режиме сборки.', timeScale:'Скорость времени', timeScaleHint:'Множитель времени SIMULATE. В TEST всегда используется 1×.', resetPhysics:'Сбросить физику',
    fast:'Быстро · 60 Hz', balanced:'Баланс · 120 Hz', accurate:'Точно · 180 Hz', selfOff:'Выкл.', selfMechanical:'Механика', selfFull:'Полная',
    controlsTitle:'Управление', controlsText:'Назначение клавиш работает поверх старых сочетаний BrickLab.', menuFixed:'Меню проекта', fixed:'фиксировано', resetKeys:'Сбросить клавиши', pressKey:'Нажмите клавишу…', unassigned:'Не назначено',
    conflict:'Эта клавиша уже используется:', replace:'Заменить', cancel:'Отмена', saved:'Сохранено', exported:'Экспорт запущен', noSave:'Локальное сохранение не найдено', loaded:'Сохранение загружено', reservedEsc:'ESC зарезервирован для меню проекта', bindingsReset:'Назначения сброшены', physicsReset:'Настройки физики сброшены',
    confirmNew:'Создать новый проект? Текущая локальная сборка будет заменена после первого изменения.',
  },
  en:{
    pause:'Project menu', continue:'Continue', project:'Project', settings:'Settings', controls:'Controls', mainMenu:'Main menu',
    escHint:'ESC — back / close', projectTitle:'Project', projectText:'Save, load and move BrickLab builds.',
    newProject:'New project', newProjectHint:'Clear the scene and start a new build', save:'Save', saveHint:'Save the current build in this browser', load:'Load saved build', loadHint:'Restore the latest local save', import:'Import', importHint:'Open a .bricklab file', export:'Export', exportHint:'Download the project as .bricklab',
    settingsTitle:'Settings', settingsText:'General BrickLab, audio and physics settings.', general:'General', audio:'Audio', physics:'Physics',
    language:'Interface language', languageHint:'The change applies to the whole editor.', autosave:'Autosave', autosaveHint:'BrickLab automatically stores committed edits locally.', alwaysOn:'Always on',
    master:'Master volume', sfx:'Sound effects', music:'Music', mute:'Mute', audioHint:'Changes apply immediately and are stored locally.',
    quality:'Simulation quality', qualityHint:'Physics frequency and solver iteration count.', selfCollision:'Self collision', selfCollisionHint:'Which parts of one build collide with each other.', debug:'Physics Debug', debugHint:'Physics diagnostic visualization.', massOverlay:'Mass / center of mass', massOverlayHint:'Show physical mass and COM while building.', timeScale:'Time scale', timeScaleHint:'SIMULATE time multiplier. TEST always runs at 1×.', resetPhysics:'Reset physics',
    fast:'Fast · 60 Hz', balanced:'Balanced · 120 Hz', accurate:'Accurate · 180 Hz', selfOff:'Off', selfMechanical:'Mechanical', selfFull:'Full',
    controlsTitle:'Controls', controlsText:'Custom bindings replace BrickLab’s old hard-coded shortcuts.', menuFixed:'Project menu', fixed:'fixed', resetKeys:'Reset bindings', pressKey:'Press a key…', unassigned:'Unassigned',
    conflict:'This key is already used by:', replace:'Replace', cancel:'Cancel', saved:'Saved', exported:'Export started', noSave:'No local save found', loaded:'Save loaded', reservedEsc:'ESC is reserved for the project menu', bindingsReset:'Bindings reset', physicsReset:'Physics settings reset',
    confirmNew:'Create a new project? The current local build will be replaced after the first edit.',
  },
}

let menu = null
let view = 'root'
let settingsTab = 'general'
let controlsFilter = 'all'
let statusText = ''
let statusTimer = 0
let rebinding = null
let pendingConflict = null
let forwarding = false
let simulationWasRunning = false
let keymap = readKeymap()

function language(){return window.__bricklabI18n?.getLanguage?.() === 'en' ? 'en' : 'ru'}
function text(){return COPY[language()]}
function actionLabel(action){return action[language()] || action.en}
function groupLabel(group){return GROUPS[group]?.[language()] || group}
function actionById(id){return ACTIONS.find(action=>action.id===id) || null}
function cloneBinding(value){return value ? {code:value.code,ctrl:!!value.ctrl,shift:!!value.shift,alt:!!value.alt} : null}

function defaultKeymap(){return Object.fromEntries(ACTIONS.map(action=>[action.id,cloneBinding(action.legacy)]))}
function readKeymap(){
  const defaults=defaultKeymap()
  try{
    const raw=JSON.parse(localStorage.getItem(KEYMAP_KEY)||'{}')
    for(const action of ACTIONS){
      const value=raw[action.id]
      if(value===null) defaults[action.id]=null
      else if(value && typeof value.code==='string') defaults[action.id]=cloneBinding(value)
    }
  }catch{/* keep defaults */}
  return defaults
}
function saveKeymap(){try{localStorage.setItem(KEYMAP_KEY,JSON.stringify(keymap))}catch{/* storage denied */}}

function bindingKey(value){return value ? `${value.ctrl?'1':'0'}${value.shift?'1':'0'}${value.alt?'1':'0'}:${value.code}` : ''}
function matchesBinding(event,value){return !!value && event.code===value.code && !!(event.ctrlKey||event.metaKey)===!!value.ctrl && !!event.shiftKey===!!value.shift && !!event.altKey===!!value.alt}
function bindingFromEvent(event){return {code:event.code,ctrl:!!(event.ctrlKey||event.metaKey),shift:!!event.shiftKey,alt:!!event.altKey}}
function codeLabel(code){
  if(/^Key[A-Z]$/.test(code)) return code.slice(3)
  if(/^Digit\d$/.test(code)) return code.slice(5)
  return ({Space:'Space',Delete:'Delete',Backspace:'Backspace',Tab:'Tab',Home:'Home',BracketLeft:'[',BracketRight:']',Slash:'/',Escape:'Esc',ArrowUp:'↑',ArrowDown:'↓',ArrowLeft:'←',ArrowRight:'→'}[code]||code.replace(/^Numpad/,'Num '))
}
function bindingLabel(value){if(!value)return text().unassigned;return [value.ctrl?'Ctrl':null,value.shift?'Shift':null,value.alt?'Alt':null,codeLabel(value.code)].filter(Boolean).join(' + ')}

function ensureStyles(){
  if(document.getElementById(STYLE_ID))return
  const link=document.createElement('link');link.id=STYLE_ID;link.rel='stylesheet';link.href=new URL('./project-menu-v1.css?v=project-menu-20260910-v1',import.meta.url).href;document.head.append(link)
}
function renderIcons(){window.lucide?.createIcons?.({attrs:{'stroke-width':1.7,'aria-hidden':'true'}})}
function projectName(){return document.getElementById('projectName')?.textContent?.trim() || 'BrickLab 3D'}
function isTypingTarget(target){return target instanceof HTMLElement && (/INPUT|TEXTAREA|SELECT/.test(target.tagName)||target.isContentEditable)}

function setStatus(value,duration=2200){statusText=value;clearTimeout(statusTimer);renderFooter();if(duration)statusTimer=setTimeout(()=>{statusText='';renderFooter()},duration)}
function renderFooter(){if(!menu)return;const el=menu.querySelector('.blpm-status');if(el)el.textContent=statusText}

function shell(body,title,subtitle,{back=view!=='root'}={}){
  const t=text()
  return `<div class="blpm-shell" role="dialog" aria-modal="true" aria-label="${title}">
    <header class="blpm-head">
      <div class="blpm-brand"><span class="blpm-mark">B</span><div class="blpm-title"><small>BRICKLAB 3D</small><strong>${title}</strong></div></div>
      ${back?'<button class="blpm-back" type="button" data-route="root" aria-label="Back"><i data-lucide="arrow-left"></i></button>':'<button class="blpm-close" type="button" data-close aria-label="Close"><i data-lucide="x"></i></button>'}
    </header>
    <div class="blpm-body">${subtitle?`<div class="blpm-section-head"><div><h2>${title}</h2><p>${subtitle}</p></div></div>`:''}${body}</div>
    <footer class="blpm-foot"><span>${t.escHint} · <kbd>ESC</kbd></span><span class="blpm-status">${statusText}</span></footer>
  </div>`
}

function renderRoot(){
  const t=text()
  const body=`<div class="blpm-root">
    <button class="blpm-main-action primary" type="button" data-close><i data-lucide="play"></i><span class="label">${t.continue}</span><span class="arrow">›</span></button>
    <button class="blpm-main-action" type="button" data-route="project"><i data-lucide="folder-open"></i><span class="label">${t.project}</span><span class="arrow">›</span></button>
    <button class="blpm-main-action" type="button" data-route="settings"><i data-lucide="settings-2"></i><span class="label">${t.settings}</span><span class="arrow">›</span></button>
    <button class="blpm-main-action" type="button" data-route="controls"><i data-lucide="keyboard"></i><span class="label">${t.controls}</span><span class="arrow">›</span></button>
    <button class="blpm-main-action danger" type="button" data-main-menu><i data-lucide="log-out"></i><span class="label">${t.mainMenu}</span><span class="arrow">›</span></button>
  </div>`
  menu.innerHTML=shell(body,t.pause,'',{back:false})
}

function renderProject(){
  const t=text()
  const card=(icon,action,title,hint,extra='')=>`<button class="blpm-card-action ${extra}" type="button" data-project-action="${action}"><i data-lucide="${icon}"></i><span><strong>${title}</strong><small>${hint}</small></span></button>`
  const body=`<div class="blpm-project-grid">
    ${card('file-plus-2','new',t.newProject,t.newProjectHint,'danger')}
    ${card('save','save',t.save,t.saveHint)}
    ${card('history','load',t.load,t.loadHint)}
    ${card('upload','import',t.import,t.importHint)}
    ${card('download','export',t.export,t.exportHint)}
  </div>`
  menu.innerHTML=shell(body,t.projectTitle,t.projectText)
}

function settingsTabs(){
  const t=text();return `<div class="blpm-tabs">${['general','audio','physics'].map(id=>`<button type="button" class="blpm-tab ${settingsTab===id?'active':''}" data-settings-tab="${id}">${t[id]}</button>`).join('')}</div>`
}
function settingRow(title,hint,control){return `<div class="blpm-setting"><div class="blpm-setting-copy"><strong>${title}</strong><small>${hint}</small></div>${control}</div>`}
function rangeControl(name,value){return `<div class="blpm-range"><input type="range" min="0" max="100" value="${Math.round(value*100)}" data-audio-range="${name}"><output>${Math.round(value*100)}%</output></div>`}
function switchControl(attr,checked){return `<label class="blpm-switch"><input type="checkbox" ${attr} ${checked?'checked':''}><span></span></label>`}

function renderSettings(){
  const t=text();let content=''
  if(settingsTab==='general'){
    const lang=language()
    content=`<div class="blpm-settings">${settingRow(t.language,t.languageHint,`<div class="blpm-segment"><button type="button" data-language="ru" class="${lang==='ru'?'active':''}">RU</button><button type="button" data-language="en" class="${lang==='en'?'active':''}">EN</button></div>`)}${settingRow(t.autosave,t.autosaveHint,`<span class="blpm-info-pill">${t.alwaysOn}</span>`)}</div>`
  } else if(settingsTab==='audio'){
    const audio=window.BrickLabAudio
    const s=audio?.settings || {master:.7,sfx:.7,music:.23,mute:false}
    content=`<div class="blpm-settings">${settingRow(t.master,t.audioHint,rangeControl('master',s.master))}${settingRow(t.sfx,t.audioHint,rangeControl('sfx',s.sfx))}${settingRow(t.music,t.audioHint,rangeControl('music',s.music))}${settingRow(t.mute,t.audioHint,switchControl('data-audio-mute',s.mute))}</div>`
  } else {
    const s=getPhysicsV2Settings()
    const mass=localStorage.getItem(MASS_OVERLAY_KEY)!=='off'
    const time=normalizeTimeScale(Number(localStorage.getItem(TIME_SCALE_KEY)||window.__bricklabRequestedTimeScale||1))
    content=`<div class="blpm-settings">
      ${settingRow(t.quality,t.qualityHint,`<select class="blpm-select" data-physics="quality"><option value="fast" ${s.quality==='fast'?'selected':''}>${t.fast}</option><option value="balanced" ${s.quality==='balanced'?'selected':''}>${t.balanced}</option><option value="accurate" ${s.quality==='accurate'?'selected':''}>${t.accurate}</option></select>`)}
      ${settingRow(t.selfCollision,t.selfCollisionHint,`<select class="blpm-select" data-physics="selfCollision"><option value="off" ${s.selfCollision==='off'?'selected':''}>${t.selfOff}</option><option value="mechanical" ${s.selfCollision==='mechanical'?'selected':''}>${t.selfMechanical}</option><option value="full" ${s.selfCollision==='full'?'selected':''}>${t.selfFull}</option></select>`)}
      ${settingRow(t.debug,t.debugHint,switchControl('data-physics-debug',s.debug))}
      ${settingRow(t.massOverlay,t.massOverlayHint,switchControl('data-mass-overlay',mass))}
      ${settingRow(t.timeScale,t.timeScaleHint,`<div class="blpm-segment">${TIME_SCALES.map(value=>`<button type="button" data-time-scale="${value}" class="${time===value?'active':''}">${value}×</button>`).join('')}</div>`)}
      ${settingRow(t.resetPhysics,'',`<button class="blpm-reset" type="button" data-reset-physics>${t.resetPhysics}</button>`)}
    </div>`
  }
  const body=`<div class="blpm-section-head"><div><h2>${t.settingsTitle}</h2><p>${t.settingsText}</p></div>${settingsTabs()}</div>${content}`
  menu.innerHTML=shell(body,t.settingsTitle,'')
}

function renderControls(){
  const t=text()
  const filters=Object.keys(GROUPS).map(id=>`<button type="button" data-control-filter="${id}" class="${controlsFilter===id?'active':''}">${groupLabel(id)}</button>`).join('')
  const actions=ACTIONS.filter(action=>controlsFilter==='all'||action.group===controlsFilter)
  const conflict=pendingConflict?(()=>{const current=actionById(pendingConflict.otherId);return `<div class="blpm-conflict"><span>${t.conflict} <b>${current?actionLabel(current):''}</b> · <kbd>${bindingLabel(pendingConflict.binding)}</kbd></span><div class="blpm-conflict-actions"><button class="primary" type="button" data-conflict="replace">${t.replace}</button><button type="button" data-conflict="cancel">${t.cancel}</button></div></div>`})():''
  const rows=`<div class="blpm-control-row fixed"><div class="blpm-control-label"><small>SYSTEM</small><strong>${t.menuFixed}</strong></div><button class="blpm-bind" type="button" disabled>Esc · ${t.fixed}</button><span></span></div>`+actions.map(action=>{
    const listening=rebinding===action.id
    return `<div class="blpm-control-row"><div class="blpm-control-label"><small>${groupLabel(action.group)}</small><strong>${actionLabel(action)}</strong></div><button class="blpm-bind ${listening?'listening':''}" type="button" data-bind-action="${action.id}">${listening?t.pressKey:bindingLabel(keymap[action.id])}</button><button class="blpm-clear-bind" type="button" data-clear-binding="${action.id}" title="Clear"><i data-lucide="x"></i></button></div>`
  }).join('')
  const body=`<div class="blpm-section-head"><div><h2>${t.controlsTitle}</h2><p>${t.controlsText}</p></div><button class="blpm-reset" type="button" data-reset-bindings>${t.resetKeys}</button></div><div class="blpm-controls-toolbar"><div class="blpm-filter">${filters}</div></div>${conflict}<div class="blpm-control-list">${rows}</div>`
  menu.innerHTML=shell(body,t.controlsTitle,'')
}

function render(){
  if(!menu)return
  if(view==='project')renderProject()
  else if(view==='settings')renderSettings()
  else if(view==='controls')renderControls()
  else renderRoot()
  renderIcons();renderFooter()
}

function pauseSimulationForMenu(){
  simulationWasRunning=false
  const sim=document.querySelector('.mode[data-mode="simulate"].active')
  const button=document.getElementById('simPlayPause')
  if(!sim||!button||button.disabled)return
  const label=button.textContent||''
  if(/pause|пауза/i.test(label)){simulationWasRunning=true;button.click()}
}
function resumeSimulationAfterMenu(){
  if(!simulationWasRunning)return
  simulationWasRunning=false
  const sim=document.querySelector('.mode[data-mode="simulate"].active')
  const button=document.getElementById('simPlayPause')
  if(sim&&button&&!button.disabled)button.click()
}
function openMenu(){
  if(!menu||!menu.classList.contains('hidden'))return
  pauseSimulationForMenu();view='root';rebinding=null;pendingConflict=null;menu.classList.remove('hidden');document.body.classList.add('bricklab-project-menu-open');render();menu.querySelector('[data-close]')?.focus()
}
function closeMenu({resume=true}={}){
  if(!menu||menu.classList.contains('hidden'))return
  rebinding=null;pendingConflict=null;menu.classList.add('hidden');document.body.classList.remove('bricklab-project-menu-open');if(resume)resumeSimulationAfterMenu();else simulationWasRunning=false;document.querySelector('.viewport')?.focus?.()
}

function restartActivePhysics(){
  const sim=document.querySelector('.mode[data-mode="simulate"]')
  const build=document.querySelector('.mode[data-mode="build"]')
  if(sim?.classList.contains('active')){build?.click();requestAnimationFrame(()=>sim.click());return}
  if(document.body.dataset.bricklabTest)document.querySelector('.mode[data-mode="test"]')?.click()
}
function refreshMassOverlay(){
  const active=document.querySelector('.mode.active')
  if(active)active.dispatchEvent(new MouseEvent('click',{bubbles:true}))
}
function setTimeScale(value){
  const next=normalizeTimeScale(Number(value));window.__bricklabRequestedTimeScale=next;try{localStorage.setItem(TIME_SCALE_KEY,String(next))}catch{/* storage denied */}
}

function triggerHidden(id){document.getElementById(id)?.click()}
function loadLocalSnapshot(){
  const t=text();let raw=null
  try{raw=localStorage.getItem('bricklab.project.v2')||localStorage.getItem('bricklab.project.v1')}catch{/* storage denied */}
  if(!raw){setStatus(t.noSave);return}
  const input=document.getElementById('importFile')
  if(!input||typeof DataTransfer==='undefined'){setStatus(t.noSave);return}
  try{
    const transfer=new DataTransfer();transfer.items.add(new File([raw],'bricklab-local.bricklab',{type:'application/json'}));input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));setStatus(t.loaded);closeMenu()
  }catch(error){console.warn('[BrickLab project menu] Could not restore local save',error);setStatus(t.noSave)}
}
function projectAction(action){
  const t=text()
  if(action==='save'){triggerHidden('saveBtn');setStatus(t.saved);return}
  if(action==='export'){triggerHidden('exportBtn');setStatus(t.exported);return}
  if(action==='import'){document.getElementById('importFile')?.click();closeMenu();return}
  if(action==='load'){loadLocalSnapshot();return}
  if(action==='new'){
    if(!window.confirm(t.confirmNew))return
    triggerHidden('newBtn');closeMenu();return
  }
}
function goMainMenu(){triggerHidden('saveBtn');closeMenu({resume:false});location.reload()}

function resetPhysics(){
  setPhysicsV2Settings({quality:'balanced',selfCollision:'mechanical',debug:false});try{localStorage.setItem(MASS_OVERLAY_KEY,'on')}catch{/* storage denied */};setTimeScale(1);refreshMassOverlay();restartActivePhysics();setStatus(text().physicsReset);render()
}
function setAudio(name,value){
  const audio=window.BrickLabAudio
  if(!audio?.setSettings)return
  const patch=name==='mute'?{mute:!!value}:{[name]:Math.max(0,Math.min(1,Number(value)))};audio.setSettings(patch)
}

function startRebinding(id){rebinding=id;pendingConflict=null;render();requestAnimationFrame(()=>menu?.querySelector(`[data-bind-action="${id}"]`)?.focus())}
function assignBinding(id,value){
  const conflict=ACTIONS.find(action=>action.id!==id&&keymap[action.id]&&bindingKey(keymap[action.id])===bindingKey(value))
  if(conflict){pendingConflict={actionId:id,otherId:conflict.id,binding:value};rebinding=null;render();return}
  keymap[id]=value;saveKeymap();rebinding=null;pendingConflict=null;setStatus(text().saved);render()
}
function resolveConflict(choice){
  if(!pendingConflict)return
  if(choice==='replace'){
    keymap[pendingConflict.otherId]=null;keymap[pendingConflict.actionId]=cloneBinding(pendingConflict.binding);saveKeymap();setStatus(text().saved)
  }
  pendingConflict=null;rebinding=null;render()
}
function resetBindings(){keymap=defaultKeymap();saveKeymap();rebinding=null;pendingConflict=null;setStatus(text().bindingsReset);render()}

function keyForCode(code){if(/^Key[A-Z]$/.test(code))return code.slice(3).toLowerCase();if(/^Digit\d$/.test(code))return code.slice(5);return ({Space:' ',Tab:'Tab',Delete:'Delete',Home:'Home',BracketLeft:'[',BracketRight:']'}[code]||code)}
function forwardLegacy(action){
  if(!action?.legacy)return
  forwarding=true
  try{window.dispatchEvent(new KeyboardEvent('keydown',{code:action.legacy.code,key:keyForCode(action.legacy.code),ctrlKey:action.legacy.ctrl,metaKey:false,shiftKey:action.legacy.shift,altKey:action.legacy.alt,bubbles:false,cancelable:true}))}
  finally{forwarding=false}
}
function mappedActionForEvent(event){return ACTIONS.find(action=>matchesBinding(event,keymap[action.id]))||null}
function isLegacyShortcut(event){
  const code=event.code,mod=event.ctrlKey||event.metaKey,shift=event.shiftKey,alt=event.altKey
  if(code==='Escape'||(code==='Slash'&&shift)||code==='F8')return true
  if(mod&&['KeyS','KeyO','KeyN','KeyD','KeyA','KeyG','KeyZ','KeyY'].includes(code))return true
  if(alt&&['KeyR','KeyG'].includes(code))return true
  if(shift&&['KeyS','KeyG','Space'].includes(code))return true
  if(['Tab','Space','Delete','Backspace','KeyX','Home','BracketLeft','BracketRight'].includes(code))return true
  return ['KeyM','KeyR','KeyS','KeyG','KeyF','KeyQ','KeyC','KeyL','KeyD','KeyI','Digit1','Digit2','Digit3','Digit5'].includes(code)
}

function onKeyDown(event){
  if(forwarding)return
  const opened=menu&&!menu.classList.contains('hidden')
  if(opened&&rebinding){
    event.preventDefault();event.stopImmediatePropagation()
    if(event.code==='Escape'){rebinding=null;render();return}
    if(['ShiftLeft','ShiftRight','ControlLeft','ControlRight','AltLeft','AltRight','MetaLeft','MetaRight'].includes(event.code))return
    const next=bindingFromEvent(event)
    if(next.code==='Escape'){setStatus(text().reservedEsc);rebinding=null;render();return}
    assignBinding(rebinding,next);return
  }
  if(event.code==='Escape'){
    event.preventDefault();event.stopImmediatePropagation()
    if(opened){if(view!=='root'){view='root';pendingConflict=null;rebinding=null;render()}else closeMenu()}
    else if(!isTypingTarget(event.target))openMenu()
    return
  }
  if(isTypingTarget(event.target))return
  if(opened){if(isLegacyShortcut(event)){event.preventDefault();event.stopImmediatePropagation()}return}
  const action=mappedActionForEvent(event)
  if(action){event.preventDefault();event.stopImmediatePropagation();forwardLegacy(action);return}
  if(isLegacyShortcut(event)){event.preventDefault();event.stopImmediatePropagation()}
}

function onMenuClick(event){
  const route=event.target.closest('[data-route]')?.dataset.route
  if(route){view=route;pendingConflict=null;rebinding=null;render();return}
  if(event.target.closest('[data-close]')){closeMenu();return}
  if(event.target.closest('[data-main-menu]')){goMainMenu();return}
  const project=event.target.closest('[data-project-action]')?.dataset.projectAction;if(project){projectAction(project);return}
  const tab=event.target.closest('[data-settings-tab]')?.dataset.settingsTab;if(tab){settingsTab=tab;render();return}
  const lang=event.target.closest('[data-language]')?.dataset.language;if(lang){window.__bricklabI18n?.setLanguage?.(lang);render();return}
  const scale=event.target.closest('[data-time-scale]')?.dataset.timeScale;if(scale){setTimeScale(scale);render();return}
  if(event.target.closest('[data-reset-physics]')){resetPhysics();return}
  const filter=event.target.closest('[data-control-filter]')?.dataset.controlFilter;if(filter){controlsFilter=filter;render();return}
  const action=event.target.closest('[data-bind-action]')?.dataset.bindAction;if(action){startRebinding(action);return}
  const clear=event.target.closest('[data-clear-binding]')?.dataset.clearBinding;if(clear){keymap[clear]=null;saveKeymap();render();return}
  if(event.target.closest('[data-reset-bindings]')){resetBindings();return}
  const conflict=event.target.closest('[data-conflict]')?.dataset.conflict;if(conflict){resolveConflict(conflict);return}
}
function onMenuInput(event){
  const audio=event.target.dataset.audioRange
  if(audio){setAudio(audio,Number(event.target.value)/100);const output=event.target.nextElementSibling;if(output)output.value=`${event.target.value}%`}
}
function onMenuChange(event){
  if(event.target.matches('[data-audio-mute]')){setAudio('mute',event.target.checked);return}
  if(event.target.matches('[data-physics]')){setPhysicsV2Settings({[event.target.dataset.physics]:event.target.value});restartActivePhysics();return}
  if(event.target.matches('[data-physics-debug]')){setPhysicsV2Settings({debug:event.target.checked});restartActivePhysics();return}
  if(event.target.matches('[data-mass-overlay]')){try{localStorage.setItem(MASS_OVERLAY_KEY,event.target.checked?'on':'off')}catch{/* storage denied */};refreshMassOverlay()}
}

function install(){
  if(document.getElementById('bricklabProjectMenu'))return
  ensureStyles()
  const storedScale=normalizeTimeScale(Number(localStorage.getItem(TIME_SCALE_KEY)||1));window.__bricklabRequestedTimeScale=storedScale
  menu=document.createElement('div');menu.id='bricklabProjectMenu';menu.className='hidden';menu.setAttribute('aria-hidden','true');document.body.append(menu)
  menu.addEventListener('click',onMenuClick);menu.addEventListener('input',onMenuInput);menu.addEventListener('change',onMenuChange)
  menu.addEventListener('pointerdown',event=>{if(event.target===menu)closeMenu()})
  window.addEventListener('keydown',onKeyDown,true)
  window.addEventListener('bricklab:languagechange',()=>{if(menu&&!menu.classList.contains('hidden'))render()})
  render()
  window.BrickLabProjectMenu=Object.freeze({open:openMenu,close:closeMenu,isOpen:()=>!menu.classList.contains('hidden'),resetBindings})
}

install()
