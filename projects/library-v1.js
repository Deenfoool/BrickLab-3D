export const PROJECT_LIBRARY_VERSION='project-library-v1.0.3'
export const PROJECT_DB_NAME='bricklab.projects.v1'
export const PROJECT_DB_VERSION=1
export const ACTIVE_PROJECT_KEY='bricklab.projects.active.v1'

const META_STORE='projects',SNAPSHOT_STORE='snapshots'
const memory={meta:new Map(),snapshots:new Map()}
let dbPromise=null,internalOpenId=null
const clone=v=>typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v))
const nowIso=()=>new Date().toISOString()
const uid=()=>globalThis.crypto?.randomUUID?.()||`project-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`

function colorHex(value){if(typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value))return value;const n=Number(value);return Number.isFinite(n)?`#${(n>>>0).toString(16).padStart(6,'0').slice(-6)}`:'#7b8794'}
function hashText(text){let hash=0x811c9dc5;for(let i=0;i<text.length;i+=1){hash^=text.charCodeAt(i);hash=Math.imul(hash,0x01000193)}return(hash>>>0).toString(16).padStart(8,'0')}
export function projectSnapshotFingerprint(snapshot){
  const payload={name:snapshot?.name||'',parts:(snapshot?.parts||[]).map(p=>[p.instanceId,p.partId,p.color,p.groupId,p.position,p.rotation]),connections:(snapshot?.connections||[]).map(c=>c.id||c),connectionsV4:(snapshot?.connectionsV4||[]).map(c=>c.id||[c.a?.instanceId,c.a?.endpointId,c.b?.instanceId,c.b?.endpointId])}
  return hashText(JSON.stringify(payload))
}

export function createProjectThumbnailSvg(snapshot,{width=320,height=180}={}){
  const parts=Array.isArray(snapshot?.parts)?snapshot.parts.slice(0,120):[]
  if(!parts.length)return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#15191e"/><path d="M30 ${height-34}H${width-30}M${width/2} 28V${height-26}" stroke="#2b333c"/><text x="${width/2}" y="${height/2}" text-anchor="middle" dominant-baseline="middle" fill="#6f7d8c" font-family="system-ui" font-size="14">Empty project</text></svg>`
  const pts=parts.map(p=>({x:Number(p?.position?.[0])||0,z:Number(p?.position?.[2])||0,color:colorHex(p?.color)})),xs=pts.map(p=>p.x),zs=pts.map(p=>p.z)
  const minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs),spanX=Math.max(1,maxX-minX),spanZ=Math.max(1,maxZ-minZ),pad=28,scale=Math.min((width-pad*2)/spanX,(height-pad*2)/spanZ)
  const marks=pts.map((p,i)=>{const x=pad+(p.x-minX)*scale,y=height-pad-(p.z-minZ)*scale,size=Math.max(4,Math.min(12,7-scale*.04));return `<rect x="${(x-size/2).toFixed(1)}" y="${(y-size/2).toFixed(1)}" width="${size.toFixed(1)}" height="${size.toFixed(1)}" rx="2" fill="${p.color}" opacity="${i<80?'.92':'.55'}"/>`}).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#15191e"/><path d="M24 ${height-24}H${width-24}M${width/2} 20V${height-20}" stroke="#242c34"/>${marks}</svg>`
}

export function projectMetadataFromSnapshot(snapshot,{id=uid(),name,createdAt,template=null}={}){
  const normalizedName=String(name||snapshot?.name||'Untitled Build').trim()||'Untitled Build',modifiedAt=nowIso()
  return Object.freeze({id,name:normalizedName,createdAt:createdAt||modifiedAt,modifiedAt,partCount:Array.isArray(snapshot?.parts)?snapshot.parts.length:0,linkCount:(snapshot?.connectionsV4?.length||0)+(snapshot?.connections?.length||0),template:template||null,thumbnailSvg:createProjectThumbnailSvg(snapshot),fingerprint:projectSnapshotFingerprint({...snapshot,name:normalizedName}),version:1})
}

