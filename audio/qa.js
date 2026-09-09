import { AudioManager } from './manager.js'
import { impactLevel } from './mechanics.js'
import { SOUNDS, LOOP_NAMES } from '../assets/audio/recipes.js'
import { mountAudioSettings } from './settings.js'
const audio=new AudioManager(), $=s=>document.querySelector(s)
mountAudioSettings(audio,$('#settings'))
const ui=['click','toggle','panel','mode','tool','success','warning','error','delete','undo','redo','language','start','stop']
for(const name of Object.keys(SOUNDS).filter(n=>!LOOP_NAMES.has(n)&&!n.startsWith('impact')&&!['metal','suspension'].includes(n))) {
  const button=document.createElement('button');button.textContent=name;button.dataset.sound=name;$(ui.includes(name)?'#ui':'#build').append(button)
}
for(const name of LOOP_NAMES) {
  const button=document.createElement('button');button.textContent=name;button.dataset.loop=name;button.setAttribute('aria-pressed','false');$('#loops').append(button)
}
function params(){return {rpm:Number($('#rpm').value),load:Number($('#load').value),position:{x:Number($('#position').value),y:0,z:-6}}}
function status(){ $('#status').textContent=JSON.stringify(audio.debug(),null,2);document.querySelectorAll('[data-loop]').forEach(b=>b.setAttribute('aria-pressed',String(audio.loops.has(b.dataset.loop)))) }
$('#unlock').onclick=async()=>{await audio.unlock();await audio.preload();status()}
$('#stop').onclick=()=>{audio.stopAll();status()}
document.addEventListener('click',async event=>{
  const sound=event.target.dataset.sound, loop=event.target.dataset.loop
  if(!sound&&!loop)return
  await audio.unlock()
  if(sound)audio.play(sound)
  if(loop){if(loop==='music')await audio.loadMusic();audio.loops.has(loop)?audio.stopLoop(loop):audio.startLoop(loop,loop==='music'?{}:params())}
  status()
})
$('#impact').onclick=async()=>{await audio.unlock();const strength=Number($('#strength').value),name=impactLevel(strength);if(name)audio.play(name,{volume:Math.min(1,.35+strength*.45),position:params().position});status()}
$('#strength').oninput=()=>$('#strengthLabel').value=`${$('#strength').value} m/s`
for(const id of ['rpm','load','position'])$('#'+id).oninput=()=>{ $('#rpmLabel').value=$('#rpm').value;for(const name of ['motor','gears','tyres'])audio.updateLoop(name,params());status() }
document.addEventListener('visibilitychange',()=>{audio.setHidden(document.hidden);status()})
setInterval(status,500)
window.__bricklabAudioDebug=()=>audio.debug()
