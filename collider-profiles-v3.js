import * as THREE from 'three'
import { classifyTechnicPinInterfaceV4 } from './connectors-v4/pin-semantics-v4.js?v=connector-pin-gender-20260912-v1'

export const COLLIDER_PROFILE_VERSION = 'collider-profiles-v5'
export const LDRAW_SURFACE_COLLIDER_VERSION = 'ldraw-surface-collider-v1'
// Visual pin-hole radius is 0.300 stud (4.8 mm). Rapier gets a small extra skin
// so a snapped pin never starts the first SIMULATE step in penetration.
export const HOLE_CLEARANCE_STUD = 0.3125
// The connector constraint owns pin retention. Keep the collision proxy just under
// the nominal 0.2925-stud pin body instead of using the much wider friction collar.
export const PIN_COLLIDER_RADIUS_STUD = 0.285

const AXIS_NAMES = Object.freeze(['x', 'y', 'z'])
const AXIS_INDEX = Object.freeze({ x:0, y:1, z:2 })
const CARDINAL_MIN = 0.90
const OFF_AXIS_MAX = 0.18
const ROW_EPS = 0.08
const LDRAW_MIN_CELL_STUD = 0.16
const LDRAW_MAX_CELL_STUD = 0.42
const LDRAW_MAX_SPECS = 72
const ldrawProfileCache = new Map()

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

function isLDrawDefinition(definition) {
  return String(definition?.id || '').startsWith('ldraw-') || Boolean(definition?.ldraw?.file)
}

function effectivelyVisible(node, root) {
  let cursor=node
  while(cursor){
    if(cursor.visible===false)return false
    if(cursor===root)break
    cursor=cursor.parent
  }
  return true
}

function poseKey(object, definition) {
  const pose=object?.userData?.mechanismPose
  return `${definition?.id || definition?.ldraw?.code || 'ldraw'}:${pose?JSON.stringify(pose):'rigid'}`
}

function cloneSpec(spec) {
  return {
    ...spec,
    center:spec.center.clone(),
    size:spec.size?.clone?.() ?? spec.size,
  }
}

function cacheLDrawProfile(key,specs) {
  if(ldrawProfileCache.has(key))ldrawProfileCache.delete(key)
  ldrawProfileCache.set(key,specs.map(cloneSpec))
  while(ldrawProfileCache.size>256)ldrawProfileCache.delete(ldrawProfileCache.keys().next().value)
}

function meshTrianglesLocal(object) {
  object.updateWorldMatrix(true,true)
  const inverse=object.matrixWorld.clone().invert(),triangles=[]
  const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3()
  object.traverse(child=>{
    if(!child.isMesh||!child.geometry||child.userData?.physicsIgnore||!effectivelyVisible(child,object))return
    const position=child.geometry.getAttribute?.('position')
    if(!position||position.count<3)return
    const index=child.geometry.index, transform=inverse.clone().multiply(child.matrixWorld)
    const count=index?index.count:position.count
    for(let i=0;i+2<count;i+=3){
      const ia=index?index.getX(i):i,ib=index?index.getX(i+1):i+1,ic=index?index.getX(i+2):i+2
      a.fromBufferAttribute(position,ia).applyMatrix4(transform)
      b.fromBufferAttribute(position,ib).applyMatrix4(transform)
      c.fromBufferAttribute(position,ic).applyMatrix4(transform)
      if(new THREE.Triangle(a,b,c).getArea()<1e-7)continue
      triangles.push(new THREE.Triangle(a.clone(),b.clone(),c.clone()))
    }
  })
  return triangles
}

const cellId=(x,y,z)=>`${x},${y},${z}`

function occupiedSurfaceCells(triangles,bounds,cell) {
  const occupied=new Set(),halfDiagonal=Math.sqrt(3)*cell*.58
  const triBox=new THREE.Box3(),center=new THREE.Vector3(),closest=new THREE.Vector3()
  for(const triangle of triangles){
    triBox.setFromPoints([triangle.a,triangle.b,triangle.c]).expandByScalar(cell*.12)
    const min=triBox.min.clone().sub(bounds.min).divideScalar(cell).floor()
    const max=triBox.max.clone().sub(bounds.min).divideScalar(cell).floor()
    for(let x=Math.max(0,min.x);x<=max.x;x+=1)for(let y=Math.max(0,min.y);y<=max.y;y+=1)for(let z=Math.max(0,min.z);z<=max.z;z+=1){
      center.set(bounds.min.x+(x+.5)*cell,bounds.min.y+(y+.5)*cell,bounds.min.z+(z+.5)*cell)
      triangle.closestPointToPoint(center,closest)
      if(closest.distanceToSquared(center)<=halfDiagonal*halfDiagonal)occupied.add(cellId(x,y,z))
    }
  }
  return occupied
}

