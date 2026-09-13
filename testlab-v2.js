import {
  BUILTIN_TEST_PROFILES, TESTLAB_SELECTED_KEY, compareTestRuns, defaultCustomProfile, deleteTestProfile,
  findTestProfile, normalizeTestProfile, readCustomProfiles, readTestRuns, recordTestRun, saveTestProfile,
} from './testlab/core-v2.js?v=testlab-20260913-v1'
import { queueTestProfile } from './testlab/runtime-v2.js?v=testlab-20260913-v1'

const DEMO_BACKUP_KEY='bricklab.demo.backup.v1',PROJECT_KEY='bricklab.project.v2'
const LEGACY_BEST_KEYS={
  'hill-climb':'bricklab.test.hill-climb.best.v2','torque-pull':'bricklab.test.torque-pull.best.v2',
  'obstacle-course':'bricklab.test.obstacle-course.best.v2','dyno-bench':'bricklab.test.dyno-bench.best.v2',
}
const typing=target=>target instanceof HTMLElement&&(/INPUT|TEXTAREA|SELECT/.test(target.tagName)||target.isContentEditable)
const ru=()=>document.documentElement.lang==='ru'||localStorage.getItem('bricklab.ui.language.v1')==='ru'
const t=(en,rus)=>ru()?rus:en
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))
const readProject=()=>{try{return JSON.parse(localStorage.getItem(PROJECT_KEY)||'null')}catch{return null}}
const profileById=id=>findTestProfile(id,localStorage)
const readSelected=()=>profileById(localStorage.getItem(TESTLAB_SELECTED_KEY))?.id||'hill-climb'
const bestKey=profile=>LEGACY_BEST_KEYS[profile.id]||`bricklab.test.profile.${profile.id}.best.v2`
const best=profile=>{const value=Number(localStorage.getItem(bestKey(profile)));return Number.isFinite(value)&&value>0?value:null}
const formatMetric=(metric,value)=>value==null?'—':metric==='time'?`${Number(value).toFixed(2)}s`:metric==='force'?`${Number(value).toFixed(2)} N`:`${Number(value).toFixed(2)} W`
const saveBest=(profile,value)=>{if(!Number.isFinite(value)||value<=0)return best(profile);const old=best(profile),better=old==null||(profile.metric==='time'?value<old:value>old);if(better)localStorage.setItem(bestKey(profile),String(value));return best(profile)??value}

window.addEventListener('keydown',event=>{if(event.code==='KeyS'&&!event.shiftKey&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&!typing(event.target)){event.preventDefault();event.stopImmediatePropagation()}},true)

let selected=readSelected(),ephemeralProfile=null,finished=false,frame=0,trace=[],lastTraceTime=-1,modal=null
const currentProfile=()=>ephemeralProfile?.id===selected?ephemeralProfile:profileById(selected)||BUILTIN_TEST_PROFILES['hill-climb']

function moduleHtml(type,title,fields){
  return `<section class="testlab-module" data-module="${type}"><label class="testlab-module-toggle"><input type="checkbox" data-module-enabled><b>${title}</b></label><div class="testlab-module-fields">${fields}</div></section>`
}
const field=(key,label,value,step='0.1',min='')=>`<label>${label}<input type="number" data-field="${key}" value="${value}" step="${step}"${min!==''?` min="${min}"`:''}></label>`

