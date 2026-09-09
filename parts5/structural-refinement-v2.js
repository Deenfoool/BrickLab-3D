import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { PARTS } from '../parts.js'
import { patchPart } from '../parts3/part-schema-v1.js'
import { TECHNIC_METRICS } from './part-geometry-metrics-v1.js'

export const PARTS5_STRUCTURAL_VISUAL_VERSION = 'parts-5-structural-refinement-v2'

function absMaterial(color, roughness = 0.38) {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness,
    metalness: 0.008,
    clearcoat: 0.09,
    clearcoatRoughness: 0.50,
    ior: 1.47,
  })
}

function boreMaterial(color) {
  const base = new THREE.Color(color)
  base.multiplyScalar(0.64)
  return new THREE.MeshStandardMaterial({ color: base, roughness: 0.60, metalness: 0.01, side: THREE.DoubleSide })
}

function root(id, color) {
  const group = new THREE.Group()
  group.userData.partId = id
  group.userData.color = color
  group.userData.visualVersion = PARTS5_STRUCTURAL_VISUAL_VERSION
  return group
}

function visualOnly(object) {
  object.userData.physicsIgnore = true
  object.userData.parts5VisualDetail = true
  return object
}

function roundedRectShape(width, height, radius) {
  const x = -width / 2
  const y = -height / 2
  const r = Math.min(radius, width / 2, height / 2)
  const shape = new THREE.Shape()
  shape.moveTo(x + r, y)
  shape.lineTo(x + width - r, y)
  shape.quadraticCurveTo(x + width, y, x + width, y + r)
  shape.lineTo(x + width, y + height - r)
  shape.quadraticCurveTo(x + width, y + height, x + width - r, y + height)
  shape.lineTo(x + r, y + height)
  shape.quadraticCurveTo(x, y + height, x, y + height - r)
  shape.lineTo(x, y + r)
  shape.quadraticCurveTo(x, y, x + r, y)
  shape.closePath()
  return shape
}

function circleHole(x, y, radius) {
  const path = new THREE.Path()
  path.absarc(x, y, radius, 0, Math.PI * 2, true)
  return path
}

function annulusShape(outer, inner) {
  const shape = new THREE.Shape()
  shape.absarc(0, 0, outer, 0, Math.PI * 2, false)
  shape.holes.push(circleHole(0, 0, inner))
  return shape
}

function extrudeShape(shape, depth, material, options = {}) {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: options.bevelEnabled ?? true,
    bevelSegments: options.bevelSegments ?? 3,
    bevelSize: options.bevelSize ?? 0.014,
    bevelThickness: options.bevelThickness ?? 0.014,
    curveSegments: options.curveSegments ?? 32,
    steps: 1,
  })
  geometry.translate(0, 0, -depth / 2)
  return new THREE.Mesh(geometry, material)
}

function addBoreFinish(group, x, y, depth, color, radius = TECHNIC_METRICS.pinHoleRadius) {
  const inner = visualOnly(new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.985, radius * 0.985, depth + 0.008, 32, 1, true),
    boreMaterial(color),
  ))
  inner.rotation.x = Math.PI / 2
  inner.position.set(x, y, 0)
  group.add(inner)

  const lipGeometry = new THREE.TorusGeometry(radius + 0.006, 0.013, 6, 32)
  const lipMaterial = absMaterial(color, 0.43)
  for (const side of [-1, 1]) {
    const lip = visualOnly(new THREE.Mesh(lipGeometry, lipMaterial))
    lip.position.set(x, y, side * (depth / 2 + 0.008))
    group.add(lip)
  }
}

function createLiftarm(part, color, length, depth) {
  const group = root(part.id, color)
  const material = absMaterial(color)
  const width = Math.max(0.90, length - 0.10)
  const shape = roundedRectShape(width, TECHNIC_METRICS.beamHeight, 0.43)
  for (let i = 0; i < length; i += 1) {
    shape.holes.push(circleHole(i - (length - 1) / 2, 0, TECHNIC_METRICS.pinHoleRadius))
  }

  const body = extrudeShape(shape, depth, material, {
    bevelSegments: 4,
    bevelSize: depth < 0.5 ? 0.014 : 0.020,
    bevelThickness: depth < 0.5 ? 0.014 : 0.018,
  })
  body.position.y = 0.45
  group.add(body)

  for (let i = 0; i < length; i += 1) {
    addBoreFinish(group, i - (length - 1) / 2, 0.45, depth, color)
  }

  // The long shallow face recess breaks the flat extrusion look while preserving
  // the real through-hole silhouette and all mechanical dimensions.
  if (length >= 5) {
    const recessWidth = Math.max(0.35, length - 2.0)
    const recess = visualOnly(new THREE.Mesh(
      new RoundedBoxGeometry(recessWidth, 0.055, 0.014, 3, 0.020),
      boreMaterial(color),
    ))
    for (const side of [-1, 1]) {
      const face = recess.clone()
      face.position.set(0, 0.45, side * (depth / 2 + 0.010))
      group.add(face)
    }
  }
  return group
}

