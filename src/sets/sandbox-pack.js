import {safeCheckoutUrl} from './instruction-offer.js?v=welcome-1'
export async function mountSandboxPack(root,{language,signal}){
 const ru=language==='ru',tr=(a,b)=>ru?a:b
 const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n}
 const api=async(path,data)=>{const r=await fetch(path,{signal,credentials:'same-origin',cache:'no-store',...(data?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}:{})});if(!r.ok)throw Error((await r.json()).error??'unavailable');return r.json()}
 try{
  const status=await api('/api/commerce/status')
  if(status.mode!=='test'||!status.admin||!status.enabled||signal.aborted)return
  const [catalog,account]=await Promise.all([api('/api/store/catalog'),api('/api/commerce/test-account')])
  if(signal.aborted)return
  const pending=(account.orders??[]).filter(o=>o.status==='pending'&&o.sku.startsWith('instruction-pack:'))
  const reserved=new Set(pending.flatMap(o=>o.sku.slice('instruction-pack:'.length).split(',')))
  const available=(catalog.instructions??[]).filter(p=>!(account.instructions??[]).includes(p.setId)||reserved.has(p.setId))
  if(available.length<3)return
  root.hidden=false
  const details=el('details'),summary=el('summary','Build Pack · '+tr('Тест администратора','Admin sandbox')),note=el('p',tr('Три выбранных набора со скидкой 15%. Тестовая оплата без списания; доступы и возврат не затрагивают рабочий аккаунт.','Three chosen sets, 15% off. Sandbox only; grants and refunds do not affect live access.'))
  const choices=Array.from({length:3},(_,i)=>{const s=el('select');s.setAttribute('aria-label',tr('Набор ','Set ')+(i+1));s.append(new Option(tr('Выбери набор','Choose set'),''));for(const p of available)s.append(new Option(p.setId+' · '+p.title,p.setId));return s})
  const quoteButton=el('button',tr('Рассчитать пакет','Quote pack')),pay=el('button',tr('Тестовая оплата','Sandbox checkout')),consent=el('label'),check=el('input'),result=el('div'),message=el('p')
  check.type='checkbox';const legal=el('a',tr('Оферта','Offer'));legal.href='/offer';legal.target='_blank';legal.rel='noopener noreferrer';consent.append(check,el('span',tr('Согласен на тестовую покупку. ','I accept sandbox checkout. ')),legal)
  quoteButton.type=pay.type='button';pay.disabled=true;check.disabled=true;message.setAttribute('role','status')
  let q=null,busy=false,revision=0
  const money=n=>(n/100).toLocaleString(ru?'ru-RU':'en-US',{style:'currency',currency:'RUB'})
  function invalidate(){revision++;q=null;result.replaceChildren();pay.disabled=true;check.disabled=true;check.checked=false;message.textContent=''}
  function controls(){for(const s of choices)s.disabled=busy;quoteButton.disabled=busy;check.disabled=busy||!q;pay.disabled=busy||!q||!check.checked}
  for(const s of choices)s.onchange=invalidate
  check.onchange=controls
  quoteButton.onclick=async()=>{
   if(busy)return
   invalidate();const token=revision,ids=choices.map(s=>s.value)
   if(ids.some(id=>!id)||new Set(ids).size!==3){message.textContent=tr('Выбери три разных набора.','Choose three distinct sets.');return}
   busy=true;controls()
   try{const value=await api('/api/commerce/instruction-pack-quote',{setIds:ids});if(signal.aborted||revision!==token)return
    q=value
    for(const line of q.lines)result.append(el('p',line.setId+' · '+line.title+' · '+money(line.amount)))
    result.append(el('strong',money(q.amountKopecks)+' · '+tr('Экономия ','Saving ')+money(q.subtotalKopecks-q.amountKopecks)))
   }catch(e){message.textContent=({bundle_unavailable:tr('Тестовый пакет сейчас недоступен.','Sandbox pack unavailable.'),bundle_set_unavailable:tr('Один из наборов уже приобретён. Выбери другой.','One set is already owned. Choose another.'),checkout_pending:tr('Сначала заверши предыдущую оплату.','Finish the previous payment first.')})[e.message]??tr('Не удалось рассчитать пакет.','Could not quote the pack.')}
   finally{busy=false;controls()}
  }
  pay.onclick=async()=>{
   if(busy||!q||!check.checked)return
   busy=true;controls()
   try{const value=await api('/api/commerce/instruction-pack-checkout',{setIds:choices.map(s=>s.value),amountKopecks:q.amountKopecks,offerVersion:q.offerVersion,accepted:true,mode:'test'})
    if(signal.aborted)return
    if(value.mode!=='test')throw Error('mode_changed')
    if(value.checkoutUrl){const url=safeCheckoutUrl(value.checkoutUrl);if(!url)throw Error('unsafe_checkout');location.assign(url);return}
    invalidate();message.textContent=value.status==='succeeded'?tr('Тестовая покупка завершена. Доступы — в истории покупок.','Sandbox purchase complete. See purchase history.'):tr('Платёж не завершён.','Payment not completed.')
   }catch(e){message.textContent=tr('Не удалось оплатить: ','Checkout failed: ')+e.message}
   finally{busy=false;controls()}
  }
  details.append(summary,note,...choices,quoteButton,result,consent,pay,message)
  if(pending.length){const resume=el('button',tr('Продолжить ожидающую покупку','Resume pending purchase'));resume.type='button';resume.onclick=()=>{const ids=pending[0].sku.slice('instruction-pack:'.length).split(',');choices.forEach((s,i)=>s.value=ids[i]);details.open=true;quoteButton.click()};details.append(resume)}
  root.append(details)
 }catch{/* No sandbox UI for ordinary visitors or unavailable payment service. */}
}