function ensureLabModal(){
  if(modal)return modal
  modal=document.createElement('div');modal.id='testLabV2Modal';modal.className='testlab-modal hidden';modal.innerHTML=`<div class="testlab-dialog" role="dialog" aria-modal="true">
    <header><div><small>ENGINEERING TEST WORKSPACE</small><h2>TEST Lab 2.0</h2></div><button type="button" data-testlab-close aria-label="Close">×</button></header>
    <div class="testlab-layout">
      <div class="testlab-designer">
        <div class="testlab-form-head"><label>${t('Profile name','Название профиля')}<input data-testlab-name maxlength="80"></label><label>${t('Result metric','Метрика результата')}<select data-testlab-metric><option value="time">TIME</option><option value="force">PULL FORCE</option><option value="power">PEAK POWER</option></select></label><label>${t('Base surface','Базовое покрытие')}<select data-testlab-surface><option>concrete</option><option>asphalt</option><option>dirt</option><option>gravel</option><option>mud</option><option>ice</option></select></label></div>
        <div class="testlab-modules">
          ${moduleHtml('incline',t('Incline','Уклон'),field('angleDeg','°',22,'1',1)+field('lengthStud','L',18,'1',2)+field('startZStud','Z',3,'1'))}
          ${moduleHtml('step',t('Step / threshold','Ступень'),field('zStud','Z',5,'0.5')+field('heightStud','H',.4,'0.05',.05))}
          ${moduleHtml('articulation',t('Articulation blocks','Диагональные блоки'),field('zStud','Z',8,'0.5')+field('heightStud','H',.7,'0.05',.05)+field('staggerStud','ΔZ',2.2,'0.1',.25))}
          ${moduleHtml('cross-bump',t('Cross bump','Поперечные бугры'),field('zStud','Z',12,'0.5')+field('heightStud','H',.7,'0.05',.05)+field('angleDeg','°',14,'1',0))}
          ${moduleHtml('bridge',t('Bridge / ramp','Мост / рампа'),field('zStud','Z',15,'0.5')+field('heightStud','H',1,'0.1',.1)+field('lengthStud','L',6,'0.5',2))}
          ${moduleHtml('surface-zone',t('Surface zone','Зона покрытия'),`<label>SURFACE<select data-field="surface"><option>concrete</option><option>asphalt</option><option>dirt</option><option>gravel</option><option>mud</option><option>ice</option></select></label>${field('startZStud','FROM Z',8,'0.5')}${field('endZStud','TO Z',14,'0.5')}`)}
          ${moduleHtml('towing-load',t('Towing load','Буксировочная нагрузка'),field('maxForceN','MAX N',3.5,'0.1',.05)+field('rampRateN','N/s',.32,'0.01',.01))}
          ${moduleHtml('dyno-brake',t('Dyno brake','Дино-тормоз'),field('maxDuration','SEC',12,'1',2)+field('maxBrakeTorqueNm','N·m',.1,'0.01',.001))}
          ${moduleHtml('checkpoint',t('Finish checkpoint','Финиш'),field('zStud','Z',18,'0.5'))}
        </div>
        <div class="testlab-actions"><button type="button" data-testlab-save>${t('Save profile','Сохранить профиль')}</button><button type="button" class="primary" data-testlab-run>${t('Run now','Запустить')}</button></div>
      </div>
      <aside class="testlab-side"><section><h3>${t('Saved profiles','Сохранённые профили')}</h3><div data-testlab-profiles></div></section><section><h3>${t('Recent runs','Последние прогоны')}</h3><div data-testlab-runs></div></section><section data-testlab-compare></section></aside>
    </div>
  </div>`
  document.body.append(modal)
  modal.addEventListener('pointerdown',event=>{if(event.target===modal)closeLab()})
  modal.querySelector('[data-testlab-close]').onclick=closeLab
  modal.querySelector('[data-testlab-save]').onclick=()=>{const saved=saveTestProfile(localStorage,formProfile(true));ephemeralProfile=null;selected=saved.id;localStorage.setItem(TESTLAB_SELECTED_KEY,selected);populateForm(saved);renderLabLists();syncSelector()}
  modal.querySelector('[data-testlab-run]').onclick=()=>runProfile(formProfile(false))
  modal.querySelector('[data-testlab-profiles]').addEventListener('click',event=>{const row=event.target.closest('[data-profile-id]');if(!row)return;const profile=profileById(row.dataset.profileId);if(!profile)return;if(event.target.closest('[data-profile-delete]')){deleteTestProfile(localStorage,profile.id);if(selected===profile.id){ephemeralProfile=null;selected='hill-climb';localStorage.setItem(TESTLAB_SELECTED_KEY,selected)}renderLabLists();syncSelector();return}if(event.target.closest('[data-profile-run]'))runProfile(profile);else populateForm(profile)})
  return modal
}

