
import {createProvingGround,provingZones} from './proving-ground.js';
import {obstacleKinds} from './world-obstacles.js';
import {mountModulePanel} from './world-module-panel.js';
import {mountEditor} from './editor.js';
import {newProject,parseProject,downloadProject} from '../projects/documents.js';
import {planWorldFill,worldCoverage} from './world-plan.js';
const $=id=>document.getElementById(id);
const keys={model:'bricklab.lab.model.v1',world:'bricklab.lab.world.v1',proving:'bricklab.lab.proving.v1'};
let mode='model',slot='model',controller,active=null,failed=false,busy=false,worldAction,skyAction,moduleApi,physicsApi,availableParts=[];
const skyKeys={model:'bricklab.lab.sky.model',world:'bricklab.lab.sky.world'};
function skyChoice(kind){try{const value=localStorage.getItem(skyKeys[kind]);if(['studio','day','sunset','night'].includes(value))return value}catch{}return kind==='world'?'day':'studio'}
async function changeSky(){const action=skyAction,kind=mode,value=$('lab-sky').value;if(!action)return;const ok=await action(value);if(action!==skyAction||kind!==mode||value!==$('lab-sky').value)return;if(ok){try{localStorage.setItem(skyKeys[kind],value)}catch{}}else{$('lab-sky').value=skyChoice(kind);$('lab-status').textContent='Не удалось загрузить панораму · прежний фон сохранён'}}
const fresh=kind=>({...newProject(kind==='world'?'Новый мир':'Новая модель'),...(kind==='world'?{world:{version:1,static:true}}:{})});
function read(kind){const raw=localStorage.getItem(keys[kind]);return raw?parseProject(raw):fresh(kind)}
function save(kind,doc){try{localStorage.setItem(keys[kind],JSON.stringify(doc));failed=false;$('lab-status').textContent='Локально сохранено';return true}catch{failed=true;$('lab-status').textContent='Ошибка сохранения · скачай файл';return false}}
const isRoad=()=>['road','roadCorner','roadCurve','roadCross','roadT'].includes($('world-tool').value);
const isTerrain=()=>$('world-tool').value.startsWith('terrain');
function roadUI(){const road=isRoad(),terrain=isTerrain(),tool=$('world-tool').value;$('world-panel').classList.toggle('terrain-mode',terrain);$('world-terrain-settings').hidden=!terrain;$('terrain-step-label').hidden=tool!=='terrainSteps';$('terrain-seed-label').hidden=tool!=='terrainRough';$('road-radius-label').hidden=tool!=='roadCurve';$('world-panel').classList.toggle('road-mode',road);$('world-road-settings').hidden=!road;$('road-turn-label').hidden=!['roadCorner','roadCurve'].includes(tool);$('road-hint').textContent=tool==='roadCross'||tool==='roadT'?'Начни от центра перекрёстка и протяни по диагонали.':['roadCorner','roadCurve'].includes(tool)?'Протяни от начала до конца поворота.':'Протяни вдоль оси дороги.';$('world-add').disabled=busy||!worldAction||road||terrain}
function inputs(){return {autoJoin:$('road-join').checked,radius:Number($('road-radius').value),terrainHeight:$('terrain-height').valueAsNumber,terrainStep:$('terrain-step').valueAsNumber,terrainSeed:$('terrain-seed').valueAsNumber,roadWidth:Number($('road-width').value),sidewalk:Number($('road-sidewalk').value),marking:$('road-marking').value,foundation:$('road-foundation').checked,roadColor:$('road-color').value,sidewalkColor:$('road-walk-color').value,turnFirst:$('road-turn').value,smart:$('world-smart').checked,bond:$('world-bond').checked,available:availableParts,kind:$('world-kind').value,x:$('world-x').valueAsNumber,z:$('world-z').valueAsNumber,width:$('world-w').valueAsNumber,depth:$('world-d').valueAsNumber,level:$('world-y').valueAsNumber,rows:$('world-rows').valueAsNumber,color:$('world-color').value}}
function setBusy(value){busy=value;for(const id of ['lab-model','lab-world','lab-proving','lab-new','lab-import','lab-export','lab-sky','world-tool','world-kind','world-x','world-z','world-w','world-d','world-y','world-rows','world-color','world-smart','world-bond','road-width','road-sidewalk','road-marking','road-turn','road-foundation','road-join','road-color','road-walk-color','road-radius','terrain-height','terrain-step','terrain-seed'])$(id).disabled=value;$('world-add').disabled=value||!worldAction||isRoad()||isTerrain();$('world-modules').disabled=value||!moduleApi;$('world-physics').disabled=value||!physicsApi}
async function open(kind,doc,nextSlot=kind){
 if(busy)return;if(failed&&!confirm('Локальное сохранение не удалось. Перейти без сохранения?'))return;
 let next;try{next=doc??read(nextSlot)}catch{$('lab-status').textContent='Не удалось прочитать локальный проект. Открой резервный файл.';return}
 controller?.abort();controller=new AbortController();const signal=controller.signal;
 mode=kind;slot=nextSlot;active=next;failed=false;worldAction=null;skyAction=null;moduleApi=null;physicsApi=null;$('lab-sky').value=skyChoice(kind);$('lab-editor').dataset.labMode=kind;
 $('lab-model').setAttribute('aria-pressed',String(kind==='model'));$('lab-world').setAttribute('aria-pressed',String(kind==='world'&&slot==='world'));$('lab-proving').setAttribute('aria-pressed',String(slot==='proving'));$('world-guide').hidden=slot!=='proving';$('world-panel').hidden=kind!=='world';$('world-tool').value='select';roadUI();$('world-status').textContent='';
 setBusy(true);$('lab-status').textContent='Загрузка редактора…';$('lab-editor').replaceChildren();
 try{
 await mountEditor($('lab-editor'),{document:next,projectId:'lab-'+nextSlot,language:'ru',signal,labMode:kind,save(value){if(signal.aborted)return false;active=value;return save(nextSlot,value)},download:downloadProject,
 projectActions:{newBuild:()=>void reset(),copy:doc=>downloadProject({...doc,name:(doc.name+' (копия)').slice(0,120)}),home:()=>{}},
 readWorld:venue=>{const raw=localStorage.getItem(keys[venue==='proving'?'proving':'world']);return raw?parseProject(raw):null},onWorldPhysics:api=>{physicsApi=api},onWorldBuild:(fn,ids)=>{worldAction=fn;availableParts=ids},onEnvironment:fn=>{skyAction=fn},onModules:api=>{moduleApi=api;mountModulePanel({dialog:$('module-dialog'),button:$('world-modules'),signal,api,status:s=>{$('world-status').textContent=s},busy:setBusy})},worldControls:{tool:$('world-tool'),read:()=>({...inputs(),tool:$('world-tool').value}),status:s=>{$('world-status').textContent=s},busy:setBusy}});
 if(!signal.aborted){$('lab-status').textContent='Локальный редактор · '+(kind==='world'?'World':'механика');if(doc)save(nextSlot,active);await changeSky()}
 }catch(e){controller.abort();active=null;worldAction=null;setBusy(false);console.error(e);$('lab-status').textContent='Не удалось открыть редактор. Проверь WebGL и файлы деталей.'}
 finally{if(!signal.aborted)setBusy(false)}
}
async function reset(){if(!busy&&confirm('Заменить текущий локальный проект? Скачай его заранее, если он нужен.')){if(slot==='proving')await openProving(true);else await open(mode,fresh(mode))}}
$('lab-model').onclick=()=>{if(mode!=='model'||!active)void open('model')};$('lab-world').onclick=()=>{if(slot!=='world'||!active)void open('world')};
$('lab-proving').onclick=()=>{if(slot!=='proving'||!active)void openProving()};
async function openProving(regenerate=false){
 if(busy)return;
 let raw;
 try{raw=regenerate?null:localStorage.getItem(keys.proving);if(raw){await open('world',parseProject(raw),'proving');return}}
 catch(e){$('lab-status').textContent='Не удалось прочитать полигон: '+e.message;return}
 setBusy(true);$('lab-status').textContent='Сборка полигона из деталей…';
 let doc;
 try{doc=await createProvingGround(new AbortController().signal)}
 catch(e){$('lab-status').textContent='Полигон: '+e.message;console.error(e)}
 finally{setBusy(false)}
 if(doc)await open('world',doc,'proving')
}
$('world-guide').onclick=()=>{
 const root=$('proving-zones');root.replaceChildren();
 for(const zone of provingZones){const item=document.createElement('article');item.className='world-module-card';const h=document.createElement('strong');h.textContent=zone.name;const p=document.createElement('small');p.textContent=zone.description;item.append(h,p);root.append(item)}
 $('proving-dialog').showModal()
};
$('proving-close').onclick=()=>$('proving-dialog').close();
$('lab-sky').onchange=()=>void changeSky();
$('lab-new').onclick=()=>void reset();$('lab-export').onclick=()=>{if(active)downloadProject(active)};$('lab-import').onclick=()=>$('lab-file').click();
$('lab-file').onchange=async()=>{const file=$('lab-file').files[0];$('lab-file').value='';if(!file||busy)return;try{if(file.size>20*1024*1024)throw Error('size');const doc=parseProject(await file.text()),kind=doc.world?.version===1?'world':mode;if(!confirm('Открыть файл вместо текущего локального проекта?'))return;await open(kind,kind==='world'?{...doc,world:{...doc.world,version:1,static:true}}:doc)}catch{$('lab-status').textContent='Файл не является подходящим проектом BrickLab.'}};
$('world-physics').onclick=()=>{
 if(!physicsApi)return;
 const s=physicsApi.config().spawn;
 $('spawn-x').value=s.x;$('spawn-z').value=s.z;$('spawn-heading').value=s.heading;$('spawn-auto').checked=s.level===null;$('spawn-level').value=s.level??0;$('spawn-level').disabled=s.level===null;
 renderObstacles();$('physics-notice').textContent='';$('physics-dialog').showModal()
};
function renderObstacles(id=''){
 const list=$('obstacle-list');list.replaceChildren(new Option('Новое из выделения',''));
 for(const o of physicsApi.obstacles())list.add(new Option(o.name+' · '+o.partIds.length+' дет.',o.id));
 list.value=id;obstacleFields();
}
function obstacleFields(){
 const item=physicsApi.obstacles().find(o=>o.id===$('obstacle-list').value);
 const defaults={kind:'bridge',name:'',axis:'x',pivot:'center',angle:20,speed:.5,travel:4,mass:3};
 for(const [k,v] of Object.entries(item??defaults)){const e=$('obstacle-'+k);if(e)e.value=v}
 $('obstacle-remove').disabled=!item;obstacleHint();
}
function obstacleHint(){
 const k=$('obstacle-kind').value;
 const hints={bridge:'Свободный шарнир с ограничением угла; нагрузка колёс раскачивает мост.',balance:'Поворот вокруг центральной оси с возвратной пружиной.',roller:'Приводной ролик, скорость в оборотах/с. Выдели цилиндрическую конструкцию.',platform:'Вертикальное перемещение, ход в пластинах, скорость в циклах/с.',ramp:'Установка наклона вокруг выбранного шарнира до начала заезда.'};
 $('obstacle-hint').textContent=hints[k];
 const relevant={axis:k!=='platform',pivot:['bridge','ramp'].includes(k),angle:['bridge','balance','ramp'].includes(k),speed:k!=='ramp',travel:k==='platform',mass:['bridge','balance'].includes(k)};
 for(const [key,show] of Object.entries(relevant))$('obstacle-'+key).closest('label').hidden=!show;
}
$('obstacle-list').onchange=obstacleFields;
$('obstacle-kind').onchange=obstacleHint;
$('obstacle-save').onclick=()=>{try{
 const kind=$('obstacle-kind').value;
 const value=physicsApi.obstacle({id:$('obstacle-list').value,kind,name:$('obstacle-name').value.trim()||obstacleKinds[kind],axis:$('obstacle-axis').value,pivot:$('obstacle-pivot').value,angle:$('obstacle-angle').valueAsNumber,speed:$('obstacle-speed').valueAsNumber,travel:$('obstacle-travel').valueAsNumber,mass:$('obstacle-mass').valueAsNumber});
 renderObstacles(value.id);$('physics-notice').textContent='Препятствие сохранено.'
 }catch(e){$('physics-notice').textContent=e.message}};
