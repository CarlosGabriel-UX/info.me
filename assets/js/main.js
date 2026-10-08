import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { ACTIVE as P, ACTIVE_UNIVERSE as U, shipUrl, viaHash } from "./universes.js";
import { style3d, STAR_TEX } from "./estilos-3d.js";
import { STYLES, findStyle, normalizeStyle } from "./estilos.js";

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const esc = (v) =>
  String(v).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
let seed = 1;
const rand = () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

// ---------------------------------------------------------------------------
// Textos e lista acessível
// ---------------------------------------------------------------------------
const catById = Object.fromEntries(P.categories.map((c) => [c.id, c]));
$("summary").textContent = P.summary;
$("footName").textContent = P.fullName;
if (P.linkedin) $("linkedin").href = P.linkedin;
else $("footLi").hidden = true;
// Universo de exemplo (multiverso): marca como fictício e esconde o que é só do Carlos (CV, LinkedIn)
if (U.demo) {
  document.documentElement.classList.add("demo-universe");
  document.title = `${P.name} (exemplo) · info.me multiverso`;
  document.querySelectorAll("[data-real]").forEach((el) => (el.hidden = true));
  $("demoBadge").hidden = false;
}
// Universo da própria pessoa (criar.html): sem o currículo do Carlos, com atalho para editar
if (U.mine) {
  document.documentElement.classList.add("mine-universe");
  document.title = `${P.name} · meu universo · info.me`;
  document.querySelectorAll("[data-real]").forEach((el) => (el.hidden = true));
  document.querySelectorAll("[data-criar]").forEach((a) => (a.textContent = a.classList.contains("btn") ? "Editar meu universo ✎" : "Editar meu universo"));
  $("mineBadge").hidden = false;
}
// Botões que levam à nave: quem veio de outro universo volta para perto dele
document.querySelectorAll("[data-nave]").forEach((a) => (a.href = shipUrl(U)));
if (viaHash) document.querySelectorAll("[data-nave-label]").forEach((a) => (a.textContent = "Voltar à nave ✦"));
// trocar o #u=... na barra de endereço troca de universo
window.addEventListener("hashchange", () => window.location.reload());

const card = (n) => {
  const c = catById[n.category].color;
  const meta = [n.detail, n.status].filter(Boolean).map(esc).join(" · ");
  return `<li style="--c:${c}"><strong>${esc(n.label)}</strong>${meta ? `<span>${meta}</span>` : ""}</li>`;
};
$("eduList").innerHTML = P.nodes.filter((n) => n.category === "formacao").map(card).join("");
$("certList").innerHTML = P.nodes.filter((n) => n.category === "certs").map(card).join("");
$("skillGroups").innerHTML = P.categories
  .filter((c) => c.id !== "formacao" && c.id !== "certs")
  .map((c) => {
    const items = P.nodes.filter((n) => n.category === c.id);
    return `<div class="skill-group"><h4 style="color:${c.color}">${esc(c.label)}</h4><ul class="chips">${items
      .map((n) => `<li>${esc(n.label)}${n.status ? ` <small style="color:#9ca3af">(${esc(n.status)})</small>` : ""}</li>`)
      .join("")}</ul></div>`;
  })
  .join("");
