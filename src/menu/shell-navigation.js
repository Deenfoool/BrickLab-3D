export function mountShellNavigation({getLanguage,openHistory}){
 const disclosures=[...document.querySelectorAll('.shell-disclosure')]
 const closeAll=except=>{for(const menu of disclosures)if(menu!==except)menu.open=false}
 for(const menu of disclosures)menu.addEventListener('toggle',()=>{if(menu.open)closeAll(menu)})
 document.addEventListener('click',event=>{for(const menu of disclosures)if(!menu.contains(event.target)||event.target.closest('.shell-popover a,.shell-popover button'))menu.open=false})
 document.addEventListener('keydown',event=>{if(event.key!=='Escape')return;const menu=disclosures.find(m=>m.open);if(menu){menu.open=false;menu.querySelector('summary').focus();event.preventDefault()}})
 window.addEventListener('hashchange',()=>closeAll())
 const launch=(event,show)=>{const trigger=event.currentTarget,restore=trigger.closest('details')?.querySelector('summary')??trigger;closeAll();const dialog=show();dialog?.addEventListener('close',()=>restore.focus(),{once:true})}
 for(const button of document.querySelectorAll('[data-open-history]'))button.addEventListener('click',event=>launch(event,()=>openHistory(getLanguage())))
 for(const button of document.querySelectorAll('[data-open-about]'))button.addEventListener('click',event=>launch(event,()=>{
  const ru=getLanguage()==='ru',dialog=document.createElement('dialog'),title=document.createElement('h2'),description=document.createElement('p'),close=document.createElement('button')
  dialog.className='shell-about';title.textContent='BrickLab 3D';dialog.setAttribute('aria-label',ru?'О проекте':'About the project')
  description.textContent=ru?'Независимая платформа для создания LEGO-совместимых конструкций, исследования механизмов и обмена сборками.':'An independent platform for LEGO-compatible construction, mechanism exploration and sharing builds.'
  close.type='button';close.className='secondary';close.textContent=ru?'Закрыть':'Close';close.onclick=()=>dialog.close();dialog.append(title,description,close)
  dialog.addEventListener('close',()=>dialog.remove(),{once:true});document.body.append(dialog);dialog.showModal();return dialog
 }))
}
