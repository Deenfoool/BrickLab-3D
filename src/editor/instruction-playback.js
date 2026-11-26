import * as THREE from 'three'
import {OrbitControls} from 'three/addons/controls/OrbitControls.js'
import {partMesh} from './parts.js?v=system-complete'
import {createBeltScene} from './belt-scene.js?v=belt-drive'
import {sampleInstallation,installationBounds} from './instruction-trajectories.js'
const dirs={iso:[1.35,.92,1.6],front:[0,.3,1],side:[1,.25,0],left:[-1,.25,0],rear:[-1.35,.92,-1.6],top:[.01,1,.01]}
export function createInstructionPlayback(host,{build,models,catalog}){
 const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false})
 renderer.setPixelRatio(Math.min(1.5,window.devicePixelRatio||1));renderer.setClearColor(0xe8edf2);renderer.outputColorSpace=THREE.SRGBColorSpace
 const canvas=renderer.domElement;canvas.style.width='100%';canvas.style.height='100%';canvas.style.display='block';host.append(canvas)
 const world=new THREE.Scene(),solids=new THREE.Group(),camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,100000)
 world.add(solids,new THREE.HemisphereLight(0xe3efff,0x4c5260,2.15))
 for(const [color,intensity,position] of [[0xffe5ca,2.6,[1,2.7,1.6]],[0xaacbff,1.8,[-2,1.3,-1.5]]]){const light=new THREE.DirectionalLight(color,intensity);light.position.fromArray(position);world.add(light)}
 const orbit=new OrbitControls(camera,canvas);orbit.enableDamping=false
 const arrow=new THREE.ArrowHelper(new THREE.Vector3(0,1,0),new THREE.Vector3(),1,0xe68a12);arrow.visible=false;world.add(arrow)
 const byId=new Map(build.parts.map(p=>[p.id,p])),objects=new Map(),shown=new Set(),bounds=new THREE.Box3()
 let tracks=[],previous=[],stepBelts=[],lastCompleted=-1,view='iso',closed=false,frame=0,aspect=1,arrows=true
 const belts=createBeltScene(world,id=>shown.has(id)?byId.get(id):undefined,()=>{})
 function invalidate(){if(!closed&&!frame)frame=requestAnimationFrame(()=>{frame=0;if(!closed)renderer.render(world,camera)})}
 orbit.addEventListener('change',invalidate)
 function fit(){const size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3()),radius=Math.max(24,size.length()*.58);orbit.target.copy(center);camera.position.copy(center).addScaledVector(new THREE.Vector3(...(dirs[view]??dirs.iso)).normalize(),Math.max(100,radius*3));camera.zoom=1;camera.left=-radius*Math.max(1,aspect);camera.right=-camera.left;camera.top=radius*Math.max(1,1/aspect);camera.bottom=-camera.top;camera.updateProjectionMatrix();orbit.update();invalidate()}
 const resize=new ResizeObserver(()=>{const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;aspect=w/h;renderer.setSize(w,h,false);if(!bounds.isEmpty())fit()});resize.observe(host)
 function objectFor(id){if(objects.has(id))return objects.get(id);const p=byId.get(id),m=models.get(p.design);if(!m)return null;const o=partMesh(m,p.color??catalog[p.design]?.color??'#9ca3af');o.quaternion.fromArray(p.rotation);o.scale.x=p.mirrored?-1:1;solids.add(o);objects.set(id,o);return o}
 function configure(before,next,angle){
  previous=[...before];tracks=next;view=angle;lastCompleted=-1;shown.clear();bounds.makeEmpty()
  const keep=new Set([...previous,...tracks.map(t=>t.id)])
  for(const [id,o] of objects)if(!keep.has(id)){solids.remove(o);o.userData.finish.dispose();objects.delete(id)}
  for(const id of keep){const p=byId.get(id),o=objectFor(id);if(!o)continue;o.position.fromArray(p.position);o.userData.finish.color.set(p.color??catalog[p.design]?.color??'#9ca3af');if(previous.includes(id))o.userData.finish.color.lerp(new THREE.Color('#a5adb7'),.75);o.visible=false;const b=installationBounds(p,models.get(p.design));if(b)bounds.union(b)}
  for(const t of tracks){if(t.kind==='manual')continue;const p=byId.get(t.id),b=installationBounds(p,models.get(p.design));if(b)bounds.union(b.translate(new THREE.Vector3(...t.from).sub(new THREE.Vector3(...t.to))))}
  stepBelts=(build.belts??[]).filter(b=>keep.has(b.a.part)&&keep.has(b.b.part));if(!bounds.isEmpty())fit();seek(tracks.length)
 }
 function seek(progress){
  const value=Math.max(0,Math.min(tracks.length,progress)),done=Math.floor(value);shown.clear()
  for(const id of previous){const o=objects.get(id);if(o)o.visible=true;shown.add(id)}
  arrow.visible=false
  for(let i=0;i<tracks.length;i++){const t=tracks[i],o=objects.get(t.id);if(!o)continue
   if(i>done||i===done&&value===done&&done<tracks.length){o.visible=false;continue}
   const state=sampleInstallation(t,i<done?1:value-i);o.visible=state.visible;o.position.fromArray(state.position)
   if(i<done)shown.add(t.id)
   if(arrows&&i===done&&t.kind!=='manual'&&state.visible){const from=new THREE.Vector3(...state.position),delta=new THREE.Vector3(...t.to).sub(from),len=delta.length();if(len>2){arrow.position.copy(from);arrow.setDirection(delta.normalize());arrow.setLength(len,Math.min(7,len*.35),Math.min(4,len*.22));arrow.visible=true}}
  }
  if(lastCompleted!==done){lastCompleted=done;belts.set(stepBelts.filter(b=>shown.has(b.a.part)&&shown.has(b.b.part)))}
  invalidate()
 }
 return {configure,seek,setArrows(value){arrows=value;if(!value)arrow.visible=false;invalidate()},dispose(){if(closed)return;closed=true;cancelAnimationFrame(frame);resize.disconnect();orbit.dispose();belts.dispose();for(const o of objects.values())o.userData.finish.dispose();arrow.line.material.dispose();arrow.cone.material.dispose();renderer.dispose();canvas.remove()}}
}
