import * as THREE from 'three'
import {OrbitControls} from 'three/addons/controls/OrbitControls.js'
import {partMesh,parts} from './parts.js?v=system-complete'
import {createBeltScene} from './belt-scene.js?v=belt-drive'
export function openPhotoStudio({document:doc,models,hidden,language,signal}){
 const ru=language==='ru',tr=(a,b)=>ru?a:b,d=document
 const el=(tag,cls,text)=>{const n=d.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n}
 const dialog=el('dialog','bricklab-studio'),header=el('header','studio-header'),stage=el('div','studio-stage'),controls=el('aside','studio-controls'),status=el('p','studio-status'),viewport=el('div','studio-viewport')
 const button=(text,fn)=>{const b=el('button','workspace-action',text);b.type='button';b.onclick=fn;return b}
 const close=button(tr('Назад в редактор','Back to editor'),()=>dialog.close()),save=button('PNG',exportPhoto)
 header.append(el('strong',null,'Photo Studio · '+doc.name),save,close);stage.append(viewport);dialog.append(header,stage,controls,status)
 let renderer,orbit,observer,belts,frame,closed=false,geometry,material,texture,shadow
 const world=new THREE.Scene(),group=new THREE.Group(),camera=new THREE.PerspectiveCamera(38,1,.1,100000)
 const ambient=new THREE.HemisphereLight(0xe3efff,0x485060,2.15),key=new THREE.DirectionalLight(0xffe5ca,2.6),fill=new THREE.DirectionalLight(0xaacbff,1.8)
 key.position.set(1,2.7,1.6);fill.position.set(-2,1.3,-1.5);world.add(group,ambient,key,fill)
 const select=(label,items,fn)=>{const wrap=el('label'),s=el('select');wrap.append(el('span',null,label),s);for(const [v,t] of items)s.append(new Option(t,v));s.onchange=fn;controls.append(wrap);return s}
 const range=(label,min,max,step,value,fn)=>{const wrap=el('label'),s=el('input');s.type='range';s.min=min;s.max=max;s.step=step;s.value=value;wrap.append(el('span',null,label),s);s.oninput=fn;controls.append(wrap);return s}
 const angle=select(tr('Ракурс','Angle'),[['iso','3/4'],['front',tr('Спереди','Front')],['side',tr('Справа','Right')],['rear',tr('Сзади','Rear')],['left',tr('Слева','Left')],['top',tr('Сверху','Top')]],()=>resetCamera())
 const aspect=select(tr('Формат','Aspect'),[['16:9','16:9'],['1:1','1:1'],['9:16','9:16'],['4:5','4:5'],['3:2','3:2']],()=>{resize();resetCamera()})
 const size=select(tr('Размер PNG','PNG size'),[['1280','1280 px'],['1920','1920 px'],['2048','2048 px']],()=>{})
 const light=select(tr('Освещение','Lighting'),[['studio',tr('Студийное','Studio')],['warm',tr('Тёплое','Warm')],['cool',tr('Холодное','Cool')]],update)
 const background=select(tr('Фон','Background'),[['transparent',tr('Прозрачный','Transparent')],['dark',tr('Тёмный','Dark')],['light',tr('Светлый','Light')],['blue',tr('Синий','Blue')]],update)
 const intensity=range(tr('Яркость','Brightness'),.4,1.8,.05,1,update)
 const zoom=range(tr('Масштаб','Zoom'),.5,1.6,.05,1,()=>{camera.zoom=Number(zoom.value);camera.updateProjectionMatrix();invalidate()})
 const shade=el('input');shade.type='checkbox';shade.checked=true;const label=el('label','studio-checkbox');label.append(shade,el('span',null,tr('Мягкая тень','Soft shadow')));shade.onchange=update;controls.append(label)
 const caption=el('input');caption.type='checkbox';const captionLabel=el('label','studio-checkbox');captionLabel.append(caption,el('span',null,tr('Название и число деталей','Title and part count')));controls.append(captionLabel)
 controls.append(el('p','studio-help',tr('Вращай модель мышью, приближай колесом. Настройки применяются сразу.','Drag to orbit, scroll to zoom. Settings apply immediately.')),button(tr('Сбросить ракурс','Reset camera'),resetCamera))
 const center=new THREE.Vector3(),extent=new THREE.Vector3()
 function invalidate(){if(closed||!renderer||frame)return;frame=requestAnimationFrame(()=>{frame=0;renderer.render(world,camera)})}
 function dimensions(){const [a,b]=aspect.value.split(':').map(Number);return [a,b]}
 function resize(){if(!renderer)return;const [a,b]=dimensions(),w=Math.max(1,Math.min(stage.clientWidth-24,(stage.clientHeight-24)*a/b)),h=w*b/a;viewport.style.width=w+'px';viewport.style.height=h+'px';renderer.setSize(Math.round(w),Math.round(h),false);camera.aspect=a/b;camera.updateProjectionMatrix();invalidate()}
 function resetCamera(){if(!orbit)return;const dirs={iso:[1,.8,1.35],front:[0,.05,1],side:[1,.05,0],rear:[0,.05,-1],left:[-1,.05,0],top:[.001,1,.001]};const radius=Math.max(10,extent.length()/2),vertical=THREE.MathUtils.degToRad(camera.fov/2),horizontal=Math.atan(Math.tan(vertical)*camera.aspect),distance=radius/Math.sin(Math.min(vertical,horizontal))*1.08;orbit.target.copy(center);camera.position.copy(center).addScaledVector(new THREE.Vector3(...dirs[angle.value]).normalize(),distance);zoom.value='1';camera.zoom=1;camera.updateProjectionMatrix();orbit.update();invalidate()}
 function update(){if(!renderer)return;const factor=Number(intensity.value);ambient.intensity=2.15*factor;key.intensity=2.6*factor;fill.intensity=1.8*factor;key.color.set(light.value==='cool'?0xd5e9ff:light.value==='warm'?0xffcf99:0xffe5ca);fill.color.set(light.value==='warm'?0xffe5ca:0xaacbff);const bg={dark:'#202631',light:'#e5e9ef',blue:'#284866'}[background.value];world.background=bg?new THREE.Color(bg):null;viewport.classList.toggle('studio-transparent',!bg);if(shadow)shadow.visible=shade.checked;invalidate()}
 function exportPhoto(){if(!renderer||closed)return;const [a,b]=dimensions(),edge=Number(size.value),w=Math.round(edge*a/Math.max(a,b)),h=Math.round(edge*b/Math.max(a,b));const previous=renderer.getSize(new THREE.Vector2());try{renderer.setSize(w,h,false);renderer.render(world,camera);const shot=d.createElement('canvas');shot.width=w;shot.height=h;const ctx=shot.getContext('2d');ctx.drawImage(renderer.domElement,0,0);if(caption.checked){const f=Math.max(16,Math.round(w/65));ctx.fillStyle='rgba(20,26,34,.85)';ctx.fillRect(0,h-f*2.8,w,f*2.8);ctx.fillStyle='#fff';ctx.font='600 '+f+'px system-ui';ctx.fillText(doc.name,f,h-f*1.55,w-f*2);ctx.font=Math.round(f*.75)+'px system-ui';ctx.fillText('BRICKLAB · '+doc.parts.filter(p=>!hidden.has(p.id)).length+' '+tr('деталей','parts'),f,h-f*.4,w-f*2)}shot.toBlob(blob=>{if(!blob||closed)return;const url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download='bricklab-studio.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)},'image/png')}finally{renderer.setSize(previous.x,previous.y,false);invalidate()}}
 function dispose(){if(closed)return;closed=true;if(frame)cancelAnimationFrame(frame);observer?.disconnect();orbit?.dispose();belts?.dispose();for(const o of group.children)o.userData.finish?.dispose();geometry?.dispose();material?.dispose();texture?.dispose();renderer?.dispose();dialog.remove()}
 dialog.addEventListener('close',dispose,{once:true});signal.addEventListener('abort',dispose,{once:true})
 try{
  const visible=doc.parts.filter(p=>!hidden.has(p.id));if(!visible.length||visible.some(p=>!models.has(p.design)))throw Error('missing_geometry')
  for(const p of visible){const object=partMesh(models.get(p.design),p.color??parts[p.design].color);object.position.fromArray(p.position);object.quaternion.fromArray(p.rotation);object.scale.x=p.mirrored?-1:1;group.add(object)}
  const bounds=new THREE.Box3().setFromObject(group);bounds.getCenter(center);bounds.getSize(extent)
  const map=new Map(visible.map(p=>[p.id,p]));belts=createBeltScene(world,id=>map.get(id),invalidate);belts.set((doc.belts??[]).filter(b=>map.has(b.a?.part)&&map.has(b.b?.part)))
  const c=d.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d'),g=ctx.createRadialGradient(64,64,4,64,64,62);g.addColorStop(0,'rgba(0,0,0,.5)');g.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=g;ctx.fillRect(0,0,128,128);texture=new THREE.CanvasTexture(c);geometry=new THREE.PlaneGeometry(1,1);material=new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,side:THREE.DoubleSide});shadow=new THREE.Mesh(geometry,material);shadow.rotation.x=-Math.PI/2;shadow.position.set(center.x,bounds.min.y-1,center.z);shadow.scale.set(Math.max(2,extent.x)*1.5,Math.max(2,extent.z)*1.5,1);world.add(shadow)
  renderer=new THREE.WebGLRenderer({alpha:true,antialias:true});renderer.setClearColor(0,0);viewport.append(renderer.domElement);orbit=new OrbitControls(camera,renderer.domElement);orbit.addEventListener('change',invalidate)
  d.body.append(dialog);dialog.showModal();observer=new ResizeObserver(resize);observer.observe(stage);resize();resetCamera();update()
 }catch(e){dispose();throw e}
}
