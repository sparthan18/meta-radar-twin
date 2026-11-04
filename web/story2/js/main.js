// RadarTwin FUI lab — phase 1: the close-up still.
// three.js scene of the inner city around Carolabrücke, lit, with the deck
// seated on its piers, bloom on the accent, and an SVG scanner layer.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { drawHud } from "./hud.js";

const Q = new URLSearchParams(location.search);
const num = (k, d) => (Q.has(k) ? Number(Q.get(k)) : d);

// ---------- projection: local metres about the bridge ----------
const C0 = [13.7468, 51.0535];
const KX = Math.cos(C0[1] * Math.PI / 180) * 111320;
const KY = 111320;
const toLocal = ([lon, lat]) => [ (lon - C0[0]) * KX, (lat - C0[1]) * KY ]; // [x east, north]

// ---------- palette ----------
const COL = {
  bg: 0x0a1020, ground: num("gcol", 0x4a4d58), water: num("wcol", 0x0d1a30),
  bldg: 0x7d7f8c, bldgDark: 0x2b3146, edge: 0xc4ccdd,
  roadMajor: 0x8ea3cf, roadMinor: 0x4a5c86, rail: 0x5a6a8a,
  deck: 0x4e525e, deckTop: 0x6a6e7a, pier: 0x3a3e4c, accent: 0xff5a3c, accentDark: 0xa83420
};

// ---------- renderer ----------
const canvas = document.getElementById("gl");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = num("exp", 1.18);
renderer.outputColorSpace = THREE.SRGBColorSpace;
const SHADOW = num("shadow", 2);
renderer.shadowMap.enabled = SHADOW > 0;
renderer.shadowMap.type = SHADOW === 1 ? THREE.BasicShadowMap : SHADOW === 3 ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(COL.bg);
scene.fog = new THREE.FogExp2(0x14203a, num("fog", 0.00115));

const camera = new THREE.PerspectiveCamera(num("fov", 36), innerWidth / innerHeight, 1, 6000);

// ---------- lights ----------
const key = new THREE.DirectionalLight(0xfff1dc, num("key", 4.4));
key.position.set(num("kx", 520), num("ky", 280), num("kz", -120)); // low, from the east-north-east
key.castShadow = true;
key.shadow.mapSize.set(num("smap", 2048), num("smap", 2048));
key.shadow.camera.left = -900; key.shadow.camera.right = 900; key.shadow.camera.top = 900; key.shadow.camera.bottom = -900;
key.shadow.camera.near = 10; key.shadow.camera.far = 2000;
key.shadow.camera.updateProjectionMatrix();
key.shadow.bias = num("sbias", -0.0004); key.shadow.normalBias = num("snb", 0.6); key.shadow.radius = 1.5;
scene.add(key); scene.add(key.target);
const hemi = new THREE.HemisphereLight(0x5a78b0, 0x1a1816, num("hemi", 0.42));
scene.add(hemi);
const rim = new THREE.DirectionalLight(0x6f9cff, num("rim", 0.9));
rim.position.set(-500, 200, -400);
scene.add(rim);

// ---------- ground ----------
{
  const g = new THREE.PlaneGeometry(6000, 6000);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.MeshStandardMaterial({ color: COL.ground, roughness: 1, metalness: 0 });
  const mesh = new THREE.Mesh(g, m);
  mesh.position.y = -0.3; mesh.receiveShadow = true;
  scene.add(mesh);
}

// ---------- survey grid on the ground ----------
{
  const fine = [], coarse = [];
  const R = 1400, step = 50, big = 250;
  for (let v = -R; v <= R; v += step) {
    const arr = (v % big === 0) ? coarse : fine;
    arr.push(v, 0.02, -R, v, 0.02, R, -R, 0.02, v, R, 0.02, v);
  }
  const mk = (arr, opacity) => {
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(arr, 3));
    scene.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xb8c8e8, transparent: true, opacity })));
  };
  mk(fine, num("grid", 0.05)); mk(coarse, num("grid", 0.05) * 2.2);
}

// ---------- helpers ----------
function ringToShape(ring) {
  const s = new THREE.Shape();
  ring.forEach((c, i) => { const [x, n] = toLocal(c); i ? s.lineTo(x, n) : s.moveTo(x, n); });
  return s;
}
function polygonShapes(geom) {
  const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  const out = [];
  for (const rings of polys) {
    if (!rings.length || rings[0].length < 4) continue;
    const s = ringToShape(rings[0]);
    for (let i = 1; i < rings.length; i++) {
      if (rings[i].length < 4) continue;
      const h = new THREE.Path();
      rings[i].forEach((c, j) => { const [x, n] = toLocal(c); j ? h.lineTo(x, n) : h.moveTo(x, n); });
      s.holes.push(h);
    }
    out.push(s);
  }
  return out;
}

