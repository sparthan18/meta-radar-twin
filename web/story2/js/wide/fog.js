// Depth haze for deck.gl layers. deck.gl has no fog; this LayerExtension passes the vertex's clip-space
// depth (gl_Position.w, i.e. view-space distance) to the fragment shader and mixes toward the haze
// colour. The depth is divided by the view centre's clip-space w, computed per frame in JS from the
// viewport's view-projection matrix, so `fogNear`/`fogFar` are in "screen-centre distances" and hold
// across zoom levels and pitches.
const fogUniformBlock = /* glsl */`
layout(std140) uniform fogUniforms {
  vec4 color;
  float near;
  float far;
  float strength;
  float reference;
} fog;
`;

const fogModule = {
  name: 'fog',
  vs: fogUniformBlock + 'out float fog_vDepth;\n',
  fs: fogUniformBlock + 'in float fog_vDepth;\n',
  inject: {
    'vs:DECKGL_FILTER_GL_POSITION': /* glsl */`
      fog_vDepth = position.w / fog.reference;
    `,
    'fs:DECKGL_FILTER_COLOR': /* glsl */`
      float fog_t = smoothstep(fog.near, fog.far, fog_vDepth) * fog.strength;
      color.rgb = mix(color.rgb, fog.color.rgb, fog_t);
    `,
  },
  uniformTypes: { color: 'vec4<f32>', near: 'f32', far: 'f32', strength: 'f32', reference: 'f32' },
};

export class FogExtension extends deck.LayerExtension {
  getShaders() { return { modules: [fogModule] }; }
  draw() {
    const { fogColor = [42, 48, 66], fogNear = 1.4, fogFar = 5.0, fogStrength = 0.85 } = this.props;
    const vp = this.context.viewport;
    let reference = 1;
    try {
      const c = vp.projectPosition([vp.longitude, vp.latitude, 0]);
      const m = vp.viewProjectionMatrix; // column-major; clip w = row 3 · [x y z 1]
      reference = (m[3] * c[0] + m[7] * c[1] + m[11] * c[2] + m[15]) || 1;
    } catch (e) { /* non-geospatial viewport: leave reference at 1 */ }
    this.setShaderModuleProps({
      fog: { color: [fogColor[0] / 255, fogColor[1] / 255, fogColor[2] / 255, 1], near: fogNear, far: fogFar, strength: fogStrength, reference },
    });
  }
}
FogExtension.extensionName = 'FogExtension';
FogExtension.defaultProps = {
  fogColor: { type: 'color', value: [42, 48, 66] },
  fogNear: 1.4, fogFar: 5.0, fogStrength: 0.85,
};
