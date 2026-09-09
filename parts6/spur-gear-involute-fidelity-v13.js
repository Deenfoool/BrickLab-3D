import * as THREE from 'three'
import { PARTS } from '../parts.js'
import { patchPart } from '../parts3/part-schema-v1.js'
import { REAL_TECHNIC_NOMINAL } from './nominal-dimension-fidelity-v1.js'
import { gearMetrics } from '../parts5/part-geometry-metrics-v1.js'

export const PARTS6_SPUR_GEAR_INVOLUTE_VERSION = 'parts-6-spur-gear-involute-fidelity-v13'

const N = REAL_TECHNIC_NOMINAL

function pomMaterial(color, roughness = 0.40) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.004 })
}
function shade(color, factor = 0.77, roughness = 0.49) {
  return new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(factor), roughness, metalness: 0.004 })
}
function visualOnly(object, feature) {
  object.userData.physicsIgnore = true
  object.userData.parts6VisualDetail = true
  object.userData.parts6SpurGearFeature = feature
  return object
}
function root(id, color) {
  const group = new THREE.Group()
  group.userData.partId = id
  group.userData.color = color
  group.userData.visualVersion = PARTS6_SPUR_GEAR_INVOLUTE_VERSION
  return group
}
function crossPoints(radius = N.axleTipRadius + 0.006, arm = N.axleArmHalfWidth + 0.004) {
  return [
    [-arm, radius], [arm, radius], [arm, arm], [radius, arm], [radius, -arm], [arm, -arm],
    [arm, -radius], [-arm, -radius], [-arm, -arm], [-radius, -arm], [-radius, arm], [-arm, arm],
  ]
}
function crossPath(radius = N.axleTipRadius + 0.006, arm = N.axleArmHalfWidth + 0.004) {
  const path = new THREE.Path()
  const points = crossPoints(radius, arm)
  path.moveTo(...points[0])
  for (let i = 1; i < points.length; i += 1) path.lineTo(...points[i])
  path.closePath()
  return path
}
function circlePath(radius) {
  const path = new THREE.Path()
  path.absarc(0, 0, radius, 0, Math.PI * 2, true)
  return path
}
function crossBoreShape(outer) {
  const shape = new THREE.Shape()
  shape.absarc(0, 0, outer, 0, Math.PI * 2, false)
  shape.holes.push(crossPath())
  return shape
}
function extrude(shape, depth, material, options = {}) {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: options.bevelEnabled ?? true,
    bevelSegments: options.bevelSegments ?? 3,
    bevelSize: options.bevelSize ?? 0.006,
    bevelThickness: options.bevelThickness ?? 0.006,
    curveSegments: options.curveSegments ?? 48,
    steps: 1,
  })
  geometry.translate(0, 0, -depth / 2)
  return new THREE.Mesh(geometry, material)
}
function gearPlane(mesh) {
  mesh.rotation.x = Math.PI / 2
  mesh.position.y = 0.40
  return mesh
}
function pointOn(radius, angle) {
  return new THREE.Vector2(Math.cos(angle) * radius, Math.sin(angle) * radius)
}

// Polar angle swept by an involute from its base-circle tangent point to radius r.
// This is the actual involute equation: phi = t - atan(t), t=sqrt((r/rb)^2-1).
function involutePolarAngle(baseRadius, radius) {
  if (!(radius > baseRadius)) return 0
  const t = Math.sqrt(Math.max(0, radius * radius / (baseRadius * baseRadius) - 1))
  return t - Math.atan(t)
}

function appendPoint(shape, point, firstState) {
  if (!firstState.started) {
    shape.moveTo(point.x, point.y)
    firstState.started = true
  } else shape.lineTo(point.x, point.y)
}

