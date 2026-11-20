import {
  ACESFilmicToneMapping, Box3, DirectionalLight, Group, HemisphereLight, MathUtils, Mesh,
  PerspectiveCamera, PlaneGeometry, Scene, ShaderMaterial, Vector3, WebGLRenderer,
} from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from '../../vendor/meshoptimizer/meshopt_decoder.js'

const asset = new URL('../../assets/startup/ford-gt.glb.gz?v=1', import.meta.url)
const smooth = (start, end, time) => MathUtils.smootherstep(time, start, end)

async function loadCar(signal) {
  const response = await fetch(asset, { signal })
  if (!response.ok) throw new Error(`Ford GT: HTTP ${response.status}`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  const buffer = bytes[0] === 0x1f && bytes[1] === 0x8b
    ? await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
    : bytes.buffer
  return (await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(buffer, asset.href)).scene
}

function collectGroups(model) {
  const members = new Map()
  model.traverse(node => {
    const { animationGroup } = node.userData
    if (!animationGroup) return
    if (!members.has(animationGroup)) members.set(animationGroup, [])
    members.get(animationGroup).push(node)
  })
  const groups = new Map()
  model.updateWorldMatrix(true, true)
  for (const [name, nodes] of members) {
    const group = new Group()
    const bounds = new Box3()
    for (const node of nodes) bounds.expandByObject(node)
    if (name.startsWith('wheel-')) nodes[0].getWorldPosition(group.position)
    else bounds.getCenter(group.position)
    model.add(group)
    for (const node of nodes) group.attach(node)
    const base = group.position.clone()
    const direction = name.endsWith('-left') ? 1 : -1
    const front = name.includes('-front-') ? 1 : -1
    let move = [0, 0, 0], turn = [0, 0, 0], timing = [1.58, 2.96]
    if (name.startsWith('wheel-')) {
      move = [direction * 1.04, .14, front * .35]
      timing = [1.7, 2.98]
    } else if (name.startsWith('suspension-')) {
      move = [direction * .55, .35, front * .32]
      turn = [0, 0, direction * -.22]
      timing = [1.82, 3.04]
    } else if (name.startsWith('door-')) {
      move = [direction * .91, .66, .07]
      turn = [.07, direction * .12, direction * .23]
      timing = [1.55, 2.8]
    } else if (name.startsWith('side-')) {
      move = [direction * .75, .18, -.12]
    } else if (name === 'roof') {
      move = [0, 1.16, -.12]
      timing = [1.4, 2.77]
    } else if (name === 'bonnet') {
      move = [0, .78, .55]
      turn = [-.13, 0, 0]
    } else if (name === 'rear-body') {
      move = [0, .83, -.62]
      turn = [.09, 0, 0]
      timing = [1.62, 2.94]
    } else if (name === 'engine') {
      move = [0, .44, -.32]
      timing = [1.86, 3.08]
    }
    groups.set(name, { group, base, move: new Vector3(...move), turn, timing })
  }
  return groups
}

function groundShadow() {
  const material = new ShaderMaterial({
    uniforms: { opacity: { value: .64 } },
    vertexShader: `
      varying vec2 surface;
      void main() {
        surface = uv * 2.0 - 1.0;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 surface;
      uniform float opacity;
      void main() {
        float falloff = 1.0 - smoothstep(0.0, 1.0, length(surface));
        gl_FragColor = vec4(0.014, 0.019, 0.027, falloff * falloff * opacity);
      }
    `,
    transparent: true, depthWrite: false,
  })
  const shadow = new Mesh(new PlaneGeometry(5.8, 8.7), material)
  shadow.rotation.x = -Math.PI / 2
  return shadow
}

export async function mountStartupCar(host, { signal, reducedMotion }) {
  const model = await loadCar(signal)
  const materials = new Set(), geometries = new Set()
  model.traverse(node => {
    if (!node.isMesh) return
    geometries.add(node.geometry)
    for (const material of [node.material].flat()) materials.add(material)
  })
  const dispose = () => {
    for (const geometry of geometries) geometry.dispose()
    for (const material of materials) material.dispose()
  }
  if (signal.aborted) {
    dispose()
    return false
  }
  let renderer
  try {
    renderer = new WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' })
  } catch {
    dispose()
    return false
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.35))
  renderer.toneMapping = ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.06
  const scene = new Scene()
  const camera = new PerspectiveCamera(35, 1, .1, 80)
  scene.add(new HemisphereLight('#e8f1ff', '#6480a2', 1.95))
  for (const [color, intensity, position] of [
    ['#fff0d9', 2.35, [4, 7, 6]], ['#9accff', 2.3, [-5, 4, -4]], ['#d9eaff', 1.3, [1, 5, -5]],
  ]) {
    const light = new DirectionalLight(color, intensity)
    light.position.set(...position)
    scene.add(light)
  }
  const shadow = groundShadow()
  geometries.add(shadow.geometry)
  materials.add(shadow.material)
  scene.add(shadow, model)
  const groups = collectGroups(model)
  const target = new Vector3()
  host.append(renderer.domElement)
  let elapsedTime = 0
  let lastFrame
  let frame
  function render() {
    const still = reducedMotion.matches
    const elapsed = still ? 0 : elapsedTime
    const entry = still ? 1 : 1 - (1 - MathUtils.clamp(elapsed / 1.12, 0, 1)) ** 3
    const distance = 4.6 * entry
    const turn = still ? 0 : smooth(.82, 1.63, elapsed)
    const lift = smooth(1.45, 2.95, elapsed)
    model.position.set(0, .04 + lift * .30, distance - 4.6)
    model.rotation.y = MathUtils.lerp(.27, -.87, turn)
    shadow.position.z = model.position.z
    shadow.rotation.z = -model.rotation.y
    shadow.material.uniforms.opacity.value = .69 - .20 * lift
    for (const [name, { group, base, move, turn, timing }] of groups) {
      const spread = smooth(...timing, elapsed)
      group.position.copy(base).addScaledVector(move, spread)
      if (name.startsWith('wheel-')) group.rotation.x = still ? 0 : distance / .39
      else group.rotation.set(...turn.map(angle => angle * spread))
    }
    const orbit = Math.max(0, elapsed - 2.45)
    const theta = .71 + .25 * turn - .30 * (orbit - (1 - Math.exp(-orbit)))
    const fit = Math.max(1, 1.21 / camera.aspect)
    const radius = (7.9 + lift * .9) * fit
    camera.position.set(radius * Math.sin(theta), (2.95 + .55 * lift) * fit, radius * Math.cos(theta))
    target.set(0, .63 + .47 * lift, -.30 * (1 - entry))
    camera.lookAt(target)
    renderer.render(scene, camera)
  }
  function tick(time) {
    elapsedTime += Math.min(.1, (time - (lastFrame ?? time)) / 1000)
    lastFrame = time
    render()
    if (!reducedMotion.matches) frame = requestAnimationFrame(tick)
  }
  function resize() {
    const { clientWidth, clientHeight } = host
    camera.aspect = Math.max(1, clientWidth) / Math.max(1, clientHeight)
    camera.updateProjectionMatrix()
    renderer.setSize(Math.max(1, clientWidth), Math.max(1, clientHeight), false)
    render()
  }
  function updateMotion() {
    cancelAnimationFrame(frame)
    lastFrame = undefined
    tick(performance.now())
  }
  const observer = new ResizeObserver(resize)
  observer.observe(host)
  reducedMotion.addEventListener('change', updateMotion, { signal })
  signal.addEventListener('abort', () => {
    observer.disconnect()
    cancelAnimationFrame(frame)
    dispose()
    renderer.dispose()
    renderer.forceContextLoss()
    renderer.domElement.remove()
  }, { once: true })
  resize()
  updateMotion()
  return true
}
