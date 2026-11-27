
import * as THREE from 'three'
export const LAB_SKIES=Object.freeze({
 studio:null,
 day:Object.freeze({file:'day.png',fog:0xb8d7e6,ground:0x9bb394,land:0x78966d,accent:0x96ad84}),
 sunset:Object.freeze({file:'sunset.png',fog:0xb9a2c9,ground:0x81769b,land:0x807b9f,accent:0xa18ca9}),
 night:Object.freeze({file:'night.png',fog:0x333756,ground:0x323d56,land:0x495470,accent:0x626e87})
})
export function labSky(name){return Object.hasOwn(LAB_SKIES,name)?LAB_SKIES[name]:null}
// A small number of instanced decorative blocks, not assembly parts or colliders.
// They stay beyond the building grid; the panorama itself remains infinitely distant.
export function createLabHorizon(){
 const group=new THREE.Group(),geometries=[],materials=[];
 const mat=(color)=>{const m=new THREE.MeshBasicMaterial({color});materials.push(m);return m};
 const box=new THREE.BoxGeometry(1,1,1),stud=new THREE.CylinderGeometry(1,1,1,8);
 geometries.push(box,stud);
 const land=mat(0x78966d),accent=mat(0x96ad84),baseMat=mat(0x9bb394);
 const ground=new THREE.Mesh(new THREE.PlaneGeometry(20000,20000),baseMat);
 geometries.push(ground.geometry);ground.rotation.x=-Math.PI/2;ground.position.y=-6;group.add(ground);
 const platform=new THREE.Mesh(new THREE.BoxGeometry(1600,12,1600),mat(0x929ca6));
 geometries.push(platform.geometry);platform.position.y=-6.5;group.add(platform);
 const blocks=[],tops=[],dummy=new THREE.Object3D();
 for(let i=0;i<80;i++){
  const a=i/80*Math.PI*2,r=3650+350*Math.sin(a*5+1),h=Math.max(1,Math.round(3+2*Math.sin(a*4)+1.4*Math.cos(a*9)));
  for(let j=0;j<h;j++){const w=310-j*30;blocks.push([Math.cos(a)*r,j*85+38,Math.sin(a)*r,w,85,430-j*38,-a]);}
  const top=(h-1)*85+38+42.5;
  for(const d of [-64,64])tops.push([Math.cos(a)*r+Math.sin(a)*d,top+15,Math.sin(a)*r-Math.cos(a)*d,36,30,36,-a]);
 }
 function instanced(geometry,material,items){
  const mesh=new THREE.InstancedMesh(geometry,material,items.length);
  for(let i=0;i<items.length;i++){const [x,y,z,sx,sy,sz,ry]=items[i];dummy.position.set(x,y,z);dummy.scale.set(sx,sy,sz);dummy.rotation.set(0,ry,0);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);}
  mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();group.add(mesh);
 }
 instanced(box,land,blocks);instanced(stud,accent,tops);
 group.visible=false;
 return {group,apply(preset){land.color.setHex(preset.land);accent.color.setHex(preset.accent);baseMat.color.setHex(preset.ground)},dispose(){for(const o of group.children)if(o.isInstancedMesh)o.dispose();for(const g of geometries)g.dispose();for(const m of materials)m.dispose();group.removeFromParent()}};
}
