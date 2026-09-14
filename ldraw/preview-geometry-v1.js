import * as THREE from 'three'
import { LDrawLoader } from 'three/addons/loaders/LDrawLoader.js'
import { LDrawConditionalLineMaterial } from 'three/addons/materials/LDrawConditionalLineMaterial.js'
import { installLDrawCacheRecovery, parseCompleteLDraw } from './load-recovery-v1.js?v=ldraw-loading-20260912-v1'
import { createLDrawTextTransport } from './text-transport-v1.js?v=ldraw-loading-20260912-v1'

export const PARTS_PREVIEW_GEOMETRY_VERSION = 'parts-preview-geometry-v1.0.1'

const LDRAW_RAW_ROOT = 'https://raw.githubusercontent.com/pybricks/ldraw/master/'
const LDU_TO_STUD = 1 / 20
let transport = createLDrawTextTransport()
let loaderPromise = null

const normalizeFile = value => String(value || '').replace(/^parts\//i, '').replace(/\\/g, '/').trim()

async function createLoader() {
  const ownTransport = transport
  const loader = installLDrawCacheRecovery(new LDrawLoader())
  loader.setConditionalLineMaterial(LDrawConditionalLineMaterial)
  loader.setPartsLibraryPath(LDRAW_RAW_ROOT)
  loader.partsCache.parseCache.fetchData = file => ownTransport.subpart(file)
  try {
    const text = await ownTransport.read('LDConfig.ldr')
    await loader.preloadMaterials(`data:text/plain;charset=utf-8,${encodeURIComponent(text)}`)
  } catch (error) {
    console.debug?.('[BrickLab Library] Preview colour config unavailable.', error)
  }
  return loader
}

async function getLoader() {
  loaderPromise ??= createLoader()
  return loaderPromise
}

// The preview loader is intentionally separate from runtime-v3's production prototype
// cache. Family warming may touch thousands of parts; none of those top-level 3D models
// should stay alive merely because their 2D thumbnail was rendered.
export async function loadPreviewLDrawModel(file) {
  const normalized = normalizeFile(file)
  if (!normalized) return null
  const ownTransport = transport
  const textTask = ownTransport.read(`parts/${normalized}`)
  const loader = await getLoader()
  loader.addDefaultMaterials()
  const model = await textTask.then(text => parseCompleteLDraw(loader, text))
  model.rotation.x = Math.PI
  model.scale.setScalar(LDU_TO_STUD)
  model.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(model)
  if (box.isEmpty()) throw new Error(`Empty LDraw preview geometry: ${normalized}`)
  const center = box.getCenter(new THREE.Vector3())
  model.position.add(new THREE.Vector3(-center.x, -box.min.y, -center.z))
  model.updateMatrixWorld(true)
  const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3())
  return { model, size:[size.x, size.y, size.z], file:normalized }
}

// LDrawLoader and text transport both retain caches. Rotate the whole preview-only
// stack periodically so a 9k-part family cannot accumulate top-level .dat text,
// parsed subparts and temporary geometry for the lifetime of the tab. Existing
// in-flight calls retain their own loader/transport references and finish normally.
export function resetPreviewGeometryLoader() {
  loaderPromise = null
  transport = createLDrawTextTransport()
}
