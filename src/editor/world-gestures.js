
import {PLATE,STUD,worldGestureCells,worldLine,worldCoverage} from './world-plan.js'
import {Plane,Vector3} from 'three'
export function mountWorldGestures(root,{scene,signal,controls,canBuild,prepare,build,count}){
 const canvas=scene.canvas,host=canvas.parentElement;
 let stroke=null,placing=false;
 const on=(target,event,fn,capture=false)=>target.addEventListener(event,fn,{signal,capture});
 const consume=e=>{e.preventDefault();e.stopImmediatePropagation()};
 const get=()=>controls.read();
 const active=()=>get().tool!=='select';
 const pos=(event,level)=>{
  const ray=scene.pointer(event,false).ray;
  const point=ray.intersectPlane(new Plane(new Vector3(0,1,0),-level*PLATE),new Vector3());
  if(!point)return null;
  const x=Math.round(point.x/STUD),z=Math.round(point.z/STUD);
  return x>=-40&&x<=40&&z>=-40&&z<=40?{x,z}:null;
 };
 function clear(){const old=stroke;stroke=null;scene.setWorldPreview([]);if(old&&canvas.hasPointerCapture(old.id))canvas.releasePointerCapture(old.id)}
 function selectTool(){
  clear();
  host.classList.toggle('world-drawing',active());
  if(active())prepare();
 }
 function preview(event){
  const cfg=stroke?.config??get(),point=pos(event,cfg.level);
  if(!point){scene.setWorldPreview([]);if(stroke)stroke.cells=null;return}
  if(stroke&&cfg.tool==='brush'){
   const next=worldLine(stroke.end,point);
   for(const p of next){const key=p.x+','+p.z;if(!stroke.seen.has(key)){stroke.seen.add(key);stroke.trail.push(p)}}
  }
  if(stroke)stroke.end=point;
  try{
   const cells=worldGestureCells(cfg,stroke?.start??point,point,stroke?.trail??[],count());
   scene.setWorldPreview(cells);
   if(stroke)stroke.cells=cells;
   controls.status('Предпросмотр · '+cells.length+' дет. / '+worldCoverage(cells)+' stud-слоёв');
  }catch(e){if(stroke)stroke.cells=null;scene.setWorldPreview([]);controls.status(e.message)}
 }
 on(controls.tool,'change',selectTool);
 on(host,'pointerdown',e=>{
  if(e.target!==canvas||e.button!==0||!active())return;
  consume(e);if(placing||!e.isPrimary||!canBuild()){controls.status('Заверши текущую операцию или вернись в сборку.');return}
  const cfg=get(),point=pos(e,cfg.level);if(!point)return;
  stroke={id:e.pointerId,config:cfg,start:point,end:point,trail:[point],seen:new Set([point.x+','+point.z]),cells:null};
  canvas.setPointerCapture(e.pointerId);preview(e)
 },true);
 on(host,'pointermove',e=>{
  if(e.target!==canvas||!active())return;
  if(stroke&&stroke.id===e.pointerId){consume(e);preview(e)}
  else if(!stroke&&!placing&&e.buttons===0){consume(e);if(canBuild())preview(e);else scene.setWorldPreview([])}
 },true);
 on(host,'pointerup',e=>{
  if(!stroke||stroke.id!==e.pointerId)return;
  consume(e);preview(e);const cells=stroke.cells;clear();
  if(!cells?.length)return;
  placing=true;controls.busy(true);
  Promise.resolve().then(()=>build(cells,{focus:false})).then(()=>{if(!signal.aborted)controls.status('Добавлено: '+cells.length+' дет. · '+worldCoverage(cells)+' stud-слоёв')}).catch(e=>{if(!signal.aborted)controls.status(e.message)}).finally(()=>{placing=false;if(!signal.aborted)controls.busy(false)});
 },true);
 on(host,'pointercancel',e=>{if(stroke?.id===e.pointerId){consume(e);clear()}},true);
 on(canvas,'lostpointercapture',e=>{if(stroke?.id===e.pointerId){consume(e);clear()}},true);
 on(canvas,'pointerleave',()=>{if(!stroke)scene.setWorldPreview([])});
 on(window,'keydown',e=>{if(e.key==='Escape'&&active()&&!placing){consume(e);controls.tool.value='select';controls.tool.dispatchEvent(new Event('change'))}},true);
 signal.addEventListener('abort',()=>{stroke=null;host.classList.remove('world-drawing')},{once:true});
 selectTool();
 return {cancel(){clear();controls.tool.value='select';host.classList.remove('world-drawing')}}
}
