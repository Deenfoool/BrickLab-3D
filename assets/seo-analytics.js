// Optional analytics for public informational pages only.
(() => {
 const id=Number(document.querySelector('meta[name="bricklab-metrika"]')?.content)
 if(!Number.isSafeInteger(id)||id<=0)return
 const key='bricklab.publicAnalyticsConsent'
 const section=document.createElement('section')
 section.className='seo-consent'
 const message=document.createElement('p'),accept=document.createElement('button'),decline=document.createElement('button')
 const en=document.documentElement.lang==='en'
 message.textContent=en?'Allow optional Yandex Metrica analytics on public pages? No session recordings.':'Разрешить необязательную аналитику Яндекс Метрики на публичных страницах? Без записи действий в Вебвизоре.'
 accept.type=decline.type='button'
 accept.textContent=en?'Allow':'Разрешить'
 decline.textContent=en?'Decline':'Отказаться'
 section.append(message,accept,decline)
 document.body.append(section)
 let started=false
 const get=()=>{try{return localStorage.getItem(key)}catch{return null}}
 const save=value=>{try{localStorage.setItem(key,value)}catch{}}
 function load(){
  if(started)return
  started=true
  window.ym=window.ym||function(){(window.ym.a=window.ym.a||[]).push(arguments)}
  window.ym.l=Date.now()
  const script=document.createElement('script')
  script.async=true
  script.src='https://mc.yandex.ru/metrika/tag.js'
  document.head.append(script)
  window.ym(id,'init',{defer:true,clickmap:false,trackLinks:false,accurateTrackBounce:false,webvisor:false})
  window.ym(id,'hit',location.origin+location.pathname,{title:document.title,referer:''})
  for(const a of document.querySelectorAll('a.cta'))a.addEventListener('click',()=>window.ym(id,'reachGoal','open_editor'))
 }
 function render(){
  const allowed=get()==='yes'
  accept.hidden=allowed
  decline.textContent=allowed?(en?'Withdraw consent':'Отозвать согласие'):(en?'Decline':'Отказаться')
  message.textContent=allowed?(en?'Optional analytics enabled.':'Необязательная аналитика включена.'):get()==='no'?(en?'Optional analytics disabled.':'Необязательная аналитика отключена.'):message.textContent
  if(allowed)load()
 }
 accept.onclick=()=>{save('yes');render();if(get()!=='yes')load()}
 decline.onclick=()=>{save('no');if(started)location.reload();else render()}
 render()
})()
