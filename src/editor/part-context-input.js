// Capture on the viewport/root, not only the WebGL canvas. Native contextmenu
// may arrive before or after pointerup (browser/platform dependent).
export function bindPartContextInput({root,viewport,menu,events,signal,enabled,release,open}){
 let gesture=null,lastRelease=-Infinity
 const options={capture:true,passive:false,signal}
 const inside=e=>viewport.contains(e.target)&&!e.target.closest?.('button,input,textarea,select,a,summary,[contenteditable=true]')
 const over=e=>{const r=viewport.getBoundingClientRect();return e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom}
 const moved=(e,g)=>Math.hypot(e.clientX-g.x,e.clientY-g.y)>=5
 root.addEventListener('pointerdown',e=>{
  if(e.button!==2)return
  gesture=null
  if(inside(e)&&enabled())gesture={id:e.pointerId,x:e.clientX,y:e.clientY,dragged:false}
 },options)
 events.addEventListener('pointermove',e=>{if(gesture&&e.pointerId===gesture.id&&moved(e,gesture))gesture.dragged=true},options)
 events.addEventListener('pointerup',e=>{
  if(e.button!==2||!gesture||e.pointerId!==gesture.id)return
  const g=gesture;gesture=null;lastRelease=e.timeStamp
  if(enabled()&&over(e))release(e,!g.dragged&&!moved(e,g))
 },options)
 events.addEventListener('pointercancel',e=>{if(gesture?.id===e.pointerId){gesture=null;lastRelease=e.timeStamp}},options)
 root.addEventListener('contextmenu',e=>{
  if(!viewport.contains(e.target)&&!menu.contains(e.target))return
  // Cancel before any renderer/selection callback can fail.
  e.preventDefault()
  if(!inside(e)||!enabled()||gesture||e.timeStamp-lastRelease<750)return
  // Fallback for devices emitting contextmenu without pointer events.
  if(over(e))open(e)
 },options)
}
