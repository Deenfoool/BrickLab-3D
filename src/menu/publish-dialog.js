import {createAuthClient} from './auth-client.js?v=security-1'
import {createProjectsClient,cloudLink} from './projects-client.js?v=profile-gallery-1'
import {createCommunityClient} from './community-client.js?v=public-appearance-1'

const copy={
 ru:{title:'Публикация сборки',name:'Название конструкции',description:'Описание и принцип работы',category:'Категория',vehicles:'Транспорт',mechanisms:'Механизмы',architecture:'Архитектура',robots:'Робототехника',other:'Другое',parts:'Деталей',permission:'Разрешаю всем посетителям скачивать полный файл этой ревизии и открывать его в редакторе.',rights:'Подтверждаю, что имею необходимые права на публикацию этой конструкции и её содержимого.',submit:'Опубликовать',update:'Обновить публикацию',cancel:'Отмена',checking:'Проверяем аккаунт и публикацию…',saving:'Сохраняем ревизию и публикуем…',done:'Сборка опубликована.',view:'Открыть публикацию',close:'Закрыть',signin:'Войди в аккаунт для публикации. Сборка сохранена локально.',profile:'Сначала опубликуй публичный профиль в мастерской. Сборка сохранена локально.',account:'Мой профиль',conflict:'В облаке есть более новая версия. Локальная сборка сохранена. Открой актуальную копию и сравни изменения.',failed:'Не удалось опубликовать. Проверь соединение и повтори попытку.',localFailed:'Не удалось сохранить сборку на устройстве.',shared:'Для совместных сборок сначала создай отдельную личную копию.',empty:'Добавь хотя бы одну деталь.',partial:'Ревизия сохранена в облаке, но публикация не завершена. Можно повторить без создания новой ревизии.',linkFailed:'Ревизия сохранена, но локальная связь не записана. Публикация использует уже сохранённую версию.',existing:'Публикуется снимок текущей конструкции; прежние публикации обновляются без удаления комментариев.',privacy:'Публикация раскрывает полный документ BrickLab, включая скрытые детали и данные сборки. Не публикуй личные сведения.',readOnly:'Название берётся из редактора.'},
 en:{title:'Publish build',name:'Build name',description:'Description and how it works',category:'Category',vehicles:'Vehicles',mechanisms:'Mechanisms',architecture:'Architecture',robots:'Robots',other:'Other',parts:'Parts',permission:'I allow everyone to download the complete file of this revision and open it in the editor.',rights:'I confirm that I have the necessary rights to publish this build and its contents.',submit:'Publish',update:'Update publication',cancel:'Cancel',checking:'Checking account and publication…',saving:'Saving revision and publishing…',done:'Build published.',view:'View publication',close:'Close',signin:'Sign in to publish. Your build is saved locally.',profile:'Publish your public profile in My workshop first. Your build is saved locally.',account:'My profile',conflict:'A newer cloud revision exists. Your local build is safe. Open and compare the latest copy.',failed:'Could not publish. Check your connection and retry.',localFailed:'Could not save locally.',shared:'Create a separate personal copy before publishing a shared build.',empty:'Add at least one part.',partial:'Revision saved in cloud, but publication failed. Retry without creating another revision.',linkFailed:'Cloud revision saved but local link was not stored. Publication uses the saved revision.',existing:'Publishes a snapshot of the current build; updates preserve existing comments.',privacy:'Publishing exposes the complete BrickLab document, including hidden parts and build data. Do not publish personal information.',readOnly:'The title comes from the editor.'}
}
const categories=['vehicles','mechanisms','architecture','robots','other']
export function publicationInput(revision,{description,category,downloadAllowed,rightsConfirmed}){
 if(!Number.isSafeInteger(revision)||revision<1||typeof description!=='string'||description.length>1000||!categories.includes(category)||downloadAllowed!==true||rightsConfirmed!==true)throw Error('invalid_publication')
 return {revision,description:description.trim(),category,consent:true}
}
export async function savePublicationRevision({record,user,cloud,linkLocal}){
 if(!record?.document?.parts?.length)throw Error('empty')
 if(record.cloud?.kind==='bureau')throw Error('shared')
 const linked=cloudLink(record,user.id)
 const saved=linked?await cloud.save(linked.id,linked.revision,record.document):await cloud.create(record.document)
 const link={ownerId:user.id,id:saved.id,revision:saved.revision}
 return {id:saved.id,revision:saved.revision,linked:linkLocal(record.id,link,record.cloud)}
}
function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n}
function button(text,fn,primary=false){const b=el('button','workspace-action'+(primary?' primary':''),text);b.type='button';b.onclick=fn;return b}
function field(label,input){const l=el('label','account-field');l.append(el('span',null,label),input);return l}
function check(label){const l=el('label','workshop-check'),input=el('input');input.type='checkbox';input.required=true;l.append(input,el('span',null,label));return {l,input}}
export async function openPublishDialog({record,language='ru',signal,linkLocal,onPublished=()=>{},auth=createAuthClient(),cloud=createProjectsClient(),community=createCommunityClient()}){
 if(signal?.aborted)return
 const t=copy[language]??copy.ru
 if(document.querySelector('.publish-dialog[open]'))return
 // Freeze the exact snapshot shown in the confirmation window.
 record=structuredClone(record)
 const d=el('dialog','publish-dialog'),heading=el('h2',null,t.title),notice=el('p','account-notice',t.checking)
 heading.id='publish-dialog-title';d.setAttribute('aria-labelledby',heading.id);notice.setAttribute('role','status')
 const footer=el('div','publish-footer'),cancel=button(t.cancel,()=>d.close())
 footer.append(cancel);d.append(heading,notice,footer);document.body.append(d)
 let busy=false,closed=false,saved=null,user=null,profile=null
 const finish=()=>{if(closed)return;closed=true;signal?.removeEventListener('abort',finish);if(d.open)d.close();d.remove()}
 d.addEventListener('close',finish);d.addEventListener('cancel',e=>{if(busy)e.preventDefault()})
 signal?.addEventListener('abort',finish,{once:true})
 d.showModal()
 const accountLink=()=>{const a=el('a','workspace-action',t.account);a.href='#account';footer.append(a)}
 try{
  if(!record.document.parts.length){notice.textContent=t.empty;return}
  if(record.cloud?.kind==='bureau'){notice.textContent=t.shared;return}
  user=await auth.me();if(closed)return
  if(!user){notice.textContent=t.signin;accountLink();return}
  profile=await community.get();if(closed)return
  if(!profile){notice.textContent=t.profile;accountLink();return}
  const old=(await community.builds()).find(b=>b.projectId===cloudLink(record,user.id)?.id)
  if(closed)return
  notice.textContent=t.existing
  const form=el('form','workshop-form'),name=el('input'),description=el('textarea'),category=el('select')
  name.value=record.document.name;name.readOnly=true;name.title=t.readOnly
  description.rows=5;description.maxLength=1000;description.value=old?.description??(typeof record.document.description==='string'?record.document.description.slice(0,1000):'')
  for(const key of categories){const opt=el('option',null,t[key]);opt.value=key;category.append(opt)}category.value=old?.category??'other'
  const download=check(t.permission),rights=check(t.rights),submit=el('button','workspace-action primary',old?t.update:t.submit);submit.type='submit'
  form.append(field(t.name,name),el('p','account-muted',t.parts+': '+record.document.parts.length),field(t.description,description),field(t.category,category),el('p','account-notice',t.privacy),download.l,rights.l,submit)
  d.insertBefore(form,footer)
  form.onsubmit=async e=>{
   e.preventDefault();if(busy||closed||!form.reportValidity())return
   const input={description:description.value,category:category.value,downloadAllowed:download.input.checked,rightsConfirmed:rights.input.checked}
   publicationInput(1,input)
   busy=true;cancel.disabled=true;for(const control of form.elements)control.disabled=true;notice.textContent=t.saving
   try{
    const current=await auth.me()
    if(current?.id!==user.id)throw Error('unauthenticated')
    if(closed)return
    if(!saved)saved=await savePublicationRevision({record,user,cloud,linkLocal})
    if(closed)return
    const builds=await community.publishBuild(saved.id,publicationInput(saved.revision,input))
    if(closed)return
    const published=builds.find(b=>b.projectId===saved.id&&b.revision===saved.revision)
    if(!published)throw Error('publication_unconfirmed')
    notice.textContent=t.done+(saved.linked?'':' '+t.linkFailed);form.remove();cancel.textContent=t.close
    const a=el('a','workspace-action primary',t.view);a.href='#community/build/'+published.id;footer.append(a)
    try{onPublished()}catch{}
   }catch(err){if(!closed)notice.textContent=err.code==='revision_conflict'?t.conflict:err.message==='unauthenticated'?t.signin:saved?t.partial:t.failed}
   finally{busy=false;if(!closed){cancel.disabled=false;for(const control of form.elements)control.disabled=false}}
  }
 }catch(e){if(!closed)notice.textContent=e.code==='unauthenticated'?t.signin:t.failed}
}
