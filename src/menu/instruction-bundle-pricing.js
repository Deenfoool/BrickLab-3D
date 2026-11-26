// Server-authoritative quote for the isolated admin sandbox. No live SKU.
// A bundle is three named permanent set unlocks, never transferable credit.
import {instructionProduct} from './commerce-catalog.js'
export function quoteInstructionBundle({setIds,auditedProducts,account,release=false,sandbox=false}){
 if(!release||(!sandbox&&account?.plus===true))throw Error('bundle_unavailable')
 if(!Array.isArray(setIds)||setIds.length!==3||new Set(setIds).size!==3)throw Error('invalid_bundle')
 const owned=new Set(account?.instructions??[]),catalog=new Map((auditedProducts??[]).map(p=>[p.setId,p]))
 const lines=setIds.map(id=>{
  const audited=catalog.get(id),product=audited&&instructionProduct(id,audited.title,audited.partCount)
  if(!product||owned.has(id))throw Error('bundle_set_unavailable')
  return {setId:id,title:product.title,base:product.priceKopecks}
 }).sort((a,b)=>a.setId<b.setId?-1:a.setId>b.setId?1:0)
 const subtotal=lines.reduce((sum,l)=>sum+l.base,0),total=Math.round(subtotal*.85)
 // Largest remainder distribution makes exact line amounts sum to checkout amount.
 const allocations=lines.map(l=>({...l,amount:Math.floor(l.base*total/subtotal),remainder:(l.base*total)%subtotal}))
 let remaining=total-allocations.reduce((sum,l)=>sum+l.amount,0)
 for(const l of [...allocations].sort((a,b)=>b.remainder-a.remainder||(a.setId<b.setId?-1:a.setId>b.setId?1:0)))if(remaining>0){l.amount++;remaining--}
 return {kind:'instruction-bundle-preview',discountPercent:15,subtotalKopecks:subtotal,amountKopecks:total,lines:allocations.map(({remainder,...l})=>l)}
}
