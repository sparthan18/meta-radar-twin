// Keeps a layer out of the shadow system: `shadowEnabled: false` (a deck.gl layer prop) stops it
// casting; this extension stops it receiving, which deck.gl has no prop for. It re-sets the lighting
// effect's own shadow props with a fully transparent shadow colour (a partial props object would wipe
// the shadow-map texture bindings and silently skip the draw). Without it, billboards (icons, text)
// and the accent slab self-shadow into the shadow colour.
export class NoShadowExtension extends deck.LayerExtension {
  draw(opts) {
    const shadow = opts && opts.shaderModuleProps && opts.shaderModuleProps.shadow;
    if (shadow && shadow.shadowMatrices) this.setShaderModuleProps({ shadow: { ...shadow, shadowColor: [0, 0, 0, 0] } });
  }
}
NoShadowExtension.extensionName = 'NoShadowExtension';

// Switches deck.gl's lighting module off for one layer so a flat colour renders exactly as given
// (`material: false` alone still shades extruded polygons in 9.4.1).
export class UnlitExtension extends deck.LayerExtension {
  draw(opts) {
    const lighting = opts && opts.shaderModuleProps && opts.shaderModuleProps.lighting;
    if (lighting) this.setShaderModuleProps({ lighting: { ...lighting, enabled: false } });
  }
}
UnlitExtension.extensionName = 'UnlitExtension';
