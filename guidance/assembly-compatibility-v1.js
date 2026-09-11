export const SMART_ASSEMBLY_COMPATIBILITY_VERSION = 'smart-assembly-compatibility-v1.1.0'

export const SMART_ASSEMBLY_FAMILIES = Object.freeze([
  Object.freeze({
    id:'tire-rim-30.4x14',
    type:'tire-rim',
    tireCodes:Object.freeze(['6578']),
    rimCodes:Object.freeze(['2994']),
    fit:Object.freeze({ beadDiameterMm:20, tireWidthMm:14, rimWidthMm:12, beadProfile:'technic-vr-30.4x14' }),
    evidence:Object.freeze(['curated LDraw/LEGO fit: 6578 tyre ↔ 2994 rim']),
  }),
  Object.freeze({
    id:'tire-rim-43.2x28',
    type:'tire-rim',
    tireCodes:Object.freeze(['6579']),
    rimCodes:Object.freeze(['6580a']),
    fit:Object.freeze({ beadDiameterMm:22, tireWidthMm:26, rimWidthMm:23, beadProfile:'technic-offroad-43.2x28' }),
    evidence:Object.freeze(['curated LDraw/LEGO fit: 6579 tyre ↔ 6580a rim']),
  }),
])

const UNKNOWN = 'unknown'

