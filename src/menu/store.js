import {createProfileClient} from './profile-client.js?v=cloud-profile-1'
import {applySignature,themeBadge,themePlate,signatureFor,mountThemeCover} from './profile-signature.js?v=signature-art-1'
import {themeFor} from './store-themes.js?v=themes-2'
import {commerceProducts,themePrices} from './commerce-catalog.js?v=commerce-plus-2'
import {mountCommercePreview} from './commerce-preview.js?v=commerce-1'
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
 const t=labels[language]??labels.ru,ru=language==='ru',money=n=>(Number(n)/100).toLocaleString(language==='ru'?'ru-RU':'en-US',{style:'currency',currency:'RUB'})
 const banner=el('div','store-banner'),bannerText=el('div'),bannerArt=el('div','store-banner-art');bannerText.append(el('span','store-kicker','BRICKLAB / COLLECTION 01'),el('h2',null,ru?'Твоя мастерская. Твой стиль.':'Your workshop. Your style.'),el('p',null,ru?'Шесть уникальных тем для оформления профиля и публичной мастерской.':'Six distinct themes for your profile and public workshop.'));for(const id of ['carbon','neon','aurora'])bannerArt.append(themePreview(themeFor(id),language));banner.append(bannerText,bannerArt);
 const message=el('p','account-muted',t.loading),grid=el('div','store-grid'),ordersPanel=el('section','store-orders'),financePanel=el('section','store-orders')
 message.setAttribute('role','status');root.replaceChildren(banner,el('p','account-muted',t.intro),message,grid,ordersPanel,financePanel)
 const delivery=el('section','store-orders store-delivery');delivery.append(el('h2',null,ru?'Получение цифровой услуги':'Digital delivery'),el('p',null,ru?'Одна тема — одна разовая покупка. Доступ привязывается к аккаунту BrickLab 3D после подтверждения оплаты. Физической доставки нет. Купленную тему можно выбрать в разделе «Моя мастерская → Магазин и инвентарь» и применять повторно без новой оплаты.':'Each theme is a one-time purchase. Access is linked to your BrickLab 3D account after payment confirmation. No physical delivery. Choose your purchased theme in My workshop → Shop and inventory and reuse it without another payment.'),el('p','account-muted',ru?'Если заказ не появился в аккаунте, обратитесь в поддержку по реквизитам, указав номер заказа.':'If a purchase is missing, contact support using the seller details and provide the order number.'));
 const legalLinks=el('div','commerce-preview-nav');for(const [title,path] of [[ru?'Условия покупки':'Purchase terms','/offer'],[ru?'Получение и возврат':'Delivery and refunds','/refund'],[ru?'Конфиденциальность':'Privacy','/privacy'],[ru?'Контакты и реквизиты':'Seller details','/requisites']]){const a=link(title,path);a.target='_blank';a.rel='noopener';legalLinks.append(a)}delivery.append(legalLinks);root.append(delivery);
 const future=el('section');future.hidden=true;root.append(future)
 const sandbox=el('section','store-orders');sandbox.hidden=true;root.append(sandbox)
 void api('/api/commerce/test-status',signal).then(status=>{
  if(signal.aborted||!status.enabled)return
  sandbox.hidden=false;sandbox.append(el('h2',null,ru?'ЮKassa · тестовая оплата':'YooKassa · sandbox checkout'),el('p','account-muted',ru?'Только администратор. Реальных списаний и прав доступа нет.':'Admin only. No real charges or access rights.'))
  const selector=el('select','account-field'),consent=el('input'),notice=el('p','account-muted');consent.type='checkbox';notice.setAttribute('role','status')
  for(const p of [...commerceProducts,...Object.entries(themePrices).map(([id,priceKopecks])=>({id,title:themeFor(id)?.[language]??id,priceKopecks}))]){const option=el('option',null,p.title+' · '+money(p.priceKopecks));option.value=p.id;selector.append(option)}
  const label=el('label','store-consent');label.append(consent,el('span',null,t.consent))
  const checkout=button(ru?'Проверить ЮKassa':'Test YooKassa',async()=>{
   if(!consent.checked||signal.aborted)return
   checkout.disabled=true
   try{const result=await api('/api/commerce/test-checkout',signal,{sku:selector.value,testConsent:true})
    if(signal.aborted)return
    if(result.mode!=='test')throw Error('Unexpected payment mode')
    if(result.checkoutUrl){const u=new URL(result.checkoutUrl);if(u.protocol!=='https:'||!['yoomoney.ru','yookassa.ru','www.yoomoney.ru','www.yookassa.ru'].includes(u.hostname)||u.username||u.password||u.port)throw Error('Invalid checkout URL');location.assign(u.href)}
    else notice.textContent=ru?'Тестовый заказ подтверждён. Реальные права не изменены.':'Test order confirmed. Live entitlements unchanged.'
   }catch{if(!signal.aborted)notice.textContent=t.error}finally{checkout.disabled=!consent.checked}
  });checkout.disabled=true;consent.onchange=()=>checkout.disabled=!consent.checked
  sandbox.append(selector,label,checkout,notice)
 }).catch(()=>{})

 let serial=0,busy=false
 const profiles=createProfileClient()
 function ordersList(panel,title,orders){
  panel.replaceChildren(el('h2',null,title))
  if(!orders.length)panel.append(el('p','account-muted',t.noOrders))
  for(const order of orders){const row=el('div','store-order-row');row.append(el('strong',null,'#'+order.invoice+' · '+(themeFor(order.sku)?.[language]??order.sku)),el('span',null,money(order.amountKopecks)),el('span','account-muted',order.status==='paid'?t.complete:t.pending));panel.append(row)}
 }
 async function refresh(){
  const version=++serial;message.textContent=t.loading
  try{
   const catalog=await api('/api/store/catalog',signal)
   const history=await api('/api/store/orders',signal).catch(e=>{if(e.status===401||e.status===403)return null;throw e})
   if(signal.aborted||version!==serial)return
   const admin=history!==null,items=history?.orders??[]
   future.hidden=!admin;if(admin&&!future.childElementCount)mountCommercePreview(future,{language})
   let profileData=await profiles.get().catch(e=>{if(!admin||e.status===401||e.status===403)return null;throw e})
   if(signal.aborted||version!==serial)return
   message.textContent=(admin?(ru?'Все платные темы доступны администратору бесплатно. ':'All paid themes are free for administrators. '):'')+(admin&&catalog.mode==='test'?t.test:catalog.live?(ru?'Оплата через ЮKassa.':'Payment via YooKassa.'):t.disabled)
   grid.replaceChildren()
   const consent=el('input');consent.type='checkbox'
   const consentLabel=el('label','store-consent');consentLabel.append(consent,el('span',null,t.consent))
   if(admin&&catalog.mode==='test')grid.append(consentLabel)
   const controls=[],equipControls=[]
   for(const product of catalog.products){
    const theme=themeFor(product.sku);if(!theme)continue
    const card=el('article','store-product'),preview=themePreview(theme,language),copy=el('div','store-product-body')
    const order=items.find(o=>o.sku===product.sku)
    const name=theme[language]??theme.en
    const details=el('div','store-product-details');details.append(el('span','store-kicker',ru?'ТЕМА МАСТЕРСКОЙ':'WORKSHOP THEME'),el('h2',null,name),el('p','account-muted',ru?theme.descriptionRu:theme.descriptionEn),el('p','account-muted',signatureFor(theme.id)[language]??signatureFor(theme.id).en))
    const dialog=el('dialog','store-preview-dialog'),header=el('div','store-preview-heading');header.append(el('h2',null,name),button(ru?'Закрыть':'Close',()=>dialog.close()))
    dialog.append(header,themePreview(theme,language,true),el('p','account-muted',ru?'Демонстрационный профиль и условные показатели. Тема меняет обложку, рамку, статистику, карточки и бейдж автора. Публичный показ можно отключить. 3D-редактор не меняется.':'Sample profile and illustrative statistics. The theme changes the cover, frame, metrics, cards and author badge. Public display is optional. The 3D editor is unchanged.'),communityExamples(theme,language))
    dialog.setAttribute('aria-label',name);signal.addEventListener('abort',()=>{if(dialog.open)dialog.close()},{once:true})
    const owned=profileData?.inventory?.some(i=>i.id===product.sku&&i.owned===true),free=profileData?.inventory?.some(i=>i.id===product.sku&&i.adminAccess===true&&i.owned===true)
    copy.append(details,button(ru?'Примерить тему':'Preview theme',()=>dialog.showModal()),el('strong','store-price',money(product.amountKopecks)),el('p','account-muted',ru?'Разовый доступ к оформлению аккаунта · без подписки':'One-time account theme access · no subscription'),dialog)
    if(free)copy.append(el('p','account-muted',ru?'Доступ администратора':'Administrator access'))
    if(owned){
     const equip=button(ru?'Применить тему':'Equip theme',async()=>{
      if(busy||signal.aborted)return
      busy=true;equipControls.forEach(b=>b.disabled=true);controls.forEach(b=>b.disabled=true)
      try{
       const current=await profiles.get()
       if(!current.inventory?.some(i=>i.id===product.sku&&i.owned===true))throw Error('Theme access unavailable')
       if(signal.aborted)return
       profileData=await profiles.save({bio:current.profile.bio,cover:current.profile.cover,background:product.sku})
       if(!signal.aborted)await refresh()
      }catch(e){if(!signal.aborted){message.textContent=t.error;equipControls.forEach(b=>b.disabled=b.dataset.equipped==='true');controls.forEach(b=>b.disabled=!consent.checked)}}finally{busy=false}
     })
     equip.classList.add('primary');equip.dataset.equipped=String(profileData.profile.background===product.sku);equip.disabled=equip.dataset.equipped==='true'
     if(equip.disabled)equip.textContent=ru?'Тема применена':'Equipped'
     equipControls.push(equip);copy.append(equip)
    }
    if(owned&&!free)copy.append(el('p','account-muted',ru?'В вашем инвентаре':'In your inventory'))
    if(catalog.live&&!owned){
     if(!profileData)copy.append(link(ru?'Войти для покупки':'Sign in to buy','#account'))
     else {const pay=button(ru?'Купить тему':'Buy theme',async()=>{
      if(busy||signal.aborted)return;busy=true;pay.disabled=true
      try{const quote=await api('/api/commerce/live-quote?sku='+encodeURIComponent(product.sku),signal);if(signal.aborted)return;
       const confirmation=el('dialog','store-preview-dialog'),label=el('label','store-consent'),accept=el('input');accept.type='checkbox';const price=el('strong','store-price',money(quote.amountKopecks));const confirm=button(ru?'Перейти к оплате':'Proceed to payment',async()=>{
        if(!accept.checked||signal.aborted)return;confirm.disabled=true;try{const result=await api('/api/commerce/live-checkout',signal,{sku:product.sku,amountKopecks:quote.amountKopecks,offerVersion:quote.offerVersion,accepted:true});if(signal.aborted)return;if(result.mode!=='live')throw Error('Unexpected payment mode');if(result.checkoutUrl){const u=new URL(result.checkoutUrl);if(u.protocol!=='https:'||!['yoomoney.ru','yookassa.ru','www.yoomoney.ru','www.yookassa.ru'].includes(u.hostname)||u.username||u.password||u.port)throw Error('Invalid checkout URL');location.assign(u.href)}else{confirmation.close();await refresh()}}catch{message.textContent=t.error;confirm.disabled=!accept.checked}
       });confirm.disabled=true;accept.onchange=()=>confirm.disabled=!accept.checked;label.append(accept,el('span',null,ru?'Принимаю условия оферты и порядок получения и возврата.':'I accept the offer and delivery/refund terms.'));const terms=el('div','commerce-preview-nav');for(const [title,path] of [[ru?'Оферта':'Offer','/offer'],[ru?'Возвраты':'Refunds','/refund']]){const a=link(title,path);a.target='_blank';a.rel='noopener';terms.append(a)}confirmation.append(el('h2',null,name),price,terms,label,confirm,button(ru?'Отмена':'Cancel',()=>confirmation.close()));confirmation.addEventListener('close',()=>{confirmation.remove();busy=false;pay.disabled=false},{once:true});signal.addEventListener('abort',()=>{if(confirmation.open)confirmation.close()},{once:true});root.append(confirmation);confirmation.showModal()
      }catch{message.textContent=t.error;busy=false;pay.disabled=false}
     });pay.classList.add('primary');copy.append(pay)}
    }
    if(order?.status==='paid')copy.append(el('p','account-muted',t.owned))
    else if(admin&&catalog.mode==='test'){
     const buy=button(order?t.resume:(ru?'Проверить тестовую оплату':'Test checkout'),async()=>{
      if(busy||!consent.checked)return;busy=true;controls.forEach(b=>b.disabled=true)
      try{
       const result=await api('/api/store/orders',signal,{sku:product.sku,testConsent:true})
       if(signal.aborted)return
       if(result.checkoutUrl){const url=new URL(result.checkoutUrl);if(url.origin!=='https://auth.robokassa.ru'||url.pathname!=='/Merchant/Index.aspx'||url.searchParams.get('IsTest')!=='1')throw Error('Invalid test checkout');location.assign(url.href)}
       else await refresh()
      }catch(e){if(!signal.aborted)message.textContent=t.error}finally{busy=false;controls.forEach(b=>b.disabled=!consent.checked)}
     });buy.disabled=true;controls.push(buy);copy.append(buy)
    }
    card.append(preview,copy);grid.append(card)
   }
   consent.onchange=()=>controls.forEach(b=>b.disabled=busy||!consent.checked)
   ordersPanel.hidden=!admin;financePanel.hidden=!admin
   if(admin){
    ordersList(ordersPanel,t.history,items);ordersPanel.append(el('p','account-muted',t.wait),button(t.refresh,refresh),link(t.profile,'#account'))
    const finance=await api('/api/store/finance',signal)
    if(signal.aborted||version!==serial)return
    financePanel.replaceChildren(el('h2',null,t.finance),el('p','account-muted',t.financeNote))
    const metrics=el('div','store-metrics')
    for(const [label,value] of [[t.total,finance.stats.total],[t.paid,finance.stats.paid],[t.amount,money(finance.stats.testKopecks)]]){const metric=el('div','store-metric');metric.append(el('span','account-muted',label),el('strong',null,value));metrics.append(metric)}
    financePanel.append(metrics)
    const list=el('div');ordersList(list,t.history,finance.orders);financePanel.append(list)
   }else {ordersPanel.replaceChildren();financePanel.replaceChildren();if(!profileData)grid.append(link(t.login,'#account'))}
  }catch(e){if(!signal.aborted&&version===serial){message.textContent=t.error;ordersPanel.hidden=true;financePanel.hidden=true;grid.replaceChildren(button(t.refresh,refresh))}}
 }
 void refresh()
}
