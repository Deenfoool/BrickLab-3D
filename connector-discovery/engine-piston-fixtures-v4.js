export const ENGINE_PISTON_FIXTURES_VERSION_V4='engine-piston-fixtures-v4.2.1'
export const ENGINE_PISTON_FIXTURE_GROUP_V4='technic-engine-crank-4368-piston-4369'
export const ENGINE_CRANK_RIM_OFFSET_LDU_V4=4
export const ENGINE_CRANK_RIM_RADIUS_LDU_V4=15
export const ENGINE_CRANK_RIM_CENTER_LDU_V4=Object.freeze([0,-ENGINE_CRANK_RIM_OFFSET_LDU_V4,0])
export const ENGINE_PISTON_TAIL_X_LDU_V4=-46.5

const PROFILE=Object.freeze([Object.freeze({shape:'R',radiusLdu:4,lengthLdu:4,elastic:false})])
const DISK_ORIENTATION=Object.freeze([1,0,0, 0,0,1, 0,-1,0])
const PISTON_ORIENTATION=Object.freeze([1,0,0, 0,0,-1, 0,1,0])
const normalize=value=>String(value||'').replace(/\\/g,'/').replace(/^parts\//i,'').split('/').pop()?.toLowerCase()||''

// 4368's documented outer rim is one continuous eccentric circle, not four sockets.
// The four HELP placements used by the previous implementation are merely cardinal
// samples of this circle: centre Y=-4 LDU, radius=15 LDU. Connector V4 therefore
// exposes one persistent endpoint whose `path` metadata describes the full track.
// Placement/validity project 4369 onto the nearest point on this curve continuously.
function crankTrack(file){
  return{
    schemaVersion:4,
    family:'cylinder',
    gender:'male',
    group:ENGINE_PISTON_FIXTURE_GROUP_V4,
    frame:{positionLdu:[...ENGINE_CRANK_RIM_CENTER_LDU_V4],orientation:[...DISK_ORIENTATION]},
    geometry:{sections:PROFILE.map(section=>({...section})),caps:'none',centered:true},
    snap:{slide:false},
    path:{kind:'circle',continuous:true,radiusLdu:ENGINE_CRANK_RIM_RADIUS_LDU_V4,normal:'connector-axis'},
    inheritance:{scale:'none',mirror:'cor'},
    source:{kind:'bricklab-verified-assembly-fixture',file,primitive:null,meta:'TECHNIC_ENGINE_4368_4369_CONTINUOUS_RIM',raw:''},
    provenance:[{type:'verified-ldraw-help-fixture',pair:'4368+4369',role:'continuous-rim',samples:'cardinal-help-placements'}],
    discovery:{version:ENGINE_PISTON_FIXTURES_VERSION_V4,role:'technic-engine-crank-rim-track',confidence:'verified-ldraw-help-continuous-circle'},
  }
}

function pistonFollower(file){
  return{
    schemaVersion:4,
    family:'cylinder',
    gender:'female',
    group:ENGINE_PISTON_FIXTURE_GROUP_V4,
    frame:{positionLdu:[ENGINE_PISTON_TAIL_X_LDU_V4,0,0],orientation:[...PISTON_ORIENTATION]},
    geometry:{sections:PROFILE.map(section=>({...section})),caps:'none',centered:true},
    snap:{slide:false},
    inheritance:{scale:'none',mirror:'cor'},
    source:{kind:'bricklab-verified-assembly-fixture',file,primitive:null,meta:'TECHNIC_ENGINE_4368_4369_FOLLOWER',raw:''},
    provenance:[{type:'verified-ldraw-help-fixture',pair:'4368+4369',role:'follower'}],
    discovery:{version:ENGINE_PISTON_FIXTURES_VERSION_V4,role:'technic-engine-piston-follower',confidence:'verified-ldraw-help-layout'},
  }
}

export function discoverEnginePistonFixturesV4(file){
  const name=normalize(file)
  if(name==='4368.dat'){
    const connectors=[crankTrack(name)]
    return{
      version:ENGINE_PISTON_FIXTURES_VERSION_V4,
      file:name,
      connectors,
      stats:{crankRimTracks:1,crankRimSites:0,pistonFollowers:0,connectors:1},
    }
  }
  if(name==='4369.dat'){
    const connectors=[pistonFollower(name)]
    return{
      version:ENGINE_PISTON_FIXTURES_VERSION_V4,
      file:name,
      connectors,
      stats:{crankRimTracks:0,crankRimSites:0,pistonFollowers:1,connectors:1},
    }
  }
  return{
    version:ENGINE_PISTON_FIXTURES_VERSION_V4,
    file:name,
    connectors:[],
    stats:{crankRimTracks:0,crankRimSites:0,pistonFollowers:0,connectors:0},
  }
}