function formProfile(forSave){
  const root=ensureLabModal(),modules=[]
  root.querySelectorAll('[data-module]').forEach(section=>{
    if(!section.querySelector('[data-module-enabled]').checked)return
    const module={type:section.dataset.module}
    section.querySelectorAll('[data-field]').forEach(input=>{module[input.dataset.field]=input.tagName==='SELECT'?input.value:Number(input.value)})
    if(module.type==='surface-zone')module.widthStud=8
    if(module.type==='towing-load')module.startForceN=.1
    if(module.type==='dyno-brake')module.brakeGain=.012
    if(module.type==='checkpoint')module.label='FINISH'
    modules.push(module)
  })
  const existing=root.dataset.profileId&&profileById(root.dataset.profileId)
  return {id:forSave&&existing&&!existing.builtin?existing.id:`custom-live-${Date.now()}`,name:root.querySelector('[data-testlab-name]').value||'Custom test',metric:root.querySelector('[data-testlab-metric]').value,surface:root.querySelector('[data-testlab-surface]').value,modules}
}

function populateForm(profile=defaultCustomProfile()){
  const root=ensureLabModal();root.dataset.profileId=profile.builtin?'':profile.id
  root.querySelector('[data-testlab-name]').value=profile.name;root.querySelector('[data-testlab-metric]').value=profile.metric;root.querySelector('[data-testlab-surface]').value=profile.surface
  root.querySelectorAll('[data-module]').forEach(section=>{
    const module=profile.modules.find(item=>item.type===section.dataset.module);section.querySelector('[data-module-enabled]').checked=Boolean(module)
    if(!module)return
    section.querySelectorAll('[data-field]').forEach(input=>{if(module[input.dataset.field]!=null)input.value=module[input.dataset.field]})
  })
}

function pathFor(trace,key,w=260,h=72){
  if(!trace?.length)return'';const maxT=Math.max(1,...trace.map(x=>x.t)),maxV=Math.max(.001,...trace.map(x=>Number(x[key])||0))
  return trace.map((sample,index)=>`${index?'L':'M'} ${(sample.t/maxT*w).toFixed(1)} ${(h-(Number(sample[key])||0)/maxV*h).toFixed(1)}`).join(' ')
}
function deltaText(value){return value==null?'—':`${value>=0?'+':''}${value.toFixed(1)}%`}
function renderLabLists(){
  const root=ensureLabModal(),profiles=readCustomProfiles(localStorage),runs=readTestRuns(localStorage)
  root.querySelector('[data-testlab-profiles]').innerHTML=profiles.length?profiles.map(profile=>`<div class="testlab-profile-row" data-profile-id="${esc(profile.id)}"><button type="button" class="testlab-profile-main"><b>${esc(profile.name)}</b><small>${profile.metric.toUpperCase()} · ${profile.modules.length} modules</small></button><button type="button" data-profile-run>RUN</button><button type="button" data-profile-delete>×</button></div>`).join(''):`<p class="testlab-empty">${t('No custom profiles yet.','Пользовательских профилей пока нет.')}</p>`
  root.querySelector('[data-testlab-runs]').innerHTML=runs.length?runs.slice(0,8).map(run=>`<div class="testlab-run-row"><div><b>${esc(run.profileName)}</b><small>${esc(run.projectName)} · ${new Date(run.createdAt).toLocaleString()}</small></div><strong>${formatMetric(run.metric,run.primary)}</strong><span class="${run.status==='PASSED'?'ok':'bad'}">${run.status}</span></div>`).join(''):`<p class="testlab-empty">${t('No recorded runs.','Прогонов пока нет.')}</p>`
  const latest=runs[0],previous=latest&&runs.find((run,index)=>index>0&&run.profileId===latest.profileId),compare=root.querySelector('[data-testlab-compare]')
  if(!latest||!previous){compare.innerHTML=`<h3>${t('Comparison','Сравнение')}</h3><p class="testlab-empty">${t('Run the same profile twice to compare it.','Запустите один профиль дважды для сравнения.')}</p>`;return}
  const delta=compareTestRuns(latest,previous),speedA=pathFor(previous.trace,'speed'),speedB=pathFor(latest.trace,'speed')
  compare.innerHTML=`<h3>${t('Latest vs previous','Последний vs предыдущий')}</h3><div class="testlab-deltas"><span>PRIMARY <b>${deltaText(delta.primaryPct)}</b></span><span>TIME <b>${deltaText(delta.elapsedPct)}</b></span><span>POWER <b>${deltaText(delta.peakPowerPct)}</b></span><span>SPEED <b>${deltaText(delta.topSpeedPct)}</b></span><span>SLIP <b>${deltaText(delta.avgSlipPct)}</b></span><span>RPM <b>${deltaText(delta.maxRpmPct)}</b></span></div><div class="testlab-chart"><small>SPEED · physics time</small><svg viewBox="0 0 260 72" preserveAspectRatio="none"><path class="previous" d="${speedA}"/><path class="latest" d="${speedB}"/></svg></div>`
}
function openLab(profile=null){const root=ensureLabModal();populateForm(profile||(!currentProfile().builtin?currentProfile():defaultCustomProfile()));renderLabLists();root.classList.remove('hidden')}
function closeLab(){modal?.classList.add('hidden')}

