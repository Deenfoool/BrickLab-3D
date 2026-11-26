// Personal instruction collection and earned Welcome Pack milestone.
export function renderInstructionCollection({lang,signal,remote=[]}){
 const ru=lang==='ru',tr=(a,b)=>ru?a:b
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n}
 const root=el('section','account-card workshop-card'),body=el('div'),status=el('p','account-muted')
 root.append(el('h2',null,tr('Мои инструкции','My instructions')),body,status)
 const api=async(path,data)=>{const r=await fetch(path,{signal,credentials:'same-origin',cache:'no-store',...(data?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}:{})});const j=await r.json();if(!r.ok)throw Error(j.error||'unavailable');return j}
 async function load(){
  status.textContent=tr('Загрузка…','Loading…')
  try{
   const [account,catalog]=await Promise.all([api('/api/commerce/account'),api('/api/store/catalog')])
   if(signal.aborted||!root.isConnected)return
   body.replaceChildren();status.textContent=''
   if(account.mode==='test'||account.welcomeRemaining===undefined){body.append(el('p','account-muted',tr('Доступы отображаются после подключения аккаунта.','Access appears when the account is connected.')));return}
   const top=el('div','workshop-metric-grid')
   for(const [label,value] of [[tr('Открыто наборов','Unlocked sets'),account.instructions?.length??0],[tr('Подарочных активаций','Gift credits'),account.welcomeRemaining],[tr('First Builder','First Builder'),account.firstBuilder?tr('Получено','Earned'):tr('Не получено','Not earned')]]){
    const cell=el('div','workshop-metric');cell.append(el('span',null,label),el('strong',null,String(value)));top.append(cell)
   }
   body.append(top)
   if(!catalog.instructionRelease)body.append(el('p','account-muted',tr('В ОБТ подсказки бесплатны. Подарки не расходуются.','Hints are free during open beta. Gift credits are preserved.')))
   const list=el('div','workshop-grid')
   for(const id of account.instructions??[]){
    const p=catalog.instructions?.find(p=>p.setId===id),card=el('article','commerce-preview-card')
    card.append(el('strong',null,p?.title??id),el('p','account-muted',id+' · '+tr('Постоянный доступ','Permanent access')))
    const a=el('a','workspace-action',tr('Открыть набор','Open set'));a.href='#sets';a.onclick=()=>{try{sessionStorage.setItem('bricklab-instruction-return',id)}catch{}};card.append(a);list.append(card)
   }
   if(list.childNodes.length)body.append(list)
   if(catalog.instructionRelease&&!account.firstBuilder&&account.welcomeInstructions?.length){
    body.append(el('p','account-muted',tr('Закончи первую подарочную модель, сохрани её в облаке и проверь сохранение, чтобы получить второй набор.','Finish your first gifted model, save it in the cloud and verify the saved build to earn a second set.')))
    const select=el('select'),placeholder=new Option(tr('Выбери сохранённую сборку','Choose saved build'),'');select.add(placeholder)
    for(const p of remote)select.add(new Option(p.name,p.id))
    const b=el('button','workspace-action',tr('Проверить и получить награду','Verify and earn reward'));b.type='button';b.disabled=true
    select.onchange=()=>b.disabled=!select.value
    b.onclick=async()=>{b.disabled=true;try{await api('/api/commerce/instruction-complete',{projectId:select.value});await load()}catch(e){status.textContent=e.message==='build_not_complete'?tr('Сохранённая модель ещё не соответствует условиям: последняя книга, финальный шаг и необходимое число деталей.','Saved model does not meet the final book, final step and part-count requirements.'):tr('Не удалось проверить сохранение.','Could not verify the saved build.');b.disabled=false}}
    body.append(select,b)
   }
   const explore=el('a','workspace-action',tr('Выбрать следующий набор','Choose your next set'));explore.href='#sets';body.append(explore)
  }catch{if(!signal.aborted)status.textContent=tr('Не удалось загрузить коллекцию.','Could not load collection.')}
 }
 void load();return root
}
