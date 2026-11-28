// Public, server-rendered discovery pages. No user data or API calls.
export const siteOrigin = 'https://bricklab-3d.ru'
export const previewImage = siteOrigin+'/assets/examples/5-plus-r-gearbox.webp'
const pages = {
  '/editor': {
    title:'3D-конструктор LEGO онлайн — BrickLab 3D',
    heading:'Виртуальный 3D-конструктор LEGO и Technic',
    description:'Создавайте цифровые сборки из деталей Technic и System, соединяйте детали и изучайте работу механизмов в браузере.',
    intro:'BrickLab 3D — независимый браузерный редактор для любителей конструирования. Виртуальная мастерская позволяет создавать собственные модели и открывать готовые примеры без установки настольной программы.',
    sections:[
      ['Собирайте собственные модели','Выберите детали в библиотеке, разместите их на сцене и соедините с помощью привязок. Используйте перемещение, вращение, группировку, зеркальное дублирование и слои для работы со сложными сборками.'],
      ['Сохраняйте и развивайте конструкции','Проекты можно сохранять локально и экспортировать в формате BrickLab. Возможности облачного сохранения зависят от состояния аккаунта.'],
      ['От сборки к эксперименту','Перейдите к кинематике или тест-драйву, чтобы изучать поддерживаемые механические соединения. Проект развивается, поэтому не все конструкции и соединения воспроизводятся одинаково точно.']
    ], cta:'Открыть редактор',target:'/#projects'
  },
  '/instructions': {
    title:'Сборка LEGO по инструкциям онлайн — BrickLab 3D',
    heading:'Интерактивная сборка по инструкциям',
    description:'Каталог наборов, PDF-инструкции и подсказки с артикулами деталей для виртуальной сборки в BrickLab 3D.',
    intro:'Выберите доступный набор в каталоге и откройте его инструкцию в рабочей области BrickLab. Модель собирается на 3D-сцене, а страницы инструкции остаются рядом.',
    sections:[
      ['Инструкция рядом с моделью','Переключайте страницы PDF и подбирайте нужные детали в библиотеке. При доступном распознавании редактор показывает подсказки с артикулами и найденные позиции.'],
      ['Распознавание деталей','Движок сопоставляет изображения и подписи с каталогом деталей. Совпадения могут быть неполными: неоднозначные результаты следует проверять по описи набора.'],
      ['Выбор набора','В каталоге отображаются наборы с доступными источниками инструкций. Доступность конкретных инструкций и интерактивных функций может различаться.']
    ],cta:'Перейти к каталогу наборов',target:'/#sets'
  },
  '/parts': {
    title:'Библиотека деталей LEGO Technic и System — BrickLab 3D',
    heading:'Библиотека цифровых деталей',
    description:'Балки, оси, шестерни, штифты, колёса, кирпичики и другие детали Technic и System для 3D-сборки.',
    intro:'Библиотека BrickLab помогает подобрать детали для цифровых моделей по названию или артикулу. Геометрия поддерживаемых деталей основана на данных LDraw.',
    sections:[
      ['Technic','Подбирайте балки и рамы, оси, штифты, втулки, шестерни, колёса и элементы механических соединений.'],
      ['System','Используйте кирпичики, пластины, плитки, скосы и другие категории для оформления и структурных элементов конструкции.'],
      ['Поиск и совместимость','Ищите деталь по номеру или названию. Возможность механического соединения зависит от имеющегося профиля соединителей; наличие 3D-геометрии не гарантирует поддержку всех посадок.']
    ],cta:'Открыть библиотеку',target:'/#library'
  },
  '/mechanics': {
    title:'Кинематика LEGO Technic: шестерни, двигатели и тест-драйв — BrickLab 3D',
    heading:'Механика и кинематика конструкций Technic',
    description:'Изучайте передачу вращения, поршневые двигатели, рулевое управление и тестируйте цифровые модели на полигоне.',
    intro:'BrickLab развивает инструменты для изучения движения цифровых конструкций. Поддерживаемые механизмы можно исследовать на готовых примерах или в собственных сборках.',
    sections:[
      ['Передача вращения','Соосные валы и совместимые шестерни передают движение по графу соединений. Для поддерживаемых шкивов предусмотрен инструмент ременной передачи.'],
      ['Двигатели и рулевое управление','В примере 858 Inline Engine можно изучить движение поршней от коленчатого вала. В моделях с поддерживаемыми рулевыми тягами и амортизаторами можно исследовать их ход.'],
      ['Виртуальный полигон','Режим тест-драйва позволяет испытывать поддерживаемые транспортные модели. Расчёты и параметры симуляции приближённые и не заменяют инженерную проверку реальной конструкции.']
    ],cta:'Открыть примеры механизмов',target:'/#examples'
  }
}
export const publicSeoPaths = Object.freeze(['/',...Object.keys(pages)])
const escape = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c])
export function seoResponse(path) {
  if(path==='/robots.txt') return {type:'text/plain; charset=utf-8',body:'User-agent: *\nDisallow: /api/\nDisallow: /payment/\nSitemap: '+siteOrigin+'/sitemap.xml\n'}
  if(path==='/sitemap.xml') return {type:'application/xml; charset=utf-8',body:'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+publicSeoPaths.map(p=>'  <url><loc>'+siteOrigin+p+'</loc></url>').join('\n')+'\n</urlset>\n'}
  if(!Object.hasOwn(pages,path)) return null
  const p=pages[path],url=siteOrigin+path
  const labels={'/editor':'Редактор','/instructions':'Инструкции','/parts':'Детали','/mechanics':'Механика'}
  const navigation=Object.keys(pages).map(k=>'<a href="'+k+'"'+(k===path?' aria-current="page"':'')+'>'+escape(labels[k])+'</a>').join('')
  const schema=JSON.stringify({'@context':'https://schema.org','@type':'WebPage',name:p.heading,url,description:p.description,isPartOf:{'@type':'WebSite',name:'BrickLab 3D',url:siteOrigin+'/'}})
  const body='<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'+
    '<title>'+escape(p.title)+'</title><meta name="description" content="'+escape(p.description)+'"><link rel="canonical" href="'+url+'">'+
    '<link rel="icon" href="/assets/bricklab.svg" type="image/svg+xml"><link rel="stylesheet" href="/assets/seo.css">'+
    '<meta property="og:type" content="website"><meta property="og:site_name" content="BrickLab 3D"><meta property="og:locale" content="ru_RU"><meta property="og:title" content="'+escape(p.title)+'"><meta property="og:description" content="'+escape(p.description)+'"><meta property="og:url" content="'+url+'"><meta property="og:image" content="'+previewImage+'"><meta property="og:image:alt" content="Пример механизма BrickLab 3D"><meta name="twitter:card" content="summary_large_image">'+
    '<script type="application/ld+json">'+schema+'</script></head><body><header><a class="brand" href="/"><img src="/assets/bricklab.svg" width="36" height="36" alt="">BrickLab 3D</a><nav aria-label="Возможности">'+navigation+'</nav></header><main><p class="eyebrow">BRICKLAB / ВОЗМОЖНОСТИ</p><h1>'+escape(p.heading)+'</h1><p class="intro">'+escape(p.intro)+'</p><a class="cta" href="'+p.target+'">'+escape(p.cta)+'</a><div class="sections">'+p.sections.map(([h,t])=>'<section><h2>'+escape(h)+'</h2><p>'+escape(t)+'</p></section>').join('')+'</div><a href="/">На главную BrickLab</a></main><footer>BrickLab 3D — независимый проект, не связанный с LEGO Group.</footer></body></html>'
  return {type:'text/html; charset=utf-8',body}
}
