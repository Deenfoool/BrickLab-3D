import * as THREE from 'three'
import { PARTS } from '../parts.js'
import { patchPart } from '../parts3/part-schema-v1.js'
import { REAL_TECHNIC_NOMINAL } from './nominal-dimension-fidelity-v1.js'

export const PARTS6_SHOCK_FIDELITY_VERSION = 'parts-6-shock-fidelity-v9'

const N = REAL_TECHNIC_NOMINAL
const Y_AXIS = new THREE.Vector3(0, 1, 0)
const Z_AXIS = new THREE.Vector3(0, 0, 1)

function absMaterial(color, roughness = 0.40) {
  return new THREE.MeshPhysicalMaterial({ color, roughness, metalness: 0.004, clearcoat: 0.028, clearcoatRoughness: 0.70, ior: 1.47 })
}
function pomMaterial(color = 0x22262a, roughness = 0.48) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.004 })
}
function rubberMaterial() {
  return new THREE.MeshStandardMaterial({ color: 0x151719, roughness: 0.93, metalness: 0 })
}
function metalMaterial(color = 0xb9c0c6, roughness = 0.27) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.74 })
}
function root(id, color) {
  const group = new THREE.Group()
  group.userData.partId = id
  group.userData.color = color
  group.userData.visualVersion = PARTS6_SHOCK_FIDELITY_VERSION
  return group
}
function visualOnly(object, feature) {
  object.userData.physicsIgnore = true
  object.userData.parts6VisualDetail = true
  object.userData.parts6ShockFeature = feature
  return object
}
function circleHole(radius) {
  const path = new THREE.Path()
  path.absarc(0, 0, radius, 0, Math.PI * 2, true)
  return path
}
function annulusShape(outer, inner) {
  const shape = new THREE.Shape()
  shape.absarc(0, 0, outer, 0, Math.PI * 2, false)
  shape.holes.push(circleHole(inner))
  return shape
}
function extrude(shape, depth, material, options = {}) {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: options.bevelEnabled ?? true,
    bevelSegments: options.bevelSegments ?? 4,
    bevelSize: options.bevelSize ?? 0.009,
    bevelThickness: options.bevelThickness ?? 0.009,
    curveSegments: options.curveSegments ?? 40,
    steps: 1,
  })
  geometry.translate(0, 0, -depth / 2)
  return new THREE.Mesh(geometry, material)
}
function extrudeAlongZ(shape, depth, material, options = {}) {
  return extrude(shape, depth, material, options)
}
function torusY(radius, tube, material, feature, radial = 8, tubular = 48) {
  const mesh = visualOnly(new THREE.Mesh(new THREE.TorusGeometry(radius, tube, radial, tubular), material), feature)
  mesh.rotation.x = Math.PI / 2
  return mesh
}
function springGeometry(radius, wire, height, turns) {
  const samples = Math.max(128, Math.round(turns * 24))
  const points = []
  for (let i = 0; i <= samples; i += 1) {
    const t = i / samples
    const angle = t * Math.PI * 2 * turns
    points.push(new THREE.Vector3(Math.cos(angle) * radius, t * height, Math.sin(angle) * radius))
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points, false, 'centripetal'), samples, wire, 10, false)
}
function addEye(group, position, color, featurePrefix) {
  const material = absMaterial(color)
  const eye = extrudeAlongZ(annulusShape(0.315, N.pinHoleRadius), 0.31, material, { bevelSegments: 5, bevelSize: 0.010, bevelThickness: 0.010 })
  eye.position.copy(position)
  group.add(eye)
  const bore = visualOnly(new THREE.Mesh(new THREE.CylinderGeometry(N.pinHoleRadius * 0.995, N.pinHoleRadius * 0.995, 0.315, 44, 1, true), pomMaterial(0x111315, 0.82)), `${featurePrefix}-bore`)
  bore.rotation.x = Math.PI / 2
  bore.position.copy(position)
  group.add(bore)
  for (const side of [-1, 1]) {
    const retainer = visualOnly(new THREE.Mesh(new THREE.TorusGeometry(N.pinCounterboreRadius * 0.94, 0.015, 7, 44), absMaterial(color, 0.47)), `${featurePrefix}-counterbore`)
    retainer.position.copy(position).addScaledVector(Z_AXIS, side * 0.158)
    group.add(retainer)
  }
}

