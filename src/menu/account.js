import {renderAdminPanel} from './admin-panel.js?v=security-1'
import {renderBureauPanel} from './bureau-panel.js?v=profile-gallery-1'
import { createAuthClient } from './auth-client.js?v=security-1'

import { createProjectsClient, cloudLink } from './projects-client.js?v=profile-gallery-1'

import { renderCloudWorkshop } from './cloud-workshop.js?v=profile-gallery-1'

import {createProfileClient} from './profile-client.js?v=notifications-1'

import {createActivityClient} from './activity-client.js?v=notifications-1'

import {createCommunityClient} from './community-client.js?v=public-appearance-1'

const copy = {
 ru:{login:'Войти',register:'Регистрация',account:'Мой профиль',hero:'Твоя мастерская. Где угодно.',intro:'Настоящий аккаунт BrickLab Cloud.',email:'Электронная почта',name:'Имя пользователя',password:'Пароль',enter:'Войти',create:'Создать аккаунт',local:'Продолжить без аккаунта',logout:'Выйти',loading:'Проверяем серверную сессию…',retry:'Повторить проверку',profile:'Серверный аккаунт',localBuilds:'Локальные сборки',selected:'Выбранная сборка',coming:'Приватные облачные сборки и история версий. Сохраняй изменения явно; локальные сборки не удаляются. Достижения пока не подключены.',closed:'Регистрация доступна только при разрешении администратора. Подтверждение почты и восстановление пароля ещё не реализованы.',https_required:'Для входа необходим HTTPS или локальный адрес разработки.',auth_unavailable:'Сервер авторизации недоступен. Повтори попытку.',invalid_credentials:'Проверь введённые данные.',invalid_login:'Неверная почта или пароль.',registration_disabled:'Регистрация пока закрыта.',registration_unavailable:'Не удалось создать аккаунт с этими данными.',too_many_attempts:'Слишком много попыток. Попробуй позже.',invalid_origin:'Адрес приложения не совпадает с настройками сервера.',unknown:'Не удалось выполнить запрос.',busy:'Выполняется запрос…',passwordHelp:'Минимум 12 символов при регистрации.'},
 en:{login:'Sign in',register:'Register',account:'My profile',hero:'Your workshop. Anywhere.',intro:'Your real BrickLab Cloud account.',email:'Email',name:'Display name',password:'Password',enter:'Sign in',create:'Create account',local:'Continue without an account',logout:'Sign out',loading:'Checking server session…',retry:'Retry',profile:'Server account',localBuilds:'Local builds',selected:'Selected build',coming:'Private cloud builds and revision history. Save changes explicitly; local builds are retained. Achievements are not connected yet.',closed:'Registration requires administrator approval. Email verification and password recovery are not implemented yet.',https_required:'Sign-in requires HTTPS or a local development address.',auth_unavailable:'Authentication service unavailable. Try again.',invalid_credentials:'Check your input.',invalid_login:'Incorrect email or password.',registration_disabled:'Registration is currently closed.',registration_unavailable:'Unable to create an account with those details.',too_many_attempts:'Too many attempts. Try again later.',invalid_origin:'Application address does not match the server configuration.',unknown:'Request failed.',busy:'Request in progress…',passwordHelp:'At least 12 characters when registering.'}
}
Object.assign(copy.ru,{cloud:'Облачные сборки',refresh:'Обновить список',upload:'Сохранить в облако',saveRevision:'Сохранить изменения',open:'Открыть локальную копию',history:'История версий',download:'Скачать',empty:'Пока нет сборок',saved:'Сборка сохранена в облаке.',linked:'Облако · версия',localWarning:'Копии на этом устройстве остаются в браузере и после выхода из аккаунта. На общем ПК не сохраняй личные модели.',revision_conflict:'В облаке есть более новая версия. Твоя локальная сборка сохранена. Открой новую копию и сравни изменения или сохрани отдельный проект.',projects_unavailable:'Облачное хранилище недоступно.',project_limit:'Достигнут лимит проектов.',revision_limit:'Достигнут лимит версий.',storage_limit:'Достигнут лимит хранилища.',body_too_large:'Сборка превышает допустимый размер.',invalid_document:'Неверный формат сборки.',not_found:'Сборка недоступна.',unauthenticated:'Сессия завершилась. Войди снова.',copyCloud:'Сохранить отдельный проект',localLinkFailed:'Облачная версия сохранена, но локальная связь не записана. Обнови список, чтобы открыть её.',version:'Версия',oldCopy:'Открыть историческую копию',otherAccount:'Связано с другим аккаунтом — сохраняется как отдельная копия.'})
Object.assign(copy.en,{cloud:'Cloud builds',refresh:'Refresh',upload:'Save to cloud',saveRevision:'Save changes',open:'Open local copy',history:'Revision history',download:'Download',empty:'No builds yet',saved:'Build saved to cloud.',linked:'Cloud · revision',localWarning:'Local copies remain in this browser after sign-out. Avoid saving private builds on shared computers.',revision_conflict:'A newer cloud revision exists. Your local build is preserved. Open a fresh copy and compare changes or save a separate project.',projects_unavailable:'Cloud storage unavailable.',project_limit:'Project limit reached.',revision_limit:'Revision limit reached.',storage_limit:'Storage limit reached.',body_too_large:'Build exceeds the size limit.',invalid_document:'Invalid build format.',not_found:'Build unavailable.',unauthenticated:'Session expired. Sign in again.',copyCloud:'Save as separate project',localLinkFailed:'Cloud revision saved, but local link could not be stored. Refresh the list to open it.',version:'Revision',oldCopy:'Open historical copy',otherAccount:'Linked to another account — saves as a separate copy.'})
Object.assign(copy.ru,{profile_unavailable:'Профиль недоступен.',invalid_profile:'Проверь описание и обложку.',profileSaved:'Профиль сохранён на сервере.'})
Object.assign(copy.en,{profile_unavailable:'Profile unavailable.',invalid_profile:'Check biography and cover.',profileSaved:'Profile saved on the server.'})
Object.assign(copy.ru,{invalid_image:'Не удалось обработать изображение. Допустимы PNG, JPEG и WebP.',background_locked:'Этот фон ещё не получен.',mediaSaved:'Внешний вид сохранён.'})
Object.assign(copy.en,{invalid_image:'Image could not be processed. Use PNG, JPEG or WebP.',background_locked:'This background is not owned.',mediaSaved:'Appearance saved.'})
Object.assign(copy.ru,{activity_unavailable:'Избранное и уведомления недоступны.',favoriteAdd:'В избранное',favoriteRemove:'Убрать из избранного'})
Object.assign(copy.en,{activity_unavailable:'Activity unavailable.',favoriteAdd:'Add to favorites',favoriteRemove:'Remove from favorites'})
Object.assign(copy.ru,{community_disabled:'Сообщество пока отключено на этом сервере.',community_unavailable:'Сообщество недоступно.',invalid_public_profile:'Проверь публичное имя и описание.',publicSaved:'Публичный профиль опубликован.',publicRemoved:'Публикация снята.'})
Object.assign(copy.en,{community_disabled:'Community is disabled on this server.',community_unavailable:'Community unavailable.',invalid_public_profile:'Check public name and biography.',publicSaved:'Public profile published.',publicRemoved:'Profile unpublished.'})
Object.assign(copy.ru,{public_profile_required:'Сначала опубликуй профиль конструктора.',invalid_publication:'Проверь описание и согласие на публикацию.',publicationSaved:'Сборка опубликована.',publicationRemoved:'Публикация сборки снята.',managePublic:'Управление публикациями'})
Object.assign(copy.en,{public_profile_required:'Publish your builder profile first.',invalid_publication:'Check description and publication consent.',publicationSaved:'Build published.',publicationRemoved:'Build unpublished.',managePublic:'Manage publications'})
Object.assign(copy.ru,{closed:'Регистрация новых аккаунтов управляется сервером.',forgot:'Забыли пароль?',reset:'Восстановление пароля',verify:'Подтверждение почты',resetConfirm:'Новый пароль',sendCode:'Отправить код на почту',code:'Код из письма',codeSent:'Если адрес подходит, код отправлен. Проверь почту и спам. Код действителен 30 минут.',accountCreated:'Аккаунт создан. Теперь войди.',passwordChanged:'Пароль изменён. Войди с новым паролем.',invalid_code:'Код неверный или просрочен.',mail_unavailable:'Отправка почты пока недоступна.',revokeOthers:'Завершить остальные сессии',sessionsRevoked:'Другие сессии завершены.',admin:'Панель администратора',admin_required:'Недостаточно прав.',registration_disabled:'Регистрация пока закрыта.'})
Object.assign(copy.en,{closed:'New account registration is controlled by the server.',forgot:'Forgot password?',reset:'Password recovery',verify:'Verify email',resetConfirm:'New password',sendCode:'Send email code',code:'Code from email',codeSent:'If the address is eligible, a code was sent. Check inbox and spam. It expires in 30 minutes.',accountCreated:'Account created. Sign in now.',passwordChanged:'Password changed. Sign in with your new password.',invalid_code:'Invalid or expired code.',mail_unavailable:'Email delivery is not available.',revokeOthers:'End other sessions',sessionsRevoked:'Other sessions ended.',admin:'Administration',admin_required:'Insufficient privileges.',registration_disabled:'Registration is currently closed.'})
function node(tag, cls, value) {
 const e=document.createElement(tag); if(cls)e.className=cls; if(value!==undefined)e.textContent=value; return e
}
function action(label,fn,primary=false){
 const e=node('button','workspace-action'+(primary?' primary':''),label);e.type='button';e.onclick=fn;return e
}
function field(label,type,autocomplete,maxLength){
 const wrap=node('label','account-field'),input=node('input');input.type=type;input.autocomplete=autocomplete;input.required=true;input.maxLength=maxLength;wrap.append(node('span',null,label),input);return {wrap,input}
}
export function createCloudAccount({root,link,getProjects,download,openCopy,linkLocal,onNotifications=()=>{},onProjectsChanged=()=>{},api=createAuthClient(),cloud=createProjectsClient(),profiles=createProfileClient(),activityApi=createActivityClient(),communityApi=createCommunityClient()}){
 let lang='ru',visible=false,mode='login',user=null,checked=false,busy=false,error='',remote=[],historyId=null,history=[],feedback='',section='workshop',profileData=null,activityData=null,publicCard=null,publicLoaded=false,publicBuilds=[]
 let bureauController=null,bureauSelection={id:null},adminController=null,emailDraft='',securityFeedback=''
 let notificationError=false,bellRefreshing=false,bellRendered=false
 const t=()=>copy[lang]
 function publishNotifications(){onNotifications({lang,signedIn:Boolean(user),checked,busy,items:activityData?.notifications??null,error:notificationError})}
 function label(){const e=link.querySelector('[data-account-label]');e.textContent=user?t().account:t().login;link.title=e.textContent;link.setAttribute('aria-label',e.textContent)}
 function message(code){const p=node('p','account-notice',t()[code]??t().unknown);p.setAttribute('role','status');return p}
 function localLink(){const a=node('a','workspace-action',t().local);a.href='#home';return a}
 async function run(fn){
   if(busy)return
   busy=true;error='';notificationError=false;render()
   try{const next=await fn();if(next?.id!==user?.id){remote=[];history=[];historyId=null;feedback='';profileData=null;activityData=null;publicCard=null;publicLoaded=false;publicBuilds=[];bureauSelection={id:null};section=next&&section==='notifications'?'notifications':'workshop'}user=next;checked=true;if(user){remote=await cloud.list();profileData=await profiles.get();activityData=await activityApi.get()}}
   catch(e){error=e.code??'unknown';notificationError=true}
   finally{busy=false;render()}
 }
 function refresh(){return run(()=>api.me())}
 async function refreshNotifications(mark=false){
   if(!api.allowed||busy)return
   busy=true;notificationError=false;bellRefreshing=true;bellRendered=false;publishNotifications()
   let identityChanged=false
   try{
     const next=await api.me()
     checked=true
     if(next?.id!==user?.id){
       user=next;identityChanged=true;remote=[];history=[];historyId=null;profileData=null;activityData=null;publicCard=null;publicLoaded=false;publicBuilds=[];bureauSelection={id:null};feedback='';error=''
       if(user){remote=await cloud.list();profileData=await profiles.get()}
     }
     if(user)activityData=mark&&!identityChanged?await activityApi.read():await activityApi.get()
     else activityData=null
   }catch(e){
     notificationError=true
     if(!checked)error=e.code??'auth_unavailable'
     if(e.status===401){user=null;remote=[];history=[];historyId=null;profileData=null;activityData=null;publicCard=null;publicLoaded=false;publicBuilds=[];bureauSelection={id:null};identityChanged=true}
   }finally{
     busy=false;bellRefreshing=false
     if(identityChanged||visible&&(bellRendered||section==='notifications'||!user&&!checked))render()
     else{
       label();publishNotifications();onProjectsChanged()
       const badge=root.querySelector('[data-notification-nav-count]')
       if(badge){const n=activityData?.notifications.filter(x=>!x.read).length??0;badge.textContent=n;badge.hidden=!n}
     }
   }
 }
 async function operate(fn){
   if(busy||!user)return
   busy=true;error='';feedback='';notificationError=false;render()
   try{await fn()}
   catch(e){error=e.code??'unknown';if(e.status===401){user=null;remote=[];history=[];historyId=null;profileData=null;activityData=null;publicCard=null;publicLoaded=false;publicBuilds=[];bureauSelection={id:null}}}
   finally{busy=false;render()}
 }
 function control(label,fn,primary=false){const b=action(label,()=>operate(fn),primary);b.disabled=busy;return b}
 async function saveLocal(record,forceNew=false){
   const link=cloudLink(record,user.id)
   const saved=link&&!forceNew?await cloud.save(link.id,link.revision,record.document):await cloud.create(record.document)
   if(record.cloud?.kind==='bureau'){feedback='saved';remote=await cloud.list();profileData=await profiles.get();activityData=await activityApi.get();return}
   feedback=linkLocal(record.id,{ownerId:user.id,id:saved.id,revision:saved.revision},record.cloud)?'saved':'localLinkFailed'
   remote=await cloud.list();profileData=await profiles.get();activityData=await activityApi.get()
   if(historyId===saved.id)history=await cloud.revisions(saved.id)
 }
 function localProjectControls(r){
   const s=t(),row=node('div','project-cloud-controls')
   if(!user){const link=node('a','workspace-action',lang==='ru'?'Войти для сохранения в облако':'Sign in to save to cloud');link.href='#account';row.append(link);return row}
   const linked=cloudLink(r,user.id)
   if(linked)row.append(node('small','account-muted',s.linked+' '+linked.revision))
   else if(r.cloud?.kind==='bureau')row.append(node('small','account-muted',lang==='ru'?'Совместный проект · версия '+r.cloud.revision:'Shared project · revision '+r.cloud.revision))
   else if(r.cloud)row.append(node('small','account-muted',s.otherAccount))
   row.append(control(linked?s.saveRevision:r.cloud?.kind==='bureau'?s.copyCloud:s.upload,()=>saveLocal(r),true))
   if(linked)row.append(control(s.copyCloud,()=>saveLocal(r,true)))
   return row
 }
 function remoteProjectControls(p){
   const s=t(),row=node('div','project-cloud-controls')
   if(!user)return row
   row.append(node('small','account-muted',(lang==='ru'?'Облако · актуальная версия ':'Cloud · latest revision ')+p.revision))
   row.append(control(s.open,async()=>{const item=await cloud.get(p.id);openCopy(item.document,{ownerId:user.id,id:item.id,revision:item.revision})},true),
     control(s.download,async()=>download((await cloud.get(p.id)).document)),
     control(s.history,async()=>{if(historyId===p.id){historyId=null;history=[]}else{history=await cloud.revisions(p.id);historyId=p.id}}))
   const publish=action(s.managePublic,()=>{section='workshop';location.hash='#account';render()});publish.disabled=busy;row.append(publish)
   const favorite=activityData?.favorites.some(f=>f.id===p.id)
   if(activityData)row.append(control(favorite?s.favoriteRemove:s.favoriteAdd,async()=>{activityData=await activityApi.favorite(p.id,!favorite)}))
   if(historyId===p.id)for(const rev of history){
     const entry=node('div','account-revision')
     entry.append(node('strong',null,s.version+' '+rev.revision),control(s.oldCopy,async()=>openCopy((await cloud.get(p.id,rev.revision)).document)),control(s.download,async()=>download((await cloud.get(p.id,rev.revision)).document)))
     row.append(entry)
   }
   return row
 }
 function render(){
   bureauController?.abort();bureauController=null;adminController?.abort();adminController=null
   label();publishNotifications();onProjectsChanged();if(!visible)return
   if(bellRefreshing)bellRendered=true
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
     const projects=getProjects()
     if(profileData?.profile.avatarUrl){const img=node('img','profile-avatar-image');img.src=profileData.profile.avatarUrl;img.alt='';avatar.replaceChildren(img)}
     root.append(header,renderCloudWorkshop({lang,user,local:projects,remote,section:section==='admin'&&!user.admin?'workshop':section,busy,revokeOthers(){operate(async()=>{await api.revokeOthers();feedback='sessionsRevoked'})},adminPanel:()=>{adminController=new AbortController();return renderAdminPanel({lang,signal:adminController.signal})},bureauPanel:()=>{bureauController=new AbortController();return renderBureauPanel({lang,user,signal:bureauController.signal,getProjects,openCopy,linkLocal,download,selection:bureauSelection})},profileData,activityData,publicCard,publicLoaded,publicBuilds,loadPublic(){operate(async()=>{publicCard=await communityApi.get();publicBuilds=await communityApi.builds();publicLoaded=true})},publishBuild(id,data){operate(async()=>{publicBuilds=await communityApi.publishBuild(id,data);feedback='publicationSaved'})},unpublishBuild(id){operate(async()=>{publicBuilds=await communityApi.unpublishBuild(id);feedback='publicationRemoved'})},publishPublic(data){operate(async()=>{publicCard=await communityApi.publish(data);publicLoaded=true;feedback='publicSaved'})},unpublishPublic(){operate(async()=>{publicCard=await communityApi.unpublish();publicBuilds=[];publicLoaded=true;feedback='publicRemoved'})},refreshActivity(){operate(async()=>{activityData=await activityApi.get()})},readActivity(){operate(async()=>{activityData=await activityApi.read()})},toggleFavorite(id,add){operate(async()=>{activityData=await activityApi.favorite(id,add)})},openFavorite(id){operate(async()=>{const item=await cloud.get(id);openCopy(item.document,{ownerId:user.id,id:item.id,revision:item.revision})})},uploadMedia(kind,file){operate(async()=>{profileData=await profiles.upload(kind,file);feedback='mediaSaved'})},removeMedia(kind){operate(async()=>{profileData=await profiles.remove(kind);feedback='mediaSaved'})},saveProfile(data){operate(async()=>{profileData=await profiles.save(data);feedback='profileSaved'})},
       go(key){if(key==='cloud'){location.hash='#projects';return}section=key;render()}}),localLink());if(feedback)root.append(message(feedback));if(error)root.append(message(error));if(busy)root.append(message('busy'));return
   }
   const panel=node('div','account-auth'),hero=node('div','account-auth-hero'),brand=node('div','account-brand','BRICKLAB CLOUD')
   hero.append(brand,node('h2',null,s.hero),node('p',null,s.intro))
   const art=node('img','account-hero-art');art.src=new URL('../../assets/examples/5-plus-r-gearbox.webp',import.meta.url).href;art.alt='';hero.append(art)
   const form=node('form','account-auth-form'),tabs=node('div','account-tabs')
   for(const k of ['login','register']){const b=action(s[k],()=>{mode=k;error='';securityFeedback='';render()});b.disabled=busy;b.setAttribute('aria-pressed',String(mode===k));tabs.append(b)}
   form.append(tabs,node('h2',null,s[mode]))
   const secure=globalThis.location.protocol==='https:',reg=mode==='register',verify=mode==='verify',reset=mode==='reset',resetConfirm=mode==='resetConfirm',sendOnly=reset||reg&&secure,finish=verify||resetConfirm
   const name=(verify||reg&&!secure)?field(s.name,'text','nickname',80):null,email=field(s.email,'email','username',254),password=sendOnly?null:field(s.password,'password',reg||finish?'new-password':'current-password',256),code=finish?field(s.code,'text','one-time-code',48):null
   email.input.value=emailDraft;if(name)form.append(name.wrap)
   if(reg)form.append(node('p','account-muted',s.closed))
   form.append(email.wrap)
   if(code){code.input.minLength=48;code.input.autocapitalize='none';code.input.spellcheck=false;form.append(code.wrap)}
   if(password){if(reg||finish){password.input.minLength=12;form.append(node('p','account-muted',s.passwordHelp))}form.append(password.wrap)}
   for(const f of [name,email,password,code])if(f)f.input.disabled=busy
   const submit=node('button','workspace-action primary',sendOnly?s.sendCode:verify?s.create:resetConfirm?s.resetConfirm:reg?s.create:s.enter);submit.type='submit';submit.disabled=busy;form.append(submit,localLink())
   if(mode==='login'&&secure)form.append(action(s.forgot,()=>{mode='reset';error='';securityFeedback='';render()}))
   if(finish)form.append(action(s.sendCode,()=>{mode=verify?'register':'reset';error='';securityFeedback='';render()}))
   if(securityFeedback)form.append(message(securityFeedback));if(error)form.append(message(error));if(busy)form.append(message('busy'))
   form.addEventListener('submit',event=>{
     event.preventDefault();if(busy)return
     const data={email:email.input.value,...(password?{password:password.input.value}:{}),...(name?{displayName:name.input.value}:{}),...(code?{code:code.input.value.trim().toLowerCase()}: {})}
     emailDraft=data.email;if(password)password.input.value=''
     if(!sendOnly&&!finish){securityFeedback='';run(()=>reg?api.register(data):api.login(data));return}
     busy=true;error='';securityFeedback='';render()
     void (async()=>{
      try{
       if(sendOnly){if(reset)await api.resetRequest(data.email);else await api.register({email:data.email});mode=reset?'resetConfirm':'verify';securityFeedback='codeSent'}
       else{if(verify)await api.verify(data);else await api.resetConfirm(data);mode='login';securityFeedback=verify?'accountCreated':'passwordChanged'}
      }catch(e){error=e.code??'unknown'}finally{busy=false;render()}
     })()
   })
   panel.append(hero,form);root.append(panel)
 }
 return {
   projectState(){return {signedIn:Boolean(user),checked,busy,ownerId:user?.id,remote:user?remote:[],message:error?t()[error]??t().unknown:feedback?t()[feedback]??'':'',warning:user?t().localWarning:''}},
   localProjectControls,
   remoteProjectControls,
   refreshProjects(){return operate(async()=>{remote=await cloud.list();activityData=await activityApi.get();if(historyId)history=await cloud.revisions(historyId)})},
   async fetchProjectPreview(id,ownerId,signal){if(!user||user.id!==ownerId||signal?.aborted)return null;const item=await cloud.get(id,undefined,signal);return user?.id===ownerId&&!signal?.aborted?item:null},
   showNotifications(){section='notifications';if(visible)render()},
   refreshNotifications,
   readNotifications(){return refreshNotifications(true)},
   update(language,show){
     const next=language==='en'?'en':'ru',changed=next!==lang||visible!==show
     lang=next;visible=show;if(!show){bureauController?.abort();bureauController=null;adminController?.abort();adminController=null}label();publishNotifications()
     if(!show&&!checked&&api.allowed&&!busy&&!notificationError)void refreshNotifications()
     if(show&&changed){render();if(api.allowed&&!busy){checked=false;refresh()}}else if(show&&!busy&&user)render()
   }
 }
}
