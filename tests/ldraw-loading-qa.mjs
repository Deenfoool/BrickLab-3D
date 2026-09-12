import { preloadLDrawPrototype,registerLDrawPart } from '../ldraw/runtime-v3.js'
const out=document.getElementById('result')
document.querySelectorAll('[data-file]').forEach(button=>button.onclick=async()=>{
  document.querySelectorAll('button').forEach(node=>node.disabled=true)
  const file=button.dataset.file,started=performance.now()
  out.textContent=`Загрузка ${file}…`
  try{
    const payload=await preloadLDrawPrototype(file)
    const coldMs=performance.now()-started
    const def=registerLDrawPart({file}),first=def.create(),again=performance.now()
    await preloadLDrawPrototype(file)
    const second=def.create(),warmMs=performance.now()-again
    let meshes=0,vertices=0,placeholder=false
    second.traverse(node=>{if(node.isMesh){meshes++;vertices+=node.geometry.attributes.position?.count||0}if(node.userData.ldrawPlaceholder)placeholder=true})
    out.textContent=JSON.stringify({file,coldMs:Math.round(coldMs),warmMs:Math.round(warmMs),meshes,vertices,placeholder,status:second.userData.ldraw.status,size:payload.metadata.size,sharedGeometry:first.children[0]?.children[0]?.geometry===second.children[0]?.children[0]?.geometry},null,2)
  }catch(error){out.textContent=`ERROR ${file}: ${error.message}`}
  finally{document.querySelectorAll('button').forEach(node=>node.disabled=false)}
})
