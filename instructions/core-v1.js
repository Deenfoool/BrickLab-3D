export const INSTRUCTION_ENGINE_VERSION = 'instructions-v1.0.0'

const clone = value => value == null ? value : JSON.parse(JSON.stringify(value))
const finite = value => Number.isFinite(Number(value)) ? Number(value) : 0
const text = value => String(value ?? '').trim()
const stable = value => text(value).localeCompare(text(value), 'en')

function endpointId(endpoint) {
  return endpoint?.endpointId ?? endpoint?.connectorId ?? null
}

function normalizeConnection(connection) {
  if (!connection?.a?.instanceId || !connection?.b?.instanceId) return null
  return {
    ...clone(connection),
    a:{...clone(connection.a), endpointId:endpointId(connection.a)},
    b:{...clone(connection.b), endpointId:endpointId(connection.b)},
  }
}

export function normalizeInstructionProject(project = {}) {
  const parts = (Array.isArray(project.parts) ? project.parts : [])
    .filter(part => part?.instanceId && part?.partId)
    .map(part => ({
      ...clone(part),
      position:Array.isArray(part.position) ? part.position.map(finite).slice(0,3) : [0,0,0],
      rotation:Array.isArray(part.rotation) ? part.rotation.map(finite).slice(0,3) : [0,0,0],
      color:Number.isFinite(Number(part.color)) ? Number(part.color) : null,
    }))
  const source = Array.isArray(project.connectionsV4) && project.connectionsV4.length
    ? project.connectionsV4
    : (Array.isArray(project.connections) ? project.connections : [])
  const ids = new Set(parts.map(part => part.instanceId))
  const connections = source.map(normalizeConnection).filter(connection => connection && ids.has(connection.a.instanceId) && ids.has(connection.b.instanceId))
  return {
    version:Number(project.version) || 2,
    name:text(project.name) || 'Untitled Build',
    parts,
    connections,
  }
}

function mechanicalCategory(definition) {
  const mechanics = definition?.mechanics
  if (!mechanics || typeof mechanics !== 'object') return null
  const order = ['motor','differential','gearbox','wheel','tire','rim','gear','rack','shaft','bush','shock','steering','suspension']
  return order.find(key => mechanics[key]) ?? Object.keys(mechanics)[0] ?? null
}

export function describePart(part, definition = null) {
  const id = part?.partId ?? definition?.id ?? 'unknown'
  const ldraw = definition?.ldraw
  return {
    instanceId:part?.instanceId ?? null,
    partId:id,
    designId:ldraw?.code ? String(ldraw.code) : id,
    source:ldraw?.code ? 'LDraw' : 'BrickLab',
    name:definition?.name || ldraw?.description || id,
    category:definition?.category || null,
    mechanicalCategory:mechanicalCategory(definition),
    color:Number.isFinite(Number(part?.color)) ? Number(part.color) : (Number.isFinite(Number(definition?.defaultColor)) ? Number(definition.defaultColor) : null),
  }
}

export function buildBom(project, definitionFor = () => null) {
  const normalized = normalizeInstructionProject(project)
  const groups = new Map()
  for (const part of normalized.parts) {
    const descriptor = describePart(part, definitionFor(part.partId))
    const key = `${descriptor.designId}::${descriptor.color ?? 'none'}`
    const row = groups.get(key) ?? {...descriptor, quantity:0, instanceIds:[]}
    row.quantity += 1
    row.instanceIds.push(part.instanceId)
    groups.set(key,row)
  }
  return [...groups.values()].sort((a,b) =>
    String(a.designId).localeCompare(String(b.designId), 'en', {numeric:true}) ||
    String(a.color ?? '').localeCompare(String(b.color ?? ''))
  )
}

export function bomToCsv(rows) {
  const quote = value => `"${String(value ?? '').replaceAll('"','""')}"`
  return [
    ['designId','partId','name','source','category','mechanicalCategory','color','quantity'].map(quote).join(','),
    ...(rows ?? []).map(row => [row.designId,row.partId,row.name,row.source,row.category,row.mechanicalCategory,row.color == null ? '' : `#${Number(row.color).toString(16).padStart(6,'0')}`,row.quantity].map(quote).join(',')),
  ].join('\r\n')
}

