import {createProfileClient} from './profile-client.js?v=cloud-profile-1'
import {applySignature,themeBadge,themePlate,signatureFor,mountThemeCover} from './profile-signature.js?v=signature-art-1'
import {themeFor} from './store-themes.js?v=themes-2'
import {commerceProducts,themePrices,productById} from './commerce-catalog.js?v=instruction-store-1'
import {commerceBadge,productArtwork,factsPanel,planSaving} from './commerce-visuals.js?v=merch-2'
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
 const errorText=e=>({verified_account_required:tr('Подтверди электронную почту перед покупкой.','Verify your email before purchasing.'),invalid_receipt_url:tr('Нужна ссылка на чек из «Мой налог».','Use an official My Tax receipt link.'),receipt_already_used:tr('Чек уже привязан к другому заказу.','Receipt already used.'),checkout_pending:tr('Заверши предыдущую оплату.','Finish the previous payment.'),payment_mismatch:tr('Платёж не соответствует заказу. Проверь ID, сумму и режим в ЮKassa.','Payment does not match the order. Verify ID, amount and mode in YooKassa.'),partial_refund_requires_review:tr('Частичный возврат требует ручной сверки.','Partial refund requires manual review.'),order_reconciliation_required:tr('Платёж требует сверки. Не оплачивай повторно — обратись в поддержку.','Payment requires reconciliation. Do not pay again; contact support.'),refund_reconciliation_required:tr('Возврат требует сверки в ЮKassa. Не повторяй вручную.','Refund requires YooKassa reconciliation. Do not repeat manually.')})[e.code]??t.error+' ('+(e.status??'network')+')'
 const profiles=createProfileClient(),nav=el('div','commerce-preview-nav'),grid=el('div','store-grid'),notice=el('p','account-muted'),summary=el('section','store-orders')
 notice.setAttribute('role','status')
 const categories=[['all',tr('Все товары','All products')],['subscription','BrickLab Plus'],['theme',tr('Темы','Themes')],['themeBundle',tr('Коллекции','Collections')],['storage',tr('Облачные проекты','Cloud projects')],['badge',tr('Значки','Badges')],['orders',tr('Мои покупки','My purchases')],['ledger',tr('Финансы','Finance')],['analytics',tr('Аналитика','Analytics')]]
 const sectionCopy={
  subscription:tr('Больше возможностей для твоей мастерской на выбранный срок.','More room and tools for your workshop for a chosen term.'),
  theme:tr('Индивидуальный стиль профиля и мастерской.','A personal look for your profile and workshop.'),
  themeBundle:tr('Все шесть фирменных оформлений в одном наборе.','All six signature styles in one collection.'),
  storage:tr('Расширяй облачное пространство разовыми покупками.','Expand your cloud space with one-time purchases.'),
  badge:tr('Коллекционные эмблемы поддержки — от первого значка до Founder’s Club.','Collectible supporter insignia, from the first badge to Founder’s Club.')
 }
 const tabs=new Map(),header=el('div','store-banner'),heading=el('div'),art=el('div','store-banner-art')
 heading.append(el('span','store-kicker','BRICKLAB STORE'),el('h2',null,tr('Расширь свою мастерскую','Expand your workshop')),el('p',null,tr('Темы, облачное пространство, коллекции и Plus. Основной редактор бесплатный.','Themes, cloud space, collections and Plus. The core editor is free.')))
 for(const id of ['carbon','neon','aurora'])art.append(themePreview(themeFor(id),language));header.append(heading,art)
 let returnOrder=null,returnStatus=null,returnChecks=0,returnBusy=false;
 let selected='all',catalog=null,profile=null,account=null,checkoutStatus=null,ledger=null,health=null,providerTotals=null,analytics=null,testMode=false,busy=false,serial=0
 try{const raw=sessionStorage.getItem('bricklab-commerce-return');if(raw){selected='orders';sessionStorage.removeItem('bricklab-commerce-return');if(raw!=='1'){const v=JSON.parse(raw);if(/^[a-f0-9-]{36}$/i.test(v.id)&&['test','live'].includes(v.mode))returnOrder=v}}}catch{}
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
  if(p.kind==='instruction')return p.setId+' · '+p.partCount.toLocaleString(language)+tr(' деталей. Интерактивные подсказки BrickLab; PDF бесплатен.',' pieces. BrickLab interactive hints; the PDF is free.')
  if(p.kind==='themeBundle')return tr('Все шесть тем мастерской.','All six workshop themes.')
  return tr('Коллекционный значок поддержки. Можно выбрать для публичного профиля.','Collectible supporter badge for your public profile.')
 }
 function owned(p,a){return p.kind==='theme'?a?.themes?.includes(p.id):p.kind==='badge'?a?.badges?.includes(p.id):p.kind==='instruction'?a?.instructions?.includes(p.setId):p.kind==='themeBundle'?Object.keys(themePrices).every(id=>a?.themes?.includes(id)):false}
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
  const mode=testMode?'test':'live',checkoutKey=crypto.randomUUID();let quote=null,paying=false,finished=false
  const pay=button(tr('Перейти к оплате','Proceed to payment'),async()=>{
   if(paying||finished||!accept.checked||!quote)return;paying=true;pay.disabled=true;accept.disabled=true;close.disabled=true
   try{
    const result=await api('/api/commerce/checkout',signal,{sku:p.id,amountKopecks:quote.amountKopecks,offerVersion:quote.offerVersion,accepted:true,mode,checkoutKey})
    if(result.mode!==mode)throw Error('mode');if(result.checkoutUrl){const url=safeUrl(result.checkoutUrl);try{sessionStorage.setItem('bricklab-commerce-return',JSON.stringify({id:result.orderId,mode}))}catch{}location.assign(url);return}
    finished=true;status.textContent=result.status==='partially_refunded'?tr('Платёж частично возвращён. Обратись в поддержку.','Payment partially refunded. Contact support.'):result.status==='succeeded'?tr('Оплата подтверждена.','Payment confirmed.'):result.status==='refunded'?tr('Средства возвращены.','Payment refunded.'):tr('Платёж отменён.','Payment canceled.');await refresh()
   }catch(e){status.textContent=errorText(e)}finally{paying=false;accept.disabled=finished;close.disabled=false;pay.disabled=finished||!accept.checked||!quote}
  })
  pay.disabled=true;accept.onchange=()=>pay.disabled=paying||finished||!accept.checked||!quote
  const close=button(tr('Закрыть','Close'),()=>dialog.close())
  const visual=p.kind==='theme'?themePreview(themeFor(p.id),language):p.kind==='themeBundle'?collectionArt():productArtwork(p,language)
  dialog.append(el('h2',null,productTitle(p)))
  if(visual){visual.classList.add('commerce-checkout-art');dialog.append(visual)}
  dialog.append(el('p','account-muted',description(p)),price,label,pay,close,status)
  {const a=link(tr('Оферта','Offer'),'/offer');a.target='_blank';a.rel='noopener';dialog.append(a);void api('/api/commerce/quote?sku='+encodeURIComponent(p.id),signal).then(q=>{if(q.mode!==mode)throw Error('mode_changed');quote=q;price.textContent=money(q.amountKopecks);pay.disabled=!accept.checked}).catch(e=>status.textContent=errorText(e))}
  dialog.addEventListener('cancel',e=>{if(paying)e.preventDefault()});dialog.addEventListener('close',()=>{busy=false;dialog.remove()},{once:true});signal.addEventListener('abort',()=>{if(dialog.open)dialog.close()},{once:true});root.append(dialog);dialog.showModal()
 }
 function render(){
  if(!catalog||signal.aborted)return
  const a=account,products=[...catalog.products.map(p=>({id:p.sku,kind:'theme',title:p.title,priceKopecks:p.amountKopecks})),...commerceProducts,...(catalog.instructions??[])]
  for(const [id,b] of tabs){b.classList.toggle('primary',selected===id);b.setAttribute('aria-pressed',String(selected===id))}
  const adminTab=tabs.get('ledger');if(adminTab)adminTab.hidden=!ledger;tabs.get('analytics').hidden=!checkoutStatus?.admin;
  notice.textContent=checkoutStatus?.scope==='pilot'?tr('КОНТРОЛЬНАЯ ПОКУПКА · Реальное списание, доступно только администратору.','LIVE PILOT · Real charge, administrator only.'):testMode?tr('ТЕСТ · Оплата без списания. Тестовые права администратора действуют до переключения кассы в боевой режим.','TEST · No charge. Administrator test entitlements apply until switching to live.'):catalog.live?tr('Оплата через ЮKassa.','Payment via YooKassa.'):tr('Оплата пока закрыта. Темы — первый ассортимент; остальные товары готовятся к выпуску.','Checkout closed. Themes are the first assortment; other products are in preparation.')
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
  if(selected==='analytics'){
   const panel=el('section','store-orders');panel.style.gridColumn='1 / -1';
   panel.append(el('h2',null,tr('Интерактивность · последние 90 дней','Interactive access · last 90 days')),el('p','account-muted',tr('Авторизованные пользователи, без администратора. События: один пользователь, набор, действие и день. Покупки — только реальные, не тестовые.','Signed-in users, excluding admins from activity. Events: one user, set, action and day. Real purchases only.')));
   if(!analytics){panel.append(el('p','account-muted',tr('Данные недоступны','Data unavailable')));grid.append(panel);return}
   const stats=el('div','store-grid')
   for(const [label,value] of [[tr('Активные аккаунты','Active accounts'),analytics.activeUsers],[tr('Подарочные доступы','Welcome grants'),analytics.welcomeClaims],[tr('First Builder','First Builder'),analytics.firstBuilders],[tr('Покупатели','Buyers'),analytics.buyers],[tr('Оплаченные наборы без возврата','Non-refunded purchases'),analytics.paidOrders],[tr('Повторные покупатели','Repeat buyers'),analytics.repeatBuyers],[tr('Возвращённые покупки','Refunded purchases'),analytics.refundedOrders],[tr('Выручка до комиссий, без возвратов','Revenue before fees, excluding refunds'),money(analytics.netKopecks)],[tr('Выручка на активный аккаунт','Revenue per active account'),analytics.activeUsers?money(Number(analytics.netKopecks)/Number(analytics.activeUsers)):'—']]){
    const c=el('article','commerce-preview-card');c.append(el('p','account-muted',label),el('strong','store-price',String(value)));stats.append(c)
   }
   panel.append(stats,el('h3',null,tr('Воронка взаимодействия','Engagement funnel')));
   for(const [id,ruLabel,enLabel] of [['set_open','Открыли набор','Opened set'],['build_start','Начали сборку','Started build'],['hint_use','Использовали подсказку','Used hint'],['offer_view','Увидели оплату','Saw offer'],['checkout_click','Перешли к оплате','Clicked checkout']]){
    const v=analytics.events.find(e=>e.event===id);panel.append(el('p',null,tr(ruLabel,enLabel)+': '+(v?.users??0)+' · '+tr('событий ','events ')+(v?.interactions??0)))
   }
   panel.append(el('h3',null,tr('Популярные наборы','Popular sets')));for(const row of analytics.popular)panel.append(el('p',null,row.set_id+' · '+row.users))
   grid.append(panel);return
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
   if(!testMode&&providerTotals){
    const settlement=el('section','store-orders');settlement.style.gridColumn='1 / -1';settlement.append(el('h2',null,tr('Расчёты с ЮKassa','YooKassa settlements')+' · '+providerTotals.day+' · МСК'),el('p','account-muted',tr('По данным API, не банковская выписка и не чистая прибыль. Налог НПД и расходы не вычтены.','Provider API data, not a bank statement or profit. NPD and operating expenses are not deducted.')));
    const values=el('div','store-grid');
    for(const [label,value] of [[tr('Сумма после удержаний · известные оплаты','After fees · known payments'),providerTotals.provider_income_kopecks],[tr('Комиссия и НДС · известные оплаты','Fees and VAT · known payments'),providerTotals.fees_kopecks],[tr('Возвраты','Refunds'),providerTotals.refunded_kopecks],[tr('Остаток после удержаний и возвратов','After fees and refunds'),providerTotals.net_after_provider_kopecks]]){const metric=el('article','commerce-preview-card');metric.append(el('small','account-muted',label),el('strong','store-price',value==null?'—':money(value)));values.append(metric)}
    settlement.append(values,el('small','account-muted',tr('Оплат без данных комиссии: ','Payments missing fee data: ')+providerTotals.unknown_count+' / '+providerTotals.paid_count));grid.append(settlement)
   }
   if(health){
    const ops=el('section','store-orders');ops.style.gridColumn='1 / -1';
    ops.append(el('h2',null,tr('Контроль операций','Operations monitor')),el('p','account-muted',tr('Все заказы текущего режима, не только последние 100.','All orders in this mode, not only the latest 100.')));
    const values=el('div','store-grid');
    for(const [key,label] of [['pending',tr('Ожидают оплаты','Pending payments')],['unattached_old',tr('Без ID платежа более 23 ч','Unattached >23h')],['refund_pending',tr('Ожидают возврата','Pending refunds')],['refund_unattached',tr('Возврат без ID','Refund ID missing')],['receipt_pending',tr('Ожидают чека','Receipts pending')],['receipt_unknown',tr('Неизвестный результат ФНС','Uncertain FNS result')],['early_refund',tr('Возврат до чека','Refund before receipt')],['correction_pending',tr('Ожидают корректировки','Corrections pending')],['partial_review',tr('Частичные возвраты на сверке','Partial refunds under review')],['mail_pending',tr('Чеки в почтовой очереди','Receipt mail queued')],['telegram_pending',tr('Уведомления в очереди','Notifications queued')]]){
     if(testMode&&['receipt_pending','receipt_unknown','early_refund','correction_pending','mail_pending'].includes(key))continue;
     const card=el('article','commerce-preview-card');card.append(el('small','account-muted',label),el('strong','store-price',String(health[key]??'—')));values.append(card)
    }
    ops.append(values);grid.append(ops)
   }
   for(const o of ledger.orders){
    const card=el('article','commerce-preview-card');card.append(orderIdentity(products.find(p=>p.id===o.sku),o.title),el('strong','store-price',money(o.amount_kopecks)),el('p','account-muted',o.display_name+' · '+o.email),el('p',null,o.status),el('small','account-muted',orderNo(o.order_number)))
    if(!testMode&&['succeeded','refunded'].includes(o.status))card.append(el('p','account-muted',o.provider_income_kopecks==null?tr('Удержания ЮKassa: нет данных','YooKassa fees: unknown'):tr('Удержания ЮKassa: ','YooKassa fees: ')+money(Number(o.amount_kopecks)-Number(o.provider_income_kopecks))));
    const uncertain=['issue_unknown','cancel_unknown'].includes(o.fiscal_state),early=!testMode&&o.status==='refunded'&&o.receipt_status==='pending'&&o.receipt_correction_pending;
    if(o.status==='pending'&&!o.payment_id)card.append(el('p','account-muted',tr('ID платежа ещё не получен. Не создавай повторный заказ вручную.','Payment ID not yet known. Do not manually create a replacement.')));
    if(o.status==='succeeded'&&o.refund_requested_at)card.append(el('p','account-muted',tr('Возврат запрошен; проверяется у ЮKassa.','Refund requested; checking YooKassa.')));
    if(checkoutStatus?.refundEnabled){
     const recovery=el('details','account-muted');recovery.append(el('summary',null,tr('Сверить с ЮKassa','Reconcile with YooKassa')),el('p',null,tr('Только запрос существующего платежа. Новых списаний и возвратов не будет.','Read-only provider lookup. No new charge or refund.')));
     const id=el('input','account-field');id.placeholder=tr('ID платежа из кабинета ЮKassa','Payment ID from YooKassa dashboard');id.maxLength=36;id.value=o.payment_id??'';id.readOnly=!!o.payment_id;
     const check=button(tr('Проверить операцию','Verify payment'),async()=>{if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id.value.trim())){notice.textContent=tr('Укажи корректный ID платежа.','Enter a valid payment ID.');return}check.disabled=true;try{const result=await api('/api/commerce/admin-reconcile',signal,{orderId:o.id,paymentId:id.value.trim(),mode:checkoutStatus.mode});await refresh();notice.textContent=tr('Результат сверки: ','Reconciliation: ')+result.status}catch(e){notice.textContent=errorText(e);check.disabled=false}});
     recovery.append(id,check);card.append(recovery)
    }
    if(checkoutStatus?.refundEnabled&&o.status==='succeeded'&&!o.refunded_kopecks){
     const refund=button(tr('Полный возврат','Full refund'),async()=>{if(!window.confirm((testMode?tr('Тестовый возврат ','Test refund '):tr('Вернуть реальные деньги ','Refund real money '))+money(o.amount_kopecks)+'?'))return;refund.disabled=true;try{const result=await api('/api/commerce/refund',signal,{orderId:o.id,confirm:true,mode:checkoutStatus.mode});await refresh();notice.textContent=tr('Возврат: ','Refund: ')+result.status}catch(e){notice.textContent=errorText(e);refund.disabled=false}});card.append(refund)
    }
    if(o.refunded_kopecks>0&&o.status!=='refunded')card.append(el('p','account-muted',tr('Частичный возврат: ','Partial refund: ')+money(o.refunded_kopecks)));
    if(!testMode&&o.partial_review_pending){
     card.append(el('p','account-muted',tr('Нужна налоговая сверка частичного возврата. Автоматическое оформление новых чеков по заказу остановлено. Проверь фактический чек и корректировку в ФНС.','Partial refund fiscal review required. Automatic new receipt operations are paused. Verify actual receipt and correction in FNS.')));
     if(!uncertain&&o.receipt_status==='issued'){
      const ref=el('input','account-field');ref.maxLength=250;ref.placeholder=tr('Подтверждение фактической корректировки','Actual correction reference');
      const done=button(tr('Подтвердить сверку','Confirm review'),async()=>{if(!ref.value.trim()||!window.confirm(tr('Подтверждаешь корректность налоговых записей и передачу необходимых чеков покупателю?','Confirm actual tax records and delivery of required receipts?')))return;done.disabled=true;try{await api('/api/commerce/admin-partial-review',signal,{orderId:o.id,refundedKopecks:Number(o.refunded_kopecks),reference:ref.value.trim(),confirm:true});await refresh()}catch(e){notice.textContent=errorText(e);done.disabled=false}});card.append(ref,done)
     }
    }
    if(!testMode&&uncertain){
     card.append(el('p','account-muted',tr('Результат операции ФНС неизвестен. Идёт сверка без повторной записи. Не формируй второй чек и не подтверждай корректировку до выяснения результата.','FNS result uncertain. Read-only reconciliation in progress. Do not issue a duplicate or confirm a correction.')))
    }else if(!testMode&&(o.status==='succeeded'||early)&&o.receipt_status==='pending'){
     card.append(el('p','account-muted',early?tr('Возврат до выдачи чека: проверь фактические записи в ФНС и согласованный порядок оформления. Добавь ссылку только на реально сформированный чек; доставку и аннулирование проверь вручную.','Refund before receipt: verify actual FNS records and the approved fiscal procedure. Register only an actual receipt; verify delivery and cancellation manually.'):tr('Если автоматизация не действует, добавь ссылку на фактически сформированный чек. BrickLab отправит её покупателю.','If automation is unavailable, register an actual receipt link. BrickLab emails it to the customer.')))
     const input=el('input','account-field');input.placeholder='https://lknpd.nalog.ru/api/v1/receipt/…/print';input.maxLength=250
     const confirm=button(early?tr('Зарегистрировать чек','Register receipt'):tr('Отправить чек покупателю','Send receipt to customer'),async()=>{if(!input.value.trim()||!window.confirm(tr('Подтверждаешь, что чек сформирован в ФНС и соответствует заказу и сумме?','Confirm the FNS receipt matches the order and amount?')))return;confirm.disabled=true;try{await api('/api/commerce/admin-register-receipt',signal,{orderId:o.id,url:input.value.trim(),confirm:true});await refresh()}catch(e){notice.textContent=errorText(e);confirm.disabled=false}})
     card.append(input,confirm)
    }else if(!testMode)card.append(el('p','account-muted',tr('Чек: ','Receipt: ')+(o.receipt_delivery_url?(o.receipt_delivery_sent_at?tr('Письмо принято почтовым сервисом','Email accepted'):tr('Ожидает отправки','Queued')):o.receipt_status)))
    if(!testMode&&o.receipt_correction_pending&&!o.partial_refund_seen&&!uncertain&&o.receipt_status==='issued'){
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
   if(returnOrder){
    const focus=el('section','store-orders');focus.style.gridColumn='1 / -1';focus.append(el('h2',null,tr('Статус последней оплаты','Latest checkout status')));
    if(returnStatus){const s=returnStatus;focus.append(el('p',null,orderNo(s.orderNumber)+' · '+s.title),el('strong','store-price',money(s.amountKopecks)),el('p',null,s.status==='succeeded'?(s.refundedKopecks>0?tr('Частичный возврат. Проверь историю покупок.','Partially refunded. Check purchase history.'):tr('Оплата подтверждена сервером. Покупка закреплена за аккаунтом.','Payment verified by the server. Purchase linked to your account.')):s.status==='refunded'?tr('Средства возвращены.','Payment refunded.'):s.status==='canceled'?tr('Платёж отменён.','Payment canceled.'):tr('Ожидаем подтверждения ЮKassa. Не оплачивай повторно.','Waiting for YooKassa confirmation. Do not pay again.')))}
    else focus.append(el('p','account-muted',a?tr('Подтверждение пока не получено. Проверь аккаунт и обнови статус.','Confirmation unavailable. Verify your account and refresh.'):tr('Войди в тот же аккаунт, с которого совершалась покупка.','Sign in to the account used for this purchase.')));
    focus.append(button(tr('Проверить статус','Check status'),()=>{returnChecks=0;void refresh()}),button(tr('Скрыть','Dismiss'),()=>{returnOrder=null;returnStatus=null;render()}));grid.append(focus)
   }
   if(!a){grid.append(link(t.login,'#account'));return}
   for(const o of a.orders??[]){const card=el('article','commerce-preview-card'),p=products.find(p=>p.id===o.sku);card.append(orderIdentity(p,p?productTitle(p):o.title),el('strong','store-price',money(o.amountKopecks)),el('p','account-muted',({pending:tr('Ожидает оплаты','Pending'),succeeded:tr('Оплачено','Paid'),canceled:tr('Отменено','Canceled'),refunded:tr('Возвращено','Refunded')})[o.status]??o.status),el('small','account-muted',orderNo(o.orderNumber)));if(o.refundedKopecks>0&&o.status!=='refunded')card.append(el('p','account-muted',tr('Частично возвращено: ','Partially refunded: ')+money(o.refundedKopecks)));if(!testMode&&o.receiptStatus==='pending')card.append(el('p','account-muted',tr('Чек формируется','Receipt pending')));if(!testMode&&o.receiptUrl&&/^https:\/\/lknpd\.nalog\.ru\/api\/v1\/receipt\/[0-9]{12}\/[A-Za-z0-9_-]{1,80}\/print$/.test(o.receiptUrl)){const receipt=link(tr('Чек НПД','NPD receipt'),o.receiptUrl);receipt.target='_blank';receipt.rel='noopener noreferrer';card.append(receipt)}if(p?.kind==='instruction'&&['pending','succeeded'].includes(o.status))card.append(button(tr('Открыть набор','Open set'),()=>{try{sessionStorage.setItem('bricklab-instruction-return',p.setId)}catch{}location.hash='#sets'}));else if(o.status==='pending'&&p&&checkoutStatus?.enabled&&checkoutStatus.skus.includes(p.id))card.append(button(tr('Продолжить оплату','Resume checkout'),()=>showCheckout(p)));if(testMode&&o.status==='succeeded'){const refund=button(o.refundRequestedAt?tr('Проверить возврат','Check refund'):tr('Тестовый возврат','Test refund'),async()=>{if(!o.refundRequestedAt&&!window.confirm(tr('Вернуть всю тестовую сумму и отозвать приобретение?','Refund the full test amount and revoke the entitlement?')))return;refund.disabled=true;try{const result=await api('/api/commerce/refund',signal,{orderId:o.id,confirm:true,mode:checkoutStatus.mode});await refresh();notice.textContent=tr('Возврат: ','Refund: ')+result.status}catch(e){notice.textContent=errorText(e);refund.disabled=false}});card.append(refund)}grid.append(card)}
   if(!(a.orders??[]).length)grid.append(el('p','account-muted',t.noOrders))
   grid.append(link(tr('Перейти в мастерскую','Open workshop'),'#account'));return
  }
  const ordered=['subscription','theme','themeBundle','storage','badge']
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
    if(kind==='badge'){
     copy.append(el('small','account-muted',p.betaOnly?tr('Коллекционная серия ОБТ','Open beta collection'):tr('Уровень поддержки '+p.rank,'Support tier '+p.rank)))
     const sample=el('div','commerce-badge-preview');sample.append(el('small','account-muted',tr('В профиле','In profile')),commerceBadge(p.id));copy.append(sample)
    }
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
 }
 async function readReturn(){
  if(!returnOrder||returnBusy||signal.aborted)return;
  returnBusy=true;const item=returnOrder;returnChecks++;
  try{const s=await api('/api/commerce/order-status?id='+encodeURIComponent(item.id)+'&mode='+item.mode,signal);if(returnOrder===item)returnStatus=s}catch{if(returnOrder===item)returnStatus=null}finally{returnBusy=false}
 }
 async function refresh(){
  const v=++serial;notice.textContent=t.loading
  await readReturn();
  try{const [c,a,st,p]=await Promise.all([api('/api/store/catalog',signal),optional('/api/commerce/account'),optional('/api/commerce/status'),profiles.get().catch(()=>null)]);const [adminLedger,adminAnalytics,adminHealth,adminProviderTotals]=st?.admin?await Promise.all([optional('/api/commerce/admin-ledger?environment='+st.mode),optional('/api/commerce/instruction-analytics').catch(()=>null),optional('/api/commerce/admin-health?environment='+st.mode).catch(()=>null),st.mode==='live'?optional('/api/commerce/admin-provider-totals?environment=live').catch(()=>null):null]):[null,null,null,null];if(signal.aborted||v!==serial)return;catalog=c;account=a;checkoutStatus=st;profile=p;ledger=adminLedger;health=adminHealth;providerTotals=adminProviderTotals;analytics=adminAnalytics;testMode=st?.mode==='test'&&st?.admin===true;if(selected==='ledger'&&!ledger)selected='all';render()}catch{if(!signal.aborted&&v===serial)notice.textContent=t.error}
 }
 const timer=setInterval(()=>{if(!busy&&selected==='orders'&&returnOrder&&returnChecks<20&&(!returnStatus||returnStatus.status==='pending')){void refresh();return}if(!busy&&selected!=='ledger'&&account?.orders?.some(o=>o.status==='pending'&&o.paymentId||o.status==='succeeded'&&(o.refundRequestedAt||o.receiptStatus==='pending')))void refresh()},15000)
 signal.addEventListener('abort',()=>clearInterval(timer),{once:true})
 void refresh()
}
