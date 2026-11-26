import {Matrix4,Quaternion,Vector3} from 'three'
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
  const m=new Matrix4().makeRotationX(Math.PI).multiply(new Matrix4().compose(new Vector3(...p.position),new Quaternion(...p.rotation).normalize(),new Vector3(p.mirrored?-1:1,1,1))).elements
  const values=[m[12],m[13],m[14],m[0],m[4],m[8],m[1],m[5],m[9],m[2],m[6],m[10]].map(v=>Math.round(v*1e6)/1e6)
  lines.push('1 '+code+' '+values.join(' ')+' '+p.design+'.dat')
 }
 return lines.join('\r\n')+'\r\n'
}
export function downloadText(name,text,type='text/plain'){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name.replace(/[\\/:*?"<>|\r\n]/g,'_');a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
