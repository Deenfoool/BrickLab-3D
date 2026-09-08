import * as THREE from 'three'
import { PARTS } from './parts.js'

// Visual-only realism layer. Geometry added here never participates in Rapier
// collider generation (`physicsIgnore`) and is intentionally brand-neutral.
const VISUAL_VERSION = 'v4-realistic-molded'
const geometryCache = new Map()
const plasticCache = new Map()

function markShared(resource) {
  resource.userData ??= {}
  resource.userData.bricklabSharedVisual = true
  return resource
}

function cachedGeometry(key, factory) {
  if (!geometryCache.has(key)) geometryCache.set(key, markShared(factory()))
  return geometryCache.get(key)
}

function plasticDetail(color) {
  const key = Number(color) || 0x777777
  if (!plasticCache.has(key)) {
    const mat = new THREE.MeshPhysicalMaterial({
      color: key,
      roughness: 0.29,
      metalness: 0,
      clearcoat: 0.3,
      clearcoatRoughness: 0.23,
      ior: 1.47,
      reflectivity: 0.46,
      envMapIntensity: 1.05,
    })
    markShared(mat)
    plasticCache.set(key, mat)
  }
  return plasticCache.get(key)
}

const darkMat = markShared(new THREE.MeshPhysicalMaterial({
  color: 0x101316,
  roughness: 0.62,
  metalness: 0.015,
  clearcoat: 0.08,
  clearcoatRoughness: 0.5,
  envMapIntensity: 0.55,
}))
const rubberMat = markShared(new THREE.MeshStandardMaterial({
  color: 0x121416,
  roughness: 0.82,
  metalness: 0,
  envMapIntensity: 0.34,
}))
const metalMat = markShared(new THREE.MeshStandardMaterial({
  color: 0xb6bec6,
  roughness: 0.26,
  metalness: 0.76,
  envMapIntensity: 1.28,
}))

function visualOnly(object) {
  object.userData ??= {}
  object.userData.physicsIgnore = true
  object.userData.bricklabVisualDetail = true
  object.castShadow = true
  object.receiveShadow = true
  return object
}

function tuneMaterial(material, part) {
  if (!material || material.userData?.bricklabRealisticV4) return
  material.userData ??= {}
  material.userData.bricklabRealisticV4 = true

  const color = material.color?.getHex?.() ?? 0xffffff
  const isWheelRubber = part.id === 'wheel' && color < 0x303030
  const isMetal = (material.metalness ?? 0) > 0.35
  const isDarkTechnical = color < 0x242424 && !isWheelRubber

  if (isWheelRubber) {
    material.roughness = 0.82
    material.metalness = 0
    material.envMapIntensity = 0.35
  } else if (isMetal) {
    material.roughness = Math.min(material.roughness ?? 0.3, 0.29)
    material.metalness = Math.max(material.metalness ?? 0, 0.68)
    material.envMapIntensity = 1.25
  } else {
    material.roughness = isDarkTechnical ? 0.38 : 0.29
    material.metalness = 0
    material.envMapIntensity = isDarkTechnical ? 0.72 : 1.02
    if (material.isMeshPhysicalMaterial) {
      material.clearcoat = isDarkTechnical ? 0.14 : 0.28
      material.clearcoatRoughness = isDarkTechnical ? 0.34 : 0.23
      material.ior = 1.47
      material.reflectivity = 0.46
      if ('specularIntensity' in material) material.specularIntensity = 0.55
    }
  }
  material.needsUpdate = true
}

function quatFromZ(axis) {
  return new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(...axis).normalize(),
  )
}

function quatFromY(axis) {
  return new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(...axis).normalize(),
  )
}

function addInstanced(object, geometry, material, transforms) {
  if (!transforms.length) return null
  const mesh = visualOnly(new THREE.InstancedMesh(geometry, material, transforms.length))
  const matrix = new THREE.Matrix4()
  const scale = new THREE.Vector3(1, 1, 1)
  transforms.forEach((item, index) => {
    matrix.compose(item.position, item.quaternion ?? new THREE.Quaternion(), item.scale ?? scale)
    mesh.setMatrixAt(index, matrix)
  })
  mesh.instanceMatrix.needsUpdate = true
  object.add(mesh)
  return mesh
}

