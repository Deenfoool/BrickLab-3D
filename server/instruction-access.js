import {readFile,stat} from 'node:fs/promises'
import {canUseInteractive,instructionProduct} from '../src/menu/commerce-catalog.js'
import {canonicalInstructionUrl} from '../src/sets/instruction-url.js'

// The private audit file is never in a served directory or in Git.
// Format: { "set-number": { "pdf-id": [ { "step": 0, "regions": [] }, ... ] } }
// Optional set-level metadata: { title, partCount, complete }; complete is an operator audit of all volumes.
// The array is ordered by PDF page (index 0 = page 1). Step 0 is front matter.
function bookId(book){
 const canonical=canonicalInstructionUrl(book)
 return canonical?new URL(canonical).pathname.match(/\/(\d+)\.pdf$/)?.[1]??null:null
}
export function createInstructionPolicy(audit={}){
 const books=new Map(),products=[]
 for(const [set,volumes] of Object.entries(audit)){
  if(!/^\d{3,7}-\d{1,2}$/.test(set)||!volumes||typeof volumes!=='object'||Array.isArray(volumes))throw Error('invalid_audited_set')
  const metadata=volumes.metadata;
  const entries=Object.entries(volumes).filter(([id])=>id!=='metadata');
  if(metadata!==undefined){
   if(!metadata||typeof metadata!=='object'||Array.isArray(metadata)||typeof metadata.complete!=='boolean'||!Number.isSafeInteger(metadata.partCount)||metadata.partCount<1||typeof metadata.title!=='string'||!metadata.title.trim())throw Error('invalid_instruction_metadata');
   const product=instructionProduct(set,metadata.title,metadata.partCount);
   if(metadata.complete&&product&&entries.length&&entries.some(([,pages])=>Array.isArray(pages)&&pages.some(p=>p?.regions?.length>0)))products.push(product);
  }
  for(const [id,pages] of entries){
   if(!/^\d{1,12}$/.test(id)||!Array.isArray(pages)||!pages.length||pages.length>5000)throw Error('invalid_audited_book')
   for(const p of pages){
    if(!p||!Number.isInteger(p.step)||p.step<0||!Array.isArray(p.regions)||p.regions.length>1000)throw Error('invalid_audited_page')
    for(const region of p.regions){
     if(!Array.isArray(region)||region.length<5||region.length>7||!region.slice(0,4).every(n=>Number.isFinite(n)&&n>=0&&n<=10000)||typeof region[4]!=='string'||region[4].length>80)throw Error('invalid_audited_region')
    }
   }
   books.set(set+'/'+id,pages)
  }
 }
 return {
  count:books.size,
  products:Object.freeze(products),
  access({setId,book,page,account=null,release=false}){
   const pages=books.get(setId+'/'+bookId(book)),supported=!!pages
   const entry=pages?.[page-1],step=entry?.step??null
   // A known audited book with an out-of-range page is not a free bypass.
   const interactive=!release||!supported||!!entry&&(step===0||canUseInteractive({account,setId,step,beta:false,supported:true}))
   return {mode:release?'release':'beta',supported,step,interactive}
  },
  regions(setId,pdfId,page){return books.get(setId+'/'+pdfId)?.[page-1]?.regions??null}
 }
}
const empty=createInstructionPolicy()
export function instructionAccess(args){return empty.access(args)}
export async function loadInstructionPolicy(path){
 if(!path)return empty
 if(!(await stat(path)).isFile()||(await stat(path)).size>32*1024*1024)throw Error('invalid_private_audit_file')
 return createInstructionPolicy(JSON.parse(await readFile(path,'utf8')))
}
