import { modelPassport, badges, ranks, rankFor, challenges, challengeReadiness } from './workshop-model.js?v=activity-1'
import { workshopCopy } from './workshop-copy.js?v=activity-1'

export const sections=[['workshop','icon-home'],['cloud','folder'],['passport','icon-account'],['achievements','icon-trophy'],['challenges','icon-flask'],['rankings','icon-trophy'],['publicProfile','icon-account'],['diary','book'],['bureau','icon-account'],['favorites','icon-heart'],['notifications','icon-bell'],['storage','icon-cloud'],['settings','settings'],['security','icon-shield'],['cosmetics','icon-heart']]
const implemented=new Set(['workshop','cloud','passport','achievements','challenges','storage','settings','security','cosmetics','diary','favorites','notifications','publicProfile'])
const extra={
 ru:{active:'Личный аккаунт · BrickLab Cloud',pending:'Этот раздел ещё не подключён к серверу.',noAwards:'Серверный учёт наград ещё не подключён. XP и награды не начисляются по локальным данным.',catalog:'Каталог будущих достижений',rankPlan:'Планируемая лестница званий',localDoc:'Локальный документ',cloudDoc:'Облачная ревизия',chooseSource:'Источник паспорта',load:'Загрузить паспорт',latest:'Актуальная версия',privateOnly:'Все облачные сборки пока приватные.',limits:'Текущие ограничения: 20 проектов, 20 версий на проект, запрос до 2 МиБ, бюджет около 64 МиБ на аккаунт.',noBytes:'Точное использование диска пока не отображается.',identity:'Данные текущей серверной сессии. Редактирование профиля будет подключено отдельно.',securityText:'Серверная сессия хранится в HttpOnly cookie. Управление всеми сессиями, подтверждение почты, восстановление пароля и 2FA пока не подключены.',errors:'Ошибки ссылок',malformed:'Некорректные детали',duplicates:'Повторяющиеся ID',unavailable:'Нет данных для паспорта',actual:'Подтверждённые облачные данные',notIssued:'Начисление не подключено',manual:'Сохранение и получение сборок выполняются вручную.',sourceLocal:'Локальная',sourceCloud:'Облачная'},
 en:{active:'Personal account · BrickLab Cloud',pending:'This section is not connected to the server yet.',noAwards:'Server-issued awards are not connected yet. Local data does not award XP or badges.',catalog:'Upcoming achievement catalog',rankPlan:'Planned rank ladder',localDoc:'Local document',cloudDoc:'Cloud revision',chooseSource:'Passport source',load:'Load passport',latest:'Latest revision',privateOnly:'All cloud builds are currently private.',limits:'Current limits: 20 projects, 20 revisions per project, 2 MiB per request, approximately 64 MiB per account.',noBytes:'Exact disk usage is not available yet.',identity:'Current server session identity. Profile editing will be connected separately.',securityText:'The server session uses an HttpOnly cookie. Session management, email verification, password recovery and 2FA are not connected yet.',errors:'Broken links',malformed:'Malformed parts',duplicates:'Duplicate IDs',unavailable:'No passport data',actual:'Confirmed cloud data',notIssued:'Awards not connected',manual:'Builds are saved and retrieved manually.',sourceLocal:'Local',sourceCloud:'Cloud'}
}
Object.assign(extra.ru,{firstCloudSave:'Первая облачная сборка',firstCloudSaveDesc:'Первое успешное сохранение на сервере: 30 XP, один раз.',awarded:'Получено',progressHint:'XP за подтверждённое сервером сохранение. Это не оценка инженерных навыков.',profileHint:'Описание и обложка сохраняются в приватном профиле.',profileMissing:'Данные профиля пока недоступны.'})
Object.assign(extra.en,{firstCloudSave:'First cloud build',firstCloudSaveDesc:'First successful cloud save: 30 XP, once.',awarded:'Awarded',progressHint:'XP for a server-confirmed save, not an engineering skill assessment.',profileHint:'Biography and cover are saved in your private profile.',profileMissing:'Profile data is unavailable.'})
Object.assign(extra.ru,{cosmetics:'Магазин и инвентарь',avatarUpload:'Аватар · PNG/JPEG/WebP, до 2 МБ',coverUpload:'Обложка · PNG/JPEG/WebP, до 5 МБ',upload:'Загрузить',removeImage:'Удалить изображение',owned:'Получено',lockedBackground:'Не получено',equip:'Установить фон',equipped:'Установлен',free:'Бесплатно',achievement:'За первую облачную сборку',purchase:'Покупка пока недоступна',default:'Стандартный', 'first-build':'Первый конструктор',carbon:'Карбон',neon:'Неоновая мастерская',cosmeticHint:'Фоны меняют только оформление. Оплата и выдача платных предметов ещё не подключены.',chooseFile:'Выбрать изображение'})
Object.assign(extra.en,{cosmetics:'Shop and inventory',avatarUpload:'Avatar · PNG/JPEG/WebP, up to 2 MB',coverUpload:'Cover · PNG/JPEG/WebP, up to 5 MB',upload:'Upload',removeImage:'Remove image',owned:'Owned',lockedBackground:'Locked',equip:'Equip background',equipped:'Equipped',free:'Free',achievement:'First cloud build',purchase:'Purchase not available yet',default:'Default','first-build':'First builder',carbon:'Carbon',neon:'Neon workshop',cosmeticHint:'Backgrounds are cosmetic only. Payments and paid-item fulfillment are not connected.',chooseFile:'Choose image'})
Object.assign(extra.ru,{activityRefresh:'Обновить',activityMissing:'Данные активности недоступны.',activityEmpty:'Событий пока нет.',createdBuild:'Создана облачная сборка',savedRevision:'Сохранена ревизия',openBuild:'Открыть копию',readNotice:'Прочитано',newNotice:'Новое',awardNotice:'Получено достижение',bytesHint:'Логический объём документов всех ревизий, без служебных данных базы и изображений.',recent:'Последние 100 сохранений'})
Object.assign(extra.en,{activityRefresh:'Refresh',activityMissing:'Activity unavailable.',activityEmpty:'No events yet.',createdBuild:'Cloud build created',savedRevision:'Revision saved',openBuild:'Open copy',readNotice:'Read',newNotice:'New',awardNotice:'Achievement earned',bytesHint:'Logical size of all revision documents, excluding database overhead and images.',recent:'Latest 100 saves'})
Object.assign(extra.ru,{publicLoad:'Проверить статус публикации',publicExplain:'Публикуются только имя и описание, введённые ниже. Почта, приватная аватарка, обложка и сборки не публикуются. Любой посетитель сможет увидеть карточку; снятие публикации не удаляет уже сделанные копии.',publicName:'Публичное имя',publicBio:'Публичное описание',publishCard:'Опубликовать профиль',updateCard:'Обновить публикацию',unpublishCard:'Снять публикацию',publicConfirm:'Я согласен сделать эти данные общедоступными.',visitCard:'Открыть публичный профиль',visitCommunity:'Каталог конструкторов',notPublished:'Профиль не опубликован',isPublished:'Профиль опубликован'})
Object.assign(extra.en,{publicLoad:'Check publication status',publicExplain:'Only the name and biography entered below are published. Email, private avatar, cover and builds remain private. Anyone can view the card; unpublishing cannot remove copies already made.',publicName:'Public name',publicBio:'Public biography',publishCard:'Publish profile',updateCard:'Update publication',unpublishCard:'Unpublish',publicConfirm:'I agree to make these details public.',visitCard:'Open public profile',visitCommunity:'Builder directory',notPublished:'Profile not published',isPublished:'Profile published'})
function el(tag,cls,value){const n=document.createElement(tag);if(cls)n.className=cls;if(value!==undefined)n.textContent=String(value);return n}
function icon(id){const s=document.createElementNS('http://www.w3.org/2000/svg','svg'),u=document.createElementNS(s.namespaceURI,'use');s.setAttribute('class','icon');s.setAttribute('aria-hidden','true');u.setAttribute('href','#'+id);s.append(u);return s}
function button(label,fn,disabled=false){const b=el('button','workspace-action',label);b.type='button';b.disabled=disabled;b.onclick=fn;return b}
function card(title){const c=el('section','account-card workshop-card');c.append(el('h2',null,title));return c}
function metric(label,value){const m=el('div','workshop-metric');m.append(el('span',null,label),el('strong',null,value));return m}
function metrics(items){const g=el('div','workshop-metric-grid');for(const [k,v] of items)g.append(metric(k,v));return g}
export function workshopSummary(local,remote){
 return {local:local.length,cloud:remote.length,revisions:remote.reduce((n,p)=>n+(Number.isSafeInteger(p.revision)&&p.revision>0?p.revision:0),0)}
}
export function renderCloudWorkshop({lang,user,local,remote,section,busy,go,cloudPanel,passport,selectPassport,loadPassport,profileData,saveProfile,uploadMedia,removeMedia,activityData,publicCard,publicLoaded,loadPublic,publishPublic,unpublishPublic,refreshActivity,readActivity,toggleFavorite,openFavorite}){
 const t={...workshopCopy[lang],...extra[lang]},summary=workshopSummary(local,remote)
 const profile=profileData?.profile,progress=profileData?.progress,rank=progress?rankFor(progress.xp):null
 const layout=el('div','workshop-layout cosmetic-'+(profile?.background??'default')),nav=el('nav','workshop-nav'),content=el('div','workshop-content')
 nav.setAttribute('aria-label',t.workshop)
 for(const [key,symbol] of sections){
  const b=button(t[key],()=>go(key),busy);b.prepend(icon(symbol));b.setAttribute('aria-pressed',String(section===key))
  if(section===key)b.setAttribute('aria-current','page')
  if(!implemented.has(key))b.title=t.pending
  if(key==='notifications'){const n=activityData?.notifications.filter(x=>!x.read).length??0,badge=el('small','workshop-unread',n);badge.dataset.notificationNavCount='';badge.hidden=!n;b.append(badge)}
  nav.append(b)
 }
 content.append(el('h2','workshop-section-title',t[section]))
 if(section==='cloud')content.append(cloudPanel())
 else if(section==='workshop'){
  const hero=el('section','workshop-hero cover-'+(profile?.cover??'blueprint')),cover=el('div','workshop-cover'),emblem=el('div','workshop-emblem','BRICKLAB / WORKSHOP')
  emblem.prepend(icon('layers'));cover.append(emblem);if(profile?.coverUrl){const image=el('img','profile-cover-image');image.src=profile.coverUrl;image.alt='';cover.prepend(image)}
  const identity=el('div','workshop-hero-inner'),person=el('div','workshop-identity'),name=el('div')
  name.append(el('h2',null,user.displayName),el('p','account-muted',t.active))
  const avatar=el('div','workshop-avatar',Array.from(user.displayName).slice(0,2).join('').toUpperCase());if(profile?.avatarUrl){const img=el('img','profile-avatar-image');img.src=profile.avatarUrl;img.alt='';avatar.replaceChildren(img)}person.append(avatar,name);identity.append(person)
  hero.append(cover,identity);if(profile?.bio)hero.append(el('p','workshop-bio',profile.bio));hero.append(metrics([[t.local,summary.local],[t.cloud,summary.cloud],[t.revisions,summary.revisions],[t.xp,progress?.xp??'—'],[t.title,rank?t[rank.id]:'—']]))
  const actions=card(t.welcome),quick=el('div','workshop-shortcuts')
  for(const key of ['cloud','passport','storage','diary','favorites','security'])quick.append(button(t[key],()=>go(key),busy))
  actions.append(el('p','account-muted',t.manual),quick)
  content.append(hero,actions)
 }else if(section==='passport'){
  const c=card(t.buildPassport),label=el('label','account-field'),choose=el('select')
  const blank=el('option',null,t.select);blank.value='';choose.append(blank)
  for(const r of local){const opt=el('option',null,t.sourceLocal+' · '+r.document.name);opt.value='local:'+r.id;choose.append(opt)}
  for(const r of remote){const opt=el('option',null,t.sourceCloud+' · '+r.name+' · '+r.revision);opt.value='cloud:'+r.id;choose.append(opt)}
  choose.value=passport.source;choose.disabled=busy;choose.onchange=()=>selectPassport(choose.value)
  label.append(el('span',null,t.chooseSource),choose);c.append(label)
  if(passport.source.startsWith('cloud:'))c.append(button(t.load,loadPassport,busy))
  const doc=passport.source.startsWith('local:')?local.find(r=>'local:'+r.id===passport.source)?.document:passport.document
  if(doc){
   const p=modelPassport(doc)
   c.append(el('h2',null,doc.name),el('p','account-muted',passport.source.startsWith('cloud:')?t.cloudDoc+' '+passport.revision:t.localDoc),
    metrics([[t.parts,p.parts],[t.connections,p.connections],[t.gearsCount,p.gears],[t.belts,p.belts]]),
    el('p',null,t.structure+': '+(p.structure?t.valid:t.invalid)),
    metrics([[t.errors,p.broken],[t.malformed,p.malformed],[t.duplicates,p.duplicates]]),
    el('p',null,t.drive+': '+(p.driveConfigured?t.configured:t.notConfigured)),
    el('p','account-muted',t.kinematics+': '+t.unverified+' · '+t.physicsTest+': '+t.unverified),
    el('p','account-muted',t.unverifiedHint),el('p','account-notice',t.noCertificate))
  }else c.append(el('p','account-muted',t.unavailable))
  content.append(c)
 }else if(section==='achievements'){
  const c=card(t.achievements),grid=el('div','workshop-badges');c.append(el('p','account-muted',t.progressHint));const first=el('div','workshop-badge'+(progress?.awards.some(a=>a.award==='firstCloudSave')?' earned':''));first.append(el('strong',null,t.firstCloudSave),el('p','account-muted',t.firstCloudSaveDesc),el('small',null,progress?progress.awards.some(a=>a.award==='firstCloudSave')?t.awarded:t.locked:t.profileMissing));grid.append(first)
  for(const b of badges){const item=el('div','workshop-badge rarity-'+b.rarity),medal=el('div','workshop-medal');medal.append(icon(b.icon));item.append(medal,el('strong',null,t[b.id==='bureau'?'bureauBadge':b.id]),el('p','account-muted',t[b.id+'Desc']),el('small',null,t.notIssued));grid.append(item)}
  c.append(grid);const ladder=card(t.rankPlan)
  for(const [key,xp] of ranks){const row=el('div','workshop-between workshop-rank-row');row.append(el('span',null,t[key]),el('strong',null,xp+' XP'));ladder.append(row)}
  content.append(c,ladder)
 }else if(section==='challenges'){
  const c=card(t.challenges);c.append(el('p','account-muted',t.noAward))
  for(const challenge of challenges){
   const row=card(t[challenge.id]);row.append(el('p','account-muted',t[challenge.id+'Desc']))
   const pick=el('select'),label=el('label','account-field'),blank=el('option',null,t.select);blank.value='';pick.append(blank)
   for(const r of local){const opt=el('option',null,r.document.name);opt.value=r.id;pick.append(opt)}
   label.append(el('span',null,t.chooseBuild),pick)
   const result=el('p','account-muted');result.setAttribute('role','status')
   row.append(label,button(t.check,()=>{const doc=local.find(r=>r.id===pick.value)?.document,report=challengeReadiness(challenge,doc);result.textContent=report.ready?t.ready:report.reasons.map(k=>t[k]).join(' · ')}),result);c.append(row)
  }
  content.append(c)
 }else if(['diary','favorites','notifications'].includes(section)){
  const c=card(t[section]);c.append(button(t.activityRefresh,refreshActivity,busy))
  const date=value=>new Intl.DateTimeFormat(lang,{dateStyle:'medium',timeStyle:'short'}).format(new Date(value))
  if(!activityData)c.append(el('p','account-muted',t.activityMissing))
  else if(section==='diary'){
    c.append(el('p','account-muted',t.recent))
    if(!activityData.events.length)c.append(el('p','account-muted',t.activityEmpty))
    for(const event of activityData.events){const row=el('div','workshop-event'),info=el('div');info.append(el('strong',null,event.name),el('p','account-muted',(event.revision===1?t.createdBuild:t.savedRevision+' '+event.revision)+' · '+date(event.at)));row.append(icon('file'),info);c.append(row)}
  }else if(section==='favorites'){
    if(!activityData.favorites.length)c.append(el('p','account-muted',t.noFavorites))
    for(const item of activityData.favorites){const row=el('div','workshop-event'),info=el('div');info.append(el('strong',null,item.name),el('p','account-muted',t.revisions+': '+item.revision));row.append(icon('icon-heart'),info,button(t.openBuild,()=>openFavorite(item.id),busy),button(t.removeFavorite,()=>toggleFavorite(item.id,false),busy));c.append(row)}
  }else{
    c.append(button(t.markRead,readActivity,busy||!activityData.notifications.some(n=>!n.read)))
    if(!activityData.notifications.length)c.append(el('p','account-muted',t.noNotifications))
    for(const n of activityData.notifications){const row=el('div','workshop-event'),info=el('div');info.append(el('strong',null,t.awardNotice+': '+(t[n.award]??n.award)),el('p','account-muted',date(n.at)+' · '+(n.read?t.readNotice:t.newNotice)));row.append(icon('icon-trophy'),info);c.append(row)}
  }
  content.append(c)
 }else if(section==='storage'){
  const c=card(t.storage);c.append(metrics([[t.local,summary.local],[t.cloud,summary.cloud],[t.revisions,summary.revisions]]),el('p',null,t.limits),el('p','account-muted',activityData?t.usage+': '+(activityData.bytes/1048576).toFixed(2)+' MiB. '+t.bytesHint:t.noBytes),el('p','account-muted',t.privateOnly));content.append(c)
 }else if(section==='settings'){
  const c=card(t.settings);c.append(el('p',null,t.displayName+': '+user.displayName),el('p',null,t.email+': '+user.email),el('p','account-muted',t.profileHint));if(profile){const form=el('form','workshop-form'),bio=el('textarea'),cover=el('select'),label=el('label','account-field'),label2=el('label','account-field');bio.maxLength=500;bio.value=profile.bio;bio.disabled=busy;cover.disabled=busy;for(const k of ['blueprint','graphite','amber']){const opt=el('option',null,t[k]);opt.value=k;cover.append(opt)}cover.value=profile.cover;label.append(el('span',null,t.bio),bio);label2.append(el('span',null,t.cover),cover);const submit=el('button','workspace-action primary',t.saveProfile);submit.type='submit';submit.disabled=busy;form.append(label,label2,submit);form.onsubmit=e=>{e.preventDefault();if(!busy)saveProfile({bio:bio.value,cover:cover.value})};c.append(form);for(const kind of ['avatar','cover']){
     const block=el('div','account-card'),picker=el('input'),label=el('label','account-field');picker.type='file';picker.accept='image/png,image/jpeg,image/webp';picker.disabled=busy;label.append(el('span',null,t[kind+'Upload']),picker);block.append(label)
     const url=profile[kind+'Url'];if(url){const image=el('img','profile-media-preview '+kind);image.src=url;image.alt='';block.append(image)}
     block.append(button(t.upload,()=>{if(picker.files?.[0])uploadMedia(kind,picker.files[0])},busy))
     if(url)block.append(button(t.removeImage,()=>removeMedia(kind),busy))
     c.append(block)
   }}else c.append(el('p','account-muted',t.profileMissing));content.append(c)
 }else if(section==='cosmetics'){
   const c=card(t.cosmetics);c.append(el('p','account-muted',t.cosmeticHint))
   const grid=el('div','workshop-grid')
   for(const item of profileData?.inventory??[]){
     const tile=card(t[item.id]),preview=el('div','cosmetic-preview cosmetic-'+item.id)
     tile.append(preview,el('p','account-muted',item.source==='free'?t.free:item.source==='achievement'?t.achievement:item.priceRub+' ₽ · '+t.purchase))
     const active=profile?.background===item.id
     tile.append(button(active?t.equipped:item.owned?t.equip:t.lockedBackground,()=>saveProfile({bio:profile.bio,cover:profile.cover,background:item.id}),busy||active||!item.owned))
     grid.append(tile)
   }
   c.append(grid);content.append(c)
 }else if(section==='publicProfile'){
  const c=card(t.publicProfile);c.append(el('p','account-muted',t.publicExplain),button(t.publicLoad,loadPublic,busy))
  if(publicLoaded){
   c.append(el('p',null,publicCard?t.isPublished:t.notPublished))
   const form=el('form','workshop-form'),name=el('input'),bio=el('textarea'),l1=el('label','account-field'),l2=el('label','account-field'),consent=el('input'),l3=el('label','workshop-check')
   name.maxLength=80;name.required=true;name.value=publicCard?.displayName??'';name.disabled=busy;bio.maxLength=500;bio.value=publicCard?.bio??'';bio.disabled=busy
   consent.type='checkbox';consent.required=true;consent.disabled=busy
   l1.append(el('span',null,t.publicName),name);l2.append(el('span',null,t.publicBio),bio);l3.append(consent,el('span',null,t.publicConfirm))
   const submit=el('button','workspace-action primary',publicCard?t.updateCard:t.publishCard);submit.type='submit';submit.disabled=busy
   form.append(l1,l2,l3,submit);form.onsubmit=e=>{e.preventDefault();if(!busy&&consent.checked)publishPublic({displayName:name.value,bio:bio.value})};c.append(form)
   if(publicCard){const link=el('a','workspace-action',t.visitCard);link.href='/community/profile/'+publicCard.id;link.target='_blank';link.rel='noopener noreferrer';c.append(link,button(t.unpublishCard,unpublishPublic,busy))}
   const directory=el('a','workspace-action',t.visitCommunity);directory.href='/community';directory.target='_blank';directory.rel='noopener noreferrer';c.append(directory)
  }
  content.append(c)
 }else if(section==='security'){
  const c=card(t.security);c.append(el('p',null,t.email+': '+user.email),el('p','account-muted',t.securityText),el('p','account-muted',t.privateOnly));content.append(c)
 }else{const c=card(t[section]);c.append(el('p','account-muted',t.pending));content.append(c)}
 layout.append(nav,content);return layout
}
