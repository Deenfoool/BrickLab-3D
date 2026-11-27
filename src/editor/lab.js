
import {mountEditor} from './editor.js';
import {newProject,parseProject,downloadProject} from '../projects/documents.js';
import {planWorldFill,worldCoverage} from './world-plan.js';
const $=id=>document.getElementById(id);
const keys={model:'bricklab.lab.model.v1',world:'bricklab.lab.world.v1'};
let mode='model',controller,active=null,failed=false,busy=false,worldAction,skyAction,availableParts=[];
const skyKeys={model:'bricklab.lab.sky.model',world:'bricklab.lab.sky.world'};
function skyChoice(kind){try{const value=localStorage.getItem(skyKeys[kind]);if(['studio','day','sunset','night'].includes(value))return value}catch{}return kind==='world'?'day':'studio'}
async function changeSky(){const action=skyAction,kind=mode,value=$('lab-sky').value;if(!action)return;const ok=await action(value);if(action!==skyAction||kind!==mode||value!==$('lab-sky').value)return;if(ok){try{localStorage.setItem(skyKeys[kind],value)}catch{}}else{$('lab-sky').value=skyChoice(kind);$('lab-status').textContent='Не удалось загрузить панораму · прежний фон сохранён'}}
const fresh=kind=>({...newProject(kind==='world'?'Новый мир':'Новая модель'),...(kind==='world'?{world:{version:1,static:true}}:{})});
function read(kind){const raw=localStorage.getItem(keys[kind]);return raw?parseProject(raw):fresh(kind)}
function save(kind,doc){try{localStorage.setItem(keys[kind],JSON.stringify(doc));failed=false;$('lab-status').textContent='Локально сохранено';return true}catch{failed=true;$('lab-status').textContent='Ошибка сохранения · скачай файл';return false}}
const isRoad=()=>['road','roadCorner','roadCurve','roadCross','roadT'].includes($('world-tool').value);
const isTerrain=()=>$('world-tool').value.startsWith('terrain');
function roadUI(){const road=isRoad(),terrain=isTerrain(),tool=$('world-tool').value;$('world-panel').classList.toggle('terrain-mode',terrain);$('world-terrain-settings').hidden=!terrain;$('terrain-step-label').hidden=tool!=='terrainSteps';$('terrain-seed-label').hidden=tool!=='terrainRough';$('road-radius-label').hidden=tool!=='roadCurve';$('world-panel').classList.toggle('road-mode',road);$('world-road-settings').hidden=!road;$('road-turn-label').hidden=!['roadCorner','roadCurve'].includes(tool);$('road-hint').textContent=tool==='roadCross'||tool==='roadT'?'Начни от центра перекрёстка и протяни по диагонали.':['roadCorner','roadCurve'].includes(tool)?'Протяни от начала до конца поворота.':'Протяни вдоль оси дороги.';$('world-add').disabled=busy||!worldAction||road||terrain}
function inputs(){return {radius:Number($('road-radius').value),terrainHeight:$('terrain-height').valueAsNumber,terrainStep:$('terrain-step').valueAsNumber,terrainSeed:$('terrain-seed').valueAsNumber,roadWidth:Number($('road-width').value),sidewalk:Number($('road-sidewalk').value),marking:$('road-marking').value,foundation:$('road-foundation').checked,roadColor:$('road-color').value,sidewalkColor:$('road-walk-color').value,turnFirst:$('road-turn').value,smart:$('world-smart').checked,bond:$('world-bond').checked,available:availableParts,kind:$('world-kind').value,x:$('world-x').valueAsNumber,z:$('world-z').valueAsNumber,width:$('world-w').valueAsNumber,depth:$('world-d').valueAsNumber,level:$('world-y').valueAsNumber,rows:$('world-rows').valueAsNumber,color:$('world-color').value}}
function setBusy(value){busy=value;for(const id of ['lab-model','lab-world','lab-new','lab-import','lab-export','lab-sky','world-tool','world-kind','world-x','world-z','world-w','world-d','world-y','world-rows','world-color','world-smart','world-bond','road-width','road-sidewalk','road-marking','road-turn','road-foundation','road-color','road-walk-color','road-radius','terrain-height','terrain-step','terrain-seed'])$(id).disabled=value;$('world-add').disabled=value||!worldAction||isRoad()||isTerrain()}
async function open(kind,doc){
 if(busy)return;if(failed&&!confirm('Локальное сохранение не удалось. Перейти без сохранения?'))return;
 let next;try{next=doc??read(kind)}catch{$('lab-status').textContent='Не удалось прочитать локальный проект. Открой резервный файл.';return}
 controller?.abort();controller=new AbortController();const signal=controller.signal;
 mode=kind;active=next;failed=false;worldAction=null;skyAction=null;$('lab-sky').value=skyChoice(kind);$('lab-editor').dataset.labMode=kind;
 $('lab-model').setAttribute('aria-pressed',String(kind==='model'));$('lab-world').setAttribute('aria-pressed',String(kind==='world'));$('world-panel').hidden=kind!=='world';$('world-tool').value='select';roadUI();$('world-status').textContent='';
 setBusy(true);$('lab-status').textContent='Загрузка редактора…';$('lab-editor').replaceChildren();
 try{
 await mountEditor($('lab-editor'),{document:next,projectId:'lab-'+kind,language:'ru',signal,labMode:kind,save(value){if(signal.aborted)return false;active=value;return save(kind,value)},download:downloadProject,
 projectActions:{newBuild:()=>void reset(),copy:doc=>downloadProject({...doc,name:(doc.name+' (копия)').slice(0,120)}),home:()=>{}},
 onWorldBuild:(fn,ids)=>{worldAction=fn;availableParts=ids},onEnvironment:fn=>{skyAction=fn},worldControls:{tool:$('world-tool'),read:()=>({...inputs(),tool:$('world-tool').value}),status:s=>{$('world-status').textContent=s},busy:setBusy}});
 if(!signal.aborted){$('lab-status').textContent='Локальный редактор · '+(kind==='world'?'World':'механика');if(doc)save(kind,active);await changeSky()}
 }catch(e){controller.abort();active=null;worldAction=null;setBusy(false);console.error(e);$('lab-status').textContent='Не удалось открыть редактор. Проверь WebGL и файлы деталей.'}
 finally{if(!signal.aborted)setBusy(false)}
}
async function reset(){if(!busy&&confirm('Заменить текущий локальный проект? Скачай его заранее, если он нужен.'))await open(mode,fresh(mode))}
$('lab-model').onclick=()=>{if(mode!=='model'||!active)void open('model')};$('lab-world').onclick=()=>{if(mode!=='world'||!active)void open('world')};
$('lab-sky').onchange=()=>void changeSky();
$('lab-new').onclick=()=>void reset();$('lab-export').onclick=()=>{if(active)downloadProject(active)};$('lab-import').onclick=()=>$('lab-file').click();
$('lab-file').onchange=async()=>{const file=$('lab-file').files[0];$('lab-file').value='';if(!file||busy)return;try{if(file.size>20*1024*1024)throw Error('size');const doc=parseProject(await file.text()),kind=doc.world?.version===1?'world':mode;if(!confirm('Открыть файл вместо текущего локального проекта?'))return;await open(kind,kind==='world'?{...doc,world:{version:1,static:true}}:doc)}catch{$('lab-status').textContent='Файл не является подходящим проектом BrickLab.'}};
$('world-tool').addEventListener('change',roadUI);
$('world-kind').onchange=()=>{if($('world-kind').value==='tile')$('world-rows').value=1};
$('world-add').onclick=async()=>{if(busy||!worldAction||isRoad()||isTerrain())return;setBusy(true);try{const cells=planWorldFill(inputs(),active.parts.length);await worldAction(cells);$('world-status').textContent='Добавлено: '+cells.length+' дет. · '+worldCoverage(cells)+' stud-слоёв'}catch(e){$('world-status').textContent=e.message||'Не удалось построить.'}finally{setBusy(false)}};
window.addEventListener('beforeunload',event=>{if(failed){event.preventDefault();event.returnValue=''}});
void open('model');
