const volumes = { snap: .3, place: .25, tool: .17, tick: .17 }
const preference = 'bricklab.editor.sound'
const rotationStep = 15
const minimumTickGap = 60

export function createEditorAudio(signal) {
  const AudioContext = globalThis.AudioContext ?? globalThis.webkitAudioContext
  const buffers = new Map()
  let enabled = true
  let requests
  let decoded
  let context
  let output
  let generation = 0
  let rotation = 0
  let lastTick = -Infinity
  try {
    enabled = localStorage.getItem(preference) !== 'off'
  } catch {
    // Sound still works with storage disabled.
  }

  function prepare() {
    if (!AudioContext || requests) return
    requests = Object.fromEntries(Object.keys(volumes).map(name => [
      name, fetch(new URL(`../../assets/audio/${name}.wav?v=editor-sound`, import.meta.url), { signal })
        .then(response => response.ok ? response.arrayBuffer() : null).catch(() => null),
    ]))
  }

  function unlock() {
    if (!enabled || !AudioContext || signal.aborted) return
    if (!context) {
      try {
        context = new AudioContext()
        output = context.createGain()
        output.connect(context.destination)
      } catch {
        return
      }
      prepare()
      decoded = Object.fromEntries(Object.entries(requests).map(([name, request]) => [
        name, request.then(async data => {
          if (!data || signal.aborted) return null
          const buffer = await context.decodeAudioData(data)
          buffers.set(name, buffer)
          return buffer
        }).catch(() => null),
      ]))
    }
    if (context.state === 'suspended' || context.state === 'interrupted') context.resume().catch(() => {})
  }

  function play(name) {
    if (!enabled || !output || signal.aborted) return
    const start = buffer => {
      const source = context.createBufferSource()
      const gain = context.createGain()
      source.buffer = buffer
      gain.gain.value = volumes[name]
      source.connect(gain)
      gain.connect(output)
      source.onended = () => { source.disconnect(); gain.disconnect() }
      source.start()
    }
    const buffer = buffers.get(name)
    if (buffer) start(buffer)
    else if (name !== 'tick') {
      const at = performance.now()
      const version = generation
      decoded[name].then(clip => {
        if (clip && enabled && generation === version && !signal.aborted && performance.now() - at < 150) start(clip)
      }).catch(() => {})
    }
  }

  function resetRotation() {
    rotation = 0
    lastTick = -Infinity
  }

  function advanceRotation(degrees, detent = false) {
    if (!enabled || !Number.isFinite(degrees) || Math.abs(degrees) < 1e-6) return
    rotation += degrees
    if (!detent && Math.abs(rotation) < rotationStep) return
    rotation = detent ? 0 : rotation % rotationStep
    const now = performance.now()
    if (now - lastTick < minimumTickGap) return
    lastTick = now
    play('tick')
  }

  if (enabled) prepare()
  signal.addEventListener('abort', () => context?.close().catch(() => {}), { once: true })
  return {
    get enabled() { return enabled },
    unlock, play, advanceRotation, resetRotation,
    toggle() {
      enabled = !enabled
      generation++
      resetRotation()
      if (output) output.gain.value = Number(enabled)
      try {
        localStorage.setItem(preference, enabled ? 'on' : 'off')
      } catch {
        // Keep the current session's choice.
      }
      if (enabled) unlock()
      return enabled
    },
  }
}
