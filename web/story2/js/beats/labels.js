// Scene 3, twenty bridges: bracketed name labels beside each ring on the city shot, placed with a
// collision rule (a label that would overlap a placed one or the lower-third band is dropped),
// positioned every frame from the live map.
export function createBridgeLabels(story, wide, container) {
  const feats = story.bridges.features;
  const centre = f => { const g = f.geometry; const ring = g.type === "Polygon" ? g.coordinates[0] : g.coordinates[0][0]; let x = 0, y = 0; for (const [a, b] of ring) { x += a; y += b; } return [x / ring.length, y / ring.length]; };
  container.innerHTML = "";
  const nodes = feats.map(f => {
    const el = document.createElement("div");
    el.className = "blbl" + (String(f.properties.id) === "4" ? " accent" : "") + (f.properties.monitored ? "" : " dim");
    el.innerHTML = `<span class="br">[</span>${f.properties.name.toUpperCase()}<span class="br">]</span>`;
    el.style.opacity = 0; container.appendChild(el);
    return { f, el, ll: centre(f), id: String(f.properties.id) };
  });
  let revealed = 0;
  function layout() {
    const W = innerWidth, H = innerHeight, band = H * 0.92 - 70;
    const placed = [];
    // subject first, then monitored, then the rest
    const order = nodes.slice().sort((a, b) => (a.id === "4" ? -1 : b.id === "4" ? 1 : 0));
    for (const n of order) {
      const p = wide.project(n.ll);
      const w = n.el.offsetWidth || 120, h = 14;
      // try right of the ring, then left, then above
      const tries = [[p[0] + 12, p[1] - h / 2], [p[0] - 12 - w, p[1] - h / 2], [p[0] - w / 2, p[1] - 22]];
      let box = null;
      for (const [x, y] of tries) {
        const b = { x, y, w, h };
        if (b.x < 16 || b.x + b.w > W - 16 || b.y < H * 0.08 + 40 || b.y + b.h > band) continue;
        if (placed.some(q => !(b.x + b.w + 6 < q.x || q.x + q.w + 6 < b.x || b.y + b.h + 4 < q.y || q.y + q.h + 4 < b.y))) continue;
        box = b; break;
      }
      if (!box) { n.el.style.visibility = "hidden"; continue; }
      placed.push(box);
      n.el.style.visibility = ""; n.el.style.left = `${box.x}px`; n.el.style.top = `${box.y}px`;
    }
  }
  let raf = null;
  const tick = () => { layout(); raf = requestAnimationFrame(tick); };
  return {
    show(on) { container.style.display = on ? "block" : "none"; if (on && !raf) tick(); if (!on && raf) { cancelAnimationFrame(raf); raf = null; } },
    reveal(k) { // reveal the first k labels in order of the data, staggered by the director
      const order = nodes.slice().sort((a, b) => (a.id === "4" ? 1 : b.id === "4" ? -1 : 0)); // subject last
      order.forEach((n, i) => { n.el.style.opacity = i < k ? 1 : 0; });
      revealed = k;
    },
    count: nodes.length,
  };
}