function part(instanceId,partId,position,rotation=[0,0,0],color=null){return{instanceId,partId,position,rotation,color,groupId:null}}
function templateSnapshot(name,parts){return{version:2,name,parts,connections:[],connectorSystemV4:{version:4},connectionsV4:[]}}
export const PROJECT_TEMPLATES=Object.freeze([
  {id:'empty',name:'Empty project',description:'Blank workspace',snapshot:templateSnapshot('Untitled Build',[])},
  {id:'vehicle-chassis',name:'Vehicle chassis',description:'Starter rails and cross-members',snapshot:templateSnapshot('Vehicle Chassis',[part('vc-rail-l','beam-9',[-2,1,0]),part('vc-rail-r','beam-9',[2,1,0]),part('vc-cross-a','technic-brick-1x6',[0,1,-3],[0,Math.PI/2,0]),part('vc-cross-b','technic-brick-1x6',[0,1,3],[0,Math.PI/2,0])])},
  {id:'drivetrain-bench',name:'Drivetrain bench',description:'Motor, axle and gears laid out for testing',snapshot:templateSnapshot('Drivetrain Bench',[part('dt-base','beam-9',[0,.5,0]),part('dt-motor','motor',[-4,1,0]),part('dt-axle','axle-7',[0,1,0]),part('dt-g8','gear-8',[1,1,0]),part('dt-g24','gear-24',[3.2,1,0])])},
  {id:'suspension-rig',name:'Suspension test rig',description:'Simple frame for articulation experiments',snapshot:templateSnapshot('Suspension Test Rig',[part('sr-a','beam-9',[-2,1,0]),part('sr-b','beam-9',[2,1,0]),part('sr-l','beam-5',[-2,1,3],[0,Math.PI/2,0]),part('sr-r','beam-5',[2,1,3],[0,Math.PI/2,0]),part('sr-pin-a','pin',[-2,1,1.8]),part('sr-pin-b','pin',[2,1,1.8])])},
])

function requestToPromise(r){return new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
function openDb(){if(dbPromise)return dbPromise;if(!globalThis.indexedDB)return Promise.resolve(null);dbPromise=new Promise((resolve,reject)=>{const r=indexedDB.open(PROJECT_DB_NAME,PROJECT_DB_VERSION);r.onupgradeneeded=()=>{const db=r.result;if(!db.objectStoreNames.contains(META_STORE))db.createObjectStore(META_STORE,{keyPath:'id'}).createIndex('modifiedAt','modifiedAt');if(!db.objectStoreNames.contains(SNAPSHOT_STORE))db.createObjectStore(SNAPSHOT_STORE,{keyPath:'id'})};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)}).catch(error=>{console.warn('[BrickLab Projects] IndexedDB unavailable; using memory store.',error);return null});return dbPromise}
async function putRecord(meta,snapshot){const db=await openDb();if(!db){memory.meta.set(meta.id,clone(meta));memory.snapshots.set(meta.id,{id:meta.id,snapshot:clone(snapshot)});return}await new Promise((resolve,reject)=>{const tx=db.transaction([META_STORE,SNAPSHOT_STORE],'readwrite');tx.objectStore(META_STORE).put(meta);tx.objectStore(SNAPSHOT_STORE).put({id:meta.id,snapshot});tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)})}
async function getMeta(id){const db=await openDb();return db?requestToPromise(db.transaction(META_STORE).objectStore(META_STORE).get(id)):clone(memory.meta.get(id)||null)}
async function getSnapshotRecord(id){const db=await openDb();return db?requestToPromise(db.transaction(SNAPSHOT_STORE).objectStore(SNAPSHOT_STORE).get(id)):clone(memory.snapshots.get(id)||null)}
async function deleteRecord(id){const db=await openDb();if(!db){memory.meta.delete(id);memory.snapshots.delete(id);return}await new Promise((resolve,reject)=>{const tx=db.transaction([META_STORE,SNAPSHOT_STORE],'readwrite');tx.objectStore(META_STORE).delete(id);tx.objectStore(SNAPSHOT_STORE).delete(id);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)})}

