import {createProfileClient} from './profile-client.js?v=cloud-profile-1'
import {applySignature,themeBadge,themePlate,signatureFor,mountThemeCover} from './profile-signature.js?v=signature-art-1'
import {themeFor} from './store-themes.js?v=themes-2'
const labels={
 ru:{title:'BrickLab Store',intro:'Оформление мастерской. Основные функции редактора остаются бесплатными.',disabled:'Продажи пока закрыты. Здесь представлен каталог будущих покупок.',test:'Тестовый режим · реальные деньги не списываются. Покупки доступны только администратору.',login:'Войти в аккаунт',buy:'Тестовая покупка',owned:'Получено в тестовом инвентаре',resume:'Продолжить тестовую оплату',consent:'Подтверждаю, что это тестовая оплата без реального списания и без выдачи платного товара.',history:'Мои тестовые заказы',finance:'BrickLab Finance · тестовый режим',financeNote:'Суммы ниже — виртуальные тестовые операции, не выручка.',total:'Заказов',paid:'Подтверждено',amount:'Тестовый оборот',pending:'Ожидает подтверждения',complete:'Подтверждён',refresh:'Обновить статус',error:'Не удалось выполнить запрос. Попробуй ещё раз.',wait:'Если оплата завершена, дождись уведомления Robokassa и обнови статус.',profile:'Мой инвентарь',carbon:'Карбон',neon:'Неоновая мастерская',noOrders:'Заказов пока нет',loading:'Загрузка…'},
 en:{title:'BrickLab Store',intro:'Customize your workshop. Core editor features stay free.',disabled:'Sales are closed. Preview the upcoming catalog.',test:'Test mode · no real charges. Only administrators can test checkout.',login:'Sign in',buy:'Test purchase',owned:'Received in test inventory',resume:'Resume test payment',consent:'I understand this is a test transaction with no real charge or paid product delivery.',history:'My test orders',finance:'BrickLab Finance · test mode',financeNote:'Amounts below are simulated transactions, not revenue.',total:'Orders',paid:'Confirmed',amount:'Test volume',pending:'Awaiting confirmation',complete:'Confirmed',refresh:'Refresh status',error:'Request failed. Please try again.',wait:'If you completed payment, wait for Robokassa confirmation and refresh.',profile:'My inventory',carbon:'Carbon',neon:'Neon workshop',noOrders:'No orders yet',loading:'Loading…'}}
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
   let profileData=admin?await profiles.get():null
   if(signal.aborted||version!==serial)return
   message.textContent=(admin?(ru?'Все платные темы доступны администратору бесплатно. ':'All paid themes are free for administrators. '):'')+(catalog.mode==='test'?t.test:t.disabled)
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
    const free=profileData?.inventory?.some(i=>i.id===product.sku&&i.adminAccess===true&&i.owned===true)
    copy.append(details,button(ru?'Примерить тему':'Preview theme',()=>dialog.showModal()),el('strong','store-price',free?(ru?'Бесплатно для администратора':'Free for admin'):money(product.amountKopecks)),dialog)
    if(free){
     const equip=button(ru?'Применить тему':'Equip theme',async()=>{
      if(busy||signal.aborted)return
      busy=true;equipControls.forEach(b=>b.disabled=true);controls.forEach(b=>b.disabled=true)
      try{
       const current=await profiles.get()
       if(!current.inventory?.some(i=>i.id===product.sku&&i.adminAccess===true&&i.owned===true))throw Error('Admin access unavailable')
       if(signal.aborted)return
       profileData=await profiles.save({bio:current.profile.bio,cover:current.profile.cover,background:product.sku})
       if(!signal.aborted)await refresh()
      }catch(e){if(!signal.aborted){message.textContent=t.error;equipControls.forEach(b=>b.disabled=b.dataset.equipped==='true');controls.forEach(b=>b.disabled=!consent.checked)}}finally{busy=false}
     })
     equip.classList.add('primary');equip.dataset.equipped=String(profileData.profile.background===product.sku);equip.disabled=equip.dataset.equipped==='true'
     if(equip.disabled)equip.textContent=ru?'Тема применена':'Equipped'
     equipControls.push(equip);copy.append(equip)
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
   }else {ordersPanel.replaceChildren();financePanel.replaceChildren();grid.append(link(t.login,'#account'))}
  }catch(e){if(!signal.aborted&&version===serial){message.textContent=t.error;ordersPanel.hidden=true;financePanel.hidden=true;grid.replaceChildren(button(t.refresh,refresh))}}
 }
 void refresh()
}
