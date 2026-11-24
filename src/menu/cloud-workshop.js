import { modelPassport, badges, ranks, rankFor, challenges, challengeReadiness } from './workshop-model.js?v=cloud-workshop-1'
import { workshopCopy } from './workshop-copy.js?v=cloud-workshop-1'

export const sections=[['workshop','icon-home'],['cloud','folder'],['passport','icon-account'],['achievements','icon-trophy'],['challenges','icon-flask'],['rankings','icon-trophy'],['publicProfile','icon-account'],['diary','book'],['bureau','icon-account'],['favorites','icon-heart'],['notifications','icon-bell'],['storage','icon-cloud'],['settings','settings'],['security','icon-shield']]
const implemented=new Set(['workshop','cloud','passport','achievements','challenges','storage','settings','security'])
const extra={
 ru:{active:'Личный аккаунт · BrickLab Cloud',pending:'Этот раздел ещё не подключён к серверу.',noAwards:'Серверный учёт наград ещё не подключён. XP и награды не начисляются по локальным данным.',catalog:'Каталог будущих достижений',rankPlan:'Планируемая лестница званий',localDoc:'Локальный документ',cloudDoc:'Облачная ревизия',chooseSource:'Источник паспорта',load:'Загрузить паспорт',latest:'Актуальная версия',privateOnly:'Все облачные сборки пока приватные.',limits:'Текущие ограничения: 20 проектов, 20 версий на проект, запрос до 2 МиБ, бюджет около 64 МиБ на аккаунт.',noBytes:'Точное использование диска пока не отображается.',identity:'Данные текущей серверной сессии. Редактирование профиля будет подключено отдельно.',securityText:'Серверная сессия хранится в HttpOnly cookie. Управление всеми сессиями, подтверждение почты, восстановление пароля и 2FA пока не подключены.',errors:'Ошибки ссылок',malformed:'Некорректные детали',duplicates:'Повторяющиеся ID',unavailable:'Нет данных для паспорта',actual:'Подтверждённые облачные данные',notIssued:'Начисление не подключено',manual:'Сохранение и получение сборок выполняются вручную.',sourceLocal:'Локальная',sourceCloud:'Облачная'},
 en:{active:'Personal account · BrickLab Cloud',pending:'This section is not connected to the server yet.',noAwards:'Server-issued awards are not connected yet. Local data does not award XP or badges.',catalog:'Upcoming achievement catalog',rankPlan:'Planned rank ladder',localDoc:'Local document',cloudDoc:'Cloud revision',chooseSource:'Passport source',load:'Load passport',latest:'Latest revision',privateOnly:'All cloud builds are currently private.',limits:'Current limits: 20 projects, 20 revisions per project, 2 MiB per request, approximately 64 MiB per account.',noBytes:'Exact disk usage is not available yet.',identity:'Current server session identity. Profile editing will be connected separately.',securityText:'The server session uses an HttpOnly cookie. Session management, email verification, password recovery and 2FA are not connected yet.',errors:'Broken links',malformed:'Malformed parts',duplicates:'Duplicate IDs',unavailable:'No passport data',actual:'Confirmed cloud data',notIssued:'Awards not connected',manual:'Builds are saved and retrieved manually.',sourceLocal:'Local',sourceCloud:'Cloud'}
}
Object.assign(extra.ru,{firstCloudSave:'Первая облачная сборка',firstCloudSaveDesc:'Первое успешное сохранение на сервере: 30 XP, один раз.',awarded:'Получено',progressHint:'XP за подтверждённое сервером сохранение. Это не оценка инженерных навыков.',profileHint:'Описание и обложка сохраняются в приватном профиле.',profileMissing:'Данные профиля пока недоступны.'})
Object.assign(extra.en,{firstCloudSave:'First cloud build',firstCloudSaveDesc:'First successful cloud save: 30 XP, once.',awarded:'Awarded',progressHint:'XP for a server-confirmed save, not an engineering skill assessment.',profileHint:'Biography and cover are saved in your private profile.',profileMissing:'Profile data is unavailable.'})
function el(tag,cls,value){const n=document.createElement(tag);if(cls)n.className=cls;if(value!==undefined)n.textContent=String(value);return n}
function icon(id){const s=document.createElementNS('http://www.w3.org/2000/svg','svg'),u=document.createElementNS(s.namespaceURI,'use');s.setAttribute('class','icon');s.setAttribute('aria-hidden','true');u.setAttribute('href','#'+id);s.append(u);return s}
function button(label,fn,disabled=false){const b=el('button','workspace-action',label);b.type='button';b.disabled=disabled;b.onclick=fn;return b}
function card(title){const c=el('section','account-card workshop-card');c.append(el('h2',null,title));return c}
function metric(label,value){const m=el('div','workshop-metric');m.append(el('span',null,label),el('strong',null,value));return m}
function metrics(items){const g=el('div','workshop-metric-grid');for(const [k,v] of items)g.append(metric(k,v));return g}
export function workshopSummary(local,remote){
 return {local:local.length,cloud:remote.length,revisions:remote.reduce((n,p)=>n+(Number.isSafeInteger(p.revision)&&p.revision>0?p.revision:0),0)}
}
export function renderCloudWorkshop({lang,user,local,remote,section,busy,go,cloudPanel,passport,selectPassport,loadPassport,profileData,saveProfile}){
 const t={...workshopCopy[lang],...extra[lang]},summary=workshopSummary(local,remote)
 const profile=profileData?.profile,progress=profileData?.progress,rank=progress?rankFor(progress.xp):null
 const layout=el('div','workshop-layout'),nav=el('nav','workshop-nav'),content=el('div','workshop-content')
 nav.setAttribute('aria-label',t.workshop)
 for(const [key,symbol] of sections){
  const b=button(t[key],()=>go(key),busy);b.prepend(icon(symbol));b.setAttribute('aria-pressed',String(section===key))
  if(section===key)b.setAttribute('aria-current','page')
  if(!implemented.has(key))b.title=t.pending
  nav.append(b)
 }
 content.append(el('h2','workshop-section-title',t[section]))
 if(section==='cloud')content.append(cloudPanel())
 else if(section==='workshop'){
  const hero=el('section','workshop-hero cover-'+(profile?.cover??'blueprint')),cover=el('div','workshop-cover'),emblem=el('div','workshop-emblem','BRICKLAB / WORKSHOP')
  emblem.prepend(icon('layers'));cover.append(emblem)
  const identity=el('div','workshop-hero-inner'),person=el('div','workshop-identity'),name=el('div')
  name.append(el('h2',null,user.displayName),el('p','account-muted',t.active))
  person.append(el('div','workshop-avatar',Array.from(user.displayName).slice(0,2).join('').toUpperCase()),name);identity.append(person)
  hero.append(cover,identity);if(profile?.bio)hero.append(el('p','workshop-bio',profile.bio));hero.append(metrics([[t.local,summary.local],[t.cloud,summary.cloud],[t.revisions,summary.revisions],[t.xp,progress?.xp??'—'],[t.title,rank?t[rank.id]:'—']]))
  const actions=card(t.welcome),quick=el('div','workshop-shortcuts')
  for(const key of ['cloud','passport','storage','security'])quick.append(button(t[key],()=>go(key),busy))
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
 }else if(section==='storage'){
  const c=card(t.storage);c.append(metrics([[t.local,summary.local],[t.cloud,summary.cloud],[t.revisions,summary.revisions]]),el('p',null,t.limits),el('p','account-muted',t.noBytes),el('p','account-muted',t.privateOnly));content.append(c)
 }else if(section==='settings'){
  const c=card(t.settings);c.append(el('p',null,t.displayName+': '+user.displayName),el('p',null,t.email+': '+user.email),el('p','account-muted',t.profileHint));if(profile){const form=el('form','workshop-form'),bio=el('textarea'),cover=el('select'),label=el('label','account-field'),label2=el('label','account-field');bio.maxLength=500;bio.value=profile.bio;bio.disabled=busy;cover.disabled=busy;for(const k of ['blueprint','graphite','amber']){const opt=el('option',null,t[k]);opt.value=k;cover.append(opt)}cover.value=profile.cover;label.append(el('span',null,t.bio),bio);label2.append(el('span',null,t.cover),cover);const submit=el('button','workspace-action primary',t.saveProfile);submit.type='submit';submit.disabled=busy;form.append(label,label2,submit);form.onsubmit=e=>{e.preventDefault();if(!busy)saveProfile({bio:bio.value,cover:cover.value})};c.append(form)}else c.append(el('p','account-muted',t.profileMissing));content.append(c)
 }else if(section==='security'){
  const c=card(t.security);c.append(el('p',null,t.email+': '+user.email),el('p','account-muted',t.securityText),el('p','account-muted',t.privateOnly));content.append(c)
 }else{const c=card(t[section]);c.append(el('p','account-muted',t.pending));content.append(c)}
 layout.append(nav,content);return layout
}
