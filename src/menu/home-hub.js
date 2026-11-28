import {profileHref} from './profile-route.js'
import {applySignature,themeBadge} from './profile-signature.js?v=signature-1'
import {readPreference} from './preferences.js?v=full-settings'
import {sanitizePreview,isLargePreview} from './public-preview.js?v=large-viewer-1'
const words={
ru:{popular:'Популярное в сообществе',recent:'Новые публикации',following:'От авторов, на которых ты подписан',feature:'Конструкция недели',all:'Все публикации',empty:'Пока нет опубликованных конструкций.',noFollowing:'Новых работ от твоих подписок пока нет.',unavailable:'Сообщество временно недоступно.',loading:'Загрузка…',parts:'дет.',likes:'лайков',featureHint:'Подборка из популярных работ за последние семь дней.',newTitle:'Что нового',history:'История обновлений',changelog:'История обновлений BrickLab',close:'Закрыть',search:'Найти в BrickLab',hint:'Детали, наборы, сборки и авторы',local:'Мои сборки',cloud:'Облачные сборки',library:'Детали',sets:'Наборы',models:'Сообщество',authors:'Авторы',none:'Ничего не найдено',more:'Все результаты',searching:'Поиск…',error:'Некоторые источники недоступны.',keys:'↑ ↓ — выбор · Enter — открыть · Esc — закрыть',communityUpdate:'Новый просмотрщик, публикации, обложки и управление разрешениями.',previousUpdate:'Единая галерея локальных и облачных сборок, обновлённый профиль и верхняя навигация.'},
en:{popular:'Popular in the community',recent:'New publications',following:'From builders you follow',feature:'Build of the week',all:'All publications',empty:'No published builds yet.',noFollowing:'No recent builds from your follows.',unavailable:'Community temporarily unavailable.',loading:'Loading…',parts:'parts',likes:'likes',featureHint:'A selection from popular builds published within the last seven days.',newTitle:'What’s new',history:'Release history',changelog:'BrickLab release history',close:'Close',search:'Search BrickLab',hint:'Parts, sets, builds and builders',local:'My builds',cloud:'Cloud builds',library:'Parts',sets:'Sets',models:'Community',authors:'Builders',none:'No results',more:'All results',searching:'Searching…',error:'Some sources are unavailable.',keys:'↑ ↓ — select · Enter — open · Esc — close',communityUpdate:'New viewer, publishing, covers and access permissions.',previousUpdate:'Unified local and cloud gallery, improved profile and top navigation.'}}
// Release dates refer to source commits or merged pull requests, not production deployments.
const releaseHistory=[
 ["2026-11-28","commit/62598dcff12c4400746d182dfd31ad10ccbe36d4","Smart Highlight и распознавание инструкций V7","Контурная подсветка деталей, восстановление подписей и OCR, поиск описи в других томах и более строгая проверка похожих деталей.","Smart Highlight and instruction recognition V7","Part silhouettes, caption and OCR recovery, inventory lookup across volumes and stricter matching of similar parts."],
 ["2026-11-28","commit/f0f52c8b660a9ee5cb537a062fd6a9240825ac6e","Фирменная шапка и статус Plus","Редкий золотистый блик на кнопке проекта и компактный статус Plus с остатком дней и датой окончания подписки по данным серверного профиля.","Brand header and Plus status","An occasional gold sweep on the project button and a compact Plus status with remaining days and expiry from the server profile."],
 ["2026-11-28","commit/f534f839eade287f2462c318b1c95bf71ac3b477","Компактная навигация BrickLab","Документы собраны в одном меню, ссылки на GitHub, портфолио и историю доступны из шапки. Прямые ссылки на донат убраны, поддержка остаётся в магазине.","Compact BrickLab navigation","Legal documents are grouped in one menu; GitHub, portfolio and release history are available from the header. Direct donation links are removed; support stays in the store."],
 ["2026-11-28","commit/8941c07811c65fb0ef7bad0340c5e6015bb06a73","Витрины мастерской и BrickLab Motion","Карточки сборок заполняют виджеты, а оригинальные медали показывают названия и сведения в зависимости от доступного пространства. Добавлены плавные появления, подсветки, реакции и переходы в интерфейсе сайта без декоративной нагрузки на 3D-редактор.","Workshop showcases and BrickLab Motion","Build cards fill their widgets, and original achievement medals adapt their names and details to available space. Viewport reveals, highlights, reaction feedback and interface transitions improve the site without adding decorative motion to the CAD editor."],
 ["2026-11-28","commit/2f62cbb517d16a50ee14f9d8ee848b10b0b0a510","Контроль выпуска интерактивных инструкций","Проверка всех томов и страниц перед продажей, защита от обхода идентификаторов и независимый доступ к уже приобретённым подсказкам. Непроверенные наборы остаются бесплатными.","Interactive instruction release controls","Reviewed volume and page evidence, identifier access checks and purchased hint access independent of payment readiness. Unreviewed sets stay free."],
 ["2026-11-28","commit/5288e4083ac387ab49ca9c3759dea12231c5a156","Финансовый журнал и экспорт","Подготовлен журнал административных операций, отдельный CSV оплат и возвратов, усилены проверки налоговой корректировки. Боевые продажи не включены.","Financial audit and export","Administrator operation journal, separate payment and refund CSV, and stricter fiscal correction checks. Live sales remain disabled."],
 ["2026-11-28","commit/61d069fdaaf082e48bec677dee0c672f9a3c0e0c","Безопасный запуск магазина","Добавлены закрытый режим и контрольные покупки администратора, исправлена сверка боевых возвратов. Публичные продажи требуют отдельного включения.","Safe storefront launch","Added closed and administrator-only pilot checkout modes, and fixed live refund reconciliation. Public sales require separate activation."],
 ["2026-11-28","commit/0e6870a4ce0526561c0c3edf80441562673dd109","Workshop Live — редактирование мастерской на странице","Шестерёнка на обложке включает режим живых виджетов: перенос с призраком, восемь направлений размера, видимость, блокировка, отмена и шаблоны. Показатели стали виджетом, витрина использует оригинальные медали с деталями и датами выбранных наград. Компоновка сохраняется отдельно от данных профиля.","Workshop Live — direct profile editing","The cover gear opens live widgets with drag ghosts, eight resize handles, visibility, locking, undo and templates. Metrics become a widget and the showcase uses original medals with details and selected award dates. Layout saves independently of profile identity."],
 ["2026-11-27","commit/fa083d33d145baa399a6226a71a5be3f2c4e6ea6","Конструктор компоновки мастерской","Добавлен визуальный редактор на 12 колонок: перетаскивание, изменение ширины, каталог блоков, четыре шаблона и предпросмотр телефона. Раскладка сохраняется отдельно от данных и публичности профиля.","Workshop layout studio","A visual twelve-column editor adds drag and resize, a widget catalog, four templates and phone previews. Layout is saved separately from profile identity and visibility."],
 ["2026-11-27","commit/a447518af6e5ba7529608a4115b0f7789c428fdd","Новые настройки мастерской","Профиль без лишних кнопок, восемь вкладок настроек, перетаскивание показателей, блоков и наград за маркер. Подготовлено скрытие мастерской без удаления публикаций.","Workshop settings redesign","A cleaner profile, eight settings tabs, drag handles for statistics, blocks and awards, and non-destructive workshop visibility."],
 ["2026-11-27","commit/71c937017d57245626c68339ee8501ec10ceb176","Единый профиль BrickLab Hub","Telegram получает оформление личной мастерской, аватар и обложку через авторизованные запросы, значки поддержки, тему и тот же статус Plus. Тестовые покупки администратора помечаются отдельно.","Unified BrickLab Hub profile","Telegram uses the private workshop appearance, authenticated avatar and cover requests, support badges, theme and the same Plus status. Administrator sandbox purchases are explicitly marked."],
 ["2026-11-27","pull/46","BrickLab Hub и Control OS","Подготовлены личный кабинет Telegram, привязка аккаунта, достижения и рейтинг, промокоды на дни Plus и рассылки по согласию. Администратор получает отдельные инструменты тестирования и обслуживания VPS.","BrickLab Hub and Control OS","Telegram account linking, achievements and rankings, Plus-day promo codes and opt-in campaigns are prepared, with separate administrator testing and VPS maintenance tools."],
 ["2026-11-27","commit/0d356b001021505ed3370e21fe4ecb7aecfcd5c9","Настраиваемая статистика мастерской","Лайки, сборки, подписчики, XP, титул и место в рейтинге заменяют старые показатели. Порядок и состав карточек сохраняются в аккаунте; посетители видят только публичные данные.","Custom workshop statistics","Likes, builds, followers, XP, title and global placement replace old metrics. Card order and selection are saved to the account; visitors see public data only."],
 ["2026-11-27","commit/bafcb5699e963cead896456d08b2834012a42f5d","Публичная мастерская с момента регистрации","Новые аккаунты сразу получают публичную мастерскую с открытым XP и достижениями. Адрес использует логин, старые ссылки сохраняются, приватные проекты не публикуются.","Public workshop on registration","New accounts receive a public workshop with visible XP and achievements. Links use usernames, legacy URLs remain supported, and private projects stay private."],
 ["2026-11-27","commit/fea91b5a6ef7ab8e882d45d90e3fd1f8af0cc49c","Инженерная лаборатория и конструктор наград","Подготовлены серверные кинематические проверки сохранённых ревизий, практические задания Академии, рейтинг XP с добровольной публичностью, шесть оформлений за достижения и создание правил через админ-панель. Проверки не являются физической сертификацией.","Engineering lab and achievement designer","Server-side kinematic checks of saved revisions, practical Academy exercises, an opt-in XP leaderboard, six earned appearances and admin-defined rules are prepared. Checks are not physical certification."],
 ["2026-11-27","commit/29f3cda13ffd22d916bd625acd1e3652a1a62078","Зал достижений и прогресс","Подготовлены 60 наград, из них 44 получают данные от сервера: облачные модели, активность и сообщество. Уровни, редкость, фильтры и витрина; особые награды выдаются после ручной проверки, баги подтверждает администратор.","Achievement hall and progression","60 awards are defined; 44 use server records for cloud models, activity and community. Levels, rarity, filters and showcases are prepared; special awards require manual review, and bug reports require administrator confirmation."],
 ["2026-11-26","commit/90a97f90d2528ecb80d96d737548c48672a8f5d0","Контекстное меню и многостраничные инструкции","Исправлен перехват правой кнопки мыши в редакторе. Новые инструкции автоматически разбиваются на этапы по соединениям деталей; число страниц видно до экспорта.","Context menu and multi-page instructions","Editor right-click handling is corrected. New instructions are automatically split into connector-aware steps, with page counts shown before export."],
 ["2026-11-26","pull/43","Студия инструкций и инструменты редактора","Добавлены редактируемые этапы, экспериментальные траектории установки, PDF, Smart Connect, поиск команд, обновлённые меню и плавное совместное редактирование. Пути установки остаются приближёнными.","Instruction Studio and editor tools","Editable steps, experimental installation paths, PDF export, Smart Connect, command search, refreshed menus and smoother collaboration. Installation paths remain approximate."],
 ["2026-11-26","pull/42","Совместная сборка","Экспериментальные комнаты по коду приглашения: участники, курсоры и согласование изменений. Комнаты временные, до 8 участников и 2000 деталей.","Collaborative building","Experimental invite-code rooms with participant cursors and change merging. Temporary rooms support up to eight participants and 2,000 parts."],
 ["2026-11-26","pull/42","Photo Studio в реальном времени","Фотостудия перенесена в меню проекта; настройка кадра работает в живом 3D-просмотре.","Live Photo Studio","Photo Studio moves into the project menu with live 3D framing controls."],
 ["2026-11-26","pull/42","Управление сценой и панелями","Независимые правые панели располагаются друг над другом. Скорость анимации регулируется от 0,1× до 5×.","Scene and panel controls","Right-side panels stack independently. Animation speed ranges from 0.1× to 5×."],
 ["2026-11-26","pull/41","Инженерный анализ","Структурный и кинематический анализ, карта передачи вращения, поиск проблем импорта и приблизительная оценка скорости и момента. Это инструменты оценки, а не точный физический расчёт.","Engineering inspection","Structural and kinematic inspection, transmission map, import issue locator and approximate speed and torque estimates, not exact physical calculations."],
 ["2026-11-26","pull/41","Инструкции нового поколения","Движок распознавания PDF обновлён до V5. Обновлены каталог, рекомендации и отдельная коллекция инструкций.","Next-generation instructions","PDF recognition advances to V5, with a refreshed catalog, recommendations and instruction collection."],
 ["2026-11-26","pull/40","Новый облик магазина","BrickLab Plus, облачное хранилище, инструкции и шесть знаков поддержки получили собственное оформление и согласованные предпросмотры.","Store visual refresh","BrickLab Plus, cloud storage, instructions and six supporter insignia receive distinct artwork and consistent previews."],
 ["2026-11-26","pull/39","История заказов и чеков","Подготовлены понятные номера заказов, история чеков и доставка чеков по электронной почте. Это подготовка инфраструктуры, а не запуск реальных платежей.","Order and receipt history","Clear order numbers, receipt history and email receipt delivery are prepared; this does not launch live payments."],
 ["2026-11-25","pull/36","BrickLab Plus и защищённые инструкции","Подготовлены выбор темы Plus, срок подписки и проверка прав доступа к аннотациям инструкций. Платёжный сценарий пока тестовый.","BrickLab Plus and protected instructions","Plus theme selection, subscription expiry and access checks for instruction annotations are prepared. Checkout remains in testing."],
 ["2026-11-25","pull/35","Облачные лимиты и коллекции","Управление лимитами сборок и ревизий, выбор знака поддержки и принадлежащих аккаунту тем. Существующие проекты остаются доступными для чтения при снижении лимита.","Cloud quotas and collections","Cloud project and revision quotas, supporter badge selection and owned themes; existing projects remain readable after a downgrade."],
 ["2026-11-25","pull/32","Catalog Engine","Единый механизм сопоставления артикулов, номеров элементов и идентификаторов LDraw для библиотеки, наборов и сохранённых сборок; подготовлено ежедневное обновление справочника.","Catalog Engine","A shared resolver matches part numbers, element IDs and LDraw identifiers across the library, sets and saved builds, with a daily catalog refresh prepared."],
 ["2026-11-25","pull/31","Workspace 2.1","Компактная шапка редактора, меню проекта, индикатор сохранения, контекстные инструменты, закрепляемые панели и чистый режим просмотра.","Workspace 2.1","A compact editor header, project menu, save indicator, contextual tools, docked panels and clean viewing mode."],
 ["2026-11-25","pull/30","Центр управления BrickLab","Подготовлен закрытый Telegram-центр для мониторинга, резервных копий, уведомлений и диагностики проекта.","BrickLab Control Center","A private Telegram operations center is prepared for monitoring, backups, alerts and project diagnostics."],
 ["2026-11-25","pull/29","Единый профиль и портфолио","Мастерская и публичный профиль получили единую структуру, настраиваемые блоки портфолио, избранную работу и постоянную ссылку. Публичность настроек контролирует владелец.","Unified profile and portfolio","The workshop and public profile share a layout, configurable portfolio blocks, a featured build and stable links. Owners control public visibility."],
 ["2026-11-25","pull/27","Полноэкранная мастерская","Широкая шапка профиля, закреплённая навигация, недавние сборки, достижения и публичные работы.","Fullscreen Workshop","A full-width profile hero, sticky navigation, recent builds, achievements and public works."],
 ["2026-11-25","pull/25","Signature Collection","Шесть оформлений профиля получили собственные иллюстрации обложек, рамки аватаров и согласованные предпросмотры в магазине.","Signature Collection","Six profile themes gain original illustrated covers, avatar frames and consistent storefront previews."],
 ["2026-11-25","pull/23","Магазин BrickLab","Добавлены каталог товаров, история заказов и изолированный тестовый сценарий оплаты. Реальные покупки этим обновлением не включались.","BrickLab Store","A product catalog, order history and isolated test checkout are introduced. This update did not enable live purchases."],
 ["2026-11-24","pull/22","Community 2.0","Закладки, жалобы, теги, уровень сложности, обложки и управление разрешениями на скачивание и комментарии.","Community 2.0","Bookmarks, reports, tags, difficulty, covers and download and comment permissions."],
 ["2026-11-24","pull/21","Публикации из редактора","Сборку можно подготовить к публикации прямо в редакторе. Страница модели получила интерактивный 3D-просмотр, описание, автора, комментарии и связанные работы.","Publish from the editor","Prepare builds for publication directly in the editor. Model details gain an interactive 3D viewer, description, author, comments and related builds."],
 ["2026-11-24","pull/19","Cloud Workspace","Единая галерея объединяет локальные и облачные сборки, сохраняет локальные копии и лениво загружает облачные предпросмотры.","Cloud Workspace","A unified gallery brings local and cloud builds together, preserves local copies and lazily loads cloud previews."],
 ["2026-11-24","pull/16","Открытая бета и каталог наборов","Запросы к Rebrickable перенесены на сервер: пользователь больше не вводит собственный API-ключ. Улучшены обработка ограничений запросов и очистка 3D-просмотра.","Public beta and set catalog","Rebrickable requests move to the server so users no longer enter their own API key. Rate-limit handling and 3D viewer cleanup are improved."],
 ["2026-11-24","commit/feb13276720319b7554afb16ea1599f771deb532","Облачные сохранения","Добавлен закрытый API проектов с проверкой владельца и обработкой конфликтов ревизий при сохранении.","Cloud saves","A private project API introduces ownership checks and revision conflict handling."],
 ["2026-11-23","commit/fb8dc069cd98d88f5d92cceb6f4ac5ba8fd98cc1","Обучение работе в редакторе","Подсказки при первом использовании продвинутых инструментов и обновлённые материалы обучения.","Editor onboarding","First-use tips for advanced tools and updated tutorial assets."],
 ["2026-11-20","commit/7f6de99f48881f89bd91c8f7ba607fd59956a7d2","Фирменная загрузка BrickLab","Логотип и название на экране запуска собираются из цифровых деталей LDraw.","BrickLab startup branding","The startup logo and wordmark assemble from digital LDraw parts."],
 ["2026-11-20","commit/e757e0bf8800397b4cea5deea8ba58c8b544cda2","Распознавание деталей в PDF","Улучшено извлечение подтверждённых совпадений деталей из отдельных изображений внутри PDF-инструкций.","PDF part recognition","Recognition improves verified part matching from standalone images embedded in PDF instructions."],
 ["2026-11-19","commit/e7f7da79b379677887084c187317189024fddd3c","Зеркальное дублирование","При размещении копии можно отражать её по осям X, Y и Z сочетаниями Ctrl+X, Ctrl+Y и Ctrl+Z.","Mirror duplicates","Mirror floating duplicates along X, Y and Z using Ctrl+X, Ctrl+Y and Ctrl+Z."],
 ["2026-11-18","commit/0ca3f79cbc9dd8a71c9cf6593675c646bec6cd7e","Переключение передач","Улучшена работа рычагов переключения и включение передач после отпускания перемещаемой детали.","Gear shifting","Shift-link handling and gear engagement after releasing a dragged part are improved."],
 ["2026-11-18","commit/e40c519e7eb0ba290bb9c2608ff0ff6b15051666","Библиотека Technic","В главном меню появился отдельный раздел для просмотра деталей Technic.","Technic library","A browsable Technic parts library is added to the main menu."],
 ["2026-11-17","commit/1814ccb04110a59e85cbdbe2a0f5ab89fb876dbf","Работающие поршневые двигатели","Коленчатый вал передаёт движение поршням и механизму газораспределения.","Working piston engines","The crankshaft drives pistons and valve gear."],
 ["2026-11-17","commit/c913ebc46deef7859e1638d66688d9819c5fd211","Полигон Sketchbook","Добавлена отдельная площадка для тест-драйва собранных транспортных моделей.","Sketchbook playground","A dedicated playground is added for test-driving assembled vehicles."],
 ["2026-09-09","pull/9","Механика со звуком","Звуковая система для сборки и симуляции: звуки соединений, шестерён, двигателя и шин, настройки громкости.","Mechanical audio","Building and simulation gain connection, gear, motor and tyre sounds, plus volume controls."]
]
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const node=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n}
const link=(label,href,cls='hub-link')=>{const n=node('a',cls,label);n.href=href;return n}
const button=(label,fn,cls='workspace-action')=>{const b=node('button',cls,label);b.type='button';b.onclick=fn;return b}
const matching=(text,q)=>String(text??'').toLowerCase().replaceAll('ё','е').includes(q.toLowerCase().replaceAll('ё','е'))
async function get(path,signal){const r=await fetch(path,{signal,credentials:'same-origin',cache:'no-store',redirect:'error'});if(!r.ok)throw Object.assign(Error('request failed'),{status:r.status});return r.json()}
export function chooseHubBuilds(popular,recent,now=Date.now(),weekly=popular){
 const valid=items=>Array.isArray(items)?[...new Map(items.filter(b=>b&&uuid.test(b.id)&&typeof b.title==='string').map(b=>[b.id,b])).values()]:[]
 const top=valid(popular),fresh=valid(recent),week=valid(weekly).filter(b=>{const date=Date.parse(b.publishedAt);return Number.isFinite(date)&&date<=now&&date>=now-7*86400000})
 const popularItems=top.slice(0,3),used=new Set(popularItems.map(b=>b.id))
 const feature=week.find(b=>!used.has(b.id))??null
 if(feature)used.add(feature.id)
 const recentItems=fresh.filter(b=>!used.has(b.id)).slice(0,3)
 return {feature,popular:popularItems,recent:recentItems}
}
function buildCard(b,t,feature=false,previewQueue){
 const a=link('', '#community/build/'+b.id,'hub-build'+(feature?' hub-feature-build':''))
 const art=node('div','hub-build-art')
 if(b.imageCount>0){const img=node('img');img.alt='';img.loading='lazy';img.src='/api/community/build/'+b.id+'/image/0';img.onerror=()=>{img.remove();art.classList.add('hub-build-placeholder')};art.append(img)}else{art.classList.add('hub-build-placeholder');previewQueue?.observe(art,b)}
 const body=node('div','hub-build-body');body.append(node('strong',null,b.title),node('span','hub-muted',String(b.author??'')),node('span','hub-build-meta',String(b.partCount??0)+' '+t.parts+' · ♥ '+String(b.likes??0)))
 if(feature&&b.description)body.append(node('p','hub-description',b.description))
 const badge=themeBadge(b.authorTheme);if(badge)body.append(badge);applySignature(a,b.authorTheme);a.append(art,body);return a
}
function shelf(title,t){const section=node('section','hub-shelf'),head=node('div','home-section-head'),grid=node('div','hub-build-grid');head.append(node('h2',null,title),link(t.all,'#community'));section.append(head,grid);return {section,grid}}
// A bounded, serial queue avoids opening a WebGL context for every public card.
function createHubPreviewQueue(signal){
 const jobs=new Map(),urls=new Set()
 let chain=Promise.resolve(),scheduled=0
 const observer=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting){observer.unobserve(e.target);const b=jobs.get(e.target);jobs.delete(e.target);if(!b||scheduled>=6)continue;scheduled++;chain=chain.catch(()=>{}).then(async()=>{
   if(signal.aborted||!e.target.isConnected)return
   let renderer
   try{
     const safe=sanitizePreview(await get('/api/community/build/'+b.id+'/preview',signal),{strict:true})
     if(!safe||isLargePreview(safe)||signal.aborted)return
     const {createProjectPreviewRenderer}=await import('../editor/project-preview.js?v=contact-shadow')
     if(signal.aborted)return
     renderer=createProjectPreviewRenderer()
     const blob=await renderer.render(safe,signal)
     if(!blob||signal.aborted||!e.target.isConnected)return
     const url=URL.createObjectURL(blob);urls.add(url);const img=node('img');img.alt='';img.src=url;e.target.classList.remove('hub-build-placeholder');e.target.append(img)
   }catch{}finally{renderer?.dispose()}
 })}}, {rootMargin:'80px'}):null
 signal.addEventListener('abort',()=>{observer?.disconnect();jobs.clear();for(const url of urls)URL.revokeObjectURL(url);urls.clear()},{once:true})
 return {observe(art,b){if(observer&&readPreference('previews')!=='off'&&b.partCount>0&&b.partCount<=600){jobs.set(art,b);observer.observe(art)}}}
}
export function openReleaseHistory(language){
 const t=words[language]??words.ru
 const dialog=node('dialog','hub-history'),title=node('h2',null,t.changelog);dialog.setAttribute('aria-label',t.changelog)
 const locale=language==='en'?'en':'ru',dateFormat=new Intl.DateTimeFormat(locale,{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'})
 const entryTitle=e=>e[locale==='en'?4:2],entryText=e=>e[locale==='en'?5:3]
 const closeHistory=()=>dialog.close()
 dialog.append(title,node('p','hub-muted',locale==='en'?'Dates indicate source commits or merged changes, not necessarily deployment.':'Даты соответствуют коммитам и объединённым изменениям, а не обязательно публикации на сайте.'),button(t.close,closeHistory))
 for(const entry of releaseHistory){
  const article=node('article','hub-info-card'),date=node('time','hub-muted',dateFormat.format(new Date(entry[0]+'T00:00:00Z')))
  date.dateTime=entry[0]
  const source=link('GitHub','https://github.com/Deenfoool/BrickLab-3D/'+entry[1]);source.target='_blank';source.rel='noopener noreferrer'
  article.append(date,node('h3',null,entryTitle(entry)),node('p',null,entryText(entry)),source);dialog.append(article)
 }
 dialog.append(button(t.close,closeHistory))
 dialog.addEventListener('close',()=>dialog.remove(),{once:true})
 document.body.append(dialog);dialog.showModal()
 return dialog
}
export async function mountHomeHub(root,{language,signal}){
 const t=words[language]??words.ru,previewQueue=createHubPreviewQueue(signal)
 const popular=shelf(t.popular,t),recent=shelf(t.recent,t),following=shelf(t.following,t),feature=shelf(t.feature,t)
 feature.section.hidden=true;following.section.hidden=true;popular.grid.append(node('p','hub-muted',t.loading))
 const end=node('div','hub-bottom'),news=node('section','hub-info-card')
 const entryTitle=e=>e[language==='en'?4:2],entryText=e=>e[language==='en'?5:3]
 const history=button(t.history+' ›',()=>openReleaseHistory(language),'hub-link')
 news.append(node('h2',null,t.newTitle),node('strong',null,entryTitle(releaseHistory[0])),node('p','hub-muted',entryText(releaseHistory[0])),history)
 end.append(news)
 root.replaceChildren(popular.section,feature.section,recent.section,following.section,end)
 signal.addEventListener('abort',()=>{root.replaceChildren()},{once:true})
 const fill=(grid,items,empty)=>{grid.replaceChildren(...items.map(b=>buildCard(b,t,false,previewQueue)));if(!items.length)grid.append(node('p','hub-muted',empty))}
 const result=await Promise.allSettled([get('/api/community/builds?sort=popular',signal),get('/api/community/builds?sort=recent',signal),get('/api/community/builds?feed=following&sort=recent',signal),get('/api/community/builds?sort=popular&week=1',signal)])
 if(signal.aborted)return
 const top=result[0].status==='fulfilled'?result[0].value.builds:[],fresh=result[1].status==='fulfilled'?result[1].value.builds:[]
 const selection=chooseHubBuilds(top,fresh,Date.now(),result[3].status==='fulfilled'?result[3].value.builds:[])
 fill(popular.grid,selection.popular,result[0].status==='fulfilled'?t.empty:t.unavailable)
 fill(recent.grid,selection.recent,result[1].status==='fulfilled'?t.empty:t.unavailable);recent.section.hidden=result[1].status==='fulfilled'&&selection.recent.length===0&&selection.popular.length>0
 if(selection.feature){feature.section.hidden=false;feature.grid.classList.add('hub-feature-grid');feature.grid.append(buildCard(selection.feature,t,true,previewQueue));feature.grid.append(node('p','hub-muted',t.featureHint))}
 if(result[2].status==='fulfilled'){following.section.hidden=false;fill(following.grid,(result[2].value.builds??[]).filter(b=>uuid.test(b.id)).slice(0,3),t.noFollowing)}
}
export function mountHubSearch({language,getProjects,getCloud,openLocal,openCloud,goLibrary,goSets}){
 const t=words[language]??words.ru,dialog=node('dialog','hub-search-dialog'),input=node('input'),results=node('div','hub-search-results'),notice=node('p','hub-muted',t.hint)
 dialog.setAttribute('aria-label',t.search);input.type='search';input.maxLength=100;input.placeholder=t.search;input.setAttribute('aria-label',t.search);notice.setAttribute('role','status')
 const header=node('div','hub-search-head');header.append(input,button('Esc',()=>dialog.close()));dialog.append(header,notice,results,node('p','hub-muted',t.keys));document.body.append(dialog)
 let request,timer,serial=0,selected=-1,entries=[]
 function reset(){request?.abort();clearTimeout(timer);serial++;selected=-1;entries=[];results.replaceChildren()}
 function group(title,items){if(!items.length)return;results.append(node('h3',null,title));for(const item of items){const b=button(item.label,()=>{dialog.close();void item.open()},'hub-search-result');b.setAttribute('aria-label',item.label);results.append(b);entries.push(b)}}
 function move(delta){if(!entries.length)return;selected=selected<0?(delta>0?0:entries.length-1):(selected+delta+entries.length)%entries.length;entries.forEach((b,i)=>b.classList.toggle('active',i===selected));entries[selected].scrollIntoView({block:'nearest'})}
 async function search(q,generation){
  const controller=new AbortController();request=controller;const {signal}=controller
  const local=getProjects(),cloud=getCloud();group(t.local,local.filter(p=>matching(p.document.name,q)).slice(0,5).map(p=>({label:p.document.name,open:()=>openLocal(p.id)})))
  group(t.cloud,cloud.remote.filter(p=>matching(p.name,q)&&!local.some(r=>r.cloud?.id===p.id&&r.cloud?.ownerId===cloud.ownerId)).slice(0,5).map(p=>({label:p.name,open:()=>openCloud(p.id,cloud.ownerId)})))
  const tasks=await Promise.allSettled([import('../editor/parts-data.js?v=system-complete'),get('/api/community/builds?'+new URLSearchParams({q,sort:'popular'}),signal),get('/api/rebrickable/lego/sets/?'+new URLSearchParams({search:q,page_size:'5'}),signal),get('/api/community?'+new URLSearchParams({q}),signal)])
  if(signal.aborted||generation!==serial||!dialog.open)return
  if(tasks[0].status==='fulfilled'){const matches=Object.values(tasks[0].value.parts).filter(p=>[p.design,p.ru,p.en,...(p.aliases??[])].some(v=>matching(v,q))).sort((a,b)=>Number(b.design===q)-Number(a.design===q)).slice(0,6);group(t.library,matches.map(p=>({label:p[language]+' · '+p.design,open:()=>goLibrary(p.design)})))}
  if(tasks[1].status==='fulfilled')group(t.models,(tasks[1].value.builds??[]).filter(b=>uuid.test(b.id)).slice(0,5).map(b=>({label:b.title+' · '+b.author,open:()=>{location.hash='#community/build/'+b.id}})))
  if(tasks[2].status==='fulfilled')group(t.sets,(tasks[2].value.results??[]).filter(s=>typeof s.set_num==='string').slice(0,5).map(s=>({label:s.name+' · '+s.set_num,open:()=>goSets(s.set_num)})))
  if(tasks[3].status==='fulfilled')group(t.authors,(tasks[3].value.profiles??[]).filter(p=>uuid.test(p.id)&&matching(p.displayName,q)).slice(0,5).map(p=>({label:p.displayName,open:()=>{location.hash=profileHref(p.username,p.id)}})))
  group(t.more,[{label:t.library+' — '+q,open:()=>goLibrary(q)},{label:t.sets+' — '+q,open:()=>goSets(q)}])
  notice.textContent=tasks.some(r=>r.status==='rejected')?t.error:entries.length>2?'':t.none
 }
 input.oninput=()=>{reset();const q=input.value.trim();notice.textContent=q?t.searching:t.hint;if(q.length)timer=setTimeout(()=>search(q,serial),350)}
 dialog.addEventListener('keydown',e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();move(e.key==='ArrowDown'?1:-1)}else if(e.key==='Enter'&&e.target===input&&entries.length){e.preventDefault();entries[Math.max(0,selected)].click()}})
 dialog.addEventListener('close',reset)
 return {open(){if(dialog.open)return;input.value='';notice.textContent=t.hint;dialog.showModal();input.focus()},dispose(){reset();if(dialog.open)dialog.close();dialog.remove()}}
}