function addStudFinish(object, definition) {
  const studs = (definition.connectors ?? []).filter(c => c.type === 'stud')
  if (!studs.length) return
  const geometry = cachedGeometry('stud-rim-v4', () => new THREE.TorusGeometry(0.281, 0.011, 6, 30))
  const transforms = studs.map(connector => {
    const axis = new THREE.Vector3(...connector.axis).normalize()
    return {
      position: new THREE.Vector3(...connector.position).addScaledVector(axis, 0.183),
      quaternion: quatFromZ(connector.axis),
    }
  })
  addInstanced(object, geometry, plasticDetail(object.userData.color ?? definition.defaultColor), transforms)
}

function addUndersideSockets(object, definition) {
  if (!['Bricks', 'Plates'].includes(definition.category)) return
  const sockets = (definition.connectors ?? []).filter(c => c.type === 'tube')
  if (!sockets.length) return

  const ring = cachedGeometry('socket-ring-v4', () => new THREE.TorusGeometry(0.225, 0.027, 7, 28))
  const disc = cachedGeometry('socket-shadow-v4', () => new THREE.CircleGeometry(0.184, 30))
  const ringTransforms = []
  const shadowTransforms = []
  for (const connector of sockets) {
    const axis = new THREE.Vector3(...connector.axis).normalize()
    const q = quatFromZ(connector.axis)
    const origin = new THREE.Vector3(...connector.position)
    ringTransforms.push({ position: origin.clone().addScaledVector(axis, -0.022), quaternion: q })
    shadowTransforms.push({ position: origin.clone().addScaledVector(axis, -0.009), quaternion: q })
  }
  addInstanced(object, ring, plasticDetail(object.userData.color ?? definition.defaultColor), ringTransforms)
  addInstanced(object, disc, darkMat, shadowTransforms)

  // Molded reinforcement ribs under longer bricks/plates. They are deliberately
  // shallow so they read visually without changing the connection silhouette.
  const xs = [...new Set(sockets.map(c => Number(c.position[0]).toFixed(3)))].map(Number).sort((a, b) => a - b)
  const zs = [...new Set(sockets.map(c => Number(c.position[2]).toFixed(3)))].map(Number).sort((a, b) => a - b)
  const color = plasticDetail(object.userData.color ?? definition.defaultColor)
  if (xs.length > 1) {
    const depth = Math.max(0.24, (zs.at(-1) ?? 0) - (zs[0] ?? 0) + 0.54)
    const geometry = cachedGeometry(`rib-z-${depth.toFixed(2)}`, () => new THREE.BoxGeometry(0.045, 0.085, depth))
    const transforms = []
    for (let i = 0; i < xs.length - 1; i++) transforms.push({ position: new THREE.Vector3((xs[i] + xs[i + 1]) / 2, 0.045, 0) })
    addInstanced(object, geometry, color, transforms)
  }
  if (zs.length > 1 && xs.length === 1) {
    const width = Math.max(0.24, (xs.at(-1) ?? 0) - (xs[0] ?? 0) + 0.54)
    const geometry = cachedGeometry(`rib-x-${width.toFixed(2)}`, () => new THREE.BoxGeometry(width, 0.085, 0.045))
    const transforms = []
    for (let i = 0; i < zs.length - 1; i++) transforms.push({ position: new THREE.Vector3(0, 0.045, (zs[i] + zs[i + 1]) / 2) })
    addInstanced(object, geometry, color, transforms)
  }
}

function addTechnicBores(object, definition) {
  const holes = (definition.connectors ?? []).filter(c => c.type === 'pin-hole')
  if (!holes.length || holes.length > 24) return
  const length = definition.id.includes('bearing') ? 1.34 : definition.id.includes('technic-brick') ? 0.92 : 0.82
  const bore = cachedGeometry(`technic-bore-${length}`, () => new THREE.CylinderGeometry(0.232, 0.232, length, 28, 1, true))
  const lip = cachedGeometry('technic-lip-v4', () => new THREE.TorusGeometry(0.247, 0.015, 6, 30))
  const boreTransforms = holes.map(c => ({ position: new THREE.Vector3(...c.position), quaternion: quatFromY(c.axis) }))
  addInstanced(object, bore, darkMat, boreTransforms)

  const lips = []
  for (const connector of holes) {
    const axis = new THREE.Vector3(...connector.axis).normalize()
    const q = quatFromZ(connector.axis)
    for (const side of [-1, 1]) {
      lips.push({ position: new THREE.Vector3(...connector.position).addScaledVector(axis, side * length * 0.505), quaternion: q })
    }
  }
  addInstanced(object, lip, darkMat, lips)
}

