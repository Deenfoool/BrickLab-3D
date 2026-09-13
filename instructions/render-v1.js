import * as THREE from 'three'

export const INSTRUCTION_RENDER_VERSION='instruction-render-v1.0.0'
const ACCENT=0x2fa36b

function materialClone(material,highlight=false){
  if(!material)return material
  if(Array.isArray(material))return material.map(item=>materialClone(item,highlight))
  const copy=material.clone?.()??material
  if(highlight&&copy!==material){
    if(copy.color?.isColor)copy.color.lerp(new THREE.Color(ACCENT),.58)
    if(copy.emissive?.isColor){copy.emissive.setHex(ACCENT);copy.emissiveIntensity=.2}
    copy.needsUpdate=true
  }
  return copy
}

function shallowRenderable(source,highlight){
  let target
  if(source.isMesh)target=new THREE.Mesh(source.geometry,materialClone(source.material,highlight))
  else if(source.isLineSegments)target=new THREE.LineSegments(source.geometry,materialClone(source.material,highlight))
  else if(source.isLine)target=new THREE.Line(source.geometry,materialClone(source.material,highlight))
  else if(source.isPoints)target=new THREE.Points(source.geometry,materialClone(source.material,highlight))
  else if(source.isSprite)target=new THREE.Sprite(materialClone(source.material,highlight))
  else if(source.isGroup)target=new THREE.Group()
  else target=new THREE.Object3D()
  target.name=source.name
  target.position.copy(source.position);target.quaternion.copy(source.quaternion);target.scale.copy(source.scale)
  target.visible=source.visible;target.renderOrder=source.renderOrder
  target.castShadow=Boolean(source.castShadow);target.receiveShadow=Boolean(source.receiveShadow)
  for(const child of source.children??[])target.add(shallowRenderable(child,highlight))
  return target
}

function setSnapshotPose(object,part){
  object.position.fromArray(part.position??[0,0,0])
  object.rotation.set(...(part.rotation??[0,0,0]))
  object.updateMatrixWorld(true)
}

function fitCamera(camera,box,aspect){
  if(box.isEmpty()){camera.position.set(7,6,9);camera.lookAt(0,0,0);return}
  const center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3())
  const radius=Math.max(size.x,size.y,size.z,1)*.72
  const fov=THREE.MathUtils.degToRad(camera.fov),distance=Math.max(5,radius/Math.tan(fov/2)*1.32)
  const direction=new THREE.Vector3(1.15,.8,1.35).normalize()
  camera.aspect=aspect;camera.position.copy(center).addScaledVector(direction,distance);camera.near=Math.max(.01,distance-radius*3);camera.far=distance+radius*5+30
  camera.lookAt(center);camera.updateProjectionMatrix()
}

function disposeScene(root){
  root.traverse(object=>{
    const materials=Array.isArray(object.material)?object.material:[object.material]
    for(const material of materials)material?.dispose?.()
  })
}

export class InstructionSceneRenderer{
  constructor({subsystems=globalThis.BrickLabSubsystems,width=1040,height=660}={}){
    if(!subsystems?.editor?.objects)throw new Error('BrickLab editor subsystem is unavailable')
    this.subsystems=subsystems;this.width=width;this.height=height
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,preserveDrawingBuffer:false,powerPreference:'high-performance'})
    this.renderer.setPixelRatio(1);this.renderer.setSize(width,height,false);this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.05
  }
  render({project,includedIds,newIds=[],insertions=[],exploded=true}){
    const scene=new THREE.Scene();scene.background=new THREE.Color(0xf3f5f4)
    scene.add(new THREE.HemisphereLight(0xffffff,0xb9c0bc,2.0))
    const key=new THREE.DirectionalLight(0xffffff,3.1);key.position.set(7,11,8);scene.add(key)
    const fill=new THREE.DirectionalLight(0xdde9ff,1.25);fill.position.set(-8,5,-5);scene.add(fill)
    const root=new THREE.Group();scene.add(root)
    const live=new Map(this.subsystems.editor.objects().map(object=>[object?.userData?.instanceId,object]))
    const partById=new Map((project.parts??[]).map(part=>[part.instanceId,part])),fresh=new Set(newIds),missing=[]
    const freshClones=[]
    for(const id of includedIds){
      const part=partById.get(id),source=live.get(id)
      if(!part||!source){missing.push(id);continue}
      const clone=shallowRenderable(source,fresh.has(id));setSnapshotPose(clone,part)
      if(fresh.has(id)&&exploded){
        const index=newIds.indexOf(id),vector=insertions[index]?.vector??[0,1,0]
        const direction=new THREE.Vector3(...vector).normalize(),distance=1.15
        clone.position.addScaledVector(direction,distance);clone.updateMatrixWorld(true)
        freshClones.push({clone,direction,distance})
      }
      root.add(clone)
    }
    root.updateMatrixWorld(true)
    const box=new THREE.Box3().setFromObject(root)
    for(const item of freshClones){
      const center=new THREE.Box3().setFromObject(item.clone).getCenter(new THREE.Vector3())
      const direction=item.direction.clone().negate(),length=Math.max(.65,item.distance*.8)
      const arrow=new THREE.ArrowHelper(direction,center,length,0x1c7ed6,.28,.16);root.add(arrow)
    }
    const camera=new THREE.PerspectiveCamera(34,this.width/this.height,.01,1000);fitCamera(camera,box,this.width/this.height)
    const floorY=box.isEmpty()?-1:box.min.y-.22
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(120,120),new THREE.MeshStandardMaterial({color:0xe8ece9,roughness:1}))
    floor.rotation.x=-Math.PI/2;floor.position.y=floorY;floor.receiveShadow=true;scene.add(floor)
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap
    this.renderer.render(scene,camera)
    const output=document.createElement('canvas');output.width=this.width;output.height=this.height
    output.getContext('2d').drawImage(this.renderer.domElement,0,0)
    disposeScene(scene)
    return {canvas:output,missing}
  }
  dispose(){this.renderer?.dispose?.();this.renderer?.forceContextLoss?.();this.renderer=null}
}
