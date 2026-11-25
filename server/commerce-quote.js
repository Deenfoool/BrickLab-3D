import {productById,themePrices,bundlePrice,discountedPrice} from '../src/menu/commerce-catalog.js'
import {ProjectError} from './projects.js'
// Inputs are loaded by the server inside the user's serialized transaction,
// never from the request. Instructions are not for sale until separately audited.
export function commerceQuote(sku,account,badgePayments=[],{beta=true}={}){
 let product=productById(sku)
 if(!product&&Object.hasOwn(themePrices,sku))product={id:sku,kind:'theme',title:'BrickLab · '+sku,priceKopecks:themePrices[sku]}
 if(!product||product.betaOnly&&!beta)throw new ProjectError(404,'unknown_product')
 let amount=product.priceKopecks
 if(product.kind==='theme'&&account.themes.includes(sku)||product.kind==='badge'&&account.badges.includes(sku))throw new ProjectError(409,'already_owned')
 if(product.kind==='themeBundle')amount=bundlePrice(account.themes)
 if(product.kind==='badge'&&product.rank){
  const eligible=account.badges.map(productById).filter(p=>p?.rank&&p.rank<product.rank)
  const limit=Math.max(0,...eligible.map(p=>p.priceKopecks)),ids=new Set(eligible.map(p=>p.id))
  const actual=badgePayments.filter(p=>ids.has(p.sku)&&Number.isSafeInteger(p.amountKopecks)&&p.amountKopecks>0).reduce((sum,p)=>sum+p.amountKopecks,0)
  amount-=Math.min(limit,actual)
 }
 if(product.kind!=='subscription')amount=discountedPrice(amount,account.plus)
 if(amount<=0)throw new ProjectError(409,'already_owned')
 return {sku,title:product.title,amountKopecks:amount}
}
