export const PERFORMANCE_LDRAW_SYNC_VERSION = 'performance-ldraw-sync-v1.0.0'

let timer=0
function editorObjects(){
  return globalThis.BrickLabSubsystems?.editor?.objects?.()
    ?? globalThis.BrickLabConnectorV4?.objects?.()
    ?? []
}
function scheduleRefresh(){
  const engine=globalThis.BrickLabPerformance
  if(!engine?.rebuild)return
  clearTimeout(timer)
  timer=setTimeout(()=>{
    timer=0
    const objects=editorObjects()
    if(objects.length)void engine.rebuild(objects,'ldraw-visual-ready').catch(error=>console.debug?.('[BrickLab Performance] LDraw spatial refresh failed.',error))
  },120)
}

if(typeof window!=='undefined')window.addEventListener('bricklab:ldrawloaded',scheduleRefresh)
