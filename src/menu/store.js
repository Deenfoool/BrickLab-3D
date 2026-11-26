import {createProfileClient} from './profile-client.js?v=cloud-profile-1'
import {applySignature,themeBadge,themePlate,signatureFor,mountThemeCover} from './profile-signature.js?v=signature-art-1'
import {themeFor} from './store-themes.js?v=themes-2'
import {commerceProducts,themePrices,instructionTiers,productById} from './commerce-catalog.js?v=commerce-plus-2'
import {commerceBadge,productArtwork,factsPanel,planSaving} from './commerce-visuals.js?v=merch-1'
const labels={
 ru:{title:'BrickLab Store',intro:'Оформление мастерской. Основные функции редактора остаются бесплатными.',disabled:'Темы доступны для просмотра. Оплата откроется после подключения платёжной системы ЮKassa.',test:'Тестовый режим · реальные деньги не списываются. Покупки доступны только администратору.',login:'Войти в аккаунт',buy:'Тестовая покупка',owned:'Получено в тестовом инвентаре',resume:'Продолжить тестовую оплату',consent:'Подтверждаю, что это тестовая оплата без реального списания и без выдачи платного товара.',history:'Мои тестовые заказы',finance:'BrickLab Finance · тестовый режим',financeNote:'Суммы ниже — виртуальные тестовые операции, не выручка.',total:'Заказов',paid:'Подтверждено',amount:'Тестовый оборот',pending:'Ожидает подтверждения',complete:'Подтверждён',refresh:'Обновить статус',error:'Не удалось выполнить запрос. Попробуй ещё раз.',wait:'Если оплата завершена, дождись уведомления Robokassa и обнови статус.',profile:'Мой инвентарь',carbon:'Карбон',neon:'Неоновая мастерская',noOrders:'Заказов пока нет',loading:'Загрузка…'},
 en:{title:'BrickLab Store',intro:'Customize your workshop. Core editor features stay free.',disabled:'Themes are available to preview. Checkout opens after YooKassa is connected.',test:'Test mode · no real charges. Only administrators can test checkout.',login:'Sign in',buy:'Test purchase',owned:'Received in test inventory',resume:'Resume test payment',consent:'I understand this is a test transaction with no real charge or paid product delivery.',history:'My test orders',finance:'BrickLab Finance · test mode',financeNote:'Amounts below are simulated transactions, not revenue.',total:'Orders',paid:'Confirmed',amount:'Test volume',pending:'Awaiting confirmation',complete:'Confirmed',refresh:'Refresh status',error:'Request failed. Please try again.',wait:'If you completed payment, wait for Robokassa confirmation and refresh.',profile:'My inventory',carbon:'Carbon',neon:'Neon workshop',noOrders:'No orders yet',loading:'Loading…'}}
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n}
const button=(text,fn)=>{const b=el('button','workspace-action',text);b.type='button';b.onclick=fn;return b}
const link=(text,href)=>{const a=el('a','workspace-action',text);a.href=href;return a}
async function api(path,signal,data){
 const response=await fetch(path,{signal,credentials:'same-origin',cache:'no-store',redirect:'error',...(data===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})})
 if(!response.ok){const d=await response.json().catch(()=>null);throw Object.assign(Error('Store request failed'),{status:response.status,code:d?.error})}
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
 const orderNo=n=>'BL-'+String(n??'').padStart(6,'0')
 const errorText=e=>({verified_account_required:tr('Подтверди электронную почту перед покупкой.','Verify your email before purchasing.'),invalid_receipt_url:tr('Нужна ссылка на чек из «Мой налог».','Use an official My Tax receipt link.'),receipt_already_used:tr('Чек уже привязан к другому заказу.','Receipt already used.'),checkout_pending:tr('Заверши предыдущую оплату.','Finish the previous payment.')})[e.code]??t.error+' ('+(e.status??'network')+')'
 const profiles=createProfileClient(),nav=el('div','commerce-preview-nav'),grid=el('div','store-grid'),notice=el('p','account-muted'),summary=el('section','store-orders')
 notice.setAttribute('role','status')
 const categories=[['all',tr('Все товары','All products')],['subscription','BrickLab Plus'],['theme',tr('Темы','Themes')],['themeBundle',tr('Коллекции','Collections')],['storage',tr('Облачные проекты','Cloud projects')],['badge',tr('Значки','Badges')],['instruction',tr('Инструкции','Instructions')],['orders',tr('Мои покупки','My purchases')],['ledger',tr('Финансы','Finance')]]
 const sectionCopy={
  subscription:tr('Больше возможностей для твоей мастерской на выбранный срок.','More room and tools for your workshop for a chosen term.'),
  theme:tr('Индивидуальный стиль профиля и мастерской.','A personal look for your profile and workshop.'),
  themeBundle:tr('Все шесть фирменных оформлений в одном наборе.','All six signature styles in one collection.'),
  storage:tr('Расширяй облачное пространство разовыми покупками.','Expand your cloud space with one-time purchases.'),
  badge:tr('Коллекционные эмблемы поддержки — от первого значка до Founder’s Club.','Collectible supporter insignia, from the first badge to Founder’s Club.'),
  instruction:tr('Интерактивные подсказки для поддерживаемых наборов.','Interactive hints for supported sets.')
 }
 const tabs=new Map(),header=el('div','store-banner'),heading=el('div'),art=el('div','store-banner-art')
 heading.append(el('span','store-kicker','BRICKLAB STORE'),el('h2',null,tr('Расширь свою мастерскую','Expand your workshop')),el('p',null,tr('Темы, облачное пространство, коллекции и Plus. Основной редактор бесплатный.','Themes, cloud space, collections and Plus. The core editor is free.')))
 for(const id of ['carbon','neon','aurora'])art.append(themePreview(themeFor(id),language));header.append(heading,art)
 let selected='all',catalog=null,profile=null,account=null,checkoutStatus=null,ledger=null,testMode=false,busy=false,serial=0
 try{if(sessionStorage.getItem('bricklab-commerce-return')==='1'){selected='orders';sessionStorage.removeItem('bricklab-commerce-return')}}catch{}
 const refreshButton=button(tr('Обновить покупки','Refresh purchases'),()=>refresh())
 for(const [id,label] of categories){const b=button(label,()=>{selected=id;render()});tabs.set(id,b);nav.append(b)}
 nav.append(refreshButton)
 const legal=el('section','store-orders'),links=el('div','commerce-preview-nav')
 legal.append(el('h2',null,tr('Получение и условия','Delivery and terms')),el('p',null,tr('Цифровые покупки закрепляются за аккаунтом после подтверждения оплаты. Физической доставки нет. Доступ и историю заказов можно посмотреть в мастерской.','Digital purchases are linked to your account after confirmation. No physical delivery. View purchases in your workshop.')))
 for(const [title,path] of [[tr('Оферта','Offer'),'/offer'],[tr('Получение и возврат','Refunds'),'/refund'],[tr('Конфиденциальность','Privacy'),'/privacy'],[tr('Реквизиты','Seller details'),'/requisites']]){const a=link(title,path);a.target='_blank';a.rel='noopener';links.append(a)}legal.append(links)
 root.replaceChildren(header,nav,notice,summary,grid,legal)
 const optional=path=>api(path,signal).catch(e=>{if(e.status===401||e.status===403)return null;throw e})
 const safeUrl=value=>{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port||!['yoomoney.ru','yookassa.ru','www.yoomoney.ru','www.yookassa.ru'].includes(u.hostname))throw Error('checkout_url');return u.href}
 function orderIdentity(p,title){
  const wrap=el('div','commerce-order-identity')
  const mark=p?.kind==='badge'?commerceBadge(p.id):p?.kind==='subscription'?commerceBadge('plus'):null
  if(mark)wrap.append(mark)
  wrap.append(el('h3',null,title));return wrap
 }
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
 function collectionArt(){
  const art=el('div','commerce-collection-art')
  for(const id of Object.keys(themePrices))art.append(themePreview(themeFor(id),language))
  return art
 }
 function showCheckout(p){
  if(busy||signal.aborted)return
  busy=true
  const dialog=el('dialog','store-preview-dialog'),label=el('label','store-consent'),accept=el('input'),status=el('p','account-muted'),price=el('strong','store-price',money(p.priceKopecks))
  accept.type='checkbox';label.append(accept,el('span',null,testMode?tr('Принимаю условия проверки. Тестовая оплата без списания; доступ только в режиме проверки.','I accept the test conditions. No charge; access only during testing.'):tr('Принимаю оферту и условия возврата.','I accept the offer and refund terms.')))
  const mode=testMode?'test':'live';let quote=null
  const pay=button(tr('Перейти к оплате','Proceed to payment'),async()=>{
   if(!accept.checked||!quote)return;pay.disabled=true
   try{
    const result=await api('/api/commerce/checkout',signal,{sku:p.id,amountKopecks:quote.amountKopecks,offerVersion:quote.offerVersion,accepted:true,mode})
    if(result.mode!==mode)throw Error('mode');if(result.checkoutUrl){const url=safeUrl(result.checkoutUrl);try{sessionStorage.setItem('bricklab-commerce-return','1')}catch{}location.assign(url);return}
    status.textContent=result.status==='succeeded'?tr('Оплата подтверждена.','Payment confirmed.'):tr('Платёж отменён.','Payment canceled.');await refresh()
   }catch(e){status.textContent=errorText(e);pay.disabled=!accept.checked}
  })
  pay.disabled=true;accept.onchange=()=>pay.disabled=!accept.checked||!quote
  const close=button(tr('Закрыть','Close'),()=>dialog.close())
  const visual=p.kind==='theme'?themePreview(themeFor(p.id),language):p.kind==='themeBundle'?collectionArt():productArtwork(p,language)
  dialog.append(el('h2',null,productTitle(p)))
  if(visual){visual.classList.add('commerce-checkout-art');dialog.append(visual)}
  dialog.append(el('p','account-muted',description(p)),price,label,pay,close,status)
  {const a=link(tr('Оферта','Offer'),'/offer');a.target='_blank';a.rel='noopener';dialog.append(a);void api('/api/commerce/quote?sku='+encodeURIComponent(p.id),signal).then(q=>{if(q.mode!==mode)throw Error('mode_changed');quote=q;price.textContent=money(q.amountKopecks);pay.disabled=!accept.checked}).catch(e=>status.textContent=errorText(e))}
  dialog.addEventListener('close',()=>{busy=false;dialog.remove()},{once:true});signal.addEventListener('abort',()=>{if(dialog.open)dialog.close()},{once:true});root.append(dialog);dialog.showModal()
 }
 function render(){
  if(!catalog||signal.aborted)return
  const a=account,products=[...catalog.products.map(p=>({id:p.sku,kind:'theme',title:p.title,priceKopecks:p.amountKopecks})),...commerceProducts,...(testMode?[{id:'instruction-42215-1',kind:'instruction',title:'Volvo 42215 · '+tr('интерактивные подсказки','interactive hints'),priceKopecks:17900}]:[])]
  for(const [id,b] of tabs){b.classList.toggle('primary',selected===id);b.setAttribute('aria-pressed',String(selected===id))}
  const adminTab=tabs.get('ledger');if(adminTab)adminTab.hidden=!ledger;
  notice.textContent=testMode?tr('ТЕСТ · Оплата без списания. Тестовые права администратора действуют до переключения кассы в боевой режим.','TEST · No charge. Administrator test entitlements apply until switching to live.'):catalog.live?tr('Оплата через ЮKassa.','Payment via YooKassa.'):tr('Оплата пока закрыта. Темы — первый ассортимент; остальные товары готовятся к выпуску.','Checkout closed. Themes are the first assortment; other products are in preparation.')
  grid.replaceChildren();summary.replaceChildren();summary.hidden=!a
  if(a){
   summary.classList.add('commerce-account-strip')
   const head=el('div','commerce-account-header');head.append(el('h2',null,tr('Моя мастерская','My workshop')))
   if(a.plus===true)head.append(commerceBadge('plus'))
   else head.append(el('small','account-muted',tr('Базовый аккаунт','Basic account')))
   const limits=el('div','commerce-product-facts')
   for(const [value,label] of [[a.limits.projects,tr('Проекты','Projects')],[a.limits.storageMiB+' MiB',tr('Хранилище','Storage')],[a.limits.versions,tr('Версии на проект','Revisions per project')],[a.themes.length,tr('Темы','Themes')],[a.badges.length,tr('Значки','Badges')]]){
    const cell=el('div');cell.append(el('strong',null,String(value)),el('small',null,label));limits.append(cell)
   }
   summary.append(head,limits)
   if(a.plus===true)summary.append(el('small','account-muted',tr('Plus активен до ','Plus active until ')+new Date(a.plusUntil).toLocaleDateString(language)))
  }
  if(selected==='ledger'){
   if(!ledger)return
   const totals=ledger.totals
   if(totals){
    const metrics=el('section','store-orders');metrics.style.gridColumn='1 / -1'
    metrics.append(el('h2',null,(testMode?tr('Тестовый оборот · ','Sandbox volume · '):tr('Оборот · ','Daily volume · '))+totals.day+' · МСК'))
    const values=el('div','store-grid')
    for(const [label,value] of [[tr('Оплаты','Payments')+' · '+totals.paid_count,totals.paid_kopecks],[tr('Возвраты','Refunds')+' · '+totals.refund_count,totals.refunded_kopecks],[tr('Итого до комиссий','Net before fees'),Number(totals.paid_kopecks)-Number(totals.refunded_kopecks)]]){
     const metric=el('article','commerce-preview-card');metric.append(el('p','account-muted',label),el('strong','store-price',money(value)));values.append(metric)
    }
    metrics.append(values);grid.append(metrics)
   }
   for(const o of ledger.orders){
    const card=el('article','commerce-preview-card');card.append(orderIdentity(products.find(p=>p.id===o.sku),o.title),el('strong','store-price',money(o.amount_kopecks)),el('p','account-muted',o.display_name+' · '+o.email),el('p',null,o.status),el('small','account-muted',orderNo(o.order_number)))
    if(checkoutStatus?.enabled&&o.status==='succeeded'){
     const refund=button(tr('Полный возврат','Full refund'),async()=>{if(!window.confirm((testMode?tr('Тестовый возврат ','Test refund '):tr('Вернуть реальные деньги ','Refund real money '))+money(o.amount_kopecks)+'?'))return;refund.disabled=true;try{const result=await api('/api/commerce/refund',signal,{orderId:o.id,confirm:true,mode:checkoutStatus.mode});await refresh();notice.textContent=tr('Возврат: ','Refund: ')+result.status}catch(e){notice.textContent=errorText(e);refund.disabled=false}});card.append(refund)
    }
    if(!testMode&&o.status==='succeeded'&&o.receipt_status==='pending'){
     card.append(el('p','account-muted',tr('Сформируй чек в «Мой налог» на указанную сумму, вставь ссылку. BrickLab отправит её покупателю.','Create an NPD receipt in My Tax and paste the link. BrickLab emails it to the customer.')))
     const input=el('input','account-field');input.placeholder='https://lknpd.nalog.ru/api/v1/receipt/…/print';input.maxLength=250
     const confirm=button(tr('Отправить чек покупателю','Send receipt to customer'),async()=>{if(!input.value.trim()||!window.confirm(tr('Подтверждаешь, что чек сформирован в ФНС и соответствует заказу и сумме?','Confirm the FNS receipt matches the order and amount?')))return;confirm.disabled=true;try{await api('/api/commerce/admin-register-receipt',signal,{orderId:o.id,url:input.value.trim(),confirm:true});await refresh()}catch(e){notice.textContent=errorText(e);confirm.disabled=false}})
     card.append(input,confirm)
    }else if(!testMode)card.append(el('p','account-muted',tr('Чек: ','Receipt: ')+(o.receipt_delivery_url?(o.receipt_delivery_sent_at?tr('Письмо принято почтовым сервисом','Email accepted'):tr('Ожидает отправки','Queued')):o.receipt_status)))
    if(!testMode&&o.receipt_correction_pending){
     card.append(el('p','account-muted',tr('После возврата требуется корректировка расчёта в «Мой налог».','Correct the fiscal record after the refund.')))
     const input=el('input','account-field');input.placeholder=tr('Номер или основание корректировки','Correction reference');input.maxLength=250
     const confirm=button(tr('Корректировка выполнена','Correction completed'),async()=>{if(!input.value.trim()||!window.confirm(tr('Подтвердить фактически выполненную корректировку в «Мой налог»?','Confirm that the fiscal correction is complete?')))return;confirm.disabled=true;try{await api('/api/commerce/admin-receipt-correction',signal,{orderId:o.id,reference:input.value.trim(),confirm:true});await refresh()}catch{notice.textContent=t.error;confirm.disabled=false}})
     card.append(input,confirm)
    }

    grid.append(card)
   }
   return
  }
  if(selected==='orders'){
   if(!a){grid.append(link(t.login,'#account'));return}
   for(const o of a.orders??[]){const card=el('article','commerce-preview-card'),p=products.find(p=>p.id===o.sku);card.append(orderIdentity(p,p?productTitle(p):o.title),el('strong','store-price',money(o.amountKopecks)),el('p','account-muted',({pending:tr('Ожидает оплаты','Pending'),succeeded:tr('Оплачено','Paid'),canceled:tr('Отменено','Canceled'),refunded:tr('Возвращено','Refunded')})[o.status]??o.status),el('small','account-muted',orderNo(o.orderNumber)));if(!testMode&&o.receiptStatus==='pending')card.append(el('p','account-muted',tr('Чек формируется','Receipt pending')));if(!testMode&&o.receiptUrl&&/^https:\/\/lknpd\.nalog\.ru\/api\/v1\/receipt\/[0-9]{12}\/[A-Za-z0-9_-]{1,80}\/print$/.test(o.receiptUrl)){const receipt=link(tr('Чек НПД','NPD receipt'),o.receiptUrl);receipt.target='_blank';receipt.rel='noopener noreferrer';card.append(receipt)}if(o.status==='pending'&&p&&checkoutStatus?.enabled&&checkoutStatus.skus.includes(p.id))card.append(button(tr('Продолжить оплату','Resume checkout'),()=>showCheckout(p)));if(testMode&&o.status==='succeeded'){const refund=button(o.refundRequestedAt?tr('Проверить возврат','Check refund'):tr('Тестовый возврат','Test refund'),async()=>{if(!o.refundRequestedAt&&!window.confirm(tr('Вернуть всю тестовую сумму и отозвать приобретение?','Refund the full test amount and revoke the entitlement?')))return;refund.disabled=true;try{const result=await api('/api/commerce/refund',signal,{orderId:o.id,confirm:true,mode:checkoutStatus.mode});await refresh();notice.textContent=tr('Возврат: ','Refund: ')+result.status}catch(e){notice.textContent=errorText(e);refund.disabled=false}});card.append(refund)}grid.append(card)}
   if(!(a.orders??[]).length)grid.append(el('p','account-muted',t.noOrders))
   grid.append(link(tr('Перейти в мастерскую','Open workshop'),'#account'));return
  }
  const ordered=['subscription','theme','themeBundle','storage','badge',...(testMode?['instruction']:[])]
  for(const kind of ordered){if(selected!=='all'&&selected!==kind)continue
   const section=el('section','store-orders commerce-store-section'),items=el('div','store-grid'),head=el('div','commerce-section-heading'),heading=el('div')
   const assortment=products.filter(p=>p.kind===kind)
   section.dataset.kind=kind;section.style.gridColumn='1 / -1'
   heading.append(el('h2',null,categories.find(c=>c[0]===kind)[1]),el('p','account-muted',sectionCopy[kind]))
   head.append(heading,el('span','commerce-section-count',String(assortment.length).padStart(2,'0')))
   section.append(head,items);grid.append(section)
   for(const p of assortment){
    const card=el('article','store-product commerce-merch'),copy=el('div','store-product-body'),footer=el('div','commerce-merch-footer')
    const visual=kind==='theme'?themePreview(themeFor(p.id),language):kind==='themeBundle'?collectionArt():productArtwork(p,language)
    if(visual)card.append(visual)
    copy.append(el('h3',null,productTitle(p)),el('p','account-muted',description(p)))
    if(kind==='badge')copy.append(el('small','account-muted',p.betaOnly?tr('Коллекционная серия ОБТ','Open beta collection'):tr('Уровень поддержки '+p.rank,'Support tier '+p.rank)))
    const facts=factsPanel(p,language);if(facts)copy.append(facts)
    if(kind==='subscription'&&planSaving(p)>0)copy.append(el('small','commerce-plan-saving',tr('На '+planSaving(p)+'% меньше, чем помесячно','Save '+planSaving(p)+'% vs monthly list price')))
    const has=owned(p,a),available=checkoutStatus?.enabled&&checkoutStatus.skus.includes(p.id)||!a&&catalog.live&&catalog.liveSkus?.includes(p.id)
    footer.append(el('strong','store-price',money(p.priceKopecks)))
    if(kind==='subscription')footer.append(el('small','account-muted',tr('За весь срок · без автопродления','Total term · no auto-renewal')))
    if(has)footer.append(el('span','commerce-owned',tr('Приобретено','Owned')))
    if(kind==='theme'){
     const theme=themeFor(p.id),dialog=el('dialog','store-preview-dialog');dialog.append(el('h2',null,productTitle(p)),themePreview(theme,language,true),communityExamples(theme,language),button(tr('Закрыть','Close'),()=>dialog.close()));footer.append(button(tr('Примерить','Preview'),()=>dialog.showModal()),dialog)
     if(profile?.inventory?.some(i=>i.id===p.id&&i.owned)){const equip=button(tr('Применить','Equip'),async()=>{equip.disabled=true;try{const current=await profiles.get();await profiles.save({bio:current.profile.bio,cover:current.profile.cover,background:p.id});await refresh()}catch{notice.textContent=t.error;equip.disabled=false}});footer.append(equip)}
    }
    if(has&&kind!=='theme')footer.append(link(tr('Открыть мастерскую','Open workshop'),'#account'))
    if(available&&(!has||kind==='storage'||kind==='subscription')){
     const buy=button(kind==='subscription'&&a?.plus===true?tr('Продлить','Extend'):tr('Купить','Buy'),()=>{if(!a){location.hash='#account';return}showCheckout(p)});buy.classList.add('primary');footer.append(buy)
    }else if(!available&&!has)footer.append(el('small','account-muted',kind==='theme'?tr('Оплата скоро','Checkout coming soon'):tr('Подготовка к выпуску','In preparation')))
    copy.append(footer);card.append(copy);items.append(card)
   }
  }
  if(selected==='all'||selected==='instruction'){
   const section=el('section','store-orders');section.style.gridColumn='1 / -1';section.append(el('h2',null,tr('Интерактивные инструкции','Interactive instructions')),el('p','account-muted',tr('Во время ОБТ бесплатно. PDF и ручной поиск останутся бесплатными. Продажа отдельных наборов начнётся после проверки распознавания.','Free during open beta. PDF and manual search remain free. Individual sets launch after recognition audit.')))
   const guide=productArtwork({kind:'instruction'},language);guide.classList.add('commerce-guide-banner');section.append(guide)
   const prices=el('div','commerce-instruction-prices');let min=1;for(const [max,price] of instructionTiers){const row=el('div','commerce-preview-tier');row.append(el('span',null,min+'–'+(max===Number.MAX_SAFE_INTEGER?'∞':max)+tr(' деталей',' parts')),el('strong',null,money(price)));prices.append(row);min=max+1}section.append(prices);grid.append(section)
  }
 }
 async function refresh(){
  const v=++serial;notice.textContent=t.loading
  try{const [c,a,st,p]=await Promise.all([api('/api/store/catalog',signal),optional('/api/commerce/account'),optional('/api/commerce/status'),profiles.get().catch(()=>null)]);const adminLedger=st?.admin?await optional('/api/commerce/admin-ledger?environment='+st.mode):null;if(signal.aborted||v!==serial)return;catalog=c;account=a;checkoutStatus=st;profile=p;ledger=adminLedger;testMode=st?.mode==='test'&&st?.admin===true;if(selected==='ledger'&&!ledger)selected='all';render()}catch{if(!signal.aborted&&v===serial)notice.textContent=t.error}
 }
 const timer=setInterval(()=>{if(!busy&&account?.orders?.some(o=>o.status==='pending'&&o.paymentId||o.status==='succeeded'&&o.refundRequestedAt))void refresh()},15000)
 signal.addEventListener('abort',()=>clearInterval(timer),{once:true})
 void refresh()
}
