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

const { findPart } = await import('../parts.js')
const { gearPitchRadius } = await import('../parts5/part-geometry-metrics-v1.js')

const stage = document.getElementById('stage')
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x16191c)
scene.fog = new THREE.Fog(0x16191c, 52, 88)

const camera = new THREE.PerspectiveCamera(43, 1, 0.1, 170)
camera.position.set(18, 21, 36)

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
stage.append(renderer.domElement)

const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true
controls.target.set(0.6, 2.0, 6.0)
controls.minDistance = 5
controls.maxDistance = 72

scene.add(new THREE.HemisphereLight(0xdde8f2, 0x30363c, 2.15))
const key = new THREE.DirectionalLight(0xffffff, 3.0)
key.position.set(11, 22, 13)
key.castShadow = true
key.shadow.mapSize.set(2048, 2048)
scene.add(key)
const fill = new THREE.DirectionalLight(0xb8d2ff, 1.0)
fill.position.set(-13, 9, -10)
scene.add(fill)
const rimLight = new THREE.DirectionalLight(0xfff1d6, 0.55)
rimLight.position.set(4, 7, -18)
scene.add(rimLight)

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(58, 58),
  new THREE.MeshStandardMaterial({ color: 0x20252a, roughness: 0.93, metalness: 0 }),
)
floor.rotation.x = -Math.PI / 2
floor.position.y = -0.02
floor.receiveShadow = true
scene.add(floor)

const grid = new THREE.GridHelper(58, 58, 0x3b444c, 0x2b3136)
grid.position.y = 0.005
grid.material.transparent = true
grid.material.opacity = 0.35
scene.add(grid)

function prepare(object) {
  object.traverse(child => {
    if (!child.isMesh) return
    child.castShadow = true
    child.receiveShadow = true
  })
  return object
}

function partObject(id, color) {
  const part = findPart(id)
  if (!part) throw new Error(`Missing QA part: ${id}`)
  const object = prepare(part.create(color ?? part.defaultColor))
  object.userData.partId = id
  return object
}

function addPart(id, position, rotation = null, color = null) {
  const object = partObject(id, color)
  object.position.fromArray(position)
  if (rotation) object.rotation.set(...rotation)
  scene.add(object)
  return object
}

function setConnectorCenter(object, desiredCenter) {
  const part = findPart(object.userData.partId)
  const connector = part.connectors.find(item => item.type === 'axle-hole')
  object.updateMatrixWorld(true)
  const localOffset = new THREE.Vector3(...connector.position).applyQuaternion(object.quaternion)
  object.position.copy(desiredCenter).sub(localOffset)
  object.updateMatrixWorld(true)
}

function addPad(x, z, width, depth = 3.0) {
  const pad = new THREE.Mesh(
    new THREE.BoxGeometry(width, 0.06, depth),
    new THREE.MeshStandardMaterial({ color: 0x1b211e, roughness: 0.88, metalness: 0 }),
  )
  pad.position.set(x, 0.025, z)
  pad.receiveShadow = true
  scene.add(pad)
}

const wheelIds = ['wheel-small', 'wheel-narrow', 'wheel-road', 'wheel-medium', 'wheel', 'wheel-offroad-large', 'wheel-tractor']
const wheelXs = [-9.2, -6.5, -3.7, -0.7, 2.5, 6.0, 10.0]
for (let i = 0; i < wheelIds.length; i += 1) addPart(wheelIds[i], [wheelXs[i], 0, -8.4])

const spurTeeth = [8, 12, 16, 20, 24, 36, 40]
const spurXs = [-8.2, -5.5, -2.8, 0, 3.0, 6.2, 9.8]
for (let i = 0; i < spurTeeth.length; i += 1) addPart(`gear-${spurTeeth[i]}`, [spurXs[i], 0, -3.6])

{
  const a = addPart('gear-12', [-7.4, 0, 1.0])
  const b = addPart('gear-20', [-7.4 + gearPitchRadius(12) + gearPitchRadius(20), 0, 1.0])
  b.rotation.y = Math.PI / 20
  a.updateMatrixWorld(true)
  b.updateMatrixWorld(true)
}