$("searchList").innerHTML = P.nodes.map((n) => `<option value="${esc(n.label)}"></option>`).join("");

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------
const canvas = $("gl");
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
} catch (e) {
  $("fallback").hidden = false;
  throw e;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setClearColor(0x000000, 1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const labelRenderer = new CSS2DRenderer({ element: $("labels") });

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x000000, 5, 14);
const camera = new THREE.PerspectiveCamera(45, 1, 0.005, 200);

// Pós-processamento em HDR com MSAA: bloom nas telas, LEDs e neurônios,
// depois um passe "de cinema" (aberração cromática, grão, vinheta, distorção no mergulho)
const composer = new EffectComposer(
  renderer,
  new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 })
);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.55, 0.5, 0.55);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const cinema = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uAberr: { value: 0.0015 },
    uWarp: { value: 0 },
    uGrain: { value: 0.045 },
    uVignette: { value: 0.35 },
    uRes: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uTime, uAberr, uWarp, uGrain, uVignette;
    uniform vec2 uRes;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 c = vUv - 0.5;
      float r2 = dot(c, c);
      // distorção de lente (fica forte no mergulho para dentro da cabeça)
      vec2 uv = 0.5 + c * (1.0 - uWarp * r2 * 1.6);
      vec2 dir = c * (uAberr + uWarp * 0.02) * (0.4 + r2 * 3.0);
      vec3 col;
      col.r = texture2D(tDiffuse, uv + dir).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - dir).b;
      // grão de filme, que não pisca rápido demais
      float g = hash(floor(vUv * uRes) + floor(uTime * 24.0)) - 0.5;
      col += g * uGrain * (0.6 + 0.4 * (1.0 - dot(col, vec3(0.333))));
      // vinheta
      col *= 1.0 - uVignette * smoothstep(0.15, 0.75, r2 * 2.0);
      gl_FragColor = vec4(col, 1.0);
    }`,
});
composer.addPass(cinema);

// ---------------------------------------------------------------------------
// Texturas geradas
// ---------------------------------------------------------------------------
function radialTexture(size, stops) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  const h = size / 2;
  const r = g.createRadialGradient(h, h, 0, h, h, h);
  stops.forEach(([o, a]) => r.addColorStop(o, `rgba(255,255,255,${a})`));
  g.fillStyle = r;
  g.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}
const GLOW = radialTexture(128, [
  [0, 1],
  [0.2, 0.6],
  [0.5, 0.12],
  [1, 0],
]);
const DOT = radialTexture(32, [
  [0, 1],
  [0.4, 0.5],
  [1, 0],
]);

// ---------------------------------------------------------------------------
// Mente: o mapa (núcleo, regiões, neurônios) dentro de um "estilo" (cérebro, sistema solar, céu, placa...)
// O estilo (estilos-3d.js) decide as posições, o cenário em volta e o desenho das conexões.
// ---------------------------------------------------------------------------
// centro da mente; a câmera começa lá dentro, logo depois do zoom no terminal
const HEAD = new THREE.Vector3(0, 0, 0);
const mind = new THREE.Group();
mind.position.copy(HEAD);
scene.add(mind);

function randomDir() {
  const z = rand() * 2 - 1;
  const a = rand() * Math.PI * 2;
  const r = Math.sqrt(1 - z * z);
  return new THREE.Vector3(r * Math.cos(a), z, r * Math.sin(a));
}
seed = 1234;

// Nebulosa e poeira estelar ao fundo do mapa
const nebulaU = {
  uTime: { value: 0 },
  uOpacity: { value: 0 },
  uN1: { value: new THREE.Color() },
  uN2: { value: new THREE.Color() },
  uN3: { value: new THREE.Color() },
};
const nebula = new THREE.Mesh(
  new THREE.SphereGeometry(60, 48, 32),
  new THREE.ShaderMaterial({
    uniforms: nebulaU,
    vertexShader: `
      varying vec3 vDir;
      void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform float uTime, uOpacity;
      uniform vec3 uN1, uN2, uN3;
      varying vec3 vDir;
      float h(vec3 p) { return fract(sin(dot(p, vec3(17.1, 113.7, 71.3))) * 43758.5453); }
      float n(vec3 p) {
        vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(h(i), h(i + vec3(1,0,0)), f.x), mix(h(i + vec3(0,1,0)), h(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(h(i + vec3(0,0,1)), h(i + vec3(1,0,1)), f.x), mix(h(i + vec3(0,1,1)), h(i + vec3(1,1,1)), f.x), f.y), f.z);
      }
      float fbm(vec3 p) { float v = 0.0, a = 0.5; for (int k = 0; k < 5; k++) { v += a * n(p); p *= 2.03; a *= 0.5; } return v; }
      void main() {
        vec3 d = vDir * 2.2 + vec3(0.0, 0.0, uTime * 0.01);
        float q = fbm(d + fbm(d * 1.7));
        float cloud = smoothstep(0.45, 0.95, q);
        vec3 col = mix(uN1, uN2, smoothstep(0.55, 1.0, q));
        col += uN3 * smoothstep(0.7, 1.0, fbm(d * 2.5 + 4.0)) * 0.5;
        gl_FragColor = vec4(col * cloud * uOpacity, 1.0);
      }`,
    side: THREE.BackSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    transparent: true,
    fog: false,
  })
);
nebula.renderOrder = -1;
scene.add(nebula);
const dustPts = [];
for (let i = 0; i < 3500; i++) dustPts.push(...randomDir().multiplyScalar(18 + rand() * 30).toArray());
const dustGeo = new THREE.BufferGeometry();
dustGeo.setAttribute("position", new THREE.Float32BufferAttribute(dustPts, 3));
const dustMat = new THREE.PointsMaterial({
  size: 0.12,
  map: DOT,
  color: 0x9fdcff,
  transparent: true,
  opacity: 0,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  fog: false,
});
const dust = new THREE.Points(dustGeo, dustMat);
scene.add(dust);

// Temas de cor do cenário e do espaço (comando "theme" no terminal). As cores das áreas não mudam.
const THEMES = {
  azul: { a: 0x3b82f6, b: 0x67e8f9, fire: 0xd9fff0, neb: [0x050d29, 0x0d594d, 0x40145a], dust: 0x9fdcff },
  verde: { a: 0x15803d, b: 0x86efac, fire: 0xdcffe4, neb: [0x03120a, 0x0d5a24, 0x0a3d2a], dust: 0xa7f3d0 },
  vermelho: { a: 0xdc2626, b: 0xfda4af, fire: 0xffe0e3, neb: [0x1c0508, 0x661015, 0x4a0a36], dust: 0xfecaca },
};
let themeName = "azul";
let deco = null; // cenário do estilo atual
function applyTheme(name) {
  const t = THEMES[name];
  if (!t) return false;
  themeName = name;
  ["uN1", "uN2", "uN3"].forEach((u, i) => nebulaU[u].value.set(t.neb[i]));
  dustMat.color.set(t.dust);
  if (deco) deco.setTheme(t);
  document.documentElement.dataset.theme = name;
  try {
    localStorage.setItem("infome-theme", name);
  } catch (e) {}
  return true;
}
let savedTheme = null;
try {
  savedTheme = localStorage.getItem("infome-theme");
} catch (e) {}
if (!applyTheme(savedTheme)) applyTheme("azul");

// Nós
const nodes = [];
const byId = {};
const sphereGeo = new THREE.SphereGeometry(1, 20, 14);
const additive = (color) =>
  new THREE.SpriteMaterial({
    map: GLOW,
    color,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
function makeNode(n) {
  const color = new THREE.Color(n.color);
  const mesh = new THREE.Mesh(
    sphereGeo,
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, fog: false, depthWrite: false })
  );
  const glow = new THREE.Sprite(additive(color));
  const el = document.createElement("div");
  el.className = `node-label ${n.kind}`;
  // o CSS2DRenderer controla o transform do elemento; o deslocamento vai no span interno
  const span = document.createElement("span");
  span.textContent = n.label;
  el.appendChild(span);
  if (n.kind === "hub") el.style.color = n.color;
  const label = new CSS2DObject(el);
  mind.add(mesh, glow, label);
  Object.assign(n, { pos: new THREE.Vector3(), mesh, glow, tag: label, el, vis: 0, links: [] });
  nodes.push(n);
  byId[n.id] = n;
  return n;
}

const core = makeNode({
  id: "__core",
  kind: "core",
  label: P.name,
  color: "#e0f2fe",
  order: 0,
  detail: P.summary,
  catLabel: P.role,
});
P.categories.forEach((c) => {
  makeNode({
    id: "__hub_" + c.id,
    kind: "hub",
    label: c.label,
    color: c.color,
    order: 0.05,
    cat: c,
    catLabel: "Região",
  });
});
P.nodes.forEach((d) => {
  const c = catById[d.category];
  if (!c) return;
  makeNode({ ...d, kind: "leaf", color: c.color, cat: c, catLabel: c.label });
});

// Arestas, cada uma com o "porquê" da conexão
const edges = [];
function addEdge(a, b, why, kind) {
  const e = { a, b, why, kind, i: edges.length };
  edges.push(e);
  a.links.push({ other: b, why, e });
  b.links.push({ other: a, why, e });
}
nodes.filter((n) => n.kind === "hub").forEach((h) => addEdge(core, h, null, "core"));
nodes
  .filter((n) => n.kind === "leaf")
  .forEach((n) => addEdge(byId["__hub_" + n.cat.id], n, `Faz parte de ${n.cat.label}`, "tree"));
P.links.forEach((l) => {
  const a = byId[l.from];
  const b = byId[l.to];
  if (a && b) addEdge(a, b, l.why, "link");
});
const leaves = nodes.filter((n) => n.kind === "leaf");

// Geometria das arestas: curvas com cor por vértice (a forma vem do estilo)
const SEG = 12;
const edgePos = new Float32Array(edges.length * SEG * 6);
const edgeCol = new Float32Array(edges.length * SEG * 6);
const edgeGeo = new THREE.BufferGeometry();
edgeGeo.setAttribute("position", new THREE.BufferAttribute(edgePos, 3));
edgeGeo.setAttribute("color", new THREE.BufferAttribute(edgeCol, 3));
const edgeLines = new THREE.LineSegments(
  edgeGeo,
  new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  })
);
edgeLines.frustumCulled = false;
mind.add(edgeLines);
edges.forEach((e) => (e.color = new THREE.Color(e.kind === "link" ? "#94a3b8" : e.b.color)));
function buildEdges() {
  edges.forEach((e, i) => {
    e.curve = style.curve(e);
    const pts = e.curve.getPoints(SEG);
    for (let s = 0; s < SEG; s++) {
      const a = pts[s];
      const b = pts[s + 1] || a;
      edgePos.set([a.x, a.y, a.z, b.x, b.y, b.z], (i * SEG + s) * 6);
    }
  });
  edgeGeo.attributes.position.needsUpdate = true;
}
function placeNodes() {
  nodes.forEach((n) => {
    n.mesh.position.copy(n.pos);
    n.glow.position.copy(n.pos);
    n.tag.position.copy(n.pos);
  });
}

// Troca de estilo (também ao vivo, pelo comando "estilo" no terminal)
let style = null;
let styleT = 0; // relógio das órbitas (para quando algo está em foco)
let styleSpeed = 1;
function setStyle(id) {
  const next = style3d(id);
  if (deco) {
    mind.remove(deco.group);
    deco.dispose();
    deco = null;
  }
  style = next;
  styleT = 0;
  nodes.forEach((n) => {
    n.r = style.radii[n.kind];
    n.orb = null;
    n.uv = null;
  });
  style.layout(nodes);
  const maxD = Math.max(0.001, ...leaves.map((n) => n.pos.distanceTo(core.pos)));
  leaves.forEach((n) => (n.order = 0.15 + 0.85 * (n.pos.distanceTo(core.pos) / maxD)));
  placeNodes();
  buildEdges();
  const glowMap = style.glow === "star" ? STAR_TEX() : GLOW;
  nodes.forEach((n) => {
    n.mesh.visible = !(style.hideMesh && style.hideMesh(n));
    n.glow.material.map = glowMap;
  });
  deco = style.build({ nodes, edges, tex: { GLOW, DOT } });
  deco.group.renderOrder = -0.5;
  mind.add(deco.group);
  deco.setTheme(THEMES[themeName]);
  mindSpin = 0;
  mind.rotation.set(0, 0, 0);
  document.documentElement.dataset.estilo = style.id;
  onResize();
  return style.id;
}

// Pulsos elétricos percorrendo as conexões
const pulses = [];
for (let i = 0; i < 36; i++) {
  const s = new THREE.Sprite(additive(0xffffff));
  s.scale.setScalar(0.28);
  mind.add(s);
  pulses.push({ s, e: null, t: 0, speed: 0, rev: false });
}

// ---------------------------------------------------------------------------
// Seleção e painel (cada conexão mostra o motivo, como no why-graph)
// ---------------------------------------------------------------------------
let reveal = 0;
let hovered = null;
let selected = null;
let exploring = false;

const panel = $("panel");
function openPanel(n) {
  $("panelCat").textContent = n.catLabel || "";
  $("panelCat").style.color = n.color;
  $("panelTitle").textContent = n.kind === "core" ? P.fullName : n.label;
  $("panelStatus").textContent = n.status || "";
  $("panelDetail").textContent =
    n.detail || (n.kind === "hub" ? `${n.links.length - 1} ${n.links.length - 1 === 1 ? "item" : "itens"} nesta região` : "");
  const links = n.links.filter((l) => l.other.kind !== "core" || n.kind === "hub");
  $("panelLinksTitle").hidden = links.length === 0;
  $("panelLinks").innerHTML = links
    .map(
      (l, i) =>
        `<li><button type="button" data-i="${i}" style="--c:${l.other.color}"><strong>${esc(l.other.label)}</strong>${
          l.why ? `<span>${esc(l.why)}</span>` : ""
        }</button></li>`
    )
    .join("");
  $("panelLinks")
    .querySelectorAll("button")
    .forEach((b) => b.addEventListener("click", () => select(links[+b.dataset.i].other, true)));
  panel.hidden = false;
  panel.scrollTop = 0;
}
function closePanel() {
  panel.hidden = true;
  selected = null;
}
$("panelClose").addEventListener("click", closePanel);

function select(n, focus) {
  stopTimeline();
  selected = n;
  if (!exploring) enterExplore();
  openPanel(n);
  if (focus) focusOn(n);
}

// ---------------------------------------------------------------------------
// Controles (modo explorar): girar, zoom e mover
// ---------------------------------------------------------------------------
const controls = new OrbitControls(camera, canvas);
controls.enabled = false;
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.zoomToCursor = true;
controls.minDistance = 1.2;
controls.maxDistance = 45;
controls.rotateSpeed = 0.7;
controls.autoRotateSpeed = 0.5;
let idleTimer = 0;
let tween = null;
controls.addEventListener("start", () => {
  controls.autoRotate = false;
  tween = null;
  clearTimeout(idleTimer);
});
controls.addEventListener("end", () => {
  clearTimeout(idleTimer);
  if (!reduceMotion) idleTimer = setTimeout(() => (controls.autoRotate = !selected && exploring), 8000);
});

function tweenTo(pos, target, dur = 0.9) {
  tween = {
    fromPos: camera.position.clone(),
    toPos: pos.clone(),
    fromTarget: controls.target.clone(),
    toTarget: target.clone(),
    t: 0,
    dur,
  };
}
function focusOn(n) {
  const wp = n.mesh.getWorldPosition(new THREE.Vector3());
  const dir = camera.position.clone().sub(controls.target).normalize();
  const dist = n.kind === "core" ? 12 : n.kind === "hub" ? 7 : 5;
  controls.autoRotate = false;
  tweenTo(wp.clone().add(dir.multiplyScalar(dist)), wp);
}

let returnFrom = null;
function enterExplore() {
  if (exploring) return;
  exploring = true;
  returnFrom = null;
  document.body.classList.add("exploring");
  controls.target.copy(mind.position);
  controls.enabled = true;
  controls.autoRotate = !reduceMotion;
  onResize();
}
function exitExplore() {
  if (!exploring) return;
  stopTimeline();
  exploring = false;
  document.body.classList.remove("exploring");
  controls.enabled = false;
  controls.autoRotate = false;
  clearTimeout(idleTimer);
  tween = null;
  hovered = null;
  closePanel();
  // volta suavemente para a câmera automática
  returnFrom = { pos: camera.position.clone(), target: controls.target.clone(), t: 0 };
  onResize();
}

$("exploreBtn").addEventListener("click", enterExplore);
$("exitBtn").addEventListener("click", exitExplore);
function overview() {
  closePanel();
  const el = Math.max(0.146, style.view.el);
  tweenTo(mind.position.clone().add(new THREE.Vector3(0, Math.sin(el), Math.cos(el)).multiplyScalar(finalDist)), mind.position);
}
$("resetBtn").addEventListener("click", overview);
window.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || e.defaultPrevented) return;
  if (tl) return stopTimeline();
  if (!panel.hidden) closePanel();
  else exitExplore();
});
function searchFor(q, exact) {
  q = q.trim().toLowerCase();
  if (!q) return false;
  const n = exact
    ? nodes.find((x) => x.label.toLowerCase() === q)
    : nodes.find((x) => x.label.toLowerCase().includes(q));
  if (n) select(n, true);
  return !!n;
}
// Comandos vindos do terminal interativo (shell.js). detail.ok volta com o nome do neurônio achado.
const norm = (t) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
window.addEventListener("map:focus", (e) => {
  const q = norm(e.detail.q);
  if (!q) return;
  const n =
    nodes.find((x) => norm(x.label) === q || x.id === q || (x.cat && x.kind === "hub" && x.cat.id === q)) ||
    nodes.find((x) => norm(x.label).includes(q));
  if (n) {
    select(n, true);
    e.detail.ok = n.kind === "core" ? P.fullName : n.label;
  }
});
window.addEventListener("map:theme", (e) => {
  e.detail.themes = Object.keys(THEMES);
  e.detail.current = themeName;
  if (e.detail.name) e.detail.ok = applyTheme(e.detail.name);
});
window.addEventListener("map:timeline", (e) => (e.detail && e.detail.stop ? stopTimeline() : startTimeline()));
window.addEventListener("map:overview", () => {
  if (!exploring) enterExplore();
  overview();
});
$("search").addEventListener("input", (e) => {
  if (searchFor(e.target.value, true)) e.target.blur();
});
$("search").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && searchFor(e.target.value, false)) e.target.blur();
});

// ---------------------------------------------------------------------------
// Linha do tempo: acende os neurônios etapa por etapa (PROFILE.timeline)
// ---------------------------------------------------------------------------
const TL_STEP = 2.6;
const tlCaption = $("tlCaption");
let tl = null;
function showStep() {
  const st = P.timeline[tl.step];
  tl.fresh = new Set(st.ids.map((id) => byId[id]).filter(Boolean));
  tl.fresh.forEach((n) => tl.lit.add(n));
  tlCaption.innerHTML = `<span class="tl-when">${esc(st.when)}</span><strong>${esc(st.title)}</strong><span class="tl-n">${
    tl.step + 1
  }/${P.timeline.length}</span>`;
  window.dispatchEvent(new CustomEvent("map:timeline-step", { detail: { i: tl.step, step: st } }));
}
function startTimeline() {
  if (!P.timeline || !P.timeline.length) return;
  closePanel();
  if (!exploring) enterExplore();
  overview();
  controls.autoRotate = !reduceMotion;
  tl = { step: 0, t: performance.now() / 1000, hold: 0, lit: new Set(), fresh: new Set() };
  document.body.classList.add("timeline");
  showStep();
}
function stopTimeline() {
  if (!tl) return;
  tl = null;
  document.body.classList.remove("timeline");
  window.dispatchEvent(new CustomEvent("map:timeline-step", { detail: { i: -1 } }));
}

// Hover e clique nos neurônios
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const tmpV = new THREE.Vector3();
const tmpS = new THREE.Vector3();
function pick(ev) {
  if (reveal < 0.85) return null;
  const r = canvas.getBoundingClientRect();
  pointer.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  let best = null;
  let bestScore = Infinity;
  nodes.forEach((n) => {
    if (n.vis < 0.5) return;
    n.mesh.getWorldPosition(tmpV);
    const camD = camera.position.distanceTo(tmpV);
    // raio de acerto generoso, com um mínimo em pixels aproximado pela distância
    const rad = Math.max(n.mesh.getWorldScale(tmpS).x * 2.2, camD * 0.018);
    const off = Math.sqrt(raycaster.ray.distanceSqToPoint(tmpV)) / rad;
    // vence o neurônio cujo centro está mais perto do ponteiro (relativo ao tamanho dele):
    // assim uma lua ao lado do planeta, ou uma folha na frente da região, é clicável
    if (off < 1 && off < bestScore) {
      bestScore = off;
      best = n;
    }
  });
  return best;
}
let downAt = null;
canvas.addEventListener("pointerdown", (e) => (downAt = { x: e.clientX, y: e.clientY }));
canvas.addEventListener("pointermove", (e) => {
  if (e.pointerType !== "mouse" || e.buttons) return;
  hovered = pick(e);
  canvas.style.cursor = hovered ? "pointer" : "";
});
canvas.addEventListener("pointerleave", () => (hovered = null));
canvas.addEventListener("pointerup", (e) => {
  if (!downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 6) return;
  const n = pick(e);
  if (n) select(n, true);
  else if (exploring && !panel.hidden) closePanel();
});

// ---------------------------------------------------------------------------
// Câmera automática: depois do terminal, a mente cresce ao redor dela e ela se afasta
// ---------------------------------------------------------------------------
const journey = $("journey");
const mapUi = $("mapUi");
const labelsEl = $("labels");
// progress vai de P0 (dentro do cérebro) a 1 (mapa inteiro à vista) em ENTER_SECONDS
const P0 = 0.46;
const ENTER_SECONDS = 5.5;
let progress = P0;
let entered = false;
let finalDist = 17;
let pxScale = 400;
const S0 = 0.022; // escala da mente no começo, com a câmera lá dentro
const D0 = 0.34;

const camPos = new THREE.Vector3();
const camTarget = new THREE.Vector3();
function scriptedCamera(p, out, outTarget) {
  const t = smooth(0.46, 0.84, p);
  const d = D0 * Math.pow(finalDist / D0, t * t);
  const az = t * style.view.az;
  const el = lerp(0.05, style.view.el, t);
  out.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(d).add(HEAD);
  outTarget.copy(HEAD);
}

const enter = () => (entered = true);
if (window.__introEntered) enter();
else window.addEventListener("intro:enter", enter, { once: true });

function onResize() {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const aspect = W / H;
  camera.fov = aspect < 1 ? 60 : 45;
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
  renderer.setSize(W, H, false);
  composer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  composer.setSize(W, H);
  cinema.uniforms.uRes.value.set(W, H);
  pxScale = (H * Math.min(window.devicePixelRatio || 1, 2)) / 2;
  labelRenderer.setSize(W, H);
  const halfH = Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * aspect);
  const fit = style ? style.fit : 4.6;
  finalDist = Math.max(11.5 * (fit / 4.6), fit / Math.tan(halfH) + 1.5);
}

window.addEventListener("resize", onResize);
onResize();

// ---------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();
let mindSpin = 0;
let rendered = false;
const linkPulseColor = new THREE.Color("#e0f2fe");

function visibility(n) {
  if (n.kind === "core") return smooth(0, 0.12, reveal);
  if (n.kind === "hub") return smooth(0.04, 0.22, reveal);
  return smooth(n.order - 0.15, n.order, reveal);
}

// Rótulos que se sobrepõem na tela: ficam os mais importantes (centro, o que está em foco,
// regiões) e os mais próximos da câmera; os outros somem até haver espaço para eles.
const LABEL_DY = { core: -34, hub: 22, leaf: 14 };
const labelBoxes = [];
function declutter() {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const cand = [];
  nodes.forEach((n) => {
    const was = n.shown;
    n.shown = false;
    if (!n.tag.visible || n.alpha < 0.03) return;
    if (!n.w) {
      n.w = n.el.firstChild.offsetWidth * 1.08; // folga para o negrito do destaque
      n.h = n.el.firstChild.offsetHeight;
      if (!n.w) return;
    }
    n.mesh.getWorldPosition(tmpV);
    const d = camera.position.distanceTo(tmpV);
    tmpV.project(camera);
    if (tmpV.z > 1) return;
    n.sx = (tmpV.x * 0.5 + 0.5) * W;
    n.sy = (-tmpV.y * 0.5 + 0.5) * H + LABEL_DY[n.kind];
    const tier = n.kind === "core" || n.hot ? 0 : n.lblLit ? 1 : n.lblDim ? 4 : n.kind === "hub" ? 2 : 3;
    // quem já estava visível tem preferência, para os rótulos não piscarem enquanto tudo gira
    n.rank = tier * 1e6 + d * (was ? 0.75 : 1);
    cand.push(n);
  });
  cand.sort((a, b) => a.rank - b.rank);
  labelBoxes.length = 0;
  cand.forEach((n) => {
    const x0 = n.sx - n.w / 2 - 3;
    const x1 = n.sx + n.w / 2 + 3;
    const y0 = n.sy - n.h / 2 - 1;
    const y1 = n.sy + n.h / 2 + 1;
    for (const b of labelBoxes) if (x0 < b[2] && x1 > b[0] && y0 < b[3] && y1 > b[1]) return;
    labelBoxes.push([x0, y0, x1, y1]);
    n.shown = true;
  });
  nodes.forEach((n) => {
    n.el.style.opacity = (n.shown ? n.alpha : 0).toFixed(2);
    n.el.classList.toggle("cull", !n.shown);
  });
}

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  const time = clock.elapsedTime;
  if (!exploring && journey.getBoundingClientRect().bottom < 0) return; // fora da tela
  // enquanto o terminal cobre a tela, desenha só o primeiro quadro (compila os shaders)
  if (!entered && rendered) return;
  if (entered) progress = Math.min(1, progress + dt / ENTER_SECONDS);
  const p = progress;

  // chegada: distorção de lente forte logo depois do zoom no terminal
  const dive = 1 - smooth(P0, 0.6, p);
  cinema.uniforms.uWarp.value = dive * 0.6;
  bloom.strength = lerp(0.6, 0.32, smooth(0.5, 0.8, p)) + dive * 0.5;

  // Mente
  const grow = smooth(0.46, 0.84, p);
  const s = S0 * Math.pow(1 / S0, grow);
  mind.scale.setScalar(s);
  const space = smooth(0.52, 0.72, p);
  nebula.visible = dust.visible = space > 0.001;
  nebula.position.copy(camera.position);
  nebulaU.uOpacity.value = space * 0.75;
  nebulaU.uTime.value = time;
  dustMat.opacity = space * 0.7;
  dust.rotation.y = time * 0.004;
  reveal = smooth(0.66, 0.92, p);
  if (!exploring && !reduceMotion) mindSpin += dt * (style.spinSpeed || 0.06) * reveal;
  mind.rotation.y = style.spin === "full" ? mindSpin : style.spin === "rock" ? Math.sin(mindSpin * 2.2) * 0.28 : 0;

  // Câmera
  if (exploring) {
    if (tween) {
      tween.t = Math.min(1, tween.t + dt / tween.dur);
      const k = smooth(0, 1, tween.t);
      camera.position.lerpVectors(tween.fromPos, tween.toPos, k);
      controls.target.lerpVectors(tween.fromTarget, tween.toTarget, k);
      if (tween.t >= 1) tween = null;
    }
    controls.update(dt);
  } else {
    scriptedCamera(p, camPos, camTarget);
    if (returnFrom) {
      returnFrom.t = Math.min(1, returnFrom.t + dt / 0.8);
      const k = smooth(0, 1, returnFrom.t);
      camPos.lerpVectors(returnFrom.pos, camPos, k);
      camTarget.lerpVectors(returnFrom.target, camTarget, k);
      if (returnFrom.t >= 1) returnFrom = null;
    }
    camera.position.copy(camPos);
    camera.lookAt(camTarget);
  }

  // Linha do tempo avançando
  if (tl) {
    // relógio de parede, para o ritmo não depender da taxa de quadros
    const now = performance.now() / 1000;
    if (now - tl.t > TL_STEP) {
      tl.t = now;
      if (tl.step + 1 < P.timeline.length) {
        tl.step++;
        showStep();
      } else if (++tl.hold > 1) stopTimeline(); // a última etapa fica um pouco mais na tela
    }
  }

  // Destaque (hover ou seleção)
  const focus = selected || hovered;
  const related = new Set();
  if (focus) {
    related.add(focus);
    focus.links.forEach((l) => related.add(l.other));
  }

  // Estilos com órbitas: tudo se move, mas o que está em foco para (fica fácil de clicar e ler)
  if (style.dynamic && !reduceMotion) {
    styleSpeed = lerp(styleSpeed, focus ? 0 : 1, 1 - Math.exp(-3 * dt));
    styleT += dt * styleSpeed;
    style.animate(nodes, styleT);
    placeNodes();
    buildEdges();
  }

  nodes.forEach((n) => {
    n.vis = visibility(n);
    const off = !!tl && n.kind === "leaf" && !tl.lit.has(n); // ainda não aprendido na linha do tempo
    const fresh = !!tl && tl.fresh.has(n);
    const dim = (!!focus && !related.has(n)) || off;
    const hot = n === focus || fresh;
    n.hot = hot;
    const breathe = n.kind === "leaf" && !reduceMotion ? 1 + 0.12 * Math.sin(time * 2 + n.order * 20) : 1;
    n.mesh.material.opacity = n.vis * (dim ? 0.25 : 1);
    n.mesh.scale.setScalar(n.r * (0.3 + 0.7 * n.vis) * (hot ? 1.5 : 1) * breathe);
    n.glow.material.opacity = n.vis * (dim ? 0.12 : hot ? 1 : 0.55);
    n.glow.scale.setScalar(n.r * (hot ? 12 : 8) * breathe);

    // rótulos de folhas somem com a distância para não poluir
    n.mesh.getWorldPosition(tmpV);
    const camD = camera.position.distanceTo(tmpV);
    const near = n.kind === "leaf" ? clamp(1.9 - camD / (finalDist * 0.8), 0.25, 1) : 1;
    n.tag.visible = n.vis > 0.05;
    n.alpha = n.vis * (off ? 0.12 : fresh || related.has(n) ? 1 : near);
    n.lblDim = dim;
    n.lblLit = (!!focus && related.has(n)) || fresh;
    n.el.classList.toggle("dim", dim);
    n.el.classList.toggle("hot", n.lblLit);
  });
  declutter();

  edges.forEach((e, i) => {
    const v = Math.min(e.a.vis, e.b.vis);
    const lit = (focus && (e.a === focus || e.b === focus)) || (tl && (tl.fresh.has(e.a) || tl.fresh.has(e.b)));
    const base = e.kind === "link" ? 0.3 : 0.45;
    const on = !tl || ((e.a.kind !== "leaf" || tl.lit.has(e.a)) && (e.b.kind !== "leaf" || tl.lit.has(e.b)));
    const a = v * (lit ? 1.2 : focus || !on ? 0.05 : base * style.edgeAlpha[e.kind]);
    for (let k = 0; k < SEG * 2; k++) edgeCol.set([e.color.r * a, e.color.g * a, e.color.b * a], (i * SEG * 2 + k) * 3);
  });
  edgeGeo.attributes.color.needsUpdate = true;

  // Pulsos
  pulses.forEach((pu) => {
    if (!pu.e) {
      pu.s.material.opacity = 0;
      if (reduceMotion || reveal < 0.4 || Math.random() > 0.04 * (style.pulses || 1)) return;
      const cand = focus ? focus.links.map((l) => l.e) : edges;
      const e = cand[Math.floor(Math.random() * cand.length)];
      if (!e || Math.min(e.a.vis, e.b.vis) < 0.9) return;
      Object.assign(pu, { e, t: 0, speed: 0.5 + Math.random() * 0.7, rev: Math.random() < 0.5 });
      pu.s.material.color.copy(e.kind === "link" ? linkPulseColor : e.color);
    }
    pu.t += dt * pu.speed;
    if (pu.t >= 1) {
      pu.e = null;
      pu.s.material.opacity = 0;
      return;
    }
    pu.e.curve.getPoint(pu.rev ? 1 - pu.t : pu.t, pu.s.position);
    pu.s.material.opacity = Math.sin(pu.t * Math.PI) * 0.9;
  });

  // Interface por cima
  const ui = smooth(0.88, 0.95, p);
  mapUi.style.opacity = ui;
  mapUi.classList.toggle("on", ui > 0.5);
  labelsEl.style.opacity = exploring ? 1 : smooth(0.62, 0.72, p);

  deco.update({ time, dt, p, appear: smooth(0.5, 0.78, p), scale: s, pxScale });

  cinema.uniforms.uTime.value = time;
  composer.render(dt);
  labelRenderer.render(scene, camera);
  rendered = true;
}
// estilo inicial: o do perfil, ou o do endereço (index.html#u=demo-dev&estilo=solar)
{
  const m = /(?:^#|&)estilo=([\w-]+)/.exec(window.location.hash || "");
  setStyle((m && findStyle(decodeURIComponent(m[1]))) || normalizeStyle(P.style));
}
// comando "estilo" no terminal: lista os estilos ou troca ao vivo (sem salvar)
window.addEventListener("map:style", (e) => {
  e.detail.styles = STYLES;
  e.detail.current = style.id;
  e.detail.saved = normalizeStyle(P.style);
  if (e.detail.name) {
    const id = findStyle(e.detail.name);
    if (id) {
      closePanel();
      stopTimeline();
      e.detail.ok = setStyle(id);
      if (exploring) overview();
    }
  }
});
requestAnimationFrame(frame);

// para testes automatizados
window.__mapa = {
  get style() {
    return style.id;
  },
  setStyle: (id) => setStyle(id),
  get ready() {
    return reveal > 0.99;
  },
  // posição na tela de um neurônio (para clicar nele)
  screenOf(id) {
    const n = byId[id] || nodes.find((x) => x.label === id);
    if (!n) return null;
    const v = n.mesh.getWorldPosition(new THREE.Vector3()).project(camera);
    return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight, front: v.z < 1, id: n.id };
  },
  get leaves() {
    return leaves.map((n) => n.id);
  },
  get panelTitle() {
    return panel.hidden ? null : $("panelTitle").textContent;
  },
};
