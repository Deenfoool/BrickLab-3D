// Optional analytics for public informational pages only.
(() => {
 const id=Number(document.querySelector('meta[name="bricklab-metrika"]')?.content)
 if(!Number.isSafeInteger(id)||id<=0||location.search||location.hash)return
 const key='bricklab.publicAnalyticsConsent.v2'
 const section=document.createElement('section')
 section.className='seo-consent'
 section.setAttribute('aria-label','Analytics preferences')
 const message=document.createElement('p'),policy=document.createElement('a'),accept=document.createElement('button'),decline=document.createElement('button')
 const en=document.documentElement.lang==='en'
 const prompt=en?'Allow optional Yandex Metrica analytics (cookies, technical data, page visits and editor-link clicks)? No session recordings.':'Разрешить необязательную аналитику Яндекс Метрики (cookie, технические данные, посещения страниц и переходы в редактор)? Без записи действий в Вебвизоре.'
 policy.href='/assets/analytics-privacy.html'
 policy.textContent=en?'Analytics privacy notice (Russian)':'Обработка данных и cookie'
 accept.type=decline.type='button'
 accept.textContent=en?'Allow analytics':'Разрешить аналитику'
 section.append(message,policy,accept,decline)
 document.body.append(section)
 let started=false,choice=null
 const get=()=>{try{return localStorage.getItem(key)}catch{return null}}
 const save=value=>{try{localStorage.setItem(key,value);return get()===value}catch{return false}}
 choice=get()
 function load(){
  if(started||choice!=='yes')return
  started=true
  window.ym=window.ym||function(){(window.ym.a=window.ym.a||[]).push(arguments)}
  window.ym.l=Date.now()
  const script=document.createElement('script')
  script.async=true
  script.referrerPolicy='no-referrer'
  script.src='https://mc.yandex.ru/metrika/tag.js'
  document.head.append(script)
  window.ym(id,'init',{defer:true,clickmap:false,trackLinks:false,accurateTrackBounce:false,webvisor:false})
  window.ym(id,'hit',location.origin+location.pathname,{title:document.title,referer:''})
  for(const a of document.querySelectorAll('a.cta'))a.addEventListener('click',()=>{if(choice==='yes')window.ym(id,'reachGoal','open_editor')})
 }
 function render(){
  const allowed=choice==='yes'
  accept.hidden=allowed
  decline.textContent=allowed?(en?'Withdraw consent':'Отозвать согласие'):(en?'Decline':'Отказаться')
  message.textContent=allowed?(en?'Optional analytics enabled.':'Необязательная аналитика включена.'):choice==='no'?(en?'Optional analytics disabled.':'Необязательная аналитика отключена.'):prompt
  if(allowed)load()
 }
 accept.onclick=()=>{if(!save('yes')){message.textContent=en?'Preferences cannot be saved. Analytics remains off.':'Не удалось сохранить выбор. Аналитика остаётся выключенной.';return}choice='yes';render()}
 decline.onclick=()=>{
  const persisted=save('no')
  choice='no'
  if(started){
   // Reload only if the stored choice was cleared; otherwise navigate to a
   // URL on which analytics is never loaded, without pretending consent persisted.
   if(persisted)location.reload()
   else {try{localStorage.removeItem(key)}catch{};location.replace('/assets/analytics-privacy.html')}
  }else render()
 }
 window.addEventListener('storage',event=>{if(event.key===key&&event.newValue!=='yes'&&started)location.reload()})
 render()
})()
