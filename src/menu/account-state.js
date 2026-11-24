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
    list() { return [...projects.values()].filter(p => !p.trashed) },
    trash() { return [...projects.values()].filter(p => p.trashed) },
    usage() { return {bytes, projects:projects.size, revisions:[...projects.values()].reduce((sum,p)=>sum+p.revisions.length,0)} },
    moveToTrash(id) { const p=projects.get(id);if(!profile||p?.role!=='owner'||p.trashed)return false;p.trashed=true;return true },
    restore(id) {const p=projects.get(id);if(!profile||!p?.trashed||p.role!=='owner')return false;p.trashed=false;return true},
    member(id,name,role){const p=projects.get(id);if(!profile||p?.role!=='owner'||p.trashed||!name||name.length>60||![null,'editor','viewer'].includes(role))return false;p.members??=[];const i=p.members.findIndex(m=>m.name===name);if(role===null){if(i>=0)p.members.splice(i,1)}else if(i>=0)p.members[i].role=role;else if(p.members.length<20)p.members.push({name,role});else return false;return true},
    get(id) { return projects.get(id) },
    save(record) {
      if (!profile) return 'signed_out'
      const existing = projects.get(record.id)
      if (existing?.role === 'viewer' || existing?.trashed) return 'forbidden'
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
      if (!profile || project?.role !== 'owner' || project.trashed || !['private','unlisted','public'].includes(value)) return false
      project.visibility = value
      return true
    },
    simulateRole(id, role) {
      const project = projects.get(id)
      if (!profile || !project || project.trashed || !['owner','editor','viewer'].includes(role)) return false
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
