import { readFile, readdir, writeFile } from 'node:fs/promises'
import { createShadowResolverV4 } from '../connectors-v4/shadow-resolver-v4.js'
import { finalizeConnectorIdentitiesV4 } from '../connectors-v4/identity-v4.js'
const [geometryRoot, shadowRoot, output] = process.argv.slice(2)
if (!geometryRoot || !shadowRoot || !output) throw new Error('Usage: node scripts/audit-connector-inheritance.mjs <ldraw> <shadow> <report.json>')
const read = base => async path => {
  try { return await readFile(`${base}/${path}`, 'utf8') }
  catch (e) { if (e.code === 'ENOENT') return null; throw e }
}
const options = { fetchOfficialText: read(geometryRoot), fetchShadowText: read(shadowRoot) }
const before = createShadowResolverV4({ ...options, inheritancePaths: new Set() })
const after = createShadowResolverV4(options)
const report = { parts: 0, changed: [], unchanged: 0, newWarnings: [] }
for (const file of (await readdir(`${geometryRoot}/parts`)).filter(v => v.endsWith('.dat')).sort()) {
  const a = await before.resolve(file), b = await after.resolve(file)
  report.parts++
  if (JSON.stringify(a.connectors) !== JSON.stringify(b.connectors)) {
    report.changed.push({ file, before: a.connectors.length, after: b.connectors.length,
      beforeUnique:finalizeConnectorIdentitiesV4(file,a.connectors).connectors.length,
      afterUnique:finalizeConnectorIdentitiesV4(file,b.connectors).connectors.length,
      families: [...new Set(b.connectors.map(c => c.family))], warnings: b.warnings.length })
  } else report.unchanged++
  const known = new Set(a.warnings.map(w => JSON.stringify(w)))
  const added = b.warnings.filter(w => !known.has(JSON.stringify(w)))
  if (added.length) report.newWarnings.push({ file, warnings: added })
  // Keep this offline audit bounded independently of the library size.
  if (report.parts % 500 === 0) { before.clearCache(); after.clearCache() }
}
await writeFile(output, JSON.stringify(report, null, 2)+'\n')
console.log(JSON.stringify({ parts: report.parts, changed: report.changed.length, addedSites: report.changed.reduce((n,c)=>n+c.after-c.before,0), newWarningParts: report.newWarnings.length }))