function involuteGearShape(metrics, innerRimRadius = null) {
  const shape = new THREE.Shape()
  const state = { started: false }
  const z = metrics.teeth
  const toothAngle = Math.PI * 2 / z
  const halfPitchThickness = Math.PI / (2 * z)
  const phiPitch = involutePolarAngle(metrics.baseRadius, metrics.pitchRadius)
  const phiOuter = involutePolarAngle(metrics.baseRadius, metrics.outerRadius)
  const baseMagnitude = halfPitchThickness + phiPitch
  const outerMagnitude = Math.max(toothAngle * 0.025, halfPitchThickness + phiPitch - phiOuter)
  const rootMagnitude = Math.min(toothAngle * 0.46, baseMagnitude + toothAngle * 0.075)
  const flankSamples = z <= 12 ? 6 : 5
  const tipSamples = 3

  for (let tooth = 0; tooth < z; tooth += 1) {
    const center = tooth * toothAngle
    // Root valley -> left root -> left base. This short diagonal approximates the
    // trochoid/fillet region while preserving the canonical dedendum radius.
    appendPoint(shape, pointOn(metrics.rootRadius, center - toothAngle / 2), state)
    appendPoint(shape, pointOn(metrics.rootRadius, center - rootMagnitude), state)
    appendPoint(shape, pointOn(metrics.baseRadius, center - baseMagnitude), state)

    // Left involute flank, sampled by radius. Its angular position moves toward the
    // tooth centre as radius grows, producing the characteristic narrowing tooth tip.
    for (let i = 1; i <= flankSamples; i += 1) {
      const u = i / flankSamples
      const radius = THREE.MathUtils.lerp(metrics.baseRadius, metrics.outerRadius, u)
      const phi = involutePolarAngle(metrics.baseRadius, radius)
      const angle = center - halfPitchThickness - phiPitch + phi
      appendPoint(shape, pointOn(radius, angle), state)
    }

    // Rounded-ish top land follows the actual addendum circle between both flanks.
    for (let i = 1; i <= tipSamples; i += 1) {
      const u = i / tipSamples
      const angle = THREE.MathUtils.lerp(center - outerMagnitude, center + outerMagnitude, u)
      appendPoint(shape, pointOn(metrics.outerRadius, angle), state)
    }

    // Mirrored right involute, traversed from tip back to base.
    for (let i = flankSamples - 1; i >= 0; i -= 1) {
      const u = i / flankSamples
      const radius = THREE.MathUtils.lerp(metrics.baseRadius, metrics.outerRadius, u)
      const phi = involutePolarAngle(metrics.baseRadius, radius)
      const angle = center + halfPitchThickness + phiPitch - phi
      appendPoint(shape, pointOn(radius, angle), state)
    }
    appendPoint(shape, pointOn(metrics.rootRadius, center + rootMagnitude), state)
  }
  shape.closePath()
  if (innerRimRadius && innerRimRadius > 0) shape.holes.push(circlePath(innerRimRadius))
  return shape
}

function spokeShape(angle, innerRadius, outerRadius, innerHalfWidth, outerHalfWidth) {
  const radial = new THREE.Vector2(Math.cos(angle), Math.sin(angle))
  const tangent = new THREE.Vector2(-Math.sin(angle), Math.cos(angle))
  const points = [
    radial.clone().multiplyScalar(innerRadius).add(tangent.clone().multiplyScalar(innerHalfWidth)),
    radial.clone().multiplyScalar(outerRadius).add(tangent.clone().multiplyScalar(outerHalfWidth)),
    radial.clone().multiplyScalar(outerRadius).add(tangent.clone().multiplyScalar(-outerHalfWidth)),
    radial.clone().multiplyScalar(innerRadius).add(tangent.clone().multiplyScalar(-innerHalfWidth)),
  ]
  const shape = new THREE.Shape()
  shape.moveTo(points[0].x, points[0].y)
  for (let i = 1; i < points.length; i += 1) shape.lineTo(points[i].x, points[i].y)
  shape.closePath()
  return shape
}

function legacyProxy(previousFactory, color) {
  const proxy = previousFactory(color)
  proxy.visible = false
  proxy.name = 'parts6-v13-legacy-spur-collider-proxy'
  proxy.userData.parts6LegacySpurColliderProxy = PARTS6_SPUR_GEAR_INVOLUTE_VERSION
  proxy.traverse(child => {
    if (child.isMesh) child.raycast = () => {}
  })
  return proxy
}

