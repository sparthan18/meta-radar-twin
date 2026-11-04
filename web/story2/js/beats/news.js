// The news layer of chapter 1: the photograph taken on the day, as a card under the callout's rule,
// and a ticker along the bottom of the picture. The ticker's scroll is a function of story time, so
// it scrubs with the timeline instead of running on a clock of its own.
const PHOTO = { src: "img/carola-20240911.jpg", credit: ["11 SEP 2024 · 14:21 · PHOTO: SCALARAN", "CC0 · WIKIMEDIA COMMONS"] };
const TICKER = "CAROLABRÜCKE PARTIALLY COLLAPSED INTO THE ELBE  ·  DRESDEN  ·  11 SEP 2024  ·  03:00  ·  NO ONE INJURED  ·  TRAM LINE AND ROAD CLOSED  ·  ";
const SPEED = 60; // px per second

export function createNews(root, stack) {
  root.innerHTML = "";
  const photo = document.createElement("div"); photo.className = "nw-photo";
  const img = document.createElement("img"); img.src = PHOTO.src; img.alt = "The Carolabrücke on 11 September 2024, strand C lying in the Elbe";
  const credit = document.createElement("div"); credit.className = "nw-credit"; credit.innerHTML = PHOTO.credit.map(l => `<span>${l}</span>`).join("<br>");
  photo.appendChild(img); photo.appendChild(credit);
  stack.appendChild(photo);
  const ticker = document.createElement("div"); ticker.className = "nw-ticker";
  const chip = document.createElement("div"); chip.className = "nw-chip"; chip.textContent = "BREAKING";
  const track = document.createElement("div"); track.className = "nw-track";
  const run = document.createElement("span"); run.className = "nw-run"; run.textContent = TICKER + TICKER;
  track.appendChild(run); ticker.appendChild(chip); ticker.appendChild(track); root.appendChild(ticker);
  let t0 = null, loopW = 0;
  const api = {
    reset() { photo.style.opacity = 0; photo.style.transform = "translateY(-10px)"; ticker.style.opacity = 0; t0 = null; },
    // the card drops in under the rule
    photoIn() { return gsap.to(photo, { opacity: 1, y: 0, duration: 0.4, ease: "power3.out" }); },
    tickerIn(atStoryTime) { t0 = atStoryTime; loopW = run.scrollWidth / 2 || 1; return gsap.to(ticker, { opacity: 1, duration: 0.25 }); },
    setTime(t) { if (t0 === null) return; const x = ((t - t0) * SPEED) % loopW; run.style.transform = `translateX(${-x}px)`; },
    exit() { const tl = gsap.timeline(); tl.to(ticker, { opacity: 0, duration: 0.15 }, 0); tl.to(photo, { opacity: 0, y: -6, duration: 0.24 }, 0.06); return tl; },
    // the layer's state at a moment: the card on or off, the ticker running from a given story time
    instant({ photo: photoOn = false, tickerT0 = null } = {}) {
      gsap.killTweensOf([photo, ticker]);
      photo.style.opacity = photoOn ? 1 : 0; photo.style.transform = "translateY(0)";
      t0 = tickerT0; if (t0 !== null) loopW = run.scrollWidth / 2 || 1; ticker.style.opacity = t0 !== null ? 1 : 0;
    },
    show(on) { root.style.display = on ? "block" : "none"; photo.style.display = on ? "block" : "none"; const st = root.closest("#stage"); if (st) st.classList.toggle("news", !!on); if (!on) api.reset(); },
  };
  api.reset(); api.show(false);
  return api;
}
