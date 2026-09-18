import { deterministicId } from '../core/model.js'

export const SHORTCUT_DECOMPOSER_VERSION='mechanics-shortcut-decomposer-0.1.0'

const C=[1,0,0,0,-1,0,0,0,-1]

function mul3(a,b){
  return[
    a[0]*b[0]+a[1]*b[3]+a[2]*b[6],
    a[0]*b[1]+a[1]*b[4]+a[2]*b[7],
    a[0]*b[2]+a[1]*b[5]+a[2]*b[8],
    a[3]*b[0]+a[4]*b[3]+a[5]*b[6],
    a[3]*b[1]+a[4]*b[4]+a[5]*b[7],
    a[3]*b[2]+a[4]*b[5]+a[5]*b[8],
    a[6]*b[0]+a[7]*b[3]+a[8]*b[6],
    a[6]*b[1]+a[7]*b[4]+a[8]*b[7],
    a[6]*b[2]+a[7]*b[5]+a[8]*b[8],
  ]
}

function brickLabLinearFromLDraw(linear){
  // BrickLab world convention flips LDraw Y/Z. C^-1=C.
  return mul3(mul3(C,linear),C)
}

function brickLabTranslationFromLDraw(translation){
  return[
    Number(translation?.[0]||0)/20,
    -Number(translation?.[1]||0)/20,
    -Number(translation?.[2]||0)/20,
  ]
}

function descriptorRole(descriptor,reference){
  return descriptor?.classification?.role ??
    reference?.header?.description ??
    reference?.description ??
    'unknown'
}

function classifyInternalRole(role,description=''){
  const value=`${role} ${description}`.toLowerCase()
  if(/\b(?:rod|piston|ram)\b/.test(value))return'rod'
  if(/\b(?:housing|cylinder|body|barrel)\b/.test(value))return'housing'
  if(/\bspring\b/.test(value))return'spring'
  if(/\b(?:screw|worm|spindle)\b/.test(value))return'screw'
  if(/\b(?:cross|spider)\b/.test(value))return'cross'
  if(/\b(?:yoke|fork)\b/.test(value))return'yoke'
  return String(role||'unknown')
}

export function ldrawReferenceTransformToBrickLab(reference){
  const transform=reference?.transform
  if(!transform?.linear||!transform?.translation){
    throw new TypeError('Compound reference requires LDraw transform')
  }
  return Object.freeze({
    linear:Object.freeze(brickLabLinearFromLDraw(transform.linear)),
    translationStud:Object.freeze(brickLabTranslationFromLDraw(transform.translation)),
  })
}

export async function decomposeShortcutInstance({
  instanceId,
  partId,
  file,
  inheritanceResolver,
  describePath,
}={}){
  if(!instanceId||!file)throw new TypeError('Shortcut decomposition requires instanceId and file')
  if(typeof inheritanceResolver?.resolve!=='function'){
    throw new TypeError('Shortcut decomposition requires inheritance resolver')
  }
  if(typeof describePath!=='function'){
    throw new TypeError('Shortcut decomposition requires describePath(path)')
  }

  const resolved=await inheritanceResolver.resolve(file)
  const references=resolved?.compoundReferences||[]
  const rootType=resolved?.header?.type??null

  if(rootType!=='shortcut'){
    return Object.freeze({
      version:SHORTCUT_DECOMPOSER_VERSION,
      status:'not-shortcut',
      instanceId:String(instanceId),
      partId:partId??null,
      file:String(file),
      members:Object.freeze([]),
      warnings:Object.freeze([...(resolved?.warnings||[])]),
    })
  }

  const members=[]
  const unresolved=[]
  for(let index=0;index<references.length;index+=1){
    const reference=references[index]
    const descriptor=await describePath(reference.path,{reference,index})
    const transform=ldrawReferenceTransformToBrickLab(reference)
    const childId=deterministicId(
      'compound-member',
      instanceId,
      reference.path,
      index,
      JSON.stringify(reference.transform),
    )

    if(!descriptor){
      unresolved.push(Object.freeze({
        index,
        path:reference.path,
        reason:'descriptor-unavailable',
      }))
      continue
    }

    const role=descriptorRole(descriptor,reference)
    members.push(Object.freeze({
      id:childId,
      parentInstanceId:String(instanceId),
      parentPartId:partId??null,
      index,
      path:reference.path,
      type:reference.type,
      description:reference.description??descriptor.name??null,
      descriptor,
      role,
      internalRole:classifyInternalRole(role,reference.description??descriptor.name??''),
      transform,
      source:Object.freeze({
        from:reference.from,
        ref:reference.ref,
        reason:reference.reason,
      }),
    }))
  }

  const roleCounts={}
  for(const member of members){
    roleCounts[member.internalRole]=(roleCounts[member.internalRole]||0)+1
  }

  return Object.freeze({
    version:SHORTCUT_DECOMPOSER_VERSION,
    status:unresolved.length?'partial':'resolved',
    instanceId:String(instanceId),
    partId:partId??null,
    file:String(file),
    header:resolved?.header??null,
    members:Object.freeze(members),
    unresolved:Object.freeze(unresolved),
    roleCounts:Object.freeze(roleCounts),
    warnings:Object.freeze([...(resolved?.warnings||[])]),
  })
}