function runProfile(profile){
  const normalized=normalizeTestProfile(profile,{id:profile?.id||`custom-live-${Date.now()}`})
  ephemeralProfile=profileById(normalized.id)?null:normalized
  selected=normalized.id;localStorage.setItem(TESTLAB_SELECTED_KEY,selected);closeLab();syncSelector();const test=document.querySelector('.mode[data-mode="test"]');if(test)test.click()
}

function syncSelector(){document.querySelectorAll('[data-test-scenario]').forEach(button=>button.classList.toggle('active',button.dataset.testScenario===selected));document.querySelector('[data-test-lab-open]')?.classList.toggle('active',!BUILTIN_TEST_PROFILES[selected])}
function currentResult(panel,profile){return profile.metric==='time'?Number(panel?.dataset.testElapsed||0):profile.metric==='force'?Number(panel?.dataset.testForce||0):Number(panel?.dataset.testPower||0)}

function sampleTrace(){
  const session=window.__bricklabPhysicsSession,telemetry=session?.telemetry;if(!session||!telemetry)return
  const time=Number(telemetry.testElapsed??session.testElapsed??0);if(time<0||time-lastTraceTime<.2)return;lastTraceTime=time
  const wheels=telemetry.wheels??[],speed=Math.max(0,Number(telemetry.vehicle?.speed??session.chassisMonitor?.speed??0)),rpm=Math.max(0,...(session.motorDrives??[]).map(d=>Math.abs(Number(d.actualRpm)||0)),...(telemetry.shafts??[]).map(s=>Math.abs(Number(s.rpm)||0))),power=Math.max(0,Number(telemetry.powerW)||0),slip=wheels.length?wheels.reduce((sum,w)=>sum+Math.abs(Number(w.slipPercent)||0),0)/wheels.length:0,wheelLoad=wheels.length?Math.max(...wheels.map(w=>Number(w.normalLoadN)||0)):0
  trace.push({t:time,speed,rpm,power,slip,wheelLoad});if(trace.length>180)trace.shift()
}
function storeFinishedRun(profile,status,primary){
  const session=window.__bricklabPhysicsSession,telemetry=session?.telemetry??{},scenario=session?.scenarioData??{},project=readProject(),samples=trace
  const run=recordTestRun(localStorage,{id:`run-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,profileId:profile.id,profileName:profile.name,projectName:project?.name||'Untitled',createdAt:Date.now(),status,metric:profile.metric,primary,elapsedSeconds:Number(telemetry.testElapsed??session?.testElapsed??0),peakForceN:Number(scenario.currentForceN||0),peakPowerW:Math.max(Number(scenario.peakPowerW||0),...samples.map(x=>x.power)),topSpeedMps:Math.max(0,...samples.map(x=>x.speed)),maxRpm:Math.max(0,...samples.map(x=>x.rpm)),avgSlipPct:samples.length?samples.reduce((sum,x)=>sum+x.slip,0)/samples.length:0,peakWheelLoadN:Math.max(0,...samples.map(x=>x.wheelLoad)),trace:samples})
  if(run&&!modal?.classList.contains('hidden'))renderLabLists()
}

function install(){
  const build=document.querySelector('.mode[data-mode="build"]'),sim=document.querySelector('.mode[data-mode="simulate"]'),test=document.querySelector('.mode[data-mode="test"]'),status=document.getElementById('statusText'),actions=document.querySelector('.top-actions'),shortcuts=document.getElementById('shortcutsBtn')
  if(!build||!sim||!test||!status||!actions)return requestAnimationFrame(install)
  if(!document.getElementById('demoProjectBtn')){const current=readProject(),backup=localStorage.getItem(DEMO_BACKUP_KEY),restore=current?.name==='Starter Hill Climber'&&backup,button=document.createElement('button');button.id='demoProjectBtn';button.className='ghost';button.title=restore?'Restore build from before demo':'Load Starter Hill Climber demo';button.innerHTML=restore?'<i data-lucide="history"></i><span>Restore</span>':'<i data-lucide="car-front"></i><span>Demo</span>';button.onclick=async()=>{if(restore){localStorage.setItem(PROJECT_KEY,backup);localStorage.removeItem(DEMO_BACKUP_KEY);location.reload();return}const project=readProject();if(project?.parts?.length)localStorage.setItem(DEMO_BACKUP_KEY,JSON.stringify(project));try{const response=await fetch('./examples/hill-climber.bricklab',{cache:'no-store'});if(!response.ok)throw Error(`Demo HTTP ${response.status}`);localStorage.setItem(PROJECT_KEY,JSON.stringify(await response.json()));localStorage.setItem(TESTLAB_SELECTED_KEY,'hill-climb');location.reload()}catch(error){console.error(error)}};actions.insertBefore(button,shortcuts||null)}
  if(!document.getElementById('testScenarioSelector')){const selector=document.createElement('div');selector.id='testScenarioSelector';selector.className='test-scenario-selector';selector.setAttribute('aria-label','TEST scenario');selector.innerHTML=Object.values(BUILTIN_TEST_PROFILES).map(profile=>`<button type="button" data-test-scenario="${profile.id}" title="${profile.name}">${profile.short}</button>`).join('')+`<button type="button" data-test-lab-open title="TEST Lab 2.0">LAB</button>`;test.insertAdjacentElement('afterend',selector);selector.querySelectorAll('[data-test-scenario]').forEach(button=>button.onclick=event=>{event.stopPropagation();const next=button.dataset.testScenario;if(!BUILTIN_TEST_PROFILES[next]||next===selected)return;ephemeralProfile=null;selected=next;localStorage.setItem(TESTLAB_SELECTED_KEY,next);syncSelector();if(document.body.dataset.bricklabTest)test.click()});selector.querySelector('[data-test-lab-open]').onclick=event=>{event.stopPropagation();openLab()}}
  syncSelector();window.lucide?.createIcons?.({attrs:{'stroke-width':1.8,'aria-hidden':'true'}})
  const mark=()=>{document.querySelectorAll('.mode').forEach(button=>button.classList.remove('active'));test.classList.add('active');document.body.dataset.bricklabTest=selected;syncSelector()}
  const clear=()=>{delete document.body.dataset.bricklabTest;cancelAnimationFrame(frame)}
  function ensureUi(){const panel=document.querySelector('.telemetry-test');if(!panel)return null;let meta=panel.querySelector('.test-run-meta'),profile=currentProfile();if(!meta){meta=document.createElement('div');meta.className='test-run-meta';panel.append(meta)}if(meta.dataset.scenario!==profile.id){meta.dataset.scenario=profile.id;const label=profile.metric==='time'?'TIME':profile.metric==='force'?'LOAD':'PEAK POWER';meta.innerHTML=`<span>${label} <b data-test-primary>—</b></span><span>BEST <b data-test-best>${formatMetric(profile.metric,best(profile))}</b></span><button type="button" data-test-retry><i data-lucide="rotate-ccw"></i><span>Retry</span></button><button type="button" data-test-lab><i data-lucide="flask-conical"></i><span>Lab</span></button>`;meta.querySelector('[data-test-retry]').onclick=()=>test.click();meta.querySelector('[data-test-lab]').onclick=()=>openLab(profile);window.lucide?.createIcons?.({attrs:{'stroke-width':1.8,'aria-hidden':'true'}})}return panel}
  function update(){if(document.body.dataset.bricklabTest!==selected)return;const panel=ensureUi(),profile=currentProfile(),phase=panel?.dataset.testPhase||'SETTLE',primary=panel?.querySelector('[data-test-primary]'),statusValue=panel?.dataset.testStatus||window.__bricklabPhysicsSession?.testStatus||'RUNNING',value=currentResult(panel,profile);if(primary){if(phase==='SETTLE')primary.textContent='SETTLE';else if(phase==='COUNTDOWN')primary.textContent=document.querySelector('[data-v2-phase]')?.textContent||'3';else primary.textContent=formatMetric(profile.metric,value)}if(phase==='RUN')sampleTrace();if(!finished&&['PASSED','STALLED'].includes(statusValue)){finished=true;const valueBest=saveBest(profile,value),bestElement=panel?.querySelector('[data-test-best]');if(bestElement)bestElement.textContent=formatMetric(profile.metric,valueBest);panel?.classList.toggle('run-complete',statusValue==='PASSED');panel?.classList.toggle('run-failed',statusValue==='STALLED');storeFinishedRun(profile,statusValue,value)}if(!finished)frame=requestAnimationFrame(update)}
  const originalBuild=build.onclick,originalSim=sim.onclick;build.onclick=event=>{clear();originalBuild?.call(build,event)};sim.onclick=event=>{if(document.body.dataset.bricklabTest)originalBuild?.call(build,event);clear();originalSim?.call(sim,event)};test.onclick=()=>{const profile=currentProfile();if(!build.classList.contains('active'))originalBuild?.call(build,new Event('click'));queueTestProfile(profile);originalSim?.call(sim,new Event('click'));mark();finished=false;trace=[];lastTraceTime=-1;cancelAnimationFrame(frame);frame=requestAnimationFrame(update)}
  new MutationObserver(()=>{if(!document.body.dataset.bricklabTest)return;if(status.textContent.startsWith('BUILD'))return clear();if(status.textContent.startsWith('SIMULATE'))status.textContent=status.textContent.replace(/^SIMULATE/,`TEST · ${currentProfile().statusTitle}`);mark()}).observe(status,{childList:true,characterData:true,subtree:true})
  window.addEventListener('bricklab:languagechange',()=>{if(modal&&!modal.classList.contains('hidden')){const profile=currentProfile();modal.remove();modal=null;openLab(profile)}})
}

install()
globalThis.BrickLabTestLab=Object.freeze({ open:()=>openLab(), profiles:()=>[...Object.values(BUILTIN_TEST_PROFILES),...readCustomProfiles(localStorage)], runs:()=>readTestRuns(localStorage), run:runProfile })
