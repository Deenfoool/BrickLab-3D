// Telegram sees only the internal account/order identifiers, not email or card data.
// The database outbox is written atomically with the order transition.
export function commerceTelegramConfig(env=process.env){
 const token=env.BRICKLAB_COMMERCE_TELEGRAM_TOKEN??'',chat=env.BRICKLAB_COMMERCE_TELEGRAM_CHAT_ID??''
 return {enabled:env.BRICKLAB_COMMERCE_TELEGRAM_ENABLED==='true'&&/^\d{5,15}:[A-Za-z0-9_-]{20,100}$/.test(token)&&/^-?\d{1,20}$/.test(chat),token,chat}
}
export function commerceEventText(e){
 const titles={succeeded:'Оплата подтверждена',canceled:'Платёж отменён',refunded:'Возврат выполнен'}
 const clean=value=>String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,200)
 return ['BrickLab 3D · '+(e.environment==='test'?'ТЕСТ (не выручка)':'РЕАЛЬНАЯ ОПЕРАЦИЯ'),titles[e.event]??'Операция',
  'Товар: '+clean(e.title),'Сумма: '+(Number(e.amount_kopecks)/100).toFixed(2)+' ₽','Аккаунт: '+clean(e.user_id),'Заказ: '+clean(e.order_id),'Событие: '+clean(e.id)].join('\n')
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
