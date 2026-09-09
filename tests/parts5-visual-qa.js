import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

await import('../basic-parts-pack.js')
await import('../technic-parts-pack-v2.js')
await import('../lab-parts.js')
await import('../vehicle-parts-v1.js')
await import('../parts3/mechanical-parts-pack-v3.js')
await import('../parts3/parts-3-extra-v1.js')
await import('../parts3/parts-3-wheel-dimensions.js')
await import('../parts4/mechanical-driveline-v1.js')
await import('../parts4/steering-suspension-v1.js')
await import('../parts5/visual-overhaul-v1.js')

const { findPart } = await import('../parts.js')
const { gearPitchRadius } = await import('../parts5/part-geometry-metrics-v1.js')

const stage = document.getElementById('stage')
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x16191c)
scene.fog = new THREE.Fog(0x16191c, 34, 58)

const camera = new THREE.PerspectiveCamera(43, 1, 0.1, 120)
camera.position.set(14, 13, 20)

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
stage.append(renderer.domElement)

const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true
controls.target.set(1.2, 1.2, 0)
controls.minDistance = 5
controls.maxDistance = 46

scene.add(new THREE.HemisphereLight(0xdde8f2, 0x30363c, 2.2))
const key = new THREE.DirectionalLight(0xffffff, 3.0)
key.position.set(10, 17, 10)
key.castShadow = true
key.shadow.mapSize.set(2048, 2048)
scene.add(key)
const fill = new THREE.DirectionalLight(0xb8d2ff, 1.0)
fill.position.set(-12, 8, -8)
scene.add(fill)

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(42, 34),
  new THREE.MeshStandardMaterial({ color: 0x20252a, roughness: 0.93, metalness: 0 }),
)
floor.rotation.x = -Math.PI / 2
floor.position.y = -0.02
floor.receiveShadow = true
scene.add(floor)

const grid = new THREE.GridHelper(42, 42, 0x3b444c, 0x2b3136)
grid.position.y = 0.005
grid.material.transparent = true
grid.material.opacity = 0.42
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
  const localOffset = new THREE.Vector3(...connector.position)
    .applyQuaternion(object.quaternion)
  object.position.copy(desiredCenter).sub(localOffset)
  object.updateMatrixWorld(true)
}

// WHEELS: deliberately same axle direction and baseline so tyre profile/width and
// tread family differences can be compared at a glance.
const wheelIds = ['wheel-small', 'wheel-narrow', 'wheel-road', 'wheel-medium', 'wheel', 'wheel-offroad-large', 'wheel-tractor']
const wheelXs = [-9.2, -6.5, -3.7, -0.7, 2.5, 6.0, 10.0]
for (let i = 0; i < wheelIds.length; i += 1) addPart(wheelIds[i], [wheelXs[i], 0, -7.2])

// SPUR FAMILY: one module/pitch system across the complete inventory.
const spurTeeth = [8, 12, 16, 20, 24, 36, 40]
const spurXs = [-8.2, -5.5, -2.8, 0, 3.0, 6.2, 9.8]
for (let i = 0; i < spurTeeth.length; i += 1) addPart(`gear-${spurTeeth[i]}`, [spurXs[i], 0, -2.7])

// EXACT 12T ↔ 20T PAIR.
{
  const a = addPart('gear-12', [-7.4, 0, 2.0])
  const b = addPart('gear-20', [-7.4 + gearPitchRadius(12) + gearPitchRadius(20), 0, 2.0])
  // Half-tooth visual phase offset: center distance is still purely pitch-driven.
  b.rotation.y = Math.PI / 20
  a.updateMatrixWorld(true); b.updateMatrixWorld(true)
}

// EXACT 8T ↔ 24T PAIR.
{
  const a = addPart('gear-8', [-2.6, 0, 2.0])
  const b = addPart('gear-24', [-2.6 + gearPitchRadius(8) + gearPitchRadius(24), 0, 2.0])
  b.rotation.y = Math.PI / 24
  a.updateMatrixWorld(true); b.updateMatrixWorld(true)
}

// TRUE 90° BEVEL PAIR using one shared pitch-cone apex.
{
  const fixed = partObject('bevel-gear-20')
  const moving = partObject('bevel-gear-12')
  fixed.userData.partId = 'bevel-gear-20'
  moving.userData.partId = 'bevel-gear-12'
  moving.rotation.z = -Math.PI / 2 // local +Y shaft axis -> world +X
  fixed.updateMatrixWorld(true)
  moving.updateMatrixWorld(true)

  const fixedCenter = new THREE.Vector3(6.8, 0.72, 2.5)
  const apex = fixedCenter.clone().add(new THREE.Vector3(0, gearPitchRadius(12), 0))
  const movingCenter = apex.clone().add(new THREE.Vector3(-gearPitchRadius(20), 0, 0))
  setConnectorCenter(fixed, fixedCenter)
  setConnectorCenter(moving, movingCenter)
  scene.add(fixed, moving)
}

// STRUCTURAL DETAIL ROW.
addPart('beam-7', [-6.5, 0, 6.2], [0, 0, 0])
addPart('technic-brick-1x4', [-1.6, 0, 6.2])
addPart('axle-9', [3.2, 0, 6.2], [0, Math.PI / 7, 0])
addPart('pin', [8.0, 0.15, 6.2], [Math.PI / 2, 0, Math.PI / 5])

// Small pedestals visually group exact mesh examples without touching part models.
for (const [x, z, w] of [[-6.5, 2.0, 4.4], [-1.7, 2.0, 4.0], [6.0, 2.5, 5.2]]) {
  const pad = new THREE.Mesh(
    new THREE.BoxGeometry(w, 0.06, 3.0),
    new THREE.MeshStandardMaterial({ color: 0x1b211e, roughness: 0.88, metalness: 0 }),
  )
  pad.position.set(x, 0.025, z)
  pad.receiveShadow = true
  scene.add(pad)
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

globalThis.BrickLabParts5VisualQA = Object.freeze({
  scene,
  camera,
  renderer,
  wheelIds,
  spurTeeth,
})
