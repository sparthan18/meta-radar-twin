// The close-up renderer (three.js): the inner city around Carolabrücke, lit, with the deck
// seated on its piers, the subject's glow on the water, bloom on the accent, and the SVG
// scanner layer. Exposes show/hide/setPose/render so the director can cut to it.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { drawHud, clearHud } from "./hud.js";
import { WIDTH_M, DECK_TOP_M, GIRDER_DEPTH_M } from "./wide/carola.js";

const Q = new URLSearchParams(location.search);
const num = (k, d) => (Q.has(k) ? Number(Q.get(k)) : d);

// ---------- projection: local metres about the bridge ----------
const C0 = [13.7468, 51.0535];
const KX = Math.cos(C0[1] * Math.PI / 180) * 111320;
const KY = 111320;
const toLocal = ([lon, lat]) => [(lon - C0[0]) * KX, (lat - C0[1]) * KY]; // [x east, north]

const COL = {
  bg: 0x0a1020, ground: 0x4a4d58, water: 0x0d1a30,
  bldg: 0x7d7f8c, bldgDark: 0x2b3146, edge: 0xc4ccdd,
  roadMajor: 0x8ea3cf, roadMinor: 0x4a5c86, rail: 0x5a6a8a,
  deck: 0x4e525e, deckTop: 0x6a6e7a, pier: 0x3a3e4c, accent: 0xff5a3c, accentDark: 0xa83420
};

export const CLOSEUP_POSE = { az: 228, el: 26, dist: 600, tx: 60, tz: -40 };