function addStud(group, x, y, color) {
  const material = absMaterial(color, 0.34)
  const stud = new THREE.Mesh(new THREE.CylinderGeometry(0.296, 0.305, 0.18, 36), material)
  stud.position.set(x, y + 0.09, 0)
  group.add(stud)
  const topRing = visualOnly(new THREE.Mesh(new THREE.TorusGeometry(0.245, 0.012, 6, 32), material))
  topRing.rotation.x = Math.PI / 2
  topRing.position.set(x, y + 0.181, 0)
  group.add(topRing)
}

function createHollowTechnicBrick(part, color, length) {
  const group = root(part.id, color)
  const material = absMaterial(color)
  const width = Math.max(1.0, length - 0.08)
  const depth = 0.88
  const wall = 0.12
  const sideShape = roundedRectShape(width, 1.04, 0.095)
  const holeCount = Math.max(1, length - 1)
  for (let i = 0; i < holeCount; i += 1) {
    sideShape.holes.push(circleHole(i - (holeCount - 1) / 2, 0, 0.225))
  }

  for (const side of [-1, 1]) {
    const panel = extrudeShape(sideShape, wall, material, {
      bevelSegments: 3,
      bevelSize: 0.012,
      bevelThickness: 0.012,
    })
    panel.position.set(0, 0.60, side * (depth / 2 - wall / 2))
    group.add(panel)
  }

  const top = new THREE.Mesh(new RoundedBoxGeometry(width, 0.18, depth, 4, 0.075), material)
  top.position.y = 1.07
  group.add(top)

  // End walls and two narrow bottom rails leave the underside genuinely open.
  for (const side of [-1, 1]) {
    const end = new THREE.Mesh(new RoundedBoxGeometry(0.17, 0.92, depth, 4, 0.070), material)
    end.position.set(side * (width / 2 - 0.085), 0.55, 0)
    group.add(end)

    const rail = new THREE.Mesh(new RoundedBoxGeometry(width - 0.16, 0.12, 0.13, 3, 0.040), material)
    rail.position.set(0, 0.10, side * 0.365)
    group.add(rail)
  }

  for (let i = 0; i < length; i += 1) addStud(group, i - (length - 1) / 2, 1.20, color)

  // Interior vertical webs keep the shell believable without closing the cavity.
  if (length > 2) {
    const webMaterial = absMaterial(color, 0.43)
    for (let i = 1; i < length - 1; i += 1) {
      if (i % 2 === 0) continue
      const web = new THREE.Mesh(new RoundedBoxGeometry(0.09, 0.72, depth - 0.20, 2, 0.025), webMaterial)
      web.position.set(i - (length - 1) / 2, 0.51, 0)
      group.add(web)
    }
  }

  for (let i = 0; i < holeCount; i += 1) {
    const x = i - (holeCount - 1) / 2
    const bore = visualOnly(new THREE.Mesh(
      new THREE.CylinderGeometry(0.221, 0.221, depth - wall * 2 + 0.012, 30, 1, true),
      boreMaterial(color),
    ))
    bore.rotation.x = Math.PI / 2
    bore.position.set(x, 0.60, 0)
    group.add(bore)
  }
  return group
}

const upgraded = []
for (const part of PARTS) {
  let match = part.id.match(/^beam-(\d+)$/)
  if (match) {
    const length = Number(match[1])
    patchPart(PARTS, part.id, {
      create: color => createLiftarm(part, color, length, TECHNIC_METRICS.beamDepth),
      visualQuality: 'parts-5-liftarm-molded-v2',
    })
    upgraded.push(part.id)
    continue
  }

  match = part.id.match(/^thin-beam-(\d+)$/)
  if (match) {
    const length = Number(match[1])
    patchPart(PARTS, part.id, {
      create: color => createLiftarm(part, color, length, 0.40),
      visualQuality: 'parts-5-thin-liftarm-molded-v2',
    })
    upgraded.push(part.id)
    continue
  }

  match = part.id.match(/^technic-brick-1x(\d+)$/)
  if (match) {
    const length = Number(match[1])
    patchPart(PARTS, part.id, {
      create: color => createHollowTechnicBrick(part, color, length),
      visualQuality: 'parts-5-hollow-technic-brick-v2',
    })
    upgraded.push(part.id)
  }
}

globalThis.BrickLabParts5StructuralVisuals = Object.freeze({
  version: PARTS5_STRUCTURAL_VISUAL_VERSION,
  upgraded,
  hollowTechnicBrick: true,
  trueBores: true,
})

window.dispatchEvent(new CustomEvent('bricklab:partcatalogchange', {
  detail: { total: PARTS.length, pack: PARTS5_STRUCTURAL_VISUAL_VERSION },
}))
