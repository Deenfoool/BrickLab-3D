export async function renderSeoAdmin({lang='ru',signal,fetcher=globalThis.fetch}={}){
 const en=lang==='en',el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n}
 const root=el('section','account-card'),grid=el('div','admin-metrics'),links=el('div','community-actions')
 root.append(el('h3',null,en?'Search discovery diagnostics':'SEO и поисковые системы'),el('p','account-muted',en?'Technical checks of public pages. Search impressions and traffic are available in the linked services after verification.':'Техническая диагностика публичных страниц. Показы, клики и посещения доступны в подключённых сервисах после подтверждения.'),grid)
 const get=async path=>{const r=await fetcher(path,{signal,credentials:'omit',cache:'no-store',redirect:'error'});if(!r.ok)throw Error(String(r.status));return r}
 const results=await Promise.allSettled([get('/robots.txt').then(r=>r.text()),get('/sitemap.xml').then(r=>r.text()),get('/').then(r=>r.text()),get('/editor').then(r=>r.text()),get('/assets/seo/og.jpg').then(r=>r.headers.get('content-type'))])
 if(signal.aborted)return root
 const value=i=>results[i].status==='fulfilled'?results[i].value:null
 const good=en?'Available':'Доступно',bad=en?'Not confirmed':'Не подтверждено'
 const status=(label,v)=>{const x=el('div','account-card');x.append(el('strong',null,String(v)),el('span','account-muted',label));grid.append(x)}
 status('robots.txt',value(0)?.includes('Sitemap:')?good:bad)
 let count=null
 if(value(1)){const xml=new DOMParser().parseFromString(value(1),'application/xml');if(!xml.querySelector('parsererror'))count=xml.getElementsByTagNameNS('*','loc').length}
 status(en?'URLs in sitemap':'Адресов в карте сайта',count??bad)
 const home=value(2)?new DOMParser().parseFromString(value(2),'text/html'):null
 status(en?'Yandex token':'Метатег Яндекса',home?.querySelector('meta[name="yandex-verification"]')?good:bad)
 status(en?'Google token':'Метатег Google',home?.querySelector('meta[name="google-site-verification"]')?good:bad)
 status('Open Graph',value(4)?.includes('image/jpeg')?good:bad)
 const page=value(3)?new DOMParser().parseFromString(value(3),'text/html'):null
 status(en?'Metrica configuration':'Настройка Метрики',page?.querySelector('meta[name="bricklab-metrika"]')?good:bad)
 for(const [label,href] of [['Яндекс Вебмастер','https://webmaster.yandex.ru/'],['Яндекс Метрика','https://metrika.yandex.ru/'],['Google Search Console','https://search.google.com/search-console'],['Sitemap','/sitemap.xml']]){
  const a=el('a','workspace-action',label);a.href=href;a.target='_blank';a.rel='noopener noreferrer';links.append(a)
 }
 root.append(links)
 return root
}
