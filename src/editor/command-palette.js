// One registry for actual editor actions, not duplicated shortcut handlers.
export function matchCommands(commands,query){
 const words=String(query??'').toLowerCase().trim().split(/\s+/).filter(Boolean)
 return commands.filter(c=>words.every(w=>(c.label+' '+(c.group??'')+' '+(c.shortcut??'')+' '+(c.keywords??'')).toLowerCase().includes(w)))
}
export function openCommandPalette({commands,language,signal,searchParts}){
 const d=document,ru=language==='ru',tr=(a,b)=>ru?a:b
 if(d.querySelector('dialog[open]'))return
 const dialog=d.createElement('dialog');dialog.className='bricklab-command'
 const heading=d.createElement('h2');heading.textContent='BrickLab Command'
 const search=d.createElement('input');search.type='search';search.placeholder=tr('Команда, инструмент или артикул…','Command, tool or part number…');search.setAttribute('aria-label',search.placeholder)
 const list=d.createElement('div');list.className='command-results';list.setAttribute('role','listbox')
 const help=d.createElement('p');help.className='command-help';help.textContent='↑ ↓ · Enter · Esc'
 dialog.append(heading,search,list,help);let index=0,entries=[]
 function run(c){if(!c||c.enabled?.()===false)return;dialog.close();c.run()}
 function draw(){list.replaceChildren();const q=search.value;entries=[...matchCommands(commands(),q),...(q.trim()?searchParts(q):[])].slice(0,40);index=Math.max(0,Math.min(index,entries.length-1))
  entries.forEach((c,i)=>{const b=d.createElement('button');b.type='button';b.setAttribute('role','option');b.setAttribute('aria-selected',String(index===i));b.disabled=c.enabled?.()===false;const title=d.createElement('span');title.textContent=c.label;const meta=d.createElement('small');meta.textContent=[c.group,c.shortcut].filter(Boolean).join(' · ');b.append(title,meta);b.onclick=()=>run(c);list.append(b)})
  if(!entries.length)list.textContent=tr('Ничего не найдено','No results')
  list.children[index]?.scrollIntoView?.({block:'nearest'})
 }
 search.oninput=()=>{index=0;draw()}
 dialog.addEventListener('keydown',e=>{if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();const step=e.key==='ArrowDown'?1:-1;for(let i=0;i<entries.length;i++){index=(index+step+entries.length)%entries.length;if(entries[index]?.enabled?.()!==false)break}draw()}else if(e.key==='Enter'&&e.target===search){e.preventDefault();run(entries[index])}})
 dialog.addEventListener('close',()=>dialog.remove(),{once:true});signal.addEventListener('abort',()=>dialog.remove(),{once:true})
 d.body.append(dialog);dialog.showModal();draw();search.focus()
}
