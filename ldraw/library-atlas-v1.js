export const PARTS_LIBRARY_ATLAS_VERSION='parts-library-atlas-v1.1.0'
const MANIFEST_URL=new URL('./previews-v1/manifest.json.gz?v=ldraw-atlas-20260915-v1',import.meta.url)
const ASSET_VERSION='ldraw-atlas-20260915-v1'
const DISPLAY_VERSION='ldraw-atlas-display-20260915-v3'
const NEUTRAL_FILTER='grayscale(1) brightness(2.15) contrast(.88)'

function atlasUrl(entry){
  return new URL(`./previews-v1/${entry.f}/atlas-${String(entry.p).padStart(3,'0')}.webp?v=${ASSET_VERSION}`,import.meta.url).href
}

async function decodeImage(blob){
  if(typeof globalThis.createImageBitmap==='function')return globalThis.createImageBitmap(blob)
  if(typeof globalThis.Image!=='function'||typeof globalThis.URL?.createObjectURL!=='function')throw Error('Atlas image decoding is unavailable')
  const objectUrl=globalThis.URL.createObjectURL(blob)
  try{
    return await new Promise((resolve,reject)=>{
      const image=new globalThis.Image()
      image.onload=()=>resolve(image)
      image.onerror=()=>reject(Error('Atlas image decode failed'))
      image.src=objectUrl
    })
  }finally{globalThis.URL.revokeObjectURL(objectUrl)}
}

function createCanvas(width,height){
  if(typeof globalThis.OffscreenCanvas==='function')return new globalThis.OffscreenCanvas(width,height)
  const canvas=globalThis.document?.createElement?.('canvas')
  if(!canvas)throw Error('Atlas canvas is unavailable')
  canvas.width=width;canvas.height=height
  return canvas
}

function neutralizePixels(ctx,width,height){
  const image=ctx.getImageData(0,0,width,height),data=image.data
  for(let i=0;i<data.length;i+=4){
    if(data[i+3]===0)continue
    const luma=.2126*data[i]+.7152*data[i+1]+.0722*data[i+2]
    const bright=luma*2.15
    const neutral=Math.max(0,Math.min(255,Math.round((bright-128)*.88+128)))
    data[i]=neutral;data[i+1]=neutral;data[i+2]=neutral
  }
  ctx.putImageData(image,0,0)
}

async function canvasBlob(canvas){
  if(typeof canvas.convertToBlob==='function')return canvas.convertToBlob({type:'image/webp',quality:.9})
  if(typeof canvas.toBlob!=='function')throw Error('Atlas WebP encoding is unavailable')
  const webp=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.9))
  if(webp)return webp
  const png=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'))
  if(!png)throw Error('Atlas image encoding failed')
  return png
}

async function normalizeAtlasPage(url,fetchImpl){
  const response=await fetchImpl(url,{cache:'force-cache'})
  if(!response.ok)throw Error(`Atlas page HTTP ${response.status}`)
  const image=await decodeImage(await response.blob())
  const width=image.width||image.naturalWidth,height=image.height||image.naturalHeight
  if(!width||!height)throw Error('Atlas page has invalid dimensions')
  const canvas=createCanvas(width,height),ctx=canvas.getContext('2d',{willReadFrequently:true})
  if(!ctx)throw Error('Atlas 2D context is unavailable')
  ctx.save();ctx.translate(width,height);ctx.rotate(Math.PI)
  if('filter'in ctx)ctx.filter=NEUTRAL_FILTER
  ctx.drawImage(image,0,0,width,height);ctx.restore()
  image.close?.()
  if(!('filter'in ctx))neutralizePixels(ctx,width,height)
  const blob=await canvasBlob(canvas)
  if(typeof globalThis.URL?.createObjectURL!=='function')throw Error('Atlas object URLs are unavailable')
  return Object.freeze({url:globalThis.URL.createObjectURL(blob),width,height,bytes:blob.size})
}

export function createPartsLibraryAtlasService({fetchImpl=globalThis.fetch}={}){
  let manifest=null,pending=null,error=null
  const pages=new Map(),pagePending=new Map(),pageErrors=new Map()
  const load=()=>{
    if(manifest||error)return Promise.resolve(manifest)
    if(!pending)pending=Promise.resolve(fetchImpl(MANIFEST_URL,{cache:'force-cache'})).then(response=>{
      if(!response.ok)throw Error(`Atlas manifest HTTP ${response.status}`)
      if(typeof DecompressionStream!=='function')throw Error('Atlas manifest decompression is unavailable')
      return new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).json()
    }).then(data=>{if(data?.version!==1||!data.parts)throw Error('Unsupported atlas manifest');manifest=data;return data})
      .catch(reason=>{error=reason;console.warn('[BrickLab Library] Preview atlas unavailable.',reason);return null})
    return pending
  }
  const entryFor=(item,data=manifest)=>data?.parts?.[item?.key]||null
  const pageKey=entry=>`${entry.f}:${entry.p}`
  const descriptor=(entry,page)=>{
    if(!entry||!page)return null
    return Object.freeze({
      url:page.url,
      x:page.width-entry.x-entry.w,
      y:page.height-entry.y-entry.h,
      w:entry.w,h:entry.h,
      page:page.width,
      displayVersion:DISPLAY_VERSION,
    })
  }
  const ensurePage=async entry=>{
    const key=pageKey(entry)
    if(pages.has(key))return pages.get(key)
    if(pageErrors.has(key))return null
    if(!pagePending.has(key))pagePending.set(key,normalizeAtlasPage(atlasUrl(entry),fetchImpl).then(page=>{
      pages.set(key,page);pagePending.delete(key);return page
    }).catch(reason=>{
      pagePending.delete(key);pageErrors.set(key,reason)
      console.warn(`[BrickLab Library] Atlas page ${key} could not be normalized.`,reason)
      return null
    }))
    return pagePending.get(key)
  }
  return Object.freeze({
    version:PARTS_LIBRARY_ATLAS_VERSION,
    peek(item){const entry=entryFor(item);return entry?descriptor(entry,pages.get(pageKey(entry))):null},
    async request(item){const data=await load(),entry=entryFor(item,data);return entry?descriptor(entry,await ensurePage(entry)):null},
    status:()=>Object.freeze({ready:Boolean(manifest),loading:Boolean(pending&&!manifest&&!error),failed:Boolean(error),parts:Object.keys(manifest?.parts||{}).length,pagesReady:pages.size,pagesLoading:pagePending.size,pagesFailed:pageErrors.size,displayVersion:DISPLAY_VERSION}),
  })
}
