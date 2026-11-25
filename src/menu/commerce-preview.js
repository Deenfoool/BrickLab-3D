import {commerceProducts,instructionTiers} from './commerce-catalog.js';
const node=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n};
const copy={
 ru:{title:'Новые возможности BrickLab',preview:'Предварительный каталог · продажи пока недоступны',note:'Новые товары появятся после завершения разработки и проверки оплаты. Ничего покупать сейчас не нужно.',overview:'Все',plus:'Plus',storage:'Проекты',badge:'Значки',themeBundle:'Коллекции',instruction:'Инструкции',project:'Дополнительные проекты',storageNote:'Разовое расширение количества облачных проектов и бюджета хранения.',badgeNote:'Коллекционный значок поддержки разработчика.',founder:'Планируется только на период ОБТ.',bundle:'Все шесть тем оформления мастерской.',plusNote:'40 дополнительных проектов, 128 МиБ, 40 версий на проект, значок Plus, одна тема на выбор и интерактивные инструкции на срок подписки.',instructionNote:'Официальный PDF остаётся доступным бесплатно. Платная возможность — подсветка деталей, артикулы и подбор в библиотеке одним нажатием. Во время ОБТ интерактивность остаётся бесплатной.',trial:'Планируемый пробный доступ: первые 10 шагов поддерживаемого набора.',price:'Планируемая цена',delivery:'Цифровые товары: после запуска покупок доступ будет привязан к аккаунту. Физическая доставка не предусмотрена.',requisites:'Реквизиты'},
 en:{title:'New BrickLab features',preview:'Preview catalog · not for sale yet',note:'New products will become available after development and payment verification. No purchase is required now.',overview:'All',plus:'Plus',storage:'Projects',badge:'Badges',themeBundle:'Collections',instruction:'Instructions',project:'Additional projects',storageNote:'One-time expansion of cloud project slots and storage budget.',badgeNote:'Collectible developer support badge.',founder:'Planned for the open beta only.',bundle:'All six workshop themes.',plusNote:'40 additional projects, 128 MiB, 40 versions per project, a Plus badge, a theme of your choice and interactive instructions for the subscription period.',instructionNote:'Official PDF viewing remains free. Paid access adds part highlights, part numbers and one-click library lookup. During open beta interactivity remains free.',trial:'Planned trial: first 10 steps of a supported set.',price:'Planned price',delivery:'Digital products: after launch, access will be linked to your account. No physical delivery.',requisites:'Seller details'}
};
export function mountCommercePreview(root,{language='ru'}={}){
 const ru=language==='ru',t=copy[language]??copy.ru;
 const money=n=>(n/100).toLocaleString(ru?'ru-RU':'en-US',{style:'currency',currency:'RUB',maximumFractionDigits:0});
 const panel=node('section','store-orders commerce-preview'),title=node('h2',null,t.title),notice=node('p','account-muted',t.preview),note=node('p','account-muted',t.note),nav=node('div','commerce-preview-nav'),grid=node('div','commerce-preview-grid');
 const categories=['overview','plus','storage','badge','themeBundle','instruction'];let selected='overview';
 const buttons=new Map();
 for(const c of categories){const b=node('button','workspace-action',t[c]);b.type='button';b.addEventListener('click',()=>{selected=c;render()});buttons.set(c,b);nav.append(b)}
 function card(name,description,price){const item=node('article','commerce-preview-card');item.append(node('h3',null,name),node('p','account-muted',description),node('small','account-muted',t.price),node('strong','store-price',price));return item}
 function render(){
  for(const [c,b] of buttons){b.setAttribute('aria-pressed',String(c===selected));b.classList.toggle('primary',c===selected)}
  grid.replaceChildren();
  for(const p of commerceProducts){const category=p.kind==='subscription'?'plus':p.kind;if(selected!=='overview'&&category!==selected)continue;
   let title=p.title,desc='';
   if(p.kind==='storage'){title=ru?p.title:'+'+p.slots+' projects';desc=t.storageNote+' +'+p.storageMiB+' MiB.'}
   if(p.kind==='badge')desc=t.badgeNote+(p.betaOnly?' '+t.founder:'');
   if(p.kind==='themeBundle')desc=t.bundle;
   if(p.kind==='subscription'){title='BrickLab Plus · '+p.months+(ru?' мес.':' mo.');desc=t.plusNote}
   grid.append(card(title,desc,money(p.priceKopecks)));
  }
  if(selected==='overview'||selected==='instruction'){
   const item=node('article','commerce-preview-card commerce-preview-instructions');
   item.append(node('h3',null,t.instruction),node('p','account-muted',t.instructionNote),node('p','account-muted',t.trial));
   let min=1;
   for(const [max,price] of instructionTiers){const row=node('div','commerce-preview-tier');row.append(node('span',null,max===Number.MAX_SAFE_INTEGER?(ru?'От ':'From ')+min: min+'–'+max),node('strong',null,money(price)));item.append(row);min=max+1}
   grid.append(item);
  }
 }
 const legal=node('a','workspace-action',t.requisites);legal.href='/requisites';legal.target='_blank';legal.rel='noopener';
 panel.append(title,notice,note,nav,grid,node('p','account-muted',t.delivery),legal);root.append(panel);render();
}
