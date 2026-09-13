import { buildJpegPdf } from './pdf-binary-v1.js?v=instructions-20260913-v1'
import { InstructionSceneRenderer } from './render-v1.js?v=instructions-20260913-v1'

export const INSTRUCTION_PDF_VERSION='instruction-pdf-v1.0.0'
const PAGE_W=1240,PAGE_H=1754
const FONT='Inter, Segoe UI, Arial, sans-serif'

function page(){const canvas=document.createElement('canvas');canvas.width=PAGE_W;canvas.height=PAGE_H;const ctx=canvas.getContext('2d');ctx.fillStyle='#f7f8f7';ctx.fillRect(0,0,PAGE_W,PAGE_H);return{canvas,ctx}}
function colorHex(value){return value==null?'—':`#${Number(value).toString(16).padStart(6,'0').slice(-6).toUpperCase()}`}
function title(ctx,text,x,y,size=50){ctx.fillStyle='#111719';ctx.font=`800 ${size}px ${FONT}`;ctx.fillText(text,x,y)}
function small(ctx,text,x,y,size=18,color='#637078'){ctx.fillStyle=color;ctx.font=`700 ${size}px ${FONT}`;ctx.fillText(text,x,y)}
function wrap(ctx,text,x,y,maxWidth,lineHeight,maxLines=8){const words=String(text??'').split(/\s+/);let line='',lines=0;for(const word of words){const next=line?`${line} ${word}`:word;if(ctx.measureText(next).width>maxWidth&&line){ctx.fillText(line,x,y+lines*lineHeight);line=word;lines++;if(lines>=maxLines)return}else line=next}if(line&&lines<maxLines)ctx.fillText(line,x,y+lines*lineHeight)}
function footer(ctx,index,total){ctx.strokeStyle='#d9dfdc';ctx.beginPath();ctx.moveTo(64,PAGE_H-78);ctx.lineTo(PAGE_W-64,PAGE_H-78);ctx.stroke();small(ctx,'BRICKLAB 3D · BUILD INSTRUCTIONS',64,PAGE_H-42,15,'#7a8680');small(ctx,`${index} / ${total}`,PAGE_W-135,PAGE_H-42,15,'#7a8680')}
function imageCard(ctx,image,x,y,w,h){ctx.fillStyle='#eef1ef';ctx.fillRect(x,y,w,h);const scale=Math.min(w/image.width,h/image.height),dw=image.width*scale,dh=image.height*scale;ctx.drawImage(image,x+(w-dw)/2,y+(h-dh)/2,dw,dh)}
function badge(ctx,text,x,y,color='#236b48'){ctx.font=`800 17px ${FONT}`;const width=ctx.measureText(text).width+30;ctx.fillStyle=color;ctx.fillRect(x,y,width,32);ctx.fillStyle='#fff';ctx.fillText(text,x+15,y+22);return width}
function callout(ctx,row,x,y){ctx.fillStyle='#fff';ctx.strokeStyle='#d5dcda';ctx.lineWidth=2;ctx.beginPath();ctx.roundRect(x,y,490,92,12);ctx.fill();ctx.stroke();ctx.fillStyle=colorHex(row.color)==='—'?'#ddd':colorHex(row.color);ctx.fillRect(x+18,y+20,48,48);ctx.strokeStyle='#aeb8b4';ctx.strokeRect(x+18,y+20,48,48);ctx.fillStyle='#172022';ctx.font=`800 21px ${FONT}`;ctx.fillText(`${row.designId} × ${row.quantity}`,x+84,y+35);ctx.font=`600 16px ${FONT}`;ctx.fillStyle='#657178';ctx.fillText(String(row.name).slice(0,46),x+84,y+62)}
async function jpegPage(canvas){const blob=await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('JPEG encoding failed')),'image/jpeg',.91));return{width:canvas.width,height:canvas.height,jpegBytes:new Uint8Array(await blob.arrayBuffer())}}
const yieldFrame=()=>new Promise(resolve=>requestAnimationFrame(()=>resolve()))