function liveSnapshot(){try{return clone(globalThis.BrickLabSubsystems?.projects?.current?.()||null)}catch{return null}}
function activeId(){try{return localStorage.getItem(ACTIVE_PROJECT_KEY)}catch{return null}}
function setActiveId(id){try{id?localStorage.setItem(ACTIVE_PROJECT_KEY,id):localStorage.removeItem(ACTIVE_PROJECT_KEY)}catch{/* ignored */}}
function emit(type,detail={}){globalThis.dispatchEvent?.(new CustomEvent('bricklab:projectlibrarychange',{detail:{type,...detail}}))}

export async function listProjects(){const db=await openDb();const list=db?await requestToPromise(db.transaction(META_STORE).objectStore(META_STORE).getAll()):[...memory.meta.values()].map(clone);return list.sort((a,b)=>String(b.modifiedAt).localeCompare(String(a.modifiedAt)))}
export async function createProject(snapshot,{name,template=null,activate=false}={}){const clean=clone(snapshot||templateSnapshot(name||'Untitled Build',[]));clean.version=2;clean.name=String(name||clean.name||'Untitled Build').trim()||'Untitled Build';const meta=projectMetadataFromSnapshot(clean,{name:clean.name,template});await putRecord(meta,clean);if(activate)setActiveId(meta.id);emit('created',{id:meta.id});return meta}
export async function updateProject(id,snapshot,{name}={}){const old=await getMeta(id);if(!old)throw new Error('Project not found');const clean=clone(snapshot);clean.version=2;clean.name=String(name||clean.name||old.name).trim()||old.name;const fingerprint=projectSnapshotFingerprint(clean);if(old.fingerprint===fingerprint&&old.name===clean.name)return old;const meta={...projectMetadataFromSnapshot(clean,{id,name:clean.name,createdAt:old.createdAt,template:old.template}),id};await putRecord(meta,clean);emit('updated',{id});return meta}
export async function syncActiveProject(){const snapshot=liveSnapshot();if(!snapshot?.parts)return null;const id=activeId(),meta=id?await getMeta(id):null;if(!meta)return createProject(snapshot,{name:snapshot.name||'Untitled Build',activate:true});return updateProject(id,snapshot,{name:snapshot.name||meta.name})}
export async function renameProject(id,name){const record=await getSnapshotRecord(id),old=await getMeta(id);if(!record||!old)throw new Error('Project not found');const clean=clone(record.snapshot);clean.name=String(name||'').trim()||old.name;const meta=await updateProject(id,clean,{name:clean.name});if(id===activeId()){const el=document.getElementById('projectName');if(el)el.textContent=clean.name}return meta}
export async function duplicateProject(id){const record=await getSnapshotRecord(id),old=await getMeta(id);if(!record||!old)throw new Error('Project not found');return createProject(record.snapshot,{name:`${old.name} Copy`,template:old.template})}
export async function removeProject(id){if(id===activeId())setActiveId(null);await deleteRecord(id);emit('deleted',{id})}
export async function projectSnapshot(id){return clone((await getSnapshotRecord(id))?.snapshot||null)}

