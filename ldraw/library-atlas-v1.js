export const PARTS_LIBRARY_ATLAS_VERSION='parts-library-atlas-v1.2.0'
const MANIFEST_URL=new URL('./previews-v1/manifest.json.gz?v=ldraw-atlas-20260915-v1',import.meta.url)
const ASSET_VERSION='ldraw-atlas-20260915-v1'
const DISPLAY_VERSION='ldraw-atlas-display-20260915-v4'
const DISPLAY_STYLE_ID='bricklab-atlas-display-v4'

// Atlas WebPs are already rendered with the intended neutral material and lighting.
// Preserve those pixels exactly. Orientation is corrected on the cropped sprite only,
// so the browser can use the static atlas directly without a 2048x2048 canvas decode,
// recolour pass or WebP re-encode.
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

export function createPartsLibraryAtlasService({fetchImpl=globalThis.fetch}={}){
  installDisplayStyle()
  let manifest=null,pending=null,error=null
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
  const descriptor=(item,data=manifest)=>{
    const entry=data?.parts?.[item?.key]
    if(!entry)return null
    return Object.freeze({
      url:atlasUrl(entry),
      x:entry.x,
      y:entry.y,
      w:entry.w,
      h:entry.h,
      page:data.page||2048,
      displayVersion:DISPLAY_VERSION,
    })
  }
  return Object.freeze({
    version:PARTS_LIBRARY_ATLAS_VERSION,
    peek:item=>descriptor(item),
    request:async item=>descriptor(item,await load()),
    status:()=>Object.freeze({
      ready:Boolean(manifest),
      loading:Boolean(pending&&!manifest&&!error),
      failed:Boolean(error),
      parts:Object.keys(manifest?.parts||{}).length,
      displayVersion:DISPLAY_VERSION,
      colorMode:'source',
      rotation:180,
    }),
  })
}
