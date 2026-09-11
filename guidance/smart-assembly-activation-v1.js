export const SMART_ASSEMBLY_ACTIVATION_VERSION = 'smart-assembly-activation-v1.0.2'

function enqueue(callback) {
  if (typeof globalThis.queueMicrotask === 'function') globalThis.queueMicrotask(callback)
  else Promise.resolve().then(callback)
}

let diagnostic = null
try {
  diagnostic = await import('./smart-assembly-diagnostic-v1.js?v=smart-assembly-diagnostic-20260911-v1')
  diagnostic.setSmartAssemblyDiagnosticPhase?.('activation-loaded')
} catch (error) {
  console.warn('[BrickLab Smart Assembly] Diagnostic overlay unavailable.', error)
}

export async function activateSmartAssembly() {
  diagnostic?.setSmartAssemblyDiagnosticPhase?.('runtime-import')
  try {
    await import('./smart-assembly-runtime-v1.js?v=smart-assembly-20260911-v5')
  } catch (error) {
    diagnostic?.failSmartAssemblyDiagnostic?.(error)
    throw error
  }
  diagnostic?.setSmartAssemblyDiagnosticPhase?.('runtime-ready')

  // app.js catalog cards select the newly inserted part from their `click` handler.
  // Observe the same click only in the bubble phase and defer evaluation to a
  // microtask, so Smart Assembly always reads the *new* editor selection rather than
  // the pre-click selection seen by the old pointerup/capture bridge.
  if (globalThis.document && !globalThis.__bricklabSmartAssemblyClickBridge) {
    const handler = () => enqueue(() => {
      globalThis.BrickLabSmartAssembly?.evaluate?.()
      void diagnostic?.refreshSmartAssemblyDiagnostic?.()
    })
    globalThis.document.addEventListener('click', handler, false)
    globalThis.__bricklabSmartAssemblyClickBridge = handler
  }

  enqueue(() => {
    globalThis.BrickLabSmartAssembly?.evaluate?.()
    void diagnostic?.refreshSmartAssemblyDiagnostic?.()
  })
  return globalThis.BrickLabSmartAssembly ?? null
}

await activateSmartAssembly()
