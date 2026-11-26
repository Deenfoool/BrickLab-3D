// Workspace chrome only. Geometry, placement, persistence and drive controls
// remain owned by editor.js. Preferences are independent of build documents.
const KEY = 'bricklab.workspace.v2.1'
const defaults = {
  build: { library: true, right: 'scene-parts' },
  paint: { library: false, right: '' },
  kinematics: { library: false, right: 'inspector' },
  testDrive: { library: false, right: '' },
}
const icons = {
  plus:'M12 5v14M5 12h14',
  folder:'M3 5h7l2 2h9v12H3z',
  save:'M4 3h13l4 4v14H3V3zm3 0v7h10V3M7 21v-7h10v7',
  cloud:'M7 17H5a4 4 0 1 1 1-8 6 6 0 0 1 11-2 5 5 0 0 1 2 10h-2m-5 4V10m-4 4 4-4 4 4',
  history:'M3 12a9 9 0 1 0 3-7L3 8m0-5v5h5m4-1v6l4 2',
  users:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m11-14a4 4 0 1 1-8 0 4 4 0 0 1 8 0m5 7a4 4 0 0 1 4 4v3M17 3a4 4 0 0 1 0 8',
  link:'M10 13a4 4 0 0 0 6 0l4-4a4 4 0 0 0-6-6l-2 2m2 6a4 4 0 0 0-6 0l-4 4a4 4 0 1 0 6 6l2-2',
  exit:'M10 17l5-5-5-5m5 5H3m12-9h6v18h-6',
  globe:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18',
  file:'M5 3h10l4 4v14H5zM14 3v5h5',
  search:'M16 16l5 5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  box:'M3 7l9-5 9 5v10l-9 5-9-5zm0 0 9 5 9-5m-9 5v10',
  library:'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  layers:'m12 3 10 5-10 5L2 8zM2 12l10 5 10-5M2 16l10 5 10-5',
  inspector:'M4 6h16M4 12h16M4 18h16M8 3v6M16 9v6M10 15v6',
  instruction:'M12 6C8 3 5 4 2 4v15c4 0 7 0 10 2 3-2 6-2 10-2V4c-3 0-7-1-10 2zm0 0v15',
  focus:'M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6',
  grid:'M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18',
  axes:'M12 12V3m0 9-9 8m9-8 9 8M9 6l3-3 3 3',
  pin:'m9 3 6 0-1 6 4 4v2H6v-2l4-4-1-6m3 12v6',
  view:'M3 4h18v16H3zM8 4v16M16 4v16',
  share:'M12 15V3m-4 4 4-4 4 4M5 11v10h14V11',
  chevron:'m7 10 5 5 5-5',
  check:'m5 12 4 4L19 6',
  camera:'M3 6h4l2-3h6l2 3h4v15H3zM16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  cable:'M5 3v7a4 4 0 0 0 8 0V8a3 3 0 0 1 6 0v13M3 3h4m10 18h4',
  duplicate:'M8 8h13v13H8zM16 5V3H3v13h2',
  hide:'m3 3 18 18M10 10a3 3 0 0 0 4 4M2 12s4-7 10-7c6 0 10 7 10 7s-1 2-4 4M6 7c-2 2-4 5-4 5s4 7 10 7c1 0 3-1 4-1',
  remove:'M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7',
}
const svg = name => '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="'+icons[name]+'"/></svg>'
const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
export function readWorkspace(raw, guided = false) {
  let saved
  try { saved = JSON.parse(raw) } catch {}
  const out = { floating: saved?.floating === true, pin: saved?.pin !== false,
    leftWidth: clamp(Number(saved?.leftWidth)||300, 220, 420),
    rightWidth: clamp(Number(saved?.rightWidth)||290, 220, 520), modes: {} }
  for (const [mode, initial] of Object.entries(defaults)) {
    const old = saved?.modes?.[mode]
    const right = ['scene-parts','inspector','instruction',''].includes(old?.right) ? old.right :
      guided && mode === 'build' ? 'instruction' : initial.right
    const defaultFloat = mode === 'build' ? ['inspector','scene-parts',...(guided?['instruction']:[])] : mode === 'kinematics' ? ['inspector','scene-parts'] : []
    const floatRight = Array.isArray(old?.floatRight) ? [...new Set(old.floatRight.filter(id=>['inspector','scene-parts',...(guided?['instruction']:[])].includes(id)))] : defaultFloat
    out.modes[mode] = {
      floatRight,
      library: typeof old?.library === 'boolean' ? old.library : initial.library,
      right: right === 'instruction' && !guided ? initial.right : right,
    }
  }
  return out
}
export const defaultRightPanels=guided=>[...(guided?['instruction']:[]),'inspector','scene-parts']
export function mountWorkspace(root, { language, scene, signal, grid, axes, changePreference, hideSelection, openPhotoStudio, openCollaboration, commands, invokeCommand, openCommands }) {
  const ru = language === 'ru'
  const tr = (r,e) => ru ? r : e
  const doc = root.ownerDocument
  const el = name => root.querySelector('[data-el="'+name+'"]')
  const on = (target,event,fn) => target.addEventListener(event,fn,{signal})
  const create = (tag, cls) => { const n=doc.createElement(tag); if(cls)n.className=cls; return n }
  const panelLayer=el('panelLayer')
  const panels = Object.fromEntries([...panelLayer.querySelectorAll('[data-panel]')].map(p=>[p.dataset.panel,p]))
  let raw
  try { raw=localStorage.getItem(KEY) } catch {}
  const settings=readWorkspace(raw,Boolean(panels.instruction))
  const allRight=defaultRightPanels(Boolean(panels.instruction)).filter(id=>panels[id])
  settings.floating=false
  for(const m of ['build','kinematics'])settings.modes[m].floatRight=[...allRight]
  let mode='build', focus=false, presentation=false, gridOn=grid, axesOn=axes, saveState='initial', canPresent=true, pointsOn=false, wireframeOn=false
  const remember=()=>{try{localStorage.setItem(KEY,JSON.stringify(settings))}catch{}}
  const bar=root.querySelector('.editor-bar'), actions=root.querySelector('.editor-actions')
  const back=root.querySelector('.editor-back'), name=el('name')
  back.querySelector('span').classList.add('workspace-back-label')
  const project=create('details','workspace-menu workspace-project')
  const summary=create('summary','workspace-project-title')
  const title=create('span','workspace-name-label')
  const status=create('span','workspace-save-state')
  summary.append(title,doc.createRange().createContextualFragment(svg('chevron')))
  project.append(summary)
  const projectItems=create('div','workspace-menu-items')
  const menuButtons=new Map(),menus=[project]
  const section=(host,text)=>{const label=create('div','workspace-menu-heading');label.textContent=text;host.append(label)}
  const cmdButton=(host,id,icon,text,shortcut='',closeMenu=true)=>{const b=create('button','workspace-menu-command');b.type='button';b.dataset.command=id;b.innerHTML=svg(icon);const span=create('span');span.textContent=text;b.append(span);if(shortcut){const k=create('kbd');k.textContent=shortcut;b.append(k)}host.append(b);if(!menuButtons.has(id))menuButtons.set(id,[]);menuButtons.get(id).push(b);on(b,'click',()=>{if(closeMenu)for(const m of menus)m.open=false;invokeCommand?.(id)});return b}
  const stats=create('div','workspace-project-stats')
  const statValues=[]
  for(const [icon,label] of [['library',tr('Детали','Parts')],['link',tr('Соединения','Links')],['cable',tr('Ремни','Belts')]]){const box=create('div');box.innerHTML=svg(icon);const number=create('strong');number.textContent='0';statValues.push(number);const caption=create('small');caption.textContent=label;box.append(number,caption);stats.append(box)}
  projectItems.append(stats)
  section(projectItems,tr('Проект','Project'))
  const label=create('label','workspace-name-field');label.textContent=tr('Название сборки','Build name');label.append(name);projectItems.append(label)
  cmdButton(projectItems,'new','plus',tr('Новая сборка','New build'))
  cmdButton(projectItems,'home','folder',tr('Мои сборки','My builds'))
  cmdButton(projectItems,'copyProject','duplicate',tr('Создать копию','Duplicate project'))
  section(projectItems,tr('Сохранение','Save'))
  cmdButton(projectItems,'save','save',tr('Сохранить','Save'),'Ctrl+S')
  cmdButton(projectItems,'cloud','cloud',tr('Сохранить в облако','Save to cloud'))
  cmdButton(projectItems,'history','history',tr('История версий','Version history'))
  section(projectItems,tr('Студия конструктора','Builder studio'))
  cmdButton(projectItems,'photo','camera','Photo Studio')
  cmdButton(projectItems,'instructions','instruction','Instruction Studio')
  cmdButton(projectItems,'live','users',tr('Совместная сессия','Live collaboration'))
  section(projectItems,tr('Навигация','Navigation'))
  cmdButton(projectItems,'home','exit',tr('Закрыть проект','Close project'))
  project.append(projectItems);back.after(project,status)
  const share=create('details','workspace-menu workspace-share')
  const shareTitle=create('summary','workspace-share-title');shareTitle.innerHTML=svg('share')+'<span>'+tr('Поделиться','Share')+'</span>'+svg('chevron')
  const shareItems=create('div','workspace-menu-items')
  const originalActions=create('div');originalActions.hidden=true;originalActions.append(el('export'),el('publish'));shareItems.append(originalActions)
  section(shareItems,tr('Сообщество','Community'))
  cmdButton(shareItems,'publish','globe',tr('Опубликовать','Publish'))
  cmdButton(shareItems,'shareLink','link',tr('Скопировать публичную ссылку','Copy public link'))
  section(shareItems,tr('Экспорт','Export'))
  cmdButton(shareItems,'bricklab','file','BrickLab','.bricklab')
  cmdButton(shareItems,'ldr','file','LDraw','.ldr')
  cmdButton(shareItems,'csv','file',tr('Список деталей','Parts list'),'.csv')
  cmdButton(shareItems,'photo','camera',tr('Изображение','Image'),'.png')
  cmdButton(shareItems,'instructions','instruction',tr('Инструкция','Instruction'),'.pdf')
  share.append(shareTitle,shareItems);actions.append(share);menus.push(share)
  const display=create('details','workspace-menu workspace-display'),displayTitle=create('summary','workspace-share-title')
  displayTitle.innerHTML=svg('view')+'<span>'+tr('Вид','View')+'</span>'+svg('chevron')
  const displayItems=create('div','workspace-menu-items')
  const viewButtons=new Map()
  function viewItem(id,icon,text,run){const b=create('button','workspace-menu-command');b.type='button';b.innerHTML=svg(icon);const span=create('span');span.textContent=text;b.append(span);const check=create('span','workspace-menu-check');check.textContent='✓';b.append(check);displayItems.append(b);viewButtons.set(id,b);on(b,'click',run);return b}
  section(displayItems,tr('Панели','Panels'))
  for(const [id,icon,label] of [['library','library',tr('Библиотека','Library')],['instruction','instruction',tr('Инструкция','Instructions')],['inspector','inspector',tr('Инспектор','Inspector')],['scene-parts','layers',tr('Детали сцены','Scene parts')]])if(panels[id])viewItem(id,icon,label,()=>togglePanel(id))
  section(displayItems,tr('Отображение','Display'))
  viewItem('grid','grid',tr('Сетка','Grid'),()=>gridBtn.click())
  viewItem('axes','axes',tr('Оси координат','Axes'),()=>axesBtn.click())
  viewItem('connections','link',tr('Точки соединений','Connection points'),()=>{pointsOn=!pointsOn;scene.setConnectorPoints(pointsOn);apply()})
  viewItem('wireframe','box',tr('Каркасный режим','Wireframe'),()=>{wireframeOn=!wireframeOn;scene.setWireframe(wireframeOn);apply()})
  section(displayItems,tr('Камера','Camera'))
  viewItem('perspective','view',tr('Перспективная','Perspective'),()=>{scene.setCameraMode('perspective');apply()})
  viewItem('orthographic','view',tr('Ортографическая','Orthographic'),()=>{scene.setCameraMode('orthographic');apply()})
  viewItem('fullscreen','focus',tr('Полноэкранный режим','Fullscreen'),()=>toggleView('fullscreen'))
  cmdButton(displayItems,'reset','history',tr('Сбросить вид','Reset view'))
  display.append(displayTitle,displayItems);actions.append(display);menus.push(display)
  const commandButton=create('button','workspace-command-trigger');commandButton.type='button';commandButton.innerHTML=svg('search')+'<span>Ctrl K</span>';commandButton.title='BrickLab Command (Ctrl+K)';commandButton.setAttribute('aria-label',commandButton.title);on(commandButton,'click',()=>{for(const menu of menus)menu.open=false;openCommands?.()});actions.append(commandButton)
  const context=create('div','workspace-context')
  const leftTools=create('div','workspace-context-group')
  const rightTools=create('div','workspace-context-group')
  const options=create('div','workspace-context-group workspace-options')
  const quick=create('div','workspace-context-group workspace-quick')
  const modeLabel=create('span','workspace-tool-name')
  const makeButton=(group,id,icon,label,showLabel=false)=>{
    const b=create('button','workspace-control')
    b.type='button';b.dataset.workspaceControl=id;b.title=label;b.setAttribute('aria-label',label)
    b.innerHTML=svg(icon)+(showLabel?'<span>'+label+'</span>':'')
    group.append(b);return b
  }
  const lib=makeButton(leftTools,'library','library',tr('Библиотека','Library'),true)
  const pin=makeButton(leftTools,'pin','pin',tr('Закрепить библиотеку','Pin library'))
  const view=makeButton(rightTools,'layout','view',tr('Переключить доки / плавающие панели','Toggle docked / floating panels'))
  const gridBtn=makeButton(rightTools,'grid','grid',tr('Сетка','Grid'))
  const axesBtn=makeButton(rightTools,'axes','axes',tr('Оси координат','Axes'))
  const tabs={}
  for(const [id,icon,label] of [['scene-parts','layers',tr('Детали сцены','Scene parts')],['inspector','inspector',tr('Инспектор','Inspector')],['instruction','instruction',tr('Инструкция','Instructions')]]){
    if(panels[id])tabs[id]=makeButton(rightTools,id,icon,label)
  }
  const focusBtn=makeButton(rightTools,'focus','focus',tr('Фокусировка (Alt+Shift+F)','Focus (Alt+Shift+F)'))
  const cameraBtn=makeButton(rightTools,'presentation','camera',tr('Чистый вид','Clean view'))
  // Keep the original controls and listeners, not proxy copies.
  const wire=el('wires'),cable=el('editCable')
  for(const [b,label] of [[wire,tr('Провода','Wires')],[cable,tr('Укладка проводов','Route cables')]]){
    b.title=label;b.setAttribute('aria-label',label)
  }
  wire.innerHTML=svg('cable')
  cable.innerHTML=svg('cable')+'<span>'+tr('Укладка','Route')+'</span>'
  rightTools.prepend(cable,wire)
  options.append(modeLabel,el('pivotMode'),el('rotationSnap'))
  const copyBtn=makeButton(quick,'duplicate','duplicate',tr('Дублировать выбранное','Duplicate selection'))
  const hideBtn=makeButton(quick,'hide','hide',tr('Скрыть выбранное','Hide selection'))
  const removeBtn=makeButton(quick,'delete','remove',tr('Удалить выбранное','Delete selection'))
  on(copyBtn,'click',()=>el('duplicate').click())
  on(hideBtn,'click',hideSelection)
  on(removeBtn,'click',()=>el('remove').click())
  quick.hidden=true
  context.append(leftTools,options,quick,rightTools)
  bar.after(context)
  const footer=create('div','workspace-status')
  const counts=create('span','workspace-count')
  const hint=el('hint')
  footer.append(counts,hint)
  root.querySelector('.editor-workspace').after(footer)
  const workspace=root.querySelector('.editor-workspace')
  const dividerLeft=create('div','workspace-divider workspace-divider-left')
  const dividerRight=create('div','workspace-divider workspace-divider-right')
  workspace.append(dividerLeft,dividerRight)
  const pressed=(b,v)=>b.setAttribute('aria-pressed',String(Boolean(v)))
  function expand(id){
    const panel=panels[id], toggle=panel?.querySelector('[data-panel-toggle]')
    if(toggle?.getAttribute('aria-expanded')==='false')toggle.click()
  }
  function apply(){
    const pref=settings.modes[mode]
    const small=innerWidth<900
    const floating=settings.floating
    const panelMode=mode==='build'||mode==='kinematics'
    const left=panelMode&&!focus&&pref.library&&mode==='build'
    const rightIds=panelMode&&!focus?allRight.filter(id=>pref.floatRight.includes(id)):[]
    const right=rightIds.length>0
    const rightWidth=rightIds.includes('instruction')?Math.max(settings.rightWidth,Math.min(440,innerWidth*.34)):settings.rightWidth
    root.dataset.workspaceLayout=floating?'floating':'dock'
    root.dataset.workspaceMode=mode
    root.toggleAttribute('data-workspace-focus',focus)
    root.toggleAttribute('data-workspace-presentation',presentation)
    root.toggleAttribute('data-workspace-left',Boolean(left))
    root.toggleAttribute('data-workspace-right',rightIds.length>0)
    root.style.setProperty('--workspace-left',settings.leftWidth+'px')
    root.style.setProperty('--workspace-right',rightWidth+'px')
    for(const [id,panel] of Object.entries(panels)){
      const shown=id==='library'?left:rightIds.includes(id)
      panel.toggleAttribute('data-workspace-hidden',!shown)
      if(id!=='library'&&shown){const i=rightIds.indexOf(id),weights=rightIds.map(x=>x==='instruction'?4:x==='inspector'?3:3),total=weights.reduce((a,b)=>a+b,0);panel.style.setProperty('--dock-top',100*weights.slice(0,i).reduce((a,b)=>a+b,0)/total+'%');panel.style.setProperty('--dock-bottom',100*weights.slice(i+1).reduce((a,b)=>a+b,0)/total+'%')}
    }
    if(!floating){if(left)expand('library');for(const id of rightIds)expand(id)}
    lib.disabled=mode!=='build'
    pin.disabled=mode!=='build'
    view.disabled=small
    for(const b of Object.values(tabs))b.disabled=!panelMode
    cameraBtn.disabled=mode==='testDrive'||(!canPresent&&!presentation)
    pressed(lib,left);pressed(pin,settings.pin);pressed(view,!floating)
    pressed(gridBtn,gridOn&&!presentation);pressed(axesBtn,axesOn&&!presentation)
    pressed(focusBtn,focus);pressed(cameraBtn,presentation)
    for(const [id,b] of Object.entries(tabs))pressed(b,rightIds.includes(id))
    dividerLeft.hidden=floating||!left
    dividerRight.hidden=floating||!right
    scene.setWorkspaceHelpers(gridOn&&!presentation,axesOn&&!presentation)
    scene.setWorkspacePresentation(presentation)
    const active={library:left,inspector:rightIds.includes('inspector'),'scene-parts':rightIds.includes('scene-parts'),instruction:rightIds.includes('instruction'),grid:gridOn,axes:axesOn,connections:pointsOn,wireframe:wireframeOn,perspective:scene.cameraMode==='perspective',orthographic:scene.cameraMode==='orthographic',fullscreen:Boolean(doc.fullscreenElement)}
    for(const [id,b] of viewButtons){pressed(b,active[id]);b.disabled=['library','inspector','scene-parts','instruction'].includes(id)&&!panelMode||['perspective','orthographic','connections','wireframe'].includes(id)&&mode==='testDrive'}
  }
  function openPanel(id){
    if(!panels[id])return
    focus=presentation=false
    if(id==='library')settings.modes[mode].library=true
    else {settings.modes[mode].right=id;if(!settings.modes[mode].floatRight.includes(id))settings.modes[mode].floatRight.push(id)}
    expand(id);remember();apply()
  }
  function togglePanel(id){
    if(focus){openPanel(id);return}
    focus=presentation=false
    const p=settings.modes[mode]
    if(id==='library'){p.library=!p.library;if(p.library)expand(id)}
    else {
      if(p.floatRight.includes(id))p.floatRight=p.floatRight.filter(x=>x!==id)
      else {p.floatRight.push(id);expand(id)}
    }
    remember();apply()
  }
  on(lib,'click',()=>togglePanel('library'))
  on(pin,'click',()=>{settings.pin=!settings.pin;remember();apply()})
  for(const [id,b] of Object.entries(tabs))on(b,'click',()=>togglePanel(id))
  on(view,'click',()=>{settings.floating=!settings.floating;remember();apply()})
  on(gridBtn,'click',()=>{gridOn=!gridOn;changePreference('grid',gridOn?'on':'off');apply()})
  on(axesBtn,'click',()=>{axesOn=!axesOn;changePreference('axes',axesOn?'on':'off');apply()})
  function toggleFocus(){focus=!focus;presentation=false;apply()}
  on(focusBtn,'click',toggleFocus)
  on(cameraBtn,'click',()=>{presentation=!presentation;focus=presentation;apply()})
  on(window,'keydown',e=>{
    if(e.defaultPrevented||e.target.closest?.('input,textarea,select,[contenteditable]')||doc.querySelector('dialog[open]'))return
    if(e.altKey&&e.shiftKey&&e.code==='KeyF'&&!e.repeat){e.preventDefault();toggleFocus()}
  })
  on(window,'resize',apply)
  on(doc,'fullscreenchange',apply)
  function toggleView(id){if(id==='grid')gridBtn.click();else if(id==='axes')axesBtn.click();else if(id==='fullscreen'){const result=doc.fullscreenElement?doc.exitFullscreen?.():root.requestFullscreen?.();result?.catch?.(()=>{})}}
  // Menus close on outside click and Escape, without intercepting scene hotkeys.
  on(doc,'pointerdown',e=>{for(const menu of menus)if(!menu.contains(e.target))menu.open=false})
  on(root,'keydown',e=>{
    if(e.key!=='Escape')return
    const menu=menus.find(m=>m.open)
    if(menu){e.preventDefault();e.stopPropagation();menu.open=false;menu.querySelector('summary').focus()}
  })
  on(name,'change',()=>{title.textContent=name.value})
  for(const b of shareItems.querySelectorAll('button'))on(b,'click',()=>{share.open=false})
  function updateCommands(){const active=new Map((commands?.()??[]).map(c=>[c.id,c]));for(const [id,buttons] of menuButtons){const cmd=active.get(id);for(const b of buttons)b.disabled=!cmd||cmd.enabled?.()===false}}
  for(const menu of menus)on(menu,'toggle',()=>{
    if(menu.open){for(const other of menus)if(other!==menu)other.open=false;updateCommands()}
  })
  for(const [id,panel] of Object.entries(panels)){
    const toggle=panel.querySelector('[data-panel-toggle]')
    if(toggle)on(toggle,'click',()=>{
      // Original floating panel code runs first. A collapsed dock frees space.
      if(root.dataset.workspaceLayout==='dock'&&toggle.getAttribute('aria-expanded')==='false'){
        const p=settings.modes[mode]
        if(id==='library')p.library=false
        else {p.floatRight=p.floatRight.filter(x=>x!==id);if(p.right===id)p.right=''}
        remember();apply()
      }
    })
  }
  function bindDivider(divider,side){
    let drag
    on(divider,'pointerdown',e=>{
      if(e.button!==0)return
      e.preventDefault();divider.setPointerCapture(e.pointerId)
      drag={id:e.pointerId,x:e.clientX,width:settings[side+'Width']}
    })
    on(divider,'pointermove',e=>{
      if(e.pointerId!==drag?.id)return
      const max=Math.min(side==='left'?420:520,innerWidth*.42)
      settings[side+'Width']=clamp(drag.width+(e.clientX-drag.x)*(side==='left'?1:-1),220,max)
      apply()
    })
    const end=e=>{if(e.pointerId===drag?.id){drag=undefined;remember()}}
    on(divider,'pointerup',end);on(divider,'pointercancel',end);on(divider,'lostpointercapture',end)
  }
  bindDivider(dividerLeft,'left');bindDivider(dividerRight,'right')
  function setSaved(ok){
    saveState=ok?'saved':'error'
    status.dataset.state=saveState
    status.title=ok?tr('Сохранено в браузере','Saved in browser'):tr('Не удалось сохранить локально','Local save failed')
    status.setAttribute('aria-label',status.title)
    status.textContent=ok?tr('✓ Сохранено','✓ Saved'):tr('! Не сохранено','! Not saved')
  }
  function render(nextMode,tool,partCount,linkCount,canQuick,idle,beltCount=0){
    canPresent=idle
    if(mode!==nextMode){mode=nextMode;focus=presentation=false}
    title.textContent=name.value||tr('Новая сборка','New build')
    statValues.forEach((v,i)=>v.textContent=[partCount,linkCount,beltCount][i])
    if(menus.some(m=>m.open))updateCommands()
    counts.textContent=tr('Деталей: ','Parts: ')+partCount+' · '+tr('Связей: ','Links: ')+linkCount
    modeLabel.textContent=nextMode==='build'?({select:tr('Выделение','Select'),box:tr('Рамка','Box select'),move:tr('Перемещение','Move'),rotate:tr('Вращение','Rotate'),length:tr('Длина оси','Axle length'),belt:tr('Ремень','Belt'),track:tr('Гусеница','Track')}[tool]||''):''
    options.hidden=nextMode!=='build'
    quick.hidden=!canQuick
    apply()
  }
  status.title=tr('Статус локального сохранения','Local save status')
  status.setAttribute('aria-label',status.title)
  status.textContent='·'
  apply()
  signal.addEventListener('abort',()=>{
    for(const name of ['data-workspace-layout','data-workspace-mode','data-workspace-focus','data-workspace-presentation','data-workspace-left','data-workspace-right'])root.removeAttribute(name)
    root.style.removeProperty('--workspace-left');root.style.removeProperty('--workspace-right')
  },{once:true})
  return {render,setSaved,openPanel,toggleView,rename(){project.open=true;name.focus();name.select()},photo(){openPhotoStudio?.()},exitPresentation(){if(presentation){focus=presentation=false;apply()}},placed(){if(!settings.pin&&mode==='build'){settings.modes.build.library=false;remember();apply()}}}
}