// ---------- city ----------
async function buildCity() {
  const city = await (await fetch("../data/city.json")).json();
  // water
  {
    const geos = [];
    for (const f of city.layers.water) for (const s of polygonShapes(f.geometry)) {
      const g = new THREE.ShapeGeometry(s); g.rotateX(-Math.PI / 2); geos.push(g);
    }
    if (geos.length) {
      const m = new THREE.MeshStandardMaterial({ color: COL.water, roughness: num("wrough", 0.7), metalness: num("wmetal", 0.22) });
      const mesh = new THREE.Mesh(mergeGeometries(geos), m);
      mesh.position.y = 0.05; mesh.receiveShadow = true; scene.add(mesh);
    }
  }
  // landuse / parks: a slightly different ground tone
  {
    const geos = [];
    for (const f of [...city.layers.landuse, ...city.layers.park]) {
      const cls = f.properties.class || "";
      if (!/park|grass|garden|cemetery|wood|forest|recreation|pitch|playground/.test(cls)) continue;
      for (const sh of polygonShapes(f.geometry)) { const g = new THREE.ShapeGeometry(sh); g.rotateX(-Math.PI / 2); geos.push(g); }
    }
    if (geos.length) {
      const m = new THREE.MeshStandardMaterial({ color: 0x3f4a44, roughness: 1 });
      const mesh = new THREE.Mesh(mergeGeometries(geos), m); mesh.position.y = -0.1; mesh.receiveShadow = true; scene.add(mesh);
    }
  }
  // buildings
  {
    const geos = [], edges = [];
    const base = new THREE.Color(COL.bldg), dark = new THREE.Color(COL.bldgDark);
    let n = 0;
    for (const f of city.layers.building) {
      const h = Math.min(90, Math.max(5, Number(f.properties.render_height) || 0 || 7));
      const minH = Math.max(0, Number(f.properties.render_min_height) || 0);
      const jitter = 0.9 + 0.2 * ((n * 7919) % 97) / 97; n++;
      for (const s of polygonShapes(f.geometry)) {
        const g = new THREE.ExtrudeGeometry(s, { depth: h - minH, bevelEnabled: false, curveSegments: 2 });
        g.rotateX(-Math.PI / 2);
        if (minH) g.translate(0, minH, 0);
        // fake ambient occlusion: darker toward the ground, per-building luminance jitter
        const pos = g.attributes.position; const col = new Float32Array(pos.count * 3);
        const c = new THREE.Color();
        for (let i = 0; i < pos.count; i++) {
          const t = Math.min(1, Math.max(0, (pos.getY(i) - minH) / Math.max(6, h - minH)));
          c.copy(dark).lerp(base, 0.35 + 0.65 * t).multiplyScalar(jitter);
          col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
        }
        g.setAttribute("color", new THREE.BufferAttribute(col, 3));
        geos.push(g);
        edges.push(new THREE.EdgesGeometry(g, 20));
      }
    }
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0.04 });
    const bmesh = new THREE.Mesh(mergeGeometries(geos), m); bmesh.castShadow = true; bmesh.receiveShadow = true; scene.add(bmesh);
    const em = new THREE.LineBasicMaterial({ color: COL.edge, transparent: true, opacity: num("edge", 0.12) });
    scene.add(new THREE.LineSegments(mergeGeometries(edges), em));
  }
  // contact darkening at building bases (a cheap ambient occlusion on the ground)
  {
    const geos = [];
    for (const f of city.layers.building) for (const sh of polygonShapes(f.geometry)) {
      const g = new THREE.ShapeGeometry(sh); g.rotateX(-Math.PI / 2); g.scale(1.0, 1, 1.0); geos.push(g);
    }
    const m = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: num("contact", 0.0), depthWrite: false });
    if (num("contact", 0.0) > 0) { const mesh = new THREE.Mesh(mergeGeometries(geos), m); mesh.position.y = 0.08; scene.add(mesh); }
  }
  // roads
  {
    const major = [], minor = [], rail = [];
    const push = (arr, coords) => {
      for (let i = 1; i < coords.length; i++) {
        const [x1, n1] = toLocal(coords[i - 1]); const [x2, n2] = toLocal(coords[i]);
        arr.push(x1, 0.35, -n1, x2, 0.35, -n2);
      }
    };
    for (const f of city.layers.transportation) {
      const cls = f.properties.class;
      if (cls === "path") continue;
      const lines = f.geometry.type === "LineString" ? [f.geometry.coordinates]
        : f.geometry.type === "MultiLineString" ? f.geometry.coordinates : [];
      const arr = (cls === "primary" || cls === "secondary" || cls === "tertiary" || cls === "trunk" || cls === "motorway") ? major
        : (cls === "transit" || cls === "rail") ? rail : minor;
      for (const l of lines) push(arr, l);
    }
    const mk = (arr, color, opacity) => {
      if (!arr.length) return;
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(arr, 3));
      scene.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity })));
    };
    mk(major, COL.roadMajor, num("road", 0.85)); mk(minor, COL.roadMinor, num("road", 0.85) * 0.6); mk(rail, COL.rail, 0.35);
  }
  return city;
}

