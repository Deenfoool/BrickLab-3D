import {toLiveBlocks,isLiveLayout} from './workshop-live-model.js'
import {renderWorkshopAwards} from './workshop-award-widgets.js?v=workshop-live-1'
import {renderWorkshopLayoutEditor} from './workshop-layout-editor.js?v=layout-studio-2'
import {planPortfolioGrid,placePortfolioBlock} from './portfolio-layout-model.js'
import {metricItems} from './workshop-metrics-model.js'
import {workshopMetricValues} from './workshop-metrics.js?v=layout-studio-2'
import {sortableHandle,moveItem} from './sortable-handle.js?v=layout-studio-2'
import {renderMetricGrid} from './workshop-metrics.js?v=layout-studio-2'
import {profileHref} from './profile-route.js'
import {applyAchievementAppearance} from './achievement-rewards.js'
import {achievementById} from './achievement-catalog.js'
import {commerceBadge} from './commerce-visuals.js?v=merch-2'
import {applySignature,themeBadge,themePlate,mountThemeCover} from './profile-signature.js?v=signature-art-1'
import {defaultPortfolio,filterPortfolio,calendarDays,portfolioUuid} from './portfolio-model.js?v=layout-studio-2'
import {productById} from './commerce-catalog.js'
const words={
 ru:{featured:'Закреплённая работа',publications:'Опубликованные сборки',collections:'Коллекции',awards:'Витрина достижений',activity:'Календарь активности',statistics:'Инженерная статистика',about:'О себе',followers:'Подписчики',empty:'Пока нет опубликованных сборок.',noPin:'Закрепи лучшую опубликованную работу в настройках профиля.',noCollections:'Коллекции пока не созданы.',noAwards:'Нет опубликованных наград.',firstAward:'Первая облачная сборка',parts:'Детали',builds:'Сборки',likes:'Лайки',downloads:'Скачивания',score:'Репутация',open:'Открыть сборку / 3D',publicDays:'26 недель · даты последних ревизий действующих публичных работ · UTC',privateDays:'26 недель · сохранённые облачные ревизии · UTC',days:'Активных дней',count:'Событий',none:'Не закреплено',order:'Порядок и видимость блоков',up:'Выше',down:'Ниже',remove:'Удалить',add:'Добавить коллекцию',name:'Название коллекции',choose:'Выбери опубликованные сборки',visibility:'Виден посетителям',notShared:'Публичная страница выключена',shared:'Публичная страница включена',save:'Сохранить профиль',publish:'Сохранить и опубликовать',edit:'Оформление и приватность',publicConsent:'Разрешаю публиковать выбранные данные и автоматически синхронизировать их при дальнейшем редактировании.',legacy:'У существующего публичного профиля могли быть отдельные имя и описание. При сохранении единого профиля выбранные поля станут общими.',privacy:'Почта, локальные и приватные облачные сборки, хранилище и избранное не публикуются. Календарь посетителя показывает только публичные работы.',unpublish:'Снять публикацию профиля',unpublishConfirm:'Снятие публикации также удалит публичные сборки и связанные обсуждения. Личные сборки сохранятся. Продолжить?',preview:'Глазами посетителя',copy:'Скопировать ссылку',copied:'Ссылка скопирована',copyFailed:'Скопируй адрес вручную:',privateHint:'Публикация необязательна. Включи её, чтобы открылась витрина конструктора.',avatar:'Показывать аватар',cover:'Показывать обложку',theme:'Показывать активную тему',display:'Имя конструктора',bio:'Описание',coverStyle:'Стиль обложки',publicationSettings:'Публичность и оформление',savePrivate:'Сохранить личный профиль',more:'Открыть все работы'},
 en:{featured:'Featured build',publications:'Published builds',collections:'Collections',awards:'Achievement showcase',activity:'Activity calendar',statistics:'Engineering statistics',about:'About',followers:'Followers',empty:'No published builds yet.',noPin:'Pin your best public build in profile settings.',noCollections:'No collections yet.',noAwards:'No shared achievements.',firstAward:'First cloud build',parts:'Parts',builds:'Builds',likes:'Likes',downloads:'Downloads',score:'Reputation',open:'Open build / 3D',publicDays:'26 weeks · latest revision dates of active public builds · UTC',privateDays:'26 weeks · saved cloud revisions · UTC',days:'Active days',count:'Events',none:'Not pinned',order:'Block order and visibility',up:'Move up',down:'Move down',remove:'Remove',add:'Add collection',name:'Collection name',choose:'Choose published builds',visibility:'Visible to visitors',notShared:'Public page is off',shared:'Public page is on',save:'Save profile',publish:'Save and publish',edit:'Appearance and privacy',publicConsent:'I agree to publish the selected data and automatically synchronize it on future edits.',legacy:'Your existing public card may have a separate name and bio. Saving the unified profile makes the selected fields shared.',privacy:'Email, local and private cloud builds, storage and favorites are not published. The visitor calendar uses only public works.',unpublish:'Unpublish profile',unpublishConfirm:'This also removes public builds and related discussions, not private builds. Continue?',preview:'View as visitor',copy:'Copy link',copied:'Link copied',copyFailed:'Copy this address:',privateHint:'Publishing is optional. Enable it to open your builder showcase.',avatar:'Show avatar',cover:'Show cover',theme:'Show active theme',display:'Builder name',bio:'Biography',coverStyle:'Cover style',publicationSettings:'Visibility and appearance',savePrivate:'Save private profile',more:'Open all works'}
}
const tr=lang=>words[lang]??words.en
export function ui(tag,cls,value){const n=document.createElement(tag);if(cls)n.className=cls;if(value!==undefined)n.textContent=String(value);return n}
function icon(id){const n=document.createElementNS('http://www.w3.org/2000/svg','svg'),u=document.createElementNS(n.namespaceURI,'use');n.setAttribute('class','icon');n.setAttribute('aria-hidden','true');u.setAttribute('href','#'+id);n.append(u);return n}
function action(label,fn,disabled=false){const b=ui('button','workspace-action',label);b.type='button';b.disabled=disabled;b.onclick=fn;return b}
function anchor(label,href){const a=ui('a','workspace-action',label);a.href=href;return a}
function check(label,checked,disabled=false){const l=ui('label','workshop-check'),input=ui('input');input.type='checkbox';input.checked=Boolean(checked);input.disabled=disabled;l.append(input,ui('span',null,label));return {label:l,input}}
function field(label,input){const l=ui('label','account-field');l.append(ui('span',null,label),input);return l}
function block(title,key){const n=ui('section','portfolio-block portfolio-'+key);n.append(ui('h2',null,title));return n}
const safePublicId=id=>typeof id==='string'&&portfolioUuid.test(id)
function publicImage(id,kind,url){const path='/api/community/profile/'+id+'/'+kind;return safePublicId(id)&&url===path?path:null}
function ownMedia(kind,url){return typeof url==='string'&&new RegExp('^/api/profile/'+kind+'\\?v=[0-9a-f-]{36}$','i').test(url)?url:null}
export function renderUnifiedHero({lang,identity,owner=false,actions=[],metrics=[],metricCards=[],coverControls}){
 const hero=ui('section','workshop-hero cover-'+(['blueprint','graphite','amber'].includes(identity.coverTheme)?identity.coverTheme:'blueprint'))
 const theme=identity.backgroundTheme,cover=ui('div','workshop-cover'),emblem=ui('div','workshop-emblem','BRICKLAB / WORKSHOP');emblem.prepend(icon('layers'));cover.append(emblem)
 const plate=themePlate(theme);if(plate)cover.append(plate)
 const avatarUrl=owner?ownMedia('avatar',identity.avatarUrl):publicImage(identity.id,'avatar',identity.avatarUrl),coverUrl=owner?ownMedia('cover',identity.coverUrl):publicImage(identity.id,'cover',identity.coverUrl)
 if(coverUrl){const img=ui('img','profile-cover-image');img.src=coverUrl;img.alt='';cover.prepend(img)}
 mountThemeCover(cover,theme,{custom:!!coverUrl});if(owner&&coverControls)cover.append(coverControls);applySignature(hero,theme);applyAchievementAppearance(hero,identity.achievementStyle)
 const body=ui('div','workshop-hero-inner'),person=ui('div','workshop-identity'),avatar=ui('div','workshop-avatar',Array.from(identity.displayName||'?').slice(0,2).join('').toUpperCase()),name=ui('div')
 if(avatarUrl){const img=ui('img','profile-avatar-image');img.src=avatarUrl;img.alt='';avatar.replaceChildren(img)}
 name.append(ui('h2',null,identity.displayName));if(identity.username)name.append(ui('p','account-muted','@'+identity.username));if(identity.subtitle)name.append(ui('p','account-muted',identity.subtitle));const badge=themeBadge(theme,lang);if(badge)name.append(badge);if(identity.plus===true)name.append(commerceBadge('plus'));const support=productById(identity.supportBadge);if(support?.kind==='badge')name.append(commerceBadge(support.id))
 person.append(avatar,name);body.append(person)
 if(actions.length){const a=ui('div','workshop-hero-actions');a.append(...actions);body.append(a)}
 hero.append(cover,body)
 if(identity.bio)hero.append(ui('p','workshop-bio',identity.bio))
 if(metrics.length){const grid=ui('div','workshop-metric-grid');for(const [label,value] of metrics){const m=ui('div','workshop-metric');m.append(ui('span',null,label),ui('strong',null,value));grid.append(m)}hero.append(grid)}
 if(metricCards.length)hero.append(renderMetricGrid(metricCards))
 return hero
}
export function activityCalendar(lang,entries,{publicOnly=false}={}){
 const t=tr(lang),days=calendarDays(entries),root=ui('div','portfolio-calendar'),summary=ui('div','portfolio-calendar-summary')
 summary.append(ui('span',null,t.days+': '+days.filter(d=>d.count>0).length),ui('span',null,t.count+': '+days.reduce((n,d)=>n+d.count,0)))
 const grid=ui('div','portfolio-heatmap')
 for(const d of days){const cell=ui('span','portfolio-day level-'+Math.min(4,d.count));cell.title=d.day+' · '+d.count;cell.setAttribute('aria-label',cell.title);grid.append(cell)}
 grid.setAttribute('role','img');grid.setAttribute('aria-label',publicOnly?t.publicDays:t.privateDays)
 root.append(summary,grid,ui('p','account-muted',publicOnly?t.publicDays:t.privateDays));return root
}
function buildTile(b,t,onOpen,makeArt){
 const card=ui('article','portfolio-build-tile'),art=makeArt?makeArt(b):ui('div','portfolio-build-art');if(makeArt)art.classList.add('portfolio-build-art');else art.append(icon('layers'))
 if(!makeArt&&b.imageCount>0&&safePublicId(b.id)){const img=ui('img');img.alt='';img.loading='lazy';img.src='/api/community/build/'+b.id+'/image/0';art.append(img)}
 const info=ui('div','portfolio-build-info');info.append(ui('h3',null,b.title),ui('p','account-muted',String(b.partCount??0)+' · '+t.parts))
 if(onOpen)info.append(action(t.open,()=>onOpen(b)));else info.append(anchor(t.open,'#community/build/'+b.id))
 card.append(art,info);return card
}
export function setLiveWidgetRect(node,rect){placePortfolioBlock(node,{row:rect.y+1,column:rect.x+1,span:rect.w});node.setAttribute('data-layout-height',String(rect.h));node.style?.setProperty?.('--widget-height',String(rect.h));node.style?.setProperty?.('--widget-order',String(rect.y*12+rect.x))}
export function renderPortfolio({lang,profile,builds=[],owner=false,onOpen,makeBuildCard,makeFeaturedArt,privateCalendar,live=false,editing=false,metricCards=[]}){
 const t=tr(lang),root=ui('div','portfolio-blocks portfolio-layout-grid'),rendered=[],valid=builds.filter(b=>safePublicId(b.id)).map(b=>profile?.visible===false?{...b,imageCount:0}:b),p=filterPortfolio(profile?.portfolio,valid.map(b=>b.id))
 live=live||isLiveLayout(p.blocks);const byId=new Map(valid.map(b=>[b.id,b])),layout=live?toLiveBlocks(p.blocks):p.blocks
 if(live)root.classList.add('workshop-live-grid')
 for(const item of layout){
  const {key,visible}=item
  if(!visible&&!editing)continue
  const title=key==='metrics'?(lang==='ru'?'Показатели мастерской':'Workshop metrics'):t[key],c=block(title,key)
  if(live){c.setAttribute('data-widget',key);c.setAttribute('data-widget-visible',String(visible));c.setAttribute('data-widget-locked',String(!!item.locked))}
  if(!visible&&editing)c.append(ui('p','account-muted',lang==='ru'?'Скрыт от посетителей':'Hidden from visitors'))
  else{
  if(key==='featured'){
   const b=byId.get(p.featured);if(b)c.append(buildTile(b,t,onOpen,makeFeaturedArt));else if(owner||live)c.append(ui('p','account-muted',owner?t.noPin:t.empty));else continue
  }else if(key==='publications'){
   const grid=ui('div','portfolio-build-grid')
   for(const b of valid)grid.append(makeBuildCard?makeBuildCard(b):buildTile(b,t,onOpen))
   if(!valid.length)c.append(ui('p','account-muted',t.empty));else c.append(grid)
  }else if(key==='collections'){
   if(!p.collections.length){if(!owner&&!live)continue;c.append(ui('p','account-muted',t.noCollections))}
   for(const group of p.collections){const box=ui('section','portfolio-collection'),grid=ui('div','portfolio-collection-links');box.append(ui('h3',null,group.title));for(const id of group.ids){const b=byId.get(id);if(b)grid.append(anchor(b.title,'#community/build/'+b.id))}box.append(grid);c.append(box)}
  }else if(key==='awards'){
   const awards=profile?.awards??[],showcase=renderWorkshopAwards({lang,ids:awards,definitions:profile?.achievementDefinitions??[],dates:profile?.achievementDates??{},editing})
   if(showcase.children[0].children.length)c.append(showcase);else c.append(ui('p','account-muted',t.noAwards))
  }else if(key==='activity'){
   const days=valid.filter(b=>typeof b.publishedAt==='string').map(b=>({day:b.publishedAt.slice(0,10),count:1}))
   c.append(activityCalendar(lang,days,{publicOnly:true}))
  }else if(key==='statistics'){
   const stats=profile?.reputation,grid=ui('div','portfolio-stat-grid')
   const vals=[[t.builds,stats?.builds??valid.length],[t.parts,valid.reduce((n,b)=>n+(Number.isSafeInteger(b.partCount)?b.partCount:0),0)]]
   if(stats)vals.push([t.likes,stats.likes],[t.downloads,stats.downloads],[t.score,stats.score])
   for(const [label,value] of vals){const m=ui('div','workshop-metric');m.append(ui('span',null,label),ui('strong',null,value));grid.append(m)}c.append(grid)
  }else if(key==='about'){if(!profile?.bio&&!live)continue;c.append(ui('p','portfolio-about',profile?.bio|| (lang==='ru'?'Описание пока не добавлено.':'No biography yet.')))}
  else if(key==='followers'){c.append(ui('strong','portfolio-follower-count',profile?.followers??0))}
  else if(key==='metrics'){c.append(renderMetricGrid(metricCards))}
  }
  if(live){const body=ui('div','workshop-widget-body');body.append(...Array.from(c.children).slice(1));const heading=c.children[0];c.replaceChildren(heading,body)}
  root.append(c);rendered.push({item,node:c})
 }
 if(live){const positions=layout;const byKey=new Map(positions.map(b=>[b.key,b.rect]));for(const {item,node} of rendered){const rect=byKey.get(item.key);setLiveWidgetRect(node,rect)}}else{const positions=planPortfolioGrid(rendered.map(x=>x.item));rendered.forEach((entry,i)=>placePortfolioBlock(entry.node,positions[i]))}
 if(owner&&Array.isArray(privateCalendar)){const c=block(t.activity+' · '+(lang==='ru'?'личный':'private'),'private-activity');c.append(activityCalendar(lang,privateCalendar));root.append(c)}
 return root
}
export function profileLinkControls(lang,profile){
 const t=tr(lang),root=ui('div','portfolio-link-controls')
 if(!safePublicId(profile?.id))return root
 const href='/'+profileHref(profile.username,profile.id),notice=ui('span','account-muted');notice.setAttribute('role','status')
 root.append(action(t.copy,async()=>{const value=new URL(href,location.origin).href;try{await navigator.clipboard.writeText(value);notice.textContent=t.copied}catch{notice.textContent=t.copyFailed+' '+value}}),notice);return root
}
export function renderUnifiedEditor({lang,user,profile,publicCard,publicLoaded,publicBuilds,busy,loadPublic,saveProfile,publishPublic,unpublishPublic,visibilitySupported=false,mode='all',portfolioDraft,onPortfolioDraft,savePortfolio,progress,contentOnly=false}){
 const t=tr(lang),root=ui('section','account-card workshop-card unified-profile-editor');root.append(ui('h2',null,mode==='layout'?(contentOnly?(lang==='ru'?'Содержимое мастерской':'Workshop content'):(lang==='ru'?'Компоновка мастерской':'Workshop layout')):mode==='privacy'?t.publicationSettings:t.edit))
 if(mode==='layout'&&publicLoaded&&(!publicCard||!publicCard.unified)){root.append(ui('p','account-muted',lang==='ru'?'Сначала создай или обнови единый профиль во вкладке «Приватность».':'Create or update your unified workshop in Privacy first.'));return root}
 if(!profile){root.append(ui('p','account-muted',lang==='ru'?'Профиль недоступен':'Profile unavailable'));return root}
 const form=ui('form','workshop-form'),name=ui('input'),bio=ui('textarea'),cover=ui('select')
 name.required=true;name.maxLength=80;name.value=profile.displayName??publicCard?.displayName??user.displayName;name.disabled=busy
 bio.maxLength=500;bio.value=profile.displayName===null&&publicCard&&!publicCard.unified?publicCard.bio:profile.bio;bio.disabled=busy
 cover.disabled=busy;for(const [key,ru,en] of [['blueprint','Чертёж','Blueprint'],['graphite','Графит','Graphite'],['amber','Янтарь','Amber']]){const option=ui('option',null,lang==='ru'?ru:en);option.value=key;cover.append(option)}cover.value=profile.cover
 if(mode==='all'||mode==='profile'){form.append(field(t.display,name),field(t.bio,bio),field(t.coverStyle,cover));if(user.username)form.prepend(ui('p','account-muted','@'+user.username))}
 if(mode==='profile'){const submit=ui('button','workspace-action primary',t.save);submit.type='submit';submit.disabled=busy;form.append(submit);form.onsubmit=e=>{e.preventDefault();if(!busy)saveProfile({displayName:name.value,bio:bio.value,cover:cover.value})};root.append(form);return root}
 if(publicCard&&!publicCard.unified)form.append(ui('p','account-muted',t.legacy))
 const status=ui('p','account-muted',!publicLoaded?(lang==='ru'?'Видимость пока не проверена.':'Visibility has not been checked.'):publicCard&&publicCard.visible!==false?t.shared:t.notShared)
 if(mode!=='layout')form.append(status,ui('p','account-muted',t.privacy))
 if(!publicLoaded){
  form.append(action(lang==='ru'?'Загрузить настройки публичности':'Load visibility settings',loadPublic,busy))
  form.append(ui('p','account-muted',lang==='ru'?'Сначала проверь статус публикации, чтобы случайно не раскрыть изменения.':'Check publication status before editing to avoid unintentionally sharing changes.'))
  root.append(form);return root
 }
 // Visibility is independent of stored public snapshots.
 const enable=check(lang==='ru'?'Публичная мастерская':'Public workshop',!!publicCard&&publicCard.visible!==false,busy),shareAvatar=check(t.avatar,publicCard?.unified?publicCard.showAvatar:!!publicCard?.avatarUrl,busy),shareCover=check(t.cover,publicCard?.unified?publicCard.showCover:!!publicCard?.coverTheme,busy),shareTheme=check(t.theme,!!publicCard?.backgroundTheme,busy)
 const consent=check(t.publicConsent,false,busy),panel=ui('fieldset','portfolio-editor-controls')
 if(mode!=='layout')form.append(enable.label,ui('p','account-muted',lang==='ru'?'Публичная мастерская участвует в рейтинге при открытых достижениях. Скрытие сохраняет работы, комментарии и подписчиков.':'A visible workshop participates in ranking when achievements are shared. Hiding preserves works, comments and followers.'));form.append(panel)
 const savedPortfolio=filterPortfolio(publicCard?.portfolio??(publicCard?undefined:defaultPortfolio({publicByDefault:true})),publicBuilds.map(b=>b.id)),p=structuredClone(mode==='layout'&&portfolioDraft?portfolioDraft:savedPortfolio),blocks=ui('div','portfolio-order'),collections=ui('div','portfolio-editor-collections')
 const draftChanged=()=>{if(mode==='layout')onPortfolioDraft?.(structuredClone(p))}
 function renderBlocks(){
  blocks.replaceChildren()
  for(const [i,item] of p.blocks.entries()){
   const row=ui('div','portfolio-order-row'),v=check(t[item.key],item.visible,busy)
   v.input.onchange=()=>{item.visible=v.input.checked}
   const grip=sortableHandle({row,list:blocks,index:i,label:(lang==='ru'?'Перетащить: ':'Move: ')+t[item.key],disabled:busy,move:(from,to)=>{p.blocks=moveItem(p.blocks,from,to);renderBlocks()}})
    row.append(grip,v.label)
    blocks.append(row)
  }
 }
 const pin=ui('select'),none=ui('option',null,t.none);none.value='';pin.append(none);pin.disabled=busy
 for(const b of publicBuilds){const o=ui('option',null,b.title);o.value=b.id;pin.append(o)}pin.value=p.featured??''
 pin.onchange=()=>{p.featured=pin.value||null;draftChanged()}
 function renderCollections(){
  collections.replaceChildren()
  for(const [i,g] of p.collections.entries()){
   const box=ui('div','portfolio-collection-editor'),label=ui('input');label.value=g.title;label.maxLength=60;label.required=true;label.disabled=busy;label.oninput=()=>{g.title=label.value;draftChanged()}
   box.append(field(t.name,label),ui('p','account-muted',t.choose))
   for(const b of publicBuilds){const v=check(b.title,g.ids.includes(b.id),busy);v.input.onchange=()=>{g.ids=v.input.checked?[...g.ids,b.id]:g.ids.filter(id=>id!==b.id);draftChanged()};box.append(v.label)}
   box.append(action(t.remove,()=>{p.collections.splice(i,1);draftChanged();renderCollections()},busy));collections.append(box)
  }
  collections.append(action(t.add,()=>{p.collections.push({title:'',ids:[]});draftChanged();renderCollections()},busy||p.collections.length>=6))
 }
 if(mode==='all')renderBlocks();renderCollections()
 if(mode==='layout'&&contentOnly){panel.append(field(t.featured,pin),ui('h3',null,t.collections),collections)}else if(mode==='layout'){
  const ru=lang==='ru',describe=key=>{
   if(key==='featured')return publicBuilds.find(b=>b.id===p.featured)?.title??t.noPin
   if(key==='publications')return publicBuilds.length+' · '+t.builds
   if(key==='collections')return p.collections.length+' · '+t.collections
   if(key==='awards')return (progress?.showcase?.length??publicCard.awards?.length??0)+' · '+t.awards
   if(key==='about')return (publicCard.bio??'').slice(0,120)||t.about
   if(key==='followers')return String(publicCard.followers??0)
   return t[key]
  }
  const previewLayout=layout=>{
   const portfolio={...p,blocks:layout,collections:p.collections.filter(c=>c.title.trim()).map(c=>({...c,ids:c.ids.slice(0,20)}))},draft={...publicCard,portfolio}
   const awardsVisible=layout.some(b=>b.key==='awards'&&b.visible)
   if(awardsVisible&&progress){
    const earned=new Set(progress.awards?.map(a=>a.award)??[])
    const showcase=progress.showcase??(earned.has('firstCloudSave')?['firstCloudSave']:[])
    draft.awards=[...showcase.filter(id=>earned.has(id)).slice(0,6),...(publicCard.awards?.includes('firstBuilder')?['firstBuilder']:[])]
    draft.achievementDefinitions=progress.definitions??[];draft.achievementXp=progress.xp;draft.achievementCount=progress.awards?.length
    draft.achievementStyle=profile.achievementStyle
   }
   if(!awardsVisible){draft.awards=[];draft.achievementStyle=null;draft.achievementXp=undefined;draft.achievementCount=undefined}
   const visual=ui('div','studio-profile-preview'),previewOwner=publicCard.visible===false
   const identity={...draft,bio:'',subtitle:ru?'Конструктор BrickLab':'BrickLab builder'}
   if(previewOwner){identity.avatarUrl=publicCard.showAvatar?profile.avatarUrl:null;identity.coverUrl=publicCard.showCover?profile.coverUrl:null}
   const values=workshopMetricValues({lang,card:draft,loaded:true})
   visual.append(renderUnifiedHero({lang,identity,owner:previewOwner,metricCards:metricItems({layout:profile.metricLayout,lang,portfolio,values})}),renderPortfolio({lang,profile:draft,builds:publicBuilds,owner:false}))
   return visual
  }
  panel.append(renderWorkshopLayoutEditor({lang,blocks:p.blocks,originalBlocks:savedPortfolio.blocks,labels:t,busy,onChange:next=>{p.blocks=next;draftChanged()},renderPreview:previewLayout,describe}),field(t.featured,pin),ui('h3',null,t.collections),collections)
 }else{
  panel.append(shareAvatar.label,shareCover.label,shareTheme.label)
  if(mode!=='privacy')panel.append(field(t.featured,pin),ui('h3',null,t.order),blocks,ui('h3',null,t.collections),collections)
  if(!publicCard)panel.append(consent.label)
 }
 const layoutSave=lang==='ru'?'Сохранить компоновку':'Save layout',submit=ui('button','workspace-action primary',mode==='layout'?layoutSave:t.save);submit.type='submit';submit.disabled=busy||(mode==='layout'&&!savePortfolio);if(mode==='layout')submit.classList.add('studio-save')
 function setVisibility(){panel.hidden=mode==='layout'?false:!enable.input.checked&&!publicCard;panel.disabled=busy||(!publicCard&&!enable.input.checked&&mode!=='layout');consent.input.required=enable.input.checked&&!publicCard;submit.textContent=mode==='layout'?layoutSave:t.save}
 enable.input.onchange=setVisibility;setVisibility()
 form.append(submit)
 form.onsubmit=e=>{e.preventDefault();if(busy)return;const data={displayName:name.value,bio:bio.value,cover:cover.value},payload={...data,unified:true,consent:true,showAvatar:shareAvatar.input.checked,showCover:shareCover.input.checked,showBackground:shareTheme.input.checked,portfolio:p};if(mode==='layout'){if(publicCard&&savePortfolio)savePortfolio(p);return}if(publicCard&&visibilitySupported){publishPublic({...payload,visible:enable.input.checked});return}if(enable.input.checked&&(publicCard||consent.input.checked))publishPublic({...payload,...(visibilitySupported?{visible:true}:{})});else if(!enable.input.checked){if(publicCard){if(confirm(t.unpublishConfirm))unpublishPublic()}else saveProfile(data)}}
 root.append(form)
 
 return root
}