function addMoldLine(object, definition) {
  if (!['Bricks', 'Plates'].includes(definition.category)) return
  const studs = (definition.connectors ?? []).filter(c => c.type === 'stud')
  if (!studs.length) return
  const xs = studs.map(c => c.position[0]), zs = studs.map(c => c.position[2])
  const y = Math.max(...studs.map(c => c.position[1])) - 0.035
  const minX = Math.min(...xs) - 0.46, maxX = Math.max(...xs) + 0.46
  const minZ = Math.min(...zs) - 0.46, maxZ = Math.max(...zs) + 0.46
  const color = plasticDetail(object.userData.color ?? definition.defaultColor)
  const longX = cachedGeometry(`mold-x-${(maxX - minX).toFixed(2)}`, () => new THREE.BoxGeometry(maxX - minX, 0.018, 0.012))
  const longZ = cachedGeometry(`mold-z-${(maxZ - minZ).toFixed(2)}`, () => new THREE.BoxGeometry(0.012, 0.018, maxZ - minZ))
  const xMeshes = [minZ, maxZ].map(z => visualOnly(new THREE.Mesh(longX, color)))
  xMeshes.forEach((mesh, i) => mesh.position.set((minX + maxX) / 2, y, i ? maxZ : minZ))
  const zMeshes = [minX, maxX].map(x => visualOnly(new THREE.Mesh(longZ, color)))
  zMeshes.forEach((mesh, i) => mesh.position.set(i ? maxX : minX, y, (minZ + maxZ) / 2))
  object.add(...xMeshes, ...zMeshes)
}

function addAxleDetail(object, definition) {
  if (!definition.id.startsWith('axle-') || definition.id === 'axle-coupler') return
  const slots = (definition.connectors ?? []).filter(c => c.type === 'axle')
  if (slots.length < 2) return
  const ring = cachedGeometry('axle-fine-band-v4', () => new THREE.TorusGeometry(0.147, 0.009, 5, 24))
  const transforms = []
  for (let i = 1; i < slots.length - 1; i += 2) {
    transforms.push({
      position: new THREE.Vector3(...slots[i].position),
      quaternion: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0)),
    })
  }
  addInstanced(object, ring, darkMat, transforms)
}

function addGearDetail(object, definition) {
  const gear = definition.mechanics?.gear
  if (!gear) return
  const pitch = gear.pitchRadius ?? gear.teeth / 16
  const radius = Math.max(0.24, pitch * 0.57)
  const ring = cachedGeometry(`gear-face-${radius.toFixed(3)}`, () => new THREE.TorusGeometry(radius, 0.014, 6, Math.max(32, gear.teeth * 2)))
  const transforms = [0.155, 0.645].map(y => ({
    position: new THREE.Vector3(0, y, 0),
    quaternion: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)),
  }))
  addInstanced(object, ring, darkMat, transforms)

  if (gear.teeth >= 16) {
    const hubOuter = Math.min(radius * 0.68, 0.38)
    const hub = cachedGeometry(`gear-hub-${hubOuter.toFixed(3)}`, () => new THREE.TorusGeometry(hubOuter, 0.028, 7, 32))
    addInstanced(object, hub, plasticDetail(object.userData.color ?? definition.defaultColor), transforms)
  }
}

function addWheelDetail(object, definition) {
  if (definition.id !== 'wheel') return
  const tread = cachedGeometry('wheel-tread-v4', () => new THREE.BoxGeometry(0.66, 0.13, 0.22))
  const transforms = []
  const count = 28
  const radius = 1.08
  for (let i = 0; i < count; i++) {
    const angle = i / count * Math.PI * 2
    transforms.push({
      position: new THREE.Vector3(0, 1.15 + Math.cos(angle) * radius, Math.sin(angle) * radius),
      quaternion: new THREE.Quaternion().setFromEuler(new THREE.Euler(angle, 0, (i % 2 ? 1 : -1) * 0.055)),
    })
  }
  addInstanced(object, tread, rubberMat, transforms)

  const sidewall = cachedGeometry('wheel-sidewall-v4', () => new THREE.TorusGeometry(1.055, 0.018, 6, 64))
  const sideTransforms = [-0.39, 0.39].map(x => ({
    position: new THREE.Vector3(x, 1.15, 0),
    quaternion: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0)),
  }))
  addInstanced(object, sidewall, rubberMat, sideTransforms)

  const bead = cachedGeometry('wheel-bead-v4', () => new THREE.TorusGeometry(0.52, 0.026, 7, 48))
  addInstanced(object, bead, darkMat, sideTransforms)
}

