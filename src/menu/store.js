import {createProfileClient} from './profile-client.js?v=cloud-profile-1'
import {applySignature,themeBadge,themePlate,signatureFor,mountThemeCover} from './profile-signature.js?v=signature-art-1'
import {themeFor} from './store-themes.js?v=themes-2'
import {commerceProducts,themePrices,instructionTiers,productById} from './commerce-catalog.js?v=commerce-plus-2'
const labels={
 ru:{title:'BrickLab Store',intro:'Оформление мастерской. Основные функции редактора остаются бесплатными.',disabled:'Темы доступны для просмотра. Оплата откроется после подключения платёжной системы ЮKassa.',test:'Тестовый режим · реальные деньги не списываются. Покупки доступны только администратору.',login:'Войти в аккаунт',buy:'Тестовая покупка',owned:'Получено в тестовом инвентаре',resume:'Продолжить тестовую оплату',consent:'Подтверждаю, что это тестовая оплата без реального списания и без выдачи платного товара.',history:'Мои тестовые заказы',finance:'BrickLab Finance · тестовый режим',financeNote:'Суммы ниже — виртуальные тестовые операции, не выручка.',total:'Заказов',paid:'Подтверждено',amount:'Тестовый оборот',pending:'Ожидает подтверждения',complete:'Подтверждён',refresh:'Обновить статус',error:'Не удалось выполнить запрос. Попробуй ещё раз.',wait:'Если оплата завершена, дождись уведомления Robokassa и обнови статус.',profile:'Мой инвентарь',carbon:'Карбон',neon:'Неоновая мастерская',noOrders:'Заказов пока нет',loading:'Загрузка…'},
 en:{title:'BrickLab Store',intro:'Customize your workshop. Core editor features stay free.',disabled:'Themes are available to preview. Checkout opens after YooKassa is connected.',test:'Test mode · no real charges. Only administrators can test checkout.',login:'Sign in',buy:'Test purchase',owned:'Received in test inventory',resume:'Resume test payment',consent:'I understand this is a test transaction with no real charge or paid product delivery.',history:'My test orders',finance:'BrickLab Finance · test mode',financeNote:'Amounts below are simulated transactions, not revenue.',total:'Orders',paid:'Confirmed',amount:'Test volume',pending:'Awaiting confirmation',complete:'Confirmed',refresh:'Refresh status',error:'Request failed. Please try again.',wait:'If you completed payment, wait for Robokassa confirmation and refresh.',profile:'My inventory',carbon:'Carbon',neon:'Neon workshop',noOrders:'No orders yet',loading:'Loading…'}}
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n}
const button=(text,fn)=>{const b=el('button','workspace-action',text);b.type='button';b.onclick=fn;return b}
const link=(text,href)=>{const a=el('a','workspace-action',text);a.href=href;return a}
async function api(path,signal,data){
 const response=await fetch(path,{signal,credentials:'same-origin',cache:'no-store',redirect:'error',...(data===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})})
 if(!response.ok)throw Object.assign(Error('Store request failed'),{status:response.status})
 return response.json()
}
function themePreview(theme,language,large=false){
 const ru=language==='ru',art=el('div','store-theme-preview signature-catalog-preview'+(large?' store-theme-large':''))
 applySignature(art,theme.id);art.setAttribute('aria-hidden','true')
 const cover=el('div','community-profile-cover signature-preview-cover');mountThemeCover(cover,theme.id)
 if(!large){art.append(cover);return art}
 const identity=el('div','community-profile-identity'),avatar=el('div','account-avatar community-profile-avatar','BL'),body=el('div','community-card-body')
 const stats=el('div','community-reputation')
 for(const [label,value] of [[ru?'Сборки':'Builds','12'],[ru?'Лайки':'Likes','128'],[ru?'Подписчики':'Followers','24']]){
  const metric=el('div');metric.append(el('span',null,label),el('strong',null,value));stats.append(metric)
 }
 body.append(el('h2',null,ru?'Конструктор':'Builder'),themeBadge(theme.id,language),stats)
 identity.append(avatar,body)
 const profile=el('article','community-card community-builder community-builder-detail signature-demo-profile')
 applySignature(profile,theme.id);profile.append(cover,identity);art.append(profile);return art
}
function communityExamples(theme,language){
 const ru=language==='ru',grid=el('div','signature-preview-examples')
 for(const [label,title,description] of [[ru?'КАРТОЧКА СБОРКИ':'BUILD CARD',ru?'Моя конструкция':'My build',ru?'Автор · пример':'Author · example'],[ru?'КОММЕНТАРИЙ':'COMMENT',ru?'Конструктор':'Builder',ru?'Пример оформления комментария':'Sample comment styling']]){
  const card=el('div','signature-preview-example');applySignature(card,theme.id);card.append(el('small',null,label),el('strong',null,title),themeBadge(theme.id,language),el('p','account-muted',description));grid.append(card)
 }return grid
}
export function mountStore(root,{language='ru',signal}){
 const ru=language==='ru',t=labels[language]??labels.ru,tr=(a,b)=>ru?a:b,money=n=>(Number(n)/100).toLocaleString(ru?'ru-RU':'en-US',{style:'currency',currency:'RUB',maximumFractionDigits:2})
 const profiles=createProfileClient(),nav=el('div','commerce-preview-nav'),grid=el('div','store-grid'),notice=el('p','account-muted'),summary=el('section','store-orders')
 notice.setAttribute('role','status')
 const categories=[['all',tr('Все товары','All products')],['subscription','BrickLab Plus'],['theme',tr('Темы','Themes')],['themeBundle',tr('Коллекции','Collections')],['storage',tr('Облачные проекты','Cloud projects')],['badge',tr('Значки','Badges')],['instruction',tr('Инструкции','Instructions')],['orders',tr('Мои покупки','My purchases')]]
 const tabs=new Map(),header=el('div','store-banner'),heading=el('div'),art=el('div','store-banner-art')
 heading.append(el('span','store-kicker','BRICKLAB STORE'),el('h2',null,tr('Расширь свою мастерскую','Expand your workshop')),el('p',null,tr('Темы, облачное пространство, коллекции и Plus. Основной редактор бесплатный.','Themes, cloud space, collections and Plus. The core editor is free.')))
 for(const id of ['carbon','neon','aurora'])art.append(themePreview(themeFor(id),language));header.append(heading,art)
 let selected='all',catalog=null,profile=null,account=null,sandbox=null,testMode=false,busy=false,serial=0,initialized=false
 const toggle=button(tr('Тестовый контур','Sandbox'),()=>{testMode=!testMode;render()});toggle.hidden=true
 const refreshButton=button(tr('Обновить покупки','Refresh purchases'),()=>refresh())
 for(const [id,label] of categories){const b=button(label,()=>{selected=id;render()});tabs.set(id,b);nav.append(b)}
 nav.append(toggle,refreshButton)
 const legal=el('section','store-orders'),links=el('div','commerce-preview-nav')
 legal.append(el('h2',null,tr('Получение и условия','Delivery and terms')),el('p',null,tr('Цифровые покупки закрепляются за аккаунтом после подтверждения оплаты. Физической доставки нет. Доступ и историю заказов можно посмотреть в мастерской.','Digital purchases are linked to your account after confirmation. No physical delivery. View purchases in your workshop.')))
 for(const [title,path] of [[tr('Оферта','Offer'),'/offer'],[tr('Получение и возврат','Refunds'),'/refund'],[tr('Конфиденциальность','Privacy'),'/privacy'],[tr('Реквизиты','Seller details'),'/requisites']]){const a=link(title,path);a.target='_blank';a.rel='noopener';links.append(a)}legal.append(links)
 root.replaceChildren(header,nav,notice,summary,grid,legal)
 const optional=path=>api(path,signal).catch(e=>{if(e.status===401||e.status===403)return null;throw e})
 const safeUrl=value=>{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port||!['yoomoney.ru','yookassa.ru','www.yoomoney.ru','www.yookassa.ru'].includes(u.hostname))throw Error('checkout_url');return u.href}
 function productTitle(p){return p.kind==='theme'?themeFor(p.id)?.[language]??p.id:p.kind==='storage'?tr(p.title,'+'+p.slots+' projects'):p.kind==='subscription'?'BrickLab Plus · '+p.months+tr(' мес.',' mo.'):p.title}
 function description(p){
  if(p.kind==='theme'){const theme=themeFor(p.id);return tr(theme.descriptionRu,theme.descriptionEn)}
  if(p.kind==='storage')return tr('Дополнительно '+p.slots+' проектов и '+p.storageMiB+' МиБ хранения. Разовая покупка.','Adds '+p.slots+' projects and '+p.storageMiB+' MiB storage. One-time purchase.')
  if(p.kind==='subscription')return tr('+40 проектов, +128 МиБ, 40 версий, значок Plus, одна тема на выбор, скидки. Продление вручную.','+40 projects, +128 MiB, 40 revisions, Plus badge, one theme and discounts. Manual renewal.')
  if(p.kind==='instruction')return tr('Тест доступа к подсказкам набора Volvo 42215. В ОБТ остаётся бесплатным.','Sandbox access fixture for Volvo 42215. Free in open beta.')
  if(p.kind==='themeBundle')return tr('Все шесть тем мастерской.','All six workshop themes.')
  return tr('Коллекционный значок поддержки. Можно выбрать для публичного профиля.','Collectible supporter badge for your public profile.')
 }
 function owned(p,a){return p.kind==='theme'?a?.themes?.includes(p.id):p.kind==='badge'?a?.badges?.includes(p.id):p.kind==='instruction'?a?.instructions?.includes('42215-1'):p.kind==='themeBundle'?Object.keys(themePrices).every(id=>a?.themes?.includes(id)):false}
 function showCheckout(p){
  if(busy||signal.aborted)return
  busy=true
  const dialog=el('dialog','store-preview-dialog'),label=el('label','store-consent'),accept=el('input'),status=el('p','account-muted'),price=el('strong','store-price',money(p.priceKopecks))
  accept.type='checkbox';label.append(accept,el('span',null,testMode?tr('Тестовая операция: без списания денег и без изменения реального аккаунта.','Test operation: no real charge or live account changes.'):tr('Принимаю оферту и условия возврата.','I accept the offer and refund terms.')))
  const mode=testMode?'test':'live';let quote=null
  const pay=button(tr('Перейти к оплате','Proceed to payment'),async()=>{
   if(!accept.checked||(!quote&&mode==='live'))return;pay.disabled=true
   try{
    const result=await api('/api/commerce/'+mode+'-checkout',signal,mode==='test'?{sku:p.id,testConsent:true}:{sku:p.id,amountKopecks:quote.amountKopecks,offerVersion:quote.offerVersion,accepted:true})
    if(result.mode!==mode)throw Error('mode');if(result.checkoutUrl){location.assign(safeUrl(result.checkoutUrl));return}
    status.textContent=result.status==='succeeded'?tr('Оплата подтверждена.','Payment confirmed.'):tr('Платёж отменён.','Payment canceled.');await refresh()
   }catch(e){status.textContent=t.error+' ('+(e.status??'network')+')';pay.disabled=!accept.checked}
  })
  pay.disabled=true;accept.onchange=()=>pay.disabled=!accept.checked||(mode==='live'&&!quote)
  const close=button(tr('Закрыть','Close'),()=>dialog.close())
  dialog.append(el('h2',null,productTitle(p)),price,label,pay,close,status)
  if(mode==='live'){const a=link(tr('Оферта','Offer'),'/offer');a.target='_blank';a.rel='noopener';dialog.append(a);void api('/api/commerce/live-quote?sku='+encodeURIComponent(p.id),signal).then(q=>{quote=q;price.textContent=money(q.amountKopecks);pay.disabled=!accept.checked}).catch(()=>status.textContent=t.error)}
  dialog.addEventListener('close',()=>{busy=false;dialog.remove()},{once:true});signal.addEventListener('abort',()=>{if(dialog.open)dialog.close()},{once:true});root.append(dialog);dialog.showModal()
 }
 function render(){
  if(!catalog||signal.aborted)return
  const a=testMode?sandbox:account,products=[...catalog.products.map(p=>({id:p.sku,kind:'theme',title:p.title,priceKopecks:p.amountKopecks})),...commerceProducts,...(testMode?[{id:'instruction-42215-1',kind:'instruction',title:'Volvo 42215 · '+tr('интерактивные подсказки','interactive hints'),priceKopecks:17900}]:[])]
  for(const [id,b] of tabs){b.classList.toggle('primary',selected===id);b.setAttribute('aria-pressed',String(selected===id))}
  toggle.hidden=!sandbox;toggle.classList.toggle('primary',testMode);toggle.setAttribute('aria-pressed',String(testMode))
  notice.textContent=testMode?tr('ТЕСТ · Все товары доступны для проверки. Реальный аккаунт не меняется.','TEST · All products available. Live account unchanged.'):catalog.live?tr('Оплата через ЮKassa.','Payment via YooKassa.'):tr('Оплата пока закрыта. Темы — первый ассортимент; остальные товары готовятся к выпуску.','Checkout closed. Themes are the first assortment; other products are in preparation.')
  grid.replaceChildren();summary.replaceChildren();summary.hidden=!a
  if(a){summary.append(el('h2',null,testMode?tr('Тестовый инвентарь','Sandbox inventory'):tr('Мой аккаунт','My account')),el('p',null,tr('Проекты: ','Projects: ')+a.limits.projects+' · '+tr('Хранилище: ','Storage: ')+a.limits.storageMiB+' MiB · '+tr('Версии: ','Revisions: ')+a.limits.versions),el('p','account-muted','Plus: '+(a.plus?tr('до ','until ')+new Date(a.plusUntil).toLocaleDateString(language):tr('не активен','inactive'))+' · '+tr('Темы: ','Themes: ')+a.themes.length+' · '+tr('Значки: ','Badges: ')+a.badges.length))}
  if(selected==='orders'){
   if(!a){grid.append(link(t.login,'#account'));return}
   for(const o of a.orders??[]){const card=el('article','commerce-preview-card'),p=products.find(p=>p.id===o.sku);card.append(el('h3',null,p?productTitle(p):o.title),el('strong','store-price',money(o.amountKopecks)),el('p','account-muted',({pending:tr('Ожидает оплаты','Pending'),succeeded:tr('Оплачено','Paid'),canceled:tr('Отменено','Canceled'),refunded:tr('Возвращено','Refunded')})[o.status]??o.status),el('small','account-muted',o.id));if(o.status==='pending'&&p&&(testMode||catalog.live))card.append(button(tr('Продолжить оплату','Resume checkout'),()=>showCheckout(p)));if(testMode&&o.status==='succeeded'){const refund=button(o.refundRequestedAt?tr('Проверить возврат','Check refund'):tr('Тестовый возврат','Test refund'),async()=>{if(!o.refundRequestedAt&&!window.confirm(tr('Вернуть всю тестовую сумму и отозвать приобретение?','Refund the full test amount and revoke the entitlement?')))return;refund.disabled=true;try{const result=await api('/api/commerce/test-refund',signal,{orderId:o.id,confirm:true});await refresh();notice.textContent=tr('Возврат: ','Refund: ')+result.status}catch(e){notice.textContent=t.error+' ('+(e.status??'network')+')';refund.disabled=false}});card.append(refund)}grid.append(card)}
   if(!(a.orders??[]).length)grid.append(el('p','account-muted',t.noOrders))
   if(!testMode)grid.append(link(tr('Перейти в мастерскую','Open workshop'),'#account'));return
  }
  const ordered=['subscription','theme','themeBundle','storage','badge',...(testMode?['instruction']:[])]
  for(const kind of ordered){if(selected!=='all'&&selected!==kind)continue
   const section=el('section','store-orders'),items=el('div','store-grid');section.append(el('h2',null,categories.find(c=>c[0]===kind)[1]),items);section.style.gridColumn='1 / -1';grid.append(section)
   for(const p of products.filter(x=>x.kind===kind)){
    const card=el('article','store-product'),copy=el('div','store-product-body')
    if(kind==='theme')card.append(themePreview(themeFor(p.id),language));else if(kind==='themeBundle'){const previews=el('div','store-banner-art');for(const id of ['carbon','neon','aurora'])previews.append(themePreview(themeFor(id),language));card.append(previews)}
    if(kind==='badge')copy.append(el('span','commerce-support-badge support-'+p.id,p.title))
    copy.append(el('h3',null,productTitle(p)),el('p','account-muted',description(p)),el('strong','store-price',money(p.priceKopecks)))
    if(kind==='theme'){const theme=themeFor(p.id),dialog=el('dialog','store-preview-dialog');dialog.append(el('h2',null,productTitle(p)),themePreview(theme,language,true),communityExamples(theme,language),button(tr('Закрыть','Close'),()=>dialog.close()));copy.append(button(tr('Примерить','Preview'),()=>dialog.showModal()),dialog)}
    const has=owned(p,a),available=testMode||catalog.live&&kind==='theme'
    if(has)copy.append(el('p','account-muted',tr('Приобретено','Owned')))
    if(!testMode&&kind==='theme'&&profile?.inventory?.some(i=>i.id===p.id&&i.owned)){const equip=button(tr('Применить','Equip'),async()=>{equip.disabled=true;try{const current=await profiles.get();await profiles.save({bio:current.profile.bio,cover:current.profile.cover,background:p.id});await refresh()}catch{notice.textContent=t.error;equip.disabled=false}});copy.append(equip)}
    if(!testMode&&has&&kind!=='theme')copy.append(link(tr('Открыть мастерскую','Open workshop'),'#account'))
    if(available&&(!has||kind==='storage'||kind==='subscription'))copy.append(button(testMode?tr('Тестовая покупка','Test purchase'):tr('Купить','Buy'),()=>{if(!a){location.hash='#account';return}showCheckout(p)}))
    else if(!available&&!has)copy.append(el('small','account-muted',kind==='theme'?tr('Оплата скоро','Checkout coming soon'):tr('Подготовка к выпуску','In preparation')))
    card.append(copy);items.append(card)
   }
  }
  if(selected==='all'||selected==='instruction'){
   const section=el('section','store-orders');section.style.gridColumn='1 / -1';section.append(el('h2',null,tr('Интерактивные инструкции','Interactive instructions')),el('p','account-muted',tr('Во время ОБТ бесплатно. PDF и ручной поиск останутся бесплатными. Продажа отдельных наборов начнётся после проверки распознавания.','Free during open beta. PDF and manual search remain free. Individual sets launch after recognition audit.')))
   let min=1;for(const [max,price] of instructionTiers){const row=el('div','commerce-preview-tier');row.append(el('span',null,min+'–'+(max===Number.MAX_SAFE_INTEGER?'∞':max)),el('strong',null,money(price)));section.append(row);min=max+1}grid.append(section)
  }
 }
 async function refresh(){
  const v=++serial;notice.textContent=t.loading
  try{const [c,a,st,p]=await Promise.all([api('/api/store/catalog',signal),optional('/api/commerce/account'),optional('/api/commerce/test-status'),profiles.get().catch(()=>null)]);const sb=st?.enabled?await optional('/api/commerce/test-account'):null;if(signal.aborted||v!==serial)return;catalog=c;account=a;sandbox=sb;profile=p;if(!initialized){testMode=!!sandbox;initialized=true}if(!sandbox)testMode=false;render()}catch{if(!signal.aborted&&v===serial)notice.textContent=t.error}
 }
 const timer=setInterval(()=>{if(!busy&&testMode&&sandbox?.orders?.some(o=>o.status==='pending'&&o.paymentId||o.status==='succeeded'&&o.refundRequestedAt))void refresh()},15000)
 signal.addEventListener('abort',()=>clearInterval(timer),{once:true})
 void refresh()
}
