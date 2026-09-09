import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

await import('../basic-parts-pack.js')
await import('../technic-parts-pack-v2.js')
await import('../lab-parts.js')
await import('../vehicle-parts-v1.js')
await import('../parts3/mechanical-parts-pack-v3.js')
await import('../parts3/parts-3-extra-v1.js')
await import('../parts3/parts-3-wheel-dimensions.js')
await import('../parts3/parts-3-steering-upgrade.js')
await import('../parts4/mechanical-driveline-v1.js')
await import('../parts4/steering-suspension-v1.js')
await import('../parts5/visual-overhaul-v1.js')
await import('../parts5/visual-refinement-v2.js')
await import('../parts5/driveline-refinement-v2.js')
await import('../parts5/structural-refinement-v2.js')
await import('../parts5/detail-refinement-v3.js')
await import('../parts6/realism-refinement-v1.js')
await import('../parts6/precision-refinement-v2.js')
await import('../parts6/mechanical-realism-v1.js')
await import('../parts6/nominal-dimension-fidelity-v1.js')
await import('../parts6/hero-mechanical-fidelity-v2.js')
await import('../parts6/fine-mechanical-detail-v3.js')
await import('../parts6/core-molded-fidelity-v4.js')
await import('../parts6/steering-carrier-fidelity-v8.js')
await import('../parts6/hero-micro-detail-v5.js')
await import('../parts6/connector-fidelity-v1.js')
await import('../parts6/interface-fit-refinement-v2.js')
await import('../parts6/interface-physics-safety-v1.js')
await import('../parts6/steering-carrier-port-dedup-v8.js')
await import('../parts6/rack-gear-fidelity-v1.js')

const { findPart } = await import('../parts.js')

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x15191c)
const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100)
camera.position.set(12, 10, 18)

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.shadowMap.enabled = true
document.getElementById('stage').append(renderer.domElement)

const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true
controls.target.set(0, 1.4, 2.5)
controls.minDistance = 4
controls.maxDistance = 38

scene.add(new THREE.HemisphereLight(0xdde8f2, 0x34393e, 2.2))
const key = new THREE.DirectionalLight(0xffffff, 3.2)
key.position.set(10, 18, 11)
key.castShadow = true
scene.add(key)
const fill = new THREE.DirectionalLight(0xb6d1ff, 0.9)
fill.position.set(-8, 7, -9)
scene.add(fill)

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(28, 28),
  new THREE.MeshStandardMaterial({ color: 0x20262a, roughness: 0.94 }),
)
floor.rotation.x = -Math.PI / 2
floor.receiveShadow = true
scene.add(floor)

function partObject(id, color = null) {
  const part = findPart(id)
  if (!part) throw new Error(`Missing PARTS-6 fit QA part: ${id}`)
  const object = part.create(color ?? part.defaultColor)
  object.userData.partId = id
  object.traverse(child => {
    if (!child.isMesh) return
    child.castShadow = true
    child.receiveShadow = true
  })
  return object
}

function connectorBy(object, selector) {
  const part = findPart(object.userData.partId)
  const port = typeof selector === 'string'
    ? part.connectors.find(item => item.id === selector)
    : part.connectors.find(selector)
  if (!port) throw new Error(`Missing connector on ${part.id}`)
  return port
}

function connectorWorld(object, selector) {
  const port = connectorBy(object, selector)
  object.updateMatrixWorld(true)
  const position = new THREE.Vector3(...port.position).applyMatrix4(object.matrixWorld)
  const axis = new THREE.Vector3(...port.axis).applyQuaternion(object.getWorldQuaternion(new THREE.Quaternion())).normalize()
  return { port, position, axis }
}

function alignConnector(object, selector, targetPosition, targetAxis, twistRad = 0) {
  const port = connectorBy(object, selector)
  const localAxis = new THREE.Vector3(...port.axis).normalize()
  const q = new THREE.Quaternion().setFromUnitVectors(localAxis, targetAxis.clone().normalize())
  if (Math.abs(twistRad) > 1e-8) {
    const twist = new THREE.Quaternion().setFromAxisAngle(targetAxis.clone().normalize(), twistRad)
    q.premultiply(twist)
  }
  object.quaternion.copy(q)
  const offset = new THREE.Vector3(...port.position).applyQuaternion(object.quaternion)
  object.position.copy(targetPosition).sub(offset)
  object.updateMatrixWorld(true)
  return object
}

