import { Matrix3, Raycaster, Vector3 } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

const mapURL = 'https://raw.githubusercontent.com/swift502/Sketchbook/62f4b7986fd1ce1e4f91daba89ef032c20a6ce55/build/assets/world.glb'
const scale = 90 // LDU per Sketchbook unit for the test-drive diorama.
const down = new Vector3(0, -1, 0)
let trackRequest
let trackProgress
const progressListeners = new Set()

function reportProgress(progress) {
  trackProgress = progress
  for (const listener of progressListeners) listener(progress)
}

export function sketchbookTrack(group) {
  group.scale.setScalar(scale)
  group.updateMatrixWorld(true)
  const colliders = []
  group.traverse(mesh => {
    if (!mesh.isMesh) return
    if (mesh.userData.data !== 'physics') {
      for (const material of [mesh.material].flat()) {
        if (['concrete', 'race_track', 'dirt_road', 'runway'].includes(material.name) && Number.isFinite(material.roughness)) {
          material.roughness = Math.max(.76, material.roughness)
        }
      }
      return
    }
    mesh.visible = false
    if (!['box', 'trimesh'].includes(mesh.userData.type)) return
    mesh.geometry.computeBoundingBox()
    colliders.push({
      mesh, bounds: mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld),
      normalMatrix: new Matrix3().getNormalMatrix(mesh.matrixWorld),
    })
  })

  const ray = new Raycaster(new Vector3(), down)
  const hits = []
  const normal = new Vector3()
  function heightAt(x, z, top, bottom) {
    ray.ray.origin.set(x, top, z)
    ray.far = top - bottom
    let height
    for (const { mesh, bounds, normalMatrix } of colliders) {
      if (x < bounds.min.x || x > bounds.max.x || z < bounds.min.z || z > bounds.max.z ||
          bounds.min.y > top || bounds.max.y < (height ?? bottom)) continue
      hits.length = 0
      mesh.raycast(ray, hits)
      for (const hit of hits) {
        if (hit.point.y <= (height ?? -Infinity) || normal.copy(hit.face.normal).applyNormalMatrix(normalMatrix).y < .55) continue
        height = hit.point.y
      }
    }
    return height
  }

  const marker = group.getObjectByName('Spawn016')
  if (!marker || !colliders.length) throw new Error('Sketchbook: start marker or collision surface missing')
  const start = marker.getWorldPosition(new Vector3())
  const height = heightAt(start.x, start.z, start.y + 3 * scale, start.y - 5 * scale)
  if (height === undefined) throw new Error('Sketchbook: no road at the start marker')
  start.y = height
  // Start on open tarmac facing the sloped approach to the tunnel.
  const heading = -Math.PI / 2
  return { group, start, heading, heightAt, collisionMeshes: colliders.map(({ mesh }) => mesh) }
}

function disposeMap(group) {
  const geometries = new Set()
  const materials = new Set()
  const textures = new Set()
  const images = new Set()
  group.traverse(node => {
    if (!node.isMesh) return
    geometries.add(node.geometry)
    for (const material of [node.material].flat()) materials.add(material)
  })
  for (const geometry of geometries) geometry.dispose()
  for (const material of materials) {
    for (const value of Object.values(material)) if (value?.isTexture) textures.add(value)
    material.dispose()
  }
  for (const texture of textures) {
    images.add(texture.image)
    texture.dispose()
  }
  for (const image of images) image?.close?.()
}

async function fetchSketchbookTrack() {
  reportProgress({ stage: 'download', loaded: 0 })
  const response = await fetch(mapURL, { signal: AbortSignal.timeout(45000) })
  if (!response.ok) throw new Error(`Sketchbook: HTTP ${response.status}`)
  const length = Number(response.headers.get('content-length'))
  const total = length > 0 && !response.headers.get('content-encoding') ? length : undefined
  const reader = response.body?.getReader()
  let buffer
  if (reader) {
    const chunks = []
    let loaded = 0
    reportProgress({ stage: 'download', loaded, total })
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
        loaded += value.byteLength
        reportProgress({ stage: 'download', loaded, total: loaded <= total ? total : undefined })
      }
    } finally {
      reader.releaseLock()
    }
    buffer = await new Blob(chunks).arrayBuffer()
  } else buffer = await response.arrayBuffer()
  reportProgress({ stage: 'prepare' })
  const { scene } = await new GLTFLoader().parseAsync(buffer, mapURL)
  try {
    return sketchbookTrack(scene)
  } catch (error) {
    disposeMap(scene)
    throw error
  }
}

export function loadSketchbookTrack({ onProgress, signal } = {}) {
  // Editor scenes attach the map when needed. Its data belongs to the page.
  trackRequest ??= fetchSketchbookTrack().then(track => {
    reportProgress({ stage: 'ready' })
    return track
  }, error => {
    trackRequest = trackProgress = undefined
    throw error
  })
  if (onProgress && !signal?.aborted) {
    progressListeners.add(onProgress)
    if (trackProgress) onProgress(trackProgress)
    const stop = () => {
      progressListeners.delete(onProgress)
      signal?.removeEventListener('abort', stop)
    }
    signal?.addEventListener('abort', stop, { once: true })
    trackRequest.then(stop, stop)
  }
  return trackRequest
}
