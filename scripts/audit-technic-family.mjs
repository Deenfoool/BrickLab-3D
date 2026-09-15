import { readFile, readdir, writeFile } from 'node:fs/promises'
import { createShadowResolverV4 } from '../connectors-v4/shadow-resolver-v4.js'
import { finalizeConnectorIdentitiesV4 } from '../connectors-v4/identity-v4.js'
import { classifyTechnicPinInterfaceV4 } from '../connectors-v4/pin-semantics-v4.js'
import { classifyPart } from '../ldraw/library-model-v1.js'
import { classifyLDrawDefinition } from '../ldraw/mechanical-intelligence-v1.js'

const [geometryRoot, shadowRoot, output] = process.argv.slice(2)
if (!geometryRoot || !shadowRoot || !output) {
  throw new Error('Usage: node scripts/audit-technic-family.mjs <ldraw-root> <shadow-root> <report.json>')
}

const read = base => async path => {
  try { return await readFile(`${base}/${path}`, 'utf8') }
  catch (error) { if (error.code === 'ENOENT') return null; throw error }
}

function headerMetadata(file, text) {
  const lines = String(text || '').split(/\r?\n/)
  const description = lines.find(line => /^0\s+(?![!A-Z_]+\s*:)/.test(line))?.replace(/^0\s+/, '').trim() || file
  const category = lines.find(line => /^0\s+!CATEGORY\s+/i.test(line))?.replace(/^0\s+!CATEGORY\s+/i, '').trim() || ''
  const keywords = lines.filter(line => /^0\s+!KEYWORDS\s+/i.test(line)).map(line => line.replace(/^0\s+!KEYWORDS\s+/i, '').trim()).join(' ')
  const code = file.replace(/\.dat$/i, '')
  return { file:`parts/${file}`, code, id:`ldraw-${code.toLowerCase()}`, name:description, description, category, keywords }
}

function rigidShape(section) {
  return section?.shape === '_L' || section?.shape === 'L_' ? 'R' : section?.shape
}

function connectorRole(connector) {
  const pin = classifyTechnicPinInterfaceV4(connector)
  if (pin?.role) return pin.role

  if (connector?.family === 'cylinder') {
    const shapes = new Set((connector.geometry?.sections || []).map(rigidShape))
    if (connector.gender === 'male' && shapes.has('A')) return 'technic-axle'
    if (connector.gender === 'female' && shapes.has('A')) return 'technic-axle-hole'
    if (connector.gender === 'female' && shapes.has('R')) return 'technic-round-hole'
    if (connector.gender === 'male' && shapes.has('R')) return 'round-male-unknown'
    return `cylinder-${connector.gender || 'unknown'}-${[...shapes].sort().join('') || 'unknown'}`
  }

  if (connector?.family === 'sphere') {
    return connector.gender === 'male' ? 'sphere-male' : connector.gender === 'female' ? 'sphere-female' : 'sphere-unknown'
  }

  if (connector?.family === 'fingers') return 'hinge-fingers'
  if (connector?.family === 'clip') return 'clip'

  if (connector?.family === 'generic') {
    const group = String(connector.group || '').trim()
    return group ? `generic:${group}` : `generic:${connector.gender || 'unknown'}:${connector.geometry?.bounding?.kind || 'point'}`
  }

  return connector?.family ? `unknown:${connector.family}` : 'unknown'
}

function bump(object, key, amount = 1) {
  object[key] = (object[key] || 0) + amount
}

const resolver = createShadowResolverV4({
  fetchOfficialText:read(geometryRoot),
  fetchShadowText:read(shadowRoot),
})

const files = (await readdir(`${geometryRoot}/parts`)).filter(value => value.toLowerCase().endsWith('.dat')).sort()
const report = {
  generatedAt:new Date().toISOString(),
  scope:'BrickLab library family=technic; top-level official LDraw parts only',
  note:'Family membership is presentation classification only. Connector/mechanical evidence comes from resolved LDraw/LDCad data.',
  totals:{ officialTopLevel:files.length, technicFamily:0, withConnectors:0, withoutConnectors:0, warningParts:0 },
  categories:{},
  endpointRoles:{},
  connectorFamilies:{},
  genericGroups:{},
  mechanicalClasses:{},
  confidence:{},
  parts:[],
}

for (const [index, file] of files.entries()) {
  const text = await readFile(`${geometryRoot}/parts/${file}`, 'utf8')
  const item = headerMetadata(file, text)
  const presentation = classifyPart(item)
  if (presentation.family !== 'technic') continue

  report.totals.technicFamily += 1
  bump(report.categories, presentation.category)

  const resolved = await resolver.resolve(file)
  const finalized = finalizeConnectorIdentitiesV4(file, resolved.connectors || [])
  const connectors = finalized.connectors || []
  if (connectors.length) report.totals.withConnectors += 1
  else report.totals.withoutConnectors += 1
  if (resolved.warnings?.length) report.totals.warningParts += 1

  const roles = {}
  const families = {}
  const groups = {}
  for (const connector of connectors) {
    const role = connectorRole(connector)
    bump(roles, role)
    bump(report.endpointRoles, role)
    bump(families, connector.family || 'unknown')
    bump(report.connectorFamilies, connector.family || 'unknown')
    if (connector.family === 'generic') {
      const group = String(connector.group || '').trim() || '<ungrouped>'
      bump(groups, group)
      bump(report.genericGroups, group)
    }
  }

  const mechanical = classifyLDrawDefinition({
    id:item.id,
    name:item.name,
    description:`${item.description} ${item.keywords}`.trim(),
    category:item.category,
    ldraw:{ code:item.code, file:item.file },
  })
  bump(report.mechanicalClasses, mechanical.class)
  bump(report.confidence, mechanical.confidence)

  report.parts.push({
    file,
    code:item.code,
    description:item.description,
    sourceCategory:item.category,
    libraryCategory:presentation.category,
    connectors:connectors.length,
    roles,
    families,
    genericGroups:groups,
    mechanicalClass:mechanical.class,
    mechanicalConfidence:mechanical.confidence,
    warnings:resolved.warnings || [],
  })

  // Bound resolver cache independently of library size.
  if ((index + 1) % 400 === 0) resolver.clearCache?.()
}

report.parts.sort((a, b) => a.code.localeCompare(b.code, 'en', { numeric:true }))
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify({
  technicFamily:report.totals.technicFamily,
  withConnectors:report.totals.withConnectors,
  withoutConnectors:report.totals.withoutConnectors,
  warningParts:report.totals.warningParts,
  endpointRoles:report.endpointRoles,
  genericGroups:Object.keys(report.genericGroups).length,
  mechanicalClasses:report.mechanicalClasses,
}))
