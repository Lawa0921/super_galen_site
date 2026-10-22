// The RGB atlas contains licensed source masks, not colour data. Keep it linear.
// Shared depth code has one program in both quality modes; softness=0 disables
// scene sampling while preserving camera-near fade.
const depth = `
  uniform sampler2D sceneDepth;
  uniform vec2 screen;
  uniform float softness, cameraNear, cameraFar;
  varying float vDepth;
  float particleFade() {
    float fade = smoothstep(cameraNear, cameraNear + .5, vDepth);
    if (softness > 0.) {
      float d = texture2D(sceneDepth, gl_FragCoord.xy / screen).x;
      float sceneZ = cameraNear * cameraFar / (cameraFar - d * (cameraFar - cameraNear));
      fade *= smoothstep(0., softness, sceneZ - vDepth);
    }
    return fade;
  }`;

export const puffVertex = `
  attribute vec4 cloud, shape, puff;
  attribute vec3 tint;
  attribute vec2 spin;
  uniform float time, centerY, vertical;
  varying vec2 vUv;
  varying float vAlpha, vAngle, vLift, vDepth, vVariant;
  varying vec3 vTint;
  void main() {
    float age = time - cloud.w, life = shape.x, debris = shape.w;
    float grow = smoothstep(0., debris > .5 ? .35 : 1.1, age);
    float edge = length(puff.xyz * vec3(1., 1. / vertical, 1.));
    float fade = 1. - smoothstep(shape.y - edge * 2.2, life - edge * 1.2, age);
    vec3 drift = vec3(sin(time * .17 + spin.y * 6.283), 0., cos(time * .13 + spin.y * 6.283)) * .18 * grow;
    drift.y += debris > .5 ? age * .45 : sin(time * .21 + spin.y * 9.) * .08;
    vec3 center = cloud.xyz + vec3(0., debris > .5 ? .6 : centerY, 0.) + puff.xyz * shape.z * (.3 + .7 * grow) + drift;
    vec4 mv = viewMatrix * vec4(center, 1.);
    float size = puff.w * shape.z * (.55 + .45 * grow) * (debris > .5 ? 1. + age * .35 : 1.);
    mv.xy += position.xy * size * 1.5;
    gl_Position = projectionMatrix * mv;
    vDepth = -mv.z;
    vLift = center.y + position.y * size * 1.5 - cloud.y;
    vUv = uv; vTint = tint; vVariant = spin.y;
    vAngle = spin.x + time * (fract(spin.y * 7.) - .5) * .12;
    vAlpha = age >= 0. && age < life ? fade * grow * (1. - edge * .3) : 0.;
  }`;

export const puffFragment = `
  uniform sampler2D masks;
  uniform vec3 sun;
  varying vec2 vUv;
  varying float vAlpha, vAngle, vLift, vVariant;
  varying vec3 vTint;
  ${depth}
  void main() {
    if (vAlpha < .004) discard;
    vec2 p = vUv - .5;
    float c = cos(vAngle), s = sin(vAngle);
    vec2 uv = mat2(c, -s, s, c) * p + .5;
    if (min(uv.x, uv.y) < 0. || max(uv.x, uv.y) > 1.) discard;
    vec3 tex = texture2D(masks, vec2(uv.x * .5, uv.y)).rgb;
    float mask = mix(tex.r, tex.g, step(.5, vVariant));
    float alpha = min(.98, mask * 2.8 * vAlpha) * smoothstep(-.1, .7, vLift) * particleFade();
    if (alpha < .004) discard;
    vec2 q = p * 2.;
    vec3 n = normalize(vec3(q, sqrt(max(0., 1. - dot(q, q)))));
    float light = .72 + .35 * max(0., dot(n, sun));
    gl_FragColor = vec4(vTint * light, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

export const fireVertex = `
  attribute vec4 burst, look, motion;
  attribute vec3 tint;
  uniform float time;
  varying vec2 vUv;
  varying float vAlpha, vDepth, vKind;
  varying vec3 vTint;
  void main() {
    float age = time - burst.w, t = clamp(age / look.y, 0., 1.);
    vKind = motion.w;
    vec3 center = burst.xyz;
    if (vKind > .5 && vKind < 1.5) {
      center += motion.xyz * age;
      center.y -= 4.9 * age * age;
    }
    float size = look.x * (.55 + .7 * sqrt(t));
    float c = cos(look.z + age * look.w), s = sin(look.z + age * look.w);
    vec2 offset = mat2(c, -s, s, c) * position.xy * size;
    vec4 mv;
    if (vKind > 1.5) {
      // XY -> X(-Z) keeps the front face pointing upward toward the player.
      center.xz += vec2(offset.x, -offset.y) * (1. + t * 2.);
      mv = viewMatrix * vec4(center, 1.);
    } else {
      mv = viewMatrix * vec4(center, 1.); mv.xy += offset;
    }
    gl_Position = projectionMatrix * mv;
    vDepth = -mv.z; vUv = uv; vTint = tint;
    vAlpha = age >= 0. && age < look.y ? pow(1. - t, 1.6) : 0.;
  }`;

export const fireFragment = `
  uniform sampler2D masks;
  varying vec2 vUv;
  varying float vAlpha, vKind;
  varying vec3 vTint;
  ${depth}
  void main() {
    if (vAlpha < .004) discard;
    vec3 tex = texture2D(masks, vec2(vUv.x * .5 + (vKind > 1.5 ? 0. : .5), vUv.y)).rgb;
    float mask = vKind > .5 && vKind < 1.5 ? tex.r : tex.b;
    // A grounded decal sits centimetres above its own receiver. Applying the
    // volumetric intersection fade would erase it; ordinary depth testing
    // still occludes it behind walls and preserves the camera-near fade.
    float fade = vKind > 1.5 ? smoothstep(cameraNear, cameraNear + .5, vDepth) : particleFade();
    float alpha = mask * vAlpha * fade;
    if (vKind > 1.5) {
      // A thin expanding dust front, with the floor visible through its centre.
      float radius = length(vUv - .5) * 2.;
      alpha *= smoothstep(.32, .6, radius) * (1. - smoothstep(.72, 1., radius)) * .6;
    }
    if (alpha < .004) discard;
    gl_FragColor = vec4(vTint, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

export const scorchVertex = `
  attribute float born;
  attribute vec4 surfaceBounds;
  uniform float time, life;
  varying vec2 vUv;
  varying vec2 vWorldXZ;
  varying vec4 vSurfaceBounds;
  varying float vAlpha;
  void main() {
    vUv = uv; vAlpha = 1. - smoothstep(life * .65, life, time - born);
    vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.);
    vWorldXZ = world.xz; vSurfaceBounds = surfaceBounds;
    gl_Position = projectionMatrix * viewMatrix * world;
  }`;
export const scorchFragment = `
  uniform sampler2D masks;
  varying vec2 vUv;
  varying vec2 vWorldXZ;
  varying vec4 vSurfaceBounds;
  varying float vAlpha;
  void main() {
    if (vWorldXZ.x < vSurfaceBounds.x || vWorldXZ.y < vSurfaceBounds.y
      || vWorldXZ.x > vSurfaceBounds.z || vWorldXZ.y > vSurfaceBounds.w) discard;
    float alpha = texture2D(masks, vec2(.5 + vUv.x * .5, vUv.y)).g * vAlpha * .8;
    if (alpha < .004) discard;
    gl_FragColor = vec4(.025, .02, .018, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;
