
export function createMailer(env=process.env,fetcher=globalThis.fetch){
 const key=env.BRICKLAB_MAIL_KEY,from=env.BRICKLAB_MAIL_FROM
 if(!key||!from)return null
 return async({email,purpose,code})=>{
  const subject=purpose==='register'?'BrickLab — подтверждение регистрации':'BrickLab — восстановление пароля'
  const text=subject+'\n\nКод / Code: '+code+'\n\nДействует 30 минут. Введите код на сайте BrickLab. Если вы не запрашивали код, проигнорируйте письмо. / Expires in 30 minutes. Enter the code on BrickLab. Ignore this email if you did not request it.'
  const r=await fetcher('https://api.resend.com/emails',{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{Authorization:'Bearer '+key,'Content-Type':'application/json','User-Agent':'BrickLab/1.0'},body:JSON.stringify({from,to:[email],subject,text})})
  if(!r.ok)throw Error('mail_delivery_failed')
 }
}