function createGear(part, color, previousFactory) {
  const metrics = gearMetrics(part.mechanics.gear.teeth, 'spur')
  const group = root(part.id, color)
  group.add(legacyProxy(previousFactory, color))
  const material = pomMaterial(color)
  const hubRadius = metrics.teeth <= 12 ? 0.335 : 0.355
  const openWeb = metrics.teeth >= 16
  const rimThickness = Math.max(0.16, metrics.module * 1.55)
  const innerRimRadius = openWeb ? Math.max(hubRadius + 0.20, metrics.rootRadius - rimThickness) : null

  const rimShape = involuteGearShape(metrics, innerRimRadius)
  if (!openWeb) rimShape.holes.push(crossPath())
  const rim = visualOnly(gearPlane(extrude(rimShape, metrics.thickness, material, {
    bevelSegments: 3,
    bevelSize: 0.005,
    bevelThickness: 0.005,
    curveSegments: 24,
  })), 'spur-involute-toothed-rim')
  group.add(rim)

  if (openWeb) {
    const hub = visualOnly(gearPlane(extrude(crossBoreShape(hubRadius), metrics.thickness + 0.055, material, {
      bevelSegments: 4,
      bevelSize: 0.007,
      bevelThickness: 0.007,
    })), 'spur-cross-bore-hub')
    group.add(hub)

    const spokeCount = metrics.teeth >= 36 ? 8 : 6
    const inner = hubRadius - 0.035
    const outer = innerRimRadius + 0.055
    const innerWidth = metrics.teeth >= 36 ? 0.105 : 0.115
    const outerWidth = metrics.teeth >= 36 ? 0.072 : 0.080
    for (let i = 0; i < spokeCount; i += 1) {
      const angle = i / spokeCount * Math.PI * 2 + (metrics.teeth % 2 ? metrics.toothAngle / 2 : 0)
      const spoke = visualOnly(gearPlane(extrude(spokeShape(angle, inner, outer, innerWidth, outerWidth), metrics.thickness * 0.72, material, {
        bevelSegments: 2,
        bevelSize: 0.005,
        bevelThickness: 0.005,
      })), 'spur-tapered-web-spoke')
      group.add(spoke)
    }
  }

  // Subtle face shoulders make the POM gear read as a molded part rather than a flat
  // extruded outline. These rings sit on the hub/root faces and remain render-only.
  const faceMaterial = shade(color, 0.82, 0.47)
  const faceOffset = metrics.thickness / 2 + 0.007
  for (const side of [-1, 1]) {
    const hubShoulder = visualOnly(new THREE.Mesh(new THREE.TorusGeometry(hubRadius * 0.82, 0.014, 7, 48), faceMaterial), 'spur-hub-face-shoulder-v13')
    hubShoulder.rotation.x = Math.PI / 2
    hubShoulder.position.set(0, 0.40 + side * faceOffset, 0)
    group.add(hubShoulder)

    const rootShoulder = visualOnly(new THREE.Mesh(new THREE.TorusGeometry(Math.max(hubRadius + 0.08, metrics.rootRadius - 0.055), 0.010, 6, Math.max(52, metrics.teeth * 4)), faceMaterial), 'spur-root-face-shoulder-v13')
    rootShoulder.rotation.x = Math.PI / 2
    rootShoulder.position.set(0, 0.40 + side * faceOffset, 0)
    group.add(rootShoulder)
  }

  group.userData.spurGearFidelity = {
    teeth: metrics.teeth,
    module: metrics.module,
    pressureAngleDeg: metrics.pressureAngleDeg,
    pitchRadius: metrics.pitchRadius,
    baseRadius: metrics.baseRadius,
    rootRadius: metrics.rootRadius,
    outerRadius: metrics.outerRadius,
    involuteFlanks: true,
    openWeb,
    spokeCount: openWeb ? (metrics.teeth >= 36 ? 8 : 6) : 0,
  }
  return group
}

const upgraded = []
for (const part of PARTS.filter(item => item.mechanics?.gear?.kind === 'spur')) {
  if (typeof part.create !== 'function') continue
  const previous = part.create
  patchPart(PARTS, part.id, {
    create: color => createGear(part, color, previous),
    visualQuality: 'parts-6-true-involute-spur-gear-v13',
  })
  upgraded.push(part.id)
}

globalThis.BrickLabParts6SpurGearInvolute = Object.freeze({
  version: PARTS6_SPUR_GEAR_INVOLUTE_VERSION,
  upgraded,
  geometry: 'true involute flanks from canonical base/pitch/addendum circles + root transition + true cross bore + open tapered web spokes on 16T+',
  mechanics: 'shared PARTS-5 gear module/pitch radii and drivetrain/mesh-snap semantics remain authoritative',
  physics: 'pre-v13 gear factory stays invisible as the non-ignored collider/bounds source; all new visible v13 meshes are physicsIgnore so canonical gear collider logic is unchanged',
})

window.dispatchEvent(new CustomEvent('bricklab:partcatalogchange', {
  detail: { total: PARTS.length, pack: PARTS6_SPUR_GEAR_INVOLUTE_VERSION },
}))
