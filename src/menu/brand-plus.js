// The header mirrors the server's private profile, not client-side purchase claims.
const DAY=86400000
export function subscriptionRemaining({signedIn,plus,plusUntil}={},now=Date.now()){
 if(!signedIn||plus!==true||!Number.isFinite(plusUntil)||plusUntil<=now)return null
 const ms=plusUntil-now
 return {days:Math.ceil(ms/DAY),underDay:ms<DAY,until:plusUntil}
}
export function remainingText(remaining,lang){
 if(lang!=='ru')return remaining.underDay?'Less than 1 day left':remaining.days+' '+(remaining.days===1?'day':'days')+' left'
 const d=remaining.days,n=d%100,last=d%10
 return remaining.underDay?'Осталось меньше суток':'Осталось '+d+' '+(n>=11&&n<=14?'дней':last===1?'день':last>=2&&last<=4?'дня':'дней')
}
export function mountBrandPlus(doc){
 const root=doc.getElementById('brand-plus'),trigger=doc.getElementById('brand-plus-trigger'),tooltip=doc.getElementById('brand-plus-tooltip')
 const remaining=doc.getElementById('brand-plus-remaining'),expiry=doc.getElementById('brand-plus-expiry')
 let state={},timer=null
 function dismiss(){tooltip.hidden=true;trigger.setAttribute('aria-expanded','false')}
 function render(){
  clearTimeout(timer)
  const value=subscriptionRemaining(state)
  root.hidden=!value
  if(!value){dismiss();return}
  const ru=state.lang==='ru',label=remainingText(value,state.lang)
  remaining.textContent=label
  expiry.textContent=(ru?'Активна до ':'Active until ')+new Intl.DateTimeFormat(ru?'ru-RU':'en-GB',{day:'numeric',month:'long',year:'numeric'}).format(value.until)
  trigger.setAttribute('aria-label','BrickLab Plus · '+label)
  // Recalculate at each day boundary and at expiry, including a tab left open.
  const ms=value.until-Date.now()
  const boundary=ms-(value.days-1)*DAY
  timer=setTimeout(render,Math.max(20,Math.min(ms,boundary)+20))
 }
 function show(){render();if(root.hidden)return;tooltip.hidden=false;trigger.setAttribute('aria-expanded','true')}
 trigger.addEventListener('pointerenter',e=>{if(e.pointerType!=='touch')show()})
 trigger.addEventListener('pointerleave',()=>{if(doc.activeElement!==trigger)dismiss()})
 trigger.addEventListener('focus',show)
 trigger.addEventListener('blur',dismiss)
 trigger.addEventListener('click',show)
 trigger.addEventListener('keydown',e=>{if(e.key==='Escape'){dismiss();e.stopPropagation();e.preventDefault()}})
 doc.addEventListener('pointerdown',e=>{if(!root.contains(e.target))dismiss()})
 doc.addEventListener('visibilitychange',()=>{if(!doc.hidden)render()})
 globalThis.addEventListener?.('hashchange',dismiss)
 return {update(next){if(state.userId!==next.userId)dismiss();state={...next};render()}}
}