// ---------- the deck ----------
async function buildDeck() {
  const bridges = await (await fetch("../data/bridges.geojson")).json();
  const spansAll = await (await fetch("../data/spans.json")).json();
  const f = bridges.features.find(x => String(x.properties.id) === "4");
  const ring = f.geometry.coordinates[0].map(toLocal);
  // principal axis of the footprint
  const cx = ring.reduce((a, p) => a + p[0], 0) / ring.length, cn = ring.reduce((a, p) => a + p[1], 0) / ring.length;
  let sxx = 0, sxn = 0, snn = 0;
  for (const [x, n] of ring) { sxx += (x - cx) ** 2; sxn += (x - cx) * (n - cn); snn += (n - cn) ** 2; }
  const theta = 0.5 * Math.atan2(2 * sxn, sxx - snn); // axis angle from +x toward +north
  const ax = [Math.cos(theta), Math.sin(theta)], px = [-Math.sin(theta), Math.cos(theta)];
  let minA = 1e9, maxA = -1e9, minP = 1e9, maxP = -1e9;
  for (const [x, n] of ring) {
    const a = (x - cx) * ax[0] + (n - cn) * ax[1], p = (x - cx) * px[0] + (n - cn) * px[1];
    minA = Math.min(minA, a); maxA = Math.max(maxA, a); minP = Math.min(minP, p); maxP = Math.max(maxP, p);
  }
  const lenM = maxA - minA, widthM = num("deckw", 26);
  const spans = (spansAll.spans["4"] || []).slice().sort((a, b) => a.along_m - b.along_m);
  const cutoffs = spansAll.cutoffs; const midx = cutoffs.indexOf("2024-09-01");
  // span boundaries at midpoints of along_m, deck from 0..lenM
  const bounds = [0];
  for (let i = 1; i < spans.length; i++) bounds.push((spans[i - 1].along_m + spans[i].along_m) / 2);
  bounds.push(lenM);
  // orientation: along_m runs from the span-0 end; decide which end of the axis that is
  const s0 = toLocal([spans[0].lon, spans[0].lat]);
  const a0 = (s0[0] - cx) * ax[0] + (s0[1] - cn) * ax[1];
  const dir = a0 < 0 ? 1 : -1; // along_m increases toward +axis if span 0 sits at the negative end
  const group = new THREE.Group();
  const TOP = 12, THICK = 2;
  const vals = spans.map(s => (s.anomaly || [])[midx]);
  let worst = -1, worstAbs = 0;
  vals.forEach((v, i) => { if (v !== null && v !== undefined && Math.abs(v) > worstAbs) { worstAbs = Math.abs(v); worst = i; } });
  const world = (a, p, y) => new THREE.Vector3(cx + a * ax[0] + p * px[0], y, -(cn + a * ax[1] + p * px[1]));
  const yaw = Math.atan2(ax[1], ax[0]); // rotation about Y so box X runs along the axis (north is -z)
  const boxes = [];
  for (let i = 0; i < spans.length; i++) {
    const L = bounds[i + 1] - bounds[i];
    const aMid = minA + (dir > 0 ? (bounds[i] + L / 2) : (lenM - bounds[i] - L / 2));
    const hot = i === worst;
    const g = new THREE.BoxGeometry(L - 0.6, THICK, widthM);
    const side = new THREE.MeshStandardMaterial({
      color: hot ? COL.accentDark : COL.deck, roughness: 0.9, metalness: 0.0,
      emissive: hot ? COL.accent : 0x000000, emissiveIntensity: hot ? num("glow", 0.35) : 0
    });
    const top = new THREE.MeshStandardMaterial({
      color: hot ? COL.accent : COL.deckTop, roughness: 0.92, metalness: 0.0,
      emissive: hot ? COL.accent : 0x000000, emissiveIntensity: hot ? num("glow", 0.35) * 2 : 0
    });
    const m = [side, side, top, side, side, side]; // +x, -x, +y (top), -y, +z, -z
    const mesh = new THREE.Mesh(g, m); mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.position.copy(world(aMid, 0, TOP - THICK / 2));
    mesh.rotation.y = yaw;
    group.add(mesh);
    const eg = new THREE.LineSegments(new THREE.EdgesGeometry(g), new THREE.LineBasicMaterial({ color: hot ? 0xffc8b8 : 0xaebbd8, transparent: true, opacity: hot ? 1.0 : 0.35 }));
    eg.position.copy(mesh.position); eg.rotation.y = yaw; group.add(eg);
    boxes.push({ i, hot, center: mesh.position.clone(), value: vals[i], span: spans[i].span });
  }
  // piers at interior joints
  for (let i = 1; i < bounds.length - 1; i++) {
    const a = minA + (dir > 0 ? bounds[i] : (lenM - bounds[i]));
    const g = new THREE.BoxGeometry(4, TOP - THICK, widthM - 2);
    const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: COL.pier, roughness: 0.9 })); mesh.castShadow = true;
    mesh.position.copy(world(a, 0, (TOP - THICK) / 2)); mesh.rotation.y = yaw;
    group.add(mesh);
  }
  // abutments
  for (const a of [minA, maxA]) {
    const g = new THREE.BoxGeometry(6, TOP - THICK, widthM);
    const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: COL.pier, roughness: 0.9 }));
    mesh.position.copy(world(a, 0, (TOP - THICK) / 2)); mesh.rotation.y = yaw;
    group.add(mesh);
  }
  // the subject lights its surroundings: a warm point light at the worst span, low over the water
  const hotBox = boxes.find(b => b.hot);
  if (hotBox) {
    // a soft additive glow on the water under the span (a radial sprite plane), plus a faint light for the piers
    const cv = document.createElement("canvas"); cv.width = cv.height = 256;
    const ctx = cv.getContext("2d"); const grd = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    grd.addColorStop(0, "rgba(255,90,60,0.55)"); grd.addColorStop(0.35, "rgba(255,90,60,0.22)"); grd.addColorStop(1, "rgba(255,90,60,0)");
    ctx.fillStyle = grd; ctx.fillRect(0, 0, 256, 256);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const gm = new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: num("glowop", 0.8) });
    const gq = new THREE.Mesh(new THREE.PlaneGeometry(num("glowr", 170), num("glowr", 170)), gm);
    gq.rotation.x = -Math.PI / 2; gq.position.set(hotBox.center.x, 0.6, hotBox.center.z); group.add(gq);
    const pl = new THREE.PointLight(COL.accent, num("plight", 700), num("pldist", 120), 2);
    pl.position.copy(hotBox.center).add(new THREE.Vector3(0, -6, 0));
    group.add(pl);
    // scanner footprint: two faint rings on the ground around the span
    for (const [r, op] of [[60, 0.35], [120, 0.18]]) {
      const rg = new THREE.RingGeometry(r - 0.5, r + 0.5, 128); rg.rotateX(-Math.PI / 2);
      const rm = new THREE.MeshBasicMaterial({ color: COL.accent, transparent: true, opacity: op * num("rings", 1), depthWrite: false });
      const ring = new THREE.Mesh(rg, rm); ring.position.set(hotBox.center.x, 0.5, hotBox.center.z); group.add(ring);
    }
  }
  scene.add(group);
  return { center: world((minA + maxA) / 2, 0, TOP), boxes, lenM, widthM, axis: ax, dir, minA, maxA, cx, cn, world, cutoff: cutoffs[midx] };
}

// ---------- camera from URL ----------
function placeCamera(target) {
  const az = num("az", 228) * Math.PI / 180, el = num("el", 26) * Math.PI / 180, d = num("dist", 600);
  camera.position.set(
    target.x + d * Math.cos(el) * Math.sin(az),
    target.y + d * Math.sin(el),
    target.z + d * Math.cos(el) * Math.cos(az)
  );
  camera.lookAt(target.x + num("tx", 60), target.y + num("ty", 0), target.z + num("tz", -40));
  camera.updateProjectionMatrix();
}

// ---------- post ----------
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), num("bloom", 0.55), num("bloomr", 0.35), num("bloomt", 0.9));
composer.addPass(bloom);
composer.addPass(new OutputPass());

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  composer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
}
addEventListener("resize", resize);

// ---------- go ----------
const city = await buildCity();
const deck = await buildDeck();
placeCamera(deck.center);
window.__fui = { scene, camera, renderer, deck, city: city.counts };

function frame() {
  composer.render();
  drawHud({ camera, deck, width: innerWidth, height: innerHeight });
}
frame();
document.documentElement.dataset.ready = "1";
