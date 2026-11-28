import {Matrix4,Quaternion,Vector3} from 'three'
import {currentActuatorSpec,actuatorPhase} from '../mechanics/actuators.js'
export function inventoryCsv(build,catalog){
 const counts=new Map()
 for(const p of build.parts){const c=p.color??catalog[p.design]?.color??'',k=JSON.stringify([p.design,c]);counts.set(k,(counts.get(k)??0)+1)}
 const quote=v=>'"'+String(v??'').replaceAll('"','""')+'"'
 return '\ufeff'+['Design,Color,Quantity',...[...counts].map(([k,n])=>[...JSON.parse(k),n].map(quote).join(','))].join('\r\n')
}
export function ldrawText(build,catalog){
 const clean=v=>String(v??'').replace(/[\r\n]/g,' '),lines=['0 '+clean(build.name),'0 Name: '+clean(build.name)+'.ldr']
 for(const p of build.parts){if(!/^[a-z0-9_-]+$/i.test(p.design)||!Array.isArray(p.position)||!Array.isArray(p.rotation))continue
  const color=p.color??catalog[p.design]?.color??'#a0a5a9',code=/^#[0-9a-f]{6}$/i.test(color)?'0x2'+color.slice(1).toUpperCase():'16'
  const world=new Matrix4().makeRotationX(Math.PI).multiply(new Matrix4().compose(new Vector3(...p.position),new Quaternion(...p.rotation).normalize(),new Vector3(p.mirrored?-1:1,1,1)))
  const emit=(design,c,local=new Matrix4())=>{
   const m=world.clone().multiply(local).elements
   const values=[m[12],m[13],m[14],m[0],m[4],m[8],m[1],m[5],m[9],m[2],m[6],m[10]].map(v=>Math.round(v*1e6)/1e6)
   lines.push('1 '+c+' '+values.join(' ')+' '+design+'.dat')
  }
  const spec=currentActuatorSpec(p),phase=actuatorPhase(p)
  if(spec&&(p.actuatorExtension!==undefined||p.actuatorInputPhase!==undefined)){
   const type2=p.design.startsWith('43097')
   if((spec.initial===0||spec.initial===spec.stroke)&&Math.abs(phase)<1e-8)emit(p.design.replace(/-f[12]$/,'-f'+(spec.initial===0?1:2)),code)
   else{
    emit('47157',type2?'4':'25',new Matrix4().makeRotationZ(phase-Math.PI/2))
    emit(type2?'u9559c01':'62271c01',code)
    emit('62274c01','72',new Matrix4().makeTranslation(0,0,170+spec.initial))
   }
  }else emit(p.design,code)
 }
 return lines.join('\r\n')+'\r\n'
}
export function downloadText(name,text,type='text/plain'){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name.replace(/[\\/:*?"<>|\r\n]/g,'_');a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
