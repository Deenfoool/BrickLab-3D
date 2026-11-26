import {instructionEvent} from './instruction-events.js'
// Contextual purchase and welcome activation; the server is authoritative.
const make=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n}
const generations=new WeakMap()
async function api(path,signal,data){
 const response=await fetch(path,{signal,credentials:'same-origin',cache:'no-store',redirect:'error',...(data===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})})
 const result=await response.json()
 if(!response.ok)throw Object.assign(Error(result.error||'request_failed'),{status:response.status})
 return result
}
export function safeCheckoutUrl(value){
 try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&['yoomoney.ru','yookassa.ru','www.yoomoney.ru','www.yookassa.ru'].includes(u.hostname)?u.href:null}catch{return null}
}
export async function mountInstructionOffer(root,{set,language,signal,onStart,start}){
 const generation=(generations.get(root)||0)+1;generations.set(root,generation)
 const current=()=>!signal.aborted&&generations.get(root)===generation
 const ru=language==='ru',tr=(a,b)=>ru?a:b
 const money=n=>(n/100).toLocaleString(ru?'ru-RU':'en-US',{style:'currency',currency:'RUB',maximumFractionDigits:2})
 const normal=tr('Начать сборку','Start building'),basic=tr('Продолжить с PDF','Continue with PDF')
 const status=make('p',tr('Проверяем доступ…','Checking access…'));status.setAttribute('role','status')
 root.replaceChildren(status);start.textContent=normal;start.classList.remove('set-basic-action')
 const button=(text,action,primary=false)=>{const b=make('button',text,primary?'set-primary-action':'secondary');b.type='button';b.onclick=action;return b}
 const error=e=>({verified_account_required:tr('Подтверди электронную почту в аккаунте.','Verify your account email.'),checkout_pending:tr('Сначала заверши ожидающую оплату.','Finish the pending payment first.'),welcome_exhausted:tr('Бесплатные активации закончились. Обнови окно.','Welcome activations exhausted. Reopen the dialog.'),already_owned:tr('Доступ уже получен. Открой набор повторно.','Access is already unlocked. Reopen the set.')})[e.message]||tr('Не удалось выполнить запрос. Повтори попытку.','Request failed. Please try again.')
 const showError=e=>{if(current()){status.className='set-offer-error';status.textContent=error(e)}}
 const retry=()=>mountInstructionOffer(root,{set,language,signal,onStart,start})
 const setId=set.number
 try{
  const offer=await api('/api/commerce/instruction-offer?set='+encodeURIComponent(setId),signal)
  if(!current())return
  const title=make('h3',tr('Интерактивная сборка','Interactive build')),desc=make('p')
  const features=make('div',undefined,'set-offer-features')
  for(const text of [tr('Артикулы деталей','Part IDs'),tr('Подсказки в PDF','PDF hints'),tr('Быстрый поиск','Quick search')])features.append(make('span',text))
  root.replaceChildren(title,desc);status.textContent=''
  if(offer.state==='free'){
   desc.textContent=offer.beta?tr('Во время ОБТ интерактивность бесплатна.','Interactive hints are free during open beta.'):tr('Для этого набора нет платного ограничения.','No paid restriction for this set.')
   root.append(features)
   if(!offer.canBuy){if(offer.testOwned)root.append(make('p',tr('Тестовый доступ получен.','Sandbox access acquired.')));return}
   root.append(make('p',tr('Только администратор: тестовая оплата без списания.','Administrator only: sandbox checkout, no charges.')))
  }else if(offer.state==='owned'||offer.state==='plus'){
   desc.textContent=offer.state==='owned'?tr('Постоянный доступ уже открыт.','Permanent access unlocked.'):tr('Доступ включён в BrickLab Plus.','Included with BrickLab Plus.')
   root.append(features);return
  }else{
   start.textContent=basic;start.classList.add('set-basic-action')
   desc.textContent=tr('Открой подсказки для всего набора. PDF и первые '+(offer.trialSteps??10)+' шагов остаются доступны без оплаты.','Unlock hints for the entire set. PDF and the first '+(offer.trialSteps??10)+' steps remain free.')
   root.append(features)
   if(offer.state==='signin'){
    const sign=make('a',tr('Войти для активации','Sign in to activate'),'workspace-action');sign.href='#account';root.append(sign);return
   }
   if(offer.state==='welcome'){
    const gift=make('div',undefined,'set-offer-gift')
    gift.append(make('strong',tr('Welcome Pack · осталось '+offer.remaining+' активаций','Welcome Pack · '+offer.remaining+' activations left')),make('p',tr('Один набор навсегда. Заверши первую подарочную сборку, сохрани её в облаке и получи второй набор.','One set forever. Complete your first gifted build, save it to the cloud and earn a second set.')))
    const claim=button(tr('Активировать бесплатно и начать','Activate free and start'),async()=>{
     claim.disabled=true
     try{const r=await api('/api/commerce/instruction-activate',signal,{setId});if(!current())return;if(!['owned','plus'].includes(r.state))throw Error('unavailable');onStart()}catch(e){showError(e);claim.disabled=false}
    },true)
    gift.append(claim);root.append(gift,status);return
   }
   if(!offer.canBuy){root.append(make('p',tr('Оплата временно недоступна. Можно начать с PDF.','Checkout is temporarily unavailable. You can start with PDF.')));return}
  }
  const p=offer.product
  if(!p||!offer.canBuy)return
  if(offer.mode==='live')instructionEvent(setId,'offer_view')
  const priceRow=make('div',undefined,'set-offer-price'),price=make('strong',money(p.priceKopecks))
  priceRow.append(make('span',offer.mode==='test'?tr('Тестовая стоимость','Sandbox price'):tr('Доступ навсегда','Permanent access')),price)
  const consent=make('label',undefined,'set-offer-consent'),check=make('input'),terms=make('span',offer.mode==='test'?tr('Согласен на тестовую оплату без списания. ','I accept sandbox checkout with no charge. '):tr('Принимаю условия покупки и возврата. ','I accept purchase and refund terms. '))
  check.type='checkbox'
  const legal=make('a',tr('Оферта','Offer'));legal.href='/offer';legal.target='_blank';legal.rel='noopener noreferrer';terms.append(legal);consent.append(check,terms)
  let quote=null,plusQuote=null
  async function checkout(q,sku){
   if(offer.mode==='live')instructionEvent(setId,'checkout_click')
   const result=await api('/api/commerce/checkout',signal,{sku,amountKopecks:q.amountKopecks,offerVersion:q.offerVersion,accepted:true,mode:offer.mode,...(sku==='plus-1'?{returnToSets:true}:{})})
   if(!current())return
   if(result.mode!==offer.mode)throw Error('mode_changed')
   if(result.checkoutUrl){const url=safeCheckoutUrl(result.checkoutUrl);if(!url)throw Error('unsafe_checkout');try{sessionStorage.setItem('bricklab-instruction-return',setId)}catch{}location.assign(url);return}
   if(result.status==='succeeded'){await retry();return}
   throw Error('payment_not_confirmed')
  }
  const pay=button(offer.pending?tr('Продолжить оплату','Resume checkout'):offer.mode==='test'?tr('Тестовая покупка','Sandbox purchase'):tr('Купить интерактивность','Unlock interactive hints'),async()=>{
   if(!quote||!check.checked||!current())return
   pay.disabled=true
   try{
    await checkout(quote,p.id)
   }catch(e){showError(e);pay.disabled=!check.checked}
  },true)
  pay.disabled=true
  let plusPay=null
  root.append(priceRow,pay)
  if(offer.plusProduct&&offer.mode==='live'){
   const plus=make('div',undefined,'set-offer-gift'),plusPrice=make('strong',money(offer.plusProduct.priceKopecks))
   plus.append(make('h3','BrickLab Plus'),plusPrice,make('p',tr('1 месяц · все поддерживаемые наборы, 60 облачных проектов, расширенная история. Без автопродления.','1 month · all supported sets, 60 cloud projects, more revisions. No auto-renewal.')))
   plusPay=button(tr('Выбрать BrickLab Plus','Choose BrickLab Plus'),async()=>{if(!plusQuote||!check.checked)return;plusPay.disabled=true;try{await checkout(plusQuote,offer.plusProduct.id)}catch(e){showError(e);plusPay.disabled=!check.checked}},true)
   plusPay.disabled=true;plus.append(plusPay);root.append(plus)
   void api('/api/commerce/quote?sku='+encodeURIComponent(offer.plusProduct.id),signal).then(q=>{if(current()&&q.mode===offer.mode&&Number.isSafeInteger(q.amountKopecks)&&q.amountKopecks>0){plusQuote=q;plusPrice.textContent=money(q.amountKopecks);plusPay.disabled=!check.checked}}).catch(()=>{})
  }
  check.onchange=()=>{pay.disabled=!quote||!check.checked;if(plusPay)plusPay.disabled=!plusQuote||!check.checked}
  root.append(consent,status)
  try{
   const q=await api('/api/commerce/quote?sku='+encodeURIComponent(p.id),signal)
   if(!current())return
   if(q.mode!==offer.mode||!Number.isSafeInteger(q.amountKopecks)||q.amountKopecks<1)throw Error('invalid_quote')
   quote=q;price.textContent=money(q.amountKopecks);pay.disabled=!check.checked
  }catch(e){showError(e)}
 }catch(e){if(current()){start.textContent=basic;start.classList.add('set-basic-action');root.replaceChildren(status,button(tr('Повторить проверку','Retry access check'),retry));showError(e)}}
}
