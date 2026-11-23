const cacheName = 'bricklab-project-previews-v2'
const cacheKey = id => new URL(`./project-preview/${encodeURIComponent(id)}`, import.meta.url).href

export async function loadHomePreviews(entries, signal) {
  const cache = await globalThis.caches?.open(cacheName).catch(() => null)
  let renderer
  let webglAvailable = true
  try {
    for (const { project, show } of entries) {
      if (signal.aborted) break
      if (!project.document.parts.length) continue
      let preview
      const key = cacheKey(project.id)
      try {
        const cached = await cache?.match(key).catch(() => null)
        if (cached?.headers.get('X-BrickLab-Modified') === new Date(project.modifiedAt).toISOString()) {
          preview = await cached.blob()
        } else if (webglAvailable) {
          if (!renderer) {
            try {
              const { createProjectPreviewRenderer } = await import('../editor/project-preview.js?v=contact-shadow')
              if (signal.aborted) break
              renderer = createProjectPreviewRenderer()
            } catch {
              webglAvailable = false
            }
          }
          preview = await renderer?.render(project.document, signal)
          if (preview && !signal.aborted) {
            await cache?.put(key, new Response(preview, {
              headers: { 'Content-Type': preview.type, 'X-BrickLab-Modified': new Date(project.modifiedAt).toISOString() },
            })).catch(() => {})
          }
        }
      } catch {
        // A preview failure does not prevent opening the saved project.
      }
      if (!signal.aborted) show(preview)
    }
  } finally {
    renderer?.dispose()
  }
}

export async function removeHomePreview(id) {
  const cache = await globalThis.caches?.open(cacheName)
  await cache?.delete(cacheKey(id))
}