function mergeSurfaceCells(occupied,bounds,cell) {
  const remaining=new Set(occupied),specs=[]
  const has=(x,y,z)=>remaining.has(cellId(x,y,z))
  while(remaining.size){
    const first=remaining.values().next().value.split(',').map(Number)
    const [x0,y0,z0]=first
    let x1=x0
    while(has(x1+1,y0,z0))x1+=1
    let z1=z0,can=true
    while(can){
      const next=z1+1
      for(let x=x0;x<=x1;x+=1)if(!has(x,y0,next)){can=false;break}
      if(can)z1=next
    }
    let y1=y0;can=true
    while(can){
      const next=y1+1
      for(let x=x0;x<=x1;x+=1)for(let z=z0;z<=z1;z+=1)if(!has(x,next,z)){can=false;break}
      if(can)y1=next
    }
    for(let x=x0;x<=x1;x+=1)for(let y=y0;y<=y1;y+=1)for(let z=z0;z<=z1;z+=1)remaining.delete(cellId(x,y,z))
    const minX=bounds.min.x+x0*cell,maxX=Math.min(bounds.max.x,bounds.min.x+(x1+1)*cell)
    const minY=bounds.min.y+y0*cell,maxY=Math.min(bounds.max.y,bounds.min.y+(y1+1)*cell)
    const minZ=bounds.min.z+z0*cell,maxZ=Math.min(bounds.max.z,bounds.min.z+(z1+1)*cell)
    addBox(specs,minX,maxX,minY,maxY,minZ,maxZ)
  }
  return specs
}

