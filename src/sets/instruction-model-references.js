import {modelCandidates,normalizedModelImage} from './instruction-model-match.js?v=recognition-v8'
import {resolveInventoryPart} from '../catalog/part-resolver.js?v=catalog-engine-1'
const angles=[[1,1,1],[-1,1,1],[1,1,-1],[-1,1,-1],[1,-1,1],[-1,-1,-1],[1,.15,0],[0,.15,1],[0,1,.01],[0,-1,.01]]
const yieldFrame=()=>new Promise(resolve=>setTimeout(resolve,0))
// Separate, short-lived context: never mutate or dispose editor-owned geometry.
export async function buildModelReferences(inventory,signal){
 signal.throwIfAborted()
 if(!globalThis.document)return []
 const [THREE,lib]=await Promise.all([import('three'),import('../editor/parts.js?v=system-complete')])
 signal.throwIfAborted()
 const candidates=modelCandidates(inventory,item=>resolveInventoryPart(item,lib.parts).model)
 if(!candidates)return []
 const groups=new Map()
 for(const item of candidates){const list=groups.get(item.model.design)??[];list.push(item);groups.set(item.model.design,list)}
 let renderer
 try{
  renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true,powerPreference:'low-power'})
  renderer.setSize(112,112,false);renderer.setClearColor(0,0)
  const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-1,1,1,-1,.01,10000)
  scene.add(new THREE.HemisphereLight(0xffffff,0x909090,2.1))
  const light=new THREE.DirectionalLight(0xffffff,1.8);light.position.set(1,2,2);scene.add(light)
  const canvas=document.createElement('canvas');canvas.width=canvas.height=112
  const ctx=canvas.getContext('2d',{willReadFrequently:true})
  const references=[]
  for(const variants of groups.values()){
   signal.throwIfAborted()
   const part=variants[0].model
   let model
   try{
    model=await lib.loadPartModel(part,{smoothNormals:false})
    signal.throwIfAborted()
    if(!model?.meshes?.length||!model.bounds)return []
    const center=model.bounds.getCenter(new THREE.Vector3()),radius=model.bounds.getSize(new THREE.Vector3()).length()/2
    if(!Number.isFinite(radius)||radius<=0)return []
    const frame=radius*1.14
    camera.left=-frame;camera.right=frame;camera.top=frame;camera.bottom=-frame
    camera.near=.01;camera.far=radius*6+10;camera.updateProjectionMatrix()
    for(const variant of variants){
     const object=lib.partMesh(model,variant.color);scene.add(object)
     const start=references.length
     try{
      for(const angle of angles){
       signal.throwIfAborted()
       camera.position.copy(center).addScaledVector(new THREE.Vector3(...angle).normalize(),radius*3+1)
       camera.lookAt(center);renderer.render(scene,camera)
       ctx.clearRect(0,0,112,112);ctx.drawImage(renderer.domElement,0,0)
       const view=normalizedModelImage(ctx.getImageData(0,0,112,112).data,112,112)
       if(view)references.push({...view,item:variant.item})
      }
     }finally{scene.remove(object);object.userData.finish?.dispose()}
     if(references.length-start<angles.length)return [] // Every candidate must have full angle coverage.
     await yieldFrame()
    }
   }finally{
    // Core geometry is shared by the library loader. Packed geometry is owned here.
    if(part.pack&&model)for(const geometry of model.meshes)geometry.dispose()
   }
  }
  return references
 }catch(error){signal.throwIfAborted();return []}
 finally{renderer?.dispose();renderer?.forceContextLoss()}
}
