export const SPATIAL_INDEX_VERSION = 'spatial-index-v1.0.0'

function vector3(value) {
  if (Array.isArray(value)) return { x:Number(value[0]) || 0, y:Number(value[1]) || 0, z:Number(value[2]) || 0 }
  return { x:Number(value?.x) || 0, y:Number(value?.y) || 0, z:Number(value?.z) || 0 }
}

function distanceSq(a, b) {
  const dx=a.x-b.x, dy=a.y-b.y, dz=a.z-b.z
  return dx*dx+dy*dy+dz*dz
}

export class SpatialHash3D {
  constructor({ cellSize=4 }={}) {
    this.cellSize=Math.max(1e-4,Number(cellSize)||4)
    this.cells=new Map()
    this.entries=new Map()
  }

  _coord(value) { return Math.floor(value/this.cellSize) }
  _key(x,y,z) { return `${x}:${y}:${z}` }

  _cellKeys(center, radius=0) {
    const c=vector3(center)
    const r=Math.max(0,Number(radius)||0)
    const minX=this._coord(c.x-r), maxX=this._coord(c.x+r)
    const minY=this._coord(c.y-r), maxY=this._coord(c.y+r)
    const minZ=this._coord(c.z-r), maxZ=this._coord(c.z+r)
    const keys=[]
    for(let x=minX;x<=maxX;x+=1)for(let y=minY;y<=maxY;y+=1)for(let z=minZ;z<=maxZ;z+=1)keys.push(this._key(x,y,z))
    return keys
  }

  upsert(id, value, center, radius=0, metadata=null) {
    if (id == null) throw new TypeError('SpatialHash3D entry id is required')
    const key=String(id)
    this.remove(key)
    const position=vector3(center)
    const safeRadius=Math.max(0,Number(radius)||0)
    const cells=this._cellKeys(position,safeRadius)
    const entry={ id:key, value, center:position, radius:safeRadius, metadata, cells }
    this.entries.set(key,entry)
    for(const cellKey of cells){
      let bucket=this.cells.get(cellKey)
      if(!bucket){bucket=new Set();this.cells.set(cellKey,bucket)}
      bucket.add(key)
    }
    return entry
  }

  remove(id) {
    const key=String(id)
    const entry=this.entries.get(key)
    if(!entry)return false
    for(const cellKey of entry.cells){
      const bucket=this.cells.get(cellKey)
      if(!bucket)continue
      bucket.delete(key)
      if(!bucket.size)this.cells.delete(cellKey)
    }
    this.entries.delete(key)
    return true
  }

  clear() {
    this.cells.clear()
    this.entries.clear()
  }

  get(id) { return this.entries.get(String(id)) ?? null }

  querySphere(center, radius=0, { predicate=null }={}) {
    const position=vector3(center)
    const queryRadius=Math.max(0,Number(radius)||0)
    const candidateIds=new Set()
    const keys=this._cellKeys(position,queryRadius)
    for(const cellKey of keys){
      const bucket=this.cells.get(cellKey)
      if(bucket)for(const id of bucket)candidateIds.add(id)
    }
    const entries=[]
    let examined=0
    for(const id of candidateIds){
      const entry=this.entries.get(id)
      if(!entry)continue
      examined+=1
      const reach=queryRadius+entry.radius
      if(distanceSq(position,entry.center)>reach*reach)continue
      if(predicate && !predicate(entry.value,entry))continue
      entries.push(entry)
    }
    return { entries, values:entries.map(entry=>entry.value), examined, buckets:keys.length }
  }

  stats() {
    return Object.freeze({
      version:SPATIAL_INDEX_VERSION,
      cellSize:this.cellSize,
      entries:this.entries.size,
      cells:this.cells.size,
    })
  }
}
