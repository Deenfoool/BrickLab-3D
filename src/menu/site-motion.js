// A finite, viewport-aware motion system for the menu shell only.
const selectors='.home-feature,.hub-build,.hub-info-card,.hub-shelf,.community-card,.set-card,.store-product,.project-card,.example-card,.workshop-hero,.portfolio-block,.workshop-section-title,.workshop-card,.achievement-tile'
export const motionBudget=32
export const motionDelay=index=>Math.min(Math.max(0,index)*35,140)
export function motionAllowed(root,media){
 return !!root&&!root.hidden&&!media?.matches
}
export function createSiteMotion(root,{media=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)'),Intersection=globalThis.IntersectionObserver,Mutation=globalThis.MutationObserver,raf=globalThis.requestAnimationFrame,caf=globalThis.cancelAnimationFrame}={}){
 let route=null,seen=new WeakSet(),animatedKeys=new Set(),pending=new Set(),animations=new Set(),budget=0,frame=null,observer=null,mutation=null
 const content=root?.querySelector?.('.content')??root
 const allowed=()=>route!==null&&motionAllowed(root,media)
 function keyFor(node){const widget=node.getAttribute('data-widget'),section=node.closest('[data-motion-section]')?.getAttribute('data-motion-section')??'';if(widget)return section+':widget:'+widget;if(node.matches('.workshop-hero'))return section+':hero';if(node.matches('.workshop-section-title'))return 'section:'+section;return null}
 function eligible(node){return node?.isConnected&&!node.closest('[hidden],.is-editing,.workshop-live-ghost,dialog,.workshop-live-preview-page')&&!node.parentElement?.closest('.portfolio-block,.home-feature,.hub-build,.community-card,.store-product,.project-card,.set-card')&&typeof node.animate==='function'}
 function animate(node,index){
  if(!allowed()||budget>=motionBudget||!eligible(node))return
  const key=keyFor(node);if(key&&animatedKeys.has(key))return
  if(key)animatedKeys.add(key);budget++
  // Independent translate property avoids replacing hover/drag transforms.
  const animation=node.animate([{opacity:0.64,translate:'0 9px'},{opacity:1,translate:'0 0'}],{duration:380,delay:motionDelay(index),easing:'cubic-bezier(.2,.8,.2,1)',fill:'none'})
  animations.add(animation);const release=()=>animations.delete(animation);animation.onfinish=release;animation.oncancel=release
 }
 function scan(){
  frame=null;if(!allowed()||!content||budget>=motionBudget)return
  let index=0
  for(const node of content.querySelectorAll(selectors)){
   if(budget+pending.size>=motionBudget)break
   if(seen.has(node)||!eligible(node))continue
   const key=keyFor(node);if(key&&animatedKeys.has(key))continue
   seen.add(node)
   if(observer){pending.add(node);observer.observe(node)}
   else{const rect=node.getBoundingClientRect();if(rect.bottom>0&&rect.top<(globalThis.innerHeight??0))animate(node,index++)}
  }
 }
 function schedule(){if(!allowed()||frame!==null)return;if(raf)frame=raf(scan);else scan()}
 function stop(){
  if(frame!==null&&caf)caf(frame);frame=null;observer?.disconnect();observer=null;mutation?.disconnect();mutation=null;pending.clear()
  for(const animation of animations)animation.cancel();animations.clear()
 }
 function start(){
  if(!allowed()||!content)return
  if(Intersection)observer=new Intersection(entries=>{let index=0;for(const entry of entries){if(!entry.isIntersecting)continue;observer?.unobserve(entry.target);pending.delete(entry.target);animate(entry.target,index++)}if(budget<motionBudget)schedule()},{threshold:.12})
  if(Mutation){mutation=new Mutation(()=>{for(const node of pending)if(!node.isConnected||!eligible(node)){observer?.unobserve(node);pending.delete(node)}schedule()});mutation.observe(content,{childList:true,subtree:true})}
  schedule()
 }
 const preferenceChanged=()=>{stop();if(allowed())start()}
 media?.addEventListener?.('change',preferenceChanged)
 return {setRoute(next){if(next===route)return;stop();route=next;seen=new WeakSet();animatedKeys=new Set();budget=0;start()},dispose(){route=null;stop();media?.removeEventListener?.('change',preferenceChanged)}}
}
export function acknowledgeMotion(node){if(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches||!node?.animate)return;node.animate([{scale:'1'},{scale:'1.045'},{scale:'1'}],{duration:240,easing:'ease-out'})}
