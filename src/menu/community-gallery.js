import {metricItems} from './workshop-metrics-model.js'
import {workshopMetricValues} from './workshop-metrics.js?v=workshop-settings-1'
import {profileHref,workshopRoute} from './profile-route.js'
import {commerceBadge} from './commerce-visuals.js?v=merch-2'
import {renderUnifiedHero,renderPortfolio} from './unified-profile.js?v=workshop-settings-1'
import {productById} from './commerce-catalog.js'
import {applySignature,decorateAuthor,themeBadge,themePlate,mountThemeCover} from './profile-signature.js?v=signature-art-1'
import {backgroundIds} from './store-themes.js?v=themes-2'
import {parseProject} from '../projects/documents.js'
import {sanitizePreview,isLargePreview,previewLimits} from './public-preview.js?v=large-viewer-1'
import {readPreference} from './preferences.js?v=full-settings'
const copy={
 ru:{intro:'Открывай модели других конструкторов и делись своими сборками.',models:'Сборки',builders:'Конструкторы',search:'Название, автор или описание',find:'Найти',all:'Все категории',vehicles:'Транспорт',mechanisms:'Механизмы',architecture:'Архитектура',robots:'Роботы',other:'Другое',recent:'Сначала новые',oldest:'Сначала старые',name:'По названию',parts:'По количеству деталей',partCount:'деталей',more:'Показать ещё',loading:'Загрузка…',empty:'Ничего не найдено',disabled:'Сообщество пока не открыто на этом сервере.',failed:'Не удалось загрузить данные. Попробуй обновить страницу.',missing:'Публикация недоступна или была снята.',back:'К галерее',open:'Открыть в редакторе',download:'Скачать .bricklab',author:'Автор',revision:'Ревизия',preview:'Построить 3D-миниатюру',noPreview:'Миниатюра недоступна',previewLimit:'Для большой модели доступно открытие в редакторе',opening:'Загрузка модели…',manage:'Личный кабинет',copyHint:'Будет создана независимая локальная копия.'},
 en:{intro:'Explore builds by other constructors and share your own.',models:'Builds',builders:'Builders',search:'Title, author or description',find:'Search',all:'All categories',vehicles:'Vehicles',mechanisms:'Mechanisms',architecture:'Architecture',robots:'Robots',other:'Other',recent:'Newest first',oldest:'Oldest first',name:'By title',parts:'By part count',partCount:'parts',more:'Load more',loading:'Loading…',empty:'No results',disabled:'Community is not open on this server yet.',failed:'Could not load data. Refresh and retry.',missing:'Publication unavailable or removed.',back:'Back to gallery',open:'Open in editor',download:'Download .bricklab',author:'Author',revision:'Revision',preview:'Render 3D thumbnail',noPreview:'Thumbnail unavailable',previewLimit:'Large build: open in editor to view',opening:'Loading build…',manage:'My account',copyHint:'Creates an independent local copy.'}
}
Object.assign(copy.ru,{viewer:'3D-просмотр',viewerClose:'Закрыть',viewerReset:'Сбросить камеру',viewerFull:'На весь экран',viewerExitFull:'Выйти из полного экрана',viewerZoomIn:'Приблизить',viewerZoomOut:'Отдалить',viewerHelp:'Перетаскивай модель для вращения, колесо — масштаб, правая кнопка — перемещение. На телефоне — жесты двумя пальцами.',viewerUnavailable:'3D-просмотр недоступен. Можно открыть модель в редакторе.',viewerPartial:'Отображено деталей:',viewerLimit:'Просмотр поддерживает до 600 деталей и 120 уникальных артикулов.'})
Object.assign(copy.en,{viewer:'3D viewer',viewerClose:'Close',viewerReset:'Reset camera',viewerFull:'Fullscreen',viewerExitFull:'Exit fullscreen',viewerZoomIn:'Zoom in',viewerZoomOut:'Zoom out',viewerHelp:'Drag to rotate, scroll to zoom, right drag to pan. On mobile, use two-finger gestures.',viewerUnavailable:'3D viewer unavailable. Open the build in the editor instead.',viewerPartial:'Rendered parts:',viewerLimit:'Viewer supports up to 600 parts and 120 unique designs.'})
Object.assign(copy.ru,{like:'Нравится',liked:'Нравится ✓',views:'Просмотры',downloads:'Скачивания',follow:'Подписаться',unfollow:'Вы подписаны',followers:'Подписчики',following:'Подписки',popular:'Популярные',signIn:'Войти для подписок и лайков',socialLimit:'Достигнут лимит подписок или лайков.',followingEmpty:'Пока нет публикаций авторов, на которых вы подписаны.'})
Object.assign(copy.en,{like:'Like',liked:'Liked ✓',views:'Views',downloads:'Downloads',follow:'Follow',unfollow:'Following',followers:'Followers',following:'Following',popular:'Popular',signIn:'Sign in to like and follow',socialLimit:'Like or follow limit reached.',followingEmpty:'No builds from followed creators yet.'})
Object.assign(copy.ru,{discussion:'Комментарии',commentPlaceholder:'Написать комментарий…',send:'Отправить',reply:'Ответить',replyTo:'Ответ пользователю',cancelReply:'Отменить ответ',deleted:'Комментарий удалён',removeComment:'Удалить',confirmRemove:'Удалить свой комментарий?',report:'Пожаловаться',reportReason:'Причина жалобы',spam:'Спам',abuse:'Оскорбления',otherReport:'Другое',reportSent:'Жалоба сохранена.',commentEmpty:'Пока нет комментариев.',commentProfile:'Для комментариев включи публичность мастерской в настройках.',commentLogin:'Войди, чтобы оставить комментарий.',commentLimit:'Лимит комментариев: 30 за сутки, 1000 всего.',reportLimit:'Достигнут лимит жалоб.',invalidReply:'На этот комментарий больше нельзя ответить.',leaders:'Рейтинг',reputation:'Репутация',ratingHint:'5 очков за полученный лайк, 3 за уникальное скачивание, 2 за подписчика. Это рейтинг сообщества, не инженерная квалификация.',buildCount:'Сборки',receivedLikes:'Полученные лайки'})
Object.assign(copy.en,{discussion:'Comments',commentPlaceholder:'Write a comment…',send:'Post',reply:'Reply',replyTo:'Reply to',cancelReply:'Cancel reply',deleted:'Comment removed',removeComment:'Delete',confirmRemove:'Delete your comment?',report:'Report',reportReason:'Report reason',spam:'Spam',abuse:'Abuse',otherReport:'Other',reportSent:'Report saved.',commentEmpty:'No comments yet.',commentProfile:'Enable workshop visibility in settings to comment.',commentLogin:'Sign in to leave a comment.',commentLimit:'Comment limit: 30 per day, 1000 total.',reportLimit:'Report limit reached.',invalidReply:'This comment no longer accepts replies.',leaders:'Leaderboard',reputation:'Reputation',ratingHint:'5 points per received like, 3 per unique download, 2 per follower. A community rating, not an engineering qualification.',buildCount:'Builds',receivedLikes:'Received likes'})
Object.assign(copy.ru,{aboutModel:'О конструкции',moreByAuthor:'Другие работы автора',allAuthor:'Все работы автора',share:'Поделиться',copied:'Ссылка скопирована',shareFailed:'Скопируй адрес публикации',published:'Опубликовано',noDescription:'Автор не добавил описание.',viewModel:'Посмотреть модель',relatedEmpty:'Других опубликованных работ пока нет.'})
Object.assign(copy.en,{aboutModel:'About the build',moreByAuthor:'More by this creator',allAuthor:'All creator builds',share:'Share',copied:'Link copied',shareFailed:'Copy publication address',published:'Published',noDescription:'No description provided.',viewModel:'View model',relatedEmpty:'No other published builds yet.'})
Object.assign(copy.ru,{bookmarks:'Избранное',bookmark:'В избранное',bookmarked:'В избранном ✓',downloadDisabled:'Автор не разрешил скачивание файла и открытие в редакторе.',commentsDisabled:'Автор отключил новые комментарии.',copyright:'Нарушение авторских прав',reportBuild:'Пожаловаться на конструкцию',reportBuildSent:'Жалоба на конструкцию отправлена.',difficulty:'Сложность',unspecified:'Не указана',easy:'Начальная',medium:'Средняя',hard:'Высокая',expert:'Экспертная',original:'Авторская модель',remix:'Модификация',instruction:'По инструкции',attribution:'Оригинал',remixAllowed:'Модификации с указанием автора разрешены',remixForbidden:'Публикация модификаций не разрешена',images:'Снимки',image:'Снимок',threeD:'3D-модель',viewOnly:'Только просмотр',bookmarkEmpty:'В избранном пока нет конструкций.'})
Object.assign(copy.en,{bookmarks:'Favorites',bookmark:'Save',bookmarked:'Saved ✓',downloadDisabled:'The author disabled file downloads and opening in the editor.',commentsDisabled:'The author disabled new comments.',copyright:'Copyright violation',reportBuild:'Report build',reportBuildSent:'Build report submitted.',difficulty:'Difficulty',unspecified:'Unspecified',easy:'Beginner',medium:'Intermediate',hard:'Advanced',expert:'Expert',original:'Original build',remix:'Modification',instruction:'From instructions',attribution:'Original',remixAllowed:'Attributed modifications allowed',remixForbidden:'Publishing modifications is not allowed',images:'Screenshots',image:'Image',threeD:'3D model',viewOnly:'View only',bookmarkEmpty:'No favorite builds yet.'})
Object.assign(copy.ru,{viewerLimit:'Модель превышает предел просмотра: 20 000 деталей или 2 000 артикулов.',largeViewer:'Облегчённый 3D-просмотр',largeHelp:'Перетаскивай модель, чтобы вращать её. Масштаб и редактирование доступны в редакторе.',largeHelpRestricted:'Перетаскивай модель, чтобы вращать её. Автор запретил открытие в редакторе.',simplified:'Упрощённая геометрия деталей:',largeLoading:'Загрузка геометрии',previewLimit:'Открыть облегчённый просмотр',viewerUnavailable:'3D-просмотр недоступен. Попробуй снимки, если они добавлены.'})
Object.assign(copy.en,{viewerLimit:'Model exceeds the viewer limit of 20,000 parts or 2,000 designs.',largeViewer:'Lightweight 3D viewer',largeHelp:'Drag to rotate the model. Zoom and editing are available in the editor.',largeHelpRestricted:'Drag to rotate the model. The author disabled opening in the editor.',simplified:'Simplified part geometry:',largeLoading:'Loading geometry',previewLimit:'Open lightweight viewer',viewerUnavailable:'3D viewer unavailable. Try screenshots if provided.'})
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function communityRoute(route){const handle=workshopRoute(route),m=/^community\/build\/([^/]+)$/.exec(route);return route==='community'?{type:'list'}:handle?{type:'profile',id:handle}:m&&uuid.test(m[1])?{type:'build',id:m[1]}:{type:'missing'}}
export function previewDocument(doc){return sanitizePreview(doc,{strict:true})}
function el(tag,cls,value){const n=document.createElement(tag);if(cls)n.className=cls;if(value!==undefined)n.textContent=value;return n}
function button(label,fn,cls='workspace-action'){const b=el('button',cls,label);b.type='button';b.onclick=fn;return b}
function link(label,href,cls='workspace-action'){const a=el('a',cls,label);a.href=href;return a}
function icon(id){const s=document.createElementNS('http://www.w3.org/2000/svg','svg'),u=document.createElementNS(s.namespaceURI,'use');s.setAttribute('class','icon');s.setAttribute('aria-hidden','true');u.setAttribute('href','#'+id);s.append(u);return s}
async function request(path,signal,raw=false,method='GET',body){
 const r=await fetch(path,{signal,method,credentials:'same-origin',cache:'no-store',redirect:'error',...(body===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})})
 if(!r.ok){const e=new Error('Request failed');e.status=r.status;try{e.code=(await r.json()).error}catch{}throw e}
 if(raw){if(Number(r.headers.get('content-length'))>4194304)throw Error('Model too large');const text=await r.text();if(text.length>4194304)throw Error('Model too large');return parseProject(text)}
 return r.json()
}
export async function openPublishedCopy(id,signal,openCopy,load=request){
 if(!uuid.test(id))throw Error('Invalid publication ID')
 if(signal.aborted)return
 const doc=await load('/community/build/'+id+'/document',signal,true)
 if(!signal.aborted)return openCopy(doc)
}
export async function mountCommunity(root,{language='ru',route='community',signal,openCopy}){
 const t=copy[language]??copy.ru,view=communityRoute(route),urls=new Set()
 let observer,work=Promise.resolve(),previewJobs=0,epoch=0,activeRequest=null,activeViewer=null,modalNotice=null
 const clearPreviews=()=>{observer?.disconnect();observer=null;epoch++;for(const u of urls)URL.revokeObjectURL(u);urls.clear()}
 signal.addEventListener('abort',()=>{clearPreviews();activeRequest?.abort();activeViewer?.()},{once:true})
 const status=el('p','account-muted');status.setAttribute('role','status')
 const fail=e=>{if(!signal.aborted)(modalNotice??status).textContent=e.status===401?t.signIn:e.code==='social_limit'?t.socialLimit:e.status===503?t.disabled:e.status===404?t.missing:t.failed}
 let social={signedIn:false,ownId:null,likes:[],follows:[],bookmarks:[]}
 try{social=await request('/api/community/me/social',signal)}catch(e){if(signal.aborted)return}
 if(signal.aborted)return
 const liked=new Set(social.likes),followed=new Set(social.follows),bookmarked=new Set(social.bookmarks??[]),reactionUpdates=new Map(),viewUpdates=new Map(),pending=new Set()
 function reaction(kind,id,count,own=false){
  const set=kind==='like'?liked:kind==='bookmark'?bookmarked:followed,key=kind+':'+id,label=kind==='like'?[t.like,t.liked]:kind==='bookmark'?[t.bookmark,t.bookmarked]:[t.follow,t.unfollow]
  const control=button('',async()=>{
   if(!social.signedIn){location.hash='#account';return}
   if(control.disabled||pending.has(key))return
   pending.add(key);control.disabled=true
   try{
    const result=await request('/api/community/'+kind+'/'+id,signal,false,set.has(id)?'DELETE':'PUT')
    if(signal.aborted)return
    if(result.active)set.add(id);else set.delete(id)
    for(const update of reactionUpdates.get(key)??[])update(result.count)
   }catch(e){fail(e)}finally{pending.delete(key);if(!signal.aborted)control.disabled=own}
  })
  function update(n){control.textContent=(set.has(id)?label[1]:label[0])+(kind==='bookmark'?'':' · '+n);control.setAttribute('aria-pressed',String(set.has(id)))}
  if(!reactionUpdates.has(key))reactionUpdates.set(key,[])
  update.control=control;reactionUpdates.get(key).push(update);update(count??0);control.disabled=own
  if(!social.signedIn)control.title=t.signIn
  return control
 }
 async function recordView(id){
  if(!social.signedIn||signal.aborted)return
  try{const counts=await request('/api/community/view/'+id,signal,false,'POST');if(!signal.aborted)for(const fn of viewUpdates.get(id)??[])fn(counts.views,counts.downloads)}catch{}
 }
 const artFor=(b,large=false)=>{
  const art=el('div','community-art'+(large?' large':''))
  if(b.imageCount>0&&uuid.test(b.id)){const image=el('img');image.src='/api/community/build/'+b.id+'/image/0';image.alt=b.title;image.loading='lazy';art.append(image);return art}
  art.append(icon('layers'))
  const openLarge=()=>{if(activeViewer)location.hash='#community/build/'+b.id;else void showViewer(b)}
  const largeCard=b.partCount>previewLimits.thumbnailParts
  const run=button(largeCard?t.previewLimit:t.preview,()=>largeCard?openLarge():queue(), 'workspace-action community-preview-button')
  art.append(run)
  let queued=false
  function queue(){
   if(queued||signal.aborted)return
   queued=true;observer?.unobserve(art);run.disabled=true;run.textContent=t.loading
   const generation=epoch
   work=work.catch(()=>{}).then(async()=>{
    if(signal.aborted||generation!==epoch||!art.isConnected)return
    let renderer
    try{
      const d=await request('/api/community/build/'+b.id+'/preview',signal,false),safe=previewDocument(d)
      if(!safe){run.textContent=t.viewerLimit;return}
      if(isLargePreview(safe)){run.textContent=t.previewLimit;run.disabled=false;run.onclick=openLarge;return}
      const {createProjectPreviewRenderer}=await import('../editor/project-preview.js?v=contact-shadow')
      if(signal.aborted||generation!==epoch)return
      renderer=createProjectPreviewRenderer()
      const blob=await renderer.render(safe,signal)
      if(!blob||signal.aborted||generation!==epoch){run.textContent=t.noPreview;return}
      const url=URL.createObjectURL(blob);urls.add(url);const image=el('img');image.src=url;image.alt=b.title;art.replaceChildren(image)
    }catch{if(!signal.aborted)run.textContent=t.noPreview}
    finally{renderer?.dispose()}
   })
  }
  if(readPreference('previews')!=='off'&&b.partCount>0&&b.partCount<=previewLimits.thumbnailParts&&typeof IntersectionObserver==='function'){
   if(!observer)observer=new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting&&previewJobs<8){previewJobs++;const f=e.target._bricklabPreview;if(f)f()}},{rootMargin:'100px'})
   art._bricklabPreview=queue;observer.observe(art)
  }
  return art
 }
 async function showViewer(b){
  if(signal.aborted||activeViewer)return
  const controller=new AbortController(),dialog=el('dialog','community-viewer-dialog community-model-dialog'),bar=el('div','community-viewer-toolbar'),title=el('h2',null,b.title),host=el('div','community-viewer-stage'),message=el('p','community-viewer-status',t.loading)
  const headingId='community-viewer-title';title.id=headingId;dialog.setAttribute('aria-labelledby',headingId)
  let session,closed=false,largeMode=false
  const controls=el('div','community-viewer-controls')
  const minus=button('−',()=>session?.zoom(1.25)),plus=button('+',()=>session?.zoom(.8)),reset=button(t.viewerReset,()=>session?.reset())
  minus.setAttribute('aria-label',t.viewerZoomOut);plus.setAttribute('aria-label',t.viewerZoomIn)
  const full=button(t.viewerFull,async()=>{
   if(document.fullscreenElement===dialog)await document.exitFullscreen?.().catch(()=>{})
   else if(dialog.requestFullscreen){try{await dialog.requestFullscreen()}catch{dialog.classList.toggle('expanded')}}
   else dialog.classList.toggle('expanded')
   updateFull()
  })
  function updateFull(){full.textContent=document.fullscreenElement===dialog||dialog.classList.contains('expanded')?t.viewerExitFull:t.viewerFull}
  const close=button(t.viewerClose,finish)
  function finish(){
   if(closed)return;closed=true;controller.abort();session?.dispose()
   document.removeEventListener('fullscreenchange',updateFull)
   if(document.fullscreenElement===dialog)void document.exitFullscreen?.().catch(()=>{})
   if(dialog.open)dialog.close()
   dialog.remove();activeViewer=null;modalNotice=null
   for(const [key,callbacks] of reactionUpdates){const live=callbacks.filter(fn=>fn.control?.isConnected);if(live.length)reactionUpdates.set(key,live);else reactionUpdates.delete(key)}
   const listeners=viewUpdates.get(b.id)?.filter(fn=>fn!==update)??[];if(listeners.length)viewUpdates.set(b.id,listeners);else viewUpdates.delete(b.id)
   if(!signal.aborted&&view.type==='build'&&location.hash==='#community/build/'+b.id)location.hash='#community'
  }
  activeViewer=finish
  document.addEventListener('fullscreenchange',updateFull)
  dialog.addEventListener('cancel',e=>{e.preventDefault();finish()})
  dialog.addEventListener('close',finish)
  for(const control of [minus,plus,reset])control.disabled=true
  controls.append(minus,plus,reset,full,close);bar.append(title,controls)
  message.setAttribute('role','status')
  const notice=el('p','account-muted');notice.setAttribute('role','status');modalNotice=notice
  const layout=el('div','community-model-layout'),left=el('div','community-model-view'),info=el('section','community-model-info')
  const help=el('p','community-viewer-help',t.viewerHelp)
  left.append(host,message,help)
  if(b.imageCount>0&&uuid.test(b.id)){
    const pictures=el('div','community-model-pictures'),main=el('img','community-model-picture'),choices=el('div','community-image-choices')
    main.hidden=true
    const three=button(t.threeD,()=>{main.hidden=true;host.hidden=false;message.hidden=false;minus.hidden=plus.hidden=largeMode;reset.hidden=false;for(const c of choices.children)c.setAttribute('aria-pressed',String(c===three))})
    three.setAttribute('aria-pressed','true');choices.append(three)
    for(let i=0;i<Math.min(4,b.imageCount);i++){const thumb=button('',()=>{main.src='/api/community/build/'+b.id+'/image/'+i;main.hidden=false;host.hidden=true;message.hidden=true;for(const c of [minus,plus,reset])c.hidden=true;for(const c of choices.children)c.setAttribute('aria-pressed',String(c===thumb))});thumb.setAttribute('aria-label',t.image+' '+(i+1));thumb.setAttribute('aria-pressed','false');const img=el('img');img.src='/api/community/build/'+b.id+'/image/'+i;img.alt='';thumb.append(img);choices.append(thumb)}
    pictures.append(choices);left.insertBefore(main,host);left.append(pictures)
  }
  const author=link(b.author,profileHref(b.authorUsername,b.authorId),'community-author')
  const avatar=publicImage(b.authorAvatarUrl,b.authorId,'avatar');if(avatar){avatar.className='community-author-avatar';author.prepend(avatar)}
  decorateAuthor(author,b.authorTheme,language);const authorBar=el('div','community-model-author');authorBar.append(author);applySignature(authorBar,b.authorTheme)
  const meta=el('div','community-meta')
  for(const v of [t[b.category]??t.other,b.partCount+' '+t.partCount,t.revision+' '+b.revision])meta.append(el('span',null,v))
  meta.append(el('span',null,t.difficulty+': '+(t[b.difficulty]??t.unspecified)),el('span',null,t[b.workType]??t.original))
  for(const tag of b.tags??[])meta.append(el('span',null,'#'+tag))
  if(b.publishedAt)meta.append(el('span',null,t.published+': '+new Date(b.publishedAt).toLocaleDateString(language)))
  const stats=el('div','community-meta'),views=el('span'),downloads=el('span')
  const update=(v,d)=>{views.textContent=t.views+': '+v;downloads.textContent=t.downloads+': '+d};update(b.views??0,b.downloads??0)
  if(!viewUpdates.has(b.id))viewUpdates.set(b.id,[]);viewUpdates.get(b.id).push(update);stats.append(views,downloads)
  const actions=el('div','community-actions')
  const open=button(t.open,async()=>{if(open.disabled||closed)return;open.disabled=true;try{await openPublishedCopy(b.id,controller.signal,doc=>openCopy({...doc,communityOrigin:{id:b.id}}))}catch(e){if(!closed)fail(e)}finally{if(!closed)open.disabled=false}},'workspace-action primary')
  open.title=t.copyHint
  const download=link(t.download,'/community/build/'+b.id+'/download');download.download=''
  const share=button(t.share,async()=>{const url=new URL(location.href);url.hash='community/build/'+b.id;try{await navigator.clipboard.writeText(url.href);notice.textContent=t.copied}catch{const input=el('input');input.value=url.href;input.readOnly=true;input.setAttribute('aria-label',t.shareFailed);notice.replaceChildren(input);input.select()}})
  if(b.allowDownload!==false)actions.append(open,download)
  else actions.append(el('p','account-muted',t.downloadDisabled))
  actions.append(reaction('like',b.id,b.likes,b.authorId===social.ownId),reaction('bookmark',b.id,0),share)
  const reportForm=el('form','community-actions'),reason=el('select'),send=el('button','workspace-action',t.report);send.type='submit'
  for(const key of ['spam','abuse','copyright','other']){const opt=el('option',null,key==='other'?t.otherReport:t[key]);opt.value=key;reason.append(opt)}
  reason.setAttribute('aria-label',t.reportReason);reportForm.hidden=true;reportForm.append(reason,send,button(t.viewerClose,()=>{reportForm.hidden=true}))
  reportForm.onsubmit=async e=>{e.preventDefault();if(send.disabled)return;send.disabled=true;try{await request('/api/community/build/'+b.id+'/report',controller.signal,false,'POST',{reason:reason.value});if(!closed){notice.textContent=t.reportBuildSent;reportForm.hidden=true}}catch(e){if(!closed)fail(e)}finally{send.disabled=false}}
  if(b.authorId!==social.ownId)actions.append(button(t.reportBuild,()=>{if(!social.signedIn){location.hash='#account';return}reportForm.hidden=!reportForm.hidden}))
  actions.append(reportForm)
  const credit=el('div','community-model-credit')
  if(b.coauthors?.length){const row=el('div','community-coauthors');row.append(el('strong',null,language==='ru'?'Соавторы (указаны автором)':'Coauthors (credited by author)'));for(const p of b.coauthors)row.append(link('@'+p.username,profileHref(p.username,p.id)));credit.append(row)}
  if(b.attribution){credit.append(el('p','account-muted',t.attribution+': '+b.attribution));if(b.originId&&uuid.test(b.originId))credit.append(link(t.attribution,'#community/build/'+b.originId))}
  credit.append(el('p','account-muted',b.allowRemix?t.remixAllowed:t.remixForbidden))
  info.append(authorBar,meta,el('h3',null,t.aboutModel),el('p','community-description',b.description||t.noDescription),credit,stats,actions,notice)
  layout.append(left,info)
  const related=el('section','community-related'),relatedHead=el('div','community-heading'),relatedGrid=el('div','community-related-grid')
  relatedHead.append(el('h3',null,t.moreByAuthor),link(t.allAuthor,profileHref(b.authorUsername,b.authorId)))
  related.append(relatedHead,relatedGrid)
  dialog.append(bar,layout,related);root.append(dialog)
  try{
   dialog.showModal()
   dialog.append(discussion(b,controller.signal))
   void recordView(b.id)
   void (async()=>{try{
    const {profile}=await request('/api/community/profile/'+b.authorId,controller.signal)
    if(!closed)authorBar.append(reaction('follow',profile.id,profile.followers,profile.id===social.ownId))
   }catch{}})()
   void (async()=>{try{
    const {builds}=await request('/api/community/builds?author='+b.authorId,controller.signal)
    if(closed)return
    const other=builds.filter(item=>item.id!==b.id).slice(0,4)
    if(!other.length)relatedGrid.append(el('p','account-muted',t.relatedEmpty))
    for(const item of other){const card=el('article','community-card'),body=el('div','community-card-body')
      body.append(link(item.title,'#community/build/'+item.id,'community-title'),el('p','account-muted',item.partCount+' '+t.partCount))
      card.append(artFor(item),body);relatedGrid.append(card)}
   }catch{if(!closed)relatedGrid.append(el('p','account-muted',t.failed))}})()
   const doc=await request('/api/community/build/'+b.id+'/preview',controller.signal,false),safe=previewDocument(doc)
   if(!safe){message.textContent=t.viewerLimit;return}
   largeMode=isLargePreview(safe)
   let mount
   if(largeMode){
    minus.hidden=plus.hidden=true;help.textContent=b.allowDownload===false?t.largeHelpRestricted:t.largeHelp
    mount=(await import('./community-large-viewer.js?v=large-viewer-1')).mountLargeModelViewer
   }else mount=(await import('./community-viewer.js?v=viewer-1')).mountModelViewer
   controller.signal.throwIfAborted()
   session=await mount(host,safe,{signal:controller.signal,onProgress:(n,total)=>{message.textContent=(largeMode?t.largeLoading:t.loading)+' '+n+'/'+total}})
   if(closed){session.dispose();return}
   const notices=[]
   if(largeMode)notices.push(t.largeViewer)
   if(session.shown<b.partCount)notices.push(t.viewerPartial+' '+session.shown+'/'+b.partCount)
   if(session.simplified)notices.push(t.simplified+' '+session.simplified)
   message.textContent=notices.join(' · ')
   for(const control of [minus,plus,reset])control.disabled=false
  }catch(e){if(!closed)message.textContent=e.code==='preview_limit'?t.viewerLimit:t.viewerUnavailable}
 }
 function discussion(build,signal){
  const section=el('section','community-discussion'),heading=el('h2',null,t.discussion),notice=el('p','account-muted'),list=el('div','community-comment-list')
  notice.setAttribute('role','status')
  const path='/api/community/build/'+build.id+'/comments'
  let offset=0,parent=null,busy=false,loading=false
  const form=el('form','community-comment-form'),text=el('textarea'),replyLabel=el('span','account-muted'),cancel=button(t.cancelReply,()=>setParent(null)),submit=el('button','workspace-action primary',t.send)
  text.required=true;text.maxLength=1500;text.rows=3;text.placeholder=t.commentPlaceholder;text.setAttribute('aria-label',t.commentPlaceholder)
  submit.type='submit'
  function setParent(c){parent=c;replyLabel.textContent=c?t.replyTo+' '+c.author:'';cancel.hidden=!c}
  setParent(null)
  const replyBar=el('div','community-actions');replyBar.append(replyLabel,cancel);form.append(replyBar,text,submit)
  function error(e){notice.textContent=e.code==='comment_limit'?t.commentLimit:e.code==='report_limit'?t.reportLimit:e.code==='invalid_reply'?t.invalidReply:e.code==='public_profile_required'?t.commentProfile:e.status===401?t.commentLogin:t.failed}
  form.onsubmit=async e=>{
   e.preventDefault();if(busy||!text.value.trim())return
   busy=true;submit.disabled=true;text.disabled=true
   try{await request(path,signal,false,'POST',{body:text.value,parentId:parent?.id??null});if(signal.aborted)return;text.value='';setParent(null);await load(true)}
   catch(e){error(e)}finally{busy=false;submit.disabled=false;text.disabled=false}
  }
  const more=button(t.more,()=>load(false));more.hidden=true
  function renderComment(c){
   const row=el('article','community-comment'+(c.parentId?' reply':'')),top=el('div','community-comment-header'),avatar=publicImage(c.avatarUrl,c.authorId,'avatar')
   if(avatar){avatar.className='community-author-avatar';top.append(avatar)}
   const author=link(c.author,profileHref(c.authorUsername,c.authorId),'community-author');decorateAuthor(author,c.authorTheme,language);applySignature(top,c.authorTheme);top.append(author,el('span','account-muted',new Date(c.createdAt).toLocaleString(language==='ru'?'ru-RU':'en-US')))
   row.append(top)
   if(c.parentId)row.append(el('p','account-muted',t.replyTo+' '+(c.parentAuthor??'…')))
   row.append(el('p','community-comment-text',c.body??t.deleted))
   if(c.body!==null){
    const actions=el('div','community-actions')
    if(build.allowComments!==false&&social.ownId&&!c.parentId)actions.append(button(t.reply,()=>{setParent(c);text.focus();form.scrollIntoView({block:'nearest'})}))
    if(social.ownId===c.authorId)actions.append(button(t.removeComment,async()=>{if(!confirm(t.confirmRemove))return;try{await request('/api/community/comment/'+c.id,signal,false,'DELETE');await load(true)}catch(e){error(e)}}))
    else if(social.signedIn){
     const report=button(t.report,()=>{report.hidden=true;reportForm.hidden=false})
     const reportForm=el('form','community-actions'),reason=el('select'),send=el('button','workspace-action',t.report)
     reason.setAttribute('aria-label',t.reportReason)
     for(const [value,label] of [['spam',t.spam],['abuse',t.abuse],['other',t.otherReport]]){const option=el('option',null,label);option.value=value;reason.append(option)}
     send.type='submit';reportForm.hidden=true;reportForm.append(reason,send,button(t.viewerClose,()=>{reportForm.hidden=true;report.hidden=false}))
     reportForm.onsubmit=async e=>{e.preventDefault();send.disabled=true;try{await request('/api/community/comment/'+c.id+'/report',signal,false,'POST',{reason:reason.value});reportForm.hidden=true;notice.textContent=t.reportSent}catch(e){error(e);send.disabled=false}}
     actions.append(report,reportForm)
    }
    row.append(actions)
   }
   return row
  }
  async function load(reset){
   if(loading)return;loading=true;more.disabled=true;notice.textContent=t.loading
   try{
    const result=await request(path+'?offset='+(reset?0:offset),signal)
    if(signal.aborted)return
    if(reset)list.replaceChildren()
    for(const c of result.comments)list.append(renderComment(c))
    offset=result.nextOffset??0;more.hidden=result.nextOffset===null;notice.textContent=list.childElementCount?'':t.commentEmpty
   }catch(e){error(e)}finally{loading=false;more.disabled=false}
  }
  section.append(heading)
  if(build.allowComments===false)section.append(el('p','account-muted',t.commentsDisabled))
  else if(social.ownId)section.append(form)
  else section.append(link(social.signedIn?t.commentProfile:t.commentLogin,'#account'))
  section.append(notice,list,more);void load(true);return section
 }
 function reputationBlock(p){
  const r=p.reputation;if(!r)return null
  const block=el('div','community-reputation')
  if(p.position)block.append(el('strong','community-rank','#'+p.position))
  for(const [label,n] of [[t.reputation,r.score],[t.buildCount,r.builds],[t.receivedLikes,r.likes],[t.downloads,r.downloads]]){const item=el('div');item.append(el('strong',null,String(n)),el('span','account-muted',label));block.append(item)}
  block.title=t.ratingHint;return block
 }
 function buildCard(b,detail=false){
  const card=el('article','community-card'+(detail?' community-detail':'')),art=artFor(b,detail),body=el('div','community-card-body')
  const title=detail?el('h2',null,b.title):link(b.title,'#community/build/'+b.id,'community-title')
  if(!detail)title.addEventListener('click',e=>{if(e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;e.preventDefault();void showViewer(b)})
  const meta=el('div','community-meta'),author=link(b.author,profileHref(b.authorUsername,b.authorId),'community-author')
  const authorImage=publicImage(b.authorAvatarUrl,b.authorId,'avatar');if(authorImage){authorImage.className='community-author-avatar';author.prepend(authorImage)}
  decorateAuthor(author,b.authorTheme,language);applySignature(card,b.authorTheme);meta.append(author,el('span',null,b.partCount+' '+t.partCount),el('span',null,t[b.category]??t.other),el('span',null,t.revision+' '+b.revision))
  const statistics=el('div','community-meta'),views=el('span'),downloads=el('span');const update=(v,d)=>{views.textContent=t.views+': '+v;downloads.textContent=t.downloads+': '+d};update(b.views??0,b.downloads??0);if(!viewUpdates.has(b.id))viewUpdates.set(b.id,[]);viewUpdates.get(b.id).push(update);statistics.append(views,downloads)
  const description=el('p','community-description',b.description)
  const actions=el('div','community-actions')
  const open=button(t.open,async()=>{
    if(open.disabled||signal.aborted)return
    open.disabled=true;open.textContent=t.opening;status.textContent=''
    try{await openPublishedCopy(b.id,signal,doc=>openCopy({...doc,communityOrigin:{id:b.id}}))}
    catch(e){fail(e)}
    finally{if(!signal.aborted){open.disabled=false;open.textContent=t.open}}
  },'workspace-action primary')
  open.title=t.copyHint;if(b.allowDownload!==false)actions.append(open);actions.append(reaction('like',b.id,b.likes,b.authorId===social.ownId),reaction('bookmark',b.id,0))
  const viewButton=button(t.viewModel,()=>showViewer(b));actions.append(viewButton)
  art.addEventListener('click',e=>{if(!e.target.closest('button,a'))void showViewer(b)})
  art.classList.add('community-art-link')
  const download=link(t.download,'/community/build/'+b.id+'/download');download.download='';if(b.allowDownload!==false)actions.append(download)
  body.append(title,meta,statistics,description,actions);card.append(art,body);return card
 }
 function publicImage(url,id,kind){
  const expected='/api/community/profile/'+id+'/'+kind
  if(!uuid.test(id)||url!==expected)return null
  const image=el('img');image.src=expected;image.alt='';image.loading='lazy';return image
 }
 function builderCard(p,detail=false){
  const a=el('article','community-card community-builder'+(detail?' community-builder-detail':'')),avatar=el('div','account-avatar community-profile-avatar',Array.from(p.displayName).slice(0,2).join('').toUpperCase()),body=el('div','community-card-body')
  applySignature(a,p.backgroundTheme);const img=publicImage(p.avatarUrl,p.id,'avatar');if(img)avatar.replaceChildren(img)
  body.append(detail?el('h2',null,p.displayName):link(p.displayName,profileHref(p.username,p.id),'community-title'),el('p','community-description',p.bio))
  const badge=themeBadge(p.backgroundTheme,language);if(badge)body.append(badge);const support=productById(p.supportBadge);if(support?.kind==='badge')body.append(commerceBadge(support.id));if(p.plus===true)body.append(commerceBadge('plus'));const reputation=reputationBlock(p);if(reputation)body.append(reputation);body.append(reaction('follow',p.id,p.followers,p.id===social.ownId))
  if(detail){
   const theme=['blueprint','graphite','amber'].includes(p.coverTheme)?p.coverTheme:'blueprint'
   const cover=el('div','community-profile-cover cover-'+theme),coverImg=publicImage(p.coverUrl,p.id,'cover')
   if(coverImg)cover.append(coverImg)
   else cover.append(el('span',null,'BRICKLAB / WORKSHOP'))
   mountThemeCover(cover,p.backgroundTheme,{custom:!!coverImg});const plate=themePlate(p.backgroundTheme);if(plate)cover.append(plate);const identity=el('div','community-profile-identity');identity.append(avatar,body);a.append(cover,identity)
  }else a.append(avatar,body)
  return a
 }
 root.replaceChildren()
 const heading=el('div','community-heading');heading.append(el('p','account-muted',t.intro),link(t.manage,'#account'));root.append(heading,status)
 if(view.type==='missing'){status.textContent=t.missing;return}
 if(view.type==='build'||view.type==='profile'){
  root.prepend(link(t.back,'#community'))
  status.textContent=t.loading
  try{
   if(view.type==='build'){const {build}=await request('/api/community/build/'+view.id,signal);if(!signal.aborted){status.textContent='';void showViewer(build)}}
   else{
    const {profile}=await request('/api/community/profile/'+view.id,signal);if(signal.aborted)return
    const canonical=profileHref(profile.username,profile.id);if(location.hash!==canonical){location.replace(canonical);return}
    const {builds}=await request('/api/community/builds?author='+profile.id,signal);if(signal.aborted)return
    status.textContent='';const theme=backgroundIds.includes(profile.backgroundTheme)?profile.backgroundTheme:'default'
    const workshop=el('section','unified-public-profile fullscreen-workshop cosmetic-'+theme);applySignature(workshop,profile.backgroundTheme)
    const actions=[link(t.back,'#community'),reaction('follow',profile.id,profile.followers,profile.id===social.ownId)]
    if(profile.id===social.ownId)actions.push(link(language==='ru'?'Вернуться в мастерскую':'Back to workshop','#account','workspace-action'))
    workshop.append(renderUnifiedHero({lang:language,identity:{...profile,bio:'',subtitle:language==='ru'?'Конструктор BrickLab':'BrickLab builder'},actions,metricCards:metricItems({layout:profile.metricLayout,lang:language,portfolio:profile.portfolio,values:workshopMetricValues({lang:language,card:profile,loaded:true})})}))
    workshop.append(renderPortfolio({lang:language,profile,builds,onOpen:b=>void showViewer(b),makeBuildCard:b=>buildCard(b),makeFeaturedArt:b=>artFor(b,true)}));root.replaceChildren(status,workshop)
   }
  }catch(e){fail(e)}
  return
 }
 const tabs=el('div','community-actions'),filters=el('form','community-filters'),grid=el('div','community-grid'),more=button(t.more,()=>load(false))
 let mode='models',offset=0,serial=0
 const models=button(t.models,()=>switchMode('models')),builders=button(t.builders,()=>switchMode('builders'))
 const following=button(t.following,()=>switchMode('following'));const leaders=button(t.leaders,()=>switchMode('leaders'));const bookmarks=button(t.bookmarks,()=>switchMode('bookmarks'));tabs.append(models,builders,following,bookmarks,leaders)
 const search=el('input');search.type='search';search.maxLength=100;search.placeholder=t.search;search.setAttribute('aria-label',t.search)
 function select(entries,label){const n=el('select');n.setAttribute('aria-label',label);for(const [v,text] of entries){const option=el('option',null,text);option.value=v;n.append(option)}return n}
 const category=select([['',t.all],...['vehicles','mechanisms','architecture','robots','other'].map(k=>[k,t[k]])],t.all),sort=select(['recent','oldest','name','parts','popular'].map(k=>[k,t[k]]),t.recent)
 const submit=el('button','workspace-action primary',t.find);submit.type='submit';filters.append(search,category,sort,submit)
 filters.onsubmit=e=>{e.preventDefault();load(true)};category.onchange=sort.onchange=()=>load(true)
 root.append(tabs,filters,grid,more);more.hidden=true
 function switchMode(next){mode=next;models.setAttribute('aria-pressed',String(mode==='models'));builders.setAttribute('aria-pressed',String(mode==='builders'));following.setAttribute('aria-pressed',String(mode==='following'));leaders.setAttribute('aria-pressed',String(mode==='leaders'));bookmarks.setAttribute('aria-pressed',String(mode==='bookmarks'));filters.hidden=mode==='builders'||mode==='leaders';load(true)}
 async function load(reset){
  const version=++serial;activeRequest?.abort();activeRequest=new AbortController()
  const requestSignal=activeRequest.signal
  if(reset){offset=0;clearPreviews();previewJobs=0;reactionUpdates.clear();viewUpdates.clear();grid.replaceChildren()}
  more.hidden=true;status.textContent=t.loading
  try{
   if(['following','bookmarks'].includes(mode)&&!social.signedIn){status.textContent=t.signIn;grid.append(link(t.signIn,'#account'));return}
   if(mode==='leaders'){
    const result=await request('/api/community/leaderboard?offset='+offset,requestSignal);if(signal.aborted||version!==serial)return
    if(reset)grid.append(el('p','community-rating-hint',t.ratingHint));for(const p of result.profiles)grid.append(builderCard(p));offset=result.nextOffset??0;more.hidden=result.nextOffset===null
   }else if(mode==='builders'){
    const {profiles}=await request('/api/community',requestSignal);if(signal.aborted||version!==serial)return
    for(const p of profiles)grid.append(builderCard(p))
   }else{
    const qs=new URLSearchParams({q:search.value.trim(),category:category.value,sort:sort.value,offset:String(offset)})
    if(['following','bookmarks'].includes(mode))qs.set('feed',mode)
    const result=await request('/api/community/builds?'+qs,requestSignal);if(signal.aborted||version!==serial)return
    for(const b of result.builds)grid.append(buildCard(b))
    offset=result.nextOffset??0;more.hidden=result.nextOffset===null
   }
   status.textContent=grid.childElementCount?'':mode==='following'?t.followingEmpty:mode==='bookmarks'?t.bookmarkEmpty:t.empty
  }catch(e){if(version===serial&&e.name!=='AbortError')fail(e)}
 }
 switchMode('models')
}
