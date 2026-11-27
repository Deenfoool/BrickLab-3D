
import {planWorldFill,planWorldTerrain} from './world-plan.js'
const KEY='bricklab.lab.modules.v1';
export const MODULE_LIMIT=256;
const finite=(v,n)=>Array.isArray(v)&&v.length===n&&v.every(x=>Number.isFinite(x)&&Math.abs(x)<=100000);
const str=(v,max=120)=>typeof v==='string'&&v.length>0&&v.length<=max;
const categories=['Архитектура','Инфраструктура','Рельеф','Испытания','Другое'];
const color=v=>typeof v==='string'&&/^#[a-f0-9]{6}$/i.test(v)?v:'#a0a5a9';
export const moduleCategories=Object.freeze(categories);
export function validateModule(raw){
 if(raw?.format!=='bricklab-world-module'||raw.version!==1||!str(raw.name,80)||!Array.isArray(raw.parts)||!raw.parts.length||raw.parts.length>MODULE_LIMIT)throw Error('Неверный формат модуля или больше 256 деталей.');
 const ids=new Set();
 const parts=raw.parts.map(p=>{
  if(!str(p?.id)||ids.has(p.id)||!str(p.design,40)||!finite(p.position,3)||!finite(p.rotation,4)||Math.abs(Math.hypot(...p.rotation)-1)>.01)throw Error('Неверная геометрия модуля.');
  ids.add(p.id);return {id:p.id,design:p.design,position:[...p.position],rotation:[...p.rotation],color:color(p.color),...(p.mirrored===true?{mirrored:true}:{})};
 });
 const links=Array.isArray(raw.connections)?raw.connections:[],belts=Array.isArray(raw.belts)?raw.belts:[];
 if(links.length>4096||belts.length>256)throw Error('Слишком много соединений.');
 const endpoint=(e,key)=>ids.has(e?.part)&&str(e[key],120);
 const connections=links.map(l=>{
  if(!endpoint(l?.shaft,'port')||!endpoint(l?.socket,'port')||!l.placement||typeof l.placement!=='object'||Array.isArray(l.placement))throw Error('Неверное соединение модуля.');
  const placement=Object.fromEntries(Object.entries(l.placement).filter(([k,v])=>str(k,40)&&(typeof v==='boolean'||str(v,120)||Number.isFinite(v)||v===null||Array.isArray(v)&&v.length<=16&&v.every(Number.isFinite))));
  return {shaft:{part:l.shaft.part,port:l.shaft.port},socket:{part:l.socket.part,port:l.socket.port},placement};
 });
 const beltRecords=belts.map(b=>{
  if(!str(b?.id)||!endpoint(b.a,'groove')||!endpoint(b.b,'groove'))throw Error('Неверный ремень модуля.');
  return {id:b.id,a:{part:b.a.part,groove:b.a.groove},b:{part:b.b.part,groove:b.b.groove},color:color(b.color)};
 });
 return {format:'bricklab-world-module',version:1,id:str(raw.id)?raw.id:crypto.randomUUID(),name:raw.name.trim().slice(0,80)||'Модуль',category:categories.includes(raw.category)?raw.category:'Другое',parts,connections,belts:beltRecords,thumbnail:typeof raw.thumbnail==='string'&&raw.thumbnail.length<150000&&/^data:image\/webp;base64,[a-z0-9+/=]+$/i.test(raw.thumbnail)?raw.thumbnail:null};
}
export function readModules(){const data=localStorage.getItem(KEY);if(!data)return [];const list=JSON.parse(data);if(!Array.isArray(list))throw Error('Хранилище модулей повреждено.');return list.map(validateModule)}
export function writeModules(list){if(list.length>32)throw Error('До 32 локальных модулей. Экспортируй лишние.');localStorage.setItem(KEY,JSON.stringify(list))}
export function exportModule(module){const url=URL.createObjectURL(new Blob([JSON.stringify(validateModule(module),null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=module.name.replace(/[\\/:*?"<>|]/g,'-')+'.brickmodule';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
export const modulePresets=Object.freeze([
 {id:'platform',name:'Стартовая площадка',category:'Испытания',description:'16 × 16 stud · гладкое основание'},
 {id:'steps',name:'Лестничный подъём',category:'Испытания',description:'12 × 8 stud · перепад 6 пластин'},
 {id:'bumps',name:'Диагональные бугры',category:'Испытания',description:'12 × 8 stud · две полосы'},
 {id:'bridge',name:'Мост',category:'Инфраструктура',description:'12 × 6 stud · пролёт на опорах'},
 {id:'wall',name:'Стена с проёмом',category:'Архитектура',description:'12 stud · 4 кирпичных ряда'},
 {id:'hill',name:'Холм',category:'Рельеф',description:'10 × 10 stud · ступенчатый рельеф'}
]);
export function presetCells(id,available){
 const out=[];
 function fill(kind,x,z,width,depth,level,rows,color){
  out.push(...planWorldFill({kind,x,z,width,depth,level,rows,color,smart:true,bond:true,available},out.length));
  if(out.length>MODULE_LIMIT)throw Error('Слишком много деталей.');
 }
 if(id==='platform'){fill('plate',0,0,16,16,0,1,'#737b85');fill('tile',0,0,16,16,1,1,'#a0a5a9')}
 else if(id==='steps'){out.push(...planWorldTerrain({tool:'terrainSteps',level:0,terrainHeight:6,terrainStep:2,color:'#8b929a',available},{x:0,z:0},{x:11,z:7}))}
 else if(id==='bumps'){fill('plate',0,0,12,8,0,1,'#737b85');for(const [x,z] of [[1,1],[7,4]]){fill('brick',x,z,3,3,1,1,'#a0a5a9');fill('plate',x-1,z,1,3,1,2,'#a0a5a9');fill('plate',x+3,z,1,3,1,2,'#a0a5a9')}}
 else if(id==='bridge'){for(const x of [0,10])fill('brick',x,0,2,6,0,2,'#737b85');fill('plate',0,0,12,6,6,2,'#a0a5a9');fill('tile',0,0,12,6,8,1,'#353b42')}
 else if(id==='wall'){fill('brick',0,0,4,1,0,3,'#a87558');fill('brick',8,0,4,1,0,3,'#a87558');fill('brick',0,0,12,1,9,1,'#a87558')}
 else if(id==='hill'){out.push(...planWorldTerrain({tool:'terrainHill',level:0,terrainHeight:5,terrainStep:1,color:'#648b50',available},{x:0,z:0},{x:9,z:9}))}
 else throw Error('Неизвестный шаблон.');
 if(out.length>MODULE_LIMIT)throw Error('Слишком много деталей.');
 return out;
}
