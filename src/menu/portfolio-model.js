import {validateBlockLayout} from './portfolio-layout-model.js'
// Canonical public portfolio schema. All IDs refer to public publication UUIDs, never private projects.
export const portfolioKeys=['featured','publications','collections','awards','activity','statistics','about','followers']
export const portfolioUuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function defaultPortfolio({publicByDefault=false}={}){
 return {blocks:portfolioKeys.map(key=>({key,visible:key!=='activity'&&(publicByDefault||key!=='awards')})),featured:null,collections:[]}
}
export function validatePortfolio(value){
 const fail=()=>{throw new TypeError('invalid_portfolio')}
 if(!value||typeof value!=='object'||Array.isArray(value)||!Array.isArray(value.blocks)||value.blocks.length!==portfolioKeys.length||!Array.isArray(value.collections)||value.collections.length>6)fail()
 const seen=new Set(),blocks=value.blocks.map(b=>{
  if(!b||!portfolioKeys.includes(b.key)||seen.has(b.key)||typeof b.visible!=='boolean')fail()
  seen.add(b.key);return {key:b.key,visible:b.visible,...validateBlockLayout(b)}
 })
 if(value.featured!==null&&(typeof value.featured!=='string'||!portfolioUuid.test(value.featured)))fail()
 const collections=value.collections.map(c=>{
  if(!c||typeof c.title!=='string'||!c.title.trim()||c.title.length>60||/[\u0000-\u001f\u007f]/.test(c.title)||/[\ud800-\udfff]/u.test(c.title)||!Array.isArray(c.ids)||c.ids.length>20||c.ids.some(id=>typeof id!=='string'||!portfolioUuid.test(id)))fail()
  return {title:c.title.trim(),ids:[...new Set(c.ids.map(id=>id.toLowerCase()))]}
 })
 return {blocks,featured:value.featured?.toLowerCase()??null,collections}
}
export function readPortfolio(value){try{return validatePortfolio(value)}catch{return defaultPortfolio()}}
export function filterPortfolio(value,publicIds){
 const p=readPortfolio(value),ids=new Set(publicIds)
 return {...p,featured:ids.has(p.featured)?p.featured:null,collections:p.collections.map(c=>({...c,ids:c.ids.filter(id=>ids.has(id))}))}
}
export function calendarDays(entries,now=new Date(),days=182){
 const counts=new Map()
 for(const {day,count} of entries??[])if(/^\d{4}-\d{2}-\d{2}$/.test(day)&&Number.isSafeInteger(count)&&count>0)counts.set(day,(counts.get(day)??0)+count)
 const end=Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate())
 return Array.from({length:days},(_,i)=>{const day=new Date(end-(days-1-i)*86400000).toISOString().slice(0,10);return {day,count:counts.get(day)??0}})
}
