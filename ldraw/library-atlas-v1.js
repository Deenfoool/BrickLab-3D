export const PARTS_LIBRARY_ATLAS_VERSION='parts-library-atlas-v1.3.0'
export const PARTS_LIBRARY_ATLAS_TINT=Object.freeze({r:255,g:255,b:154})
const MANIFEST_URL=new URL('./previews-v1/manifest.json.gz?v=ldraw-atlas-20260915-v1',import.meta.url)
const ASSET_VERSION='ldraw-atlas-20260915-v1'
const DISPLAY_VERSION='ldraw-atlas-display-20260915-v5'
const DISPLAY_STYLE_ID='bricklab-atlas-display-v5'

// Keep the already-correct 180deg sprite orientation. Atlas pages are recoloured once
// per browser session before cards receive them: the brightest source pixel maps to
// rgb(255,255,154), while darker pixels scale that colour down to retain molded detail,
// antialiasing and lighting. Alpha is preserved exactly.
function installDisplayStyle(){
  if(!globalThis.document||document.getElementById(DISPLAY_STYLE_ID))return
  const style=document.createElement('style')
  style.id=DISPLAY_STYLE_ID
  style.textContent=`
.pl-atlas-image{
  transform:translate(-50%,-50%) scale(.68) rotate(180deg)!important;
  transform-origin:center!important;
  filter:drop-shadow(0 4px 4px #0006)!important;
}
.pl-large .pl-atlas-image{
  transform:translate(-50%,-50%) scale(.72) rotate(180deg)!important;
}`
  document.head.append(style)
}

function atlasUrl(entry){
  return new URL(`./previews-v1/${entry.f}/atlas-${String(entry.p).padStart(3,'0')}.webp?v=${ASSET_VERSION}`,import.meta.url).href
}

function tintSupported(){
  return typeof globalThis.createImageBitmap==='function'
    && typeof globalThis.URL?.createObjectURL==='function'
    && (typeof globalThis.OffscreenCanvas==='function'||Boolean(globalThis.document?.createElement))
}

function makeCanvas(width,height){
  if(typeof globalThis.OffscreenCanvas==='function')return new OffscreenCanvas(width,height)
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;return canvas
}

async function canvasBlob(canvas){
  if(typeof canvas.convertToBlob==='function')return canvas.convertToBlob({type:'image/webp',quality:.94})
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('Atlas tint encoding failed')),'image/webp',.94))
}

function tintPixels(imageData){
  const data=imageData.data,b=PARTS_LIBRARY_ATLAS_TINT.b
  for(let i=0;i<data.length;i+=4){
    if(data[i+3]===0)continue
    // max(R,G,B) preserves the source intensity even when the broken atlas is strongly
    // biased toward one colour channel. Full-intensity pixels become exactly 255/255/154.
    const level=Math.max(data[i],data[i+1],data[i+2])
    data[i]=level
    data[i+1]=level
    data[i+2]=Math.round(level*b/255)
  }
  return imageData
}

export function createPartsLibraryAtlasService({fetchImpl=globalThis.fetch}={}){
  installDisplayStyle()
  let manifest=null,pending=null,error=null
  const tintedPages=new Map(),pagePending=new Map()
  const load=()=>{
    if(manifest||error)return Promise.resolve(manifest)
    if(!pending)pending=Promise.resolve(fetchImpl(MANIFEST_URL,{cache:'force-cache'})).then(response=>{
      if(!response.ok)throw Error(`Atlas manifest HTTP ${response.status}`)
      if(typeof DecompressionStream!=='function')throw Error('Atlas manifest decompression is unavailable')
      return new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).json()
    }).then(data=>{
      if(data?.version!==1||!data.parts)throw Error('Unsupported atlas manifest')
      manifest=data
      return data
    }).catch(reason=>{
      error=reason
      console.warn('[BrickLab Library] Preview atlas unavailable.',reason)
      return null
    })
    return pending
  }
  const tintPage=sourceUrl=>{
    if(tintedPages.has(sourceUrl))return Promise.resolve(tintedPages.get(sourceUrl))
    if(pagePending.has(sourceUrl))return pagePending.get(sourceUrl)
    if(!tintSupported()){tintedPages.set(sourceUrl,sourceUrl);return Promise.resolve(sourceUrl)}
    const work=Promise.resolve(fetchImpl(sourceUrl,{cache:'force-cache'})).then(async response=>{
      if(!response.ok)throw Error(`Atlas page HTTP ${response.status}`)
      const bitmap=await createImageBitmap(await response.blob())
      try{
        const canvas=makeCanvas(bitmap.width,bitmap.height),ctx=canvas.getContext('2d',{willReadFrequently:true})
        if(!ctx)throw Error('Atlas tint canvas unavailable')
        ctx.clearRect(0,0,bitmap.width,bitmap.height);ctx.drawImage(bitmap,0,0)
        const pixels=tintPixels(ctx.getImageData(0,0,bitmap.width,bitmap.height))
        ctx.putImageData(pixels,0,0)
        const url=URL.createObjectURL(await canvasBlob(canvas))
        tintedPages.set(sourceUrl,url)
        return url
      }finally{bitmap.close?.()}
    }).catch(reason=>{
      console.warn('[BrickLab Library] Atlas tint unavailable; using source page.',reason)
      tintedPages.set(sourceUrl,sourceUrl)
      return sourceUrl
    }).finally(()=>pagePending.delete(sourceUrl))
    pagePending.set(sourceUrl,work)
    return work
  }
  const descriptor=(item,data=manifest,resolvedUrl=null)=>{
    const entry=data?.parts?.[item?.key]
    if(!entry)return null
    const sourceUrl=atlasUrl(entry),url=resolvedUrl||tintedPages.get(sourceUrl)
    if(!url)return null
    return Object.freeze({
      url,x:entry.x,y:entry.y,w:entry.w,h:entry.h,page:data.page||2048,
      displayVersion:DISPLAY_VERSION,tint:[255,255,154],
    })
  }
  return Object.freeze({
    version:PARTS_LIBRARY_ATLAS_VERSION,
    peek:item=>descriptor(item),
    request:async item=>{
      const data=await load(),entry=data?.parts?.[item?.key]
      if(!entry)return null
      return descriptor(item,data,await tintPage(atlasUrl(entry)))
    },
    status:()=>Object.freeze({
      ready:Boolean(manifest),loading:Boolean(pending&&!manifest&&!error),failed:Boolean(error),
      parts:Object.keys(manifest?.parts||{}).length,displayVersion:DISPLAY_VERSION,
      colorMode:'tint',tint:[255,255,154],rotation:180,tintedPages:tintedPages.size,
    }),
  })
}
