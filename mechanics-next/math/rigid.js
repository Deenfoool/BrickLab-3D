export const RIGID_EPS=1e-9

export const add3=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]]
export const sub3=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]]
export const scale3=(a,s)=>[a[0]*s,a[1]*s,a[2]*s]
export const dot3=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2]
export const cross3=(a,b)=>[
  a[1]*b[2]-a[2]*b[1],
  a[2]*b[0]-a[0]*b[2],
  a[0]*b[1]-a[1]*b[0],
]
export const len3=a=>Math.hypot(a[0],a[1],a[2])
export function norm3(a,fallback=[0,1,0]){
  const n=len3(a)
  return n>RIGID_EPS?scale3(a,1/n):[...fallback]
}
export const clamp=(v,min,max)=>Math.max(min,Math.min(max,v))

export function quatNormalize(q){
  const n=Math.hypot(q[0],q[1],q[2],q[3])
  return n>RIGID_EPS?q.map(value=>value/n):[0,0,0,1]
}
export function quatMultiply(a,b){
  const [ax,ay,az,aw]=a,[bx,by,bz,bw]=b
  return quatNormalize([
    aw*bx+ax*bw+ay*bz-az*by,
    aw*by-ax*bz+ay*bw+az*bx,
    aw*bz+ax*by-ay*bx+az*bw,
    aw*bw-ax*bx-ay*by-az*bz,
  ])
}
export function quatFromAxisAngle(axis,angle){
  const n=norm3(axis)
  const half=angle/2,s=Math.sin(half)
  return quatNormalize([n[0]*s,n[1]*s,n[2]*s,Math.cos(half)])
}
export function rotate3(q,v){
  const n=quatNormalize(q)
  const u=[n[0],n[1],n[2]],s=n[3]
  const uv=cross3(u,v),uuv=cross3(u,uv)
  return add3(v,add3(scale3(uv,2*s),scale3(uuv,2)))
}
export function quatFromUnitVectors(from,to){
  const a=norm3(from),b=norm3(to)
  const r=dot3(a,b)+1
  if(r<1e-7){
    const axis=Math.abs(a[0])>Math.abs(a[2])
      ?norm3([-a[1],a[0],0],[0,0,1])
      :norm3([0,-a[2],a[1]],[1,0,0])
    return quatFromAxisAngle(axis,Math.PI)
  }
  const c=cross3(a,b)
  return quatNormalize([c[0],c[1],c[2],r])
}
export function quatFromRotationMatrix(m){
  const trace=m[0]+m[4]+m[8]
  let q
  if(trace>0){
    const s=Math.sqrt(trace+1)*2
    q=[(m[7]-m[5])/s,(m[2]-m[6])/s,(m[3]-m[1])/s,.25*s]
  }else if(m[0]>m[4]&&m[0]>m[8]){
    const s=Math.sqrt(1+m[0]-m[4]-m[8])*2
    q=[.25*s,(m[1]+m[3])/s,(m[2]+m[6])/s,(m[7]-m[5])/s]
  }else if(m[4]>m[8]){
    const s=Math.sqrt(1+m[4]-m[0]-m[8])*2
    q=[(m[1]+m[3])/s,.25*s,(m[5]+m[7])/s,(m[2]-m[6])/s]
  }else{
    const s=Math.sqrt(1+m[8]-m[0]-m[4])*2
    q=[(m[2]+m[6])/s,(m[5]+m[7])/s,.25*s,(m[3]-m[1])/s]
  }
  return quatNormalize(q)
}
export function rotationMatrixFromQuaternion(q){
  const[x,y,z,w]=quatNormalize(q)
  const xx=x*x,yy=y*y,zz=z*z,xy=x*y,xz=x*z,yz=y*z,wx=w*x,wy=w*y,wz=w*z
  return[
    1-2*(yy+zz),2*(xy-wz),2*(xz+wy),
    2*(xy+wz),1-2*(xx+zz),2*(yz-wx),
    2*(xz-wy),2*(yz+wx),1-2*(xx+yy),
  ]
}
export function matrix3Vector(m,v){
  return[
    m[0]*v[0]+m[1]*v[1]+m[2]*v[2],
    m[3]*v[0]+m[4]*v[1]+m[5]*v[2],
    m[6]*v[0]+m[7]*v[1]+m[8]*v[2],
  ]
}
export function matrix3Multiply(a,b){
  return[
    a[0]*b[0]+a[1]*b[3]+a[2]*b[6],a[0]*b[1]+a[1]*b[4]+a[2]*b[7],a[0]*b[2]+a[1]*b[5]+a[2]*b[8],
    a[3]*b[0]+a[4]*b[3]+a[5]*b[6],a[3]*b[1]+a[4]*b[4]+a[5]*b[7],a[3]*b[2]+a[4]*b[5]+a[5]*b[8],
    a[6]*b[0]+a[7]*b[3]+a[8]*b[6],a[6]*b[1]+a[7]*b[4]+a[8]*b[7],a[6]*b[2]+a[7]*b[5]+a[8]*b[8],
  ]
}
export function signedAngleAround(from,to,axis){
  const n=norm3(axis)
  const pa=sub3(from,scale3(n,dot3(from,n)))
  const pb=sub3(to,scale3(n,dot3(to,n)))
  if(len3(pa)<RIGID_EPS||len3(pb)<RIGID_EPS)return 0
  const a=norm3(pa),b=norm3(pb)
  return Math.atan2(dot3(n,cross3(a,b)),clamp(dot3(a,b),-1,1))
}
export function quaternionAngle(q){
  const n=quatNormalize(q)
  return 2*Math.acos(clamp(Math.abs(n[3]),-1,1))
}
export function rigidPoseFromMatrix4(elements){
  if((!Array.isArray(elements)&&!ArrayBuffer.isView(elements))||elements.length!==16){
    throw new TypeError('matrix4 must contain 16 elements')
  }
  const x=[elements[0],elements[1],elements[2]]
  const y=[elements[4],elements[5],elements[6]]
  const z=[elements[8],elements[9],elements[10]]
  const sx=len3(x),sy=len3(y),sz=len3(z)
  if([sx,sy,sz].some(value=>Math.abs(value-1)>1e-4))throw new Error('rigid pose requires unit scale')
  const rotation=[
    x[0]/sx,y[0]/sy,z[0]/sz,
    x[1]/sx,y[1]/sy,z[1]/sz,
    x[2]/sx,y[2]/sy,z[2]/sz,
  ]
  return Object.freeze({
    position:Object.freeze([elements[12],elements[13],elements[14]]),
    quaternion:Object.freeze(quatFromRotationMatrix(rotation)),
  })
}
