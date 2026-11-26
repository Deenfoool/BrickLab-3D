import {
  Color, Mesh, MeshBasicMaterial, NearestFilter, OrthographicCamera, PlaneGeometry,
  Scene, ShaderMaterial, Vector2, WebGLRenderTarget,
} from 'three'

const selectionColor = 0xffb01b
const vertexShader = `
  varying vec2 screenUv;
  void main() {
    screenUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`
const fragmentShader = `
  uniform sampler2D partMask;
  uniform vec2 pixelSize;
  uniform vec3 selectionColor;
  uniform vec3 highlightColor;
  uniform vec3 positiveColor;
  uniform vec3 negativeColor;
  uniform vec3 nonlinearColor;
  uniform vec3 movingColor;
  varying vec2 screenUv;

  float orderOf(vec3 entry) {
    return entry.g + 256.0 * entry.b;
  }

  void main() {
    vec3 center = texture2D(partMask, screenUv).rgb;
    float centerOrder = orderOf(center);
    float spread = center.r > 0.0 ? 1.1 : 1.8;
    float edge = 0.0;
    float opacity = 0.0;

    for (int i = 0; i < 8; i++) {
      float angle = float(i) * 0.7853981634;
      vec2 direction = vec2(cos(angle), sin(angle));
      vec3 nearby = texture2D(partMask, screenUv + direction * pixelSize * spread).rgb;
      if (nearby.r > 0.0 && orderOf(nearby) > centerOrder) {
        edge = max(edge, nearby.r);
        opacity += 0.5;
      }
    }

    if (edge == 0.0) discard;
    vec3 color = edge > .9 ? selectionColor : edge > .73 ? movingColor : edge > .58 ? nonlinearColor : edge > .43 ? highlightColor : edge > .27 ? negativeColor : positiveColor;
    gl_FragColor = vec4(color, min(opacity, 1.0));
    #include <colorspace_fragment>
  }
`

export function createPartOutlines(renderer) {
  const parts = new Map()
  const mask = new Scene()
  mask.background = new Color(0x000000)
  mask.matrixWorldAutoUpdate = false
  const blocker = new MeshBasicMaterial({ color: 0x000000, fog: false, toneMapped: false })
  const encoded = []
  const target = new WebGLRenderTarget(1, 1, { minFilter: NearestFilter, magFilter: NearestFilter })
  const overlay = new Scene()
  const overlayCamera = new OrthographicCamera()
  const size = new Vector2()
  const pixels = new Vector2()
  const material = new ShaderMaterial({
    vertexShader, fragmentShader, transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
    uniforms: {
      partMask: { value: target.texture },
      pixelSize: { value: new Vector2() },
      selectionColor: { value: new Color(selectionColor) },
      highlightColor: { value: new Color() },
      positiveColor: { value: new Color(0x36d399) },
      negativeColor: { value: new Color(0x60a5fa) },
      nonlinearColor: { value: new Color(0xc084fc) },
      movingColor: { value: new Color(0xf4b95e) },
    },
  })
  const quad = new Mesh(new PlaneGeometry(2, 2), material)
  quad.frustumCulled = false
  overlay.add(quad)

  function track(id, part) {
    const meshes = part.children.map(source => {
      const mesh = new Mesh(source.geometry, blocker)
      // The main render has already updated these transforms, including the whole vehicle.
      mesh.matrixWorld = source.matrixWorld
      mesh.matrixWorldAutoUpdate = false
      mask.add(mesh)
      return mesh
    })
    parts.set(id, { part, meshes })
  }

  function untrack(id) {
    const entry = parts.get(id)
    if (!entry) return
    mask.remove(...entry.meshes)
    parts.delete(id)
  }

  function maskMaterial(index, primary, throughParts, category) {
    const value = encoded[index] ??= new MeshBasicMaterial({ fog: false, toneMapped: false })
    // Reserve black for unselected parts. The other channels identify each outlined part.
    const id = index + 1
    value.color.setRGB(primary ? 1 : category ?? .5, (id % 256) / 255, Math.floor(id / 256) / 255)
    value.depthTest = value.depthWrite = !throughParts
    return value
  }

  function render(camera, selected, highlights) {
    const visible = id => parts.get(id)?.part.visible
    if (!visible(selected) && ![...highlights.ids].some(visible)) return

    let index = 0
    for (const [id, { part, meshes }] of parts) {
      const primary = id === selected
      const highlighted = highlights.ids.has(id)
      const throughParts = !primary && highlighted && highlights.throughParts
      const paint = part.visible && (primary || highlighted) ? maskMaterial(index++, primary, throughParts, highlights.codes?.get(id)) : blocker
      for (const mesh of meshes) {
        mesh.visible = part.visible
        mesh.renderOrder = throughParts ? 1 : 0
        mesh.material = paint
      }
    }

    renderer.getSize(size)
    renderer.getDrawingBufferSize(pixels)
    if (target.width !== pixels.x || target.height !== pixels.y) target.setSize(pixels.x, pixels.y)
    material.uniforms.pixelSize.value.set(1 / size.x, 1 / size.y)
    material.uniforms.highlightColor.value.setHex(highlights.color)
    renderer.setRenderTarget(target)
    renderer.render(mask, camera)
    renderer.setRenderTarget(null)
    renderer.autoClear = false
    renderer.render(overlay, overlayCamera)
    renderer.autoClear = true
  }

  function dispose() {
    for (const surface of [blocker, material, ...encoded]) surface.dispose()
    quad.geometry.dispose()
    target.dispose()
  }

  return { track, untrack, render, dispose }
}