export async function createCloseup(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = num("exp", 1.18);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COL.bg);
  scene.fog = new THREE.FogExp2(0x14203a, num("fog", 0.00115));
  const camera = new THREE.PerspectiveCamera(num("fov", 36), innerWidth / innerHeight, 1, 6000);

  // lights
  const key = new THREE.DirectionalLight(0xfff1dc, num("key", 4.4));
  key.position.set(520, 280, -120);
  key.castShadow = true;
  key.shadow.mapSize.set(num("smap", 4096), num("smap", 4096));
  key.shadow.camera.left = -900; key.shadow.camera.right = 900; key.shadow.camera.top = 900; key.shadow.camera.bottom = -900;
  key.shadow.camera.near = 10; key.shadow.camera.far = 2000;
  key.shadow.camera.updateProjectionMatrix();
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.6; key.shadow.radius = 1.5;
  scene.add(key); scene.add(key.target);
  scene.add(new THREE.HemisphereLight(0x5a78b0, 0x1a1816, num("hemi", 0.42)));
  const rim = new THREE.DirectionalLight(0x6f9cff, num("rim", 0.9));
  rim.position.set(-500, 200, -400);
  scene.add(rim);

  // ground
  {
    const g = new THREE.PlaneGeometry(6000, 6000); g.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: COL.ground, roughness: 1, metalness: 0 }));
    mesh.position.y = -0.3; mesh.receiveShadow = true; scene.add(mesh);
  }
  // survey grid
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
    mk(fine, 0.05); mk(coarse, 0.11);
  }

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

  const city = await (await fetch("../data/city.json")).json();
  // water
  {
    const geos = [];
    for (const f of city.layers.water) for (const s of polygonShapes(f.geometry)) { const g = new THREE.ShapeGeometry(s); g.rotateX(-Math.PI / 2); geos.push(g); }
    if (geos.length) {
      const mesh = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshStandardMaterial({ color: COL.water, roughness: 0.7, metalness: 0.22 }));
      mesh.position.y = 0.05; mesh.receiveShadow = true; scene.add(mesh);
    }
  }
  // parks
  {
    const geos = [];
    for (const f of [...city.layers.landuse, ...city.layers.park]) {
      if (!/park|grass|garden|cemetery|wood|forest|recreation|pitch|playground/.test(f.properties.class || "")) continue;
      for (const sh of polygonShapes(f.geometry)) { const g = new THREE.ShapeGeometry(sh); g.rotateX(-Math.PI / 2); geos.push(g); }
    }
    if (geos.length) {
      const mesh = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshStandardMaterial({ color: 0x3f4a44, roughness: 1 }));
      mesh.position.y = -0.1; mesh.receiveShadow = true; scene.add(mesh);
    }
  }
  // buildings
  {
    const geos = [], edges = [];
    const base = new THREE.Color(COL.bldg), dark = new THREE.Color(COL.bldgDark);
    let n = 0;
    for (const f of city.layers.building) {
      const h = Math.min(90, Math.max(5, Number(f.properties.render_height) || 7));
      const minH = Math.max(0, Number(f.properties.render_min_height) || 0);
      const jitter = 0.9 + 0.2 * ((n * 7919) % 97) / 97; n++;
      for (const s of polygonShapes(f.geometry)) {
        const g = new THREE.ExtrudeGeometry(s, { depth: h - minH, bevelEnabled: false, curveSegments: 2 });
        g.rotateX(-Math.PI / 2);
        if (minH) g.translate(0, minH, 0);
        const pos = g.attributes.position; const col = new Float32Array(pos.count * 3);
        const c = new THREE.Color();
        for (let i = 0; i < pos.count; i++) {
          const t = Math.min(1, Math.max(0, (pos.getY(i) - minH) / Math.max(6, h - minH)));
          c.copy(dark).lerp(base, 0.35 + 0.65 * t).multiplyScalar(jitter);
          col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
        }
        g.setAttribute("color", new THREE.BufferAttribute(col, 3));
        geos.push(g); edges.push(new THREE.EdgesGeometry(g, 20));
      }
    }
    const bmesh = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0.04 }));
    bmesh.castShadow = true; bmesh.receiveShadow = true; scene.add(bmesh);
    scene.add(new THREE.LineSegments(mergeGeometries(edges), new THREE.LineBasicMaterial({ color: COL.edge, transparent: true, opacity: 0.12 })));
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
      const lines = f.geometry.type === "LineString" ? [f.geometry.coordinates] : f.geometry.type === "MultiLineString" ? f.geometry.coordinates : [];
      const arr = /^(primary|secondary|tertiary|trunk|motorway)$/.test(cls) ? major : /^(transit|rail)$/.test(cls) ? rail : minor;
      for (const l of lines) push(arr, l);
    }
    const mk = (arr, color, opacity) => {
      if (!arr.length) return;
      const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(arr, 3));
      scene.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity })));
    };
    mk(major, COL.roadMajor, 0.85); mk(minor, COL.roadMinor, 0.51); mk(rail, COL.rail, 0.35);
  }

  // ---------- the deck ----------
  const bridges = await (await fetch("../data/bridges.geojson")).json();
  const spansAll = await (await fetch("../data/spans.json")).json();
  const f = bridges.features.find(x => String(x.properties.id) === "4");
  const ring = f.geometry.coordinates[0].map(toLocal);
  const cx = ring.reduce((a, p) => a + p[0], 0) / ring.length, cn = ring.reduce((a, p) => a + p[1], 0) / ring.length;
  let sxx = 0, sxn = 0, snn = 0;
  for (const [x, n] of ring) { sxx += (x - cx) ** 2; sxn += (x - cx) * (n - cn); snn += (n - cn) ** 2; }
  const theta = 0.5 * Math.atan2(2 * sxn, sxx - snn);
  const ax = [Math.cos(theta), Math.sin(theta)], px = [-Math.sin(theta), Math.cos(theta)];
  let minA = 1e9, maxA = -1e9;
  for (const [x, n] of ring) { const a = (x - cx) * ax[0] + (n - cn) * ax[1]; minA = Math.min(minA, a); maxA = Math.max(maxA, a); }
  const lenM = maxA - minA, widthM = WIDTH_M;
  const spans = (spansAll.spans["4"] || []).slice().sort((a, b) => a.along_m - b.along_m);
  const cutoffs = spansAll.cutoffs; const midx = cutoffs.indexOf("2024-09-01");
  const bounds = [0];
  for (let i = 1; i < spans.length; i++) bounds.push((spans[i - 1].along_m + spans[i].along_m) / 2);
  bounds.push(lenM);
  const s0 = toLocal([spans[0].lon, spans[0].lat]);
  const dir = ((s0[0] - cx) * ax[0] + (s0[1] - cn) * ax[1]) < 0 ? 1 : -1;
  const group = new THREE.Group();
  const TOP = DECK_TOP_M, THICK = GIRDER_DEPTH_M;
  const vals = spans.map(s => (s.anomaly || [])[midx]);
  let worst = -1, worstAbs = 0;
  vals.forEach((v, i) => { if (v !== null && v !== undefined && Math.abs(v) > worstAbs) { worstAbs = Math.abs(v); worst = i; } });
  const world = (a, p, y) => new THREE.Vector3(cx + a * ax[0] + p * px[0], y, -(cn + a * ax[1] + p * px[1]));
  const yaw = Math.atan2(ax[1], ax[0]);
  const boxes = [];
  for (let i = 0; i < spans.length; i++) {
    const L = bounds[i + 1] - bounds[i];
    const aMid = minA + (dir > 0 ? (bounds[i] + L / 2) : (lenM - bounds[i] - L / 2));
    const hot = i === worst;
    const g = new THREE.BoxGeometry(L - 0.6, THICK, widthM);
    const side = new THREE.MeshStandardMaterial({ color: hot ? COL.accentDark : COL.deck, roughness: 0.9, metalness: 0, emissive: hot ? COL.accent : 0x000000, emissiveIntensity: hot ? 0.35 : 0 });
    const top = new THREE.MeshStandardMaterial({ color: hot ? COL.accent : COL.deckTop, roughness: 0.92, metalness: 0, emissive: hot ? COL.accent : 0x000000, emissiveIntensity: hot ? 0.7 : 0 });
    const mesh = new THREE.Mesh(g, [side, side, top, side, side, side]); mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.position.copy(world(aMid, 0, TOP - THICK / 2)); mesh.rotation.y = yaw; group.add(mesh);
    const eg = new THREE.LineSegments(new THREE.EdgesGeometry(g), new THREE.LineBasicMaterial({ color: hot ? 0xffc8b8 : 0xaebbd8, transparent: true, opacity: hot ? 1.0 : 0.35 }));
    eg.position.copy(mesh.position); eg.rotation.y = yaw; group.add(eg);
    boxes.push({ i, hot, center: mesh.position.clone(), value: vals[i], span: spans[i].span });
  }
  for (let i = 1; i < bounds.length - 1; i++) {
    const a = minA + (dir > 0 ? bounds[i] : (lenM - bounds[i]));
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(4, TOP - THICK, widthM - 2), new THREE.MeshStandardMaterial({ color: COL.pier, roughness: 0.9 }));
    mesh.castShadow = true; mesh.position.copy(world(a, 0, (TOP - THICK) / 2)); mesh.rotation.y = yaw; group.add(mesh);
  }
  for (const a of [minA, maxA]) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(6, TOP - THICK, widthM), new THREE.MeshStandardMaterial({ color: COL.pier, roughness: 0.9 }));
    mesh.position.copy(world(a, 0, (TOP - THICK) / 2)); mesh.rotation.y = yaw; group.add(mesh);
  }
  const hotBox = boxes.find(b => b.hot);
  const glowMats = [];
  if (hotBox) {
    const cv = document.createElement("canvas"); cv.width = cv.height = 256;
    const ctx = cv.getContext("2d"); const grd = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    grd.addColorStop(0, "rgba(255,90,60,0.55)"); grd.addColorStop(0.35, "rgba(255,90,60,0.22)"); grd.addColorStop(1, "rgba(255,90,60,0)");
    ctx.fillStyle = grd; ctx.fillRect(0, 0, 256, 256);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const gm = new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.8 });
    const gq = new THREE.Mesh(new THREE.PlaneGeometry(170, 170), gm);
    gq.rotation.x = -Math.PI / 2; gq.position.set(hotBox.center.x, 0.6, hotBox.center.z); group.add(gq); glowMats.push(gm);
    const pl = new THREE.PointLight(COL.accent, 700, 120, 2);
    pl.position.copy(hotBox.center).add(new THREE.Vector3(0, -6, 0)); group.add(pl);
    for (const [r, op] of [[60, 0.35], [120, 0.18]]) {
      const rg = new THREE.RingGeometry(r - 0.5, r + 0.5, 128); rg.rotateX(-Math.PI / 2);
      const rm = new THREE.MeshBasicMaterial({ color: COL.accent, transparent: true, opacity: op, depthWrite: false });
      const m = new THREE.Mesh(rg, rm); m.position.set(hotBox.center.x, 0.5, hotBox.center.z); group.add(m); glowMats.push(rm);
    }
  }
  scene.add(group);
  const deck = { center: world((minA + maxA) / 2, 0, TOP), boxes, lenM, widthM, minA, maxA, world, cutoff: cutoffs[midx] };

  // ---------- camera / post ----------
  const pose = { ...CLOSEUP_POSE };
  function applyPose() {
    const t = deck.center;
    const az = pose.az * Math.PI / 180, el = pose.el * Math.PI / 180, d = pose.dist;
    camera.position.set(t.x + d * Math.cos(el) * Math.sin(az), t.y + d * Math.sin(el), t.z + d * Math.cos(el) * Math.cos(az));
    camera.lookAt(t.x + pose.tx, t.y, t.z + pose.tz);
    camera.updateProjectionMatrix();
  }
  applyPose();
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.35, 0.9));
  composer.addPass(new OutputPass());

  function resize() {
    renderer.setSize(innerWidth, innerHeight, false);
    composer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  }
  addEventListener("resize", resize);

  let hudOn = false;
  return {
    scene, camera, renderer, deck, pose,
    show() { canvas.style.display = "block"; },
    hide() { canvas.style.display = "none"; clearHud(); },
    setPose(p) { Object.assign(pose, p); applyPose(); },
    setHud(on) { hudOn = on; if (!on) clearHud(); },
    render() { composer.render(); if (hudOn) drawHud({ camera, deck, width: innerWidth, height: innerHeight }); },
  };
}