function addPowerHousingDetail(object, definition) {
  if (!['motor', 'gearbox-fnr', 'open-differential'].includes(definition.id)) return
  object.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(object)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())

  const screwGeo = cachedGeometry('power-screw-v4', () => new THREE.CylinderGeometry(0.052, 0.052, 0.025, 18))
  const slotGeo = cachedGeometry('power-screw-slot-v4', () => new THREE.BoxGeometry(0.07, 0.009, 0.012))
  const topY = box.max.y + 0.014
  for (const x of [center.x - size.x * 0.28, center.x + size.x * 0.28]) {
    for (const z of [center.z - size.z * 0.29, center.z + size.z * 0.29]) {
      const screw = visualOnly(new THREE.Mesh(screwGeo, metalMat))
      screw.position.set(x, topY, z)
      const slot = visualOnly(new THREE.Mesh(slotGeo, darkMat))
      slot.position.set(x, topY + 0.016, z)
      object.add(screw, slot)
    }
  }

  // Molded ventilation slots on the front housing face.
  const ventGeo = cachedGeometry('power-vent-v4', () => new THREE.BoxGeometry(0.055, 0.34, 0.018))
  const vents = []
  const width = Math.min(size.x * 0.52, 1.25)
  for (let i = 0; i < 6; i++) {
    vents.push({
      position: new THREE.Vector3(center.x - width / 2 + width * i / 5, center.y, box.max.z + 0.013),
    })
  }
  addInstanced(object, ventGeo, darkMat, vents)

  const panelGeo = cachedGeometry(`power-panel-${size.x.toFixed(2)}-${size.z.toFixed(2)}`, () => new THREE.BoxGeometry(size.x * 0.54, 0.018, size.z * 0.38))
  const panel = visualOnly(new THREE.Mesh(panelGeo, darkMat))
  panel.position.set(center.x, topY - 0.004, center.z)
  object.add(panel)
}

function addSensorDetail(object, definition) {
  if (!definition.id.endsWith('-sensor')) return
  const halo = cachedGeometry('sensor-halo-v4', () => new THREE.TorusGeometry(0.44, 0.012, 6, 36))
  const mesh = visualOnly(new THREE.Mesh(halo, metalMat))
  mesh.rotation.y = Math.PI / 2
  mesh.position.y = 0.55
  object.add(mesh)
}

function enhanceObject(object, definition) {
  if (!object || object.userData?.bricklabRealisticV4) return object
  object.userData.bricklabRealisticV4 = true
  object.userData.visualQuality = VISUAL_VERSION

  object.traverse(child => {
    if (!child.isMesh) return
    child.castShadow = true
    child.receiveShadow = true
    child.geometry?.computeVertexNormals?.()
    const materials = Array.isArray(child.material) ? child.material : [child.material]
    materials.forEach(material => tuneMaterial(material, definition))
  })

  addStudFinish(object, definition)
  addUndersideSockets(object, definition)
  addTechnicBores(object, definition)
  addMoldLine(object, definition)
  addAxleDetail(object, definition)
  addGearDetail(object, definition)
  addWheelDetail(object, definition)
  addPowerHousingDetail(object, definition)
  addSensorDetail(object, definition)
  return object
}

for (const definition of PARTS) {
  if (!definition?.create || definition.__bricklabVisualV4Wrapped) continue
  definition.__bricklabVisualV4Wrapped = true
  const originalCreate = definition.create
  definition.create = color => enhanceObject(originalCreate(color), definition)
}

window.BrickLabVisualQuality = {
  version: VISUAL_VERSION,
  brandNeutral: true,
  physicsSafe: true,
}
