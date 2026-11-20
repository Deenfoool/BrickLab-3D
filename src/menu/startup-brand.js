import {
  Color, DirectionalLight, Group, HemisphereLight, InstancedMesh, MathUtils, MeshStandardMaterial,
  Object3D, PerspectiveCamera, Scene,
} from 'three'
import { LDrawLoader } from 'three/addons/loaders/LDrawLoader.js'
import { LDrawConditionalLineMaterial } from 'three/addons/materials/LDrawConditionalLineMaterial.js'

const brickSource = new URL('../../assets/startup/brand-bricks.mpd?v=2', import.meta.url)
// Each entry is an LDraw part followed by its dimensions in studs, along X and Z.
const bricks = [
  ['3007', 8, 2], ['2456', 6, 2], ['3001', 4, 2], ['3002', 3, 2], ['3003', 2, 2],
  ['3010', 4, 1], ['3622', 3, 1], ['3004', 2, 1], ['3005', 1, 1],
]
const plates = [['3710', 4, 1], ['3623', 3, 1], ['3023b', 2, 1], ['3024', 1, 1]]
const badge = [
  '0111111110', '1111111111', '1111111111', '1111111111', '1111111111',
  '1111111111', '1111111111', '1111111111', '1111111111', '0111111110',
]
const symbol = [
  '0000000000', '0001111110', '0001111110', '0000000110', '0111110110',
  '0111110110', '0000110110', '0000110000', '0000110000', '0000000000',
]
const glyphs = {
  B: ['111110', '111111', '110011', '110011', '111110', '111111', '110011', '111111', '111110'],
  R: ['111110', '111111', '110011', '110011', '111110', '111100', '110110', '110011', '110011'],
  I: ['1111', '1111', '0110', '0110', '0110', '0110', '0110', '1111', '1111'],
  C: ['011111', '111111', '110000', '110000', '110000', '110000', '110000', '111111', '011111'],
  K: ['110011', '110110', '111100', '111000', '111000', '111100', '110110', '110011', '110011'],
  L: ['11000', '11000', '11000', '11000', '11000', '11000', '11000', '11111', '11111'],
  A: ['011110', '111111', '110011', '110011', '111111', '111111', '110011', '110011', '110011'],
  3: ['111110', '111111', '000011', '000011', '011110', '011111', '000011', '111111', '111110'],
  D: ['111110', '111111', '110011', '110011', '110011', '110011', '110011', '111111', '111110'],
}
const word = Array.from({ length: 9 }, (_, row) =>
  [...'BRICKLAB 3D'].map(letter => letter === ' ' ? '00' : glyphs[letter][row]).join('0'))
const wordWidth = word[0].length
const gap = 3
const brickHeight = 1.2
const grayCourses = ['#3e444d', '#545c66', '#68717c', '#818996', '#a0a8b2', '#c2c7cf']
const yellowCourses = ['#bc7908', '#e9a514', '#ffca29']
let partText

async function loadBrickGeometries() {
  partText ??= fetch(brickSource).then(response => {
    if (!response.ok) throw new Error(`Startup bricks: HTTP ${response.status}`)
    return response.text()
  }).catch(error => {
    partText = undefined
    throw error
  })
  const text = await partText
  const loader = new LDrawLoader().setConditionalLineMaterial(LDrawConditionalLineMaterial)
  loader.addDefaultMaterials()
  const root = await new Promise((resolve, reject) => loader.parse(text, resolve, reject))
  const parts = new Map()
  const materials = new Set()
  root.updateMatrixWorld(true)
  for (const part of root.children) {
    const design = part.userData.fileName?.replace(/\.dat$/i, '')
    if (!design) continue
    const geometries = []
    part.traverse(node => {
      if (node.isMesh) {
        geometries.push(node.geometry.clone().applyMatrix4(node.matrixWorld).scale(1 / 20, 1 / 20, 1 / 20))
      }
      node.geometry?.dispose()
      for (const material of [node.material].flat()) if (material) materials.add(material)
    })
    parts.set(design, geometries)
  }
  for (const material of materials) material.dispose()
  return parts
}

function cover(pattern, designs, vertical, place) {
  const grid = vertical
    ? Array.from({ length: pattern[0].length }, (_, x) => pattern.map(row => row[x] === '1'))
    : pattern.map(row => [...row].map(cell => cell === '1'))
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      if (!grid[y][x]) continue
      const [design, width, height] = designs.find(([, w, h]) => {
        for (let dy = 0; dy < h; dy++) {
          for (let dx = 0; dx < w; dx++) if (!grid[y + dy]?.[x + dx]) return false
        }
        return true
      })
      for (let dy = 0; dy < height; dy++) grid[y + dy].fill(false, x, x + width)
      const cx = x + width / 2, cy = y + height / 2
      place(design, vertical ? cy : cx, vertical ? cx : cy, vertical ? Math.PI / 2 : 0)
    }
  }
}