{
  const a = addPart('gear-8', [-2.6, 0, 1.0])
  const b = addPart('gear-24', [-2.6 + gearPitchRadius(8) + gearPitchRadius(24), 0, 1.0])
  b.rotation.y = Math.PI / 24
  a.updateMatrixWorld(true)
  b.updateMatrixWorld(true)
}

{
  const fixed = partObject('bevel-gear-20')
  const moving = partObject('bevel-gear-12')
  moving.rotation.z = -Math.PI / 2
  fixed.updateMatrixWorld(true)
  moving.updateMatrixWorld(true)
  const fixedCenter = new THREE.Vector3(6.8, 0.72, 1.5)
  const apex = fixedCenter.clone().add(new THREE.Vector3(0, gearPitchRadius(12), 0))
  const movingCenter = apex.clone().add(new THREE.Vector3(-gearPitchRadius(20), 0, 0))
  setConnectorCenter(fixed, fixedCenter)
  setConnectorCenter(moving, movingCenter)
  scene.add(fixed, moving)
}

addPad(-6.5, 1.0, 4.4)
addPad(-1.7, 1.0, 4.0)
addPad(6.0, 1.5, 5.2)

// Structural baseline.
addPart('beam-7', [-7.8, 0, 5.2])
addPart('technic-brick-1x4', [-3.0, 0, 5.2])
addPart('axle-9', [1.0, 0, 5.2], [0, Math.PI / 7, 0])
addPart('pin', [6.2, 0.15, 5.2], [Math.PI / 2, 0, Math.PI / 5])
addPart('bush', [9.3, 0.1, 5.2], [0, 0, Math.PI / 2])

// Steering / suspension.
addPart('steering-tie-rod-5', [-8.0, 0, 9.7])
addPart('wheel-hub', [-3.9, 0, 9.7])
addPart('steering-knuckle', [-1.1, 0, 9.7])
addPart('steering-rack-guide', [3.4, 0, 9.7])
addPart('steering-rack-7', [3.4, 0, 11.2])
addPart('shock-body-5', [8.2, 0, 9.3], [0, 0, -0.16])
addPart('shock-rod-5', [10.0, 0, 9.3], [0, 0, 0.16])

// Articulated driveline.
addPart('universal-joint-30', [-5.5, 0, 14.0], [0, -0.22, 0])
addPart('cv-joint-30', [0.0, 0, 14.0], [0, -0.22, 0])
addPart('worm-drive-8', [6.2, 0, 14.0], [0, -0.28, 0])

// Bent beams, pins, connector blocks and bearing / suspension detail.
addPart('beam-l-3x3', [-9.0, 0, 18.3], [0, 0.15, 0])
addPart('beam-angle-4x2', [-5.7, 0, 18.3], [0, -0.10, 0])
addPart('pin-long', [-1.6, 0.25, 18.3], [Math.PI / 2, 0, 0.35])
addPart('axle-pin', [0.2, 0.1, 18.3], [0.18, 0.28, 0])
addPart('connector-triple', [2.5, 0, 18.3])
addPart('connector-perpendicular', [5.6, 0, 18.3], [0.10, -0.25, 0])
addPart('connector-angle', [7.9, 0, 18.3], [0.12, 0.28, 0])
addPart('bearing-block', [10.0, 0, 18.3], [0, -0.22, 0])
addPart('suspension-arm-5', [-0.5, 0, 21.1], [0, 0.18, 0])

// Mechanism housings.
addPart('motor', [-7.0, 0, 23.4], [0, -0.22, 0])
addPart('gearbox-fnr', [-1.2, 0, 23.4], [0, -0.22, 0])
addPart('open-differential', [5.0, 0, 23.4], [0, -0.28, 0])

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

globalThis.BrickLabParts5VisualQA = Object.freeze({
  scene,
  camera,
  renderer,
  wheelIds,
  spurTeeth,
  refinement: globalThis.BrickLabParts5Refinement ?? null,
  drivelineRefinement: globalThis.BrickLabParts5DrivelineVisuals ?? null,
  structuralRefinement: globalThis.BrickLabParts5StructuralVisuals ?? null,
  detailRefinement: globalThis.BrickLabParts5DetailRefinement ?? null,
})
