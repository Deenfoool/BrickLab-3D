import {
  ACESFilmicToneMapping, Box3, DirectionalLight, Euler, Group, HemisphereLight, MathUtils, Mesh,
  PerspectiveCamera, PlaneGeometry, Scene, ShaderMaterial, Vector3, WebGLRenderer,
} from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from '../../vendor/meshoptimizer/meshopt_decoder.js'
import { createCarEffects } from './startup-car-effects.js'

const assets = {
  ford: new URL('../../assets/startup/ford-gt.glb.gz?v=2', import.meta.url),
  buggy: new URL('../../assets/startup/dune-buggy.glb.gz?v=1', import.meta.url),
}
const smooth = (start, end, time) => MathUtils.smootherstep(time, start, end)

function carPose(time, id) {
  const entry = 1 - (1 - MathUtils.clamp(time / 1.62, 0, 1)) ** 2.3
  const approach = smooth(.14, 1.18, time)
  const settle = smooth(1.05, 1.69, time)
  const drift = approach * (1 - settle)
  const turn = approach * 1.14 - settle * .14
  const lift = smooth(1.68, 3.10, time)
  const jump = id === 'buggy' ? .56 * Math.sin(Math.PI * smooth(.28, 1.27, time)) : 0
  const brake = id === 'pickup' ? .095 * (smooth(.87, 1.19, time) - smooth(1.19, 1.55, time)) : 0
  return {
    entry, drift, turn, lift,
    x: .62 * (1 - entry) - (id === 'ford' ? .78 : .42) * drift,
    y: .04 + .30 * lift + jump,
    z: 5.35 * (entry - 1),
    yaw: MathUtils.lerp(.27, id === 'pickup' ? -.64 : -.87, turn),
    roll: -.083 * drift,
    pitch: jump * -.26 + brake,
  }
}

async function loadCar(id, signal) {
  if (id === 'pickup') {
    const { createStartupPickup } = await import('./startup-pickup.js?v=brick-intros')
    return signal.aborted ? null : createStartupPickup()
  }
  const asset = assets[id]
  const response = await fetch(asset, { signal })
  if (!response.ok) throw new Error(`${id}: HTTP ${response.status}`)
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
    if (name.endsWith('-rim')) continue
    const group = new Group()
    const bounds = new Box3()
    const wheel = name.startsWith('wheel-')
    for (const node of nodes) bounds.expandByObject(node)
    if (wheel) nodes[0].getWorldPosition(group.position)
    else bounds.getCenter(group.position)
    model.add(group)
    for (const node of nodes) group.attach(node)
    const base = group.position.clone()
    const direction = name.endsWith('-left') ? 1 : -1
    const front = name.includes('-front-')
    let rim
    let rimTiming
    let move = [0, 0, 0], turn = [0, 0, 0], timing = [1.79, 3.15]
    if (wheel) {
      move = [direction * 1.03, .14, front ? .35 : -.35]
      timing = [1.90, 3.20]
      rim = new Group()
      group.add(rim)
      for (const node of members.get(`${name}-rim`) ?? []) rim.attach(node)
      const delay = (front ? 0 : .17) + (direction > 0 ? 0 : .08)
      rimTiming = [2.37 + delay, 3.30 + delay]
    } else if (name.startsWith('suspension-')) {
      move = [direction * .55, .35, front ? .32 : -.32]
      turn = [0, 0, direction * -.22]
      timing = [2.02, 3.23]
    } else if (name.startsWith('door-')) {
      move = [direction * .91, .66, .07]
      turn = [.07, direction * .12, direction * .23]
      timing = [1.75, 3.02]
    } else if (name.startsWith('side-')) {
      move = [direction * .75, .18, -.12]
    } else if (name === 'roof') {
      move = [0, 1.16, -.12]
      timing = [1.65, 2.98]
    } else if (name === 'bonnet') {
      move = [0, .78, .55]
      turn = [-.13, 0, 0]
    } else if (name === 'rear-body') {
      move = [0, .83, -.62]
      turn = [.09, 0, 0]
      timing = [1.82, 3.14]
    } else if (name.startsWith('cage-') || name.startsWith('window-')) {
      move = [0, .69, front || name.endsWith('-front') ? .55 : -.58]
      turn = [.14, 0, .17]
      timing = [1.88, 3.10]
    } else if (name === 'seats') {
      move = [0, .62, .16]
      timing = [2.07, 3.24]
    } else if (name === 'bumper' || name === 'rear-axle') {
      move = [0, .25, name === 'bumper' ? .77 : -.73]
      timing = [1.97, 3.16]
    } else if (name === 'engine') {
      move = [0, .44, -.32]
      timing = [2.06, 3.28]
    }
    const order = name === 'chassis' ? 0
      : name === 'engine' || name.startsWith('suspension-') || name === 'rear-axle' ? 1
      : wheel ? 2 : name === 'roof' || name.startsWith('cage-') ? 4 : 3
    const arrival = .16 + order * .51 + (order ? (groups.size % 4) * .09 : 0)
    groups.set(name, { group, base, move: new Vector3(...move), turn, timing, rim, rimTiming, direction, front, order, arrival })
  }
  return groups
}