function brandLayout() {
  const batches = new Map()
  function add(design, section, tint, x, y, z, angle, arrival) {
    if (!batches.has(design)) batches.set(design, [])
    const sign = (Math.floor(x) + Math.floor(y * 2)) % 2 === 0 ? 1 : -1
    batches.get(design).push({ section, tint, x, y, z, angle, arrival, sign })
  }
  grayCourses.forEach((shade, layer) => {
    // Cross the courses to keep the glyphs solid across adjacent bricks.
    cover(word, bricks, layer % 2 === 0, (design, x, y, angle) => {
      const tint = layer === grayCourses.length - 1
        ? y < 3 ? '#d6dbe1' : y > 6 ? '#acb3be' : shade
        : shade
      add(design, 'word', tint, x - wordWidth / 2, word.length / 2 - y,
        brickHeight * (layer + 1 - grayCourses.length / 2), angle, .08 + .045 * layer + .37 * x / wordWidth + .045 * y / word.length)
    })
  })
  yellowCourses.forEach((shade, layer) => {
    cover(badge, bricks, layer % 2 === 0, (design, x, y, angle) => {
      const tint = layer === yellowCourses.length - 1 && y < 4 ? '#ffe063' : shade
      add(design, 'badge', tint, x - badge[0].length / 2, badge.length / 2 - y,
        brickHeight * (layer + 1 - yellowCourses.length / 2), angle, .025 + .095 * layer + .018 * y)
    })
  })
  cover(symbol, plates, false, (design, x, y, angle) => {
    add(design, 'badge', '#333943', x - badge[0].length / 2, badge.length / 2 - y,
      brickHeight * yellowCourses.length / 2 + .4, angle, .29 + .021 * y)
  })
  return batches
}

export async function createStartupBrand(signal) {
  const geometry = await loadBrickGeometries()
  const layout = brandLayout()
  const material = new MeshStandardMaterial({ roughness: .38 })
  const dispose = () => {
    for (const parts of geometry.values()) for (const part of parts) part.dispose()
    material.dispose()
  }
  if (signal.aborted) {
    dispose()
    return null
  }
  if ([...layout.keys()].some(design => !geometry.get(design)?.length)) {
    dispose()
    throw new Error('Missing LDraw startup part')
  }
  const scene = new Scene()
  const logo = new Group()
  const ambient = new HemisphereLight('#eef7ff', '#6b84a3', 1.22)
  const key = new DirectionalLight('#fff2dd', 2.25)
  const rim = new DirectionalLight('#b1d5ff', .95)
  key.position.set(-17, 22, 28)
  rim.position.set(19, 8, -12)
  scene.add(ambient, key, rim, logo)
  const camera = new PerspectiveCamera(32, 1, .1, 320)
  const transform = new Object3D()
  const instanceColor = new Color()
  const batches = [...layout].map(([design, pieces]) => {
    const meshes = geometry.get(design).map(part => {
      const mesh = new InstancedMesh(part, material, pieces.length)
      mesh.frustumCulled = false
      pieces.forEach(({ tint }, index) => mesh.setColorAt(index, instanceColor.set(tint)))
      logo.add(mesh)
      return mesh
    })
    return { meshes, pieces }
  })

  let stacked
  let visibleHeight
  function resize(width, height) {
    stacked = width <= 560
    const contentWidth = stacked ? wordWidth : wordWidth + gap + badge[0].length
    const contentHeight = stacked ? badge.length + gap + word.length : Math.max(badge.length, word.length)
    camera.aspect = width / height
    const field = 2 * Math.tan(MathUtils.degToRad(camera.fov) / 2)
    visibleHeight = Math.max(contentWidth / camera.aspect / (stacked ? .78 : .76), contentHeight / .60)
    camera.position.z = visibleHeight / field
    camera.updateProjectionMatrix()
  }
  function update(progress, recess) {
    const depth = MathUtils.smootherstep(recess, .07, 1)
    const scale = 1 + .16 * Math.sin(Math.PI * recess) + depth * .04
    logo.position.y = visibleHeight * depth * .27
    logo.position.z = -camera.position.z * depth * .23
    const settle = MathUtils.smootherstep(progress, .35, 1)
    logo.rotation.set(.19 - settle * .055 + depth * .04,
      (-.32 + settle * .10) * (1 - depth), -.014 * (1 - depth))
    logo.scale.setScalar(scale)
    ambient.intensity = MathUtils.lerp(1.22, .56, depth)
    key.intensity = MathUtils.lerp(2.25, .68, depth)
    rim.intensity = MathUtils.lerp(.95, .4, depth)

    for (const { meshes, pieces } of batches) {
      pieces.forEach(({ section, x, y, z, angle, arrival, sign }, index) => {
        const isBadge = section === 'badge'
        const offsetX = stacked ? 0 : isBadge ? -(wordWidth + gap) / 2 : (badge[0].length + gap) / 2
        const offsetY = stacked ? isBadge ? (word.length + gap) / 2 : -(badge.length + gap) / 2 : 0
        const travel = 1 - MathUtils.smootherstep(progress, arrival, arrival + .24)
        transform.position.set(x + offsetX + travel * sign * (5 + Math.abs(x) * .22),
          y + offsetY + travel * (isBadge ? 12 : sign * 10), z + travel * (isBadge ? -18 : 16))
        transform.rotation.set(-Math.PI / 2 + travel * sign * .82, travel * .53, angle + travel * sign * 1.40, 'ZXY')
        transform.scale.setScalar(progress < arrival ? 0 : 1)
        transform.updateMatrix()
        for (const mesh of meshes) mesh.setMatrixAt(index, transform.matrix)
      })
      for (const mesh of meshes) mesh.instanceMatrix.needsUpdate = true
    }
  }
  return { scene, camera, resize, update, dispose }
}
