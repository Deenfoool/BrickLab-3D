import { AudioManager } from './manager.js'
import { MechanicalAudio, connectorSound } from './mechanics.js'
import { mountAudioSettings } from './settings.js'
import { observeAudioEvents } from '../audio-events.js'
export function installAudio() {
  const audio=new AudioManager(), mechanics=new MechanicalAudio(audio)
  let unlocked=false, semanticAt=-Infinity, mode='build'
  async function unlock() {
    if(await audio.unlock()) {
      if(!unlocked) {
        unlocked=true
        void audio.preload()
        if(mode==='build') audio.startLoop('music')
      }
    }
  }
  document.addEventListener('pointerdown',async event=>{
    await unlock()
    if(mode==='build' && event.target.closest?.('.part-card[data-part]') && !event.target.closest?.('.catalog-favorite')) audio.play('pickup')
  },{passive:true})
  document.addEventListener('keydown',unlock)
  document.addEventListener('visibilitychange',()=>audio.setHidden(document.hidden))
  window.addEventListener('pagehide',()=>audio.setHidden(true))
  window.addEventListener('pageshow',()=>audio.setHidden(document.hidden))
  mountAudioSettings(audio,document.querySelector('.top-actions')??document.body)
  observeAudioEvents((type,detail)=>{
    if(type==='physics-step'){ mechanics.contactsAfterStep(detail.session,detail.dt);return }
    if(type==='frame'){ mode=detail.mode; mechanics.update(detail.session,mode,detail.camera);return }
    semanticAt=performance.now()
    if(type==='connector') {
      audio.play('connect',{volume:.72,cooldown:70,key:`connect:${connectorSound(detail)}`})
    } else if(type==='notification') {
      const text=String(detail.text??'')
      const duplicateCount=Number(text.match(/^(\d+)\s+parts?\s+duplicated/i)?.[1]??0)
      if(/project imported/i.test(text) || duplicateCount>1) audio.play('scatter',{volume:.58,cooldown:250})
      else if(/could not|failed|error/i.test(text)) audio.play('error')
      else if(/select .*first|at least|reserved|not grouped/i.test(text)) audio.play('warning')
      else if(/saved|exported|imported|grouped|duplicated/i.test(text)) audio.play('success')
    } else audio.play(type,detail)
  })
  window.addEventListener('bricklab:gearmeshsnap',()=>{semanticAt=performance.now();audio.play('gear-mesh')})
  window.addEventListener('bricklab:languagechange',()=>{semanticAt=performance.now();audio.play('language')})
  // Bubble phase follows successful editor handlers. Suppress redundant generic clicks.
  document.addEventListener('click',event=>{
    const button=event.target.closest?.('button')
    if(!button || button.disabled || button.closest('.bricklab-audio-settings') || performance.now()-semanticAt<80) return
    audio.play(button.hasAttribute('aria-pressed')?'toggle':'click')
  })
  document.addEventListener('change',event=>{
    if(event.target.closest?.('.bricklab-audio-settings')) return
    if(event.target.matches?.('select,input[type=checkbox]')) audio.play('toggle')
  })
  window.__bricklabAudioDebug=()=>audio.debug()
  window.BrickLabAudio=audio
  return audio
}