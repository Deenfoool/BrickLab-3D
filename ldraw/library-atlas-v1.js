export const PARTS_LIBRARY_ATLAS_VERSION='parts-library-atlas-v1.0.0'
const MANIFEST_URL=new URL('./previews-v1/manifest.json.gz?v=ldraw-atlas-20260915-v1',import.meta.url)
export function createPartsLibraryAtlasService({fetchImpl=globalThis.fetch}={}){
  let manifest=null,pending=null,error=null
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
  const descriptor=(item,data=manifest)=>{
    const entry=data?.parts?.[item?.key];if(!entry)return null
    return Object.freeze({url:new URL(`./previews-v1/${entry.f}/atlas-${String(entry.p).padStart(3,'0')}.webp?v=ldraw-atlas-20260915-v1`,import.meta.url).href,x:entry.x,y:entry.y,w:entry.w,h:entry.h,page:data.page||2048})
  }
  return Object.freeze({version:PARTS_LIBRARY_ATLAS_VERSION,peek:item=>descriptor(item),request:async item=>descriptor(item,await load()),status:()=>Object.freeze({ready:Boolean(manifest),loading:Boolean(pending&&!manifest&&!error),failed:Boolean(error),parts:Object.keys(manifest?.parts||{}).length})})
}
