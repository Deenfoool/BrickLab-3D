import { SOUNDS, LOOP_NAMES, synthesize } from '../assets/audio/recipes.js'
export const SETTINGS_KEY = 'bricklab.audio.v1'
export const DEFAULTS = Object.freeze({ master: .7, sfx: .7, music: .23, mute: false })
const clamp = (v, fallback = 0) => Number.isFinite(Number(v)) ? Math.max(0, Math.min(1, Number(v))) : fallback
export function sanitizeSettings(value = {}) {
  if (!value || typeof value !== 'object') value = {}
  return { master: clamp(value.master ?? DEFAULTS.master, DEFAULTS.master), sfx: clamp(value.sfx ?? DEFAULTS.sfx, DEFAULTS.sfx), music: clamp(value.music ?? DEFAULTS.music, DEFAULTS.music), mute: value.mute === true }
}
export class AudioManager {
  constructor({ contextFactory, storage, random = Math.random, now = () => performance.now() } = {}) {
    this.factory = contextFactory ?? (() => new (globalThis.AudioContext || globalThis.webkitAudioContext)())
    if (!storage) { try { storage = globalThis.localStorage } catch { /* Storage may be denied. */ } }
    this.storage = storage; this.random = random; this.now = now
    try { this.settings = sanitizeSettings(JSON.parse(storage?.getItem(SETTINGS_KEY) || '{}')) } catch { this.settings = { ...DEFAULTS } }
    this.buffers = new Map(); this.voices = new Set(); this.loops = new Map(); this.cooldowns = new Map()
    this.hidden = false; this.lastAsset = ''; this.failed = new Set(); this.maxVoices = 20
  }
  async unlock() {
    try {
      if (!this.context) {
        const c = this.context = this.factory()
        this.master = c.createGain(); this.sfx = c.createGain(); this.music = c.createGain()
        const compressor = c.createDynamicsCompressor()
        compressor.threshold.value = -12; compressor.ratio.value = 4
        this.sfx.connect(this.master); this.music.connect(this.master); this.master.connect(compressor); compressor.connect(c.destination)
        this.applySettings()
      }
      if (this.context.state === 'suspended') await this.context.resume()
      return this.context.state === 'running'
    } catch (error) { this.warn('context', error); return false }
  }
  warn(key, error) { if (!this.failed.has(key)) { this.failed.add(key); console.warn(`[BrickLab audio] ${key} unavailable`, error?.message ?? error) } }
  buffer(name, variant = 0) {
    const key = `${name}/${variant}`
    if (this.buffers.has(key)) return this.buffers.get(key)
    if (name === 'music') return null // Loaded asynchronously; never synthesize a long buffer on the render thread.
    try {
      const data = synthesize(name, variant)
      const buffer = this.context.createBuffer(1, data.length, 24000)
      buffer.copyToChannel(data, 0); this.buffers.set(key, buffer); return buffer
    } catch (error) { this.warn(key, error); return null }
  }
  async loadMusic() {
    if (this.musicLoad) return this.musicLoad
    this.musicLoad = (async () => {
      try {
        const response = await fetch(new URL('../assets/audio/music/workbench.ogg', import.meta.url))
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const buffer = await this.context.decodeAudioData(await response.arrayBuffer())
        // Remove tiny codec edge transients once, not at every loop boundary.
        for (let channel=0; channel<buffer.numberOfChannels; channel++) {
          const data=buffer.getChannelData(channel), edge=Math.min(64,Math.floor(data.length/2))
          for(let i=0;i<edge;i++){const gain=Math.sin(i/edge*Math.PI/2)**2;data[i]*=gain;data[data.length-1-i]*=gain}
        }
        this.buffers.set('music/0', buffer)
      } catch (error) { this.warn('music/workbench.ogg', error) }
    })()
    return this.musicLoad
  }
  async preload() {
    if (!this.context) return
    const music = this.loadMusic()
    for (const name of Object.keys(SOUNDS).filter(name => name !== 'music')) {
      for (let v = 0; v < (LOOP_NAMES.has(name) ? 1 : 4); v++) this.buffer(name, v)
      await new Promise(resolve => setTimeout(resolve, 0))
    }
    await music
  }
  setSettings(patch) {
    this.settings = sanitizeSettings({ ...this.settings, ...patch })
    try { this.storage?.setItem(SETTINGS_KEY, JSON.stringify(this.settings)) } catch { /* private/storage denied */ }
    this.applySettings(); return this.settings
  }
  applySettings() {
    if (!this.context || !this.master) return
    const t = this.context.currentTime
    this.master.gain.setTargetAtTime(this.settings.mute || this.hidden ? 0 : this.settings.master, t, .04)
    this.sfx.gain.setTargetAtTime(this.settings.sfx, t, .04)
    this.music.gain.setTargetAtTime(this.settings.music, t, .15)
  }
  playVariant(name, options) { return this.play(name, options) }
  play(name, { volume = 1, pitch = 1, cooldown = 65, key = name, position, loop = false } = {}) {
    const c = this.context, now = this.now()
    if (!c || c.state !== 'running' || this.hidden || this.settings.mute || this.settings.master === 0) return null
    if (this.voices.size >= this.maxVoices || now - (this.cooldowns.get(key) ?? -Infinity) < cooldown) return null
    if ([...this.voices].filter(v => v.name === name).length >= (loop ? 1 : name.startsWith('impact') ? 3 : 4)) return null
    const variant = loop ? 0 : Math.floor(this.random() * 4), buffer = this.buffer(name, variant)
    if (!buffer) return null
    this.cooldowns.set(key, now)
    if (this.cooldowns.size > 512) for (const [k, t] of this.cooldowns) if (now - t > 2000) this.cooldowns.delete(k)
    const source = c.createBufferSource(), gain = c.createGain()
    source.buffer = buffer; source.loop = loop
    source.playbackRate.value = Math.max(.2, Math.min(4, pitch * (loop ? 1 : .97 + this.random() * .06)))
    gain.gain.value = loop ? 0 : clamp(volume) * (.94 + this.random() * .12)
    source.connect(gain)
    let panner
    if (position) {
      panner = c.createPanner(); panner.panningModel = 'equalpower'; panner.distanceModel = 'inverse'; panner.refDistance = 8; panner.maxDistance = 150; panner.rolloffFactor = .7
      gain.connect(panner); panner.connect(name === 'music' ? this.music : this.sfx)
      panner.positionX.value = position.x; panner.positionY.value = position.y; panner.positionZ.value = position.z
    } else gain.connect(name === 'music' ? this.music : this.sfx)
    const voice = { name, source, gain, panner, stopping: false }
    this.voices.add(voice)
    source.onended = () => { source.disconnect(); gain.disconnect(); panner?.disconnect(); this.voices.delete(voice) }
    source.start(); this.lastAsset = name === 'music' ? 'assets/audio/music/workbench.ogg' : `original recipe: ${name} / variant ${variant + 1}`
    return voice
  }
  startLoop(name, options = {}) {
    if (!LOOP_NAMES.has(name)) return null
    if (!this.loops.has(name)) { const v = this.play(name, { ...options, loop: true }); if (v) this.loops.set(name, v) }
    this.updateLoop(name, options); return this.loops.get(name)
  }
  updateLoop(name, { rpm = 120, load = 0, volume, position } = {}) {
    const v = this.loops.get(name); if (!v) return
    const t = this.context.currentTime
    v.source.playbackRate.setTargetAtTime(name === 'music' ? 1 : Math.max(.3, Math.min(3, .5 + Math.abs(rpm) / 240)), t, .1)
    v.gain.gain.setTargetAtTime(clamp(volume ?? (name === 'music' ? 1 : Math.min(.5, Math.abs(rpm)/600) * (.4 + clamp(load)*.6))), t, .12)
    if (position && v.panner) for (const axis of ['x','y','z']) v.panner[`position${axis.toUpperCase()}`].setTargetAtTime(position[axis], t, .1)
  }
  stopLoop(name) {
    const v = this.loops.get(name); if (!v) return
    this.loops.delete(name); v.stopping = true
    const t = this.context.currentTime; v.gain.gain.setTargetAtTime(0, t, .04); v.source.stop(t + .25)
  }
  stopAll() { for (const name of this.loops.keys()) this.stopLoop(name) }
  setHidden(hidden) { this.hidden = hidden; this.applySettings(); if (hidden) this.stopAll() }
  listener(camera) {
    const l = this.context?.listener; if (!l || !camera) return
    const e = camera.matrixWorld.elements, t = this.context.currentTime
    const values = { positionX:e[12], positionY:e[13], positionZ:e[14], forwardX:-e[8], forwardY:-e[9], forwardZ:-e[10], upX:e[4], upY:e[5], upZ:e[6] }
    if (l.positionX) for (const [key,value] of Object.entries(values)) l[key].setTargetAtTime(value, t, .04)
    else { l.setPosition(e[12],e[13],e[14]); l.setOrientation(-e[8],-e[9],-e[10],e[4],e[5],e[6]) }
  }
  debug() { return { settings: { ...this.settings }, state: this.context?.state ?? 'locked', lastAsset:this.lastAsset, voices:this.voices.size, loops:[...this.loops.keys()], cachedBuffers:this.buffers.size, failed:[...this.failed] } }
}
