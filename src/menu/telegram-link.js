export function renderTelegramLink({lang='ru',signal}={}){
 const ru=lang==='ru',section=document.createElement('section');section.className='account-panel'
 const title=document.createElement('h2');title.textContent='Telegram · BrickLab Hub'
 const status=document.createElement('p');status.setAttribute('role','status')
 const code=document.createElement('output');code.style.overflowWrap='anywhere'
 const button=document.createElement('button');button.type='button';button.className='account-action'
 const form=document.createElement('form'),promo=document.createElement('input'),redeem=document.createElement('button'),promoStatus=document.createElement('p');promo.placeholder=ru?'Промокод Plus':'Plus promo code';promo.maxLength=32;promo.required=true;promo.setAttribute('aria-label',promo.placeholder);redeem.type='submit';redeem.textContent=ru?'Активировать промокод':'Redeem promo';promoStatus.setAttribute('role','status');form.append(promo,redeem,promoStatus);
 section.append(title,status,code,button,form)
 async function api(path,method='GET'){
  const r=await fetch('/api/telegram/'+path,{method,signal,credentials:'same-origin',cache:'no-store'})
  if(!r.ok)throw Error('unavailable')
  return r.json()
 }
 let linked=false
 async function load(){try{const d=await api('link');linked=d.linked;status.textContent=linked?(ru?'Telegram привязан.':'Telegram connected.'):(ru?'Получите одноразовый код и введите его только в личной Mini App BrickLab Hub.':'Generate a one-time code and enter it only in your private BrickLab Hub.');button.textContent=linked?(ru?'Отвязать':'Disconnect'):(ru?'Получить код':'Generate code');button.disabled=false}catch{status.textContent=ru?'Подключение пока недоступно.':'Connection unavailable.';button.disabled=true}}
 button.disabled=true
 button.onclick=async()=>{button.disabled=true;code.textContent='';try{if(linked){if(!confirm(ru?'Отвязать Telegram?':'Disconnect Telegram?'))return;await api('unlink','POST');await load()}else{const d=await api('code','POST');code.textContent=d.code;status.textContent=ru?'Код действует 10 минут. Никому его не пересылайте.':'Code expires in 10 minutes. Do not share it.'}}catch{status.textContent=ru?'Не удалось выполнить операцию.':'Operation failed.'}finally{button.disabled=false}}
 form.onsubmit=async e=>{e.preventDefault();redeem.disabled=true;try{const r=await fetch('/api/telegram/site-redeem',{method:'POST',signal,credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:promo.value.trim().toUpperCase()})});if(!r.ok)throw Error();promo.value='';promoStatus.textContent=ru?'Промокод активирован. Обновите профиль, чтобы увидеть срок Plus.':'Promo redeemed. Refresh your profile to see the Plus expiry.'}catch{promoStatus.textContent=ru?'Промокод недействителен или недоступен.':'Promo unavailable or invalid.'}finally{redeem.disabled=false}}
 load();return section
}
