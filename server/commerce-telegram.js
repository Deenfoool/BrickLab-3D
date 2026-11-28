// Private operator chat receives display name and order number, not email or card data.
// The database outbox is written atomically with the order transition.
export function commerceTelegramConfig(env=process.env){
 const token=env.BRICKLAB_COMMERCE_TELEGRAM_TOKEN??'',chat=env.BRICKLAB_COMMERCE_TELEGRAM_CHAT_ID??''
 return {enabled:env.BRICKLAB_COMMERCE_TELEGRAM_ENABLED==='true'&&/^\d{5,15}:[A-Za-z0-9_-]{20,100}$/.test(token)&&/^-?\d{1,20}$/.test(chat),token,chat}
}
export function commerceEventText(e){
 const titles={succeeded:'✅ Оплата подтверждена',canceled:'⚪ Платёж отменён',refunded:'↩ Возврат выполнен',receipt_issued:'🧾 Чек НПД сформирован',receipt_canceled:'🧾 Чек НПД аннулирован'}
 const clean=value=>String(value??'').replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g,' ').trim().slice(0,200)
 const name=clean(e.buyer_name)
 const amount=value=>(Number(value)/100).toFixed(2)+' ₽'
 const num=e.order_number!=null?'BL-'+String(e.order_number).padStart(6,'0'):clean(e.order_id)
 const lines=['BrickLab 3D · '+(e.environment==='test'?'ТЕСТ (не выручка)':'РЕАЛЬНАЯ ОПЕРАЦИЯ'),titles[e.event]??'Операция','',
  'Товар: '+clean(e.title),'Сумма: '+amount(e.amount_kopecks),'Покупатель: '+(name&&!/[^\s@]+@[^\s@]+\.[^\s@]+/.test(name)?name:'Аккаунт '+clean(e.user_id).slice(0,8)),'Заказ: '+num]
 if(e.occurred_at)lines.push('Время: '+new Date(e.occurred_at).toLocaleString('ru-RU',{timeZone:'Europe/Moscow'})+' МСК')
 if(e.day!=null){
  lines.push('','Сегодня ('+clean(e.day)+', МСК; до комиссий):',
   'Оплаты: '+amount(e.paid_kopecks)+' ('+clean(e.paid_count)+')',
   'Возвраты: '+amount(e.refunded_kopecks)+' ('+clean(e.refund_count)+')',
   'Итого: '+amount(Number(e.paid_kopecks)-Number(e.refunded_kopecks)))
 }
 if(e.environment==='live'){
  if(e.receipt_correction_pending&&e.event!=='receipt_canceled')lines.push('','⚠ Требуется корректировка чека НПД',...(e.receipt_status==='pending'?['Возврат до выдачи чека: проверь фактические операции ФНС, не создавай дубликаты.']:[]))
  else if(e.event==='succeeded'&&e.receipt_status==='pending')lines.push('','⚠ Сформируйте чек НПД в «Мой налог» и добавьте ссылку в Финансы.')
 }
 lines.push('','Событие: '+clean(e.id))
 return lines.join('\n')
}
export function startCommerceTelegram({store,config=commerceTelegramConfig(),fetcher=fetch,logger=console,intervalMs=60000}){
 let active=null,stopped=false
 async function run(){
  for(const event of await store.claimCommerceEvents()){
   if(stopped)break
   try{
    const res=await fetcher('https://api.telegram.org/bot'+config.token+'/sendMessage',{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:config.chat,text:commerceEventText(event),disable_web_page_preview:true}),signal:AbortSignal.timeout(8000)})
    if(!res.ok)throw Error('telegram_http')
    const data=await res.json()
    if(data?.ok!==true)throw Error('telegram_rejected')
    await store.ackCommerceEvent(event.id)
   }catch{logger.warn('Commerce Telegram notification delivery failed; will retry')}
  }
 }
 function tick(){
  if(stopped||active||!config.enabled)return
  active=run().catch(()=>logger.warn('Commerce Telegram queue unavailable')).finally(()=>{active=null});return active
 }
 const timer=config.enabled?setInterval(tick,intervalMs).unref():null
 return {tick,async stop(){stopped=true;clearInterval(timer);await active}}
}