function addLabelPad(x, z, w, d = 3.2) {
  const pad = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, d), new THREE.MeshStandardMaterial({ color: 0x1b211e, roughness: 0.9 }))
  pad.position.set(x, 0.03, z)
  pad.receiveShadow = true
  scene.add(pad)
}

const assemblies = {}

// 1) Real pin fit through a liftarm hole. The actual connector centres are used;
// nothing is visually teleported into place by hard-coded bore offsets.
{
  const beam = partObject('beam-3', 0xd7263d)
  beam.position.set(-5.0, 0, -2.4)
  scene.add(beam)
  beam.updateMatrixWorld(true)
  const hole = connectorWorld(beam, item => item.type === 'pin-hole' && Math.abs(item.position[0]) < 0.1)

  const pin = partObject('pin', 0x2b2d31)
  alignConnector(pin, item => item.type === 'pin', hole.position, hole.axis)
  scene.add(pin)
  assemblies.pinBeam = { beam, pin, hole }
  addLabelPad(-5.0, -2.4, 4.2)
}

// 2) Cross axle + spur gear + bush. The gear is rotated from its local Y shaft
// axis onto the real axle X axis, then the bush shares that same shaft line.
{
  const axle = partObject('axle-9', 0x2b2d31)
  axle.position.set(0.0, 0.35, -2.4)
  scene.add(axle)
  axle.updateMatrixWorld(true)
  const shaftAxis = new THREE.Vector3(1, 0, 0)
  const shaftCenter = new THREE.Vector3(0.0, 0.67, -2.4)

  const gear = partObject('gear-20', 0xd9d9d9)
  alignConnector(gear, item => item.type === 'axle-hole', shaftCenter, shaftAxis, Math.PI / 20)
  scene.add(gear)

  const bush = partObject('bush', 0xadb5bd)
  alignConnector(bush, item => item.type === 'axle-hole', shaftCenter.clone().addScaledVector(shaftAxis, 0.68), shaftAxis)
  scene.add(bush)
  assemblies.axleGearBush = { axle, gear, bush }
  addLabelPad(0.0, -2.4, 5.0)
}

// 3) Steering knuckle + free-spinning hub + wheel. This is the most important
// visible fit chain for vehicles: pin-hole bearing -> hub axle -> keyed wheel bore.
{
  const knuckle = partObject('steering-knuckle', 0x2d69c4)
  knuckle.position.set(4.9, 0, -2.5)
  scene.add(knuckle)
  knuckle.updateMatrixWorld(true)
  const bearing = connectorWorld(knuckle, 'wheel-bearing')

  const hub = partObject('wheel-hub', 0x59626c)
  alignConnector(hub, 'bearing', bearing.position, bearing.axis)
  scene.add(hub)
  hub.updateMatrixWorld(true)
  const stub = connectorWorld(hub, 'wheel-stub')

  const wheel = partObject('wheel-road', 0xd9d9d9)
  alignConnector(wheel, item => item.type === 'axle-hole', stub.position, stub.axis)
  scene.add(wheel)
  assemblies.steeringHubWheel = { knuckle, hub, wheel }
  addLabelPad(5.1, -2.4, 5.4)
}

// 4) Tie rod eye on the semantic steering-arm pin. This should read as a hinge,
// not as two floating visual parts whose connector points merely happen to overlap.
{
  const knuckle = partObject('steering-knuckle', 0x2d69c4)
  knuckle.position.set(-3.5, 0, 3.0)
  scene.add(knuckle)
  knuckle.updateMatrixWorld(true)
  const arm = connectorWorld(knuckle, 'steering-arm')

  const tieRod = partObject('steering-tie-rod-5', 0xadb5bd)
  alignConnector(tieRod, 'eye-left', arm.position, arm.axis, Math.PI / 2)
  scene.add(tieRod)
  assemblies.tieRodKnuckle = { knuckle, tieRod }
  addLabelPad(-1.5, 3.0, 7.8)
}

function resize() {
  const width = window.innerWidth
  const height = window.innerHeight
  camera.aspect = width / Math.max(1, height)
  camera.updateProjectionMatrix()
  renderer.setSize(width, height, false)
}
window.addEventListener('resize', resize)
resize()

renderer.setAnimationLoop(() => {
  controls.update()
  renderer.render(scene, camera)
})

globalThis.BrickLabParts6FitQA = Object.freeze({ scene, camera, renderer, assemblies })
