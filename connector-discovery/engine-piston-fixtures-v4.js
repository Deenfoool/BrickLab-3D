export const ENGINE_PISTON_FIXTURES_VERSION_V4='engine-piston-fixtures-v4.1.0'
export const ENGINE_PISTON_FIXTURE_GROUP_V4='technic-engine-crank-4368-piston-4369'
export const ENGINE_CRANK_RIM_OFFSET_LDU_V4=4
export const ENGINE_PISTON_TAIL_X_LDU_V4=-46.5

const PROFILE=Object.freeze([Object.freeze({shape:'R',radiusLdu:4,lengthLdu:4,elastic:false})])
const DISK_ORIENTATION=Object.freeze([1,0,0, 0,0,1, 0,-1,0])
const PISTON_ORIENTATION=Object.freeze([1,0,0, 0,0,-1, 0,1,0])
const normalize=value=>String(value||'').replace(/\\/g,'/').replace(/^parts\//i,'').split('/').pop()?.toLowerCase()||''

// LDraw 4368.dat documents four verified 4369 placements around the crank disk:
//   left  (-61, 0), top (0, 57.5), right (61, 0), bottom (0, -65.5).
// The 4369 tail reaches X=-46.5 LDU. Subtracting that tail location from the
// documented placements gives the actual retained rim-contact sites below.
// Their vertical midpoint is Y=-4 LDU, matching 4368.dat's documented
// "Outer rim offset: 4 LDU" and therefore the crank eccentricity.
const CRANK_RIM_SITES=Object.freeze([
  Object.freeze({id:'left',positionLdu:Object.freeze([-14.5,0,0])}),
  Object.freeze({id:'top',positionLdu:Object.freeze([0,11,0])}),
  Object.freeze({id:'right',positionLdu:Object.freeze([14.5,0,0])}),
  Object.freeze({id:'bottom',positionLdu:Object.freeze([0,-19,0])}),
])

function connector({gender,positionLdu,orientation,role,index,file,site=null}){
  return{
    schemaVersion:4,
    family:'cylinder',
    gender,
    group:ENGINE_PISTON_FIXTURE_GROUP_V4,
    frame:{positionLdu:[...positionLdu],orientation:[...orientation]},
    geometry:{sections:PROFILE.map(section=>({...section})),caps:'none',centered:true},
    snap:{slide:false},
    inheritance:{scale:'none',mirror:'cor'},
    source:{kind:'bricklab-verified-assembly-fixture',file,primitive:null,meta:'TECHNIC_ENGINE_4368_4369',raw:''},
    provenance:[{type:'verified-ldraw-help-fixture',pair:'4368+4369',role,index,site}],
    discovery:{version:ENGINE_PISTON_FIXTURES_VERSION_V4,role,site,confidence:'verified-ldraw-help-layout'},
  }
}

export function discoverEnginePistonFixturesV4(file){
  const name=normalize(file)
  if(name==='4368.dat'){
    const connectors=CRANK_RIM_SITES.map((site,index)=>connector({
      gender:'male',
      positionLdu:site.positionLdu,
      orientation:DISK_ORIENTATION,
      role:'technic-engine-crank-rim-site',
      index,
      site:site.id,
      file:name,
    }))
    return{
      version:ENGINE_PISTON_FIXTURES_VERSION_V4,
      file:name,
      connectors,
      stats:{crankRimSites:connectors.length,pistonFollowers:0,connectors:connectors.length},
    }
  }
  if(name==='4369.dat'){
    const connectors=[connector({
      gender:'female',
      positionLdu:[ENGINE_PISTON_TAIL_X_LDU_V4,0,0],
      orientation:PISTON_ORIENTATION,
      role:'technic-engine-piston-follower',
      index:0,
      file:name,
    })]
    return{
      version:ENGINE_PISTON_FIXTURES_VERSION_V4,
      file:name,
      connectors,
      stats:{crankRimSites:0,pistonFollowers:1,connectors:1},
    }
  }
  return{
    version:ENGINE_PISTON_FIXTURES_VERSION_V4,
    file:name,
    connectors:[],
    stats:{crankRimSites:0,pistonFollowers:0,connectors:0},
  }
}

export const ENGINE_CRANK_RIM_SITES_V4=CRANK_RIM_SITES
