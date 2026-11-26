import {addInstructionParts} from './instruction-parts.js?v=commerce-regions-1'
// A deliberately small authored demonstration, not a real LEGO instruction or OCR result.
export function renderInteractiveDemo({language,signal,onPractice}){
 const ru=language==='ru',tr=(a,b)=>ru?a:b
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n}
 const section=el('section','set-demo'),copy=el('div','set-demo-copy'),art=el('div','set-demo-art'),result=el('div','set-demo-result')
 copy.append(el('span','set-catalog-kicker','BRICKLAB / TRY IT'),el('h3',null,tr('Попробуй интерактивность','Try interactive hints')),el('p',null,tr('Нажми на одну из деталей. Увидишь, как подсказка помогает найти нужный артикул.','Click a part to see how hints identify its part number.')))
 const items=[{id:'32316',ru:'Балка Technic 5L',en:'Technic beam 5L',cls:'beam',x:800,y:1800,w:4700,h:2500},{id:'2780',ru:'Штифт с трением',en:'Friction pin',cls:'pin',x:6600,y:1800,w:2300,h:2500}]
 const names=new Map(items.map(p=>[p.id,tr(p.ru,p.en)]))
 for(const p of items){
  const shape=el('div','set-demo-shape '+p.cls);shape.setAttribute('aria-hidden','true')
  if(p.cls==='beam')for(let i=0;i<5;i++)shape.append(el('span'))
  Object.assign(shape.style,{left:p.x/100+'%',top:p.y/100+'%',width:p.w/100+'%',height:p.h/100+'%'})
  art.append(shape)
 }
 art.append(el('span','set-demo-caption',tr('Учебная схема · нажми на деталь','Demo diagram · click a part')))
 result.setAttribute('aria-live','polite');result.append(el('span',null,tr('Артикул появится здесь','The part ID appears here')))
 addInstructionParts(art,items.map(p=>[p.x,p.y,p.w,p.h,p.id]),{language,describe:id=>names.get(id),find:id=>{
  result.replaceChildren(el('small',null,tr('Найдена деталь','Part found')),el('strong',null,id+' · '+names.get(id)))
 }})
 if(onPractice){const b=el('button','secondary',tr('Попробовать в редакторе','Practice in editor'));b.type='button';b.addEventListener('click',onPractice,{signal});copy.append(b)}
 section.append(copy,art,result);return section
}
