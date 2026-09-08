import * as THREE from 'three'

export const COLLIDER_PROFILE_VERSION = 'collider-profiles-v3'
export const HOLE_CLEARANCE_STUD = 0.285

function localBounds(object) {
  object.updateWorldMatrix(true, true)
  const rootInverse = object.matrixWorld.clone().invert()
  const box = new THREE.Box3().makeEmpty()
  const meshBox = new THREE.Box3()
  const relative = new THREE.Matrix4()

  object.traverse(child => {
    if (!child.isMesh || !child.geometry || child.userData?.physicsIgnore) return
    if (!child.geometry.boundingBox) child.geometry.computeBoundingBox()
    if (!child.geometry.boundingBox) return
    meshBox.copy(child.geometry.boundingBox)
    relative.multiplyMatrices(rootInverse, child.matrixWorld)
    meshBox.applyMatrix4(relative)
    box.union(meshBox)
  })

  if (box.isEmpty()) return { size: new THREE.Vector3(.12, .12, .12), center: new THREE.Vector3() }
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  size.set(Math.max(size.x, .12), Math.max(size.y, .12), Math.max(size.z, .12))
  return { size, center }
}

function addBox(specs, minX, maxX, minY, maxY, minZ, maxZ) {
  const width = maxX - minX
  const height = maxY - minY
  const depth = maxZ - minZ
  if (width < .035 || height < .035 || depth < .035) return
  specs.push({
    type: 'box',
    center: new THREE.Vector3((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2),
    size: new THREE.Vector3(width, height, depth),
    volume: width * height * depth,
  })
}

function studdedCore(definition) {
  const studs = (definition?.connectors ?? []).filter(connector => connector.type === 'stud')
  if (!studs.length) return null
  const xs = studs.map(connector => connector.position[0])
  const ys = studs.map(connector => connector.position[1])
  const zs = studs.map(connector => connector.position[2])
  const bodyHeight = Math.max(...ys)
  if (!(bodyHeight > .05)) return null
  const specs = []
  addBox(
    specs,
    Math.min(...xs) - .4625,
    Math.max(...xs) + .4625,
    0,
    bodyHeight,
    Math.min(...zs) - .4625,
    Math.max(...zs) + .4625,
  )
  return specs.length ? specs : null
}

function linearHoleProfile(definition, fallback) {
  if (definition?.mechanics?.suspensionArm) return null
  const allHoles = (definition?.connectors ?? []).filter(connector => connector.type === 'pin-hole')
  if (!allHoles.length) return null
  const holes = allHoles.filter(connector => Math.abs(connector.axis?.[2] ?? 0) > .9)
  if (holes.length !== allHoles.length) return null

  const ys = holes.map(connector => connector.position[1])
  const zs = holes.map(connector => connector.position[2])
  if (Math.max(...ys) - Math.min(...ys) > .08 || Math.max(...zs) - Math.min(...zs) > .08) return null

  const studs = (definition?.connectors ?? []).filter(connector => connector.type === 'stud')
  let minX, maxX, minY, maxY, minZ, maxZ
  if (studs.length) {
    const xs = studs.map(connector => connector.position[0])
    const studZ = studs.map(connector => connector.position[2])
    minX = Math.min(...xs) - .4625
    maxX = Math.max(...xs) + .4625
    minY = 0
    maxY = Math.max(...studs.map(connector => connector.position[1]))
    minZ = Math.min(...studZ) - .44
    maxZ = Math.max(...studZ) + .44
  } else {
    minX = fallback.center.x - fallback.size.x / 2
    maxX = fallback.center.x + fallback.size.x / 2
    minY = fallback.center.y - fallback.size.y / 2
    maxY = fallback.center.y + fallback.size.y / 2
    minZ = fallback.center.z - fallback.size.z / 2
    maxZ = fallback.center.z + fallback.size.z / 2
  }

  const holeY = ys.reduce((sum, value) => sum + value, 0) / ys.length
  const middleMinY = Math.max(minY, holeY - HOLE_CLEARANCE_STUD)
  const middleMaxY = Math.min(maxY, holeY + HOLE_CLEARANCE_STUD)
  if (middleMaxY <= middleMinY) return null

  const specs = []
  addBox(specs, minX, maxX, minY, middleMinY, minZ, maxZ)
  addBox(specs, minX, maxX, middleMaxY, maxY, minZ, maxZ)

  const sorted = [...holes].sort((a, b) => a.position[0] - b.position[0])
  let cursor = minX
  for (const hole of sorted) {
    const left = Math.max(minX, hole.position[0] - HOLE_CLEARANCE_STUD)
    const right = Math.min(maxX, hole.position[0] + HOLE_CLEARANCE_STUD)
    addBox(specs, cursor, left, middleMinY, middleMaxY, minZ, maxZ)
    cursor = Math.max(cursor, right)
  }
  addBox(specs, cursor, maxX, middleMinY, middleMaxY, minZ, maxZ)
  return specs.length ? specs : null
}

function rotationalProfile(definition, fallback) {
  if (definition?.mechanics?.motor || definition?.mechanics?.gear || definition?.mechanics?.wheel) return null
  const connectors = definition?.connectors ?? []
  if (!connectors.length) return null
  if (!connectors.every(connector => connector.type === 'axle' || connector.type === 'axle-hole')) return null
  if (!connectors.every(connector => Math.abs(connector.axis?.[0] ?? 0) > .9)) return null
  const radius = Math.max(.055, Math.min(fallback.size.y, fallback.size.z) * .49)
  const halfLength = Math.max(.04, fallback.size.x * .5)
  return [{
    type: 'cylinder-x',
    center: fallback.center.clone(),
    radius,
    halfLength,
    volume: Math.PI * radius * radius * halfLength * 2,
  }]
}

export function buildColliderProfile(object, definition) {
  const fallback = localBounds(object)
  const holes = linearHoleProfile(definition, fallback)
  if (holes) return { kind: 'hole-aware', specs: holes }
  const studded = studdedCore(definition)
  if (studded) return { kind: 'studded-core', specs: studded }
  const rotational = rotationalProfile(definition, fallback)
  if (rotational) return { kind: 'rotational', specs: rotational }
  return {
    kind: 'bounds',
    specs: [{
      type: 'box',
      center: fallback.center,
      size: fallback.size,
      volume: fallback.size.x * fallback.size.y * fallback.size.z,
    }],
  }
}