function importSnapshotThroughEditor(snapshot,id){const input=document.getElementById('importFile');if(input&&typeof File!=='undefined'&&typeof DataTransfer!=='undefined'){const file=new File([JSON.stringify(snapshot)],`${String(snapshot.name||'bricklab').replace(/[^a-z0-9_-]+/gi,'-')}.bricklab`,{type:'application/json'}),transfer=new DataTransfer();transfer.items.add(file);input.files=transfer.files;internalOpenId=id;input.dispatchEvent(new Event('change',{bubbles:true}));return true}try{localStorage.setItem('bricklab.project.v2',JSON.stringify(snapshot));setActiveId(id);location.reload();return true}catch{return false}}
export async function openProject(id){if(activeId()!==id)await syncActiveProject().catch(()=>null);const snapshot=await projectSnapshot(id);if(!snapshot)throw new Error('Project not found');setActiveId(id);if(!importSnapshotThroughEditor(snapshot,id))throw new Error('Editor import path unavailable');emit('opening',{id});return true}
export async function createFromTemplate(templateId,{open=true}={}){const template=PROJECT_TEMPLATES.find(item=>item.id===templateId);if(!template)throw new Error('Unknown template');const meta=await createProject(template.snapshot,{name:template.snapshot.name,template:template.id,activate:false});if(open)await openProject(meta.id);return meta}
export async function exportStoredProject(id){const snapshot=await projectSnapshot(id),meta=await getMeta(id);if(!snapshot||!meta)throw new Error('Project not found');const blob=new Blob([JSON.stringify(snapshot,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`${meta.name.toLowerCase().replace(/[^a-z0-9]+/g,'-')||'bricklab'}.bricklab`;a.click();URL.revokeObjectURL(a.href)}

function scheduleSync(delay=450){clearTimeout(scheduleSync.timer);scheduleSync.timer=setTimeout(()=>void syncActiveProject().catch(error=>console.debug?.('[BrickLab Projects] sync skipped',error)),delay)}
export async function initializeProjectLibrary(){
  await openDb();const startMode=globalThis.__bricklabConnectorV4StartMode
  if(startMode==='new'){const snapshot=liveSnapshot()||templateSnapshot('Untitled Build',[]),meta=await createProject(snapshot,{name:snapshot.name||'Untitled Build',activate:true});setActiveId(meta.id)}else if(startMode!=='open')await syncActiveProject().catch(()=>null)
  document.getElementById('viewport')?.addEventListener('pointerup',()=>scheduleSync(650),{passive:true});document.getElementById('saveBtn')?.addEventListener('click',()=>scheduleSync(60));document.getElementById('newBtn')?.addEventListener('click',()=>setTimeout(async()=>{const snap=liveSnapshot()||templateSnapshot('Untitled Build',[]),meta=await createProject(snap,{name:snap.name||'Untitled Build',activate:true});setActiveId(meta.id)},80));globalThis.addEventListener?.('bricklab:editorexternalmutation',()=>scheduleSync(250));globalThis.addEventListener?.('bricklab:smartassemblyinstalled',()=>scheduleSync(250));document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')scheduleSync(0)})
  const input=document.getElementById('importFile');input?.addEventListener('change',()=>{const requested=internalOpenId;internalOpenId=null;const file=input.files?.[0]||null;if(requested){setActiveId(requested);emit('opened',{id:requested});return}if(!file)return;void file.text().then(text=>JSON.parse(text)).then(async snap=>{if(!snap||!Array.isArray(snap.parts))return;const meta=await createProject(snap,{name:snap.name||file.name.replace(/\.bricklab$/i,'')||'Imported Build',activate:true});setActiveId(meta.id);emit('imported',{id:meta.id})}).catch(error=>console.debug?.('[BrickLab Projects] import capture skipped',error))})
  return BrickLabProjectLibrary
}

export const BrickLabProjectLibrary=Object.freeze({version:PROJECT_LIBRARY_VERSION,activeId,list:listProjects,snapshot:projectSnapshot,syncCurrent:syncActiveProject,create:createProject,createFromTemplate,open:openProject,rename:renameProject,duplicate:duplicateProject,remove:removeProject,exportProject:exportStoredProject,templates:()=>PROJECT_TEMPLATES.map(({snapshot,...meta})=>({...meta,partCount:snapshot.parts.length}))})
globalThis.BrickLabProjectLibrary=BrickLabProjectLibrary
