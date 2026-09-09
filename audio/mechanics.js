export function impactLevel(speed) { return speed < .10 ? null : speed < .30 ? 'impact-soft' : speed < .8 ? 'impact-medium' : 'impact-hard' }
export function connectorSound(detail) {
  const ports = `${detail.source ?? ''} ${detail.target ?? ''}`, parts = `${detail.sourcePart ?? ''} ${detail.targetPart ?? ''}`
  if (/wheel|hub/.test(parts)) return 'wheel-hub'
  if (/axle/.test(ports)) return /gear/.test(parts) ? 'axle-gear' : 'axle-insert'
  if (/pin/.test(ports)) return 'pin-insert'
  return 'snap'
}
const position = body => { const p = body?.translation?.(); return p && { x:p.x/.008, y:p.y/.008, z:p.z/.008 } }
export class MechanicalAudio {
  constructor(audio) { this.audio = audio; this.contacts = new Map(); this.session = null; this.lastMix = -Infinity; this.cursor = 0; this.materials = new WeakMap() }
  reset(session) { this.contacts.clear(); this.session = session; this.cursor = 0; this.testStatus = null; this.audio.stopAll() }
  // Read-only contact manifolds immediately after a Rapier microstep. No event flags,
  // collider edits, force application or world stepping are performed here.
  contactsAfterStep(session, dt) {
    const a = this.audio
    if (!a.context || a.context.state !== 'running' || a.hidden || a.settings.mute || !session.running) return
    if (this.session !== session) this.reset(session)
    const components = session.components ?? [], now = a.now()
    let budget = 96, pairs = 0
    const visited = new Set()
    // Rotating budget prevents large builds from causing an unbounded contact walk.
    for (let n = 0; n < Math.min(components.length, 48) && budget > 0; n++) {
      const component = components[(this.cursor+n)%components.length], body = component.body
      if (!body?.isValid?.() || body.isSleeping()) continue
      for (let i=0; i<body.numColliders() && budget-- > 0; i++) {
        const collider = body.collider(i)
        session.world.contactPairsWith(collider, other => {
          if (++pairs > 128) return
          const key = [collider.handle, other.handle].sort((x,y)=>x-y).join(':')
          if (visited.has(key)) return
          visited.add(key)
          const b = other.parent(), massA = body.mass(), massB = b?.isDynamic() ? b.mass() : Infinity
          let impulse = 0
          session.world.contactPair(collider, other, manifold => {
            for (let k=0; k<manifold.numContacts(); k++) impulse += Math.max(0, manifold.contactImpulse(k))
          })
          const gravity = session.world.gravity, support = Math.hypot(gravity.x, gravity.y, gravity.z) * dt * 1.8
          const speed = Math.max(0, impulse * (1/Math.max(massA,1e-6) + (Number.isFinite(massB) ? 1/Math.max(massB,1e-6) : 0)) - support)
          const previous = this.contacts.get(key)
          this.contacts.set(key, { seen:now, speed, played:previous?.played ?? -Infinity })
          const name = impactLevel(speed)
          if (!name || now-(previous?.played ?? -Infinity)<280 || (previous && now-previous.seen<100 && speed < Math.max(.15, previous.speed*2.5))) return
          const voice = a.play(name, { position:position(body), volume:Math.min(1,.35+speed*.45), cooldown:80, key:'collision-budget' })
          if (voice) {
            this.contacts.get(key).played = now
            if (!this.materials.has(component)) {
              let metal=false
              for (const member of component.members ?? []) member.object?.traverse?.(node => {
                const materials=Array.isArray(node.material)?node.material:[node.material]
                if(materials.some(m=>m?.metalness>.65 || m?.userData?.surface==='metal')) metal=true
              })
              this.materials.set(component,metal)
            }
            if (speed>.3 && this.materials.get(component)) a.play('metal',{position:position(body),volume:.35,cooldown:220})
          }
        })
      }
    }
    this.cursor = (this.cursor+48)%Math.max(1,components.length)
    if (this.contacts.size>1024) this.contacts.clear()
    if (this.contacts.size>256) for (const [key,value] of this.contacts) if(now-value.seen>1000) this.contacts.delete(key)
  }
  update(session, mode, camera) {
    const a=this.audio, now=a.now()
    if (now-this.lastMix<50) return
    this.lastMix=now; a.listener(camera)
    if (this.session!==session) this.reset(session)
    if (mode==='build') { a.startLoop('music'); return }
    a.stopLoop('music')
    if (!session?.running || a.hidden) { for(const name of ['motor','gears','tyres']) a.stopLoop(name); return }
    const motors=session.motorDrives??[]
    const drive=motors.reduce((best,d)=>Math.abs(d.actualRpm??0)+(d.load??0)*50>Math.abs(best?.actualRpm??0)+(best?.load??0)*50?d:best,null)
    const rpm=Math.abs(drive?.actualRpm??0), load=drive?.load??0
    if(drive && (rpm>2 || load>.05)) a.startLoop('motor',{rpm,load,volume:Math.min(.65,.08+rpm/800+load*.15),position:position(drive.bodyB)})
    else a.stopLoop('motor')
    let shaftSpeed=0, shaftBody
    for(const monitor of (session.shaftMonitors??[]).slice(0,64)) {
      const v=monitor.body?.angvel?.(); const speed=v?Math.hypot(v.x,v.y,v.z)*60/(2*Math.PI):0
      if(speed>shaftSpeed){shaftSpeed=speed;shaftBody=monitor.body}
    }
    if(shaftSpeed>3) a.startLoop('gears',{rpm:shaftSpeed,load,volume:Math.min(.32,shaftSpeed/1800),position:position(shaftBody)})
    else a.stopLoop('gears')
    const wheels=(session.wheelMonitors??[]).filter(w=>w.normalLoadN>.002)
    const wheel=wheels.reduce((best,w)=>Math.abs(w.groundSpeed??0)>Math.abs(best?.groundSpeed??0)?w:best,null)
    const speed=Math.abs(wheel?.groundSpeed??0)
    if(speed>.01) a.startLoop('tyres',{rpm:speed*1000,volume:Math.min(.3,speed*.8+Math.abs(wheel.slipRatio??0)*.02),position:position(wheel.body)})
    else a.stopLoop('tyres')
    for(const s of (session.suspensionJoints??[]).slice(0,12)) if(Math.abs(s.v2Velocity??0)>.8) a.play('suspension',{volume:.4,cooldown:450,position:position(session.members.get(s.id)?.body)})
    // Prismatic mechanisms: read relative body velocity along their actual slider axis.
    for (const item of [...(session.steeringRacksV1??[]), ...(session.shockAbsorbersV1??[])].slice(0,16)) {
      const record=item.record, bodyA=record?.memberA?.body, bodyB=record?.memberB?.body
      if(!bodyA || !bodyB || !record.axisA) continue
      const axis=record.axisA.clone().applyQuaternion(bodyA.rotation())
      const va=bodyA.linvel(), vb=bodyB.linvel()
      const travelSpeed=Math.abs((vb.x-va.x)*axis.x+(vb.y-va.y)*axis.y+(vb.z-va.z)*axis.z)
      if(travelSpeed>.008) a.play('suspension',{volume:Math.min(.5,travelSpeed*10),cooldown:450,position:position(bodyB)})
    }
    const status=session.testStatus
    if(status && status!==this.testStatus && ['PASSED','FAILED','STALLED'].includes(status)) a.play(status==='PASSED'?'success':'warning')
    this.testStatus=status
  }
}