function nonIgnoredBounds(object) {
  object.updateWorldMatrix(true, true)
  const inverse = object.matrixWorld.clone().invert()
  const box = new THREE.Box3().makeEmpty()
  const local = new THREE.Box3()
  const relative = new THREE.Matrix4()
  object.traverse(child => {
    if (!child.isMesh || !child.geometry || child.userData?.physicsIgnore) return
    if (!child.geometry.boundingBox) child.geometry.computeBoundingBox()
    if (!child.geometry.boundingBox) return
    local.copy(child.geometry.boundingBox)
    relative.multiplyMatrices(inverse, child.matrixWorld)
    local.applyMatrix4(relative)
    box.union(local)
  })
  if (box.isEmpty()) return null
  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  return {
    center: [center.x, center.y, center.z],
    size: [Math.max(size.x, 0.12), Math.max(size.y, 0.12), Math.max(size.z, 0.12)],
  }
}
function freezeLegacyBoundsCollider(part, previousFactory) {
  if (part.physics?.colliderProfile?.specs?.length) return 'existing-explicit'
  let previous = null
  try {
    previous = previousFactory(part.defaultColor ?? part.visual?.defaultColor ?? 0xd7263d)
  } catch {
    return 'sample-failed'
  }
  const bounds = nonIgnoredBounds(previous)
  if (!bounds) return 'bounds-missing'
  part.physics = {
    ...(part.physics ?? {}),
    colliderProfile: {
      version: 'parts-6-frozen-pre-v9-shock-bounds-v1',
      specs: [{ type: 'box', center: bounds.center, size: bounds.size }],
    },
  }
  return 'frozen-legacy-bounds'
}

function createShockBody(part, color) {
  const group = root(part.id, color)
  const shell = absMaterial(color)
  const mount = part.connectors.find(item => item.id === 'mount')
  const mountCenter = new THREE.Vector3(...(mount?.position ?? [0, 0.32, 0]))

  addEye(group, mountCenter, color, 'shock-lower-eye')

  // Lower eye flows into a tapered reservoir/barrel rather than intersecting a cylinder.
  const lowerNeck = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.38, 0.34, 42), shell)
  lowerNeck.position.y = 0.58
  group.add(lowerNeck)

  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.355, 0.395, 1.92, 52), shell)
  barrel.position.y = 1.53
  group.add(barrel)

  const lowerSeat = new THREE.Mesh(new THREE.CylinderGeometry(0.455, 0.455, 0.13, 52), shell)
  lowerSeat.position.y = 0.70
  group.add(lowerSeat)
  const seatLip = torusY(0.445, 0.020, shell, 'shock-lower-spring-seat-lip', 8, 52)
  seatLip.position.y = 0.765
  group.add(seatLip)

  // Threaded upper section supports a realistic preload collar.
  const threadBase = new THREE.Mesh(new THREE.CylinderGeometry(0.365, 0.365, 0.45, 52), shell)
  threadBase.position.y = 2.47
  group.add(threadBase)
  for (let i = 0; i < 7; i += 1) {
    const thread = torusY(0.368, 0.008, absMaterial(color, 0.48), 'shock-body-thread', 6, 52)
    thread.position.y = 2.28 + i * 0.055
    group.add(thread)
  }

  const preloadCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.13, 52), absMaterial(color, 0.43))
  preloadCollar.position.y = 2.61
  group.add(preloadCollar)
  for (let i = 0; i < 10; i += 1) {
    const a = i / 10 * Math.PI * 2
    const notch = visualOnly(new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.095, 0.055), pomMaterial(0x17191c, 0.72)), 'shock-preload-collar-notch')
    notch.position.set(Math.cos(a) * 0.45, 2.61, Math.sin(a) * 0.45)
    notch.rotation.y = -a
    group.add(notch)
  }

  const gland = new THREE.Mesh(new THREE.CylinderGeometry(0.285, 0.315, 0.16, 48), pomMaterial(0x25292d, 0.50))
  gland.position.y = 2.73
  group.add(gland)
  const rodSeal = visualOnly(new THREE.Mesh(new THREE.TorusGeometry(0.168, 0.025, 8, 48), rubberMaterial()), 'shock-rod-seal')
  rodSeal.rotation.x = Math.PI / 2
  rodSeal.position.y = 2.815
  group.add(rodSeal)

  group.userData.shockFidelity = {
    threadedPreload: true,
    trueLowerEyeBore: true,
    barrelProfile: 'tapered-monotube',
  }
  return group
}

