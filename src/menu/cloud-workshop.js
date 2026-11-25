import {applySignature,themeBadge,themePlate,signatureFor} from './profile-signature.js?v=signature-1'
import {themeFor} from './store-themes.js?v=themes-2'
import { badges, ranks, rankFor } from './workshop-model.js?v=activity-1'
import { workshopCopy } from './workshop-copy.js?v=profile-gallery-1'

export const sections=[['workshop','icon-home'],['cloud','folder'],['achievements','icon-trophy'],['rankings','icon-trophy'],['bureau','icon-account'],['favorites','icon-heart'],['notifications','icon-bell'],['storage','icon-cloud'],['settings','settings'],['security','icon-shield'],['cosmetics','icon-heart']]
const implemented=new Set(['workshop','cloud','achievements','storage','settings','security','cosmetics','favorites','notifications','bureau'])
const extra={
 ru:{active:'Личный аккаунт · BrickLab Cloud',pending:'Этот раздел ещё не подключён к серверу.',noAwards:'Серверный учёт наград ещё не подключён. XP и награды не начисляются по локальным данным.',catalog:'Каталог будущих достижений',rankPlan:'Планируемая лестница званий',localDoc:'Локальный документ',cloudDoc:'Облачная ревизия',chooseSource:'Источник паспорта',load:'Загрузить паспорт',latest:'Актуальная версия',privateOnly:'Все облачные сборки пока приватные.',limits:'Текущие ограничения: 20 проектов, 20 версий на проект, запрос до 2 МиБ, бюджет около 64 МиБ на аккаунт.',noBytes:'Точное использование диска пока не отображается.',identity:'Данные текущей серверной сессии. Редактирование профиля будет подключено отдельно.',securityText:'Серверная сессия хранится в HttpOnly cookie. Доступно завершение остальных сессий. Подтверждение почты и восстановление пароля требуют настроенного почтового сервиса. 2FA пока не подключена.',errors:'Ошибки ссылок',malformed:'Некорректные детали',duplicates:'Повторяющиеся ID',unavailable:'Нет данных для паспорта',actual:'Подтверждённые облачные данные',notIssued:'Начисление не подключено',manual:'Сохранение и получение сборок выполняются вручную.',sourceLocal:'Локальная',sourceCloud:'Облачная'},
 en:{active:'Personal account · BrickLab Cloud',pending:'This section is not connected to the server yet.',noAwards:'Server-issued awards are not connected yet. Local data does not award XP or badges.',catalog:'Upcoming achievement catalog',rankPlan:'Planned rank ladder',localDoc:'Local document',cloudDoc:'Cloud revision',chooseSource:'Passport source',load:'Load passport',latest:'Latest revision',privateOnly:'All cloud builds are currently private.',limits:'Current limits: 20 projects, 20 revisions per project, 2 MiB per request, approximately 64 MiB per account.',noBytes:'Exact disk usage is not available yet.',identity:'Current server session identity. Profile editing will be connected separately.',securityText:'The server session uses an HttpOnly cookie. Other sessions can be revoked. Email verification and recovery require a configured mail provider. 2FA is not connected yet.',errors:'Broken links',malformed:'Malformed parts',duplicates:'Duplicate IDs',unavailable:'No passport data',actual:'Confirmed cloud data',notIssued:'Awards not connected',manual:'Builds are saved and retrieved manually.',sourceLocal:'Local',sourceCloud:'Cloud'}
}
Object.assign(extra.ru,{firstCloudSave:'Первая облачная сборка',firstCloudSaveDesc:'Первое успешное сохранение на сервере: 30 XP, один раз.',awarded:'Получено',progressHint:'XP за подтверждённое сервером сохранение. Это не оценка инженерных навыков.',profileHint:'Описание и обложка сохраняются в приватном профиле.',profileMissing:'Данные профиля пока недоступны.'})
Object.assign(extra.en,{firstCloudSave:'First cloud build',firstCloudSaveDesc:'First successful cloud save: 30 XP, once.',awarded:'Awarded',progressHint:'XP for a server-confirmed save, not an engineering skill assessment.',profileHint:'Biography and cover are saved in your private profile.',profileMissing:'Profile data is unavailable.'})
Object.assign(extra.ru,{cosmetics:'Магазин и инвентарь',avatarUpload:'Аватар · PNG/JPEG/WebP, до 2 МБ',coverUpload:'Обложка · PNG/JPEG/WebP, до 5 МБ',upload:'Загрузить',removeImage:'Удалить изображение',owned:'Получено',lockedBackground:'Не получено',equip:'Установить фон',equipped:'Установлен',free:'Бесплатно',achievement:'За первую облачную сборку',purchase:'Покупка пока недоступна',default:'Стандартный', 'first-build':'Первый конструктор',carbon:'Карбон',neon:'Неоновая мастерская',cosmeticHint:'Фоны меняют только оформление. Магазин открыт для просмотра; реальные продажи пока отключены.',chooseFile:'Выбрать изображение'})
Object.assign(extra.en,{cosmetics:'Shop and inventory',avatarUpload:'Avatar · PNG/JPEG/WebP, up to 2 MB',coverUpload:'Cover · PNG/JPEG/WebP, up to 5 MB',upload:'Upload',removeImage:'Remove image',owned:'Owned',lockedBackground:'Locked',equip:'Equip background',equipped:'Equipped',free:'Free',achievement:'First cloud build',purchase:'Purchase not available yet',default:'Default','first-build':'First builder',carbon:'Carbon',neon:'Neon workshop',cosmeticHint:'Backgrounds are cosmetic only. The store is available to browse; live sales are disabled.',chooseFile:'Choose image'})
Object.assign(extra.ru,{activityRefresh:'Обновить',activityMissing:'Данные активности недоступны.',activityEmpty:'Событий пока нет.',createdBuild:'Создана облачная сборка',savedRevision:'Сохранена ревизия',openBuild:'Открыть копию',readNotice:'Прочитано',newNotice:'Новое',awardNotice:'Получено достижение',bytesHint:'Логический объём документов всех ревизий, без служебных данных базы и изображений.',recent:'Последние 100 сохранений'})
Object.assign(extra.en,{activityRefresh:'Refresh',activityMissing:'Activity unavailable.',activityEmpty:'No events yet.',createdBuild:'Cloud build created',savedRevision:'Revision saved',openBuild:'Open copy',readNotice:'Read',newNotice:'New',awardNotice:'Achievement earned',bytesHint:'Logical size of all revision documents, excluding database overhead and images.',recent:'Latest 100 saves'})
Object.assign(extra.ru,{publicLoad:'Проверить статус публикации',publicExplain:'Публикуются только имя и описание, введённые ниже. Почта, приватная аватарка, обложка и сборки не публикуются. Любой посетитель сможет увидеть карточку; снятие публикации не удаляет уже сделанные копии.',publicName:'Публичное имя',publicBio:'Публичное описание',publishCard:'Опубликовать профиль',updateCard:'Обновить публикацию',unpublishCard:'Снять публикацию',publicConfirm:'Я согласен сделать эти данные общедоступными.',visitCard:'Открыть публичный профиль',visitCommunity:'Каталог конструкторов',notPublished:'Профиль не опубликован',isPublished:'Профиль опубликован'})
Object.assign(extra.en,{publicLoad:'Check publication status',publicExplain:'Only the name and biography entered below are published. Email, private avatar, cover and builds remain private. Anyone can view the card; unpublishing cannot remove copies already made.',publicName:'Public name',publicBio:'Public biography',publishCard:'Publish profile',updateCard:'Update publication',unpublishCard:'Unpublish',publicConfirm:'I agree to make these details public.',visitCard:'Open public profile',visitCommunity:'Builder directory',notPublished:'Profile not published',isPublished:'Profile published'})
Object.assign(extra.ru,{publishBuilds:'Витрина сборок',publishBuild:'Опубликовать текущую ревизию',updateBuild:'Обновить опубликованную ревизию',unpublishBuild:'Снять публикацию сборки',publishedRevision:'Опубликована версия',privateRevision:'Приватная версия',publicationDescription:'Описание публикации',publishConsent:'Я разрешаю всем посетителям скачивать полный файл этой ревизии. Проверил содержимое и права на публикацию.',publicationHint:'Публикуется полный файл выбранной ревизии, включая данные модели. Новые сохранения остаются приватными. Снятие публикации профиля удаляет все его публикации. Уже скачанные копии отозвать нельзя.',viewPublication:'Открыть публикацию',profileRequired:'Сначала опубликуй публичный профиль.'})
Object.assign(extra.en,{publishBuilds:'Published builds',publishBuild:'Publish current revision',updateBuild:'Update published revision',unpublishBuild:'Unpublish build',publishedRevision:'Published revision',privateRevision:'Private revision',publicationDescription:'Publication description',publishConsent:'I allow anyone to download the complete file of this revision. I reviewed its contents and publication rights.',publicationHint:'The complete selected revision is published, including model data. New saves remain private. Unpublishing the profile removes its publications. Existing downloads cannot be revoked.',viewPublication:'Open publication',profileRequired:'Publish your public profile first.'})
Object.assign(extra.ru,{category:'Категория',vehicles:'Транспорт',mechanisms:'Механизмы',architecture:'Архитектура',robots:'Роботы',other:'Другое'})
Object.assign(extra.en,{category:'Category',vehicles:'Vehicles',mechanisms:'Mechanisms',architecture:'Architecture',robots:'Robots',other:'Other'})
Object.assign(extra.ru,{publicExplain:'Публикуются только имя, описание и явно выбранное оформление. Почта и приватные сборки не публикуются. Любой посетитель сможет увидеть карточку; уже сделанные копии отозвать нельзя.',publicAvatar:'Показать текущий аватар',publicCover:'Показать текущую обложку и её тему',publicBackground:'Показывать активную тему профиля в сообществе',publicAppearance:'Аватар и обложка копируются при публикации. Активная тема обновляется автоматически, если разрешён её публичный показ. Чтобы скрыть оформление, сними соответствующую галочку и сохрани.'})
Object.assign(extra.en,{publicExplain:'Only the name, biography and explicitly selected appearance are published. Email and private builds remain private. Anyone can view the card; existing copies cannot be revoked.',publicAvatar:'Show current avatar',publicCover:'Show current cover and theme',publicBackground:'Show active profile theme in the community',publicAppearance:'Avatar and cover are copied on publication. The active theme updates automatically if public display is enabled. Uncheck an option and save to hide it.'})
function el(tag,cls,value){const n=document.createElement(tag);if(cls)n.className=cls;if(value!==undefined)n.textContent=String(value);return n}
function icon(id){const s=document.createElementNS('http://www.w3.org/2000/svg','svg'),u=document.createElementNS(s.namespaceURI,'use');s.setAttribute('class','icon');s.setAttribute('aria-hidden','true');u.setAttribute('href','#'+id);s.append(u);return s}
function button(label,fn,disabled=false){const b=el('button','workspace-action',label);b.type='button';b.disabled=disabled;b.onclick=fn;return b}
function card(title){const c=el('section','account-card workshop-card');c.append(el('h2',null,title));return c}
function metric(label,value){const m=el('div','workshop-metric');m.append(el('span',null,label),el('strong',null,value));return m}
function metrics(items){const g=el('div','workshop-metric-grid');for(const [k,v] of items)g.append(metric(k,v));return g}
export function workshopSummary(local,remote){
 return {local:local.length,cloud:remote.length,revisions:remote.reduce((n,p)=>n+(Number.isSafeInteger(p.revision)&&p.revision>0?p.revision:0),0)}
}
export function renderCloudWorkshop({lang,user,local,remote,section,busy,go,bureauPanel,adminPanel,revokeOthers,profileData,saveProfile,uploadMedia,removeMedia,activityData,publicCard,publicLoaded,publicBuilds=[],loadPublic,publishPublic,unpublishPublic,publishBuild,unpublishBuild,refreshActivity,readActivity,toggleFavorite,openFavorite}){
 const t={...workshopCopy[lang],...extra[lang],admin:lang==='ru'?'Администрирование':'Administration',revokeOthers:lang==='ru'?'Завершить остальные сессии':'End other sessions'},summary=workshopSummary(local,remote)
 const profile=profileData?.profile,progress=profileData?.progress,rank=progress?rankFor(progress.xp):null
 const layout=el('div','workshop-layout cosmetic-'+(profile?.background??'default')),nav=el('nav','workshop-nav'),content=el('div','workshop-content')
 applySignature(layout,profile?.background)
 nav.setAttribute('aria-label',t.workshop)
 for(const [key,symbol] of [...sections,...(user.admin===true?[['admin','icon-shield']]:[])]){
  const b=key==='cloud'?el('a','workspace-action',t[key]):button(t[key],()=>go(key),busy);if(key==='cloud')b.href='#projects';b.prepend(icon(symbol));if(key!=='cloud')b.setAttribute('aria-pressed',String(section===key))
  if(section===key)b.setAttribute('aria-current','page')
  if(!implemented.has(key)&&key!=='admin')b.title=t.pending
  if(key==='notifications'){const n=activityData?.notifications.filter(x=>!x.read).length??0,badge=el('small','workshop-unread',n);badge.dataset.notificationNavCount='';badge.hidden=!n;b.append(badge)}
  nav.append(b)
 }
 content.append(el('h2','workshop-section-title',t[section]))
 if(section==='bureau'&&bureauPanel)content.append(bureauPanel())
 else if(section==='admin'&&user.admin===true&&adminPanel)content.append(adminPanel())
 else if(section==='workshop'){
  const hero=el('section','workshop-hero cover-'+(profile?.cover??'blueprint')),cover=el('div','workshop-cover'),emblem=el('div','workshop-emblem','BRICKLAB / WORKSHOP')
  const plate=themePlate(profile?.background);if(plate)cover.append(plate)
  emblem.prepend(icon('layers'));cover.append(emblem);if(profile?.coverUrl){const image=el('img','profile-cover-image');image.src=profile.coverUrl;image.alt='';cover.prepend(image)}
  const identity=el('div','workshop-hero-inner'),person=el('div','workshop-identity'),name=el('div')
  name.append(el('h2',null,user.displayName),el('p','account-muted',t.active));const badge=themeBadge(profile?.background,lang);if(badge)name.append(badge)
  const avatar=el('div','workshop-avatar',Array.from(user.displayName).slice(0,2).join('').toUpperCase());if(profile?.avatarUrl){const img=el('img','profile-avatar-image');img.src=profile.avatarUrl;img.alt='';avatar.replaceChildren(img)}person.append(avatar,name);identity.append(person)
  hero.append(cover,identity);if(profile?.bio)hero.append(el('p','workshop-bio',profile.bio));hero.append(metrics([[t.local,summary.local],[t.cloud,summary.cloud],[t.revisions,summary.revisions],[t.xp,progress?.xp??'—'],[t.title,rank?t[rank.id]:'—']]))
  const actions=card(t.welcome),quick=el('div','workshop-shortcuts')
  for(const key of ['cloud','storage','favorites','security'])quick.append(button(t[key],()=>go(key),busy))
  actions.append(el('p','account-muted',t.manual),quick)
  content.append(hero,actions)
  appendPublicProfile()
 }else if(section==='achievements'){
  const c=card(t.achievements),grid=el('div','workshop-badges');c.append(el('p','account-muted',t.progressHint));const first=el('div','workshop-badge'+(progress?.awards.some(a=>a.award==='firstCloudSave')?' earned':''));first.append(el('strong',null,t.firstCloudSave),el('p','account-muted',t.firstCloudSaveDesc),el('small',null,progress?progress.awards.some(a=>a.award==='firstCloudSave')?t.awarded:t.locked:t.profileMissing));grid.append(first)
  for(const b of badges){const item=el('div','workshop-badge rarity-'+b.rarity),medal=el('div','workshop-medal');medal.append(icon(b.icon));item.append(medal,el('strong',null,t[b.id==='bureau'?'bureauBadge':b.id]),el('p','account-muted',t[b.id+'Desc']),el('small',null,t.notIssued));grid.append(item)}
  c.append(grid);const ladder=card(t.rankPlan)
  for(const [key,xp] of ranks){const row=el('div','workshop-between workshop-rank-row');row.append(el('span',null,t[key]),el('strong',null,xp+' XP'));ladder.append(row)}
  content.append(c,ladder)
 }else if(['favorites','notifications'].includes(section)){
  const c=card(t[section]);c.append(button(t.activityRefresh,refreshActivity,busy))
  const date=value=>new Intl.DateTimeFormat(lang,{dateStyle:'medium',timeStyle:'short'}).format(new Date(value))
  if(!activityData)c.append(el('p','account-muted',t.activityMissing))
  else if(section==='favorites'){
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
   const c=card(t.cosmetics);c.append(el('p','account-muted',t.cosmeticHint),el('p','account-muted',lang==='ru'?'Если показ оформления разрешён в публичном профиле, новая тема сразу появится в сообществе.':'If public appearance is enabled, equipped themes immediately appear in the community.'))
   const grid=el('div','workshop-grid')
   for(const item of profileData?.inventory??[]){
     const theme=themeFor(item.id),tile=card(theme?.[lang]??t[item.id]),preview=el('div','cosmetic-preview cosmetic-'+item.id)
     applySignature(preview,item.id);const plate=themePlate(item.id);if(plate)preview.append(plate);tile.append(preview);if(theme)tile.append(el('p','account-muted',lang==='ru'?theme.descriptionRu:theme.descriptionEn));tile.append(el('p','account-muted',item.source==='free'?t.free:item.source==='achievement'?t.achievement:item.priceRub+' ₽ · '+t.purchase))
     const active=profile?.background===item.id
     tile.append(button(active?t.equipped:item.owned?t.equip:t.lockedBackground,()=>saveProfile({bio:profile.bio,cover:profile.cover,background:item.id}),busy||active||!item.owned))
     grid.append(tile)
   }
   const shop=el('a','workspace-action',lang==='ru'?'Открыть BrickLab Store':'Open BrickLab Store');shop.href='#store';c.append(grid,shop);content.append(c)
 }else if(section==='security'){
  const c=card(t.security);c.append(el('p',null,t.email+': '+user.email),el('p','account-muted',t.securityText),el('p','account-muted',t.privateOnly));if(revokeOthers)c.append(button(t.revokeOthers,revokeOthers,busy));content.append(c)
 }else{const c=card(t[section]);c.append(el('p','account-muted',t.pending));content.append(c)}
 function appendPublicProfile(){
  const c=card(t.publicProfile);c.append(el('p','account-muted',t.publicExplain),button(t.publicLoad,loadPublic,busy))
  if(publicLoaded){
   c.append(el('p',null,publicCard?t.isPublished:t.notPublished))
   const form=el('form','workshop-form'),name=el('input'),bio=el('textarea'),l1=el('label','account-field'),l2=el('label','account-field'),consent=el('input'),l3=el('label','workshop-check')
   name.maxLength=80;name.required=true;name.value=publicCard?.displayName??user.displayName;name.disabled=busy;bio.maxLength=500;bio.value=publicCard?.bio??profile?.bio??'';bio.disabled=busy
   consent.type='checkbox';consent.required=true;consent.disabled=busy
   l1.append(el('span',null,t.publicName),name);l2.append(el('span',null,t.publicBio),bio);l3.append(consent,el('span',null,t.publicConfirm))
   const submit=el('button','workspace-action primary',publicCard?t.updateCard:t.publishCard);submit.type='submit';submit.disabled=busy
   function appearanceChoice(text,checked){
    const label=el('label','workshop-check'),input=el('input');input.type='checkbox';input.checked=Boolean(checked);input.disabled=busy;label.append(input,el('span',null,text));return {label,input}
   }
   const avatarChoice=appearanceChoice(t.publicAvatar,publicCard?.avatarUrl),coverChoice=appearanceChoice(t.publicCover,publicCard?.coverTheme),backgroundChoice=appearanceChoice(t.publicBackground,publicCard?.backgroundTheme)
   form.append(l1,l2,el('p','account-muted',t.publicAppearance),avatarChoice.label,coverChoice.label,backgroundChoice.label,l3,submit);form.onsubmit=e=>{e.preventDefault();if(!busy&&consent.checked)publishPublic({displayName:name.value,bio:bio.value,showAvatar:avatarChoice.input.checked,showCover:coverChoice.input.checked,showBackground:backgroundChoice.input.checked})};c.append(form)
   if(publicCard){const link=el('a','workspace-action',t.visitCard);link.href='#community/profile/'+publicCard.id;c.append(link,button(t.unpublishCard,()=>{if(!publicBuilds.length||confirm(t.publicationHint))unpublishPublic()},busy))}
   const directory=el('a','workspace-action',t.visitCommunity);directory.href='#community';c.append(directory)
  }
  content.append(c)
  if(publicLoaded){
    const builds=card(t.publishBuilds);builds.append(el('p','account-muted',lang==='ru'?'Разрешения, обложки и сведения меняются через окно публикации в редакторе.':'Edit permissions, covers and details in the editor publication dialog.'))
    if(!publicCard)builds.append(el('p','account-muted',t.profileRequired))
    else{
      const publishedProjects=remote.filter(project=>publicBuilds.some(b=>b.projectId===project.id))
      if(!publishedProjects.length)builds.append(el('p','account-muted',lang==='ru'?'Пока нет публикаций. Открой сборку в редакторе и нажми «Опубликовать».':'No publications yet. Open a build in the editor and choose Publish.'))
      for(const project of publishedProjects){
        const old=publicBuilds.find(b=>b.projectId===project.id),row=card(project.name)
        row.append(el('p','account-muted',t.privateRevision+': '+project.revision+(old?' · '+t.publishedRevision+': '+old.revision:'')))
        row.append(el('p','account-muted',old.description||''),el('p','account-muted',lang==='ru'?'Для изменения публикации открой сборку в редакторе.':'Open the build in the editor to update its publication.'))
        const edit=el('a','workspace-action',lang==='ru'?'Мои сборки':'My builds');edit.href='#projects';row.append(edit)
        if(old){const link=el('a','workspace-action',t.viewPublication);link.href='#community/build/'+old.id;row.append(link,button(t.unpublishBuild,()=>unpublishBuild(project.id),busy))}
        builds.append(row)
      }
    }
    content.append(builds)
  }
 }
 layout.append(nav,content);return layout
}
