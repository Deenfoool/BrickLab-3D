// Shared original vector insignia. Rendering only: ownership stays server-authoritative.
import {productById} from './commerce-catalog.js'
const NS='http://www.w3.org/2000/svg'
const node=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n}
const svgNode=(tag,attrs={})=>{const n=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v));return n}
const path=(d,cls)=>svgNode('path',{d,class:cls})
const specs=Object.freeze({
 supporter:{code:'01',shape:'M32 4 55 17v30L32 60 9 47V17Z',mark:'M32 19 45 26v14L32 47 19 40V26Z M19 26l13 8 13-8 M32 34v13'},
 'bronze-builder':{code:'02',shape:'M32 3 56 12v25Q53 51 32 61 11 51 8 37V12Z',mark:'M21 39h22v8H21z M17 30h30v8H17z M23 22h7v7h-7z M34 22h7v7h-7z'},
 'silver-builder':{code:'03',shape:'M32 3 59 19v26L32 61 5 45V19Z',mark:'M19 42l13-24 13 24H19z M25 32h14 M32 18v24'},
 'gold-builder':{code:'04',shape:'M32 2 42 9l13 2 3 13 4 8-4 8-3 13-13 2-10 7-10-7-13-2-3-13-4-8 4-8 3-13 13-2Z',mark:'M18 43 16 24l10 8 6-15 6 15 10-8-2 19Z M21 48h22'},
 'diamond-patron':{code:'05',shape:'M32 2 61 22 51 49 32 62 13 49 3 22Z',mark:'M20 23h24l8 12-20 19-20-19z M20 23l12 31 12-31 M12 35h40 M26 23l-6 12m18-12 6 12'},
 'founders-club':{code:'OBT',shape:'M32 2 45 8 58 8v14l4 10-4 10v14H45l-13 6-13-6H6V42L2 32l4-10V8h13Z',mark:'M32 15 36 26l12 2-9 8 3 12-10-6-10 6 3-12-9-8 12-2Z M15 51h8 M41 51h8'},
 plus:{code:'PLUS',shape:'M32 3 57 17v30L32 61 7 47V17Z',mark:'M27 17h10v10h10v10H37v10H27V37H17V27h10Z'}
})
export function insigniaSpec(id){return Object.hasOwn(specs,id)?specs[id]:null}
export function insignia(id){
 const spec=insigniaSpec(id);if(!spec)return null
 const svg=svgNode('svg',{viewBox:'0 0 64 64',class:'commerce-insignia insignia-'+id,'aria-hidden':'true',focusable:'false'})
 svg.append(path(spec.shape,'insignia-outer'),svgNode('path',{d:spec.shape,transform:'translate(5.12 5.12) scale(.84)',class:'insignia-inner'}),path('M12 18 32 7 52 18 M12 46 32 57 52 46','insignia-rim'),path(spec.mark,'insignia-glyph'))
 return svg
}
export function commerceBadge(id){
 const p=productById(id),plus=id==='plus'
 if(!plus&&p?.kind!=='badge')return null
 const badge=node('span','commerce-support-badge commerce-emblem support-'+id)
 badge.append(insignia(id),node('span','commerce-emblem-label',plus?'BrickLab Plus':p.title))
 return badge
}
export function loyaltyBadge(months,earned,language='ru'){
 const badge=node('span','commerce-loyalty-mark'+(earned?' is-earned':''))
 badge.append(insignia('plus'),node('span',null,months+(language==='ru'?' мес.':' mo.')),node('small',null,earned?(language==='ru'?'Получено':'Earned'):(language==='ru'?'Закрыто':'Locked')))
 return badge
}
export function productFacts(p,language='ru'){
 const ru=language==='ru',tr=(a,b)=>ru?a:b
 if(p.kind==='storage')return [['+'+p.slots,tr('проектов','projects')],['+'+p.storageMiB+' MiB',tr('хранилище','storage')]]
 if(p.kind==='subscription')return [['+40',tr('проектов','projects')],['+128 MiB',tr('хранилище','storage')],['40',tr('версий','revisions')],['−10%',tr('на разовые товары','on one-time items')]]
 if(p.kind==='themeBundle')return [['6',tr('тем оформления','profile themes')],['∞',tr('без подписки','no subscription')]]
 return []
}
export function planSaving(p){
 const monthly=productById('plus-1')?.priceKopecks
 if(p?.kind!=='subscription'||!Number.isInteger(p.months)||p.months<=1||!monthly)return 0
 return Math.max(0,Math.floor(100*(monthly*p.months-p.priceKopecks)/(monthly*p.months)))
}
export function factsPanel(p,language){
 const facts=productFacts(p,language);if(!facts.length)return null
 const grid=node('div','commerce-product-facts')
 for(const [value,label] of facts){const cell=node('div');cell.append(node('strong',null,value),node('small',null,label));grid.append(cell)}
 return grid
}
function blueprintGraphic(kind,amount){
 const svg=svgNode('svg',{viewBox:'0 0 160 100',class:'commerce-blueprint-graphic','aria-hidden':'true',focusable:'false'})
 if(kind==='storage'){
  for(let i=0;i<(amount>=100?3:amount>=30?2:1);i++){
   const g=svgNode('g',{transform:'translate('+(i*12)+' '+(-i*12)+')'})
   g.append(path('M32 35 72 13l40 22v36L72 93 32 71Z','graphic-face'),path('M32 35 72 57l40-22 M72 57v36 M40 48l20 11 M40 57l20 11 M83 68l18-10 M83 77l18-10','graphic-line'))
   svg.append(g)
  }
 }else{
  svg.append(path('M27 13h77l23 23v51H27Z','graphic-face'),path('M104 13v23h23 M39 46h35 M39 54h26 M39 75h74','graphic-line'),path('M79 49 98 38l19 11v17L98 77 79 66Z M79 49l19 11 19-11 M98 60v17','graphic-line'))
 }
 return svg
}
export function productArtwork(p,language='ru'){
 const ru=language==='ru',tr=(a,b)=>ru?a:b
 if(!p||!['badge','subscription','storage','instruction'].includes(p.kind))return null
 const art=node('div','commerce-product-art art-'+p.kind)
 art.setAttribute('aria-hidden','true')
 if(p.kind==='badge'){
  const spec=insigniaSpec(p.id);if(!spec)return null
  art.classList.add('support-'+p.id)
  art.append(node('small','art-eyebrow','BRICKLAB / '+(p.betaOnly?'FOUNDERS':'SUPPORT')),insignia(p.id),node('span','art-serial',spec.code+' / '+(p.betaOnly?'OBT':'SERIES')),node('strong','art-caption',p.title))
 }else if(p.kind==='subscription'){
  art.classList.add('support-plus')
  art.append(node('small','art-eyebrow','BRICKLAB / MEMBERSHIP'),insignia('plus'),node('strong','art-caption','PLUS'),node('span','art-serial',p.months+' '+tr('мес.','mo.')))
 }else if(p.kind==='storage'){
  art.append(node('small','art-eyebrow','BRICKLAB / CLOUD'),blueprintGraphic('storage',p.slots),node('strong','art-caption','+'+p.slots),node('span','art-serial','PROJECTS'))
 }else{
  art.append(node('small','art-eyebrow','BRICKLAB / BUILD GUIDE'),blueprintGraphic('instruction',0),node('strong','art-caption',tr('Инструкции','Instructions')),node('span','art-serial','STEP / PART ID'))
 }
 return art
}
