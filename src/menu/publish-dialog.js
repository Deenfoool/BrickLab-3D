import {createAuthClient} from './auth-client.js?v=security-1'
import {createProjectsClient,cloudLink} from './projects-client.js?v=profile-gallery-1'
import {createCommunityClient} from './community-client.js?v=community-options-1'

const copy={
 ru:{title:'Публикация сборки',name:'Название конструкции',description:'Описание и принцип работы',category:'Категория',vehicles:'Транспорт',mechanisms:'Механизмы',architecture:'Архитектура',robots:'Робототехника',other:'Другое',parts:'Деталей',permission:'Разрешаю всем посетителям скачивать полный файл этой ревизии и открывать его в редакторе.',rights:'Подтверждаю, что имею необходимые права на публикацию этой конструкции и её содержимого.',submit:'Опубликовать',update:'Обновить публикацию',cancel:'Отмена',checking:'Проверяем аккаунт и публикацию…',saving:'Сохраняем ревизию и публикуем…',done:'Сборка опубликована.',view:'Открыть публикацию',close:'Закрыть',signin:'Войди в аккаунт для публикации. Сборка сохранена локально.',profile:'Сначала опубликуй публичный профиль в мастерской. Сборка сохранена локально.',account:'Мой профиль',conflict:'В облаке есть более новая версия. Локальная сборка сохранена. Открой актуальную копию и сравни изменения.',failed:'Не удалось опубликовать. Проверь соединение и повтори попытку.',localFailed:'Не удалось сохранить сборку на устройстве.',shared:'Для совместной сборки или копии другого аккаунта сначала создай отдельную личную копию.',empty:'Добавь хотя бы одну деталь.',partial:'Ревизия сохранена в облаке, но публикация не завершена. Можно повторить без создания новой ревизии.',linkFailed:'Ревизия сохранена, но локальная связь не записана. Публикация использует уже сохранённую версию.',existing:'Публикуется снимок текущей конструкции; прежние публикации обновляются без удаления комментариев.',privacy:'Публикация раскрывает полный документ BrickLab, включая скрытые детали и данные сборки. Не публикуй личные сведения.',readOnly:'Название берётся из редактора.'},
 en:{title:'Publish build',name:'Build name',description:'Description and how it works',category:'Category',vehicles:'Vehicles',mechanisms:'Mechanisms',architecture:'Architecture',robots:'Robots',other:'Other',parts:'Parts',permission:'I allow everyone to download the complete file of this revision and open it in the editor.',rights:'I confirm that I have the necessary rights to publish this build and its contents.',submit:'Publish',update:'Update publication',cancel:'Cancel',checking:'Checking account and publication…',saving:'Saving revision and publishing…',done:'Build published.',view:'View publication',close:'Close',signin:'Sign in to publish. Your build is saved locally.',profile:'Publish your public profile in My workshop first. Your build is saved locally.',account:'My profile',conflict:'A newer cloud revision exists. Your local build is safe. Open and compare the latest copy.',failed:'Could not publish. Check your connection and retry.',localFailed:'Could not save locally.',shared:'Create a separate personal copy before publishing a shared build or a copy linked to another account.',empty:'Add at least one part.',partial:'Revision saved in cloud, but publication failed. Retry without creating another revision.',linkFailed:'Cloud revision saved but local link was not stored. Publication uses the saved revision.',existing:'Publishes a snapshot of the current build; updates preserve existing comments.',privacy:'Publishing exposes the complete BrickLab document, including hidden parts and build data. Do not publish personal information.',readOnly:'The title comes from the editor.'}
}
Object.assign(copy.ru,{comments:'Разрешить новые комментарии',remix:'Разрешить публикацию модификаций с указанием оригинала',difficulty:'Сложность',unspecified:'Не указана',easy:'Начальная',medium:'Средняя',hard:'Высокая',expert:'Экспертная',tags:'Теги через запятую (до 8)',type:'Тип работы',original:'Авторская модель',instruction:'Сборка по инструкции',remixType:'Модификация',attribution:'Автор / название / ссылка на оригинал',images:'Обложка и галерея (до 4 снимков)',addImage:'Загрузить изображения',capture:'Снимок из редактора',main:'Сделать обложкой',remove:'Удалить',imageError:'Не удалось загрузить изображение. PNG, JPEG или WebP до 10 МБ.',imageLoading:'Подготовка изображения…',imageHint:'Первое изображение — обложка. Снимки публичны. Можно опубликовать без них.',preview:'Предпросмотр карточки',viewOnly:'В режиме только просмотра исходный файл закрыт, но отображаемая геометрия доступна браузеру.',remixDisabled:'Оригинальный автор не разрешает публикацию модификаций.',sourceLinked:'Источник будет проверен сервером и указан автоматически.'})
Object.assign(copy.en,{comments:'Allow new comments',remix:'Allow publishing modifications with attribution',difficulty:'Difficulty',unspecified:'Unspecified',easy:'Beginner',medium:'Intermediate',hard:'Advanced',expert:'Expert',tags:'Comma-separated tags (up to 8)',type:'Work type',original:'Original build',instruction:'Built from instructions',remixType:'Modification',attribution:'Author / title / original link',images:'Cover and gallery (up to 4 images)',addImage:'Upload images',capture:'Editor screenshot',main:'Make cover',remove:'Remove',imageError:'Image unavailable. Use PNG, JPEG or WebP up to 10 MB.',imageLoading:'Preparing image…',imageHint:'The first image is the cover. Images are public. You may publish without images.',preview:'Card preview',viewOnly:'View-only blocks original file access, but rendered geometry is available to the browser.',remixDisabled:'The original author does not permit publishing modifications.',sourceLinked:'The source will be verified and credited automatically.'})
const categories=['vehicles','mechanisms','architecture','robots','other']
export function publicationInput(revision,{description,category,downloadAllowed,rightsConfirmed,allowComments=true,allowRemix=false,difficulty='unspecified',tags=[],workType='original',attribution='',images}){
 if(!Number.isSafeInteger(revision)||revision<1||typeof description!=='string'||description.length>1000||!categories.includes(category)||typeof downloadAllowed!=='boolean'||rightsConfirmed!==true||typeof allowComments!=='boolean'||typeof allowRemix!=='boolean'||allowRemix&&!downloadAllowed||!['unspecified','easy','medium','hard','expert'].includes(difficulty)||!Array.isArray(tags)||tags.length>8||tags.some(t=>typeof t!=='string'||!t.trim()||t.length>32)||!['original','remix','instruction'].includes(workType)||typeof attribution!=='string'||attribution.length>250)throw Error('invalid_publication')
 return {revision,description:description.trim(),category,consent:true,rightsConfirmed:true,allowDownload:downloadAllowed,allowComments,allowRemix,difficulty,tags,workType,attribution:attribution.trim(),...(images===undefined?{}:{images})}
}
export async function savePublicationRevision({record,user,cloud,linkLocal}){
 if(!record?.document?.parts?.length)throw Error('empty')
 if(record.cloud?.kind==='bureau'||record.cloud&&record.cloud.ownerId!==user.id)throw Error('shared')
 const linked=cloudLink(record,user.id)
 const saved=linked?await cloud.save(linked.id,linked.revision,record.document):await cloud.create(record.document)
 const link={ownerId:user.id,id:saved.id,revision:saved.revision}
 return {id:saved.id,revision:saved.revision,linked:linkLocal(record.id,link,record.cloud)}
}
function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n}
function button(text,fn,primary=false){const b=el('button','workspace-action'+(primary?' primary':''),text);b.type='button';b.onclick=fn;return b}
function field(label,input){const l=el('label','account-field');l.append(el('span',null,label),input);return l}
function check(label,required=false,checked=false){const l=el('label','workshop-check'),input=el('input');input.type='checkbox';input.required=required;input.checked=checked;l.append(input,el('span',null,label));return {l,input}}
async function imageData(blob){
 if(!['image/png','image/jpeg','image/webp'].includes(blob.type)||blob.size>10*1024*1024)throw Error('invalid_image')
 const bitmap=await createImageBitmap(blob)
 try{if(bitmap.width>6000||bitmap.height>6000)throw Error('invalid_image');const scale=Math.min(1,1200/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);for(const quality of [.84,.7,.52,.35]){const data=canvas.toDataURL('image/webp',quality);if(data.startsWith('data:image/webp;')&&data.length<=699120)return data}throw Error('invalid_image')}finally{bitmap.close()}
}
export async function openPublishDialog({record,language='ru',signal,linkLocal,capture,onPublished=()=>{},auth=createAuthClient(),cloud=createProjectsClient(),community=createCommunityClient()}){
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
  if(record.cloud&&record.cloud.ownerId!==user.id){notice.textContent=t.shared;return}
  profile=await community.get();if(closed)return
  if(!profile){notice.textContent=t.profile;accountLink();return}
  const old=(await community.builds()).find(b=>b.projectId===cloudLink(record,user.id)?.id)
  if(closed)return
  notice.textContent=t.existing
  const form=el('form','workshop-form'),name=el('input'),description=el('textarea'),category=el('select')
  name.value=record.document.name;name.readOnly=true;name.title=t.readOnly
  description.rows=5;description.maxLength=1000;description.value=old?.description??(typeof record.document.description==='string'?record.document.description.slice(0,1000):'')
  for(const key of categories){const opt=el('option',null,t[key]);opt.value=key;category.append(opt)}category.value=old?.category??'other'
  const download=check(t.permission,false,old?.allowDownload===true),comments=check(t.comments,false,old?.allowComments!==false),remix=check(t.remix,false,old?.allowRemix===true),rights=check(t.rights,true),submit=el('button','workspace-action primary',old?t.update:t.submit);submit.type='submit'
  const difficulty=el('select'),type=el('select'),tags=el('input'),attribution=el('input')
  for(const key of ['unspecified','easy','medium','hard','expert']){const opt=el('option',null,t[key]);opt.value=key;difficulty.append(opt)}
  difficulty.value=old?.difficulty??'unspecified'
  for(const key of ['original','remix','instruction']){const opt=el('option',null,t[key==='remix'?'remixType':key]);opt.value=key;type.append(opt)}
  type.value=old?.workType??(record.document.communityOrigin?'remix':record.document.buildingSet?'instruction':'original')
  tags.value=(old?.tags??[]).join(', ');tags.maxLength=264
  attribution.maxLength=250;attribution.value=old?.attribution??''
  const source=Boolean(record.document.communityOrigin?.id)
  if(source){type.value='remix';type.disabled=true;attribution.readOnly=true;attribution.placeholder=t.sourceLinked}
  function sync(){if(!download.input.checked)remix.input.checked=false;remix.input.disabled=!download.input.checked;attribution.required=!source&&type.value!=='original'}
  download.input.onchange=sync;type.onchange=sync;sync()
  const imageSection=el('section','publish-images'),imageGrid=el('div','publish-image-grid'),imageNotice=el('p','account-muted'),picker=el('input')
  picker.type='file';picker.accept='image/png,image/jpeg,image/webp';picker.multiple=true
  let images=[],dirty=false,processing=false
  const drawImages=()=>{imageGrid.replaceChildren();images.forEach((data,index)=>{const tile=el('div','publish-image-tile'),img=el('img');img.src=data;img.alt=(index===0?t.main:t.images)+' '+(index+1);tile.append(img,el('small','account-muted',index===0?t.main:String(index+1)));if(index)tile.append(button(t.main,()=>{images.unshift(images.splice(index,1)[0]);dirty=true;drawImages()}));tile.append(button(t.remove,()=>{images.splice(index,1);dirty=true;drawImages()}));imageGrid.append(tile)});picker.disabled=processing||images.length>=4;captureButton.disabled=processing||images.length>=4||typeof capture!=='function';submit.disabled=processing}
  const appendFiles=async files=>{if(processing||busy)return;processing=true;drawImages();imageNotice.textContent=t.imageLoading;try{for(const file of files.slice(0,4-images.length)){if(closed)return;images.push(await imageData(file));dirty=true}imageNotice.textContent=''}catch{imageNotice.textContent=t.imageError}finally{processing=false;if(!closed)drawImages()}}
  const captureButton=button(t.capture,async()=>{try{const blob=await capture();if(blob)await appendFiles([blob]);else imageNotice.textContent=t.imageError}catch{imageNotice.textContent=t.imageError}})
  picker.onchange=()=>{const files=[...picker.files];picker.value='';void appendFiles(files)}
  imageSection.append(el('h3',null,t.images),el('p','account-muted',t.imageHint),captureButton,field(t.addImage,picker),imageGrid,imageNotice)
  if(old?.imageCount){processing=true;drawImages();imageNotice.textContent=t.imageLoading;try{for(let i=0;i<Math.min(old.imageCount,4);i++){const res=await fetch('/api/community/build/'+old.id+'/image/'+i,{cache:'no-store',signal});if(!res.ok)throw Error();images.push(await imageData(await res.blob()))}imageNotice.textContent=''}catch{images=[];imageNotice.textContent=t.imageError}finally{processing=false}}
  if(closed)return
  drawImages()
  form.append(field(t.name,name),el('p','account-muted',t.parts+': '+record.document.parts.length),imageSection,field(t.description,description),field(t.category,category),field(t.difficulty,difficulty),field(t.tags,tags),field(t.type,type),field(t.attribution,attribution),el('p','account-notice',t.viewOnly),download.l,comments.l,remix.l,rights.l,submit)
  d.insertBefore(form,footer)
  form.onsubmit=async e=>{
   e.preventDefault();if(busy||closed||processing||!form.reportValidity())return
   const input={description:description.value,category:category.value,downloadAllowed:download.input.checked,rightsConfirmed:rights.input.checked,allowComments:comments.input.checked,allowRemix:remix.input.checked,difficulty:difficulty.value,tags:tags.value.split(',').map(t=>t.trim()).filter(Boolean),workType:type.value,attribution:attribution.value,...(dirty?{images:[...images]}:{})}
   try{publicationInput(1,input)}catch{notice.textContent=t.failed;return}
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
   }catch(err){if(!closed)notice.textContent=err.code==='revision_conflict'?t.conflict:err.code==='remix_disabled'?t.remixDisabled:err.message==='unauthenticated'?t.signin:saved?t.partial:t.failed}
   finally{busy=false;if(!closed){cancel.disabled=false;for(const control of form.elements)control.disabled=false;if(source)type.disabled=true;sync();drawImages()}}
  }
 }catch(e){if(!closed)notice.textContent=e.code==='unauthenticated'?t.signin:t.failed}
}
