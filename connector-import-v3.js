import { normalizeProjectConnections } from './connector-project-migration-v3.js'

const marker = Symbol.for('bricklab.connectorImportV3')

if (globalThis.File?.prototype && !File.prototype[marker]) {
  const originalText = File.prototype.text
  File.prototype.text = async function bricklabConnectorAwareFileText(...args) {
    const text = await originalText.apply(this, args)
    if (!/\.bricklab$/i.test(this.name || '')) return text
    try {
      const project = JSON.parse(text)
      normalizeProjectConnections(project)
      return JSON.stringify(project)
    } catch {
      return text
    }
  }
  Object.defineProperty(File.prototype, marker, { value: true, enumerable: false })
}
