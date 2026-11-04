// Reticle glyphs drawn once into a canvas atlas (supersampled 4x) and used as IconLayer masks so the
// colour comes from getColor. `ring` is the 14 px hairline bridge marker; `reticle` is the 24 px
// subject marker for the Europe shot.
export function makeIconAtlas() {
  const S = 4;
  const ring = 14 * S, ret = 24 * S;
  const c = document.createElement('canvas');
  c.width = ring + ret; c.height = ret;
  const g = c.getContext('2d');
  g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineWidth = 1 * S; g.lineCap = 'butt';
  const ticks = (cx, cy, r0, r1) => {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      g.beginPath(); g.moveTo(cx + dx * r0 * S, cy + dy * r0 * S); g.lineTo(cx + dx * r1 * S, cy + dy * r1 * S); g.stroke();
    }
  };
  let cx = ring / 2, cy = ring / 2;
  g.beginPath(); g.arc(cx, cy, 4.5 * S, 0, Math.PI * 2); g.stroke();
  ticks(cx, cy, 5.5, 7);
  cx = ring + ret / 2; cy = ret / 2;
  g.beginPath(); g.arc(cx, cy, 7.5 * S, 0, Math.PI * 2); g.stroke();
  ticks(cx, cy, 9, 12);
  g.beginPath(); g.arc(cx, cy, 1.3 * S, 0, Math.PI * 2); g.fill();
  return {
    url: c.toDataURL(),
    mapping: {
      ring: { x: 0, y: 0, width: ring, height: ring, mask: true },
      reticle: { x: ring, y: 0, width: ret, height: ret, mask: true },
    },
  };
}