export async function generateInstructionPdf({manifest,project,subsystems=globalThis.BrickLabSubsystems,onProgress=()=>{},signal=null}={}){
  if(!manifest?.plan||!project)throw new Error('Instruction manifest/project missing')
  const renderer=new InstructionSceneRenderer({subsystems,width:1040,height:660})
  const plan=manifest.plan,bom=manifest.bom,allIds=(project.parts??[]).map(part=>part.instanceId),check=()=>{if(signal?.aborted)throw new DOMException('Instruction PDF generation aborted','AbortError')}
  const rowsPerPage=18,inventoryPages=Math.max(1,Math.ceil(bom.length/rowsPerPage)),totalPages=1+plan.steps.length+1+inventoryPages,jpeg=[]
  let pageNumber=0
  const pushPage=async canvas=>{check();footer(canvas.getContext('2d'),++pageNumber,totalPages);jpeg.push(await jpegPage(canvas));canvas.width=1;canvas.height=1}
  try{
    onProgress({phase:'cover',current:0,total:plan.steps.length})
    const hero=renderer.render({project,includedIds:allIds,newIds:[],insertions:[],exploded:false})
    {const {canvas,ctx}=page();small(ctx,'BRICKLAB 3D',72,92,20,'#24724d');title(ctx,manifest.project.name,72,166,58);small(ctx,`${manifest.project.partCount} PARTS · ${manifest.project.connectionCount} CONNECTIONS · ${plan.steps.length} STEPS`,72,210,17);imageCard(ctx,hero.canvas,72,278,PAGE_W-144,730);ctx.fillStyle='#172022';ctx.font=`700 25px ${FONT}`;ctx.fillText('Digital build manual',72,1080);ctx.font=`500 19px ${FONT}`;ctx.fillStyle='#657178';wrap(ctx,'Generated locally from the current BrickLab project, its real placed parts and authoritative connection graph.',72,1122,PAGE_W-144,31,4);if(hero.missing.length)small(ctx,`${hero.missing.length} live visuals unavailable in cover render`,72,1260,16,'#a86732');await pushPage(canvas)}
    const assembled=[]
    for(let i=0;i<plan.steps.length;i++){
      check();const step=plan.steps[i];assembled.push(...step.instanceIds);onProgress({phase:'steps',current:i+1,total:plan.steps.length,step})
      const render=renderer.render({project,includedIds:[...assembled],newIds:step.instanceIds,insertions:step.insertions??[step.insertion],exploded:true})
      const {canvas,ctx}=page();small(ctx,step.subassembly?`SUBASSEMBLY ${step.phase}`:'BUILD',72,78,18,step.subassembly?'#6a55a1':'#24724d');title(ctx,`STEP ${step.index}`,72,142,48);let bx=260;bx+=badge(ctx,step.confidence.toUpperCase(),bx,108,step.confidence==='verified'?'#24724d':step.confidence==='inferred'?'#8b6a22':'#9b4b38')+10;if(step.paired)badge(ctx,'PAIR',bx,108,'#3c668c');imageCard(ctx,render.canvas,72,205,PAGE_W-144,785);small(ctx,`${step.assembledCount} / ${plan.partCount} parts assembled`,72,1028,17);small(ctx,`Insertion: ${step.insertion?.source??'unknown'}`,720,1028,17);ctx.fillStyle='#172022';ctx.font=`800 22px ${FONT}`;ctx.fillText('NEW PARTS',72,1090);step.callouts.slice(0,5).forEach((row,index)=>callout(ctx,row,72+(index%2)*520,1120+Math.floor(index/2)*108));if(render.missing.length)small(ctx,`Render warning: ${render.missing.length} live visual(s) unavailable.`,72,1485,16,'#a86732');await pushPage(canvas);await yieldFrame()
    }
    check();onProgress({phase:'final',current:plan.steps.length,total:plan.steps.length})
    const finalRender=renderer.render({project,includedIds:allIds,newIds:[],insertions:[],exploded:false})
    {const {canvas,ctx}=page();small(ctx,'COMPLETED MODEL',72,78,18,'#24724d');title(ctx,manifest.project.name,72,142,48);imageCard(ctx,finalRender.canvas,72,220,PAGE_W-144,880);ctx.fillStyle='#172022';ctx.font=`800 22px ${FONT}`;ctx.fillText('ASSEMBLY SUMMARY',72,1165);small(ctx,`${plan.partCount} parts · ${plan.connectionCount} connections · ${plan.componentCount} connected component(s)`,72,1210,18);small(ctx,`${plan.warnings.length} planning warning(s) recorded in the instruction manifest`,72,1245,18,plan.warnings.length?'#936436':'#657178');await pushPage(canvas)}
    for(let pageIndex=0;pageIndex<inventoryPages;pageIndex++){
      check();onProgress({phase:'bom',current:pageIndex+1,total:inventoryPages});const {canvas,ctx}=page();small(ctx,'INVENTORY',72,78,18,'#24724d');title(ctx,'Bill of Materials',72,142,48);const rows=bom.slice(pageIndex*rowsPerPage,(pageIndex+1)*rowsPerPage);let y=220
      ctx.font=`800 16px ${FONT}`;ctx.fillStyle='#657178';ctx.fillText('COLOR',72,y);ctx.fillText('DESIGN ID',145,y);ctx.fillText('PART',345,y);ctx.fillText('QTY',1080,y);y+=28
      for(const row of rows){ctx.strokeStyle='#dde2df';ctx.beginPath();ctx.moveTo(72,y);ctx.lineTo(PAGE_W-72,y);ctx.stroke();ctx.fillStyle=row.color==null?'#ddd':colorHex(row.color);ctx.fillRect(74,y+18,38,38);ctx.strokeStyle='#adb7b2';ctx.strokeRect(74,y+18,38,38);ctx.fillStyle='#172022';ctx.font=`800 19px ${FONT}`;ctx.fillText(String(row.designId),145,y+43);ctx.font=`600 17px ${FONT}`;ctx.fillText(String(row.name).slice(0,62),345,y+43);ctx.font=`800 20px ${FONT}`;ctx.fillText(String(row.quantity),1080,y+43);ctx.font=`500 13px ${FONT}`;ctx.fillStyle='#7a8680';ctx.fillText(`${row.source}${row.mechanicalCategory?` · ${row.mechanicalCategory}`:''}`,345,y+65);y+=76}await pushPage(canvas);await yieldFrame()
    }
    onProgress({phase:'encode',current:pageNumber,total:totalPages})
    const bytes=buildJpegPdf(jpeg);onProgress({phase:'done',current:totalPages,total:totalPages});return new Blob([bytes],{type:'application/pdf'})
  }finally{renderer.dispose()}
}
