import * as THREE from 'three'
export async function configureDifferential(){
  const editor=globalThis.BrickLabEditorAdapterV1, mechanics=globalThis.BrickLabMechanicsNext
  const root=editor.objects()[0]?.parent
  if(!root)throw Error('Open an editor project with a seed part first')
  document.querySelector('.mode[data-mode="build"]').click()
  editor.createNew()
  for(const o of [...editor.objects()])root.remove(o)
  mechanics.clearProjectState({keepAuthority:false})
  const parts=[['62821','browser-carrier',[0,3,0],[0,0,0]],['18575','browser-driver',[1.85,3.45,0],[0,Math.PI/2,0]],['6589','browser-left',[0,4,.75],[0,0,0]],['6589','browser-right',[0,4,-.75],[0,Math.PI,0]],['6589','browser-spider',[0,5.75,-.8],[Math.PI/2,0,0]]]
  const objects=[]
  for(const [code,instanceId,position,rotation]of parts){
    await BrickLabLDraw.registerByFile(`${code}.dat`)
    await BrickLabLDraw.preload(`${code}.dat`)
    objects.push(editor.insertPart(`ldraw-${code}`,{parent:root,instanceId,position,rotation,persist:false}))
  }
  mechanics.syncScene()
  let gate
  for(let i=0;i<120;i++){
    gate=await mechanics.prepareMigration()
    if(!mechanics.status().nativeConnectivity.pending)break
    await new Promise(resolve=>setTimeout(resolve,250))
  }
  if(!gate.pass)throw Error(`Migration blocked: ${JSON.stringify(gate)}`)
  const handoff=mechanics.adoptNativeProjectOwnership()
  if(!handoff.accepted)throw Error(`Handoff blocked: ${JSON.stringify(handoff)}`)
  const commits=[]
  for(const instanceId of ['browser-left','browser-right','browser-spider']){
    const candidate=mechanics.findCandidate(instanceId,['browser-carrier'],{captureDistanceStud:1})
    if(!candidate)throw Error(`Native seat candidate missing: ${instanceId}`)
    const result=await mechanics.commitCandidate(candidate)
    if(!result.accepted)throw Error(`Seat commit rejected: ${JSON.stringify(result)}`)
    commits.push({instanceId,record:result.record})
  }
  mechanics.syncScene()
  const discovery=mechanics.transmissionCompiler.discovery
  return {commits,discovery,gate:mechanics.migrationGate(),objects:objects.map(o=>({instanceId:o.userData.instanceId,partId:o.userData.partId,position:o.position.toArray()}))}
}
export function pointerFor(instanceId){
  const editor=BrickLabEditorAdapterV1,viewport=document.querySelector('#viewport'),rect=viewport.getBoundingClientRect(),cam=BrickLabViewportV1.camera()
  const object=editor.objectById(instanceId), center=editor.viewportPoint(object,{offsetY:0})
  const ray=new THREE.Raycaster()
  for(let y=-100;y<=100;y+=5)for(let x=-100;x<=100;x+=5){
    const px=center.x+x,py=center.y+y
    ray.setFromCamera(new THREE.Vector2(px/rect.width*2-1,1-py/rect.height*2),cam)
    const hit=ray.intersectObjects(editor.objects(),true)[0]
    let picked=hit?.object
    while(picked&&!picked.userData?.instanceId)picked=picked.parent
    if(picked===object)return{x:Math.round(px+rect.left),y:Math.round(py+rect.top)}
  }
  throw Error(`No visible pick surface: ${instanceId}`)
}

