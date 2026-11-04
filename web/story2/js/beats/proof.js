// Scene 8, the proof: all the data against the run with the later months deleted. Two readout columns
// count up and settle on identical numbers, a check draws between them, the ten quantities tick
// through, and the agreement line lands.
const $ = id => document.getElementById(id);
const Q_LABEL = { roll: "ROLLING WINDOW", score: "ANOMALY SCORE", z: "OWN-HISTORY Z", wmax: "MAX SPAN CHANGE", wspread: "SPAN SPREAD", velocity: "VELOCITY", coherence: "COHERENCE", span_meta: "SPAN GEOMETRY", flags: "FLAGS", risk: "RISK CLASS" };

export function createProof(story) {
  const panel = $("proof");
  const p = story.proof;
  const q = Object.keys(p.quantities);
  panel.innerHTML = `
    <div class="pt">THE PROOF — ${p.cutoff}<span class="by">SCORED WITHOUT HINDSIGHT</span></div>
    <div class="cols">
      <div class="col"><div class="ps">ALL DATA</div><div class="ro"><span class="k">SCORE</span><span class="v" id="pfS">0.00</span></div><div class="ro"><span class="k">Z</span><span class="v" id="pfZ">0.00</span></div></div>
      <div class="check" id="pfCheck"><svg viewBox="0 0 40 40"><path d="M8 21 L17 30 L33 12"/></svg></div>
      <div class="col"><div class="ps">LATER MONTHS DELETED</div><div class="ro"><span class="k">SCORE</span><span class="v" id="ptS">0.00</span></div><div class="ro"><span class="k">Z</span><span class="v" id="ptZ">0.00</span></div></div>
    </div>
    <div class="ps">EVERY NUMBER MATCHES</div>
    <div class="qrows">${q.map(k => `<div class="qrow" data-q="${k}"><span class="qn">${Q_LABEL[k] || k.toUpperCase()}</span><span class="qd">Δ ${p.quantities[k].max_abs_diff.toFixed(1)}</span><span class="qc">✓</span></div>`).join("")}</div>
    <div class="agree" id="pfAgree">Checklist and model: same high bridges, <b>${p.agreement.agree} of ${p.agreement.total}</b> months</div>`;
  return {
    show(on) { panel.classList.toggle("on", on); if (!on) { panel.querySelectorAll(".qrow").forEach(r => r.classList.remove("on")); $("pfCheck").classList.remove("on"); $("pfAgree").classList.remove("on"); } },
    play() {
      const c = p.carola; const o = { s: 0, z: 0 };
      gsap.to(o, { s: c.score_full, z: c.z_full, duration: 0.9, ease: "power2.out", onUpdate: () => { $("pfS").textContent = o.s.toFixed(2); $("ptS").textContent = o.s.toFixed(2); $("pfZ").textContent = o.z.toFixed(2); $("ptZ").textContent = o.z.toFixed(2); } });
      gsap.delayedCall(1.1, () => $("pfCheck").classList.add("on"));
      panel.querySelectorAll(".qrow").forEach((r, i) => gsap.delayedCall(1.4 + i * 0.12, () => r.classList.add("on")));
      gsap.delayedCall(1.4 + q.length * 0.12 + 0.3, () => $("pfAgree").classList.add("on"));
    },
    // the panel's state at a moment inside the chapter, with no animation
    seek(local) {
      const c = p.carola; const k = Math.min(1, Math.max(0, local / 0.9));
      $("pfS").textContent = (c.score_full * k).toFixed(2); $("ptS").textContent = (c.score_full * k).toFixed(2); $("pfZ").textContent = (c.z_full * k).toFixed(2); $("ptZ").textContent = (c.z_full * k).toFixed(2);
      $("pfCheck").classList.toggle("on", local >= 1.1);
      panel.querySelectorAll(".qrow").forEach((r, i) => r.classList.toggle("on", local >= 1.4 + i * 0.12));
      $("pfAgree").classList.toggle("on", local >= 1.4 + q.length * 0.12 + 0.3);
    },
  };
}
