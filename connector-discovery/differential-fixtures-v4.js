export const DIFFERENTIAL_FIXTURES_VERSION_V4='differential-fixtures-v4.1.0'

const GROUP='technic-differential-6589-seat'
const PROFILE=Object.freeze([Object.freeze({shape:'R',radiusLdu:4,lengthLdu:4,elastic:false})])
const normalize=value=>String(value||'').replace(/\\/g,'/').replace(/^parts\//i,'').split('/').pop()?.toLowerCase()||''

function cylinder({gender,positionLdu,orientation,role,index,file}){
  return{
    schemaVersion:4,
    family:'cylinder',
    gender,
    group:GROUP,
    frame:{positionLdu:[...positionLdu],orientation:[...orientation]},
    geometry:{sections:PROFILE.map(section=>({...section})),caps:'none',centered:true},
    snap:{slide:false},
    inheritance:{scale:'none',mirror:'cor'},
    source:{kind:'bricklab-verified-assembly-fixture',file,primitive:null,meta:'TECHNIC_DIFFERENTIAL_62821_6589',raw:''},
    provenance:[{type:'verified-ldraw-assembly-fixture',set:'62821+6589',role,index}],
    discovery:{version:DIFFERENTIAL_FIXTURES_VERSION_V4,role,confidence:'verified-multi-model-ldraw-layout'},
  }
}

const HOUSING_SEATS=Object.freeze([
  Object.freeze({
    positionLdu:Object.freeze([0,0,-17]),
    orientation:Object.freeze([1,0,0, 0,0,1, 0,-1,0]),
  }),
  Object.freeze({
    positionLdu:Object.freeze([0,0,17]),
    orientation:Object.freeze([1,0,0, 0,0,-1, 0,1,0]),
  }),
  Object.freeze({
    positionLdu:Object.freeze([0,-17,0]),
    orientation:Object.freeze([1,0,0, 0,-1,0, 0,0,-1]),
  }),
])

const GEAR_PIVOT_ORIENTATION=Object.freeze([1,0,0, 0,0,1, 0,-1,0])

export function discoverDifferentialFixturesV4(file){
  const name=normalize(file)
  if(name==='62821.dat'||name==='62821b.dat'){
    const connectors=HOUSING_SEATS.map((seat,index)=>cylinder({
      gender:'female',
      positionLdu:seat.positionLdu,
      orientation:seat.orientation,
      role:'differential-bevel-seat',
      index,
      file:name,
    }))
    return{version:DIFFERENTIAL_FIXTURES_VERSION_V4,file:name,connectors,stats:{housingSeats:3,gearPivots:0,connectors:3}}
  }
  if(name==='6589.dat'){
    const connectors=[cylinder({
      gender:'male',
      positionLdu:[0,0,0],
      orientation:GEAR_PIVOT_ORIENTATION,
      role:'differential-bevel-pivot',
      index:0,
      file:name,
    })]
    return{version:DIFFERENTIAL_FIXTURES_VERSION_V4,file:name,connectors,stats:{housingSeats:0,gearPivots:1,connectors:1}}
  }
  return{version:DIFFERENTIAL_FIXTURES_VERSION_V4,file:name,connectors:[],stats:{housingSeats:0,gearPivots:0,connectors:0}}
}

export const DIFFERENTIAL_FIXTURE_GROUP_V4=GROUP
export const DIFFERENTIAL_62821_SEATS_V4=HOUSING_SEATS
