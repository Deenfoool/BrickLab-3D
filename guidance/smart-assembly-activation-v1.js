export const SMART_ASSEMBLY_ACTIVATION_VERSION = 'smart-assembly-activation-v1.0.1'

function enqueue(callback) {
  if (typeof globalThis.queueMicrotask === 'function') globalThis.queueMicrotask(callback)
  else Promise.resolve().then(callback)
}

export async function activateSmartAssembly() {
  await import('./smart-assembly-runtime-v1.js?v=smart-assembly-20260911-v4')

  // app.js catalog cards select the newly inserted part from their `click` handler.
  // Observe the same click only in the bubble phase and defer evaluation to a
  // microtask, so Smart Assembly always reads the *new* editor selection rather than
  // the pre-click selection seen by the old pointerup/capture bridge.
  if (globalThis.document && !globalThis.__bricklabSmartAssemblyClickBridge) {
    const handler = () => enqueue(() => globalThis.BrickLabSmartAssembly?.evaluate?.())
    globalThis.document.addEventListener('click', handler, false)
    globalThis.__bricklabSmartAssemblyClickBridge = handler
  }

  enqueue(() => globalThis.BrickLabSmartAssembly?.evaluate?.())
  return globalThis.BrickLabSmartAssembly ?? null
}

await activateSmartAssembly()
