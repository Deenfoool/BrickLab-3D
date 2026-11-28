import {regionSilhouette} from './instruction-silhouette.js?v=smart-highlight-1'
export async function instructionPartRegions(set, pdfId, page, {fetcher=fetch}={}) {
  if(!pdfId)return []
  const query=new URLSearchParams({set,pdf:String(pdfId),page:String(page)})
  const response=await fetcher('/api/commerce/instruction-regions?'+query,{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(5000)})
  if(!response.ok)return []
  const {regions}=await response.json()
  return Array.isArray(regions)?regions:[]
}

const ns='http://www.w3.org/2000/svg'
const states=new WeakMap()
function pageState(preview){
 const surface=preview.querySelector('canvas,img')
 const old=states.get(preview)
 if(old?.surface===surface&&old.tooltip.isConnected)return old
 const tooltip=document.createElement('span')
 tooltip.className='instruction-part-label';tooltip.hidden=true;tooltip.setAttribute('aria-hidden','true')
 preview.append(tooltip)
 const state={surface,tooltip,keys:new Set(),active:null}
 states.set(preview,state);return state
}
function highlight(button,shape){
 if(!shape){button.classList.add('instruction-part-marker');return}
 const svg=document.createElementNS(ns,'svg'),path=document.createElementNS(ns,'path')
 svg.setAttribute('viewBox','0 0 '+shape.width+' '+shape.height)
 svg.setAttribute('preserveAspectRatio','none');svg.setAttribute('aria-hidden','true')
 svg.classList.add('instruction-part-silhouette')
 path.setAttribute('d',shape.path);svg.append(path);button.append(svg)
}
export function addInstructionParts(preview, regions, { language, describe, find }) {
 if(!regions.length)return
 const state=pageState(preview),tooltip=state.tooltip
 preview.style.isolation='isolate'
 for(const region of regions){
  if(!Array.isArray(region))continue
  const [x,y,width,height,partNum,colorId,elementId]=region
  if(![x,y,width,height].every(Number.isFinite)||x<0||y<0||width<=0||height<=0||x+width>10000||y+height>10000||typeof partNum!=='string'||!partNum)continue
  const key=JSON.stringify(region.slice(0,7));if(state.keys.has(key))continue;state.keys.add(key)
  const button=document.createElement('button')
  const name=describe?.(partNum,colorId),label=[partNum,elementId&&'LEGO '+elementId,name].filter(Boolean).join(' · ')
  button.className='instruction-part-region';button.type='button'
  button.setAttribute('aria-label',(language==='ru'?'Найти деталь ':'Find part ')+label)
  button.dataset.partNum=partNum;if(elementId)button.dataset.elementId=elementId
  Object.assign(button.style,{left:x/100+'%',top:y/100+'%',width:width/100+'%',height:height/100+'%',zIndex:String(Math.max(1,1000-Math.floor(width*height/100000)))})
  let prepared=false
  function showLabel(){
   if(!prepared){prepared=true;highlight(button,regionSilhouette(state.surface??{},region))}
   state.active=button;button.classList.add('is-highlighted')
   tooltip.textContent=label
   tooltip.style.left='clamp(6.5rem, '+(x+width/2)/100+'%, calc(100% - 6.5rem))'
   tooltip.style.top=(y<1500?y+height:y)/100+'%'
   tooltip.classList.toggle('above',y>=1500);tooltip.hidden=false
  }
  function hideLabel(){button.classList.remove('is-highlighted');if(state.active===button){state.active=null;tooltip.hidden=true}}
  button.addEventListener('pointerenter',showLabel)
  button.addEventListener('pointerleave',()=>{if(!button.matches(':focus-visible'))hideLabel()})
  button.addEventListener('focus',showLabel);button.addEventListener('blur',hideLabel)
  button.addEventListener('keydown',e=>{if(e.key==='Escape'){hideLabel();button.blur()}})
  button.addEventListener('click',()=>{showLabel();button.classList.remove('is-selected');void button.offsetWidth;button.classList.add('is-selected');find(partNum,colorId,elementId)})
  button.addEventListener('animationend',()=>button.classList.remove('is-selected'))
  preview.append(button)
 }
}
