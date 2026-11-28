// Only owner-provided verification tokens and explicit analytics configuration.
export function seoConfig(env={}){
 const token=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{6,160}$/.test(value)?value:''
 const counter=typeof env.BRICKLAB_METRIKA_ID==='string'&&/^\d{1,12}$/.test(env.BRICKLAB_METRIKA_ID)&&Number(env.BRICKLAB_METRIKA_ID)>0?env.BRICKLAB_METRIKA_ID:''
 return {yandex:token(env.BRICKLAB_YANDEX_VERIFICATION),google:token(env.BRICKLAB_GOOGLE_VERIFICATION),counter:env.BRICKLAB_METRIKA_ENABLED==='true'?counter:''}
}
export function decorateSeo(html,path,config={},banner=false){
 if(typeof html!=='string'||!html.includes('</head>'))return html
 const home=path==='/'||path==='/index.html'
 let meta=''
 if(home){
  if(config.yandex&&/^[A-Za-z0-9_-]{6,160}$/.test(config.yandex))meta+='<meta name="yandex-verification" content="'+config.yandex+'">'
  if(config.google&&/^[A-Za-z0-9_-]{6,160}$/.test(config.google))meta+='<meta name="google-site-verification" content="'+config.google+'">'
 }
 if(banner){
  html=html.replace(/(<meta property="og:image" content=")https:\/\/bricklab-3d\.ru\/assets\/examples\/5-plus-r-gearbox\.webp(")/g,'$1https://bricklab-3d.ru/assets/seo/og.jpg$2')
  meta+='<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:type" content="image/jpeg">'
 }
 // No analytics on private SPA routes, checkout, or user-generated build pages.
 if(config.counter&&/^\d{1,12}$/.test(config.counter)&&!home&&/^\/(?:editor|instructions|parts(?:\/[a-zA-Z0-9_-]+)?|sets(?:\/[\d-]+)?|mechanics|updates|learn(?:\/[a-z-]+)?|en)$/.test(path)){
  meta+='<meta name="bricklab-metrika" content="'+config.counter+'"><script defer src="/assets/seo-analytics.js"></script>'
 }
 return meta?html.replace('</head>',meta+'</head>'):html
}
