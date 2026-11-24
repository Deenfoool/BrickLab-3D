import { createAccountState } from './account-state.js?v=workshop-1'
import { createWorkshop, workshopSections } from './workshop.js?v=workshop-1'

const copy = {
  ru: {
    signIn:'Войти', signUp:'Регистрация', account:'Личный кабинет', demo:'ДЕМО ИНТЕРФЕЙСА',
    hero:'Твоя мастерская. Где угодно.', intro:'Сборки, история изменений и настройки доступа в одном месте.',
    notice:'Это прототип облачного интерфейса. Вход условный, данные не отправляются на сервер. Демо-снимки исчезнут при выходе или перезагрузке.',
    email:'Электронная почта', password:'Пароль', name:'Имя пользователя', fakePassword:'Поле отключено в демо',
    authHelp:'Настоящие пароли здесь не вводятся. Используется тестовый профиль.',
    enter:'Войти в демо', register:'Создать демо-профиль', local:'Продолжить без аккаунта',
    cloud:'Облачные сборки', profile:'Профиль', logout:'Выйти из демо', subtitle:'Управляй моделями, версиями и доступом.',
    localBuilds:'Локальные сборки', choose:'Выбери сборку', empty:'Пока нет локальных или демо-сборок.', create:'Создать сборку',
    save:'Сохранить демо-версию', saved:'Версия сохранена в памяти этой страницы.', unchanged:'Изменений в модели нет.',
    limit:'Достигнут лимит демо-снимков (16 МБ / 20 версий на сборку / 30 сборок).',
    forbidden:'В режиме наблюдателя сохранение недоступно.', signed_out:'Сначала войди в демо.',
    selectFirst:'Выбери сборку слева, чтобы увидеть версии и настройки доступа.', noSnapshot:'Ещё нет сохранённых версий. Создай первый демо-снимок локальной сборки.',
    visibility:'Видимость', access:'Доступ к сборке', private:'Приватная', unlisted:'По ссылке', public:'Публичная',
    privateHint:'Только владелец и приглашённые участники.', unlistedHint:'Доступ по ссылке после подключения сервера.', publicHint:'Будет видна в сообществе после подключения сервера.',
    role:'Проверка роли (демо)', owner:'Владелец', editor:'Редактор', viewer:'Наблюдатель', roleHelp:'Меняй роль для проверки дизайна ограничений. Это не настоящая авторизация.',
    history:'История версий', revision:'Версия', download:'Скачать', restore:'Открыть копию', historyHelp:'Открытие версии создаёт новую локальную сборку и не перезаписывает оригинал.',
    localOnly:'Только локально', snapshot:'Демо-снимок', versions:'Версий', parts:'Деталей', latest:'Последнее сохранение',
    noLocal:'Локальная сборка удалена; сохранённые демо-версии доступны до выхода.',
    confirmLogout:'Выйти из демо? Все временные снимки будут удалены. Локальные сборки останутся.',
    accountHint:'Тестовый аккаунт', storage:'Хранение', storageHint:'Демо-снимки в памяти вкладки', security:'Безопасность', securityHint:'Подтверждение почты и управление сессиями появятся на сервере.',
    allLocal:'Все сборки', noHistory:'Нет версий', demoStatus:'Облако не подключено',
  },
  en: {
    signIn:'Sign in', signUp:'Register', account:'Account', demo:'INTERFACE PREVIEW',
    hero:'Your workshop. Anywhere.', intro:'Builds, revision history and access settings in one place.',
    notice:'This is a cloud interface prototype. Sign-in is simulated, no data is sent to a server. Demo snapshots disappear on sign-out or reload.',
    email:'Email', password:'Password', name:'Display name', fakePassword:'Disabled in preview',
    authHelp:'Do not enter real passwords here. A sample profile is used.',
    enter:'Enter preview', register:'Create demo profile', local:'Continue without an account',
    cloud:'Cloud builds', profile:'Profile', logout:'Exit preview', subtitle:'Manage models, revisions and access.',
    localBuilds:'Local builds', choose:'Choose a build', empty:'No local or demo builds yet.', create:'Create a build',
    save:'Save demo revision', saved:'Revision saved in this page’s memory.', unchanged:'The model has not changed.',
    limit:'Demo snapshot limit reached (16 MB / 20 revisions per build / 30 builds).',
    forbidden:'Viewers cannot save revisions.', signed_out:'Enter the preview first.',
    selectFirst:'Choose a build to see its revisions and access settings.', noSnapshot:'No saved revisions yet. Create a demo snapshot of your local build.',
    visibility:'Visibility', access:'Build access', private:'Private', unlisted:'Unlisted', public:'Public',
    privateHint:'Only the owner and invited members.', unlistedHint:'Link access once the server is connected.', publicHint:'Visible in the community once the server is connected.',
    role:'Simulate role (preview)', owner:'Owner', editor:'Editor', viewer:'Viewer', roleHelp:'Switch roles to preview permissions. This is not real authorization.',
    history:'Revision history', revision:'Revision', download:'Download', restore:'Open a copy', historyHelp:'Opening a revision creates a new local build without overwriting the original.',
    localOnly:'Local only', snapshot:'Demo snapshot', versions:'Revisions', parts:'Parts', latest:'Last saved',
    noLocal:'The local build was removed; demo revisions remain available until sign-out.',
    confirmLogout:'Exit the preview? Temporary snapshots will be deleted. Local builds will remain.',
    accountHint:'Sample account', storage:'Storage', storageHint:'Demo snapshots in tab memory', security:'Security', securityHint:'Email verification and session management will be added on the server.',
    allLocal:'All builds', noHistory:'No revisions', demoStatus:'Cloud not connected',
  }
}
function node(tag, cls, value) {
  const el = document.createElement(tag)
  if (cls) el.className = cls
  if (value !== undefined) el.textContent = value
  return el
}
function icon(id) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  const use = document.createElementNS(svg.namespaceURI, 'use')
  svg.setAttribute('class', 'icon'); svg.setAttribute('aria-hidden', 'true')
  use.setAttribute('href', '#' + id); svg.append(use); return svg
}
function button(text, fn, primary = false) {
  const el = node('button', 'workspace-action' + (primary ? ' primary' : ''), text)
  el.type = 'button'; el.addEventListener('click', fn); return el
}
function link(text, href) { const el = node('a','workspace-action',text); el.href = href; return el }
function field(label, control) { const el = node('label','account-field'); el.append(node('span',null,label),control); return el }
function sample(type, value, placeholder) {
  const el = node('input'); el.type = type; el.value = value; el.placeholder = placeholder || ''; el.readOnly = true; el.autocomplete = 'off'; return el
}
function select(items, value, t, change, disabled = false) {
  const el = node('select')
  for (const item of items) { const option = node('option',null,t[item]); option.value = item; el.append(option) }
  el.value = value; el.disabled = disabled; el.addEventListener('change', () => change(el.value)); return el
}
export function createAccountPreview({ root, link: accountLink, getProjects, download, openCopy }) {
  const state = createAccountState()
  let language = 'ru', mode = 'login', tab = 'workshop', selected = null, status = '', filter = 'allBuilds'
  const workshop = createWorkshop({state,getProjects,download,openCopy,render,
    go(key){tab=key;render()},chooseProject(id){selected=id;tab='cloud';filter='allBuilds';status='';render()}})
  const t = () => copy[language]
  const date = value => new Intl.DateTimeFormat(language, { dateStyle:'medium', timeStyle:'short' }).format(new Date(value))
  function updateLabel() {
    const label = accountLink.querySelector('[data-account-label]')
    label.textContent = state.profile ? t().account : t().signIn
    accountLink.title = label.textContent
    accountLink.setAttribute('aria-label', label.textContent)
  }
  function action(text, fn, primary) { return button(text, fn, primary) }
  function notice() { const n = node('p','account-notice',t().notice); n.prepend(icon('icon-cloud')); return n }
  function renderAuth() {
    const s = t()
    const panel = node('div','account-auth')
    const hero = node('div','account-auth-hero')
    const brand = node('div','account-brand'); brand.append(icon('layers'),node('span',null,'BRICKLAB CLOUD'))
    hero.append(brand,node('h2',null,s.hero),node('p',null,s.intro))
    const art = node('img','account-hero-art'); art.src = new URL('../../assets/examples/5-plus-r-gearbox.webp',import.meta.url).href; art.alt = ''
    hero.append(art)
    const form = node('form','account-auth-form')
    const tabs = node('div','account-tabs')
    for (const [key,label] of [['login',s.signIn],['register',s.signUp]]) {
      const b = action(label,()=>{ mode=key; render() }); b.setAttribute('aria-pressed',String(mode===key)); tabs.append(b)
    }
    form.append(tabs,node('h2',null,mode==='login'?s.signIn:s.signUp),node('p','account-muted',s.authHelp))
    if (mode==='register') form.append(field(s.name,sample('text','Demo Builder')))
    form.append(field(s.email,sample('email','builder@example.invalid')),field(s.password,sample('password','',s.fakePassword)))
    const submit = node('button','workspace-action primary',mode==='login'?s.enter:s.register); submit.type='submit'
    form.append(submit,link(s.local,'#home'))
    form.addEventListener('submit',event=>{event.preventDefault(); state.signIn(); tab=selected?'cloud':'workshop'; render()})
    panel.append(hero,form); root.append(notice(),panel)
  }
  function renderProfile() {
    const s = t(), card=node('div','account-card account-profile')
    const avatar=node('div','account-avatar','DB')
    card.append(avatar,node('h2',null,state.profile.displayName),node('p','account-muted',state.profile.email))
    for (const [label,value] of [[s.storage,s.storageHint],[s.security,s.securityHint]]) {
      const row=node('div','account-profile-row');row.append(node('strong',null,label),node('p','account-muted',value));card.append(row)
    }
    root.append(card)
  }
  function renderCloud(target) {
    const s=t(), local=getProjects()
    const byId=new Map(local.map(p=>[p.id,p]))
    const ids=[...new Set([...byId.keys(),...state.list().map(p=>p.id)])].filter(id=>{const p=state.get(id);return filter==='allBuilds'||(filter==='localOnly'&&byId.has(id))||(filter==='cloudOnly'&&p&&!p.trashed)||(filter==='publishedOnly'&&p&&!p.trashed&&p.visibility==='public')})
    if (!ids.includes(selected)) selected=ids[0]??null
    const layout=node('div','account-workspace'), list=node('aside','account-card account-build-list'), detail=node('div','account-detail')
    list.append(node('h2',null,workshop.label('cloud')))
    const filters=select(['allBuilds','localOnly','cloudOnly','publishedOnly'],filter,Object.fromEntries(['allBuilds','localOnly','cloudOnly','publishedOnly'].map(k=>[k,workshop.label(k)])),value=>{filter=value;status='';render()})
    list.append(filters)
    if (!ids.length) list.append(node('p','account-muted',s.empty),link(s.create,'#projects'))
    for (const id of ids) {
      const p=state.get(id), record=byId.get(id)
      const doc=record?.document??state.document(id,p?.revisions.at(-1)?.revision)
      if (!doc) continue
      const b=node('button','account-build');b.type='button';b.setAttribute('aria-pressed',String(id===selected))
      const label=node('div','account-build-label')
      label.append(node('strong',null,doc.name),node('small',null,p&&!p.trashed?s.snapshot+' · '+p.revisions.length+' '+s.versions.toLowerCase():s.localOnly))
      b.append(icon(p?'icon-cloud':'folder'),label);b.onclick=()=>{selected=id;status='';render()};list.append(b)
    }
    if (!selected) {
      const blank=node('div','account-card account-blank');blank.append(icon('icon-cloud'),node('p',null,s.selectFirst));detail.append(blank)
    } else {
      const record=byId.get(selected), p=state.get(selected), doc=record?.document??state.document(selected,p?.revisions.at(-1)?.revision)
      const card=node('div','account-card')
      const head=node('div','account-detail-head')
      const title=node('div');title.append(node('p','account-eyebrow',p?s.snapshot:s.localOnly),node('h2',null,doc?.name??s.choose))
      const save=action(s.save,()=>{status=state.save(record);if(status==='saved')workshop.addEvent('savedEvent',record.document.name);render()},true);save.disabled=!record||p?.role==='viewer'||Boolean(p?.trashed)
      head.append(title,save);card.append(head)
      const sync=p?.trashed?'syncMissing':!p?'syncLocal':!record?'syncMissing':p.revisions.at(-1).serialized===JSON.stringify(record.document)?'syncSaved':'syncChanged'
      card.append(node('p','account-muted',workshop.label('sync')+': '+workshop.label(sync)))
      if(p?.trashed)card.append(action(workshop.label('restore'),()=>{state.restore(selected);render()}))
      else if(p?.role==='owner')card.append(action(workshop.label('trashAction'),()=>{state.moveToTrash(selected);status='';render()}))
      if(!record)card.append(node('p','account-muted',s.noLocal))
      const stats=node('div','account-stats')
      for(const [label,val] of [[s.parts,doc?.parts?.length??0],[s.versions,p?.revisions.length??0],[s.latest,p?date(p.revisions.at(-1).savedAt):'—']]){
        const item=node('div');item.append(node('small',null,label),node('strong',null,String(val)));stats.append(item)
      }
      card.append(stats)
      if(status){const msg=node('p','account-result',s[status]??status);msg.setAttribute('role','status');card.append(msg)}
      detail.append(card)
      const access=node('section','account-card');access.append(node('h2',null,s.access))
      if(p&&!p.trashed){
        access.append(field(s.visibility,select(['private','unlisted','public'],p.visibility,s,value=>{if(state.setVisibility(selected,value))workshop.addEvent('visibilityEvent',doc.name);render()},p.role!=='owner')),
          node('p','account-muted',s[p.visibility+'Hint']),
          field(s.role,select(['owner','editor','viewer'],p.role,s,value=>{state.simulateRole(selected,value);status='';render()})),
          node('p','account-muted',s.roleHelp))
      }else access.append(node('p','account-muted',s.noSnapshot))
      detail.append(access)
      if(p&&!p.trashed)detail.append(workshop.accessMembers(p,render))
      if(doc)detail.append(workshop.renderBuildPassport(doc,p?.revisions.length??0))
      const history=node('section','account-card');history.append(node('h2',null,s.history),node('p','account-muted',s.historyHelp))
      if(!p||p.trashed)history.append(node('p','account-empty',s.noHistory))
      else for(const revision of [...p.revisions].reverse()){
        const row=node('div','account-revision'),info=node('div');info.append(node('strong',null,s.revision+' '+revision.revision),node('small',null,date(revision.savedAt)))
        const actions=node('div','account-revision-actions'),id=selected,n=revision.revision
        actions.append(action(s.download,()=>download(state.document(id,n))),action(s.restore,()=>openCopy(state.document(id,n))))
        row.append(icon('file'),info,actions);history.append(row)
      }
      detail.append(history)
    }
    layout.append(list,detail);target.append(layout)
  }
  function render() {
    updateLabel();root.replaceChildren()
    if(!state.profile){renderAuth();return}
    const s=t(), header=node('div','account-dashboard-head')
    const info=node('div','account-identity'),avatar=node('div','account-avatar',workshop.profile.avatar)
    const name=node('div');name.append(node('h2',null,workshop.profile.displayName),node('p','account-muted',s.accountHint))
    info.append(avatar,name)
    const exit=action(s.logout,()=>{if(confirm(s.confirmLogout)){state.signOut();workshop.reset();selected=null;filter='allBuilds';status='';tab='workshop';render()}})
    header.append(info,exit)
    const layout=node('div','workshop-layout'),nav=node('nav','workshop-nav'),content=node('div','workshop-content')
    nav.setAttribute('aria-label',workshop.label('workshop'))
    for(const [key,symbol] of workshopSections){
      const control=action(workshop.label(key),()=>{tab=key;render()})
      control.prepend(icon(symbol));control.setAttribute('aria-pressed',String(tab===key))
      if(tab===key)control.setAttribute('aria-current','page')
      if(key==='notifications'&&workshop.unread)control.append(node('small','workshop-unread',String(workshop.unread)))
      nav.append(control)
    }
    const sectionTitle=node('h2','workshop-section-title',workshop.label(tab))
    content.append(sectionTitle)
    if(tab==='cloud')renderCloud(content);else workshop.mount(content,tab)
    layout.append(nav,content);root.append(notice(),header,layout)
  }
  return {
    selectProject(id){selected=id;tab='cloud';filter='allBuilds';status=''},
    update(lang,visible){language=lang==='en'?'en':'ru';workshop.setLanguage(language);updateLabel();if(visible)render()},
  }
}
