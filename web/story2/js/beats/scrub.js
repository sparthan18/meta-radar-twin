// The scrub line: story mode's only chrome. Play/pause at the left, a hairline with one tick per
// chapter, a playhead, the chapter name on hover, the elapsed time at the right.
export function createScrub({ beats, onSeek, onToggle, getTime, getDuration, getLabels, onSeekTime = null, onScrubStart = () => {}, onScrubEnd = () => {} }) {
  const root = document.getElementById("scrub");
  root.innerHTML = `
    <button class="pp" type="button" aria-label="Play or pause"><span class="ico"></span></button>
    <div class="line"><div class="fill"></div><div class="head"></div><div class="ticks"></div><div class="name"></div></div>
    <div class="time">00:00</div>`;
  const pp = root.querySelector(".pp"), line = root.querySelector(".line"), fill = root.querySelector(".fill"), head = root.querySelector(".head"), ticks = root.querySelector(".ticks"), name = root.querySelector(".name"), time = root.querySelector(".time");
  pp.addEventListener("click", onToggle);
  let built = false;
  function buildTicks() {
    const labels = getLabels(), D = getDuration();
    if (!labels || !Object.keys(labels).length) return;
    ticks.innerHTML = "";
    for (const b of beats) {
      const t = labels[b.id]; if (t === undefined) continue;
      const el = document.createElement("button"); el.type = "button"; el.className = "tick"; el.style.left = `${(t / D) * 100}%`; el.dataset.id = b.id; el.setAttribute("aria-label", b.title);
      el.addEventListener("click", () => onSeek(b.id));
      el.addEventListener("mouseenter", () => { name.textContent = b.title.toUpperCase(); name.style.left = el.style.left; name.classList.add("on"); });
      el.addEventListener("mouseleave", () => name.classList.remove("on"));
      ticks.appendChild(el);
    }
    built = true;
  }
  // the hairline seeks to the exact second under the pointer, with a drag; the ticks still jump to chapters
  const fmt = t => { const s = Math.floor(t); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };
  const timeAt = (clientX) => { const D = getDuration(), r = line.getBoundingClientRect(); return Math.max(0, Math.min(D, ((clientX - r.left) / r.width) * D)); };
  const posAt = (clientX) => { const r = line.getBoundingClientRect(); return `${Math.max(0, Math.min(r.width, clientX - r.left))}px`; };
  let dragging = false;
  line.addEventListener("pointerdown", e => {
    if (e.target.classList.contains("tick")) return;
    if (!onSeekTime) { const labels = getLabels(), t = timeAt(e.clientX); let best = beats[0].id; for (const b of beats) if (labels[b.id] !== undefined && labels[b.id] <= t) best = b.id; onSeek(best); return; }
    dragging = true; line.setPointerCapture(e.pointerId); onScrubStart(); onSeekTime(timeAt(e.clientX));
  });
  line.addEventListener("pointermove", e => {
    if (dragging) { onSeekTime(timeAt(e.clientX)); name.textContent = fmt(timeAt(e.clientX)); name.style.left = posAt(e.clientX); name.classList.add("on"); return; }
    if (e.target.classList.contains("tick")) return;
    name.textContent = fmt(timeAt(e.clientX)); name.style.left = posAt(e.clientX); name.classList.add("on");
  });
  const endDrag = e => { if (!dragging) return; dragging = false; onScrubEnd(); };
  line.addEventListener("pointerup", endDrag); line.addEventListener("pointercancel", endDrag);
  line.addEventListener("pointerleave", () => { if (!dragging) name.classList.remove("on"); });
  function tick() {
    if (!built) buildTicks();
    const D = getDuration(), t = getTime();
    const f = D ? Math.min(1, t / D) : 0;
    fill.style.width = `${f * 100}%`; head.style.left = `${f * 100}%`;
    const s = Math.floor(t); time.textContent = `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
    requestAnimationFrame(tick);
  }
  tick();
  return {
    show(on) { root.classList.toggle("on", on); },
    setPlaying(p) { pp.classList.toggle("paused", !p); },
  };
}
