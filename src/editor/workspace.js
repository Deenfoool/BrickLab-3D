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
    out.modes[mode] = {
      library: typeof old?.library === 'boolean' ? old.library : initial.library,
      right: right === 'instruction' && !guided ? initial.right : right,
    }
  }
  return out
}
export function mountWorkspace(root, { language, scene, signal, grid, axes, changePreference }) {
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
  let mode='build', focus=false, presentation=false, gridOn=grid, axesOn=axes, saveState='initial'
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
  const label=create('label','workspace-name-field')
  label.textContent=tr('Название сборки','Build name')
  label.append(name)
  projectItems.append(label)
  const home=back.cloneNode(true)
  home.className='workspace-home-link'
  home.replaceChildren(doc.createTextNode(tr('Мои сборки','My builds')))
  projectItems.append(home)
  project.append(projectItems)
  back.after(project,status)
  const share=create('details','workspace-menu workspace-share')
  const shareTitle=create('summary','workspace-share-title')
  shareTitle.innerHTML=svg('share')+'<span>'+tr('Поделиться','Share')+'</span>'+svg('chevron')
  const shareItems=create('div','workspace-menu-items')
  shareItems.append(el('export'),el('publish'))
  share.append(shareTitle,shareItems)
  actions.append(share)
  const context=create('div','workspace-context')
  const leftTools=create('div','workspace-context-group')
  const rightTools=create('div','workspace-context-group')
  const options=create('div','workspace-context-group workspace-options')
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
  for(const [id,icon,label] of [['scene-parts','layers',tr('Слои','Layers')],['inspector','inspector',tr('Свойства','Properties')],['instruction','instruction',tr('Инструкция','Instructions')]]){
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
  context.append(leftTools,options,rightTools)
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
    const floating=settings.floating||small
    const panelMode=mode==='build'||mode==='kinematics'
    const left=panelMode&&!focus&&pref.library&&mode==='build'
    const right=panelMode&&!focus&&pref.right
    const rightWidth=right==='instruction'?Math.max(settings.rightWidth,Math.min(440,innerWidth*.34)):settings.rightWidth
    root.dataset.workspaceLayout=floating?'floating':'dock'
    root.dataset.workspaceMode=mode
    root.toggleAttribute('data-workspace-focus',focus)
    root.toggleAttribute('data-workspace-presentation',presentation)
    root.toggleAttribute('data-workspace-left',Boolean(left))
    root.toggleAttribute('data-workspace-right',Boolean(right))
    root.style.setProperty('--workspace-left',settings.leftWidth+'px')
    root.style.setProperty('--workspace-right',rightWidth+'px')
    for(const [id,panel] of Object.entries(panels)){
      const shown=id==='library'?left:right===id
      panel.toggleAttribute('data-workspace-hidden',!shown)
    }
    if(left)expand('library')
    if(right)expand(right)
    lib.disabled=mode!=='build'
    pin.disabled=mode!=='build'
    view.disabled=small
    for(const b of Object.values(tabs))b.disabled=!panelMode
    cameraBtn.disabled=mode==='testDrive'
    pressed(lib,left);pressed(pin,settings.pin);pressed(view,!floating)
    pressed(gridBtn,gridOn&&!presentation);pressed(axesBtn,axesOn&&!presentation)
    pressed(focusBtn,focus);pressed(cameraBtn,presentation)
    for(const [id,b] of Object.entries(tabs))pressed(b,right===id)
    dividerLeft.hidden=floating||!left
    dividerRight.hidden=floating||!right
    scene.setWorkspaceHelpers(gridOn&&!presentation,axesOn&&!presentation)
  }
  function openPanel(id){
    if(!panels[id])return
    focus=presentation=false
    if(id==='library')settings.modes[mode].library=true
    else settings.modes[mode].right=id
    remember();apply()
  }
  function togglePanel(id){
    focus=presentation=false
    const p=settings.modes[mode]
    if(id==='library')p.library=!p.library
    else p.right=p.right===id?'':id
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
  // Menus close on outside click and Escape, without intercepting scene hotkeys.
  on(doc,'pointerdown',e=>{for(const menu of [project,share])if(!menu.contains(e.target))menu.open=false})
  on(root,'keydown',e=>{
    if(e.key!=='Escape')return
    const menu=[project,share].find(m=>m.open)
    if(menu){e.preventDefault();e.stopPropagation();menu.open=false;menu.querySelector('summary').focus()}
  })
  on(name,'change',()=>{title.textContent=name.value})
  for(const b of shareItems.querySelectorAll('button'))on(b,'click',()=>{share.open=false})
  for(const menu of [project,share])on(menu,'toggle',()=>{
    if(menu.open){for(const other of [project,share])if(other!==menu)other.open=false}
  })
  for(const [id,panel] of Object.entries(panels)){
    const toggle=panel.querySelector('[data-panel-toggle]')
    if(toggle)on(toggle,'click',()=>{
      // Original floating panel code runs first. A collapsed dock frees space.
      if(root.dataset.workspaceLayout==='dock'&&toggle.getAttribute('aria-expanded')==='false'){
        const p=settings.modes[mode]
        if(id==='library')p.library=false
        else if(p.right===id)p.right=''
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
    status.textContent=ok?'✓':'!'
  }
  function render(nextMode,tool,partCount,linkCount){
    if(mode!==nextMode){mode=nextMode;focus=presentation=false}
    title.textContent=name.value||tr('Новая сборка','New build')
    counts.textContent=tr('Деталей: ','Parts: ')+partCount+' · '+tr('Связей: ','Links: ')+linkCount
    modeLabel.textContent=nextMode==='build'?({select:tr('Выделение','Select'),box:tr('Рамка','Box select'),move:tr('Перемещение','Move'),rotate:tr('Вращение','Rotate'),length:tr('Длина оси','Axle length'),belt:tr('Ремень','Belt'),track:tr('Гусеница','Track')}[tool]||''):''
    options.hidden=nextMode!=='build'
    apply()
  }
  status.title=tr('Статус локального сохранения','Local save status')
  status.setAttribute('aria-label',status.title)
  status.textContent='·'
  apply()
  return {render,setSaved,openPanel,placed(){if(!settings.pin&&mode==='build'){settings.modes.build.library=false;remember();apply()}}}
}
