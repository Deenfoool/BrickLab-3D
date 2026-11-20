import { node, control } from './catalog.js'
export async function inspectSetPart(
  item,
  { language, signal, prepare, model },
) {
  const ru = language === 'ru',
    dialog = node('dialog', undefined, 'set-dialog')
  const title = node('h2', item.model?.[language] ?? item.name)
  const host = node('div', undefined, 'set-part-viewer')
  const status = node('p', ru ? 'Загрузка модели…' : 'Loading model…')
  const controller = new AbortController()
  const close = () => dialog.close()
  signal.addEventListener('abort', close, { once: true })
  dialog.addEventListener(
    'close',
    () => {
      controller.abort()
      signal.removeEventListener('abort', close)
      dialog.remove()
    },
    { once: true },
  )
  dialog.append(
    title,
    node('p', `${item.partNum} · ${item.colorName}${item.quantity ? ` · ×${item.quantity}` : ''}`),
    host,
    status,
    control(ru ? 'Закрыть' : 'Close', close, controller.signal),
  )
  document.body.append(dialog)
  dialog.showModal()
  if (!item.model) {
    status.textContent = ru
      ? '3D-модель пока отсутствует.'
      : '3D model unavailable.'
    const image = node('img')
    image.src = item.image
    image.alt = item.name
    host.append(image)
    return
  }
  let renderer, controls, material
  try {
    const [THREE, { OrbitControls }] = await Promise.all([
      import('three'),
      import('three/addons/controls/OrbitControls.js'),
      prepare(item.model),
    ])
    if (controller.signal.aborted) return
    const record = model(item.design),
      world = new THREE.Scene(),
      camera = new THREE.PerspectiveCamera(40, 1, 0.1, 10000)
    renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    renderer.setSize(host.clientWidth, 300)
    renderer.setClearColor('#20242b')
    host.append(renderer.domElement)
    material = new THREE.MeshStandardMaterial({
      color: item.color,
      roughness: 0.5,
    })
    const group = new THREE.Group()
    const geometry = record.meshes
    for (const mesh of geometry) group.add(new THREE.Mesh(mesh, material))
    const center = record.bounds.getCenter(new THREE.Vector3()),
      size = record.bounds.getSize(new THREE.Vector3()).length()
    group.rotation.x = Math.PI
    group.position
      .copy(center)
      .applyAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI)
      .negate()
    world.add(group)
    world.add(new THREE.HemisphereLight(0xffffff, 0x777777, 3))
    const light = new THREE.DirectionalLight(0xffffff, 3)
    light.position.set(1, 2, 3)
    world.add(light)
    camera.position.set(size, size * 0.65, size)
    camera.lookAt(0, 0, 0)
    controls = new OrbitControls(camera, renderer.domElement)
    const render = () => {
      camera.aspect = host.clientWidth / 300
      camera.updateProjectionMatrix()
      renderer.setSize(host.clientWidth, 300)
      renderer.render(world, camera)
    }
    controls.addEventListener('change', render)
    const observer = new ResizeObserver(render)
    observer.observe(host)
    controller.signal.addEventListener(
      'abort',
      () => {
        observer.disconnect()
        controls.dispose()
        material.dispose()
        renderer.dispose()
      },
      { once: true },
    )
    status.textContent = ru
      ? 'Потяни мышью, чтобы повернуть. Колесо — масштаб.'
      : 'Drag to rotate. Scroll to zoom.'
    render()
  } catch (error) {
    controls?.dispose()
    material?.dispose()
    renderer?.dispose()
    if (!controller.signal.aborted)
      status.textContent = ru
        ? 'Не удалось открыть 3D-модель.'
        : 'Could not open the 3D model.'
  }
}
