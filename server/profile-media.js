import {spawn} from 'node:child_process'
import {ProjectError} from './projects.js'
export const mediaLimits={avatar:2*1024*1024,cover:5*1024*1024,publication:512*1024}
export const backgrounds=[
 {id:'default',source:'free',priceRub:0},
 {id:'first-build',source:'achievement',priceRub:0},
 {id:'carbon',source:'purchase',priceRub:99},
 {id:'neon',source:'purchase',priceRub:149}
]
export function backgroundInventory(awards,entitlements){
 return backgrounds.map(b=>({...b,owned:b.source==='free'||(b.source==='achievement'&&awards.some(a=>a.award==='firstCloudSave'))||entitlements.some(e=>e.item===b.id),purchaseEnabled:false}))
}
export function imageFormat(bytes,mime){
 const png=bytes.length>=8&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
 const jpg=bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255
 const webp=bytes.length>=12&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'
 const f=png?'png':jpg?'jpeg':webp?'webp':null
 if(!f||mime!=='image/'+f)throw new ProjectError(400,'invalid_image')
 return f
}
export async function normalizeImage(bytes,mime,kind){
 if(!Object.hasOwn(mediaLimits,kind))throw new ProjectError(400,'invalid_image')
 if(bytes.length>mediaLimits[kind])throw new ProjectError(413,'body_too_large')
 const format=imageFormat(bytes,mime),size=kind==='avatar'?'512x512':kind==='publication'?'1200x900':'1600x400'
 return new Promise((resolve,reject)=>{
  const child=spawn('convert',['-limit','thread','1','-limit','memory','96MiB','-limit','map','96MiB','-limit','disk','0','-limit','width','6000','-limit','height','6000','-limit','area','20MP',format+':-[0]','-auto-orient','-strip','-resize',kind==='publication'?size:size+'^','-background','#191c22','-gravity','center','-extent',size,'-quality','80','webp:-'],{stdio:['pipe','pipe','ignore'],env:{...process.env,MAGICK_THREAD_LIMIT:'1'}})
  const chunks=[];let total=0,finished=false
  const fail=()=>{if(finished)return;finished=true;clearTimeout(timer);child.kill('SIGKILL');reject(new ProjectError(400,'invalid_image'))}
  const timer=setTimeout(fail,8000)
  child.on('error',fail);child.stdin.on('error',()=>{})
  child.stdout.on('data',chunk=>{total+=chunk.length;if(total>524288)fail();else chunks.push(chunk)})
  child.on('close',code=>{if(finished)return;if(code!==0||total===0)return fail();finished=true;clearTimeout(timer);resolve(Buffer.concat(chunks))})
  child.stdin.end(bytes)
 })
}
