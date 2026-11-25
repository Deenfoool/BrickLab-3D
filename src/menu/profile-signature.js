import {themeFor} from './store-themes.js?v=signature-1'
const details={
 carbon:{mark:'GT / PERFORMANCE',symbol:'◈',ru:'Приборная панель · карбоновые фаски · янтарная рамка',en:'Instrument panel · carbon bevels · amber frame'},
 neon:{mark:'NC / CIRCUIT',symbol:'⌁',ru:'Дорожки платы · неоновая обводка · световые капсулы',en:'Circuit traces · neon outline · illuminated capsules'},
 blueprint:{mark:'BL / TECH SHEET',symbol:'⊕',ru:'Координатная сетка · чертёжный штамп · угловые метки',en:'Coordinate grid · drafting stamp · corner marks'},
 titanium:{mark:'TF / INDUSTRIAL',symbol:'⬡',ru:'Металлические панели · крепёж · сегментированные показатели',en:'Metal panels · fasteners · segmented metrics'},
 ember:{mark:'EF / FORGE',symbol:'✦',ru:'Медные кромки · тёплое свечение · кованые панели',en:'Copper edges · warm glow · forged panels'},
 aurora:{mark:'AL / SPECTRUM',symbol:'✧',ru:'Сияние · звёздные точки · спектральная рамка',en:'Aurora ribbons · star points · spectral frame'}
}
export const signatureFor=id=>themeFor(id)?details[id]:null
export function applySignature(node,id){
 if(!signatureFor(id))return false
 node.classList.add('signature-theme','signature-'+id)
 return true
}
export function themeBadge(id,language='ru'){
 const theme=themeFor(id),spec=signatureFor(id)
 if(!theme||!spec)return null
 const n=document.createElement('span');n.className='signature-badge signature-theme signature-'+id
 const mark=document.createElement('span');mark.className='signature-symbol';mark.textContent=spec.symbol;mark.setAttribute('aria-hidden','true')
 const name=document.createElement('span');name.textContent=theme[language]??theme.en
 n.append(mark,name);n.title=language==='ru'?'Оформление профиля: '+theme.ru:'Profile theme: '+theme.en
 return n
}
export function themePlate(id){
 const spec=signatureFor(id);if(!spec)return null
 const n=document.createElement('span');n.className='signature-plate';n.textContent=spec.mark;n.setAttribute('aria-hidden','true');return n
}
export function decorateAuthor(node,id,language='ru'){
 if(!applySignature(node,id))return
 node.classList.add('signature-author')
 const badge=themeBadge(id,language);if(badge)node.append(badge)
}

/** Shared cover composition; uploaded photos take precedence over collection art. */
export function mountThemeCover(cover,id,{custom=false}={}){
 const theme=themeFor(id);if(!theme)return false
 applySignature(cover,id);cover.classList.add('signature-cover')
 if(custom){cover.classList.add('signature-custom-cover');return true}
 const art=document.createElement('div');art.className='signature-art';art.setAttribute('aria-hidden','true')
 const caption=document.createElement('div');caption.className='signature-cover-caption';caption.setAttribute('aria-hidden','true')
 const label=document.createElement('span');label.className='signature-cover-label';label.textContent='BRICKLAB / SIGNATURE'
 const title=document.createElement('strong');title.textContent=theme.en
 const sub=document.createElement('small');sub.textContent=signatureFor(id).mark
 caption.append(label,title,sub);cover.prepend(art,caption);return true
}
