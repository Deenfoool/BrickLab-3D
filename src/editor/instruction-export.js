// Minimal binary PDF with one JPEG image per A4 page. No external service.
export function instructionPdf(pages){
 if(!Array.isArray(pages)||!pages.length||pages.length>100)throw Error('invalid_pages')
 const encoder=new TextEncoder(),chunks=[],offsets=[0];let length=0
 const append=value=>{const bytes=typeof value==='string'?encoder.encode(value):value;chunks.push(bytes);length+=bytes.length}
 const object=(id,body)=>{offsets[id]=length;append(id+' 0 obj\n');for(const v of body)append(v);append('\nendobj\n')}
 append('%PDF-1.4\n')
 object(1,['<< /Type /Catalog /Pages 2 0 R >>'])
 object(2,['<< /Type /Pages /Count '+pages.length+' /Kids ['+pages.map((_,i)=>(3+i*3)+' 0 R').join(' ')+'] >>'])
 for(const [i,p] of pages.entries()){
  if(!(p.jpeg instanceof Uint8Array)||!Number.isInteger(p.width)||!Number.isInteger(p.height)||p.width<1||p.height<1||p.width>3000||p.height>3000||p.jpeg[0]!==255||p.jpeg[1]!==216)throw Error('invalid_page')
  const id=3+i*3,stream='q\n595.28 0 0 841.89 0 0 cm\n/Im0 Do\nQ\n'
  object(id,['<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im0 '+(id+1)+' 0 R >> >> /Contents '+(id+2)+' 0 R >>'])
  object(id+1,['<< /Type /XObject /Subtype /Image /Width '+p.width+' /Height '+p.height+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+p.jpeg.length+' >>\nstream\n',p.jpeg,'\nendstream'])
  object(id+2,['<< /Length '+encoder.encode(stream).length+' >>\nstream\n'+stream+'endstream'])
 }
 const xref=length;append('xref\n0 '+offsets.length+'\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size '+offsets.length+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n')
 return new Blob(chunks,{type:'application/pdf'})
}
export async function renderInstructionPage({name,index,total,note,inventory,blob,language}){
 const canvas=document.createElement('canvas');canvas.width=1240;canvas.height=1754
 const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,1240,1754);ctx.fillStyle='#172334';ctx.fillRect(0,0,1240,130);ctx.fillStyle='#ffb448';ctx.font='bold 34px sans-serif';ctx.fillText('BRICKLAB 3D',65,60);ctx.fillStyle='#fff';ctx.font='bold 30px sans-serif';ctx.fillText(String(name).slice(0,120),65,106,1110)
 const ru=language==='ru';ctx.fillStyle='#192330';ctx.font='bold 45px sans-serif';ctx.fillText((ru?'ШАГ ':'STEP ')+(index+1)+' / '+total,65,215)
 const bitmap=await createImageBitmap(blob)
 try{const scale=Math.min(1110/bitmap.width,880/bitmap.height);ctx.drawImage(bitmap,(1240-bitmap.width*scale)/2,260+(880-bitmap.height*scale)/2,bitmap.width*scale,bitmap.height*scale)}finally{bitmap.close()}
 let y=1200
 function wrapped(text,size,maxLines){ctx.font=size+'px sans-serif';let line='',count=0;for(const word of String(text).split(/\s+/)){const next=line?line+' '+word:word;if(ctx.measureText(next).width>1110&&line){ctx.fillText(line,65,y,1110);y+=size*1.35;count++;line=word;if(count>=maxLines)return}else line=next}if(line&&count<maxLines){ctx.fillText(line,65,y,1110);y+=size*1.35}}
 ctx.fillStyle='#172334';ctx.font='bold 30px sans-serif';ctx.fillText(ru?'Детали этапа':'Parts in this step',65,y);y+=47
 wrapped(inventory,22,10);y+=20
 if(note)wrapped(note,25,Math.max(1,Math.floor((1670-y)/34)))
 ctx.fillStyle='#64748b';ctx.font='20px sans-serif';ctx.fillText('bricklab-3d.ru',65,1710);ctx.fillText((index+1)+' / '+total,1100,1710)
 const jpeg=await new Promise(r=>canvas.toBlob(r,'image/jpeg',.9));if(!jpeg)throw Error('page_render')
 return {jpeg:new Uint8Array(await jpeg.arrayBuffer()),width:canvas.width,height:canvas.height}
}
