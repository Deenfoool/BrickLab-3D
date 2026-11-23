import { redactDiagnostics } from './report.js?v=bug-report-v1'

export function installDiagnostics(target, limit = 40) {
  const entries = [], originals = {}, wrappers = {}
  function record(level, args) {
    try {
      const message = args.map(value => typeof value === 'string' ? value : value instanceof Error
        ? value.name + ': ' + value.message + '\n' + (value.stack ?? '') : '[object]').join(' ')
      entries.push('[' + new Date().toISOString() + '] ' + level + ': ' + redactDiagnostics(message).slice(0, 3000))
      if (entries.length > limit) entries.shift()
    } catch { /* Diagnostics must never interrupt the application. */ }
  }
  for (const level of ['error', 'warn']) {
    originals[level] = target.console[level]
    wrappers[level] = function (...args) {
      record(level, args)
      return originals[level].apply(target.console, args)
    }
    target.console[level] = wrappers[level]
  }
  const error = event => {
    if (event.error) record('error', [event.error])
    else if (event.message) record('error', [event.message, event.filename ?? '', (event.lineno ?? '') + ':' + (event.colno ?? '')])
    else if (event.target?.src || event.target?.href) record('resource', [event.target.src || event.target.href])
  }
  const rejection = event => record('unhandledrejection', [event.reason])
  target.addEventListener('error', error, true)
  target.addEventListener('unhandledrejection', rejection)
  return {
    snapshot: () => entries.join('\n'),
    dispose() {
      for (const level of ['error', 'warn']) if (target.console[level] === wrappers[level]) target.console[level] = originals[level]
      target.removeEventListener('error', error, true)
      target.removeEventListener('unhandledrejection', rejection)
    },
  }
}
export const sessionDiagnostics = typeof window === 'undefined' ? null : installDiagnostics(window)
