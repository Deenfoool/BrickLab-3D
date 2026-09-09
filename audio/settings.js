export function mountAudioSettings(audio, parent=document.body) {
  const panel=document.createElement('details'); panel.className='bricklab-audio-settings'
  panel.innerHTML=`<summary>♫ <span data-audio-label="sound">Звук</span></summary><div class="audio-settings-body"><label><span data-audio-label="master">Общая громкость</span><input aria-label="Master Volume" data-volume="master" type="range" min="0" max="100"><output></output></label><label><span data-audio-label="sfx">Эффекты</span><input aria-label="Sound Effects" data-volume="sfx" type="range" min="0" max="100"><output></output></label><label><span data-audio-label="music">Музыка</span><input aria-label="Music" data-volume="music" type="range" min="0" max="100"><output></output></label><label><input type="checkbox" data-mute><span data-audio-label="mute">Без звука</span></label><a href="./audio-qa.html" target="_blank" rel="noopener">Audio QA ↗</a></div>`
  for(const input of panel.querySelectorAll('[data-volume]')) {
    input.value=Math.round(audio.settings[input.dataset.volume]*100)
    const update=()=>{ input.nextElementSibling.value=`${input.value}%` }
    update(); input.oninput=()=>{audio.setSettings({[input.dataset.volume]:Number(input.value)/100});update()}
  }
  const mute=panel.querySelector('[data-mute]'); mute.checked=audio.settings.mute
  mute.onchange=()=>audio.setSettings({mute:mute.checked})
  function translate() {
    const ru=(document.documentElement.lang||'ru').startsWith('ru')
    const labels=ru?{sound:'Звук',master:'Общая громкость',sfx:'Эффекты',music:'Музыка',mute:'Без звука'}:{sound:'Audio',master:'Master Volume',sfx:'Sound Effects',music:'Music',mute:'Mute'}
    panel.querySelectorAll('[data-audio-label]').forEach(el=>el.textContent=labels[el.dataset.audioLabel])
  }
  window.addEventListener('bricklab:languagechange',translate); translate(); parent.append(panel)
  if(!document.getElementById('audio-style')) {
    const style=document.createElement('style'); style.id='audio-style';style.textContent=`.bricklab-audio-settings{position:relative;font:12px system-ui;color:#d9e2e6;z-index:150}.bricklab-audio-settings summary{cursor:pointer;padding:7px;border:1px solid #41494d;border-radius:6px;list-style:none}.audio-settings-body{position:absolute;right:0;top:36px;background:#20272c;padding:16px;border:1px solid #48545c;border-radius:9px;width:260px;box-shadow:0 12px 30px #0008}.audio-settings-body label{display:flex;align-items:center;gap:8px;margin-bottom:14px;flex-wrap:wrap}.audio-settings-body label>span:first-child{width:100%}.audio-settings-body input[type=range]{width:185px;accent-color:#74e6a6}.audio-settings-body a{color:#9ae7bd}`;document.head.append(style)
  }
  return panel
}
