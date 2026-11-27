
import {mountEditor} from './editor.js';
import {newProject,parseProject,downloadProject} from '../projects/documents.js';
import {planWorldFill} from './world-plan.js';
const $=id=>document.getElementById(id);
const keys={model:'bricklab.lab.model.v1',world:'bricklab.lab.world.v1'};
let mode='model',controller,active=null,failed=false,busy=false,worldAction;
const fresh=kind=>({...newProject(kind==='world'?'Новый мир':'Новая модель'),...(kind==='world'?{world:{version:1,static:true}}:{})});
function read(kind){const raw=localStorage.getItem(keys[kind]);return raw?parseProject(raw):fresh(kind)}
function save(kind,doc){try{localStorage.setItem(keys[kind],JSON.stringify(doc));failed=false;$('lab-status').textContent='Локально сохранено';return true}catch{failed=true;$('lab-status').textContent='Ошибка сохранения · скачай файл';return false}}
function inputs(){return {kind:$('world-kind').value,x:$('world-x').valueAsNumber,z:$('world-z').valueAsNumber,width:$('world-w').valueAsNumber,depth:$('world-d').valueAsNumber,level:$('world-y').valueAsNumber,rows:$('world-rows').valueAsNumber,color:$('world-color').value}}
function setBusy(value){busy=value;for(const id of ['lab-model','lab-world','lab-new','lab-import','lab-export'])$(id).disabled=value;$('world-add').disabled=value||!worldAction}
async function open(kind,doc){
 if(busy)return;if(failed&&!confirm('Локальное сохранение не удалось. Перейти без сохранения?'))return;
 let next;try{next=doc??read(kind)}catch{$('lab-status').textContent='Не удалось прочитать локальный проект. Открой резервный файл.';return}
 controller?.abort();controller=new AbortController();const signal=controller.signal;
 mode=kind;active=next;failed=false;worldAction=null;
 $('lab-model').setAttribute('aria-pressed',String(kind==='model'));$('lab-world').setAttribute('aria-pressed',String(kind==='world'));$('world-panel').hidden=kind!=='world';$('world-status').textContent='';
 setBusy(true);$('lab-status').textContent='Загрузка редактора…';$('lab-editor').replaceChildren();
 try{
 await mountEditor($('lab-editor'),{document:next,projectId:'lab-'+kind,language:'ru',signal,labMode:kind,save(value){if(signal.aborted)return false;active=value;return save(kind,value)},download:downloadProject,
 projectActions:{newBuild:()=>void reset(),copy:doc=>downloadProject({...doc,name:(doc.name+' (копия)').slice(0,120)}),home:()=>{}},
 onWorldBuild:fn=>{worldAction=fn}});
 if(!signal.aborted){$('lab-status').textContent='Локальный редактор · '+(kind==='world'?'World':'механика');if(doc)save(kind,active)}
 }catch(e){console.error(e);$('lab-status').textContent='Не удалось открыть редактор. Проверь WebGL и файлы деталей.'}
 finally{if(!signal.aborted)setBusy(false)}
}
async function reset(){if(!busy&&confirm('Заменить текущий локальный проект? Скачай его заранее, если он нужен.'))await open(mode,fresh(mode))}
$('lab-model').onclick=()=>{if(mode!=='model'||!active)void open('model')};$('lab-world').onclick=()=>{if(mode!=='world'||!active)void open('world')};
$('lab-new').onclick=()=>void reset();$('lab-export').onclick=()=>{if(active)downloadProject(active)};$('lab-import').onclick=()=>$('lab-file').click();
$('lab-file').onchange=async()=>{const file=$('lab-file').files[0];$('lab-file').value='';if(!file||busy)return;try{if(file.size>20*1024*1024)throw Error('size');const doc=parseProject(await file.text()),kind=doc.world?.version===1?'world':mode;if(!confirm('Открыть файл вместо текущего локального проекта?'))return;await open(kind,kind==='world'?{...doc,world:{version:1,static:true}}:doc)}catch{$('lab-status').textContent='Файл не является подходящим проектом BrickLab.'}};
$('world-add').onclick=async()=>{if(busy||!worldAction)return;setBusy(true);try{const cells=planWorldFill(inputs(),active.parts.length);await worldAction(cells);$('world-status').textContent='Добавлено деталей: '+cells.length}catch(e){$('world-status').textContent=e.message||'Не удалось построить.'}finally{setBusy(false)}};
window.addEventListener('beforeunload',event=>{if(failed){event.preventDefault();event.returnValue=''}});
void open('model');
