import {renderWorkshopLive} from './workshop-live.js?v=workshop-live-1'
import {selectedWorkshopAwards} from './workshop-award-widgets.js?v=workshop-live-1'
import {metricItems} from './workshop-metrics-model.js'
import {renderMetricEditor,workshopMetricValues} from './workshop-metrics.js?v=layout-studio-2'
import {renderVerificationLab,renderAchievementRewards,renderAchievementRankings} from './achievement-platform.js'
import {renderAchievements} from './achievement-hall.js'
import {achievementName} from './achievement-catalog.js'
import {renderInstructionCollection} from './instruction-collection.js'
import {commerceBadge,productArtwork,factsPanel,loyaltyBadge} from './commerce-visuals.js?v=merch-2'
import {renderUnifiedHero,renderUnifiedEditor,renderPortfolio,activityCalendar} from './unified-profile.js?v=layout-studio-2'
import {applySignature,themeBadge,themePlate,signatureFor,mountThemeCover} from './profile-signature.js?v=signature-art-1'
import {themeFor} from './store-themes.js?v=themes-2'
import {commerceProducts} from './commerce-catalog.js'
import { workshopCopy } from './workshop-copy.js?v=profile-gallery-1'

export const sections=[['workshop','icon-home'],['cloud','folder'],['achievements','icon-trophy'],['rankings','icon-trophy'],['favorites','icon-heart'],['notifications','icon-bell'],['storage','icon-cloud'],['settings','settings']]
const implemented=new Set(['workshop','cloud','achievements','rankings','storage','settings','security','cosmetics','favorites','notifications'])
const extra={
 ru:{active:'Личный аккаунт · BrickLab Cloud',pending:'Этот раздел ещё не подключён к серверу.',noAwards:'Серверный учёт наград ещё не подключён. XP и награды не начисляются по локальным данным.',catalog:'Каталог будущих достижений',rankPlan:'Планируемая лестница званий',localDoc:'Локальный документ',cloudDoc:'Облачная ревизия',chooseSource:'Источник паспорта',load:'Загрузить паспорт',latest:'Актуальная версия',privateOnly:'Все облачные сборки пока приватные.',limits:'Текущие ограничения: 20 проектов, 20 версий на проект, запрос до 2 МиБ, бюджет около 64 МиБ на аккаунт.',noBytes:'Точное использование диска пока не отображается.',identity:'Данные текущей серверной сессии. Редактирование профиля будет подключено отдельно.',securityText:'Серверная сессия хранится в HttpOnly cookie. Доступно завершение остальных сессий. Подтверждение почты и восстановление пароля требуют настроенного почтового сервиса. 2FA пока не подключена.',errors:'Ошибки ссылок',malformed:'Некорректные детали',duplicates:'Повторяющиеся ID',unavailable:'Нет данных для паспорта',actual:'Подтверждённые облачные данные',notIssued:'Начисление не подключено',manual:'Сохранение и получение сборок выполняются вручную.',sourceLocal:'Локальная',sourceCloud:'Облачная'},
 en:{active:'Personal account · BrickLab Cloud',pending:'This section is not connected to the server yet.',noAwards:'Server-issued awards are not connected yet. Local data does not award XP or badges.',catalog:'Upcoming achievement catalog',rankPlan:'Planned rank ladder',localDoc:'Local document',cloudDoc:'Cloud revision',chooseSource:'Passport source',load:'Load passport',latest:'Latest revision',privateOnly:'All cloud builds are currently private.',limits:'Current limits: 20 projects, 20 revisions per project, 2 MiB per request, approximately 64 MiB per account.',noBytes:'Exact disk usage is not available yet.',identity:'Current server session identity. Profile editing will be connected separately.',securityText:'The server session uses an HttpOnly cookie. Other sessions can be revoked. Email verification and recovery require a configured mail provider. 2FA is not connected yet.',errors:'Broken links',malformed:'Malformed parts',duplicates:'Duplicate IDs',unavailable:'No passport data',actual:'Confirmed cloud data',notIssued:'Awards not connected',manual:'Builds are saved and retrieved manually.',sourceLocal:'Local',sourceCloud:'Cloud'}
}
Object.assign(extra.ru,{firstCloudSave:'Первая облачная сборка',firstCloudSaveDesc:'Первое успешное сохранение на сервере: 30 XP, один раз.',awarded:'Получено',progressHint:'XP за подтверждённое сервером сохранение. Это не оценка инженерных навыков.',profileHint:'Описание и обложка сохраняются в приватном профиле.',profileMissing:'Данные профиля пока недоступны.'})
Object.assign(extra.en,{firstCloudSave:'First cloud build',firstCloudSaveDesc:'First successful cloud save: 30 XP, once.',awarded:'Awarded',progressHint:'XP for a server-confirmed save, not an engineering skill assessment.',profileHint:'Biography and cover are saved in your private profile.',profileMissing:'Profile data is unavailable.'})
Object.assign(extra.ru,{cosmetics:'Магазин и инвентарь',avatarUpload:'Аватар · PNG/JPEG/WebP, до 2 МБ',coverUpload:'Обложка · PNG/JPEG/WebP, до 5 МБ',upload:'Загрузить',removeImage:'Удалить изображение',owned:'Получено',lockedBackground:'Не получено',equip:'Применить тему',equipped:'Установлен',free:'Бесплатно',achievement:'За первую облачную сборку',purchase:'Покупка пока недоступна',default:'Стандартный', 'first-build':'Первый конструктор',carbon:'Карбон',neon:'Неоновая мастерская',cosmeticHint:'Фоны меняют только оформление. Магазин открыт для просмотра; реальные продажи пока отключены.',chooseFile:'Выбрать изображение'})
Object.assign(extra.en,{cosmetics:'Shop and inventory',avatarUpload:'Avatar · PNG/JPEG/WebP, up to 2 MB',coverUpload:'Cover · PNG/JPEG/WebP, up to 5 MB',upload:'Upload',removeImage:'Remove image',owned:'Owned',lockedBackground:'Locked',equip:'Equip theme',equipped:'Equipped',free:'Free',achievement:'First cloud build',purchase:'Purchase not available yet',default:'Default','first-build':'First builder',carbon:'Carbon',neon:'Neon workshop',cosmeticHint:'Backgrounds are cosmetic only. The store is available to browse; live sales are disabled.',chooseFile:'Choose image'})
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
export function renderCloudWorkshop({lang,user,local,remote,section,busy,go,settingsTab='profile',setSettingsTab=()=>{},integrationsPanel,notificationPanel,promoPanel,passwordPanel,visibilitySupported=false,portfolioDraft,onPortfolioDraft,savePortfolio,liveSession,onLiveSession,startLive,bureauPanel,adminPanel,revokeOthers,profileData,saveProfile,uploadMedia,removeMedia,activityData,publicCard,publicLoaded,publicBuilds=[],loadPublic,publishPublic,unpublishPublic,publishBuild,unpublishBuild,refreshActivity,verifyAchievement,verificationResult,readActivity,toggleFavorite,openFavorite,logout,createBuild,openLocal,fetchCloud,signal,previewsEnabled,noticeNodes=[]}){
 const t={...workshopCopy[lang],...extra[lang],admin:lang==='ru'?'Администрирование':'Administration',revokeOthers:lang==='ru'?'Завершить остальные сессии':'End other sessions'},summary=workshopSummary(local,remote)
 const profile=profileData?.profile,progress=profileData?.progress
 const layout=el('div','workshop-layout cosmetic-'+(profile?.background??'default')),nav=el('nav','workshop-nav'),content=el('div','workshop-content')
 applySignature(layout,profile?.background)
 const ru=lang==='ru',sidebar=el('aside','workshop-sidebar'),sideHead=el('div','workshop-sidebar-heading'),sideFoot=el('div','workshop-sidebar-footer');sideHead.append(el('span','workshop-sidebar-kicker','BRICKLAB CLOUD'),el('strong',null,ru?'Личный кабинет':'Workspace'));nav.setAttribute('aria-label',t.workshop)
 for(const [key,symbol] of [...sections,...(user.admin===true?[['admin','icon-shield']]:[])]){
  const b=button(t[key],()=>go(key),busy);b.prepend(icon(symbol));b.setAttribute('aria-pressed',String(section===key))
  if(section===key)b.setAttribute('aria-current','page')
  if(!implemented.has(key)&&key!=='admin')b.title=t.pending
  if(key==='notifications'){const n=activityData?.notifications.filter(x=>!x.read).length??0,badge=el('small','workshop-unread',n);badge.dataset.notificationNavCount='';badge.hidden=!n;b.append(badge)}
  nav.append(b)
 }
 const exit=button(ru?'Выйти из аккаунта':'Sign out',logout,busy);sideFoot.append(exit);sidebar.append(sideHead,nav,sideFoot)
 if(section!=='workshop')content.append(el('h2','workshop-section-title',t[section]))
 if(section==='bureau'&&bureauPanel)content.append(bureauPanel())
 else if(section==='admin'&&user.admin===true&&adminPanel)content.append(adminPanel())
 else if(section==='cloud'){content.append(el('div','workshop-projects-slot'));appendPublicProfile()}
 else if(section==='workshop'){
  const displayName=profile?.displayName??publicCard?.displayName??user.displayName
  const metricValues=workshopMetricValues({lang,owner:true,remoteCount:summary.cloud,progress,card:publicCard,loaded:publicLoaded})
  const identity={displayName,username:user.username,bio:publicCard?'':profile?.bio,coverTheme:profile?.cover,backgroundTheme:profile?.background,achievementStyle:profile?.achievementStyle,supportBadge:profileData?.supportBadge,plus:profileData?.plus===true,avatarUrl:profile?.avatarUrl,coverUrl:profile?.coverUrl,subtitle:user.admin===true?(ru?'Администратор · BrickLab Cloud':'Administrator · BrickLab Cloud'):t.active}
  const ownerMetrics=metricItems({layout:profile?.metricLayout,lang,owner:true,values:metricValues})
  const live=!!publicCard?.unified,makeProfile=state=>{
   const draft={...publicCard,portfolio:state.portfolio},visible=key=>state.portfolio.blocks.some(b=>b.key===key&&b.visible)
   if(progress){draft.awards=[...state.showcase,...(publicCard.awards?.includes('firstBuilder')?['firstBuilder']:[])];draft.achievementDefinitions=progress.definitions??[];draft.achievementDates=Object.fromEntries((progress.awards??[]).filter(a=>state.showcase.includes(a.award)).map(a=>[a.award,a.awardedAt]));draft.achievementXp=progress.xp;draft.achievementCount=progress.awards?.length;draft.achievementStyle=profile?.achievementStyle}
   if(!visible('awards')){draft.awards=[];draft.achievementDates={};draft.achievementXp=undefined;draft.achievementCount=undefined;draft.achievementStyle=null;draft.achievementDefinitions=[]}
   if(!visible('about'))draft.bio=''
   return draft
  }
  let liveUI=null
  if(live&&savePortfolio&&onLiveSession){
   liveUI=renderWorkshopLive({lang,session:liveSession,portfolio:publicCard.portfolio,progress,busy,signal,onSession:onLiveSession,onSave:savePortfolio,
    renderGrid:(state,editing)=>renderPortfolio({lang,profile:makeProfile(state),builds:publicBuilds,owner:true,live:true,editing,metricCards:ownerMetrics}),
    renderPreview:state=>{
     const draft=makeProfile(state),ownerMedia=publicCard.visible===false,identity={...draft,bio:'',subtitle:ru?'Конструктор BrickLab':'BrickLab builder'}
     if(ownerMedia){identity.avatarUrl=publicCard.showAvatar?profile?.avatarUrl:null;identity.coverUrl=publicCard.showCover?profile?.coverUrl:null}
     const metrics=metricItems({layout:profile?.metricLayout,lang,portfolio:draft.portfolio,values:workshopMetricValues({lang,card:draft,loaded:true})}),view=el('div','workshop-live-preview-page')
     view.append(renderUnifiedHero({lang,identity,owner:ownerMedia}),renderPortfolio({lang,profile:draft,builds:publicBuilds,live:true,metricCards:metrics}));return view
    }})
  }
  content.append(renderUnifiedHero({lang,owner:true,identity,metricCards:live?[]:ownerMetrics,coverControls:liveUI?.controls}))
  if(publicCard?.visible===false)content.append(el('p','account-muted',ru?'Мастерская скрыта от посетителей. Публикации сохранены.':'Workshop hidden from visitors. Publications retained.'))
  if(liveUI)content.append(liveUI.surface)
  else if(publicCard)content.append(renderPortfolio({lang,profile:publicCard,builds:publicBuilds,owner:true,live,metricCards:ownerMetrics}))

 }else if(section==='achievements'){
  content.append(renderVerificationLab({lang,remote,busy,verify:verifyAchievement,result:verificationResult,go}),renderAchievements({lang,progress,profile,busy,saveProfile,go,refresh:refreshActivity}))
 }else if(section==='rankings'){
  content.append(renderAchievementRankings({lang,signal,go}))
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
    for(const n of activityData.notifications){const row=el('div','workshop-event'),info=el('div');info.append(el('strong',null,t.awardNotice+': '+achievementName(n.award,lang,n.definition?[n.definition]:[])),el('p','account-muted',date(n.at)+' · '+(n.read?t.readNotice:t.newNotice)));row.append(icon('icon-trophy'),info);c.append(row)}
  }
  content.append(c)
 }else if(section==='storage'){
  const c=card(t.storage),limits=activityData?.limits;
   if(limits){const used=activityData.bytes/1048576;c.append(metrics([[t.cloud,summary.cloud+' / '+limits.projects],[ru?'Версий на проект':'Versions per project',limits.versions],[ru?'Хранилище':'Storage',used.toFixed(2)+' / '+limits.storageMiB+' MiB']]),el('p','account-muted',(ru?'Максимальный запрос: ':'Maximum request: ')+limits.requestMiB+' MiB. '+t.bytesHint));
    if(summary.cloud>=limits.projects||used>=limits.storageMiB)c.append(el('p','account-notice',ru?'Лимит достигнут. Существующие сборки и версии доступны для открытия и скачивания.':'Limit reached. Existing builds and versions remain available to open and download.'));
    const shop=el('a','workspace-action',ru?'Расширения облака':'Cloud upgrades');shop.href='#store';c.append(shop)
   }else c.append(el('p','account-muted',t.noBytes));content.append(c)
 }else if(section==='settings'||section==='cosmetics'||section==='security'){
  const active=section==='cosmetics'?'appearance':section==='security'?'security':settingsTab,tabBar=el('nav','workshop-settings-tabs')
  const tabs=[['profile','Профиль','Profile'],['appearance','Оформление','Appearance'],['layout','Компоновка','Layout'],['privacy','Приватность','Privacy'],['security','Безопасность','Security'],['notifications','Уведомления','Notifications'],['integrations','Интеграции','Integrations'],['subscription','Подписка','Subscription']]
  tabBar.setAttribute('aria-label',ru?'Настройки аккаунта':'Account settings');for(const [key,r,e] of tabs){const b=button(ru?r:e,()=>setSettingsTab(key),busy);b.setAttribute('aria-pressed',String(active===key));tabBar.append(b)}content.append(tabBar)
  const editor=mode=>renderUnifiedEditor({lang,user,profile,publicCard,publicLoaded,publicBuilds,busy,loadPublic,saveProfile,publishPublic,unpublishPublic,visibilitySupported,mode,portfolioDraft,onPortfolioDraft,savePortfolio,progress,contentOnly:mode==='layout'})
  if(active==='profile'){
   content.append(editor('profile'))
  const c=card(ru?'Изображения профиля':'Profile images');c.append(el('p','account-muted',ru?'При включённой синхронизации изменения аватара и обложки сразу видны посетителям.':'When sharing is enabled, avatar and cover changes are immediately public.'))
  if(profile){for(const kind of ['avatar','cover']){
     const block=el('div','account-card'),picker=el('input'),label=el('label','account-field');picker.type='file';picker.accept='image/png,image/jpeg,image/webp';picker.disabled=busy||!publicLoaded;label.append(el('span',null,t[kind+'Upload']),picker);block.append(label)
     const url=profile[kind+'Url'];if(url){const image=el('img','profile-media-preview '+kind);image.src=url;image.alt='';block.append(image)}
     block.append(button(t.upload,()=>{if(picker.files?.[0])uploadMedia(kind,picker.files[0])},busy||!publicLoaded))
     if(url)block.append(button(t.removeImage,()=>removeMedia(kind),busy||!publicLoaded));c.append(block)
  }}else c.append(el('p','account-muted',t.profileMissing))
  content.append(c)
  }else if(active==='layout'){
   const liveCard=card(ru?'Workshop Live · компоновка':'Workshop Live · layout');liveCard.append(el('p','account-muted',ru?'Теперь редактирование происходит прямо в мастерской. Шаблон открывается как черновик; галочка на обложке сохраняет изменения.':'Edit directly on your workshop. Templates open as drafts; the cover checkmark saves them.'));if(startLive&&publicCard?.unified){const options=el('div','studio-toolbar');for(const [id,title] of [['',ru?'Редактировать мастерскую':'Edit workshop'],['classic',ru?'Классический':'Classic'],['minimal',ru?'Минимализм':'Minimal'],['portfolio',ru?'Портфолио':'Portfolio'],['engineering',ru?'Инженерный':'Engineering']])options.append(button(title,()=>{startLive(id);go('workshop')},busy));liveCard.append(options)}content.append(liveCard);const values=workshopMetricValues({lang,owner:true,remoteCount:summary.cloud,progress,card:publicCard,loaded:publicLoaded});content.append(editor('layout'),renderMetricEditor({lang,layout:profile?.metricLayout,values,busy,enabled:!!profile,expanded:true,save:metricLayout=>saveProfile({bio:profile.bio,cover:profile.cover,metricLayout})}),renderAchievements({lang,progress,profile,busy,saveProfile,go,refresh:refreshActivity,showcaseOnly:true}))
  }else if(active==='privacy'){content.append(editor('privacy'))}
  else if(active==='appearance'){
   const c=card(ru?'Темы оформления':'Themes');c.append(el('p','account-muted',t.cosmeticHint),el('p','account-muted',lang==='ru'?'Если показ оформления разрешён в публичном профиле, новая тема сразу появится в сообществе.':'If public appearance is enabled, equipped themes immediately appear in the community.'))
   const grid=el('div','workshop-grid')
   for(const item of profileData?.inventory??[]){
     const theme=themeFor(item.id),tile=card(theme?.[lang]??t[item.id]),preview=el('div','cosmetic-preview cosmetic-'+item.id)
     mountThemeCover(preview,item.id);tile.append(preview);if(theme)tile.append(el('p','account-muted',lang==='ru'?theme.descriptionRu:theme.descriptionEn));tile.append(el('p','account-muted',item.adminAccess===true?(lang==='ru'?'Доступно администратору бесплатно':'Free administrator access'):item.source==='free'?t.free:item.source==='achievement'?t.achievement:item.owned?t.owned:item.priceRub+' ₽ · '+t.purchase))
     const active=profile?.background===item.id
     tile.append(button(active?t.equipped:item.owned?t.equip:t.lockedBackground,()=>saveProfile({bio:profile.bio,cover:profile.cover,background:item.id}),busy||active||!item.owned))
     grid.append(tile)
   }
   const shop=el('a','workspace-action',lang==='ru'?'Открыть BrickLab Store':'Open BrickLab Store');shop.href='#store';c.append(grid,shop);content.append(c)
   const supporter=card(ru?'Значки поддержки':'Supporter badges'),badgeGrid=el('div','workshop-grid');supporter.append(el('p','account-muted',ru?'Выбранный значок будет показан в публичном профиле, если он опубликован. Значки не дают XP.':'The selected badge is visible on your published profile. Badges do not award XP.'));
   for(const badge of commerceProducts.filter(p=>p.kind==='badge')){const owned=profileData?.supportBadges?.includes(badge.id)===true,active=profileData?.supportBadge===badge.id,tile=card(badge.title);tile.classList.add('commerce-inventory-tile');tile.append(productArtwork(badge,lang),commerceBadge(badge.id),el('p','account-muted',active?(ru?'Выбран в профиле':'Selected in profile'):owned?t.owned:t.purchase),button(active?(ru?'Показывается':'Displayed'):ru?'Показывать':'Display',()=>saveProfile({bio:profile.bio,cover:profile.cover,supportBadge:badge.id}),busy||!profile||!owned||active));badgeGrid.append(tile)}
   supporter.append(badgeGrid,button(ru?'Скрыть значок':'Hide badge',()=>saveProfile({bio:profile.bio,cover:profile.cover,supportBadge:null}),busy||!profile||!profileData?.supportBadge));content.append(supporter,renderAchievementRewards({lang,profile,rewards:profileData?.achievementRewards,busy,saveProfile}))
  }else if(active==='subscription'){
   const plus=card('BrickLab Plus'),state=profileData?.plusTheme,owned=profileData?.plus===true;plus.classList.add('commerce-plus-panel');plus.append(productArtwork({kind:'subscription',months:''},lang));if(owned)plus.append(commerceBadge('plus'));plus.append(el('p','account-muted',owned?(ru?'Активна до ':'Active until ')+new Date(profileData.plusUntil).toLocaleDateString(lang):(ru?'Подписка не активна':'No active subscription')));
   plus.append(factsPanel({kind:'subscription'},lang));const plusLink=el('a','workspace-action',owned?(ru?'Продлить Plus':'Extend Plus'):(ru?'Посмотреть тарифы Plus':'View Plus plans'));plusLink.href='#store';plus.append(plusLink)
   if(owned&&profile){const picker=el('select','account-field');for(const item of profileData.inventory.filter(i=>i.source==='purchase')){const option=el('option',null,themeFor(item.id)?.[lang]??item.id);option.value=item.id;picker.append(option)}if(state?.chosen)picker.value=state.chosen;const locked=state?.nextChangeAt>Date.now();picker.disabled=busy||locked;plus.append(picker,button(ru?'Выбрать тему Plus':'Choose Plus theme',()=>saveProfile({bio:profile.bio,cover:profile.cover,plusTheme:picker.value}),busy||locked));if(locked)plus.append(el('p','account-muted',(ru?'Следующая смена: ':'Next change: ')+new Date(state.nextChangeAt).toLocaleDateString(lang)))}
   const loyalty=profileData?.loyalty;plus.append(el('h3',null,ru?'Лояльность Plus':'Plus loyalty'));const marks=el('div','commerce-loyalty-grid');for(const m of [1,3,6,12])marks.append(loyaltyBadge(m,loyalty?.milestones?.includes(m)===true,lang));plus.append(marks);plus.append(el('p','account-muted',(ru?'Дней активного доступа: ':'Days of active access: ')+(loyalty?.days??0)));content.append(plus,renderInstructionCollection({lang,signal,remote}));const usage=card(ru?'Облачные лимиты':'Cloud limits');if(activityData?.limits)usage.append(metrics([[t.cloud,summary.cloud+' / '+activityData.limits.projects],[t.storage,(activityData.bytes/1048576).toFixed(2)+' / '+activityData.limits.storageMiB+' MiB']]));content.append(usage);const orders=el('a','workspace-action',ru?'Магазин и история заказов':'Store and order history');orders.href='#store';orders.onclick=()=>{try{sessionStorage.setItem('bricklab-commerce-return','1')}catch{}};content.append(orders);if(promoPanel)content.append(promoPanel())
  }else if(active==='security'){
  const c=card(t.security);c.append(el('p',null,t.email+': '+user.email),el('p','account-muted',t.securityText),el('p','account-muted',t.privateOnly));if(revokeOthers)c.append(button(t.revokeOthers,revokeOthers,busy));content.append(c);if(passwordPanel)content.append(passwordPanel())
  }else if(active==='integrations'){if(integrationsPanel)content.append(integrationsPanel())}
  else if(active==='notifications'){if(notificationPanel)content.append(notificationPanel());const c=card(ru?'Уведомления аккаунта':'Account notifications');c.append(el('p','account-muted',ru?'Уведомления о достижениях сохраняются в личном кабинете. Доставку в Telegram можно включить здесь.':'Achievement notifications remain in your account. Enable Telegram delivery here.'),button(t.notifications,()=>go('notifications'),busy));content.append(c)}
 }else{const c=card(t[section]);c.append(el('p','account-muted',t.pending));content.append(c)}
 function appendPublicProfile(){
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
        row.append(button(t.cloud,()=>go('cloud'),busy))
        if(old){if(publicCard.visible!==false){const link=el('a','workspace-action',t.viewPublication);link.href='#community/build/'+old.id;row.append(link)}row.append(button(t.unpublishBuild,()=>unpublishBuild(project.id),busy))}
        builds.append(row)
      }
    }
    content.append(builds)
  }
 }
 if(noticeNodes.length){const notices=el('div','workshop-notices');notices.append(...noticeNodes);content.prepend(notices)}
 layout.append(sidebar,content);return layout
}
