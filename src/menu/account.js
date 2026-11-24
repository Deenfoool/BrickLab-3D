import { createAuthClient } from './auth-client.js?v=cloud-auth-1'

const copy = {
 ru:{login:'Войти',register:'Регистрация',account:'BrickLab Workshop',hero:'Твоя мастерская. Где угодно.',intro:'Настоящий аккаунт BrickLab Cloud.',email:'Электронная почта',name:'Имя пользователя',password:'Пароль',enter:'Войти',create:'Создать аккаунт',local:'Продолжить без аккаунта',logout:'Выйти',loading:'Проверяем серверную сессию…',retry:'Повторить проверку',profile:'Серверный аккаунт',localBuilds:'Локальные сборки',selected:'Выбранная сборка',coming:'Облачное сохранение, достижения и синхронизация пока не подключены. Локальные сборки остаются в браузере.',closed:'Регистрация доступна только при разрешении администратора. Подтверждение почты и восстановление пароля ещё не реализованы.',https_required:'Для входа необходим HTTPS или локальный адрес разработки.',auth_unavailable:'Сервер авторизации недоступен. Повтори попытку.',invalid_credentials:'Проверь введённые данные.',invalid_login:'Неверная почта или пароль.',registration_disabled:'Регистрация пока закрыта.',registration_unavailable:'Не удалось создать аккаунт с этими данными.',too_many_attempts:'Слишком много попыток. Попробуй позже.',invalid_origin:'Адрес приложения не совпадает с настройками сервера.',unknown:'Не удалось выполнить запрос.',busy:'Выполняется запрос…',passwordHelp:'Минимум 12 символов при регистрации.'},
 en:{login:'Sign in',register:'Register',account:'BrickLab Workshop',hero:'Your workshop. Anywhere.',intro:'Your real BrickLab Cloud account.',email:'Email',name:'Display name',password:'Password',enter:'Sign in',create:'Create account',local:'Continue without an account',logout:'Sign out',loading:'Checking server session…',retry:'Retry',profile:'Server account',localBuilds:'Local builds',selected:'Selected build',coming:'Cloud saving, achievements and synchronization are not connected yet. Local builds remain in this browser.',closed:'Registration requires administrator approval. Email verification and password recovery are not implemented yet.',https_required:'Sign-in requires HTTPS or a local development address.',auth_unavailable:'Authentication service unavailable. Try again.',invalid_credentials:'Check your input.',invalid_login:'Incorrect email or password.',registration_disabled:'Registration is currently closed.',registration_unavailable:'Unable to create an account with those details.',too_many_attempts:'Too many attempts. Try again later.',invalid_origin:'Application address does not match the server configuration.',unknown:'Request failed.',busy:'Request in progress…',passwordHelp:'At least 12 characters when registering.'}
}
function node(tag, cls, value) {
 const e=document.createElement(tag); if(cls)e.className=cls; if(value!==undefined)e.textContent=value; return e
}
function action(label,fn,primary=false){
 const e=node('button','workspace-action'+(primary?' primary':''),label);e.type='button';e.onclick=fn;return e
}
function field(label,type,autocomplete,maxLength){
 const wrap=node('label','account-field'),input=node('input');input.type=type;input.autocomplete=autocomplete;input.required=true;input.maxLength=maxLength;wrap.append(node('span',null,label),input);return {wrap,input}
}
export function createCloudAccount({root,link,getProjects,api=createAuthClient()}){
 let lang='ru',visible=false,mode='login',user=null,checked=false,busy=false,error='',selected=null
 const t=()=>copy[lang]
 function label(){const e=link.querySelector('[data-account-label]');e.textContent=user?t().account:t().login;link.title=e.textContent;link.setAttribute('aria-label',e.textContent)}
 function message(code){const p=node('p','account-notice',t()[code]??t().unknown);p.setAttribute('role','status');return p}
 function localLink(){const a=node('a','workspace-action',t().local);a.href='#home';return a}
 async function run(fn){
   if(busy)return
   busy=true;error='';render()
   try{user=await fn();checked=true}
   catch(e){error=e.code??'unknown'}
   finally{busy=false;render()}
 }
 function refresh(){return run(()=>api.me())}
 function render(){
   label();if(!visible)return
   root.replaceChildren()
   const s=t()
   if(!api.allowed){root.append(message('https_required'),localLink());return}
   if(!checked&&!user){
     if(busy)root.append(message('loading'))
     else if(error)root.append(message(error),action(s.retry,refresh,true),localLink())
     else root.append(message('loading'))
     return
   }
   if(user){
     const header=node('div','account-dashboard-head'),identity=node('div','account-identity'),avatar=node('div','account-avatar',Array.from(user.displayName).slice(0,2).join('').toUpperCase()),details=node('div')
     details.append(node('h2',null,user.displayName),node('p','account-muted',user.email));identity.append(avatar,details)
     const logout=action(s.logout,()=>run(()=>api.logout()));logout.disabled=busy;header.append(identity,logout)
     const card=node('section','account-card');card.append(node('h2',null,s.profile),node('p','account-muted',s.coming))
     const projects=getProjects();card.append(node('p',null,s.localBuilds+': '+projects.length))
     const chosen=projects.find(p=>p.id===selected);if(chosen)card.append(node('p',null,s.selected+': '+chosen.document.name))
     root.append(header,card,localLink());if(error)root.append(message(error));if(busy)root.append(message('busy'));return
   }
   const panel=node('div','account-auth'),hero=node('div','account-auth-hero'),brand=node('div','account-brand','BRICKLAB CLOUD')
   hero.append(brand,node('h2',null,s.hero),node('p',null,s.intro))
   const art=node('img','account-hero-art');art.src=new URL('../../assets/examples/5-plus-r-gearbox.webp',import.meta.url).href;art.alt='';hero.append(art)
   const form=node('form','account-auth-form'),tabs=node('div','account-tabs')
   for(const k of ['login','register']){const b=action(s[k],()=>{mode=k;error='';render()});b.disabled=busy;b.setAttribute('aria-pressed',String(mode===k));tabs.append(b)}
   form.append(tabs,node('h2',null,s[mode]))
   const reg=mode==='register',name=reg?field(s.name,'text','nickname',80):null,email=field(s.email,'email','username',254),password=field(s.password,'password',reg?'new-password':'current-password',256)
   if(name)form.append(name.wrap)
   if(reg){password.input.minLength=12;form.append(node('p','account-muted',s.closed+' '+s.passwordHelp))}
   form.append(email.wrap,password.wrap)
   for(const f of [name,email,password])if(f)f.input.disabled=busy
   const submit=node('button','workspace-action primary',reg?s.create:s.enter);submit.type='submit';submit.disabled=busy;form.append(submit,localLink())
   if(error)form.append(message(error));if(busy)form.append(message('busy'))
   form.addEventListener('submit',event=>{
     event.preventDefault();if(busy)return
     const data={email:email.input.value,password:password.input.value,...(reg?{displayName:name.input.value}:{})}
     password.input.value=''
     run(()=>reg?api.register(data):api.login(data))
   })
   panel.append(hero,form);root.append(panel)
 }
 return {
   selectProject(id){selected=id},
   update(language,show){
     const next=language==='en'?'en':'ru',changed=next!==lang||visible!==show
     lang=next;visible=show;label()
     if(show&&changed){render();if(api.allowed&&!busy){checked=false;refresh()}}
   }
 }
}
