import { createAuthClient } from './auth-client.js?v=cloud-auth-1'

import { createProjectsClient, cloudLink } from './projects-client.js?v=cloud-projects-1'

const copy = {
 ru:{login:'Войти',register:'Регистрация',account:'BrickLab Workshop',hero:'Твоя мастерская. Где угодно.',intro:'Настоящий аккаунт BrickLab Cloud.',email:'Электронная почта',name:'Имя пользователя',password:'Пароль',enter:'Войти',create:'Создать аккаунт',local:'Продолжить без аккаунта',logout:'Выйти',loading:'Проверяем серверную сессию…',retry:'Повторить проверку',profile:'Серверный аккаунт',localBuilds:'Локальные сборки',selected:'Выбранная сборка',coming:'Приватные облачные сборки и история версий. Сохраняй изменения явно; локальные сборки не удаляются. Достижения пока не подключены.',closed:'Регистрация доступна только при разрешении администратора. Подтверждение почты и восстановление пароля ещё не реализованы.',https_required:'Для входа необходим HTTPS или локальный адрес разработки.',auth_unavailable:'Сервер авторизации недоступен. Повтори попытку.',invalid_credentials:'Проверь введённые данные.',invalid_login:'Неверная почта или пароль.',registration_disabled:'Регистрация пока закрыта.',registration_unavailable:'Не удалось создать аккаунт с этими данными.',too_many_attempts:'Слишком много попыток. Попробуй позже.',invalid_origin:'Адрес приложения не совпадает с настройками сервера.',unknown:'Не удалось выполнить запрос.',busy:'Выполняется запрос…',passwordHelp:'Минимум 12 символов при регистрации.'},
 en:{login:'Sign in',register:'Register',account:'BrickLab Workshop',hero:'Your workshop. Anywhere.',intro:'Your real BrickLab Cloud account.',email:'Email',name:'Display name',password:'Password',enter:'Sign in',create:'Create account',local:'Continue without an account',logout:'Sign out',loading:'Checking server session…',retry:'Retry',profile:'Server account',localBuilds:'Local builds',selected:'Selected build',coming:'Private cloud builds and revision history. Save changes explicitly; local builds are retained. Achievements are not connected yet.',closed:'Registration requires administrator approval. Email verification and password recovery are not implemented yet.',https_required:'Sign-in requires HTTPS or a local development address.',auth_unavailable:'Authentication service unavailable. Try again.',invalid_credentials:'Check your input.',invalid_login:'Incorrect email or password.',registration_disabled:'Registration is currently closed.',registration_unavailable:'Unable to create an account with those details.',too_many_attempts:'Too many attempts. Try again later.',invalid_origin:'Application address does not match the server configuration.',unknown:'Request failed.',busy:'Request in progress…',passwordHelp:'At least 12 characters when registering.'}
}
Object.assign(copy.ru,{cloud:'Облачные сборки',refresh:'Обновить список',upload:'Сохранить в облако',saveRevision:'Сохранить изменения',open:'Открыть локальную копию',history:'История версий',download:'Скачать',empty:'Пока нет сборок',saved:'Сборка сохранена в облаке.',linked:'Облако · версия',localWarning:'Копии на этом устройстве остаются в браузере и после выхода из аккаунта. На общем ПК не сохраняй личные модели.',revision_conflict:'В облаке есть более новая версия. Твоя локальная сборка сохранена. Открой новую копию и сравни изменения или сохрани отдельный проект.',projects_unavailable:'Облачное хранилище недоступно.',project_limit:'Достигнут лимит проектов.',revision_limit:'Достигнут лимит версий.',storage_limit:'Достигнут лимит хранилища.',body_too_large:'Сборка превышает допустимый размер.',invalid_document:'Неверный формат сборки.',not_found:'Сборка недоступна.',unauthenticated:'Сессия завершилась. Войди снова.',copyCloud:'Сохранить отдельный проект',localLinkFailed:'Облачная версия сохранена, но локальная связь не записана. Обнови список, чтобы открыть её.',version:'Версия',oldCopy:'Открыть историческую копию',otherAccount:'Связано с другим аккаунтом — сохраняется как отдельная копия.'})
Object.assign(copy.en,{cloud:'Cloud builds',refresh:'Refresh',upload:'Save to cloud',saveRevision:'Save changes',open:'Open local copy',history:'Revision history',download:'Download',empty:'No builds yet',saved:'Build saved to cloud.',linked:'Cloud · revision',localWarning:'Local copies remain in this browser after sign-out. Avoid saving private builds on shared computers.',revision_conflict:'A newer cloud revision exists. Your local build is preserved. Open a fresh copy and compare changes or save a separate project.',projects_unavailable:'Cloud storage unavailable.',project_limit:'Project limit reached.',revision_limit:'Revision limit reached.',storage_limit:'Storage limit reached.',body_too_large:'Build exceeds the size limit.',invalid_document:'Invalid build format.',not_found:'Build unavailable.',unauthenticated:'Session expired. Sign in again.',copyCloud:'Save as separate project',localLinkFailed:'Cloud revision saved, but local link could not be stored. Refresh the list to open it.',version:'Revision',oldCopy:'Open historical copy',otherAccount:'Linked to another account — saves as a separate copy.'})
function node(tag, cls, value) {
 const e=document.createElement(tag); if(cls)e.className=cls; if(value!==undefined)e.textContent=value; return e
}
function action(label,fn,primary=false){
 const e=node('button','workspace-action'+(primary?' primary':''),label);e.type='button';e.onclick=fn;return e
}
function field(label,type,autocomplete,maxLength){
 const wrap=node('label','account-field'),input=node('input');input.type=type;input.autocomplete=autocomplete;input.required=true;input.maxLength=maxLength;wrap.append(node('span',null,label),input);return {wrap,input}
}
export function createCloudAccount({root,link,getProjects,download,openCopy,linkLocal,api=createAuthClient(),cloud=createProjectsClient()}){
 let lang='ru',visible=false,mode='login',user=null,checked=false,busy=false,error='',selected=null,remote=[],historyId=null,history=[],feedback=''
 const t=()=>copy[lang]
 function label(){const e=link.querySelector('[data-account-label]');e.textContent=user?t().account:t().login;link.title=e.textContent;link.setAttribute('aria-label',e.textContent)}
 function message(code){const p=node('p','account-notice',t()[code]??t().unknown);p.setAttribute('role','status');return p}
 function localLink(){const a=node('a','workspace-action',t().local);a.href='#home';return a}
 async function run(fn){
   if(busy)return
   busy=true;error='';render()
   try{const next=await fn();if(next?.id!==user?.id){remote=[];history=[];historyId=null;feedback=''}user=next;checked=true;if(user)remote=await cloud.list()}
   catch(e){error=e.code??'unknown'}
   finally{busy=false;render()}
 }
 function refresh(){return run(()=>api.me())}
 async function operate(fn){
   if(busy||!user)return
   busy=true;error='';feedback='';render()
   try{await fn()}
   catch(e){error=e.code??'unknown';if(e.status===401){user=null;remote=[];history=[];historyId=null}}
   finally{busy=false;render()}
 }
 function control(label,fn,primary=false){const b=action(label,()=>operate(fn),primary);b.disabled=busy;return b}
 async function saveLocal(record,forceNew=false){
   const link=cloudLink(record,user.id)
   const saved=link&&!forceNew?await cloud.save(link.id,link.revision,record.document):await cloud.create(record.document)
   feedback=linkLocal(record.id,{ownerId:user.id,id:saved.id,revision:saved.revision},record.cloud)?'saved':'localLinkFailed'
   remote=await cloud.list()
   if(historyId===saved.id)history=await cloud.revisions(saved.id)
 }
 function cloudPanel(){
   const s=t(),layout=node('div','account-workspace'),local=node('section','account-card account-build-list'),server=node('section','account-card account-detail')
   local.append(node('h2',null,s.localBuilds),node('p','account-muted',s.localWarning))
   const records=[...getProjects()].sort((a,b)=>Number(b.id===selected)-Number(a.id===selected))
   if(!records.length)local.append(node('p','account-muted',s.empty))
   for(const r of records){
     const row=node('div','account-card'),linked=cloudLink(r,user.id)
     row.append(node('strong',null,r.document.name))
     if(linked)row.append(node('small','account-muted',s.linked+' '+linked.revision))
     else if(r.cloud)row.append(node('small','account-muted',s.otherAccount))
     row.append(control(linked?s.saveRevision:s.upload,()=>saveLocal(r),true))
     if(linked)row.append(control(s.copyCloud,()=>saveLocal(r,true)))
     local.append(row)
   }
   server.append(node('h2',null,s.cloud),control(s.refresh,async()=>{remote=await cloud.list();if(historyId)history=await cloud.revisions(historyId)}))
   if(!remote.length)server.append(node('p','account-muted',s.empty))
   for(const p of remote){
     const row=node('div','account-card')
     row.append(node('strong',null,p.name),node('small','account-muted',s.version+' '+p.revision))
     row.append(control(s.open,async()=>{const item=await cloud.get(p.id);openCopy(item.document,{ownerId:user.id,id:item.id,revision:item.revision})},true),
       control(s.download,async()=>download((await cloud.get(p.id)).document)),
       control(s.history,async()=>{historyId=p.id;history=await cloud.revisions(p.id)}))
     if(historyId===p.id)for(const rev of history){
       const entry=node('div','account-revision')
       entry.append(node('strong',null,s.version+' '+rev.revision),control(s.oldCopy,async()=>openCopy((await cloud.get(p.id,rev.revision)).document)),control(s.download,async()=>download((await cloud.get(p.id,rev.revision)).document)))
       row.append(entry)
     }
     server.append(row)
   }
   layout.append(local,server);return layout
 }
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
     root.append(header,card,cloudPanel(),localLink());if(feedback)root.append(message(feedback));if(error)root.append(message(error));if(busy)root.append(message('busy'));return
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
     if(show&&changed){render();if(api.allowed&&!busy){checked=false;refresh()}}else if(show&&!busy&&user)render()
   }
 }
}