$('obstacle-remove').onclick=()=>{try{physicsApi.removeObstacle($('obstacle-list').value);renderObstacles();$('physics-notice').textContent='Детали снова статические.'}catch(e){$('physics-notice').textContent=e.message}};
$('physics-close').onclick=()=>$('physics-dialog').close();
$('spawn-auto').onchange=()=>{$('spawn-level').disabled=$('spawn-auto').checked};
$('spawn-save').onclick=()=>{try{physicsApi.spawn({x:$('spawn-x').valueAsNumber,z:$('spawn-z').valueAsNumber,heading:$('spawn-heading').valueAsNumber,level:$('spawn-auto').checked?null:$('spawn-level').valueAsNumber});$('physics-notice').textContent='Точка старта сохранена.'}catch(e){$('physics-notice').textContent=e.message}};
$('physics-apply').onclick=()=>{try{$('physics-notice').textContent='Покрытие назначено: '+physicsApi.surface($('physics-surface').value)+' дет.'}catch(e){$('physics-notice').textContent=e.message}};
$('world-tool').addEventListener('change',roadUI);
$('world-kind').onchange=()=>{if($('world-kind').value==='tile')$('world-rows').value=1};
$('world-add').onclick=async()=>{if(busy||!worldAction||isRoad()||isTerrain())return;setBusy(true);try{const cells=planWorldFill(inputs(),active.parts.length);await worldAction(cells);$('world-status').textContent='Добавлено: '+cells.length+' дет. · '+worldCoverage(cells)+' stud-слоёв'}catch(e){$('world-status').textContent=e.message||'Не удалось построить.'}finally{setBusy(false)}};
window.addEventListener('beforeunload',event=>{if(failed){event.preventDefault();event.returnValue=''}});
void open('model');
