import {readFile} from 'node:fs/promises'
import {join} from 'node:path'
export function createInstructionRegions(directory){
 let indexPromise;const cache=new Map()
 const read=name=>readFile(join(directory,name),'utf8').then(JSON.parse)
 return async(setId,pdfId,page)=>{
  indexPromise??=read('instruction-part-index.json').catch(error=>{indexPromise=null;throw error})
  const index=await indexPromise,key=setId+'/'+pdfId
  if(!Object.hasOwn(index,key))return []
  const filename=index[key]
  if(typeof filename!=='string'||!/^\d+(?:-\d+)?-parts-by-page\.json$/.test(filename))return []
  if(!cache.has(filename)){cache.set(filename,read(filename).catch(error=>{cache.delete(filename);throw error}));if(cache.size>8)cache.delete(cache.keys().next().value)}
  const data=await cache.get(filename)
  return Array.isArray(data[page])?data[page]:[]
 }
}
