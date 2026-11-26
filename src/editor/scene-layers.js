export function readSceneLayers(value, ids) {
  const groups = []
  const grouped = new Set()
  const groupIds = new Set()
  for (const group of Array.isArray(value?.groups) ? value.groups : []) {
    if (typeof group?.id !== 'string' || !group.id || groupIds.has(group.id) ||
        typeof group.name !== 'string' || !group.name.trim()) continue
    const partIds = []
    for (const id of Array.isArray(group.partIds) ? group.partIds : []) {
      if (!ids.has(id) || grouped.has(id)) continue
      grouped.add(id)
      partIds.push(id)
    }
    groupIds.add(group.id)
    groups.push({ id: group.id, name: group.name.trim().slice(0, 80), partIds, hidden: group.hidden === true })
  }
  const hiddenPartIds = [...new Set(Array.isArray(value?.hiddenPartIds) ? value.hiddenPartIds : [])]
    .filter(id => ids.has(id))
  const lockedPartIds=[...new Set(Array.isArray(value?.lockedPartIds)?value.lockedPartIds:[])].filter(id=>ids.has(id))
  return { groups, hiddenPartIds, ...(lockedPartIds.length?{lockedPartIds}:{}) }
}

export function hiddenSceneParts(layers, parts, isolation) {
  if (isolation) return new Set(parts.filter(part => !isolation.has(part.id)).map(part => part.id))
  const hidden = new Set(layers.hiddenPartIds)
  for (const group of layers.groups) {
    if (group.hidden) for (const id of group.partIds) hidden.add(id)
  }
  return hidden
}

export function moveToSceneGroup(groups, ids, destination) {
  return groups.map(group => {
    const remaining = group.partIds.filter(id => !ids.has(id))
    return {
      ...group,
      partIds: group.id === destination ? [...remaining, ...ids] : remaining,
    }
  })
}
