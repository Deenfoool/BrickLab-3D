// Run from the repository root with Playwright available and a local HTTP server.
import { mkdir, writeFile } from 'node:fs/promises'
import { parseArgs } from 'node:util'
import { createRequire } from 'node:module'

const { chromium } = createRequire(import.meta.url)('playwright')

const { values } = parseArgs({ options: {
  url: { type: 'string', default: 'http://localhost:8032/' },
  chromium: { type: 'string' },
  start: { type: 'string', default: '0' },
  section: { type: 'string' },
} })
const browser = await chromium.launch({
  executablePath: values.chromium,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
try {
  const page = await browser.newPage()
  const errors = new Set()
  page.on('requestfailed', request => errors.add(`${request.url()}: ${request.failure().errorText}`))
  page.on('response', response => {
    if (!response.ok() && response.status() !== 304) errors.add(`${response.url()}: ${response.status()}`)
  })
  await page.goto(values.url)
  const sections = await page.evaluate(async () => {
    const THREE = await import('three')
    const { sections, loadPartModel, partMesh } = await import('./src/editor/parts.js?v=system-plates')
    const { previewColumns, previewRows, previewPageSize } = await import('./src/editor/library-data.js?v=system-plates')
    const width = 144
    const height = 92
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true })
    renderer.setSize(width, height)
    const scene = new THREE.Scene()
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 100000)
    const direction = new THREE.Vector3(1, .82, 1.36).normalize()
    scene.add(new THREE.HemisphereLight(0xeef5ff, 0x505967, 2))
    for (const [color, power, position] of [[0xffe6c7, 2.5, [2, 4, 3]], [0xc7d9ff, 1.6, [-3, 1, -2]]]) {
      const light = new THREE.DirectionalLight(color, power)
      light.position.set(...position)
      scene.add(light)
    }
    const atlas = document.createElement('canvas')
    atlas.width = width * previewColumns
    atlas.height = height * previewRows
    const context = atlas.getContext('2d')
    globalThis.renderAtlas = async (sectionId, page) => {
      const section = sections.find(item => item.id === sectionId)
      const batch = section.parts.filter(part => Math.floor(part.preview / previewPageSize) === page)
      context.clearRect(0, 0, atlas.width, atlas.height)
      for (const part of batch.sort((a, b) => a.preview - b.preview)) {
        const model = await loadPartModel(part)
        const object = partMesh(model, part.color)
        object.rotation.x = Math.PI
        scene.add(object)
        const bounds = new THREE.Box3().setFromObject(object)
        const center = bounds.getCenter(new THREE.Vector3())
        camera.position.copy(center).addScaledVector(direction, bounds.getSize(new THREE.Vector3()).length() * 2 + 10)
        camera.lookAt(center)
        camera.updateMatrixWorld()
        const projected = new THREE.Box3()
        for (const x of [bounds.min.x, bounds.max.x]) {
          for (const y of [bounds.min.y, bounds.max.y]) {
            for (const z of [bounds.min.z, bounds.max.z]) {
              projected.expandByPoint(new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse))
            }
          }
        }
        const size = projected.getSize(new THREE.Vector3())
        const halfHeight = Math.max(size.y, size.x * height / width, 1) * .58
        camera.top = halfHeight
        camera.bottom = -halfHeight
        camera.right = halfHeight * width / height
        camera.left = -camera.right
        camera.updateProjectionMatrix()
        renderer.render(scene, camera)
        const tile = part.preview % previewPageSize
        context.drawImage(renderer.domElement, tile % previewColumns * width, Math.floor(tile / previewColumns) * height)
        scene.remove(object)
        object.userData.finish.dispose()
        if (part.pack) for (const mesh of model.meshes) mesh.dispose()
      }
      return atlas.toDataURL('image/webp', .86).split(',')[1]
    }
    return sections.map(({ id, parts }) => ({
      id, path: parts[0].assetPath, pages: Math.ceil(parts.length / previewPageSize),
    }))
  })
  const selected = values.section ? sections.filter(section => section.id === values.section) : sections
  if (!selected.length) throw new Error(`Unknown library section: ${values.section}`)
  for (const { id, path, pages } of selected) {
    const output = `assets/ldraw/${path}/previews`
    await mkdir(output, { recursive: true })
    for (let index = Number(values.start); index < pages; index += 1) {
      const image = await page.evaluate(({ id, index }) => globalThis.renderAtlas(id, index), { id, index })
      await writeFile(`${output}/${index}.webp`, Buffer.from(image, 'base64'))
      console.log(`${id}: preview atlas ${index + 1}/${pages}`)
    }
    console.log(`${id}: generated ${pages} preview atlases`)
  }
  if (errors.size) throw new Error([...errors].join('\n'))
} finally {
  await browser.close()
}
