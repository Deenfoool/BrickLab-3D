import {spawn} from 'node:child_process'
import {fileURLToPath} from 'node:url'

export function sendPostbox(message){
 return new Promise((resolve,reject)=>{
  const child=spawn('/usr/bin/python3',[fileURLToPath(new URL('./postbox-mail.py',import.meta.url))],{
   stdio:['pipe','pipe','ignore'],env:{PATH:'/usr/bin:/bin',LANG:'C.UTF-8'},
   timeout:18000,killSignal:'SIGKILL'
  })
  let result=''
  child.stdout.setEncoding('utf8')
  child.stdout.on('data',chunk=>{if(result.length+chunk.length>128){child.kill('SIGKILL');return}result+=chunk})
  child.stdin.on('error',()=>{})
  child.on('error',()=>reject(Error('mail_transport_unavailable')))
  child.on('close',code=>{
   if(code===0&&result.trim()==='accepted'){resolve();return}
   const reason=result.trim()
   reject(Error(/^(smtp_[45]\d\d|smtp_connection|smtp_tls|smtp_invalid_message)$/.test(reason)?reason:'mail_delivery_failed'))
  })
  child.stdin.end(JSON.stringify(message))
 })
}

export function createMailer(env=process.env,transport=sendPostbox){
 const username=env.BRICKLAB_MAIL_USER,password=env.BRICKLAB_MAIL_KEY,from=env.BRICKLAB_MAIL_FROM
 if(!username||!password||!from)return null
 return async({email,purpose,code})=>{
  if(!['register','reset','test'].includes(purpose))throw Error('invalid_mail_purpose')
  const subject=purpose==='test'?'BrickLab — проверка почты':purpose==='register'?'BrickLab — подтверждение регистрации':'BrickLab — восстановление пароля'
  const text=purpose==='test'?'Почтовый сервис BrickLab 3D подключён. Это тестовое письмо, код не требуется.':subject+'\n\nКод / Code: '+code+'\n\nДействует 30 минут. Введите код на сайте BrickLab. Если вы не запрашивали код, проигнорируйте письмо. / Expires in 30 minutes. Enter the code on BrickLab. Ignore this email if you did not request it.'
  await transport({username,password,from,to:email,subject,text})
 }
}
