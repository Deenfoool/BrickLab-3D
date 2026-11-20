import {
  DirectionalLight, Group, HemisphereLight, InstancedMesh, MathUtils, MeshStandardMaterial,
  Object3D, PerspectiveCamera, Scene,
} from 'three'
import { LDrawLoader } from 'three/addons/loaders/LDrawLoader.js'
import { LDrawConditionalLineMaterial } from 'three/addons/materials/LDrawConditionalLineMaterial.js'

const brickSource = new URL('../../assets/startup/brand-bricks.mpd?v=1', import.meta.url)
const plateDesign = [null, '3024', '3023b', '3623', '3710']
const brickDesign = [null, '3005', '3004', '3622', '3010']
const badge = [
  '........', '...xxxx.', '......x.', '.xxxx.x.',
  '....x.x.', '....x...', '....x...', '........',
]
const letters = {
  B: ['1110', '1001', '1001', '1110', '1001', '1001', '1110'],
  R: ['1110', '1001', '1001', '1110', '1010', '1001', '1001'],
  I: ['111', '010', '010', '010', '010', '010', '111'],
  C: ['0111', '1000', '1000', '1000', '1000', '1000', '0111'],
  K: ['1001', '1010', '1100', '1100', '1010', '1001', '1001'],
  L: ['1000', '1000', '1000', '1000', '1000', '1000', '1111'],
  A: ['0110', '1001', '1001', '1111', '1001', '1001', '1001'],
  3: ['1110', '0001', '0001', '0110', '0001', '0001', '1110'],
  D: ['1110', '1001', '1001', '1001', '1001', '1001', '1110'],
}
const color = { gold: '#fac80a', white: '#f4f4f4', black: '#1b2a34' }
const word = Array.from({ length: 7 }, (_, row) =>
  [...'BRICKLAB 3D'].map((letter, index) => {
    if (letter === ' ') return '00'
    return index >= 5 && index <= 7 ? letters[letter][row].replaceAll('1', '2') : letters[letter][row]
  }).join('0'))
const wordWidth = word[0].length
const gap = 2.5
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

function brandLayout() {
  const bricks = new Map()
  function add(design, section, finish, x, y, z, angle, arrival) {
    const key = `${design}:${finish}`
    if (!bricks.has(key)) bricks.set(key, { design, finish, pieces: [] })
    const sign = (Math.floor(x) + Math.floor(y * 2)) % 2 === 0 ? 1 : -1
    bricks.get(key).pieces.push({ section, x, y, z, angle, arrival, sign })
  }
  add('41539', 'badge', color.gold, 0, 0, 0, 0, .05)
  badge.forEach((row, y) => {
    for (const match of row.matchAll(/x{1,4}/g)) {
      const width = match[0].length
      add(plateDesign[width], 'badge', color.black, match.index + width / 2 - 4, 3.5 - y, .4, 0, .18 + y * .038)
    }
  })
  // Vertical backing plates join the horizontal bricks on the face of each letter.
  for (let x = 0; x < wordWidth; x++) {
    const column = word.map(row => row[x]).join('')
    for (const match of column.matchAll(/([12])\1{0,3}/g)) {
      const height = match[0].length
      add(plateDesign[height], 'word', match[1] === '1' ? color.white : color.gold,
        x + .5 - wordWidth / 2, 3.5 - match.index - height / 2, 0, Math.PI / 2, .14 + .43 * x / wordWidth)
    }
  }
  word.forEach((row, y) => {
    for (const match of row.matchAll(/([12])\1{0,3}/g)) {
      const width = match[0].length
      add(brickDesign[width], 'word', match[1] === '1' ? color.white : color.gold,
        match.index + width / 2 - wordWidth / 2, 3 - y, 1.2, 0, .30 + .43 * match.index / wordWidth + .025 * y / 6)
    }
  })
  return [...bricks.values()]
}

export async function createStartupBrand(signal) {
  const geometry = await loadBrickGeometries()
  const layout = brandLayout()
  const materials = []
  const dispose = () => {
    for (const parts of geometry.values()) for (const part of parts) part.dispose()
    for (const material of materials) material.dispose()
  }
  if (signal.aborted) {
    dispose()
    return null
  }
  if (layout.some(({ design }) => !geometry.get(design)?.length)) {
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
  const batches = layout.map(({ design, finish, pieces }) => {
    const material = new MeshStandardMaterial({ color: finish, roughness: .38 })
    materials.push(material)
    const meshes = geometry.get(design).map(part => {
      const mesh = new InstancedMesh(part, material, pieces.length)
      mesh.frustumCulled = false
      logo.add(mesh)
      return mesh
    })
    return { meshes, pieces }
  })

  let stacked
  let visibleHeight
  function resize(width, height) {
    stacked = width <= 560
    const contentWidth = stacked ? wordWidth : wordWidth + gap + 8
    const contentHeight = stacked ? 8 + gap + 7 : 8
    camera.aspect = width / height
    const field = 2 * Math.tan(MathUtils.degToRad(camera.fov) / 2)
    visibleHeight = Math.max(contentWidth / camera.aspect / (stacked ? .80 : .71), contentHeight / .60)
    camera.position.z = visibleHeight / field
    camera.updateProjectionMatrix()
  }
  function update(progress, recess) {
    const depth = MathUtils.smootherstep(recess, .07, 1)
    const scale = 1 + .16 * Math.sin(Math.PI * recess) + depth * .04
    logo.position.y = visibleHeight * depth * .27
    logo.position.z = -camera.position.z * depth * .23
    logo.rotation.set(.24 - depth * .05, -.17 * (1 - depth), -.018 * (1 - depth))
    logo.scale.setScalar(scale)
    ambient.intensity = MathUtils.lerp(1.22, .56, depth)
    key.intensity = MathUtils.lerp(2.25, .68, depth)
    rim.intensity = MathUtils.lerp(.95, .4, depth)

    for (const { meshes, pieces } of batches) {
      pieces.forEach(({ section, x, y, z, angle, arrival, sign }, index) => {
        const badge = section === 'badge'
        const offsetX = stacked ? 0 : badge ? -(wordWidth + gap) / 2 : (8 + gap) / 2
        const offsetY = stacked ? badge ? (7 + gap) / 2 : -(8 + gap) / 2 : 0
        const travel = 1 - MathUtils.smootherstep(progress, arrival, arrival + .24)
        transform.position.set(x + offsetX + travel * sign * (5 + Math.abs(x) * .22),
          y + offsetY + travel * (badge ? 12 : sign * 10), z + travel * (badge ? -18 : 16))
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
