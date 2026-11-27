export function moveItem(items,from,to){const copy=[...items];if(!Number.isInteger(from)||!Number.isInteger(to)||from<0||to<0||from>=copy.length||to>=copy.length)return copy;const [item]=copy.splice(from,1);copy.splice(to,0,item);return copy}
export function sortableHandle({row,list,index,label,disabled=false,move}){
 const grip=document.createElement('button');grip.type='button';grip.className='workshop-sort-handle';grip.textContent='⠿';grip.disabled=disabled;grip.setAttribute('aria-label',label);grip.title=label
 let pointer=null,target=index,rows=[]
 function finish(commit){const to=target;for(const r of rows)r.classList?.remove?.('sort-dragging','sort-target');rows=[];pointer=null;if(commit&&to!==index)move(index,to)}
 grip.onkeydown=e=>{if(disabled||!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();const to=index+(['ArrowUp','ArrowLeft'].includes(e.key)?-1:1);if(to>=0&&to<list.children.length){move(index,to);list.children[to]?.querySelector?.('.workshop-sort-handle')?.focus()}}
 grip.onpointerdown=e=>{if(disabled||e.button!==0||pointer!==null)return;e.preventDefault();pointer=e.pointerId;target=index;rows=Array.from(list.children);grip.setPointerCapture?.(pointer);row.classList?.add?.('sort-dragging')}
 grip.onpointermove=e=>{if(e.pointerId!==pointer)return;e.preventDefault();let next=index,distance=Infinity;for(const [i,r] of rows.entries()){const box=r.getBoundingClientRect();const d=Math.hypot(e.clientY-(box.top+box.height/2),e.clientX-(box.left+box.width/2));if(d<distance){distance=d;next=i}}target=next;for(const [i,r] of rows.entries())r.classList?.toggle?.('sort-target',i===target&&i!==index);const scroller=document.scrollingElement;if(scroller){if(e.clientY<65)scroller.scrollTop-=18;else if(e.clientY>globalThis.innerHeight-65)scroller.scrollTop+=18}}
 grip.onpointerup=e=>{if(e.pointerId===pointer)finish(true)};grip.onpointercancel=e=>{if(e.pointerId===pointer)finish(false)};grip.onlostpointercapture=()=>{if(pointer!==null)finish(false)}
 return grip
}
