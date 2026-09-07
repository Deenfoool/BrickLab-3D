import * as THREE from 'three'
import { PARTS } from './parts.js'

const darkMat = new THREE.MeshStandardMaterial({ color: 0x101316, roughness: 0.78, metalness: 0.05 })
const metalMat = new THREE.MeshStandardMaterial({ color: 0xaeb6be, roughness: 0.24, metalness: 0.78 })
const linerGeometry = new THREE.TorusGeometry(0.246, 0.018, 6, 30)
darkMat.userData.bricklabSharedVisual = true
metalMat.userData.bricklabSharedVisual = true
linerGeometry.userData.bricklabSharedVisual = true

function visualOnly(object) {
  object.userData.physicsIgnore = true
  object.userData.bricklabVisualDetail = true
  object.castShadow = true
  object.receiveShadow = true
  return object
}

function tuneMaterial(material, part) {
  if (!material || material.userData?.bricklabVisualV3) return
  material.userData ??= {}
  material.userData.bricklabVisualV3 = true

  const isRubber = part.category === 'Wheels' && material.color?.getHex?.() < 0x303030
  const isMetal = (material.metalness ?? 0) > 0.35

  if (isRubber) {
    material.roughness = 0.93
    material.metalness = 0
  } else if (isMetal) {
    material.roughness = Math.min(material.roughness ?? 0.3, 0.32)
    material.metalness = Math.max(material.metalness ?? 0, 0.62)
  } else {
    material.roughness = Math.max(0.24, Math.min(0.55, (material.roughness ?? 0.4) * 0.9))
    material.metalness = Math.min(material.metalness ?? 0, 0.08)
  }

  if (material.isMeshPhysicalMaterial) {
    material.clearcoat = Math.max(material.clearcoat ?? 0, isRubber ? 0 : 0.18)
    material.clearcoatRoughness = Math.min(material.clearcoatRoughness ?? 0.5, 0.42)
    material.ior = 1.46
    material.reflectivity = 0.42
  }
  material.envMapIntensity = isRubber ? 0.45 : isMetal ? 1.15 : 0.82
  material.needsUpdate = true
}

function axisQuaternion(axis) {
  const direction = new THREE.Vector3(...axis).normalize()
  return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction)
}

function addTechnicLiners(object, definition) {
  const holes = (definition.connectors ?? []).filter(connector => connector.type === 'pin-hole')
  if (!holes.length || holes.length > 16) return

  for (const connector of holes) {
    const axis = new THREE.Vector3(...connector.axis).normalize()
    const q = axisQuaternion(connector.axis)
    for (const side of [-1, 1]) {
      const liner = visualOnly(new THREE.Mesh(linerGeometry, darkMat))
      liner.position.fromArray(connector.position).addScaledVector(axis, side * 0.405)
      liner.quaternion.copy(q)
      object.add(liner)
    }
  }
}

function addPowerFasteners(object, definition) {
  if (definition.category !== 'Power' || definition.id.includes('sensor')) return
  object.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(object)
  const size = box.getSize(new THREE.Vector3())
  if (size.x < 1.35 || size.z < 1.1) return

  const radius = Math.min(0.065, Math.max(0.04, Math.min(size.x, size.z) * 0.025))
  const screwGeo = new THREE.CylinderGeometry(radius, radius, 0.028, 18)
  const slotGeo = new THREE.BoxGeometry(radius * 1.15, 0.012, radius * 0.22)
  const insetX = Math.min(size.x * 0.32, size.x / 2 - 0.2)
  const insetZ = Math.min(size.z * 0.32, size.z / 2 - 0.2)
  const topY = box.max.y + 0.012

  for (const x of [-insetX, insetX]) {
    for (const z of [-insetZ, insetZ]) {
      const screw = visualOnly(new THREE.Mesh(screwGeo, metalMat))
      screw.position.set(x, topY, z)
      const slot = visualOnly(new THREE.Mesh(slotGeo, darkMat))
      slot.position.set(x, topY + 0.018, z)
      object.add(screw, slot)
    }
  }
}

function addWheelSidewallDetail(object, definition) {
  if (definition.id !== 'wheel') return
  const ringGeo = new THREE.TorusGeometry(1.05, 0.022, 6, 56)
  for (const x of [-0.37, 0.37]) {
    const ring = visualOnly(new THREE.Mesh(ringGeo, darkMat))
    ring.rotation.y = Math.PI / 2
    ring.position.set(x, 1.15, 0)
    object.add(ring)
  }
}

function addGearFaceDetail(object, definition) {
  const gear = definition.mechanics?.gear
  if (!gear) return
  const radius = Math.max(0.24, (gear.pitchRadius ?? gear.teeth / 16) * 0.58)
  const ringGeo = new THREE.TorusGeometry(radius, 0.018, 6, Math.max(28, gear.teeth * 2))
  for (const y of [0.17, 0.63]) {
    const ring = visualOnly(new THREE.Mesh(ringGeo, darkMat))
    ring.rotation.x = Math.PI / 2
    ring.position.y = y
    object.add(ring)
  }
}

function addAxleBands(object, definition) {
  if (!definition.id.startsWith('axle-') || definition.id === 'axle-coupler') return
  const slots = (definition.connectors ?? []).filter(connector => connector.type === 'axle')
  if (slots.length < 4) return
  const bandGeo = new THREE.TorusGeometry(0.145, 0.012, 5, 22)
  for (let i = 1; i < slots.length - 1; i += 2) {
    const connector = slots[i]
    const band = visualOnly(new THREE.Mesh(bandGeo, darkMat))
    band.rotation.y = Math.PI / 2
    band.position.fromArray(connector.position)
    object.add(band)
  }
}

function enhanceObject(object, definition) {
  if (!object || object.userData?.bricklabVisualV3) return object
  object.userData.bricklabVisualV3 = true
  object.userData.visualQuality = 'v3'

  object.traverse(child => {
    if (!child.isMesh) return
    child.castShadow = true
    child.receiveShadow = true
    child.geometry?.computeVertexNormals?.()
    const materials = Array.isArray(child.material) ? child.material : [child.material]
    materials.forEach(material => tuneMaterial(material, definition))
  })

  addTechnicLiners(object, definition)
  addPowerFasteners(object, definition)
  addWheelSidewallDetail(object, definition)
  addGearFaceDetail(object, definition)
  addAxleBands(object, definition)
  return object
}

for (const definition of PARTS) {
  if (!definition?.create || definition.__bricklabVisualV3Wrapped) continue
  definition.__bricklabVisualV3Wrapped = true
  const originalCreate = definition.create
  definition.create = color => enhanceObject(originalCreate(color), definition)
}
