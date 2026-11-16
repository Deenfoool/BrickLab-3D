import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { TransformControls } from 'three/addons/controls/TransformControls.js'
import { partMesh, parts } from './parts.js?v=editor-retry'
import { worldPort } from './placement.js'
import { technic } from '../mechanics/catalog.js'

export function createScene(host, models) {
  const world = new THREE.Scene()
  world.background = new THREE.Color('#16191f')
  world.fog = new THREE.FogExp2('#16191f', .0017)
  const camera = new THREE.PerspectiveCamera(42, 1, 1, 14000)
  let renderer
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true })
  } catch (cause) {
    throw Object.assign(new Error('Failed to initialize WebGL', { cause }), { code: 'webgl-init' })
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75))
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
  world.add(gizmo.getHelper(), pivot)
  gizmo.addEventListener('change', invalidate)
  gizmo.addEventListener('dragging-changed', ({ value }) => { controls.enabled = !value })
  controls.maxPolarAngle = Math.PI * .98
  controls.minDistance = 42
  controls.maxDistance = 1800
  const floor = new THREE.GridHelper(1600, 80, 0x475267, 0x2b3039)
  const axes = new THREE.AxesHelper(52)
  axes.position.y = .08
  world.add(floor, axes, new THREE.HemisphereLight(0xddeaff, 0x424956, 2.05))
  for (const [color, power, position] of [[0xffe5c3, 2.4, [100, 190, 95]], [0xc6d8ff, 1.55, [-110, 80, -155]]]) {
    const light = new THREE.DirectionalLight(color, power)
    light.position.fromArray(position)
    world.add(light)
  }
  const solids = new THREE.Group()
  world.add(solids)
  const objects = new Map()
  const selection = new THREE.BoxHelper(new THREE.Object3D(), 0xffb01b)
  selection.visible = false
  world.add(selection)
  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(2.8, 14, 10),
    new THREE.MeshBasicMaterial({ color: 0xffbd42, depthTest: false }),
  )
  marker.renderOrder = 5
  marker.visible = false
  world.add(marker)
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0))
  const ray = new THREE.Raycaster()
  let ghost
  let frame = null
  let active = true
  let selectedId
  let fitted = false
  let lastAspect
  const resize = new ResizeObserver(() => {
    const { clientWidth: width, clientHeight: height } = host
    if (!width || !height) return
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    renderer.setSize(width, height, false)
    if (!fitted || Math.min(1, lastAspect) !== Math.min(1, camera.aspect)) resetView()
    lastAspect = camera.aspect
    invalidate()
  })
  resize.observe(host)
  controls.addEventListener('change', invalidate)

  function invalidate() {
    if (!active || frame !== null) return
    frame = requestAnimationFrame(() => {
      frame = null
      renderer.render(world, camera)
    })
  }

  function resetView() {
    const bounds = new THREE.Box3().setFromObject(solids)
    const center = bounds.isEmpty() ? new THREE.Vector3(0, 12, 0) : bounds.getCenter(new THREE.Vector3())
    const size = bounds.isEmpty() ? 0 : bounds.getSize(new THREE.Vector3()).length()
    const distance = Math.max(175, size * 1.65 / Math.min(1, camera.aspect))
    controls.target.copy(center)
    camera.position.copy(center).add(new THREE.Vector3(1, .83, 1.35).normalize().multiplyScalar(distance))
    controls.update()
    fitted = Boolean(lastAspect)
    invalidate()
  }

  function setParts(list) {
    const keep = new Set(list.map(part => part.id))
    for (const [id, object] of objects) {
      if (keep.has(id)) continue
      solids.remove(object)
      object.userData.finish.dispose()
      objects.delete(id)
    }
    for (const part of list) {
      let object = objects.get(part.id)
      if (!object) {
        object = partMesh(models.get(part.design), part.color ?? parts[part.design].color)
        object.userData.id = part.id
        objects.set(part.id, object)
        solids.add(object)
      }
      object.position.fromArray(part.position)
      object.quaternion.fromArray(part.rotation)
      object.userData.finish.color.set(part.color ?? parts[part.design].color)
      object.updateMatrixWorld(true)
    }
    select(selectedId)
  }

  function select(id) {
    selectedId = id
    const object = objects.get(id)
    selection.visible = Boolean(object?.visible)
    if (selection.visible) selection.setFromObject(object)
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
      ghost.userData.finish.color.set(blocked ? '#ef6161' : candidate ? '#ffd16a' : (part.color ?? parts[part.design].color))
    }
    marker.visible = Boolean(candidate)
    if (candidate) {
      marker.position.copy(candidate)
      marker.material.color.set(blocked ? '#ef6161' : '#ffbd42')
    }
    invalidate()
  }

  function setMoving(id, enabled) {
    const object = objects.get(id)
    if (object) object.visible = !enabled
    select(selectedId)
  }

  function setTool(mode, part) {
    if (gizmo.dragging) return
    if (!mode || !part) {
      gizmo.enabled = false
      gizmo.detach()
      return
    }
    pivot.position.fromArray(part.position)
    pivot.quaternion.fromArray(part.rotation)
    gizmo.setMode(mode)
    gizmo.enabled = true
    gizmo.attach(pivot)
    invalidate()
  }

  function gizmoPose(part) {
    return { ...part, position: pivot.position.toArray(), rotation: pivot.quaternion.toArray() }
  }

  function cancelGizmo() {
    gizmo.axis = null
    gizmo.dragging = false
  }

  function pointer(event, pick = true) {
    const rect = canvas.getBoundingClientRect()
    camera.updateMatrixWorld()
    ray.setFromCamera(new THREE.Vector2(
      2 * (event.clientX - rect.left) / rect.width - 1,
      1 - 2 * (event.clientY - rect.top) / rect.height,
    ), camera)
    return {
      ray: ray.ray,
      ground: ray.ray.intersectPlane(plane, new THREE.Vector3()),
      hit: pick ? ray.intersectObjects([...objects.values()].filter(object => object.visible), true)[0]?.object.parent.userData.id : undefined,
    }
  }

  function pixelDistance(point, event) {
    const rect = canvas.getBoundingClientRect()
    if (new THREE.Vector3().subVectors(point, camera.position).dot(camera.getWorldDirection(new THREE.Vector3())) <= 0) return Infinity
    const projected = point.clone().project(camera)
    return Math.hypot(rect.left + (projected.x + 1) * rect.width / 2 - event.clientX,
      rect.top + (1 - projected.y) * rect.height / 2 - event.clientY)
  }

  function turn(list, ratios, angle) {
    for (const part of list) {
      const ratio = ratios[part.id]
      if (ratio === undefined) continue
      const object = objects.get(part.id)
      const port = technic[part.design][0]
      const localAxis = new THREE.Vector3().fromArray(port.axis)
      const pivot = worldPort(part, port).start
      object.quaternion.fromArray(part.rotation).multiply(new THREE.Quaternion().setFromAxisAngle(localAxis, angle * ratio))
      object.position.copy(pivot).sub(new THREE.Vector3().fromArray(port.start).applyQuaternion(object.quaternion))
      object.updateMatrixWorld(true)
    }
    select(selectedId)
  }

  function dispose() {
    active = false
    if (frame !== null) cancelAnimationFrame(frame)
    resize.disconnect()
    controls.dispose()
    gizmo.dispose()
    setGhost(null)
    for (const object of objects.values()) object.userData.finish.dispose()
    for (const object of [floor, axes, selection, marker]) {
      object.geometry.dispose()
      object.material.dispose()
    }
    renderer.dispose()
    renderer.forceContextLoss()
    canvas.remove()
  }

  resetView()
  return { canvas, camera, gizmo, gizmoPose, cancelGizmo, setTool, pointer, pixelDistance, setParts, select, setGhost, setMoving, resetView, turn, dispose }
}
