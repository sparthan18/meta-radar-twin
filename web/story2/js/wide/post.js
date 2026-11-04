// deck.gl PostProcessEffect chain. The four shader passes are luma.gl's own modules
// (@luma.gl/effects 9.4.2: vignette, noise, brightnessContrast, tiltShift, plus the `random` helper
// tiltShift depends on), inlined verbatim because the package's CDN bundle (dist/dist.min.js) ships
// without them and its ESM build needs an import map. deck.PostProcessEffect consumes them unchanged.
const random = {
  name: 'random',
  fs: /* glsl */`
float random(vec3 scale, float seed) {
  /* use the fragment position for a different seed per-pixel */
  return fract(sin(dot(gl_FragCoord.xyz + seed, scale)) * 43758.5453 + seed);
}
`,
};

export const vignette = {
  name: 'vignette',
  fs: /* glsl */`
layout(std140) uniform vignetteUniforms {
  float radius;
  float amount;
} vignette;

vec4 vignette_filterColor_ext(vec4 color, vec2 texSize, vec2 texCoord) {
  float dist = distance(texCoord, vec2(0.5, 0.5));
  float ratio = smoothstep(0.8, vignette.radius * 0.799, dist * (vignette.amount + vignette.radius));
  return color.rgba * ratio + (1.0 - ratio)*vec4(0.0, 0.0, 0.0, 1.0);
}
`,
  uniformTypes: { radius: 'f32', amount: 'f32' },
  propTypes: { radius: { value: 0.5, min: 0, max: 1 }, amount: { value: 0.5, min: 0, max: 1 } },
  passes: [{ filter: true }],
};

export const noise = {
  name: 'noise',
  fs: /* glsl */`
layout(std140) uniform noiseUniforms {
  float amount;
} noise;

float rand(vec2 co) {
  return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
}

vec4 noise_filterColor_ext(vec4 color, vec2 texSize, vec2 texCoord) {
  float diff = (rand(texCoord) - 0.5) * noise.amount;
  color.r += diff;
  color.g += diff;
  color.b += diff;
  return color;
}
`,
  uniformTypes: { amount: 'f32' },
  propTypes: { amount: { value: 0.5, min: 0, max: 1 } },
  passes: [{ filter: true }],
};

export const brightnessContrast = {
  name: 'brightnessContrast',
  fs: /* glsl */`
layout(std140) uniform brightnessContrastUniforms {
  float brightness;
  float contrast;
} brightnessContrast;

vec4 brightnessContrast_filterColor(vec4 color) {
  color.rgb += brightnessContrast.brightness;
  if (brightnessContrast.contrast > 0.0) {
    color.rgb = (color.rgb - 0.5) / (1.0 - brightnessContrast.contrast) + 0.5;
  } else {
    color.rgb = (color.rgb - 0.5) * (1.0 + brightnessContrast.contrast) + 0.5;
  }
  return color;
}

vec4 brightnessContrast_filterColor_ext(vec4 color, vec2 texSize, vec2 texCoord) {
  return brightnessContrast_filterColor(color);
}
`,
  uniformTypes: { brightness: 'f32', contrast: 'f32' },
  propTypes: { brightness: { value: 0, min: -1, max: 1 }, contrast: { value: 0, min: -1, max: 1 } },
  passes: [{ filter: true }],
};

export const tiltShift = {
  name: 'tiltShift',
  dependencies: [random],
  fs: /* glsl */`
layout(std140) uniform tiltShiftUniforms {
  float blurRadius;
  float gradientRadius;
  vec2 start;
  vec2 end;
  bool invert;
} tiltShift;

vec2 tiltShift_getDelta(vec2 texSize) {
  vec2 vector = normalize((tiltShift.end - tiltShift.start) * texSize);
  return tiltShift.invert ? vec2(-vector.y, vector.x) : vector;
}

vec4 tiltShift_sampleColor(sampler2D source, vec2 texSize, vec2 texCoord) {
  vec4 color = vec4(0.0);
  float total = 0.0;

  /* randomize the lookup values to hide the fixed number of samples */
  float offset = random(vec3(12.9898, 78.233, 151.7182), 0.0);

  vec2 normal = normalize(vec2((tiltShift.start.y - tiltShift.end.y) * texSize.y, (tiltShift.end.x - tiltShift.start.x) * texSize.x));
  float radius = smoothstep(0.0, 1.0,
    abs(dot(texCoord * texSize - tiltShift.start * texSize, normal)) / tiltShift.gradientRadius) * tiltShift.blurRadius;

  for (float t = -30.0; t <= 30.0; t++) {
    float percent = (t + offset - 0.5) / 30.0;
    float weight = 1.0 - abs(percent);
    vec4 offsetColor = texture(source, texCoord + tiltShift_getDelta(texSize) / texSize * percent * radius);
    color += offsetColor * weight;
    total += weight;
  }

  color = color / total;
  return color;
}
`,
  uniformTypes: { blurRadius: 'f32', gradientRadius: 'f32', start: 'vec2<f32>', end: 'vec2<f32>', invert: 'i32' },
  propTypes: {
    blurRadius: { value: 15, min: 0, max: 50 }, gradientRadius: { value: 200, min: 0, max: 400 },
    start: { value: [0, 0] }, end: { value: [1, 1] }, invert: { value: 0, private: true },
  },
  passes: [{ sampler: true, uniforms: { invert: 0 } }, { sampler: true, uniforms: { invert: 1 } }],
};

// Names: bc (brightnessContrast), tilt (tiltShift), vignette, noise.
export function makePostEffects(names, { tiltFocusY = 0.5 } = {}) {
  const out = [];
  for (const n of names) {
    if (n === 'bc') out.push(new deck.PostProcessEffect(brightnessContrast, { brightness: -0.03, contrast: 0.12 }));
    else if (n === 'tilt') out.push(new deck.PostProcessEffect(tiltShift, { blurRadius: 6, gradientRadius: 260, start: [0, tiltFocusY], end: [1, tiltFocusY], invert: 0 }));
    else if (n === 'vignette') out.push(new deck.PostProcessEffect(vignette, { radius: 0.55, amount: 0.45 }));
    else if (n === 'noise') out.push(new deck.PostProcessEffect(noise, { amount: 0.08 }));
    else if (n && n !== 'none') console.warn('unknown post module', n);
  }
  return out;
}