function wheelPosition(id, wheel, time, atRim = false) {
  const { x, y, z, yaw, roll, pitch } = carPose(time, id)
  const point = wheel.base.clone().addScaledVector(wheel.move, smooth(...wheel.timing, time))
  if (atRim) point.x += wheel.direction * .68 * smooth(...wheel.rimTiming, time)
  return point.applyEuler(new Euler(pitch, yaw, roll, 'YXZ')).add(new Vector3(x, y, z))
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

function updateAssembly(piece, time) {
  const { group, arrival, base, move, rim, direction, order } = piece
  const travel = 1 - smooth(arrival, arrival + .73, time)
  group.visible = time >= arrival
  group.position.copy(base).addScaledVector(move, travel * 2.2)
  group.position.y += travel * (order === 0 ? 1.75 : .55)
  group.position.z += order === 0 ? travel * -2.2 : 0
  group.rotation.set(travel * .36, travel * .59 * direction, travel * .25 * direction, 'YXZ')
  if (rim) {
    const rimTravel = 1 - smooth(arrival + .32, arrival + .99, time)
    rim.visible = time >= arrival + .32
    rim.position.set(direction * 1.18 * rimTravel, .36 * rimTravel, 0)
    rim.rotation.set(0, .52 * rimTravel, .28 * rimTravel)
  }
}

export async function mountStartupCar(host, { signal, motion, variant, show }) {
  if (signal.aborted || motion.matches) return false
  let renderer
  try {
    renderer = new WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' })
  } catch {
    return false
  }

  const materials = new Set(), geometries = new Set()
  function collect(object) {
    object.traverse(node => {
      if (!node.geometry || !node.material) return
      geometries.add(node.geometry)
      for (const material of [node.material].flat()) materials.add(material)
    })
  }
  function disposeResources() {
    for (const geometry of geometries) geometry.dispose()
    for (const material of materials) material.dispose()
    geometries.clear()
    materials.clear()
  }
  let observer
  let frame
  function dispose() {
    observer?.disconnect()
    cancelAnimationFrame(frame)
    disposeResources()
    renderer.dispose()
    renderer.forceContextLoss()
    renderer.domElement.remove()
  }
  signal.addEventListener('abort', dispose, { once: true })
  let model
  try {
    model = await loadCar(variant.id, signal)
  } catch (error) {
    signal.removeEventListener('abort', dispose)
    if (!signal.aborted) dispose()
    throw error
  }
  if (!model) return false
  collect(model)
  if (signal.aborted) {
    disposeResources()
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
  collect(shadow)
  scene.add(shadow, model)
  const pieces = [...collectGroups(model).values()]
  const assembling = variant.action === 'assemble'
  const effects = assembling ? null : createCarEffects(pieces.filter(({ rim }) => rim),
    (wheel, time, rim) => wheelPosition(variant.id, wheel, time, rim))
  if (effects) {
    scene.add(effects)
    collect(effects)
  }
  const target = new Vector3()
  const height = variant.id === 'buggy' ? .52 : variant.id === 'pickup' ? .14 : 0
  host.append(renderer.domElement)
  let elapsedTime = -.37
  let lastFrame
  function render() {
    const still = motion.matches
    const elapsed = still ? (assembling ? 4 : 0) : elapsedTime
    const { entry, drift, turn, lift, x, y, z, yaw, roll, pitch } = carPose(assembling || still ? 1.62 : elapsed, variant.id)
    model.visible = still || elapsed >= -.05
    model.position.set(assembling || still ? 0 : x, assembling || still ? .04 : y, assembling || still ? 0 : z)
    model.rotation.set(assembling || still ? 0 : pitch, assembling ? -.17 : yaw, assembling || still ? 0 : roll, 'YXZ')
    shadow.position.copy(model.position)
    shadow.position.y = 0
    shadow.rotation.z = -model.rotation.y
    shadow.material.uniforms.opacity.value = assembling ? .62 * smooth(.25, 2.3, elapsed) : .69 - .20 * lift
    shadow.visible = model.visible
    for (const piece of pieces) {
      if (assembling) {
        updateAssembly(piece, elapsed)
        continue
      }
      const { group, base, move, turn, timing, rim, rimTiming, direction, front } = piece
      const spread = smooth(...timing, elapsed)
      group.position.copy(base).addScaledVector(move, spread)
      if (rim) {
        const spin = still ? 0 : 5.35 * entry / .34 + 1.7 * smooth(.35, 1.64, elapsed)
        group.rotation.set(spin, front ? .34 * drift : 0, 0, 'YXZ')
        const eject = smooth(...rimTiming, elapsed)
        const tip = smooth(.24, 1, eject)
        rim.position.set(direction * .68 * eject, .11 * tip, -.10 * tip)
        rim.rotation.set(.32 * tip, direction * .65 * tip, -direction * .24 * tip)
      } else group.rotation.set(turn[0] * spread, turn[1] * spread, turn[2] * spread)
    }
    if (effects) {
      effects.visible = !still && elapsed >= .36 && elapsed < 5.1
      effects.material.uniforms.elapsed.value = elapsed
    }
    const orbit = Math.max(0, elapsed - (assembling ? 3.15 : 2.8))
    const theta = .71 + (assembling ? .05 : .25 * turn) - .24 * (orbit - (1 - Math.exp(-orbit)))
    const fit = Math.max(1, 1.21 / camera.aspect)
    const opening = assembling ? 1 - smooth(.10, 3.1, elapsed) : lift
    const radius = (7.9 + height + opening * 1.36) * fit
    camera.position.set(radius * Math.sin(theta), (2.95 + height + .55 * opening) * fit, radius * Math.cos(theta))
    target.set(0, .63 + height + .47 * opening, assembling ? 0 : -.30 * (1 - entry))
    camera.lookAt(target)
    renderer.render(scene, camera)
  }
  function tick(time) {
    if (lastFrame === undefined || time - lastFrame >= 28) {
      elapsedTime += Math.min(.1, (time - (lastFrame ?? time)) / 1000)
      lastFrame = time
      render()
    }
    if (!motion.matches) frame = requestAnimationFrame(tick)
  }
  function resize() {
    const { clientWidth, clientHeight } = host
    camera.aspect = Math.max(1, clientWidth) / Math.max(1, clientHeight)
    camera.updateProjectionMatrix()
    renderer.setSize(Math.max(1, clientWidth), Math.max(1, clientHeight), false)
    if (effects) effects.material.uniforms.pointScale.value = Math.max(1, clientHeight) * renderer.getPixelRatio() /
      (2 * Math.tan(MathUtils.degToRad(camera.fov) / 2))
    render()
  }
  function updateMotion() {
    cancelAnimationFrame(frame)
    lastFrame = undefined
    tick(performance.now())
  }
  observer = new ResizeObserver(resize)
  observer.observe(host)
  motion.addEventListener('change', updateMotion, { signal })
  resize()
  show()
  updateMotion()
  return true
}
