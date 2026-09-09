// Original BrickLab synthesis recipes. No external samples or recordings.
export const SOUNDS = Object.freeze({
  click: [0.035, 1700, .12], toggle: [.045, 1300, .13], panel: [.065, 900, .13],
  mode: [.11, 650, .16], tool: [.035, 2100, .12], success: [.09, 1200, .16],
  warning: [.12, 450, .15], error: [.17, 310, .18], delete: [.08, 550, .19],
  undo: [.06, 850, .13], redo: [.06, 1050, .13], language: [.06, 1450, .12],
  start: [.12, 800, .16], stop: [.10, 480, .15], pickup: [.065, 1800, .20],
  place: [.105, 820, .25], move: [.065, 950, .16], rotate: [.05, 1400, .17],
  detach: [.085, 1600, .23], snap: [.11, 2100, .25], 'pin-insert': [.09, 2800, .24],
  'axle-insert': [.13, 1100, .23], 'axle-gear': [.12, 1550, .24],
  'wheel-hub': [.15, 650, .25], 'gear-mesh': [.14, 1900, .20], incompatible: [.10, 420, .13],
  'impact-soft': [.075, 1200, .19], 'impact-medium': [.16, 780, .29],
  'impact-hard': [.25, 470, .36], metal: [.22, 4100, .09], suspension: [.09, 610, .09],
  motor: [1, 120, .16], gears: [1, 240, .08], tyres: [1, 75, .08], music: [32, 0, .12],
})
export const LOOP_NAMES = new Set(['motor', 'gears', 'tyres', 'music'])
export function synthesize(name, variant = 0, sampleRate = 24000) {
  const spec = SOUNDS[name]
  if (!spec) throw new Error(`Unknown audio recipe: ${name}`)
  const [duration, frequency, amplitude] = spec
  const samples = new Float32Array(Math.round(duration * sampleRate))
  let seed = (variant + 1) * 9127 + Object.keys(SOUNDS).indexOf(name) * 131
  const noise = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2147483648 - 1 }
  const tau = 2 * Math.PI, f = frequency * (1 + (variant - 1.5) * .025)
  let filtered = 0
  for (let i = 0; i < samples.length; i++) {
    const t = i / sampleRate
    filtered += .18 * (noise() - filtered)
    let value
    if (name === 'music') {
      // 32-second periodic composition: overlapping warm suspended chords, no beat.
      // Integer cycles per buffer make both the waveform and its envelope seamless.
      value = 0
      const chords = [[48,55,62,67], [45,52,59,64], [41,48,55,60], [43,50,57,62]]
      for (let c = 0; c < 4; c++) {
        const phase = ((t - c * 8 + 32) % 32) / 32
        const envelope = Math.pow(.5 + .5 * Math.cos(tau * phase), 6)
        for (const note of chords[c]) {
          const hz = Math.round(440 * 2 ** ((note - 69) / 12) * 32) / 32
          value += envelope * (Math.sin(tau * hz * t) + .12 * Math.sin(tau * hz * 2 * t)) / 12
        }
      }
    } else if (LOOP_NAMES.has(name)) {
      const base = Math.round(frequency)
      value = name === 'motor' ? .6*Math.sin(tau*base*t)+.2*Math.sin(tau*base*3*t)+.08*Math.sin(tau*base*7*t)
        : name === 'gears' ? Math.sin(tau*base*t)*(.4+.2*Math.sin(tau*12*t)) + .12*Math.sin(tau*base*4*t)
        : .2*Math.sin(tau*137*t)+.13*Math.sin(tau*293*t)+.11*Math.sin(tau*431*t)+.08*Math.sin(tau*617*t)+.07*Math.sin(tau*881*t)
    } else {
      const attack = Math.min(1, t / .0015)
      const decay = Math.exp(-t / (duration * .15))
      const tail = Math.min(1, (duration - t) / .012)
      // Damped inharmonic modes plus filtered friction: hard polymer contact, no pitch sweep.
      value = attack * tail * (decay * (.46*Math.sin(tau*f*t)+.2*Math.sin(tau*f*1.73*t)+filtered*.75))
      if (/insert|snap|mesh|hub/.test(name) && t > .025) value += .28*Math.exp(-(t-.025)/.013)*Math.sin(tau*f*1.3*(t-.025))*tail
    }
    samples[i] = value * amplitude
  }
  return samples
}
