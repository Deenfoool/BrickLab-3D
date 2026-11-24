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
export function mountStore(root,{language='ru',signal}){
 const t=labels[language]??labels.ru,money=n=>(Number(n)/100).toLocaleString(language==='ru'?'ru-RU':'en-US',{style:'currency',currency:'RUB'})
 const message=el('p','account-muted',t.loading),grid=el('div','store-grid'),ordersPanel=el('section','store-orders'),financePanel=el('section','store-orders')
 message.setAttribute('role','status');root.replaceChildren(el('p','account-muted',t.intro),message,grid,ordersPanel,financePanel)
 let serial=0,busy=false
 function ordersList(panel,title,orders){
  panel.replaceChildren(el('h2',null,title))
  if(!orders.length)panel.append(el('p','account-muted',t.noOrders))
  for(const order of orders){const row=el('div','store-order-row');row.append(el('strong',null,'#'+order.invoice+' · '+(t[order.sku]??order.sku)),el('span',null,money(order.amountKopecks)),el('span','account-muted',order.status==='paid'?t.complete:t.pending));panel.append(row)}
 }
 async function refresh(){
  const version=++serial;message.textContent=t.loading
  try{
   const catalog=await api('/api/store/catalog',signal)
   const history=await api('/api/store/orders',signal).catch(e=>{if(e.status===401||e.status===403)return null;throw e})
   if(signal.aborted||version!==serial)return
   const admin=history!==null,items=history?.orders??[]
   message.textContent=catalog.mode==='test'?t.test:t.disabled
   grid.replaceChildren()
   const consent=el('input');consent.type='checkbox'
   const consentLabel=el('label','store-consent');consentLabel.append(consent,el('span',null,t.consent))
   if(admin&&catalog.mode==='test')grid.append(consentLabel)
   const controls=[]
   for(const product of catalog.products){
    if(!['carbon','neon'].includes(product.sku))continue
    const card=el('article','store-product'),preview=el('div','cosmetic-preview cosmetic-'+product.sku),copy=el('div','store-product-body')
    const order=items.find(o=>o.sku===product.sku)
    copy.append(el('h2',null,t[product.sku]),el('strong','store-price',money(product.amountKopecks)))
    if(order?.status==='paid')copy.append(el('p','account-muted',t.owned))
    else if(admin&&catalog.mode==='test'){
     const buy=button(order?t.resume:t.buy,async()=>{
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
