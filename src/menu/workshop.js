import { ranks, rankFor, skills, badges, challenges, modelPassport, challengeReadiness, workshopProgress } from './workshop-model.js?v=workshop-1'
import { workshopCopy } from './workshop-copy.js?v=workshop-1'
import { readTutorial } from './tutorial-state.js?v=onboarding-v1'

export const workshopSections=[
  ['workshop','icon-home'],['cloud','folder'],['passport','icon-account'],['achievements','icon-trophy'],
  ['challenges','icon-flask'],['rankings','icon-trophy'],['publicProfile','icon-account'],['diary','book'],
  ['bureau','icon-account'],['favorites','icon-heart'],['notifications','icon-bell'],
  ['storage','icon-cloud'],['settings','settings'],['security','icon-shield']
]
function node(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e}
function icon(id){const s=document.createElementNS('http://www.w3.org/2000/svg','svg'),u=document.createElementNS(s.namespaceURI,'use');s.setAttribute('class','icon');s.setAttribute('aria-hidden','true');u.setAttribute('href','#'+id);s.append(u);return s}
function btn(text,action,primary=false){const b=node('button','workspace-action'+(primary?' primary':''),text);b.type='button';b.onclick=action;return b}
function card(title){const c=node('section','account-card workshop-card');if(title)c.append(node('h2',null,title));return c}
function field(title,input){const l=node('label','account-field');l.append(node('span',null,title),input);return l}
function input(value,max=80){const el=node('input');el.type='text';el.value=value;el.maxLength=max;return el}
function select(options,selected,label){const el=node('select');for(const v of options){const opt=node('option',null,label(v));opt.value=v;el.append(opt)}el.value=selected;return el}
function bar(value){const b=node('div','workshop-bar'),fill=node('span');fill.style.width=(Math.max(0,Math.min(1,value))*100)+'%';b.append(fill);return b}
function metric(title,value,description){const c=node('div','workshop-metric');c.append(node('span',null,title),node('strong',null,String(value)));if(description)c.append(node('small',null,description));return c}
function tag(text,kind='neutral'){return node('span','workshop-tag '+kind,text)}
function avatar(profile){return node('div','workshop-avatar',profile.avatar)}
export function createWorkshop({state,getProjects,go,chooseProject,render,openCopy,download}){
  const initial=()=>({displayName:'Demo Builder',nickname:'demo-builder',bio:'',avatar:'DB',cover:'blueprint',visibility:'private',title:'defaultTitle',showcase:[],notifications:true})
  let profile=initial(), events=[], favorites=new Set(), team='', language='ru', range='week', ranking='allRanks', challengeId='gearbox', challengeProject='', checked=null
  let result='', settingsResult=''
  const tr=()=>workshopCopy[language]
  const progress=()=>workshopProgress(readTutorial().completed)
  const date=v=>new Intl.DateTimeFormat(language,{dateStyle:'medium',timeStyle:'short'}).format(new Date(v))
  const records=()=>getProjects()
  function addEvent(type,detail=''){events.unshift({type,detail,at:new Date().toISOString(),read:false});events=events.slice(0,100)}
  function reset(){profile=initial();events=[];favorites=new Set();team='';range='week';ranking='allRanks';challengeId='gearbox';challengeProject='';checked=null;result='';settingsResult=''}
  function sectionLink(title,tab){return btn(title,()=>go(tab))}
  function buildSelect(selected,change){const list=records(),el=select(['',...list.map(r=>r.id)],selected,id=>list.find(r=>r.id===id)?.document.name??tr().select);el.onchange=()=>change(el.value);return el}
  function cards(root,items){const grid=node('div','workshop-grid');grid.append(...items);root.append(grid)}
  function profileHero(publicView=false){
    const t=tr(),p=progress(),rank=rankFor(p.xp)
    const hero=node('section','workshop-hero cover-'+profile.cover),banner=node('div','workshop-cover')
    const emblem=node('div','workshop-emblem');emblem.append(icon('layers'),node('span',null,'BRICKLAB / WORKSHOP'))
    banner.append(emblem,tag(t.demo))
    const inner=node('div','workshop-hero-inner'),identity=node('div','workshop-identity'),text=node('div')
    text.append(node('h2',null,profile.displayName),node('p','account-muted','@'+profile.nickname),tag(t[profile.title==='defaultTitle'?rank.id:profile.title]??t[rank.id],'gold'))
    identity.append(avatar(profile),text)
    const info=node('div','workshop-hero-actions')
    info.append(btn(publicView?t.edit:t.publicProfile,()=>go(publicView?'settings':'publicProfile')))
    inner.append(identity,info)
    const bio=node('p','workshop-bio',profile.bio||t.noBio)
    const counts=node('div','workshop-metric-grid')
    counts.append(metric(t.local,records().length),metric(t.published,state.list().filter(p=>p.visibility==='public').length),metric(t.xp,p.xp),metric(t.rep,p.rep))
    hero.append(banner,inner,bio,counts)
    if(publicView)hero.append(node('p','account-muted workshop-public-note',t.publicPreview))
    return hero
  }
  function experience(){
    const t=tr(),p=progress(),r=rankFor(p.xp),c=card(t.xp)
    const head=node('div','workshop-between');head.append(node('strong','workshop-big',p.xp+' XP'),tag(t[r.id],'gold'))
    c.append(head,node('p','account-muted',t.xpHelp),bar(r.progress),node('small','account-muted',r.next?t.next+': '+t[r.next]+' · '+p.xp+' / '+r.target+' XP':t.maxRank))
    return c
  }
  function reputation(){const t=tr(),c=card(t.rep);c.append(node('strong','workshop-big','0 REP'),node('p','account-muted',t.repHelp),sectionLink(t.rankings,'rankings'));return c}
  function showcase(){
    const t=tr(),c=card(t.portfolio),items=records().filter(r=>profile.showcase.includes(r.id)),g=node('div','workshop-showcase-grid')
    if(!items.length)c.append(node('p','account-muted',t.noBuilds))
    for(const r of items){const tile=node('button','workshop-build-tile');tile.type='button';const graphic=node('div','workshop-build-graphic');graphic.append(icon('layers'));tile.append(graphic,node('strong',null,r.document.name),node('small','account-muted',modelPassport(r.document).parts+' · '+t.parts));tile.onclick=()=>chooseProject(r.id);g.append(tile)}
    c.append(g,btn(t.pickShowcase,()=>go('settings')));return c
  }
  function dashboard(root){
    const t=tr();root.append(profileHero());cards(root,[experience(),reputation()]);const quick=card(t.welcome)
    quick.append(node('p','account-muted',t.welcomeSub))
    const list=node('div','workshop-shortcuts')
    for(const k of ['cloud','passport','achievements','challenges','diary','storage'])list.append(sectionLink(t[k],k))
    quick.append(list);root.append(quick,showcase())
    const policy=card(t.rep);policy.append(node('p','account-muted',t.donationNote));root.append(policy)
  }
  function skillCard(){
    const t=tr(),p=progress(),c=card(t.specializations)
    c.append(node('p','account-muted',t.skillsHelp))
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 320 240');svg.setAttribute('class','workshop-radar');svg.setAttribute('aria-hidden','true')
    const pt=(i,scale)=>[160+82*scale*Math.cos(i*Math.PI/3-Math.PI/2),120+82*scale*Math.sin(i*Math.PI/3-Math.PI/2)]
    const shape=(values,cls)=>{const e=document.createElementNS(svg.namespaceURI,'polygon');e.setAttribute('points',values.map((v,i)=>pt(i,v).join(',')).join(' '));e.setAttribute('class',cls);svg.append(e)}
    for(const factor of [.25,.5,.75,1])shape(skills.map(()=>factor),'radar-grid')
    shape(skills.map(k=>Math.min(1,p.skills[k]/3)),'radar-value')
    for(let i=0;i<skills.length;i++){const end=pt(i,1),l=document.createElementNS(svg.namespaceURI,'line');l.setAttribute('x1','160');l.setAttribute('y1','120');l.setAttribute('x2',end[0]);l.setAttribute('y2',end[1]);l.setAttribute('class','radar-grid');svg.prepend(l);const pos=pt(i,1.19),n=document.createElementNS(svg.namespaceURI,'text');n.setAttribute('x',pos[0]);n.setAttribute('y',pos[1]+3);n.setAttribute('text-anchor','middle');n.textContent=String(i+1);svg.append(n)}
    c.append(svg)
    skills.forEach((key,i)=>{const row=node('div','workshop-skill');row.append(node('span',null,(i+1)+'. '+t[key]),bar(p.skills[key]/3),node('small','account-muted',String(p.skills[key])));c.append(row)})
    return c
  }
  function passport(root){
    const t=tr(),p=progress(),c=card(t.rankList)
    for(const [id,xp] of ranks){const row=node('div','workshop-between workshop-rank-row');row.append(node('span',null,t[id]),tag(xp+' XP',p.xp>=xp?'gold':'neutral'));c.append(row)}
    cards(root,[skillCard(),experience()]);root.append(c)
  }
  function achievements(root){
    const t=tr(),p=progress(),g=node('div','workshop-badges')
    for(const b of badges){const unlocked=p.unlocked.includes(b.id),c=node('article','workshop-badge rarity-'+b.rarity+(unlocked?' earned':'')),medal=node('div','workshop-medal');medal.append(icon(b.icon));c.append(medal,tag(t[b.rarity]),node('strong',null,t[b.id==='bureau'?'bureauBadge':b.id]),node('p','account-muted',t[b.id+'Desc']),node('small',null,unlocked?t.earned:t.locked));g.append(c)}
    root.append(g)
  }
  function renderBuildPassport(doc,revisionCount=0){
    const t=tr(),p=modelPassport(doc),c=card(t.buildPassport),g=node('div','workshop-metric-grid')
    for(const [key,v] of [['parts',p.parts],['connections',p.connections],['gearsCount',p.gears],['belts',p.belts],['revisions',revisionCount]])g.append(metric(t[key],v))
    c.append(g)
    for(const [key,value,kind] of [['structure',p.structure?t.valid:t.invalid,p.structure?'good':'bad'],['kinematics',t.unverified,'neutral'],['physicsTest',t.unverified,'neutral'],['drive',p.driveConfigured?t.configured:t.notConfigured,'neutral']]){
      const row=node('div','workshop-between workshop-rank-row');row.append(node('span',null,t[key]),tag(value,kind));c.append(row)
    }
    c.append(node('p','account-muted',t.unverifiedHint),node('p','account-muted',t.noCertificate));return c
  }
  function renderChallenges(root){
    const t=tr(),grid=node('div','workshop-grid')
    for(const ch of challenges){const c=card(t[ch.id]);c.append(tag('+'+ch.xp+' XP','gold'),node('p','account-muted',t[ch.id+'Desc']),btn(t.check,()=>{challengeId=ch.id;checked=null;render()},ch.id===challengeId));grid.append(c)}
    root.append(grid)
    const ch=challenges.find(c=>c.id===challengeId),c=card(t[ch.id])
    const picker=buildSelect(challengeProject,id=>{challengeProject=id;checked=null;render()})
    c.append(field(t.select,picker),btn(t.check,()=>{checked=challengeReadiness(ch,records().find(r=>r.id===challengeProject)?.document);render()},true))
    if(checked){c.append(tag(checked.ready?t.ready:t.notReady,checked.ready?'good':'bad'));for(const reason of checked.reasons)c.append(node('p','account-muted',t[reason]))}
    c.append(node('p','account-muted',t.noAward));root.append(c)
  }
  function rankingsPage(root){
    const t=tr(),c=card(t.rankings),filters=node('div','workshop-shortcuts')
    for(const [options,current,change] of [[['week','month','all','season'],range,v=>{range=v;render()}],[['allRanks','transportRank','mechanicsRank','helpfulRank'],ranking,v=>{ranking=v;render()}]]){const el=select(options,current,v=>t[v]);el.onchange=()=>change(el.value);filters.append(el)}
    c.append(filters,node('p','workshop-empty',t.leaderboardEmpty),node('p','account-muted',t.seasonHint),node('p','account-muted',t.donationNote));root.append(c)
  }
  function bureauPage(root){
    const t=tr(),c=card(t.bureau);c.append(node('p','account-muted',t.teamHint))
    if(team)c.append(node('strong','workshop-big',team),btn(t.leaveTeam,()=>{team='';render()}))
    else{const form=node('form','workshop-form'),name=input('',60);name.required=true;form.append(field(t.teamName,name));const submit=node('button','workspace-action primary',t.createTeam);submit.type='submit';form.append(submit);form.onsubmit=e=>{e.preventDefault();if(!name.value.trim())return;team=name.value.trim();addEvent('teamEvent',team);render()};c.append(form)}
    root.append(c)
  }
  function favoritesPage(root){
    const t=tr(),c=card(t.favorites);c.append(node('p','account-muted',t.favoriteHint))
    for(const r of records()){const row=node('div','workshop-between workshop-rank-row');row.append(node('span',null,r.document.name),btn(favorites.has(r.id)?t.removeFavorite:t.addFavorite,()=>{if(favorites.has(r.id))favorites.delete(r.id);else favorites.add(r.id);render()}));c.append(row)}
    if(!records().length)c.append(node('p','account-muted',t.noFavorites));root.append(c)
  }
  function activity(root,diary=false){
    const t=tr(),c=card(t[diary?'diary':'notifications'])
    if(!diary)c.append(btn(t.markRead,()=>{events.forEach(e=>e.read=true);render()}))
    const shown=diary?events:profile.notifications?events:[]
    if(!shown.length)c.append(node('p','account-muted',t[diary?'diaryEmpty':'noNotifications']))
    for(const e of shown){const row=node('div','workshop-event'),detail=node('div');detail.append(node('strong',null,t[e.type]||e.type),node('p','account-muted',e.detail),node('small','account-muted',date(e.at)));row.append(icon(diary?'book':'icon-bell'),detail);if(!diary&&!e.read)row.append(tag(t.unread,'gold'));c.append(row)}
    root.append(c)
    if(diary){const l=card(t.lineage);l.append(node('p','account-muted',t.lineageHint));root.append(l)}
  }
  function storage(root){
    const t=tr(),c=card(t.storage),used=state.usage(),g=node('div','workshop-metric-grid')
    g.append(metric(t.usage,(used.bytes/1048576).toFixed(2)+' / 16 MB'),metric(t.snapshots,used.projects),metric(t.revisions,used.revisions));c.append(g,bar(used.bytes/(16*1048576)),node('p','account-muted',t.trashHint))
    const trash=card(t.trash)
    for(const p of state.trash()){const doc=state.document(p.id,p.revisions.at(-1).revision),row=node('div','workshop-between workshop-rank-row');row.append(node('span',null,doc?.name||p.id),btn(t.restore,()=>{state.restore(p.id);render()}));trash.append(row)}
    if(!state.trash().length)trash.append(node('p','account-muted',t.emptyTrash))
    root.append(c,trash)
  }
  function settings(root){
    const t=tr(),c=card(t.settings),form=node('form','workshop-form')
    const name=input(profile.displayName),nick=input(profile.nickname,32),bio=node('textarea'),av=input(profile.avatar,4)
    name.required=true;nick.required=true;nick.pattern='[a-zA-Z0-9_-]{3,32}';bio.value=profile.bio;bio.maxLength=500;bio.rows=3;av.required=true
    const cover=select(['graphite','blueprint','amber'],profile.cover,v=>t[v])
    const privacy=select(['private','unlisted','public'],profile.visibility,v=>t[v])
    const titles=['defaultTitle',...ranks.filter(([,xp])=>progress().xp>=xp).map(([id])=>id)],title=select(titles,profile.title,v=>t[v])
    const notifications=node('input');notifications.type='checkbox';notifications.checked=profile.notifications
    const choose=node('fieldset','workshop-fieldset');choose.append(node('legend',null,t.pickShowcase+' · '+t.showcaseLimit))
    const boxes=[]
    for(const r of records()){const el=node('input');el.type='checkbox';el.checked=profile.showcase.includes(r.id);el.value=r.id;const l=node('label','workshop-check');l.append(el,node('span',null,r.document.name));choose.append(l);boxes.push(el);el.onchange=()=>{if(boxes.filter(b=>b.checked).length>3)el.checked=false}}
    const notify=node('label','workshop-check');notify.append(notifications,node('span',null,t.notificationsSetting))
    form.append(field(t.displayName,name),field(t.nickname,nick),field(t.bio,bio),field(t.avatar,av),field(t.changeCover,cover),field(t.profileVisibility,privacy),field(t.badgeTitle,title),choose,notify)
    const submit=node('button','workspace-action primary',t.saveProfile);submit.type='submit';form.append(submit)
    form.onsubmit=e=>{e.preventDefault();if(!name.value.trim()||!av.value.trim())return;profile={...profile,displayName:name.value.trim(),nickname:nick.value.trim(),bio:bio.value.trim(),avatar:av.value.trim(),cover:cover.value,visibility:privacy.value,title:title.value,showcase:boxes.filter(b=>b.checked).slice(0,3).map(b=>b.value),notifications:notifications.checked};addEvent('profileEvent');settingsResult='profileSaved';render()}
    c.append(form);if(settingsResult)c.append(node('p','account-result',t[settingsResult]));root.append(c)
    const follows=card(t.follow);follows.append(node('p','account-muted',t.followHint));root.append(follows)
  }
  function security(root){
    const t=tr(),c=card(t.security);c.append(node('p','account-muted',t.securityNote))
    for(const k of ['email','password','verifyEmail','resetPassword','sessions','twoFactor']){const row=node('div','workshop-between workshop-rank-row');row.append(node('span',null,t[k]),tag(k==='email'?'builder@example.invalid':t.serverRequired));c.append(row)}
    root.append(c)
  }
  function publicProfile(root){const t=tr();root.append(profileHero(true),showcase(),skillCard());const c=card(t.publicProfile);c.append(node('p','account-muted',t.profileLinkHint),btn(t.copyProfile,async()=>{try{await navigator.clipboard.writeText(new URL('#account',location.href).href);result='copied'}catch{result='copyFailed'}render()}));if(result)c.append(node('p','account-result',t[result]));root.append(c)}
  function accessMembers(project,rerender){
    const t=tr(),c=card(t.invite),members=project.members||[]
    c.append(node('p','account-muted',t.inviteHint))
    for(const m of members){const row=node('div','workshop-between workshop-rank-row');const role=select(['editor','viewer'],m.role,v=>t[v]);role.disabled=project.role!=='owner';role.onchange=()=>{state.member(project.id,m.name,role.value);rerender()};const remove=btn(t.remove,()=>{state.member(project.id,m.name,null);rerender()});remove.disabled=project.role!=='owner';row.append(node('span',null,m.name),role,remove);c.append(row)}
    if(!members.length)c.append(node('p','account-muted',t.noMembers))
    const form=node('form','workshop-form'),name=input('',60),role=select(['editor','viewer'],'viewer',v=>t[v]);name.required=true;name.disabled=role.disabled=project.role!=='owner';form.append(field(t.memberName,name),field(t.member,role));const add=node('button','workspace-action',t.addMember);add.type='submit';add.disabled=project.role!=='owner';form.append(add);form.onsubmit=e=>{e.preventDefault();state.member(project.id,name.value.trim(),role.value);rerender()};c.append(form);return c
  }
  return {
    reset,addEvent,renderBuildPassport,accessMembers, get profile(){return profile}, get unread(){return profile.notifications?events.filter(e=>!e.read).length:0},
    setLanguage(lang){language=lang==='en'?'en':'ru'},
    label(key){return tr()[key]||key},
    mount(root,tab){
      const handlers={workshop:dashboard,passport,achievements,challenges:renderChallenges,rankings:rankingsPage,bureau:bureauPage,favorites:favoritesPage,notifications:r=>activity(r),diary:r=>activity(r,true),storage,settings,security,publicProfile}
      ;(handlers[tab]||dashboard)(root)
    }
  }
}
