// Desktop geometry: 12 columns, bounded integer rows; the mobile view is derived.
export const liveColumns=12,liveMaxRows=96
export const liveKeys=['featured','publications','collections','awards','activity','statistics','about','followers','metrics']
const integer=(n,min,max)=>Number.isInteger(n)&&n>=min&&n<=max
export const isLiveLayout=blocks=>Array.isArray(blocks)&&blocks.length===liveKeys.length&&blocks.every(b=>b&&b.rect)
export function validateLiveRect(rect){
 if(!rect||typeof rect!=='object'||Array.isArray(rect)||!integer(rect.x,0,9)||!integer(rect.y,0,liveMaxRows-2)||!integer(rect.w,3,12)||!integer(rect.h,2,12)||rect.x+rect.w>12||rect.y+rect.h>liveMaxRows)throw TypeError('invalid_portfolio')
 return {x:rect.x,y:rect.y,w:rect.w,h:rect.h}
}
export const overlaps=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y
const order=(a,b)=>a.rect.y-b.rect.y||a.rect.x-b.rect.x||liveKeys.indexOf(a.key)-liveKeys.indexOf(b.key)
const copy=blocks=>blocks.map(b=>({...b,rect:{...b.rect}}))
export function validateLiveBlocks(blocks){
 if(!isLiveLayout(blocks)||new Set(blocks.map(b=>b.key)).size!==liveKeys.length||blocks.some(b=>!liveKeys.includes(b.key)))throw TypeError('invalid_portfolio')
 const next=blocks.map(b=>{if(typeof b.visible!=='boolean'||(b.locked!==undefined&&typeof b.locked!=='boolean'))throw TypeError('invalid_portfolio');return {key:b.key,visible:b.visible,rect:validateLiveRect(b.rect),...(b.locked?{locked:true}:{})}})
 for(let i=0;i<next.length;i++)for(let j=i+1;j<next.length;j++)if(overlaps(next[i].rect,next[j].rect))throw TypeError('invalid_portfolio')
 return next.sort(order)
}
export function defaultLiveBlocks(blocks=[]){
 const by=new Map(blocks.map(b=>[b.key,b])),keys=[...new Set(['metrics',...blocks.map(b=>b.key).filter(k=>liveKeys.includes(k)),...liveKeys])]
 return keys.map((key,i)=>({key,visible:by.get(key)?.visible??(key==='metrics'),rect:{x:(i%2)*6,y:Math.floor(i/2)*2,w:6,h:2}}))
}
export function toLiveBlocks(blocks){
 if(isLiveLayout(blocks))return validateLiveBlocks(blocks)
 // Preserve explicit widths from Layout Studio; untouched profiles start with equal tiles.
 if(!blocks.some(b=>b.span!==undefined||b.newRow))return defaultLiveBlocks(blocks)
 const next=[{key:'metrics',visible:true,rect:{x:0,y:0,w:6,h:2}}];let x=6,y=0
 for(const b of blocks){const w=b.span??6;if(b.newRow&&x){x=0;y+=2}if(x+w>12){x=0;y+=2}next.push({key:b.key,visible:b.visible,rect:{x,y,w,h:2}});x+=w}
 return validateLiveBlocks(next)
}
export function resizeLiveRect(rect,edge,dx,dy){
 const clamp=(n,min,max)=>Math.max(min,Math.min(max,n))
 let l=rect.x,r=l+rect.w,t=rect.y,b=t+rect.h
 if(edge.includes('w'))l=clamp(l+dx,Math.max(0,r-12),r-3)
 if(edge.includes('e'))r=clamp(r+dx,l+3,12)
 if(edge.includes('n'))t=clamp(t+dy,Math.max(0,b-12),b-2)
 if(edge.includes('s'))b=clamp(b+dy,t+2,Math.min(liveMaxRows,t+12))
 return {x:l,y:t,w:r-l,h:b-t}
}
export function moveLiveRect(rect,dx,dy){return {...rect,x:Math.max(0,Math.min(12-rect.w,rect.x+dx)),y:Math.max(0,Math.min(liveMaxRows-rect.h,rect.y+dy))}}
function firstFree(rect,occupied){
 for(let y=rect.y;y+rect.h<=liveMaxRows;y++){const p={...rect,y};if(!occupied.some(b=>overlaps(p,b.rect)))return p}
 return null
}
// Fixed widgets never move. The selected rectangle has priority; others are pushed
// down only as needed. Hidden widgets participate while editing so restoration is safe.
export function resolveLivePlacement(blocks,key,rect){
 const source=validateLiveBlocks(blocks),selected=source.find(b=>b.key===key)
 if(!selected||selected.locked)return null
 const target=validateLiveRect(rect),locked=source.filter(b=>b.locked)
 if(locked.some(b=>overlaps(target,b.rect)))return null
 const placed=[...locked,{...selected,rect:target}]
 for(const b of source.filter(b=>b.key!==key&&!b.locked).sort(order)){
  const position=firstFree(b.rect,placed);if(!position)return null
  placed.push({...b,rect:position})
 }
 return validateLiveBlocks(placed)
}
export function compactLiveBlocks(blocks){
 const source=validateLiveBlocks(blocks),placed=source.filter(b=>b.locked)
 for(const b of source.filter(b=>!b.locked).sort((a,b)=>Number(b.visible)-Number(a.visible)||order(a,b))){
  const y=b.visible?0:Math.max(0,...placed.filter(p=>p.visible).map(p=>p.rect.y+p.rect.h));const rect=firstFree({...b.rect,y},placed);if(!rect)return source
  placed.push({...b,rect})
 }
 return validateLiveBlocks(placed)
}
export function mobileLiveBlocks(blocks,{includeHidden=false}={}){
 let y=0;return validateLiveBlocks(blocks).filter(b=>includeHidden||b.visible).map(b=>{const rect={x:0,y,w:12,h:b.rect.h};y+=rect.h;return {...b,rect}})
}
export function livePreset(blocks,id){
 const source=validateLiveBlocks(blocks)
 if(id==='classic')return defaultLiveBlocks(source)
 const sequences={minimal:['metrics','about','followers','publications'],portfolio:['featured','publications','collections','awards','about','metrics','followers','statistics'],engineering:['metrics','statistics','awards','featured','publications','activity','collections','about','followers']}
 if(!Object.hasOwn(sequences,id))return copy(source)
 const keys=sequences[id],by=new Map(source.map(b=>[b.key,b]))
 return defaultLiveBlocks([...keys,...liveKeys.filter(k=>!keys.includes(k))].map(key=>({...by.get(key),key,visible:keys.includes(key)}))).map(b=>({...b,visible:keys.includes(b.key)}))
}
export function cloneLiveState(state){return JSON.parse(JSON.stringify(state))}
export function createLiveHistory(initial){
 let present=cloneLiveState(initial),past=[],future=[]
 return {get value(){return cloneLiveState(present)},get canUndo(){return past.length>0},get canRedo(){return future.length>0},commit(next){if(JSON.stringify(next)===JSON.stringify(present))return false;past.push(present);if(past.length>60)past.shift();present=cloneLiveState(next);future=[];return true},undo(){if(!past.length)return false;future.push(present);present=past.pop();return true},redo(){if(!future.length)return false;past.push(present);present=future.pop();return true}}
}
