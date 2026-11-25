import { ACESFilmicToneMapping, MathUtils, WebGLRenderer } from 'three'
import { createStartupBrand } from './startup-brand.js?v=bold-brand'

export async function mountStartupStage(host, { signal, motion, intro, started }) {
  if (signal.aborted) return null
  let renderer
  try {
    renderer = new WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' })
  } catch {
    return null
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.35))
  renderer.setClearColor(0, 0)
  renderer.autoClear = false
  renderer.toneMapping = ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.06

  let brand
  let vehicle
  let vehicleStart
  let lastCarFrame
  let carTime
  let observer
  let frame
  function dispose() {
    observer?.disconnect()
    cancelAnimationFrame(frame)
    brand?.dispose()
    vehicle?.dispose()
    renderer.dispose()
    renderer.domElement.remove()
  }
  signal.addEventListener('abort', dispose, { once: true })
  try {
    brand = await createStartupBrand(signal)
  } catch (error) {
    signal.removeEventListener('abort', dispose)
    if (!signal.aborted) dispose()
    throw error
  }
  if (!brand || signal.aborted) {
    brand?.dispose()
    return null
  }

  function queueFrame() {
    if (frame === undefined) frame = requestAnimationFrame(draw)
  }
  let brandProgress
  let brandRecess
  function draw(now) {
    frame = undefined
    const still = motion.matches
    if (!still && vehicle && brandProgress !== undefined && lastCarFrame !== undefined && now - lastCarFrame < 28) {
      queueFrame()
      return
    }
    const progress = still ? 1 : MathUtils.clamp((now - started) / intro, 0, 1)
    const recess = vehicle ? MathUtils.clamp((now - vehicleStart) / 690, 0, 1) : 0
    if (progress !== brandProgress || recess !== brandRecess) {
      brand.update(progress, recess)
      brandProgress = progress
      brandRecess = recess
    }
    renderer.clear()
    renderer.render(brand.scene, brand.camera)
    if (vehicle) {
      carTime += Math.min(.1, Math.max(0, now - (lastCarFrame ?? now)) / 1000)
      lastCarFrame = now
      vehicle.update(carTime, still)
      renderer.clearDepth()
      renderer.render(vehicle.scene, vehicle.camera)
    }
    if (!still && (progress < 1 || vehicle)) queueFrame()
  }
  function resize() {
    const width = Math.max(1, host.clientWidth)
    const height = Math.max(1, host.clientHeight)
    renderer.setSize(width, height, false)
    brand.resize(width, height)
    vehicle?.resize(width, height, renderer.getPixelRatio())
    brandProgress = undefined
    queueFrame()
  }
  host.append(renderer.domElement)
  observer = new ResizeObserver(resize)
  observer.observe(host)
  motion.addEventListener('change', () => {
    lastCarFrame = undefined
    queueFrame()
  }, { signal })
  resize()
  return {
    setVehicle(next) {
      vehicle = next
      vehicleStart = performance.now()
      carTime = -.37
      lastCarFrame = undefined
      resize()
    },
  }
}