function normalizeCode(value) {
  return String(value || '')
    .replace(/^ldraw-/i, '')
    .replace(/^parts\//i, '')
    .replace(/\\/g, '/')
    .split('/').pop()
    ?.replace(/\.dat$/i, '')
    .trim()
    .toLowerCase() || ''
}

function codeFor(definition) {
  return normalizeCode(definition?.ldraw?.code || definition?.ldraw?.file || definition?.id)
}

function classificationFor(definition) {
  return definition?.mechanicalIntelligence
    ?? definition?.mechanics?.classification
    ?? null
}

function curatedRoleForCode(code) {
  if (!code) return null
  for (const family of SMART_ASSEMBLY_FAMILIES) {
    if (family.tireCodes.includes(code)) return 'tire'
    if (family.rimCodes.includes(code)) return 'rim'
  }
  return null
}

export function smartAssemblyRole(definition) {
  // A curated family is already verified mechanical compatibility evidence. Do not
  // require the asynchronous Mechanical Intelligence sync to finish before an
  // explicitly registered tire/rim ID can produce a suggestion.
  const curatedRole = curatedRoleForCode(codeFor(definition))
  if (curatedRole) return curatedRole

  const classification = classificationFor(definition)
  if (!classification || classification.confidence === UNKNOWN) return null
  return classification.class === 'tire' || classification.class === 'rim'
    ? classification.class
    : null
}

export function smartAssemblyFamilyFor(definition) {
  const role = smartAssemblyRole(definition)
  if (!role) return null
  const code = codeFor(definition)
  const family = SMART_ASSEMBLY_FAMILIES.find(entry => (
    role === 'tire' ? entry.tireCodes.includes(code) : entry.rimCodes.includes(code)
  ))
  if (family) return family

  const fitFamily = classificationFor(definition)?.properties?.fitFamily
  if (!fitFamily) return null
  return SMART_ASSEMBLY_FAMILIES.find(entry => entry.id === fitFamily) ?? null
}

function targetCodes(family, sourceRole) {
  return sourceRole === 'tire' ? family.rimCodes : family.tireCodes
}

function descriptorFor(family, sourceRole, code, registeredParts) {
  const targetRole = sourceRole === 'tire' ? 'rim' : 'tire'
  const definition = registeredParts.find(part => codeFor(part) === code) ?? null
  return Object.freeze({
    familyId:family.id,
    familyType:family.type,
    sourceRole,
    targetRole,
    targetCode:code,
    targetPartId:definition?.id ?? `ldraw-${code}`,
    targetDefinition:definition,
    score:definition ? 110 : 100,
    confidence:'verified',
    source:'curated-compatibility-registry-v1',
    fit:family.fit,
    evidence:family.evidence,
  })
}

function propertyCompatibility(source, target) {
  const sourceClass = classificationFor(source)
  const targetClass = classificationFor(target)
  const sourceRole = smartAssemblyRole(source)
  const targetRole = smartAssemblyRole(target)
  if (!sourceRole || !targetRole || sourceRole === targetRole) return null

  const a = sourceClass?.properties ?? {}
  const b = targetClass?.properties ?? {}
  if (!a.fitFamily || a.fitFamily !== b.fitFamily) return null
  if (!a.beadProfile || a.beadProfile !== b.beadProfile) return null
  return Object.freeze({
    familyId:a.fitFamily,
    familyType:'tire-rim',
    sourceRole,
    targetRole,
    targetCode:codeFor(target),
    targetPartId:target.id,
    targetDefinition:target,
    score:90,
    confidence:'verified',
    source:'mechanical-metadata-fit-family',
    fit:Object.freeze({ beadProfile:a.beadProfile }),
    evidence:Object.freeze(['matching verified fitFamily + beadProfile']),
  })
}

export function compatibleAssemblyChoices(sourceDefinition, registeredParts = []) {
  const sourceRole = smartAssemblyRole(sourceDefinition)
  if (!sourceRole) return Object.freeze([])

  const family = smartAssemblyFamilyFor(sourceDefinition)
  const choices = family
    ? targetCodes(family, sourceRole).map(code => descriptorFor(family, sourceRole, code, registeredParts))
    : registeredParts.map(target => propertyCompatibility(sourceDefinition, target)).filter(Boolean)

  choices.sort((a, b) => b.score - a.score || a.targetCode.localeCompare(b.targetCode))
  return Object.freeze(choices)
}

export function bestAssemblyChoice(sourceDefinition, registeredParts = []) {
  return compatibleAssemblyChoices(sourceDefinition, registeredParts)[0] ?? null
}

function axisDistance(a, b) {
  if (!a || !b) return Infinity
  const dx = Number(a.x ?? a[0] ?? 0) - Number(b.x ?? b[0] ?? 0)
  const dy = Number(a.y ?? a[1] ?? 0) - Number(b.y ?? b[1] ?? 0)
  const dz = Number(a.z ?? a[2] ?? 0) - Number(b.z ?? b[2] ?? 0)
  return Math.hypot(dx, dy, dz)
}

function rotationDistance(a, b) {
  if (!a || !b) return Infinity
  const wrap = value => {
    let next = Math.abs(value) % (Math.PI * 2)
    if (next > Math.PI) next = Math.PI * 2 - next
    return next
  }
  return Math.max(
    wrap(Number(a.x ?? a[0] ?? 0) - Number(b.x ?? b[0] ?? 0)),
    wrap(Number(a.y ?? a[1] ?? 0) - Number(b.y ?? b[1] ?? 0)),
    wrap(Number(a.z ?? a[2] ?? 0) - Number(b.z ?? b[2] ?? 0)),
  )
}

export function isCompatibleAssemblyPresent(sourceObject, sourceDefinition, sceneObjects = [], partLookup = () => null, {
  positionTolerance = .36,
  rotationTolerance = .12,
} = {}) {
  const allowed = new Set(compatibleAssemblyChoices(sourceDefinition, sceneObjects.map(object => partLookup(object?.userData?.partId)).filter(Boolean)).map(choice => choice.targetPartId))
  if (!allowed.size) return false

  for (const object of sceneObjects) {
    if (!object || object === sourceObject || !allowed.has(object?.userData?.partId)) continue
    if (axisDistance(sourceObject.position, object.position) > positionTolerance) continue
    if (rotationDistance(sourceObject.rotation, object.rotation) > rotationTolerance) continue
    return true
  }
  return false
}

export function smartAssemblyDismissalKey(sourceObject, choice) {
  const instanceId = sourceObject?.userData?.instanceId || 'unknown-instance'
  return `${instanceId}::${choice?.familyId || 'unknown-family'}::${choice?.targetRole || 'unknown-role'}`
}

function rotateLocalOffset(offset, rotation) {
  let [x, y, z] = offset
  const rx = Number(rotation?.x ?? rotation?.[0] ?? 0)
  const ry = Number(rotation?.y ?? rotation?.[1] ?? 0)
  const rz = Number(rotation?.z ?? rotation?.[2] ?? 0)

  const cx = Math.cos(rx), sx = Math.sin(rx)
  ;[y, z] = [y * cx - z * sx, y * sx + z * cx]
  const cy = Math.cos(ry), sy = Math.sin(ry)
  ;[x, z] = [x * cy + z * sy, -x * sy + z * cy]
  const cz = Math.cos(rz), sz = Math.sin(rz)
  ;[x, y] = [x * cz - y * sz, x * sz + y * cz]
  return [x, y, z]
}

export function centeredAssemblyPosition(sourceObject, sourceSize = null, targetSize = null) {
  const base = sourceObject?.position?.toArray?.() ?? [sourceObject?.position?.x ?? 0, sourceObject?.position?.y ?? 0, sourceObject?.position?.z ?? 0]
  const sourceHeight = Number(sourceSize?.[1])
  const targetHeight = Number(targetSize?.[1])
  if (!Number.isFinite(sourceHeight) || !Number.isFinite(targetHeight)) return Object.freeze([...base])

  // LDraw runtime-v3 normalizes every visual to local minY=0. Matching root positions
  // would therefore align bottoms instead of wheel centres. Offset the smaller/larger
  // counterpart along the source's local Y axis so their normalized visual centres meet.
  const delta = (sourceHeight - targetHeight) / 2
  const worldOffset = rotateLocalOffset([0, delta, 0], sourceObject?.rotation)
  return Object.freeze(base.map((value, index) => Number(value || 0) + worldOffset[index]))
}

export function smartAssemblyPlacement(sourceObject, choice, groupId, { sourceSize = null, targetSize = null } = {}) {
  if (!sourceObject || !choice) return null
  const position = centeredAssemblyPosition(sourceObject, sourceSize, targetSize)
  const rotation = [sourceObject.rotation?.x ?? 0, sourceObject.rotation?.y ?? 0, sourceObject.rotation?.z ?? 0]
  return Object.freeze({
    partId:choice.targetPartId,
    position,
    rotation:Object.freeze(rotation),
    groupId:groupId ?? sourceObject?.userData?.groupId ?? null,
  })
}
