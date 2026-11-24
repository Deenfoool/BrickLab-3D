// Static design preview only. No network, password handling, real identity or ACLs.
// Explicitly saved snapshots are held in memory, never in the user's project storage.
export function createAccountState() {
  const projects = new Map()
  let profile = null
  let bytes = 0
  return {
    get profile() { return profile },
    signIn(name = 'Demo Builder') {
      profile = { displayName: name, email: 'builder@example.invalid' }
    },
    signOut() { profile = null; projects.clear(); bytes = 0 },
    list() { return [...projects.values()] },
    get(id) { return projects.get(id) },
    save(record) {
      if (!profile) return 'signed_out'
      const existing = projects.get(record.id)
      if (existing?.role === 'viewer') return 'forbidden'
      const serialized = JSON.stringify(record.document)
      if (existing?.revisions.at(-1)?.serialized === serialized) return 'unchanged'
      const size = new TextEncoder().encode(serialized).length
      if (bytes + size > 16 * 1024 * 1024 || (existing?.revisions.length ?? 0) >= 20 || (!existing && projects.size >= 30)) return 'limit'
      const project = existing ?? { id: record.id, visibility: 'private', role: 'owner', revisions: [] }
      project.revisions.push({ revision: project.revisions.length + 1, savedAt: new Date().toISOString(), serialized })
      projects.set(record.id, project)
      bytes += size
      return 'saved'
    },
    setVisibility(id, value) {
      const project = projects.get(id)
      if (!profile || project?.role !== 'owner' || !['private','unlisted','public'].includes(value)) return false
      project.visibility = value
      return true
    },
    simulateRole(id, role) {
      const project = projects.get(id)
      if (!profile || !project || !['owner','editor','viewer'].includes(role)) return false
      project.role = role
      return true
    },
    document(id, revision) {
      if (!profile) return null
      const item = projects.get(id)?.revisions.find(r => r.revision === revision)
      return item ? JSON.parse(item.serialized) : null
    },
  }
}
