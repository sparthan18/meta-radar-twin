// Real data for the content beats: decisions per month, bridge names, the memos, the proof, SAM.
export const RISK_COLOR = { high: "#ff5a3c", elevated: "#ff8a4c", watch: "#f2b84b", none: "#8a9ab8", unknown: "#5a6680" };
export const RISK_RGB = { high: [255, 90, 60], elevated: [255, 138, 76], watch: [242, 184, 75], none: [138, 154, 184], unknown: [90, 102, 128] };
export const WORRY = { high: "send an inspector", elevated: "look closer", watch: "keep watching", none: "nothing unusual", unknown: "radar cannot see it" };
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function monthWord(cutoff) {
  const [y, m] = cutoff.split("-").map(Number);
  return { month: MONTHS[m - 1], year: String(y), short: MONTHS[m - 1].slice(0, 3).toUpperCase() };
}

export async function loadStory() {
  const [bridges, decisions, proof, sam, chip, spans] = await Promise.all([
    fetch("../data/bridges.geojson").then(r => r.json()),
    fetch("../data/decisions.json").then(r => r.json()),
    fetch("../data/proof.json").then(r => r.json()),
    fetch("../data/sam.geojson").then(r => r.json()),
    fetch("../data/s2_visual.json").then(r => r.json()),
    fetch("../data/spans.json").then(r => r.json()),
  ]);
  const memos = {};
  for (const c of decisions.memo_cutoffs || []) memos[c] = await fetch(`../data/memos/${c}.md`).then(r => r.text());
  const names = {}; for (const f of bridges.features) names[String(f.properties.id)] = f.properties.name;
  const monitored = {}; for (const f of bridges.features) monitored[String(f.properties.id)] = !!f.properties.monitored;
  const cutoffs = decisions.cutoffs;
  // risk per bridge per cutoff (model risk; not-monitored bridges are "unknown")
  const risk = {};
  for (const c of cutoffs) {
    risk[c] = {};
    for (const id of Object.keys(names)) {
      const row = decisions.decisions[c] && decisions.decisions[c][id];
      risk[c][id] = !monitored[id] ? "unknown" : (row && row.model && row.model.risk) || (row && row.rubric && row.rubric.risk) || "none";
    }
  }
  const counts = {};
  for (const c of cutoffs) {
    const r = Object.values(risk[c]);
    counts[c] = { high: r.filter(x => x === "high").length, elevated: r.filter(x => x === "elevated").length, watch: r.filter(x => x === "watch").length };
  }
  return { bridges, decisions, proof, sam, chip, spans, memos, names, monitored, cutoffs, risk, counts, event: { date: decisions.event_date, asset: decisions.event_asset } };
}

// A one-line headline per month: who is high, else who is elevated, else quiet.
export function headline(story, c) {
  const r = story.risk[c];
  const highs = Object.keys(r).filter(id => r[id] === "high").map(id => story.names[id]);
  const elev = Object.keys(r).filter(id => r[id] === "elevated").map(id => story.names[id]);
  if (highs.length) return { cls: "high", text: `${highs.join(", ")} ${highs.length > 1 ? "need" : "needs"} an inspector` };
  if (elev.length) return { cls: "elevated", text: `${elev.length} ${elev.length > 1 ? "bridges" : "bridge"} worth a closer look` };
  return { cls: "none", text: "Nothing unusual this month" };
}

// Parse the audit memo markdown into the pieces the report panel shows.
export function parseMemo(md) {
  const section = (name) => { const m = md.match(new RegExp(`## ${name}\\s*\\n([\\s\\S]*?)(?=\\n## |$)`)); return m ? m[1].trim() : ""; };
  const verdict = section("Verdict").replace(/\n+/g, " ").trim();
  const actions = [];
  for (const line of section("Action list").split("\n")) {
    const cells = line.split("|").map(s => s.trim()).filter(Boolean);
    if (cells.length >= 4 && cells[0] !== "bridge" && !/^-+$/.test(cells[0])) actions.push({ bridge: cells[0], risk: cells[1], why: cells[2], todo: cells[3] });
  }
  const watch = section("Watch list").split("\n").filter(l => l.startsWith("- ")).map(l => l.slice(2));
  const disagreements = section("Model and rubric").split("\n").filter(l => l.startsWith("- ")).length;
  const notMonitored = section("Not monitored by radar").split("\n").filter(l => l.startsWith("- ")).map(l => l.slice(2));
  return { verdict, actions, watch, disagreements, notMonitored };
}