function graphFor(project) {
  const adjacency = new Map(project.parts.map(part => [part.instanceId, []]))
  for (const connection of project.connections) {
    adjacency.get(connection.a.instanceId)?.push({connection, other:connection.b.instanceId, side:'a'})
    adjacency.get(connection.b.instanceId)?.push({connection, other:connection.a.instanceId, side:'b'})
  }
  return adjacency
}

function rotateEuler(vector, rotation = [0,0,0]) {
  let [x,y,z] = vector
  const [rx,ry,rz] = rotation
  let c=Math.cos(rx),s=Math.sin(rx); [y,z]=[y*c-z*s,y*s+z*c]
  c=Math.cos(ry);s=Math.sin(ry); [x,z]=[x*c+z*s,-x*s+z*c]
  c=Math.cos(rz);s=Math.sin(rz); [x,y]=[x*c-y*s,x*s+y*c]
  const length=Math.hypot(x,y,z) || 1
  return [x/length,y/length,z/length]
}

function connectorAxis(definition, id) {
  if (!definition || !id) return null
  const v4 = definition.connectivityV4?.connectors?.find(connector => connector.endpointId === id)
  if (Array.isArray(v4?.frame?.axis) && v4.frame.axis.length === 3) return v4.frame.axis.map(finite)
  const legacy = definition.connectors?.find(connector => connector.id === id)
  return Array.isArray(legacy?.axis) && legacy.axis.length === 3 ? legacy.axis.map(finite) : null
}

function insertionFor(part, connections, assembled, definitionFor) {
  const attached = connections
    .filter(item => assembled.has(item.other))
    .sort((a,b) => String(a.connection.id ?? '').localeCompare(String(b.connection.id ?? '')))
  for (const item of attached) {
    const endpoint = item.connection[item.side]
    const axis = connectorAxis(definitionFor(part.partId), endpoint.endpointId)
    if (axis) return {vector:rotateEuler(axis,part.rotation), confidence:'verified', source:`connector:${endpoint.endpointId}`}
  }
  if (attached.length) {
    const target = attached[0].other
    return {vector:[0,1,0],confidence:'inferred',source:`connection:${target}`}
  }
  return {vector:[0,1,0],confidence:'unknown',source:'no-connection-axis'}
}

function partRole(part, definition, degree) {
  const descriptor = describePart(part, definition)
  const id = descriptor.partId.toLowerCase()
  const name = descriptor.name.toLowerCase()
  const mech = descriptor.mechanicalCategory
  const internal = ['shaft','gear','rack','differential','gearbox','bush'].includes(mech) || /axle|gear|rack|bush|differential/.test(`${id} ${name}`)
  const structural = /brick|beam|liftarm|frame|plate|chassis/.test(`${id} ${name}`) || ['Bricks','Beams'].includes(descriptor.category)
  const finishing = ['wheel','tire','rim','shock','steering','suspension'].includes(mech)
  return {internal,structural,finishing,degree}
}

function candidateScore(part, adjacency, assembled, definitionFor) {
  const links = adjacency.get(part.instanceId) ?? []
  const role = partRole(part,definitionFor(part.partId),links.length)
  const attached = links.filter(link => assembled.has(link.other)).length
  const y = finite(part.position?.[1])
  let score = attached * 120 + role.degree * 12 - y * 2
  if (!assembled.size && role.structural) score += 90
  if (assembled.size && role.internal) score += 58
  if (role.finishing) score -= 35
  if (role.structural) score += 20
  return score
}

function connectedComponents(parts, adjacency) {
  const byId = new Map(parts.map(part => [part.instanceId,part]))
  const unseen = new Set(byId.keys()), components=[]
  while (unseen.size) {
    const seed=[...unseen].sort()[0], queue=[seed], ids=[]; unseen.delete(seed)
    while(queue.length){const id=queue.shift();ids.push(id);for(const link of adjacency.get(id)??[]){if(unseen.delete(link.other))queue.push(link.other)}}
    components.push(ids.map(id=>byId.get(id)).filter(Boolean))
  }
  components.sort((a,b)=>b.length-a.length || String(a[0]?.instanceId).localeCompare(String(b[0]?.instanceId)))
  return components
}

