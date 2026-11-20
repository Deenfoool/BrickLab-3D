import { BufferGeometry, Float32BufferAttribute, Points, ShaderMaterial } from 'three'

export function createCarEffects(wheels, wheelPosition) {
  const positions = []
  const velocities = []
  const timing = []
  const appearance = []
  const sample = seed => {
    const value = Math.sin(seed * 91.631) * 43758.5453
    return value - Math.floor(value)
  }

  function particle(origin, velocity, birth, life, size, smoke, seed) {
    positions.push(origin.x, origin.y, origin.z)
    velocities.push(...velocity)
    timing.push(birth, life)
    appearance.push(size, smoke ? 1 : 0, seed)
  }

  for (const wheel of wheels) {
    const side = wheel.direction
    if (!wheel.front) {
      for (let i = 0; i < 20; i++) {
        const seed = i + (side === 1 ? 1 : 33)
        const birth = .36 + i * .057
        const origin = wheelPosition(wheel, birth)
        origin.y = .07 + sample(seed + 1) * .08
        particle(origin, [side * .15 + (sample(seed) - .55) * .9, .12 + sample(seed + 8) * .21, -.32],
          birth, .72 + sample(seed + 2) * .43, .31 + sample(seed + 3) * .18, true, seed)
      }
    }
    for (let i = 0; i < 9; i++) {
      const seed = i + (side === 1 ? 51 : 68) + (wheel.front ? 20 : 0)
      const birth = wheel.rimTiming[0] + i * .065
      const origin = wheelPosition(wheel, birth, true)
      particle(origin, [side * (.25 + sample(seed) * .45), .12 + sample(seed + 1) * .45, (sample(seed + 2) - .5) * .85],
        birth, .48 + sample(seed + 3) * .53, .012 + sample(seed + 4) * .022, false, seed)
    }
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('velocity', new Float32BufferAttribute(velocities, 3))
  geometry.setAttribute('timing', new Float32BufferAttribute(timing, 2))
  geometry.setAttribute('appearance', new Float32BufferAttribute(appearance, 3))
  const material = new ShaderMaterial({
    uniforms: { elapsed: { value: 0 }, pointScale: { value: 1 } },
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    vertexShader: `
      attribute vec3 velocity;
      attribute vec2 timing;
      attribute vec3 appearance;
      uniform float elapsed;
      uniform float pointScale;
      varying float age;
      varying float smoke;
      varying float seed;

      void main() {
        float travel = elapsed - timing.x;
        age = travel / timing.y;
        smoke = appearance.y;
        seed = appearance.z;
        vec3 center = position + max(0.0, travel) * velocity;
        center.y -= (1.0 - smoke) * .26 * travel * travel;
        vec4 viewPosition = modelViewMatrix * vec4(center, 1.0);
        gl_Position = projectionMatrix * viewPosition;
        if (age < 0.0 || age > 1.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        float size = appearance.x * mix(1.0, .8 + clamp(age, 0.0, 1.0) * 1.9, smoke);
        gl_PointSize = clamp(size * pointScale / -viewPosition.z, 1.0, 144.0);
      }
    `,
    fragmentShader: `
      varying float age;
      varying float smoke;
      varying float seed;

      float hash(vec2 p) {
        vec3 q = fract(vec3(p.xyx) * .1031);
        q += dot(q, q.yzx + 33.33);
        return fract((q.x + q.y) * q.z);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + 1.0), f.x), f.y);
      }

      void main() {
        vec2 p = gl_PointCoord * 2.0 - 1.0;
        float radius = length(p);
        float fade = smoothstep(0.0, .14, age) * (1.0 - smoothstep(.28, 1.0, age));
        vec3 tint;
        float alpha;
        if (smoke > .5) {
          vec2 flow = p * 2.1 + vec2(seed, -age * .7);
          float density = .66 * noise(flow) + .34 * noise(flow * 2.4);
          float edge = 1.0 - smoothstep(.04, .92, radius + (.53 - density) * .51);
          alpha = .24 * fade * edge * edge * (.46 + .54 * density);
          tint = mix(vec3(.38, .44, .52), vec3(.63, .69, .76), density);
        } else {
          alpha = .68 * fade * (1.0 - smoothstep(.12, .94, radius));
          tint = mod(seed, 5.0) < 1.0 ? vec3(.92, .69, .34) : vec3(.68, .78, .89);
        }
        if (alpha < .002) discard;
        gl_FragColor = vec4(tint, alpha);
        #include <colorspace_fragment>
      }
    `,
  })
  const points = new Points(geometry, material)
  points.frustumCulled = false
  points.renderOrder = 2
  return points
}