export function inferCompoundTopology(decomposition,rootRole){
  const members=decomposition?.members||[]
  const byRole=role=>members.filter(member=>member.internalRole===role)
  const role=String(rootRole||'').toLowerCase()

  if(role==='shock-absorber'){
    const housing=byRole('housing')[0]??members[0]??null
    const rod=byRole('rod')[0]??members.find(member=>member.id!==housing?.id)??null
    const spring=byRole('spring')[0]??null
    if(!housing||!rod)return Object.freeze({
      kind:'shock-absorber',
      status:'members-unresolved',
      memberIds:Object.freeze(members.map(member=>member.id)),
    })
    return Object.freeze({
      kind:'shock-absorber',
      status:'resolved',
      housingMemberId:housing.id,
      rodMemberId:rod.id,
      springMemberId:spring?.id??null,
      joints:Object.freeze([
        Object.freeze({
          kind:'prismatic',
          bodyA:housing.id,
          bodyB:rod.id,
          axisSource:'member-transform',
        }),
      ]),
      dynamics:'spring-damper',
    })
  }

  if(role==='linear-actuator'){
    const housing=byRole('housing')[0]??members[0]??null
    const rod=byRole('rod')[0]??members.find(member=>member.id!==housing?.id)??null
    const screw=byRole('screw')[0]??null
    if(!housing||!rod)return Object.freeze({
      kind:'linear-actuator',
      status:'members-unresolved',
      memberIds:Object.freeze(members.map(member=>member.id)),
    })
    return Object.freeze({
      kind:'linear-actuator',
      status:'resolved',
      housingMemberId:housing.id,
      rodMemberId:rod.id,
      screwMemberId:screw?.id??null,
      joints:Object.freeze([
        Object.freeze({
          kind:'prismatic',
          bodyA:housing.id,
          bodyB:rod.id,
          axisSource:'member-transform',
        }),
      ]),
      transmission:screw?'screw-linear':'external-screw-input',
    })
  }

  if(['universal-joint','cv-joint'].includes(role)){
    const yokes=byRole('yoke')
    const cross=byRole('cross')[0]??null
    if(yokes.length>=2&&cross){
      return Object.freeze({
        kind:role,
        status:'resolved-explicit-members',
        inputMemberId:yokes[0].id,
        crossMemberId:cross.id,
        outputMemberId:yokes[1].id,
        joints:Object.freeze([
          Object.freeze({kind:'revolute',bodyA:yokes[0].id,bodyB:cross.id}),
          Object.freeze({kind:'revolute',bodyA:cross.id,bodyB:yokes[1].id}),
        ]),
      })
    }
    return Object.freeze({
      kind:role,
      status:'virtual-structure-preferred',
      memberIds:Object.freeze(members.map(member=>member.id)),
    })
  }

  return Object.freeze({
    kind:role||'unknown',
    status:'generic',
    memberIds:Object.freeze(members.map(member=>member.id)),
  })
}
