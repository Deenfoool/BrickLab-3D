import {planPortfolioGrid,placePortfolioBlock,portfolioSpans,portfolioSpan,nearestPortfolioSpan,movePortfolioBlock,applyPortfolioPreset,portfolioPresetIds} from './portfolio-layout-model.js'
import {sortableHandle} from './sortable-handle.js'
const words={
 ru:{title:'Конструктор мастерской',help:'Перетаскивай блоки по сетке из 12 колонок. Потяни правый край или выбери ширину. Скрытые блоки можно вернуть из каталога. На телефоне блоки располагаются в одну колонку.',presets:'Шаблоны',classic:'Классический',minimal:'Минимализм',portfolio:'Портфолио',engineering:'Инженерный',desktop:'Компьютер',mobile:'Телефон',preview:'Предпросмотр',edit:'Редактор',add:'Добавить блок',hidden:'Скрытые блоки',all:'Все блоки добавлены',hide:'Скрыть',width:'Ширина',break:'Начать новую строку',move:'Перетащить: ',resize:'Изменить ширину: ',empty:'Добавь блок из каталога ниже.',reset:'Отменить изменения компоновки',changed:'Есть несохранённые изменения. Нажми «Сохранить компоновку».',saved:'Компоновка без изменений.',previewNote:'Предпросмотр публичных блоков: используются доступные данные профиля, а закрытые данные и пустые работы не показываются. Шапка и показатели остаются сверху.',fixed:'Шапка и показатели · фиксированная область',resetConfirm:'Вернуть последнее сохранённое расположение?',presetConfirm:'Применить шаблон? Шаблон может показать ранее скрытые блоки после сохранения. Проверь предпросмотр. Публикации и коллекции не удаляются.'},
 en:{title:'Workshop layout studio',help:'Drag blocks across a 12-column grid. Pull the right edge or choose a width. Restore hidden blocks from the catalog. On a phone the layout uses one column.',presets:'Templates',classic:'Classic',minimal:'Minimal',portfolio:'Portfolio',engineering:'Engineering',desktop:'Desktop',mobile:'Phone',preview:'Preview',edit:'Editor',add:'Add block',hidden:'Hidden blocks',all:'All blocks added',hide:'Hide',width:'Width',break:'Start a new row',move:'Move: ',resize:'Resize: ',empty:'Add a block from the catalog below.',reset:'Discard layout changes',changed:'Unsaved changes. Select Save layout.',saved:'Layout unchanged.',previewNote:'Public-block preview using available profile data. Private data and empty work previews are omitted. The header and metrics stay at the top.',fixed:'Header and metrics · fixed area',resetConfirm:'Restore the last saved arrangement?',presetConfirm:'Apply template? The template may reveal previously hidden blocks when saved. Review the preview. Publications and collections will not be deleted.'}
}
const el=(tag,cls,value)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(value!==undefined)n.textContent=String(value);return n}
function button(label,fn,disabled=false,cls='workspace-action'){const n=el('button',cls,label);n.type='button';n.onclick=fn;n.disabled=disabled;return n}
const snapshot=blocks=>blocks.map(b=>({...b}))
// Drag from the right edge. Preview the nearest allowed size, commit on pointer release.
export function layoutResizeHandle({key,span,grid,row,label,disabled=false,resize,previewResize=()=>{}}){
 const grip=button('↔',()=>{},disabled,'workshop-resize-handle');grip.setAttribute('aria-label',label);grip.title=label
 let pointer=null,startX=0,cell=0,current=span
 const hint=el('output','studio-resize-hint');hint.hidden=true
 function finish(commit){const next=current;pointer=null;hint.hidden=true;row.classList?.remove?.('studio-resizing');if(commit&&next!==span)resize(key,next);else previewResize(key,span)}
 grip.onpointerdown=e=>{if(disabled||e.button!==0||pointer!==null)return;const width=grid.getBoundingClientRect().width;if(width<=0)return;e.preventDefault();pointer=e.pointerId;startX=e.clientX;cell=width/12;current=span;hint.textContent=span+'/12';hint.hidden=false;row.classList?.add?.('studio-resizing');grip.setPointerCapture?.(pointer)}
 grip.onpointermove=e=>{if(e.pointerId!==pointer)return;e.preventDefault();current=nearestPortfolioSpan(span+(e.clientX-startX)/cell);hint.textContent=current+'/12';previewResize(key,current)}
 grip.onpointerup=e=>{if(e.pointerId===pointer)finish(true)};grip.onpointercancel=e=>{if(e.pointerId===pointer)finish(false)};grip.onlostpointercapture=()=>{if(pointer!==null)finish(false)}
 grip.onkeydown=e=>{if(disabled||!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();const next=portfolioSpans[portfolioSpans.indexOf(span)+(e.key==='ArrowRight'?1:-1)];if(next)resize(key,next)}
 return {grip,hint}
}
export function renderWorkshopLayoutEditor({lang='ru',blocks,originalBlocks=blocks,labels,busy=false,onChange,renderPreview,describe=()=>''}){
 const l=lang==='ru'?'ru':'en',t=words[l],root=el('section','workshop-layout-studio'),toolbar=el('div','studio-toolbar'),canvas=el('div','studio-canvas'),catalog=el('div','studio-catalog'),notice=el('p','account-muted studio-status'),preview=el('div','studio-preview'),grid=el('div','studio-grid')
 const original=snapshot(originalBlocks);let draft=snapshot(blocks),mode='edit',mobile=false
 const set=next=>{draft=snapshot(next);onChange(snapshot(draft));render()}
 const change=(key,patch)=>set(draft.map(b=>{if(b.key!==key)return b;const next={...b,...patch};if(next.newRow===false)delete next.newRow;return next}))
 const resize=(key,span)=>change(key,{span})
 const presets=el('select','studio-select'),placeholder=el('option',null,t.presets);placeholder.value='';presets.append(placeholder)
 for(const id of portfolioPresetIds){const option=el('option',null,t[id]);option.value=id;presets.append(option)}
 presets.setAttribute('aria-label',t.presets);presets.disabled=busy
 presets.onchange=()=>{const id=presets.value;presets.value='';if(id&&globalThis.confirm(t.presetConfirm))set(applyPortfolioPreset(draft,id))}
 const edit=button(t.edit,()=>{mode='edit';mobile=false;render()},busy),see=button(t.preview,()=>{mode='preview';render()}),desktop=button(t.desktop,()=>{mobile=false;render()}),phone=button(t.mobile,()=>{mobile=true;mode='preview';render()})
 const reset=button(t.reset,()=>{if(globalThis.confirm(t.resetConfirm))set(original)},busy)
 toolbar.append(presets,edit,see,desktop,phone,reset)
 notice.setAttribute('role','status')
 canvas.append(el('div','studio-fixed',t.fixed),grid);root.append(el('h3',null,t.title),el('p','account-muted',t.help),toolbar,notice,canvas,catalog,preview)
 function render(){
  const changed=JSON.stringify(draft)!==JSON.stringify(original);notice.textContent=changed?t.changed:t.saved;reset.disabled=busy||!changed
  edit.setAttribute('aria-pressed',String(mode==='edit'));see.setAttribute('aria-pressed',String(mode==='preview'));desktop.setAttribute('aria-pressed',String(!mobile));phone.setAttribute('aria-pressed',String(mobile))
  desktop.disabled=mode==='edit';phone.disabled=false
  canvas.hidden=mode!=='edit';catalog.hidden=mode!=='edit';preview.hidden=mode!=='preview';preview.className='studio-preview'+(mobile?' is-mobile':'')
  grid.replaceChildren();catalog.replaceChildren();preview.replaceChildren()
  if(mode==='preview'){preview.append(el('p','account-muted',t.previewNote));const viewport=el('div','studio-preview-viewport');const visual=renderPreview?.(snapshot(draft));if(visual){visual.inert=true;viewport.append(visual)}preview.append(viewport);return}
  const visible=draft.filter(b=>b.visible),positions=planPortfolioGrid(visible)
  if(!visible.length)grid.append(el('p','studio-empty',t.empty))
  visible.forEach((item,i)=>{
   const row=el('article','studio-widget'),head=el('div','studio-widget-head'),body=el('div','studio-widget-body'),controls=el('div','studio-widget-controls'),title=el('strong',null,labels[item.key]),span=portfolioSpan(item)
   placePortfolioBlock(row,positions[i]);row.setAttribute('data-widget',item.key)
   const grip=sortableHandle({row,list:grid,index:i,label:t.move+labels[item.key],disabled:busy,move:(from,to)=>{if(visible[from]&&visible[to])set(movePortfolioBlock(draft,visible[from].key,visible[to].key))}})
   head.append(grip,title)
   const select=el('select','studio-select');select.setAttribute('aria-label',t.width+' · '+labels[item.key]);select.disabled=busy
   for(const width of portfolioSpans){const option=el('option',null,width+'/12');option.value=String(width);select.append(option)}select.value=String(span);select.onchange=()=>{const width=Number(select.value);if(portfolioSpans.includes(width))resize(item.key,width)}
   const newRow=button(t.break,()=>change(item.key,{newRow:!item.newRow}),busy,'workspace-action studio-row-break');newRow.setAttribute('aria-pressed',String(!!item.newRow));newRow.setAttribute('aria-label',t.break+' · '+labels[item.key])
   const hide=button(t.hide,()=>change(item.key,{visible:false}),busy);hide.setAttribute('aria-label',t.hide+' · '+labels[item.key])
   controls.append(select,newRow,hide);body.append(el('p','studio-widget-summary',describe(item.key)||labels[item.key]))
   const {grip:edge,hint}=layoutResizeHandle({key:item.key,span,grid,row,label:t.resize+labels[item.key],disabled:busy,resize,previewResize:(key,width)=>{const planned=planPortfolioGrid(visible.map(b=>b.key===key?{...b,span:width}:b));planned.forEach((position,j)=>{if(grid.children[j])placePortfolioBlock(grid.children[j],position)})}})
   row.append(head,body,controls,edge,hint);grid.append(row)
  })
  const hidden=draft.filter(b=>!b.visible);catalog.append(el('h4',null,t.hidden));const choices=el('div','studio-catalog-items')
  for(const item of hidden){const add=button('+ '+labels[item.key],()=>change(item.key,{visible:true}),busy);add.setAttribute('aria-label',t.add+' · '+labels[item.key]);choices.append(add)}
  catalog.append(hidden.length?choices:el('p','account-muted',t.all))
 }
 render();return root
}