export async function configurePackages(){
  const editor=BrickLabEditorAdapterV1,m=BrickLabMechanicsNext,root=editor.objects()[0].parent
  document.querySelector('.mode[data-mode="build"]').click()
  editor.createNew()
  for(const o of [...editor.objects()])root.remove(o)
  m.clearProjectState({keepAuthority:false})
  BrickLabConnectorV4.clearGraph()
  m.compoundDecompositions.clear()
  m.syncScene()
  if(!m.adoptNativeProjectOwnership().accepted)throw Error('Empty native BUILD handoff failed')
  const commits=[]
  for(const [partId,pos]of [['gearbox-fnr',[-7,2,-4]],['open-differential',[0,2,-4]],['worm-drive-8',[7,2,-4]],['universal-joint-30',[-7,2,4]],['cv-joint-30',[0,2,4]]]){
    const id=`qa-${partId}`
    const box=editor.insertPart(partId,{parent:root,instanceId:id,position:pos,rotation:[0,0,0],persist:false})
    const def=BrickLabSubsystems.parts.get(partId)
    for(const port of def.connectors.filter(c=>['input','output','left','right'].includes(c.id))){
      const shaftId=`${id}-${port.id}`
      const shaft=editor.insertPart('axle-3',{parent:root,instanceId:shaftId,persist:false,position:[0,0,0],rotation:[0,0,0]})
      shaft.quaternion.setFromUnitVectors(new THREE.Vector3(1,0,0),new THREE.Vector3(...port.axis).normalize())
      const offset=new THREE.Vector3(0,.32,0).applyQuaternion(shaft.quaternion)
      shaft.position.copy(new THREE.Vector3(...pos).add(new THREE.Vector3(...port.position)).sub(offset))
      const outward=port.id==='left'||(port.id==='input'&&Math.abs(port.axis[0])>.8)?-1:1
      shaft.position.addScaledVector(new THREE.Vector3(...port.axis).normalize(),outward)
      shaft.updateMatrixWorld(true)
    }
    m.syncScene()
  }
  const motor=editor.insertPart('motor',{parent:root,instanceId:'qa-motor',position:[7,2,4],rotation:[0,0,0],persist:false})
  const gear=editor.insertPart('gear-20',{parent:root,instanceId:'qa-motor-gear',position:[8.3,2.9,4],rotation:[0,0,-Math.PI/2],persist:false})
  m.syncScene()
  for(const [partId]of [['gearbox-fnr'],['open-differential'],['worm-drive-8'],['universal-joint-30'],['cv-joint-30']]){
    const id=`qa-${partId}`,def=BrickLabSubsystems.parts.get(partId)
    for(const port of def.connectors.filter(c=>['input','output','left','right'].includes(c.id))){
      const shaftId=`${id}-${port.id}`
      const candidate=m.findCandidate(shaftId,[id],{captureDistanceStud:.6})
      if(!candidate)throw Error(`Missing package candidate: ${shaftId}`)
      const result=await m.commitCandidate(candidate)
      if(!result.accepted)throw Error(`Rejected package candidate: ${JSON.stringify(result)}`)
      commits.push({shaftId,record:result.record})
    }
  }
  const motorCandidate=m.findCandidate('qa-motor',['qa-motor-gear'],{captureDistanceStud:1})
  if(!motorCandidate)throw Error('Motor/gear candidate missing')
  const motorCommit=await m.commitCandidate(motorCandidate)
  if(!motorCommit.accepted)throw Error(`Motor commit rejected: ${JSON.stringify(motorCommit)}`)
  m.syncScene()
  return {commits,motorCommit,gate:await m.prepareMigration(),discovery:m.transmissionCompiler.discovery,physics:m.physicsPreview()}
}
export async function configureDragChain(){
  const e=BrickLabEditorAdapterV1,m=BrickLabMechanicsNext,root=e.objects()[0].parent
  document.querySelector('.mode[data-mode="build"]').click();e.createNew();m.syncScene()
  if(!m.adoptNativeProjectOwnership().accepted)throw Error('Drag fixture handoff failed')
  for(const [partId,id,position,rotation]of [['gear-20','drag-gear20',[0,3,0],[0,0,-Math.PI/2]],['gear-12','drag-gear12',[0,3,2.018],[0,0,-Math.PI/2]],['axle-3','drag-axle',[.4,2.68,2.018],[0,0,0]],['wheel','drag-wheel',[1.4,1.85,2.018],[0,0,0]]])e.insertPart(partId,{parent:root,instanceId:id,position,rotation,persist:false})
  m.syncScene()
  for(const target of ['drag-gear12','drag-wheel']){
    const c=m.findCandidate('drag-axle',[target],{captureDistanceStud:.6})
    if(!c)throw Error(`Missing chain candidate ${target}`)
    const r=await m.commitCandidate(c);if(!r.accepted)throw Error(`Chain commit failed ${JSON.stringify(r)}`)
  }
  return {gate:await m.prepareMigration(),discovery:m.transmissionCompiler.discovery}
}