function ldrawSurfaceProfile(object,definition) {
  if(!isLDrawDefinition(definition)||object?.userData?.ldraw?.status==='loading')return null
  const key=poseKey(object,definition),cached=ldrawProfileCache.get(key)
  if(cached)return {kind:'ldraw-surface-cache',specs:cached.map(cloneSpec)}
  const triangles=meshTrianglesLocal(object)
  if(!triangles.length)return null
  const bounds=new THREE.Box3()
  for(const triangle of triangles)bounds.expandByPoint(triangle.a).expandByPoint(triangle.b).expandByPoint(triangle.c)
  if(bounds.isEmpty())return null
  let cell=LDRAW_MIN_CELL_STUD,specs=[]
  while(cell<=LDRAW_MAX_CELL_STUD+1e-6){
    specs=mergeSurfaceCells(occupiedSurfaceCells(triangles,bounds,cell),bounds,cell)
    if(specs.length&&specs.length<=LDRAW_MAX_SPECS)break
    cell=Math.min(LDRAW_MAX_CELL_STUD+.01,cell*1.28)
  }
  if(!specs.length||specs.length>LDRAW_MAX_SPECS)return null
  cacheLDrawProfile(key,specs)
  return {kind:'ldraw-surface',specs,cellStud:cell,triangles:triangles.length}
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

function addRangeBox(specs, ranges) {
  addBox(
    specs,
    ranges.x[0], ranges.x[1],
    ranges.y[0], ranges.y[1],
    ranges.z[0], ranges.z[1],
  )
}

function finiteVector3(value) {
  if (value?.isVector3) return value.clone()
  if (!Array.isArray(value) || value.length !== 3 || !value.every(Number.isFinite)) return null
  return new THREE.Vector3(...value)
}

function explicitColliderProfile(definition) {
  const source = definition?.physics?.colliderProfile
  if (!source || !Array.isArray(source.specs) || !source.specs.length) return null
  const specs = []

  for (const raw of source.specs) {
    if (!raw || typeof raw !== 'object') continue
    const center = finiteVector3(raw.center ?? [0, 0, 0])
    if (!center) continue

    if (raw.type === 'box') {
      const size = finiteVector3(raw.size)
      if (!size || size.x <= .01 || size.y <= .01 || size.z <= .01) continue
      specs.push({
        type: 'box',
        center,
        size,
        volume: size.x * size.y * size.z,
      })
      continue
    }

    if (['cylinder-x', 'cylinder-y', 'cylinder-z'].includes(raw.type)) {
      const radius = Number(raw.radius)
      const halfLength = Number(raw.halfLength)
      if (!(radius > .01) || !(halfLength > .01)) continue
      specs.push({
        type: raw.type,
        center,
        radius,
        halfLength,
        volume: Math.PI * radius * radius * halfLength * 2,
      })
    }
  }

  return specs.length ? { kind: 'explicit', specs, sourceVersion: source.version ?? null } : null
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

function cardinalAxis(axis) {
  if (!Array.isArray(axis) || axis.length !== 3 || !axis.every(Number.isFinite)) return null
  const abs = axis.map(value => Math.abs(value))
  let index = 0
  if (abs[1] > abs[index]) index = 1
  if (abs[2] > abs[index]) index = 2
  if (abs[index] < CARDINAL_MIN) return null
  if (abs.some((value, i) => i !== index && value > OFF_AXIS_MAX)) return null
  return AXIS_NAMES[index]
}

function commonCardinalAxis(connectors) {
  let result = null
  for (const connector of connectors) {
    const axis = cardinalAxis(connector.axis)
    if (!axis) return null
    if (result && result !== axis) return null
    result = axis
  }
  return result
}

function boundsRanges(fallback) {
  return {
    x:[fallback.center.x - fallback.size.x / 2, fallback.center.x + fallback.size.x / 2],
    y:[fallback.center.y - fallback.size.y / 2, fallback.center.y + fallback.size.y / 2],
    z:[fallback.center.z - fallback.size.z / 2, fallback.center.z + fallback.size.z / 2],
  }
}

function legacyStudBounds(definition, fallback, holeAxis, rowAxis, normalAxis) {
  const ranges = boundsRanges(fallback)
  // Preserve the existing studded-Technic-brick rule: studs are not part of the
  // structural collider height, while side holes remain open along local Z.
  if (!(holeAxis === 'z' && rowAxis === 'x' && normalAxis === 'y')) return ranges
  const studs = (definition?.connectors ?? []).filter(connector => connector.type === 'stud')
  if (!studs.length) return ranges
  const xs = studs.map(connector => connector.position[0])
  const zs = studs.map(connector => connector.position[2])
  ranges.x = [Math.min(...xs) - .4625, Math.max(...xs) + .4625]
  ranges.y = [0, Math.max(...studs.map(connector => connector.position[1]))]
  ranges.z = [Math.min(...zs) - .44, Math.max(...zs) + .44]
  return ranges
}

function legacyPinHoles(definition) {
  return (definition?.connectors ?? [])
    .filter(connector => connector.type === 'pin-hole')
    .map(connector => ({
      id:connector.id ?? null,
      position:Array.isArray(connector.position) ? [...connector.position] : null,
      axis:Array.isArray(connector.axis) ? [...connector.axis] : null,
      clearance:HOLE_CLEARANCE_STUD,
      source:'legacy',
    }))
    .filter(hole => hole.position?.length === 3 && hole.position.every(Number.isFinite) && cardinalAxis(hole.axis))
}

function v4PinHoles(definition) {
  const connectivity = definition?.connectivityV4
  if (connectivity?.status !== 'ready' || connectivity?.health?.pass === false) return []
  const holes = []
  for (const connector of connectivity.connectors ?? []) {
    const semantics = classifyTechnicPinInterfaceV4(connector)
    if (semantics?.role !== 'technic-pin-hole') continue
    const position = connector.frame?.positionStud
    const axis = connector.frame?.axis
    if (!Array.isArray(position) || position.length !== 3 || !position.every(Number.isFinite)) continue
    if (!cardinalAxis(axis)) continue
    const throatRadius = Math.max(0, Number(semantics.throatRadiusLdu) || 0) / 20
    holes.push({
      id:connector.endpointId ?? connector.id ?? null,
      position:[...position],
      axis:[...axis],
      clearance:Math.max(HOLE_CLEARANCE_STUD, throatRadius + .0125),
      source:'connector-v4',
    })
  }
  return holes
}

function pinHoleEvidence(definition) {
  // LDraw Connector V4 is authoritative when it can prove connhole semantics.
  // Legacy metadata stays the fallback for built-in procedural parts.
  const v4 = v4PinHoles(definition)
  if (v4.length) return { holes:v4, source:'connector-v4' }
  const legacy = legacyPinHoles(definition)
  return legacy.length ? { holes:legacy, source:'legacy' } : null
}

function spread(values) {
  return values.length ? Math.max(...values) - Math.min(...values) : 0
}

function linearHoleProfile(definition, fallback) {
  if (definition?.mechanics?.suspensionArm) return null
  const evidence = pinHoleEvidence(definition)
  if (!evidence?.holes?.length) return null
  const holes = evidence.holes
  const holeAxis = commonCardinalAxis(holes)
  if (!holeAxis) return null

  const perpendicular = AXIS_NAMES.filter(axis => axis !== holeAxis)
  const spreads = Object.fromEntries(perpendicular.map(axis => [axis, spread(holes.map(hole => hole.position[AXIS_INDEX[axis]]))]))
  let rowAxis = spreads[perpendicular[0]] >= spreads[perpendicular[1]] ? perpendicular[0] : perpendicular[1]
  if (Math.max(spreads[perpendicular[0]], spreads[perpendicular[1]]) <= ROW_EPS) {
    rowAxis = fallback.size[perpendicular[0]] >= fallback.size[perpendicular[1]] ? perpendicular[0] : perpendicular[1]
  }
  const normalAxis = perpendicular.find(axis => axis !== rowAxis)

  const holeAxisValues = holes.map(hole => hole.position[AXIS_INDEX[holeAxis]])
  const normalValues = holes.map(hole => hole.position[AXIS_INDEX[normalAxis]])
  if (spread(holeAxisValues) > ROW_EPS || spread(normalValues) > ROW_EPS) return null

  const ranges = legacyStudBounds(definition, fallback, holeAxis, rowAxis, normalAxis)
  const rowMin = ranges[rowAxis][0]
  const rowMax = ranges[rowAxis][1]
  const normalMin = ranges[normalAxis][0]
  const normalMax = ranges[normalAxis][1]
  const normalCenter = normalValues.reduce((sum, value) => sum + value, 0) / normalValues.length
  const maxClearance = Math.max(...holes.map(hole => hole.clearance ?? HOLE_CLEARANCE_STUD))
  const middleMin = Math.max(normalMin, normalCenter - maxClearance)
  const middleMax = Math.min(normalMax, normalCenter + maxClearance)
  if (middleMax <= middleMin) return null

  const specs = []
  const lower = { x:[...ranges.x], y:[...ranges.y], z:[...ranges.z] }
  lower[normalAxis] = [normalMin, middleMin]
  addRangeBox(specs, lower)
  const upper = { x:[...ranges.x], y:[...ranges.y], z:[...ranges.z] }
  upper[normalAxis] = [middleMax, normalMax]
  addRangeBox(specs, upper)

  const sorted = [...holes].sort((a, b) => a.position[AXIS_INDEX[rowAxis]] - b.position[AXIS_INDEX[rowAxis]])
  let cursor = rowMin
  for (const hole of sorted) {
    const center = hole.position[AXIS_INDEX[rowAxis]]
    const clearance = Math.max(HOLE_CLEARANCE_STUD, Number(hole.clearance) || 0)
    const left = Math.max(rowMin, center - clearance)
    const right = Math.min(rowMax, center + clearance)
    const segment = { x:[...ranges.x], y:[...ranges.y], z:[...ranges.z] }
    segment[rowAxis] = [cursor, left]
    segment[normalAxis] = [middleMin, middleMax]
    addRangeBox(specs, segment)
    cursor = Math.max(cursor, right)
  }
  const tail = { x:[...ranges.x], y:[...ranges.y], z:[...ranges.z] }
  tail[rowAxis] = [cursor, rowMax]
  tail[normalAxis] = [middleMin, middleMax]
  addRangeBox(specs, tail)

  return specs.length ? { specs, source:evidence.source, holeAxis, rowAxis } : null
}

function pinColliderProfile(definition, fallback) {
  const connectors = definition?.connectors ?? []
  const pins = connectors.filter(connector => connector.type === 'pin')
  if (!pins.length || pins.length !== connectors.length) return null
  const axis = commonCardinalAxis(pins)
  if (!axis) return null
  const halfLength = Math.max(.04, fallback.size[axis] * .5)
  const perpendicular = AXIS_NAMES.filter(name => name !== axis)
  const visualRadiusLimit = Math.min(fallback.size[perpendicular[0]], fallback.size[perpendicular[1]]) * .49
  const radius = Math.max(.08, Math.min(PIN_COLLIDER_RADIUS_STUD, visualRadiusLimit))
  return [{
    type:`cylinder-${axis}`,
    center:fallback.center.clone(),
    radius,
    halfLength,
    volume:Math.PI * radius * radius * halfLength * 2,
  }]
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
  // Explicit complex-part proxies (bent liftarms, frames, driveline housings, etc.)
  // remain authoritative and are never replaced by generic hole inference.
  const explicit = explicitColliderProfile(definition)
  if (explicit) return explicit

  const fallback = localBounds(object)
  const holes = linearHoleProfile(definition, fallback)
  if (holes) return { kind:holes.source === 'connector-v4' ? 'v4-hole-aware' : 'hole-aware', specs:holes.specs }

  // Pins must never fall through to an axis-aligned bounds cuboid. Their visible
  // friction rings/collar are wider than the bore by design and are not contact
  // geometry; connector constraints model retention while this shaft proxy prevents
  // the first Rapier step from ejecting a valid assembly.
  const pin = pinColliderProfile(definition, fallback)
  if (pin) return { kind:'pin-cylinder', specs:pin }

  const studded = studdedCore(definition)
  if (studded) return { kind: 'studded-core', specs: studded }
  const rotational = rotationalProfile(definition, fallback)
  if (rotational) return { kind: 'rotational', specs: rotational }
  const ldraw = ldrawSurfaceProfile(object, definition)
  if (ldraw) return ldraw
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

export function clearLDrawColliderProfileCache() { ldrawProfileCache.clear() }

export function ldrawColliderProfileCacheSize() { return ldrawProfileCache.size }