function pairable(a,b,adjacency,assembled) {
  if (!a || !b || a.partId!==b.partId || Number(a.color)!==Number(b.color)) return false
  const la=(adjacency.get(a.instanceId)??[]).filter(link=>assembled.has(link.other)).map(link=>link.other).sort()
  const lb=(adjacency.get(b.instanceId)??[]).filter(link=>assembled.has(link.other)).map(link=>link.other).sort()
  if (!la.length || !lb.length || la.length!==lb.length) return false
  const pa=a.position??[0,0,0],pb=b.position??[0,0,0]
  return Math.abs(finite(pa[1])-finite(pb[1]))<.15 && Math.abs(Math.abs(finite(pa[0]))-Math.abs(finite(pb[0])))<.35
}

export function buildInstructionPlan(project, definitionFor = () => null) {
  const normalized = normalizeInstructionProject(project)
  const adjacency = graphFor(normalized)
  const components = connectedComponents(normalized.parts,adjacency)
  const assembled = new Set(), steps=[], warnings=[]
  let phase=0

  for (const component of components) {
    phase += 1
    const remaining = new Map(component.map(part=>[part.instanceId,part]))
    if (phase>1) warnings.push({code:'disconnected-subassembly',instanceIds:[...remaining.keys()],message:'Independent connected component is emitted as a separate subassembly.'})
    while(remaining.size){
      const candidates=[...remaining.values()].sort((a,b)=>{
        const diff=candidateScore(b,adjacency,assembled,definitionFor)-candidateScore(a,adjacency,assembled,definitionFor)
        return diff || String(a.instanceId).localeCompare(String(b.instanceId))
      })
      const first=candidates[0]
      const grouped=[first]
      const second=candidates.slice(1).find(part=>pairable(first,part,adjacency,assembled))
      if(second)grouped.push(second)
      const stepConnections=[]
      for(const part of grouped){
        for(const link of adjacency.get(part.instanceId)??[]){
          if(assembled.has(link.other)||grouped.some(other=>other.instanceId===link.other)){
            if(!stepConnections.some(connection=>connection.id===link.connection.id))stepConnections.push(link.connection)
          }
        }
      }
      const insertions=grouped.map(part=>insertionFor(part,adjacency.get(part.instanceId)??[],assembled,definitionFor))
      const confidence=insertions.every(item=>item.confidence==='verified')?'verified':insertions.some(item=>item.confidence==='unknown')?'uncertain':'inferred'
      if(confidence==='uncertain' && assembled.size) warnings.push({code:'insertion-direction-uncertain',step:steps.length+1,instanceIds:grouped.map(p=>p.instanceId),message:'Insertion direction could not be proven from connector metadata.'})
      const callouts=new Map()
      for(const part of grouped){const descriptor=describePart(part,definitionFor(part.partId)),key=`${descriptor.designId}:${descriptor.color}`;const row=callouts.get(key)??{...descriptor,quantity:0};row.quantity++;callouts.set(key,row)}
      steps.push({
        index:steps.length+1,
        phase,
        subassembly:phase>1,
        instanceIds:grouped.map(part=>part.instanceId),
        parts:grouped.map(clone),
        callouts:[...callouts.values()],
        connectionIds:stepConnections.map(connection=>connection.id).filter(Boolean).sort(),
        insertion:insertions[0],
        insertions,
        confidence,
        paired:grouped.length>1,
        assembledCount:assembled.size+grouped.length,
      })
      for(const part of grouped){assembled.add(part.instanceId);remaining.delete(part.instanceId)}
    }
  }

  if (!normalized.parts.length) warnings.push({code:'empty-project',message:'Project contains no parts.'})
  if (normalized.parts.length>1 && !normalized.connections.length) warnings.push({code:'no-connection-graph',message:'No connection graph is available; order is positional/structural only.'})
  return {
    version:INSTRUCTION_ENGINE_VERSION,
    projectName:normalized.name,
    partCount:normalized.parts.length,
    connectionCount:normalized.connections.length,
    componentCount:components.length,
    steps,
    warnings,
  }
}

export function instructionManifest(project, definitionFor = () => null) {
  const normalized=normalizeInstructionProject(project)
  return {
    version:INSTRUCTION_ENGINE_VERSION,
    project:{name:normalized.name,partCount:normalized.parts.length,connectionCount:normalized.connections.length},
    bom:buildBom(normalized,definitionFor),
    plan:buildInstructionPlan(normalized,definitionFor),
  }
}