export async function configureRack(){
  const e=BrickLabEditorAdapterV1,m=BrickLabMechanicsNext,root=e.objects()[0].parent
  document.querySelector('.mode[data-mode="build"]').click();e.createNew();m.syncScene()
  if(!m.adoptNativeProjectOwnership().accepted)throw Error('Rack fixture handoff failed')
  for(const [partId,id,position,rotation]of [['steering-rack-7','qa-rack',[0,3,0],[0,0,0]],['gear-12','qa-pinion',[0,4.535,-.4],[Math.PI/2,0,0]],['steering-rack-guide','qa-guide',[0,3,0],[0,0,0]]])e.insertPart(partId,{parent:root,instanceId:id,position,rotation,persist:false})
  m.syncScene();const c=m.findCandidate('qa-rack',['qa-guide'],{captureDistanceStud:1})
  if(!c)throw Error('Missing rack slider candidate')
  const commit=await m.commitCandidate(c)
  if(!commit.accepted)throw Error('Rejected rack guide connection')
  return {gate:await m.prepareMigration(),discovery:m.transmissionCompiler.discovery}
}

// Browser contract probes use real Three.js matrices, separate from the editor graph.
export async function validateDegreesOfFreedom(){
  const {createBodyDescriptor,createEndpointDescriptor}=await import('../mechanics-next/core/model.js')
  const {createConstraint}=await import('../mechanics-next/constraints/dof.js')
  const {createAssemblyGraph}=await import('../mechanics-next/topology/assembly-graph.js')
  const {revalidateSceneConnections}=await import('../mechanics-next/physics/scene-connection-revalidator.js')
  const results=[]
  for(const [label,kind,pose,expected]of [['move','fixed',{x:1},false],['rotate','fixed',{rx:1},false],['axial disengagement','cylindrical',{y:3},false],['fixed orientation drift','fixed',{ry:1},false],['spherical free rotation','spherical',{rx:1,ry:.4},true],['revolute free twist','revolute',{ry:1},true],['prismatic permitted travel','prismatic',{y:.2},true]]){
    const graph=createAssemblyGraph(),records=[]
    for(const [id,gender]of [['a','male'],['b','female']]){
      const body=createBodyDescriptor({id,instanceId:id,partId:id});graph.addBody(body)
      const endpoint=createEndpointDescriptor({id:`${id}-end`,bodyId:id,family:kind==='spherical'?'sphere':'cylinder',gender,frame:{positionStud:[0,0,0],orientationBrickLab:[1,0,0,0,1,0,0,0,1]},profile:kind==='spherical'?{radiusLdu:10}:{centered:false,caps:'none',sections:[{shape:'R',radiusLdu:6,lengthLdu:40}]},capabilities:['slide','rotate'],metadata:{semantics:{semanticKind:kind==='spherical'?(gender==='male'?'ball':'socket'):(gender==='male'?'technic-pin':'technic-pin-hole')}}})
      const object=new THREE.Object3D()
      if(id==='a'){object.position.set(pose.x||0,pose.y||0,0);object.rotation.set(pose.rx||0,pose.ry||0,0)}
      object.updateMatrixWorld(true)
      records.push({instance:{body,endpoints:[endpoint],descriptor:{classification:{role:'connector',capabilities:{},properties:{}}},transmissions:[]},object,pose:{position:[0,0,0],quaternion:[0,0,0,1]},visualOffsetStud:[0,0,0]})
    }
    graph.addConstraint(createConstraint({id:'link',bodyA:'a',bodyB:'b',kind,metadata:{observedConnectionId:'observed',instanceAId:'a',instanceBId:'b',endpointAId:'a-end',endpointBId:'b-end',connectionGeometry:{anchorDistanceStud:0,axialSeparationStud:0,lateralDistanceStud:0,axisDot:1,relativeOrientation:[1,0,0,0,1,0,0,0,1]}}}))
    const result=revalidateSceneConnections({graph,records,releaseConstraint:()=>null})
    if((result.released===0)!==expected)throw Error(`${label}: ${JSON.stringify(result)}`)
    results.push({label,valid:result.released===0,reasons:result.failures.map(f=>f.reason)})
  }
  return results
}
