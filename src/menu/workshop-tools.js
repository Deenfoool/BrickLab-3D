import {modelPassport} from './workshop-model.js?v=activity-1'
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=String(text);return n}
function addOption(select,label,value){const option=el('option',null,label);option.value=value;select.append(option)}
// Structural inspection is deliberately separate from physical or kinematic validation.
export function inspectModel(document){
 const base=modelPassport(document)
 const ids=new Set((document?.parts??[]).filter(p=>p?.id&&typeof p.id==='string').map(p=>p.id))
 const graph=new Map([...ids].map(id=>[id,new Set()]))
 for(const c of document?.connections??[]){
  const a=c?.shaft?.part,b=c?.socket?.part
  if(a!==b&&graph.has(a)&&graph.has(b)){graph.get(a).add(b);graph.get(b).add(a)}
 }
 const visited=new Set(),components=[]
 for(const id of ids){
  if(visited.has(id))continue
  let count=0;const stack=[id];visited.add(id)
  while(stack.length){const cur=stack.pop();count++;for(const next of graph.get(cur))if(!visited.has(next)){visited.add(next);stack.push(next)}}
  components.push(count)
 }
 return {...base,components:components.length,isolated:components.filter(n=>n===1).length,largest:Math.max(0,...components)}
}
export function renderWorkshopTools({lang,local,remote,fetchCloud,signal}){
 const ru=lang==='ru',tr=(a,b)=>ru?a:b
 const root=el('section','account-card workshop-card workshop-tools'),controls=el('div','workshop-tools-controls'),output=el('div','workshop-tools-output'),status=el('p','account-muted')
 root.append(el('h2',null,tr('Инструменты мастерской','Workshop tools')),el('p','account-muted',tr('Создавай изображения модели и проверяй структуру сохранённых сборок. В ОБТ бесплатно.','Create model images and inspect saved builds. Free during open beta.')))
 const select=el('select');select.setAttribute('aria-label',tr('Сборка','Build'));addOption(select,tr('Выбери сборку','Choose a build'),'')
 for(const p of local)if(p.document?.parts?.length)addOption(select,p.document.name+' · '+tr('на устройстве','local'),'local:'+p.id)
 for(const p of remote)addOption(select,p.name+' · '+tr('облако','cloud'),'cloud:'+p.id)
 const option=(label,items)=>{const wrap=el('label'),s=el('select');wrap.append(el('span',null,label),s);for(const [value,title] of items)addOption(s,title,value);return {wrap,s}}
 const angle=option(tr('Ракурс','Angle'),[['iso',tr('Три четверти','Three quarters')],['front',tr('Спереди','Front')],['side',tr('Сбоку','Side')],['top',tr('Сверху','Top')],['rear',tr('Сзади','Rear three quarters')],['left',tr('Слева','Left')]])
 const light=option(tr('Свет','Lighting'),[['studio',tr('Студийный','Studio')],['warm',tr('Тёплый','Warm')],['cool',tr('Холодный','Cool')]])
 const bg=option(tr('Фон','Background'),[['transparent',tr('Прозрачный','Transparent')],['dark',tr('Тёмная студия','Dark studio')],['light',tr('Светлая студия','Light studio')],['blue',tr('Чертёжный синий','Blueprint blue')]])
 const size=option(tr('Длинная сторона','Long edge'),[['1280','1280 px'],['1920','1920 px']])
 const aspect=option(tr('Формат кадра','Aspect ratio'),[['16:9','16:9'],['1:1','1:1'],['4:5','4:5'],['9:16','9:16'],['3:2','3:2']])
 const framing=option(tr('Кадрирование','Framing'),[['normal',tr('Стандартное','Standard')],['close',tr('Крупно','Close')],['wide',tr('С отступом','Wide')]])
 const layout=option(tr('Композиция','Layout'),[['single',tr('Один ракурс','Single view')],['sheet',tr('Лист из 4 ракурсов','Four-view sheet')]])
 const shadowLabel=el('label'),shadow=el('input');shadow.type='checkbox';shadow.checked=true;shadowLabel.append(el('span',null,tr('Мягкая тень','Contact shadow')),shadow)
 const captionLabel=el('label'),caption=el('input');caption.type='checkbox';captionLabel.append(el('span',null,tr('Название и число деталей','Title and part count')),caption)
 const button=(label,fn)=>{const b=el('button','workspace-action',label);b.type='button';b.onclick=fn;return b}
 let active=false,url=null
 function clear(){if(url){URL.revokeObjectURL(url);url=null}output.replaceChildren()}
 signal.addEventListener('abort',clear,{once:true})
 async function getDoc(){
  const value=select.value
  if(value.startsWith('local:'))return local.find(p=>p.id===value.slice(6))?.document
  if(value.startsWith('cloud:'))return (await fetchCloud(value.slice(6),signal))?.document
  return null
 }
 async function run(action){
  if(active||!select.value||signal.aborted)return
  active=true;photo.disabled=diagnose.disabled=select.disabled=true
  for(const c of controls.querySelectorAll('select,input'))c.disabled=true
  clear();status.textContent=tr('Обрабатываем сборку…','Processing build…')
  try{const doc=await getDoc();if(!doc?.parts?.length)throw Error('empty');if(signal.aborted||!root.isConnected)return;await action(doc);if(!signal.aborted)status.textContent=''}
  catch{if(!signal.aborted)status.textContent=tr('Не удалось обработать сборку. Проверь наличие деталей и поддержку WebGL.','Could not process the build. Check its parts and WebGL support.')}
  finally{active=false;for(const c of controls.querySelectorAll('select,input'))c.disabled=false;photo.disabled=diagnose.disabled=!select.value}
 }
 const photo=button(tr('Создать фото','Create photo'),()=>run(async doc=>{
  const edge=Number(size.s.value),[aw,ah]=aspect.s.value.split(':').map(Number),w=Math.round(edge*aw/Math.max(aw,ah)),h=Math.round(edge*ah/Math.max(aw,ah)),sheet=layout.s.value==='sheet'
  const tw=sheet?Math.floor(w/2):w,th=sheet?Math.floor(h/2):h
  const {loadPartIndex,normalizeDocumentDesigns}=await import('../catalog/part-resolver.js?v=catalog-engine-1')
  const {parts}=await import('../editor/parts.js?v=system-complete')
  await loadPartIndex();signal.throwIfAborted()
  const source=normalizeDocumentDesigns(doc,parts)
  const {createProjectPreviewRenderer}=await import('../editor/project-preview.js?v=photo-studio-2')
  signal.throwIfAborted()
  const renderer=createProjectPreviewRenderer({width:tw,height:th,angle:angle.s.value,lighting:light.s.value,format:'png',requireAll:true,shadow:shadow.checked,framing:framing.s.value})
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h
  const ctx=canvas.getContext('2d')
  const colors={dark:['#3b465b','#12161e'],light:['#fff','#cdd5e1'],blue:['#376185','#122843']}
  if(bg.s.value!=='transparent'){const g=ctx.createLinearGradient(0,0,w,h),c=colors[bg.s.value]??colors.light;g.addColorStop(0,c[0]);g.addColorStop(1,c[1]);ctx.fillStyle=g;ctx.fillRect(0,0,w,h)}
  const shots=sheet?['iso','front','side','top']:[angle.s.value]
  const labels={iso:tr('Перспектива','Three quarters'),front:tr('Спереди','Front'),side:tr('Сбоку','Side'),top:tr('Сверху','Top')}
  let blob
  try{
   for(const [i,view] of shots.entries()){
    signal.throwIfAborted();status.textContent=tr('Рендер кадра ','Rendering shot ')+(i+1)+'/'+shots.length
    const image=await renderer.render(source,signal,{angle:view})
    if(!image)throw Error('empty')
    const bitmap=await createImageBitmap(image),x=sheet?(i%2)*tw:0,y=sheet?Math.floor(i/2)*th:0
    try{ctx.drawImage(bitmap,x,y,tw,th)}finally{bitmap.close()}
    if(sheet){ctx.font='600 '+Math.max(13,Math.round(edge/85))+'px system-ui';ctx.fillStyle=bg.s.value==='light'?'#243142':'#f5f7fa';ctx.strokeStyle=bg.s.value==='light'?'#fff':'#18202b';ctx.lineWidth=3;ctx.strokeText(labels[view],x+12,y+24);ctx.fillText(labels[view],x+12,y+24)}
   }
   if(caption.checked){const font=Math.max(15,Math.round(edge/65)),bar=font*2.7;ctx.fillStyle='rgba(20,26,34,.83)';ctx.fillRect(0,h-bar,w,bar);ctx.fillStyle='#fff';ctx.font='600 '+font+'px system-ui';ctx.fillText(String(source.name??'BrickLab').slice(0,100),font,h-bar+font*1.15,w-2*font);ctx.font=Math.round(font*.7)+'px system-ui';ctx.fillText('BRICKLAB · '+source.parts.length+' '+tr('деталей в проекте','parts in project'),font,h-font*.35,w-2*font)}
   blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'))
  }finally{renderer.dispose()}
  if(!blob||signal.aborted||!root.isConnected)return
  url=URL.createObjectURL(blob)
  const img=el('img','workshop-photo-preview');img.src=url;img.alt=doc.name
  const download=el('a','workspace-action',tr('Скачать PNG','Download PNG'));download.href=url;download.download='bricklab-photo.png';output.append(img,download)
 }))
 async function appendMechanics(doc){
  const {prepareMechanismInspection,inspectDrive}=await import('./mechanism-inspector.js')
  if(signal.aborted||!root.isConnected)return
  const state=prepareMechanismInspection(doc),panel=el('section','workshop-mechanism-report'),table=el('div','workshop-metric-grid')
  panel.append(el('h3',null,tr('Кинематика и соединения','Kinematics and connections')))
  const metrics=[[tr('Принято соединений','Accepted connectors'),state.accepted],[tr('Отклонено соединений','Rejected connectors'),state.links.length],[tr('Детали без корректной позы','Invalid/missing poses'),state.excluded.length],[tr('Шестерни','Supported gears'),state.gears.length],[tr('Зацепления шестерён','Spur meshes'),state.meshScan?state.meshes.length:'—'],[tr('Корректные ремни','Valid belts'),state.validBelts],[tr('Некорректные ремни','Invalid belts'),state.belts.length]]
  for(const [label,value] of metrics){const m=el('div','workshop-metric');m.append(el('span',null,label),el('strong',null,value));table.append(m)}
  panel.append(table)
  const reasons={ 'invalid-endpoint':['Не найден порт или деталь','Missing port or part'],'missing-placement':['Нет сохранённой посадки','Missing saved placement'],'non-coaxial-ports':['Оси портов не совпадают','Ports are not coaxial'],'placement-pose-mismatch':['Посадка не соответствует положению','Placement differs from pose'],'invalid-rotation':['Недопустимый угол','Invalid rotation'],'closed-entry':['Закрытый вход','Closed entry'],groove:['Не найден шкив или паз','Missing groove'],axes:['Оси шкивов не параллельны','Pulley axes are not parallel'],plane:['Шкивы не в одной плоскости','Pulley plane mismatch'],clearance:['Недостаточный зазор','Insufficient clearance'],'occupied-groove':['Паз уже занят','Groove already occupied'],'multiple-joint-axes':['Несовместимые оси шарниров','Incompatible joint axes'],'inconsistent-transmission':['Противоречивые передаточные отношения','Inconsistent transmission'],'constrained-joint':['Вращение заблокировано соединением','Motion constrained by joint'],'off-axis-gear':['Несовпадение оси шестерни','Off-axis gear'],'off-axis-belt':['Несовпадение оси ремня','Off-axis belt'],'off-axis-cardan':['Несовпадение оси кардана','Off-axis cardan']}
  const reason=key=>reasons[key]?.[ru?0:1]??key
  const byId=new Map(state.parts.map(p=>[p.id,p])),name=id=>id?((byId.get(id)?.design??'?')+' · '+id):'—'
  const issues=[...state.links,...state.belts]
  if(issues.length){
   const details=el('details');details.append(el('summary',null,tr('Проблемные соединения','Connection issues')+' · '+issues.length))
   for(const i of issues.slice(0,100))details.append(el('p','account-muted',name(i.a.part)+' / '+(i.a.port??'—')+' → '+name(i.b.part)+' / '+(i.b.port??'—')+' : '+reason(i.reason)))
   if(issues.length>100)details.append(el('p','account-muted',tr('Показаны первые 100 записей.','Showing first 100 records.')))
   panel.append(details)
  }
  if(state.meshes.length){const d=el('details');d.append(el('summary',null,tr('Обнаруженные зацепления','Detected gear meshes')+' · '+state.meshes.length));for(const m of state.meshes.slice(0,100))d.append(el('p',null,name(m.a)+' → '+name(m.b)+' · '+m.ratio.toFixed(3)));panel.append(d)}
  const drive=el('select'),report=el('div','workshop-drive-report')
  drive.setAttribute('aria-label',tr('Ведущая деталь','Driver part'))
  addOption(drive,tr('Выбери ведущую деталь','Choose a driver'),'')
  for(const p of state.drivers.slice(0,5000))addOption(drive,name(p.id),p.id)
  const runDrive=button(tr('Проверить движение','Check motion'),()=>{
   report.replaceChildren()
   const result=inspectDrive(state,drive.value)
   if(result.status==='blocked'){report.append(el('strong',null,tr('Движение ограничено','Motion constrained')),el('p',null,reason(result.reason)));return}
   if(!['solved','partial'].includes(result.status)){report.append(el('p','account-muted',result.status==='limit'?tr('Модель слишком велика для интерактивной проверки.','Model exceeds interactive solver limit.'):tr('Движение не рассчитано: нет поддерживаемого привода или ошибка решателя.','Motion not resolved: unsupported driver or solver error.')));return}
   report.append(el('strong',null,result.status==='solved'?tr('Контрольные положения рассчитаны','Sample poses solved'):tr('Не все положения рассчитаны','Some sample poses failed')),el('p',null,tr('Затронуто деталей: ','Affected parts: ')+result.affected+' · '+tr('Положений: ','Samples: ')+result.samples.filter(s=>s.valid).length+'/'+result.samples.length))
   for(const sample of result.samples)report.append(el('p','account-muted',sample.value.toFixed(1)+(result.linear?' LDU':'°')+' · '+(sample.valid?tr('Рассчитано','Solved'):tr('Не рассчитано','Failed'))))
   const ratios=el('details');ratios.append(el('summary',null,tr('Передаточные отношения','Transmission ratios')+' · '+result.spins.length))
   for(const p of result.spins.slice(0,100))ratios.append(el('p','account-muted',name(p.id)+' · '+(p.nonlinear?tr('Нелинейная передача','Nonlinear drive'):p.ratio?.toFixed(4)??'—')))
   if(result.spins.length)report.append(ratios)
  })
  runDrive.disabled=true;drive.onchange=()=>{report.replaceChildren();runDrive.disabled=!drive.value}
  panel.append(drive,runDrive,report,el('p','account-muted',tr('Проверяются контрольные положения реальным решателем редактора. Коллизии, прочность, нагрузка и полный диапазон движения не проверяются.','The editor solver checks sampled poses. Collisions, strength, loads and the full motion range are not verified.')))
  output.append(panel)
 }
 const diagnose=button(tr('Проверить модель','Inspect model'),()=>run(async doc=>{
  const p=inspectModel(doc),metrics=el('div','workshop-metric-grid')
  for(const [label,value] of [[tr('Детали','Parts'),p.parts],[tr('Соединения','Connections'),p.connections],[tr('Группы связности','Connected groups'),p.components],[tr('Отдельные детали','Isolated parts'),p.isolated],[tr('Ошибочные ссылки','Broken references'),p.broken],[tr('Некорректные записи','Malformed records'),p.malformed],[tr('Повторяющиеся ID','Duplicate IDs'),p.duplicates],[tr('Зубчатые передачи','Gear records'),p.gears],[tr('Ремни','Belt records'),p.belts]]){
   const cell=el('div','workshop-metric');cell.append(el('span',null,label),el('strong',null,value));metrics.append(cell)
  }
  output.append(el('h3',null,p.structure?tr('Структурные ошибки не обнаружены','No structural errors detected'):tr('Найдены структурные ошибки','Structural errors found')),metrics,el('p','account-muted',tr('Отдельные группы могут быть задуманы автором. Это проверка записанных соединений, не симуляция вращения, коллизий или прочности.','Separate groups may be intentional. This checks saved connections, not motion, collisions or strength.')))
  await appendMechanics(doc)
 }))
 photo.disabled=diagnose.disabled=true
 select.onchange=()=>{clear();status.textContent='';photo.disabled=diagnose.disabled=!select.value}
 controls.append(select,layout.wrap,angle.wrap,light.wrap,bg.wrap,size.wrap,aspect.wrap,framing.wrap,shadowLabel,captionLabel,photo,diagnose)
 root.append(controls,status,output);return root
}
