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
await import('../parts6/fine-mechanical-detail-v3.js')
await import('../parts6/interface-fit-refinement-v2.js')
await import('../parts6/interface-physics-safety-v1.js')
await import('../parts6/shock-fidelity-v9.js')

const { findPart } = await import('../parts.js')

const stage = document.getElementById('stage')
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x161a1d)
const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 60)
camera.position.set(7.5, 5.5, 11.5)

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.shadowMap.enabled = true
stage.append(renderer.domElement)

const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true
controls.target.set(0, 1.55, 0)
controls.minDistance = 3
controls.maxDistance = 24

scene.add(new THREE.HemisphereLight(0xdde8f2, 0x34393e, 2.1))
const key = new THREE.DirectionalLight(0xffffff, 3.2)
key.position.set(7, 12, 8)
key.castShadow = true
scene.add(key)
const fill = new THREE.DirectionalLight(0xb7d2ff, 0.8)
fill.position.set(-7, 5, -7)
scene.add(fill)

const floor = new THREE.Mesh(new THREE.PlaneGeometry(18, 14), new THREE.MeshStandardMaterial({ color: 0x20262a, roughness: 0.94 }))
floor.rotation.x = -Math.PI / 2
floor.receiveShadow = true
scene.add(floor)

function part(id, color) {
  const definition = findPart(id)
  if (!definition) throw new Error(`Missing shock QA part ${id}`)
  const object = definition.create(color ?? definition.defaultColor)
  object.userData.partId = id
  object.traverse(child => {
    if (!child.isMesh) return
    child.castShadow = true
    child.receiveShadow = true
  })
  return object
}

const body = part('shock-body-5', 0xd7263d)
body.position.set(-2.0, 0, 0)
body.rotation.z = -0.18
scene.add(body)

const rod = part('shock-rod-5', 0xf6c945)
rod.position.set(1.7, 0, 0)
rod.rotation.z = 0.18
scene.add(rod)

// Side-by-side aligned reference: both parts retain their real connector coordinates,
// so this view exposes eye-bore size, spring/rod scale and overall family proportions.
const referenceBody = part('shock-body-5', 0x59626c)
referenceBody.position.set(-0.52, 0, 3.6)
scene.add(referenceBody)
const referenceRod = part('shock-rod-5', 0xadb5bd)
referenceRod.position.set(0.52, 0, 3.6)
scene.add(referenceRod)

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

globalThis.BrickLabParts6ShockQA = Object.freeze({
  scene,
  camera,
  renderer,
  body,
  rod,
  referenceBody,
  referenceRod,
  shockFidelity: globalThis.BrickLabParts6ShockFidelity ?? null,
})