function createShockRod(part, color) {
  const group = root(part.id, color)
  const topMount = part.connectors.find(item => item.id === 'mount')
  const topCenter = new THREE.Vector3(...(topMount?.position ?? [0, 2.88, 0]))
  const springColor = color

  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.142, 0.142, 2.35, 36), metalMaterial(0xc7cdd2, 0.21))
  rod.position.y = 1.52
  group.add(rod)

  const bumpStop = visualOnly(new THREE.Mesh(new THREE.CylinderGeometry(0.205, 0.225, 0.23, 40), rubberMaterial()), 'shock-progressive-bump-stop')
  bumpStop.position.y = 2.40
  group.add(bumpStop)

  // Accordion dust boot protects the chrome rod near the upper eye.
  for (let i = 0; i < 5; i += 1) {
    const boot = torusY(0.205 - i * 0.010, 0.018, rubberMaterial(), 'shock-dust-boot-rib', 7, 44)
    boot.position.y = 2.48 + i * 0.055
    group.add(boot)
  }

  const spring = new THREE.Mesh(springGeometry(0.345, 0.040, 1.95, 7.5), metalMaterial(0xaeb6bd, 0.33))
  spring.position.y = 0.74
  visualOnly(spring, 'shock-helical-spring')
  group.add(spring)

  const lowerSpringPlate = new THREE.Mesh(new THREE.CylinderGeometry(0.425, 0.425, 0.10, 48), absMaterial(springColor, 0.43))
  lowerSpringPlate.position.y = 0.72
  group.add(lowerSpringPlate)
  const upperSpringPlate = new THREE.Mesh(new THREE.CylinderGeometry(0.425, 0.425, 0.10, 48), absMaterial(springColor, 0.43))
  upperSpringPlate.position.y = 2.70
  group.add(upperSpringPlate)

  addEye(group, topCenter, color, 'shock-upper-eye')
  const upperNeck = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.22, 0.25, 42), absMaterial(color, 0.42))
  upperNeck.position.y = 2.69
  group.add(upperNeck)

  group.userData.shockFidelity = {
    chromeRod: true,
    helicalSpring: true,
    dustBoot: true,
    progressiveBumpStop: true,
    trueUpperEyeBore: true,
  }
  return group
}

const upgraded = []
const colliderFreeze = {}
for (const [id, factory, quality] of [
  ['shock-body-5', createShockBody, 'parts-6-threaded-monotube-shock-body-v9'],
  ['shock-rod-5', createShockRod, 'parts-6-helical-shock-rod-v9'],
]) {
  const part = PARTS.find(item => item.id === id)
  if (!part || typeof part.create !== 'function') continue
  const previous = part.create
  colliderFreeze[id] = freezeLegacyBoundsCollider(part, previous)
  patchPart(PARTS, id, { create: color => factory(part, color), visualQuality: quality })
  upgraded.push(id)
}

globalThis.BrickLabParts6ShockFidelity = Object.freeze({
  version: PARTS6_SHOCK_FIDELITY_VERSION,
  upgraded,
  colliderFreeze: Object.freeze(colliderFreeze),
  geometry: 'threaded tapered lower damper body + preload collar/gland + chrome rod + real helical spring + dust boot + bored eyes',
  physics: 'pre-v9 non-ignored visual bounds are frozen before replacement; PARTS-4 prismatic shock travel/spring/damper mechanics and connector centres remain unchanged',
})

window.dispatchEvent(new CustomEvent('bricklab:partcatalogchange', {
  detail: { total: PARTS.length, pack: PARTS6_SHOCK_FIDELITY_VERSION },
}))
