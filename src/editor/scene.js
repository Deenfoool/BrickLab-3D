import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { TransformControls } from 'three/addons/controls/TransformControls.js'
import { partMesh, parts } from './parts.js?v=system-complete'
import { createBeltScene } from './belt-scene.js?v=belt-drive'
import { createMotorCables } from './motor-cables.js?v=system-complete'
import { createPartOutlines } from './part-outlines.js?v=transmission-map-1'
import { portsFor } from '../mechanics/catalog.js?v=volvo-spur-gears'
import { snapGrid } from './model.js?v=belt-drive'
import { readPreference } from '../menu/preferences.js?v=full-settings'

const unitScale = [1, 1, 1]
const axesUp = new THREE.Vector3(0, 1, 0)

export function createScene(host, models) {
  const world = new THREE.Scene()
  const editorSky = new THREE.Color('#16191f')
  const trackSky = new THREE.Color('#b8d2e7')
  const editorFog = new THREE.FogExp2(editorSky, .0017)
  const trackFog = new THREE.FogExp2(trackSky, .000023)
  world.background = editorSky
  world.fog = editorFog
  const perspectiveCamera = new THREE.PerspectiveCamera(42, 1, 1, 14000)
  const orthographicCamera = new THREE.OrthographicCamera(-1,1,1,-1,1,14000)
  let camera=perspectiveCamera,orthoHalf=100,aspect=1
  const perspectiveHalf=distance=>Math.tan(THREE.MathUtils.degToRad(21))*distance
  function updateProjection(){perspectiveCamera.aspect=aspect;perspectiveCamera.updateProjectionMatrix();orthographicCamera.aspect=aspect;orthographicCamera.left=-orthoHalf*aspect;orthographicCamera.right=orthoHalf*aspect;orthographicCamera.top=orthoHalf;orthographicCamera.bottom=-orthoHalf;orthographicCamera.updateProjectionMatrix()}
  function fitOrthographic(){if(camera===orthographicCamera){orthoHalf=perspectiveHalf(camera.position.distanceTo(controls.target));camera.zoom=1;updateProjection()}}
  let renderer
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true })
  } catch (cause) {
    throw Object.assign(new Error('Failed to initialize WebGL', { cause }), { code: 'webgl-init' })
  }
  const qualityCaps = { low: .75, balanced: 1.25, high: 1.75 }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, qualityCaps[readPreference('quality')] ?? 1.75))
  renderer.setClearColor('#16191f')
  renderer.outputColorSpace = THREE.SRGBColorSpace
  const canvas = renderer.domElement
  canvas.tabIndex = 0
  host.prepend(canvas)
  const controls = new OrbitControls(camera, canvas)
  controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE }
  const gizmo = new TransformControls(camera, canvas)
  gizmo.setSize(.82)
  gizmo.enabled = false
  const pivot = new THREE.Object3D()
  const pivotOffset = new THREE.Vector3()
  let highlights = { ids: new Set(), color: 0xff6666, throughParts: true }
  world.add(gizmo.getHelper(), pivot)
  gizmo.addEventListener('change', invalidate)
  gizmo.addEventListener('dragging-changed', ({ value }) => { controls.enabled = !value })
  controls.zoomToCursor = true
  controls.maxPolarAngle = Math.PI * .98
  controls.minDistance = 42
  controls.maxDistance = 1800
  const gridSize = 1600
  const floor = new THREE.GridHelper(gridSize, gridSize / snapGrid, 0x475267, 0x2b3039)
  let showGrid = readPreference('grid') !== 'off'
  let showAxes = readPreference('axes') !== 'off'
  floor.visible = showGrid
  const frontArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(), 50, 0xffb01b, 15, 10)
  frontArrow.visible = false
  const driveOffset = new THREE.Vector3()
  const axes = new THREE.AxesHelper(52)
  axes.position.y = .08
  axes.visible = showAxes
  world.add(floor, axes, frontArrow, new THREE.HemisphereLight(0xddeaff, 0x424956, 2.05))
  for (const [color, power, position] of [[0xffe5c3, 2.4, [100, 190, 95]], [0xc6d8ff, 1.55, [-110, 80, -155]]]) {
    const light = new THREE.DirectionalLight(color, power)
    light.position.fromArray(position)
    world.add(light)
  }
  const solids = new THREE.Group()
  world.add(solids)
  const objects = new Map()
  let hidden = new Set()
  let movingId
  const motorCables = createMotorCables(solids, id => {
    const object = objects.get(id)
    return object?.visible ? { position: object.position.toArray(), rotation: object.quaternion.toArray() } : undefined
  }, invalidate)
  const belts = createBeltScene(solids, id => {
    const part = hidden.has(id) ? undefined : objects.get(id)
    return part && { design: part.userData.design, position: part.position.toArray(), rotation: part.quaternion.toArray() }
  }, invalidate)
  const outlines = createPartOutlines(renderer)
  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(2.8, 14, 10),
    new THREE.MeshBasicMaterial({ color: 0xffbd42, depthTest: false }),
  )
  marker.renderOrder = 5
  marker.visible = false
  world.add(marker)
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0))
  const ray = new THREE.Raycaster()
  let driveMap
  let ghost
  let frame = null
  let active = true
  let presenting = false
  let boxSelectionEnabled = false
  let selectedId
  let fitted = false
  let viewportMeasured = false
  const resize = new ResizeObserver(() => {
    const { clientWidth: width, clientHeight: height } = host
    if (!width || !height) return
    aspect=width/height;updateProjection()
    renderer.setSize(width, height, false)
    // Opening a dock changes the viewport size, not the user's camera pose.
    viewportMeasured = true
    if (!fitted) resetView()
    invalidate()
  })
  resize.observe(host)
  controls.addEventListener('change', invalidate)
  // Only real user camera interactions count towards onboarding.
  let userCameraStart
  controls.addEventListener('start', () => {
    userCameraStart = { camera: camera.position.clone(), target: controls.target.clone() }
  })
  controls.addEventListener('end', () => {
    if (!userCameraStart) return
    const moved = userCameraStart.camera.distanceTo(camera.position) > .05 ||
      userCameraStart.target.distanceTo(controls.target) > .05
    userCameraStart = undefined
    if (moved) canvas.dispatchEvent(new Event('bricklab-camera-interaction'))
  })
  canvas.addEventListener('wheel', () => {
    canvas.dispatchEvent(new Event('bricklab-camera-interaction'))
  }, { passive: true })

  let onViewChange
  canvas.addEventListener('webglcontextrestored', invalidate)
  let remoteFrameTime=0
  function invalidate() {
    if (!active || frame !== null) return
    frame = requestAnimationFrame(now => {
      frame = null
      if (!active || renderer.getContext().isContextLost()) return
      const remoteMoving=animateRemote(Math.min(50,now-(remoteFrameTime||now-16)));remoteFrameTime=now
      if (presenting) {
        const helpers=[marker,frontArrow,gizmo.getHelper(),ghost,connectorPoints,...[...remoteMeshes.values()].map(r=>r.mesh)].filter(Boolean)
        const visibility=helpers.map(object=>object.visible)
        try { for(const object of helpers)object.visible=false;renderer.render(world,camera) }
        finally { helpers.forEach((object,index)=>object.visible=visibility[index]) }
      } else {
        renderer.render(world, camera)
        outlines.render(camera, selectedId, highlights)
      }
      onViewChange?.()
      if(remoteMoving)invalidate()
    })
  }

  function setCameraMode(mode){const next=mode==='orthographic'?orthographicCamera:perspectiveCamera;if(next===camera||gizmo.dragging)return;const distance=camera.position.distanceTo(controls.target);next.position.copy(camera.position);next.quaternion.copy(camera.quaternion);if(next===orthographicCamera){orthoHalf=perspectiveHalf(distance);next.zoom=1}else{const desired=orthoHalf/Math.max(.001,camera.zoom)/Math.tan(THREE.MathUtils.degToRad(21));next.position.copy(controls.target).addScaledVector(camera.position.clone().sub(controls.target).normalize(),desired)}camera=next;controls.object=camera;gizmo.camera=camera;updateProjection();controls.update();invalidate()}
  function resetView() {
    solids.updateWorldMatrix(true, true)
    const bounds = new THREE.Box3()
    for (const object of objects.values()) if (object.visible) bounds.expandByObject(object)
    const center = bounds.isEmpty() ? new THREE.Vector3(0, 12, 0) : bounds.getCenter(new THREE.Vector3())
    const size = bounds.isEmpty() ? 0 : bounds.getSize(new THREE.Vector3()).length()
    const distance = Math.max(175, size * 1.65 / Math.min(1, camera.aspect))
    controls.target.copy(center)
    camera.position.copy(center).add(new THREE.Vector3(1, .83, 1.35).normalize().multiplyScalar(distance))
    fitOrthographic();controls.update()
    fitted = viewportMeasured
    invalidate()
  }

  function setParts(list) {
    const keep = new Map(list.map(part => [part.id, part.design]))
    for (const [id, object] of objects) {
      if (keep.get(id) === object.userData.design) continue
      solids.remove(object)
      outlines.untrack(id)
      object.userData.finish.dispose()
      objects.delete(id)
    }
    for (const part of list) {
      let object = objects.get(part.id)
      if (!object) {
        object = partMesh(models.get(part.design), part.color ?? parts[part.design].color)
        object.userData.id = part.id
        object.userData.design = part.design
        objects.set(part.id, object)
        solids.add(object)
        outlines.track(part.id, object)
      }
      object.position.fromArray(part.position)
      object.quaternion.fromArray(part.rotation)
      object.scale.set(part.mirrored ? -1 : 1, 1, 1)
      object.userData.finish.color.set(part.color ?? parts[part.design].color)
      object.updateMatrixWorld(true)
      syncVisibility(part.id, object)
    }
    motorCables.set(list)
    if(wireframe)setWireframe(true)
    refreshConnectorPoints()
    belts.update()
    invalidate()
  }

  const connectorPoints=new THREE.Group();world.add(connectorPoints)
  const pointGeometry=new THREE.SphereGeometry(1.7,8,6),pointMale=new THREE.MeshBasicMaterial({color:0x55c4ff,depthTest:true}),pointFemale=new THREE.MeshBasicMaterial({color:0xffbe55,depthTest:true});let pointsVisible=false,wireframe=false
  function refreshConnectorPoints(){connectorPoints.clear();if(!pointsVisible)return;let count=0;for(const [id,o] of objects){if(!o.visible)continue;for(const p of portsFor(o.userData.design)){if(p.legacy||p.role==='gear'||!Array.isArray(p.start))continue;if(++count>1500)return;const mesh=new THREE.Mesh(pointGeometry,p.gender==='M'?pointMale:pointFemale);mesh.position.fromArray(p.start).applyMatrix4(o.matrixWorld);connectorPoints.add(mesh)}}}
  function setConnectorPoints(value){pointsVisible=!!value;refreshConnectorPoints();invalidate()}
  function setWireframe(value){wireframe=!!value;for(const o of objects.values())o.traverse(child=>{if(child.isMesh)for(const m of Array.isArray(child.material)?child.material:[child.material])if(m&&'wireframe' in m)m.wireframe=wireframe});invalidate()}
  const remoteMeshes=new Map()
  const remoteHidden=new Set()
  function syncVisibility(id, object) {
    object.visible = !hidden.has(id) && id !== movingId && !remoteHidden.has(id)
  }

  function setHidden(ids) {
    hidden = ids
    for (const [id, object] of objects) syncVisibility(id, object)
    refreshConnectorPoints()
    motorCables.update()
    belts.update()
    invalidate()
  }

  function remotePreview(entries,localIds=[]){
    const local=new Set(localIds),keep=new Set(),claimed=new Set()
    remoteHidden.clear()
    for(const {client,preview} of entries)for(const p of preview??[]){
      if(local.has(p.id)||claimed.has(p.id)||hidden.has(p.id)||!models.has(p.design))continue
      claimed.add(p.id)
      const k=client+':'+p.id
      let r=remoteMeshes.get(k)
      if(r&&r.design!==p.design){world.remove(r.mesh);r.mesh.userData.finish.dispose();remoteMeshes.delete(k);r=null}
      if(!r){const mesh=partMesh(models.get(p.design),p.color??parts[p.design].color,true);const original=objects.get(p.id);mesh.position.copy(original?.position??new THREE.Vector3(...p.position));mesh.quaternion.copy(original?.quaternion??new THREE.Quaternion(...p.rotation));world.add(mesh);r={mesh,design:p.design};remoteMeshes.set(k,r)}
      keep.add(k);r.position=new THREE.Vector3(...p.position);r.rotation=new THREE.Quaternion(...p.rotation).normalize();r.mesh.scale.x=p.mirrored?-1:1;r.mesh.userData.finish.color.set(p.color??parts[p.design].color)
      if(objects.has(p.id))remoteHidden.add(p.id)
    }
    for(const [k,r] of remoteMeshes)if(!keep.has(k)){world.remove(r.mesh);r.mesh.userData.finish.dispose();remoteMeshes.delete(k)}
    for(const [id,o] of objects)syncVisibility(id,o)
    invalidate()
  }
  function animateRemote(dt){
    let moving=false
    for(const r of remoteMeshes.values()){
      const alpha=1-Math.exp(-dt/55)
      r.mesh.position.lerp(r.position,alpha);r.mesh.quaternion.slerp(r.rotation,alpha)
      if(r.mesh.position.distanceToSquared(r.position)>.0001||r.mesh.quaternion.angleTo(r.rotation)>.0001)moving=true
    }
    return moving
  }
  function select(id) {
    selectedId = id
    invalidate()
  }

  function setGhost(part, candidate, blocked = false) {
    if (!part || ghost?.userData.design !== part.design) {
      if (ghost) {
        world.remove(ghost)
        ghost.userData.finish.dispose()
        ghost = null
      }
    }
    if (part) {
      if (!ghost) {
        ghost = partMesh(models.get(part.design), parts[part.design].color, true)
        ghost.userData.design = part.design
        world.add(ghost)
      }
      ghost.position.fromArray(part.position)
      ghost.quaternion.fromArray(part.rotation)
      ghost.scale.x = part.mirrored ? -1 : 1
      ghost.userData.finish.color.set(blocked ? '#ef6161' : candidate ? '#ffd16a' : (part.color ?? parts[part.design].color))
    }
    marker.visible = Boolean(candidate)
    if (candidate) {
      marker.position.copy(candidate)
      marker.material.color.set(blocked ? '#ef6161' : '#ffbd42')
    }
    invalidate()
  }

  const ghostRoot = new THREE.Group()
  let ghostItems
  function setGroupGhost(items, anchor, pose) {
    if (ghostItems !== items) {
      for (const mesh of ghostRoot.children) mesh.userData.finish.dispose()
      ghostRoot.clear()
      ghostItems = items
      for (const part of items) {
        const mesh = partMesh(models.get(part.design), part.color ?? parts[part.design].color, true)
        mesh.position.fromArray(part.position)
        mesh.quaternion.fromArray(part.rotation)
        mesh.scale.x = part.mirrored ? -1 : 1
        mesh.updateMatrix()
        mesh.matrixAutoUpdate = false
        ghostRoot.add(mesh)
      }
      if (items.length) world.add(ghostRoot)
      else world.remove(ghostRoot)
    }
    if (items.length) {
      ghostRoot.quaternion.fromArray(pose.rotation).multiply(new THREE.Quaternion().fromArray(anchor.rotation).invert())
      ghostRoot.position.fromArray(anchor.position).applyQuaternion(ghostRoot.quaternion).negate().add(new THREE.Vector3(...pose.position))
    }
    invalidate()
  }

  function setMoving(id, enabled) {
    if (enabled) movingId = id
    else if (movingId === id) movingId = undefined
    const object = objects.get(id)
    if (object) syncVisibility(id, object)
    invalidate()
  }

  const jointFrame = new THREE.Quaternion()
  let jointOrigin
  function setTool(mode, part, ids = [], joint) {
    if (gizmo.dragging) return
    if (!mode || !part || hidden.has(part.id)) {
      gizmo.enabled = false
      gizmo.detach()
      return
    }
    pivotOffset.copy(models.get(part.design).bounds.getCenter(new THREE.Vector3()))
    if (part.mirrored) pivotOffset.x *= -1
    pivot.quaternion.fromArray(part.rotation)
    if (ids.length > 1) {
      const bounds = new THREE.Box3()
      for (const id of ids) {
        const object = objects.get(id)
        if (object?.visible) bounds.expandByObject(object, true)
      }
      pivotOffset.copy(bounds.getCenter(new THREE.Vector3()).sub(new THREE.Vector3().fromArray(part.position))
        .applyQuaternion(pivot.quaternion.clone().invert()))
    }
    pivot.position.fromArray(part.position).add(pivotOffset.clone().applyQuaternion(pivot.quaternion))
    jointOrigin = joint?.start
    gizmo.setSpace(joint ? 'local' : 'world')
    gizmo.showY = gizmo.showZ = !joint
    if (joint) {
      jointFrame.setFromUnitVectors(new THREE.Vector3(1, 0, 0), joint.axis)
      pivot.position.copy(joint.start)
      pivot.quaternion.copy(jointFrame)
    }
    gizmo.setMode(mode)
    gizmo.enabled = !presenting
    gizmo.attach(pivot)
    invalidate()
  }

  function previewParts(parts) {
    for (const part of parts) {
      const object = objects.get(part.id)
      object.position.fromArray(part.position)
      object.quaternion.fromArray(part.rotation)
      object.scale.fromArray(part.previewScale ?? unitScale)
      if (part.mirrored) object.scale.x *= -1
      object.updateMatrixWorld(true)
    }
    motorCables.update()
    belts.update()
    invalidate()
  }

  function gizmoPose(part) {
    if (jointOrigin) {
      const delta = pivot.quaternion.clone().multiply(jointFrame.clone().invert())
      return { ...part, position: new THREE.Vector3(...part.position).sub(jointOrigin).applyQuaternion(delta).add(jointOrigin).toArray(),
        rotation: delta.multiply(new THREE.Quaternion(...part.rotation)).toArray() }
    }
    return { ...part, position: pivot.position.clone().sub(pivotOffset.clone().applyQuaternion(pivot.quaternion)).toArray(), rotation: pivot.quaternion.toArray() }
  }

  function cancelGizmo() {
    gizmo.axis = null
    gizmo.dragging = false
  }

  function snapProjector() {
    const rect = canvas.getBoundingClientRect()
    camera.updateMatrixWorld()
    const clip = new THREE.Vector3()
    return point => {
      clip.copy(point).project(camera)
      return { clientX: rect.left + (clip.x + 1) * rect.width / 2,
        clientY: rect.top + (1 - clip.y) * rect.height / 2, visible: clip.z >= -1 && clip.z <= 1 }
    }
  }

  function project(point) {
    const rect = canvas.getBoundingClientRect()
    camera.updateMatrixWorld()
    const clip = point.clone().project(camera)
    return { clientX: rect.left + (clip.x + 1) * rect.width / 2,
      clientY: rect.top + (1 - clip.y) * rect.height / 2, visible: clip.z >= -1 && clip.z <= 1 }
  }

  function focus(ids) {
    const bounds = new THREE.Box3()
    for (const id of ids) {
      const object = objects.get(id)
      if (object?.visible) bounds.expandByObject(object, true)
    }
    if (bounds.isEmpty()) return
    const direction = camera.position.clone().sub(controls.target).normalize()
    bounds.getCenter(controls.target)
    const size = bounds.getSize(new THREE.Vector3()).length()
    camera.position.copy(controls.target).addScaledVector(direction,
      Math.min(controls.maxDistance, Math.max(48, size * 1.65 / Math.min(1, camera.aspect))))
    fitOrthographic();controls.update()
    invalidate()
  }

  function highlight(ids, color = 0xff6666, throughParts = true, codes = null) {
    highlights = { ids: new Set(ids), color, throughParts, codes }
    invalidate()
  }

  function selectInRect({ left, top, right, bottom, canvasWidth, canvasHeight }) {
    const width = Math.max(1, right - left)
    const height = Math.max(1, bottom - top)
    // Remap the requested region to the full clip volume, including the camera's depth limits.
    const view = new THREE.Matrix4().set(
      canvasWidth / width, 0, 0, (canvasWidth - left - right) / width,
      0, canvasHeight / height, 0, (top + bottom - canvasHeight) / height,
      0, 0, 1, 0,
      0, 0, 0, 1,
    )
    camera.updateMatrixWorld()
    view.multiply(camera.projectionMatrix).multiply(camera.matrixWorldInverse)
    const localClip = new THREE.Matrix4()
    const frustum = new THREE.Frustum()
    const ids = []
    for (const [id, object] of objects) {
      if (!object.visible) continue
      // Test the part's local bounds so rotated beams keep a tight selection volume.
      localClip.multiplyMatrices(view, object.matrixWorld)
      frustum.setFromProjectionMatrix(localClip, camera.coordinateSystem)
      if (frustum.intersectsBox(models.get(object.userData.design).bounds)) ids.push(id)
    }
    return ids
  }

  function enableBoxSelect(enabled) {
    boxSelectionEnabled=enabled
    controls.touches.ONE = enabled && !presenting ? null : THREE.TOUCH.ROTATE
  }

  function pointer(event, pick = true) {
    const rect = canvas.getBoundingClientRect()
    camera.updateMatrixWorld()
    ray.setFromCamera(new THREE.Vector2(
      2 * (event.clientX - rect.left) / rect.width - 1,
      1 - 2 * (event.clientY - rect.top) / rect.height,
    ), camera)
    const intersection=pick?ray.intersectObjects([...objects.values()].filter(object=>object.visible),true)[0]:undefined
    return {
      ray: ray.ray,
      ground: ray.ray.intersectPlane(plane, new THREE.Vector3()),
      hit: intersection?.object.parent.userData.id,
      point: intersection?.point,
    }
  }

  function pixelDistance(point, event) {
    const rect = canvas.getBoundingClientRect()
    if (new THREE.Vector3().subVectors(point, camera.position).dot(camera.getWorldDirection(new THREE.Vector3())) <= 0) return Infinity
    const projected = point.clone().project(camera)
    return Math.hypot(rect.left + (projected.x + 1) * rect.width / 2 - event.clientX,
      rect.top + (1 - projected.y) * rect.height / 2 - event.clientY)
  }

  function driveArrow(start, direction) {
    frontArrow.visible = Boolean(start)
    if (start) {
      frontArrow.position.copy(start)
      frontArrow.setDirection(direction)
    }
    invalidate()
  }

  function setDriveMap(group) {
    if(group)setCameraMode('perspective')
    if (driveMap) world.remove(driveMap)
    driveMap = group
    if (group) world.add(group)
    floor.visible = !group && showGrid
    axes.visible = !group && showAxes
    world.background = group ? trackSky : editorSky
    world.fog = group ? trackFog : editorFog
    camera.near = group ? 5 : 1
    camera.far = group ? 125000 : 14000
    camera.updateProjectionMatrix()
    controls.maxDistance = group ? 8500 : 1800
    invalidate()
  }

  function driveTransform(origin, position, yaw, tilt, scale = 1) {
    solids.quaternion.setFromAxisAngle(axesUp, yaw).premultiply(tilt)
    solids.scale.setScalar(scale)
    solids.position.copy(origin).add(position).sub(origin.clone().multiplyScalar(scale).applyQuaternion(solids.quaternion))
    const offset = position.clone().sub(driveOffset)
    camera.position.add(offset)
    controls.target.add(offset)
    driveOffset.copy(position)
    floor.position.set(Math.round(position.x / 200) * 200, 0, Math.round(position.z / 200) * 200)
    controls.update()
    invalidate()
  }

  function clearDriveTransform() {
    solids.position.set(0, 0, 0)
    solids.quaternion.identity()
    solids.scale.setScalar(1)
    driveOffset.set(0, 0, 0)
    floor.position.set(0, 0, 0)
    invalidate()
  }

  function dispose() {
    remotePreview([])
    connectorPoints.clear();pointGeometry.dispose();pointMale.dispose();pointFemale.dispose()
    active = false
    canvas.removeEventListener('webglcontextrestored', invalidate)
    if (frame !== null) cancelAnimationFrame(frame)
    resize.disconnect()
    controls.dispose()
    outlines.dispose()
    belts.dispose()
    motorCables.dispose()
    gizmo.dispose()
    setGhost(null)
    setGroupGhost([])
    for (const object of objects.values()) object.userData.finish.dispose()
    for (const object of [floor, axes, marker]) {
      object.geometry.dispose()
      object.material.dispose()
    }
    frontArrow.dispose()
    renderer.dispose()
    canvas.remove()
  }

  function capturePublication(){
    if(!active||!canvas.width||!canvas.height)return null
    const helpers=[floor,axes,frontArrow,marker,gizmo.getHelper(),ghost,connectorPoints,...[...remoteMeshes.values()].map(r=>r.mesh)].filter(o=>o&&typeof o.visible==='boolean')
    const visibility=helpers.map(o=>o.visible)
    try{
      for(const o of helpers)o.visible=false
      renderer.render(world,camera)
      const shot=canvas.ownerDocument.createElement('canvas'),scale=Math.min(1,1200/Math.max(canvas.width,canvas.height))
      shot.width=Math.max(1,Math.round(canvas.width*scale));shot.height=Math.max(1,Math.round(canvas.height*scale))
      shot.getContext('2d').drawImage(canvas,0,0,shot.width,shot.height)
      return new Promise(resolve=>shot.toBlob(resolve,'image/webp',.85))
    }finally{helpers.forEach((o,i)=>o.visible=visibility[i]);invalidate()}
  }
  resetView()
  return { capturePublication, selectionCenter(ids) {
    const bounds = new THREE.Box3()
    for (const id of ids) if (objects.has(id)) bounds.expandByObject(objects.get(id), true)
    return bounds.getCenter(new THREE.Vector3()).toArray()
  }, motorCables, setWorkspacePresentation(value) {
    if(presenting===value)return
    presenting=value
    gizmo.enabled=!value&&Boolean(gizmo.object)
    enableBoxSelect(boxSelectionEnabled)
    invalidate()
  }, setWorkspaceHelpers(grid, axis) {
    if (showGrid === grid && showAxes === axis) return
    showGrid = grid; showAxes = axis
    floor.visible = !driveMap && showGrid; axes.visible = !driveMap && showAxes
    invalidate()
  }, setWiresVisible(value) { motorCables.visible(value); invalidate() }, canvas, get camera(){return camera},get cameraMode(){return camera===orthographicCamera?'orthographic':'perspective'},setCameraMode,setConnectorPoints,setWireframe,gizmo, belts, snapProjector, project, focus, highlight, remotePreview, watchView(callback) { onViewChange = callback }, gizmoPose, previewParts, driveArrow, setDriveMap, driveTransform, clearDriveTransform, cancelGizmo, setTool, pointer, pixelDistance, setParts, setHidden, select, selectInRect, enableBoxSelect, setGhost, setGroupGhost, setMoving, resetView, dispose }
}
