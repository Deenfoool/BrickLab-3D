export const SMART_ASSEMBLY_ACTIVATION_VERSION = 'smart-assembly-activation-v1.0.3'

function enqueue(callback) {
  if (typeof globalThis.queueMicrotask === 'function') globalThis.queueMicrotask(callback)
  else Promise.resolve().then(callback)
}

export async function activateSmartAssembly() {
  await import('./smart-assembly-runtime-v1.js?v=smart-assembly-20260911-v6')

  // The runtime now receives the authoritative editor-selection event. Keep the
  // post-click bridge as a compatibility fallback for catalog/programmatic actions
  // while old saved sessions are still open in existing browser tabs.
  if (globalThis.document && !globalThis.__bricklabSmartAssemblyClickBridge) {
    const handler = () => enqueue(() => globalThis.BrickLabSmartAssembly?.evaluate?.())
    globalThis.document.addEventListener('click', handler, false)
    globalThis.__bricklabSmartAssemblyClickBridge = handler
  }

  enqueue(() => globalThis.BrickLabSmartAssembly?.evaluate?.())
  return globalThis.BrickLabSmartAssembly ?? null
}

await activateSmartAssembly()
