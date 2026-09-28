import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { PROFILE as P } from "./data.js";
import { buildRoom, HEAD } from "./room.js";

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
$("name").textContent = P.name;
$("role").textContent = P.role;
$("tagline").textContent = P.tagline;
$("summary").textContent = P.summary;
$("footName").textContent = P.fullName;
$("linkedin").href = P.linkedin;

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
  $("intro").style.display = "none";
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

// Sala com o personagem (assets/js/room.js)
const R = buildRoom(P.avatar);
const room = R.group;
scene.add(room);

// ---------------------------------------------------------------------------
// Mergulho: túnel de código verde ao redor da câmera enquanto ela entra na cabeça
// ---------------------------------------------------------------------------
scene.add(camera);
const tunnelU = { uTime: { value: 0 }, uFlow: { value: 0 }, uOpacity: { value: 0 }, uGlyphs: { value: R.glyphs } };
const tunnel = new THREE.Mesh(
  new THREE.CylinderGeometry(0.6, 0.6, 30, 96, 1, true),
  new THREE.ShaderMaterial({
    uniforms: tunnelU,
    vertexShader: `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform float uTime, uFlow, uOpacity;
      uniform sampler2D uGlyphs;
      varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main() {
        const vec2 GRID = vec2(96.0, 420.0);
        vec2 g = vec2(vUv.x, vUv.y) * GRID;
        vec2 cell = floor(g);
        vec2 inCell = fract(g);
        float seed = hash(vec2(cell.x, 9.1));
        // gotas correndo pelo túnel em direção à câmera
        float period = 60.0 + floor(seed * 60.0);
        float head = fract(uTime * (0.08 + seed * 0.12) + uFlow * (0.6 + seed) + seed * 5.0) * period;
        float d = mod(head - mod(cell.y, period), period);
        float trail = exp(-d * 0.09);
        float isHead = 1.0 - step(1.0, d);
        float idx = floor(hash(cell + floor(uTime * (2.0 + seed * 6.0))) * 64.0);
        vec2 guv = (vec2(mod(idx, 8.0), 7.0 - floor(idx / 8.0)) + vec2(1.0 - inCell.x, inCell.y)) / 8.0;
        float glyph = texture2D(uGlyphs, guv).r;
        vec3 col = mix(vec3(0.1, 1.0, 0.35), vec3(0.85, 1.0, 0.9), isHead);
        // some perto da câmera e no fundo, onde a cabeça "acaba"
        float depthFade = smoothstep(0.5, 0.56, vUv.y) * (1.0 - smoothstep(0.9, 1.0, vUv.y));
        float a = glyph * (0.08 + 1.4 * trail) * depthFade * uOpacity;
        gl_FragColor = vec4(col * a, a);
      }`,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
  })
);
// eixo do cilindro apontando para a frente da câmera
tunnel.rotation.x = -Math.PI / 2;
tunnel.renderOrder = 10;
tunnel.visible = false;
camera.add(tunnel);

// ---------------------------------------------------------------------------
// Mente: cérebro de partículas + mapa neural
// ---------------------------------------------------------------------------
const mind = new THREE.Group();
mind.position.copy(HEAD);
scene.add(mind);

// Forma do cérebro: dois hemisférios com dobras, cerebelo e tronco.
// O lado da frente (testa) fica em -z, porque o personagem olha para o monitor.
const HEMI = { r: [2.1, 2.6, 3.9], cx: 1.5, cy: 0.2 };
function brainPoint(u, h) {
  const gyri =
    0.06 * Math.sin(u.x * 11 + u.y * 7) * Math.sin(u.z * 9 - u.y * 5) + 0.03 * Math.sin(u.z * 23 + u.x * 17);
  let x = u.x * HEMI.r[0];
  if (u.x * h < 0) x *= 0.62; // parede interna mais reta
  let y = u.y * HEMI.r[1];
  if (u.y < -0.2) y *= 0.8;
  const z = u.z * HEMI.r[2];
  return new THREE.Vector3(h * HEMI.cx + x * (1 + gyri), HEMI.cy + y * (1 + gyri), z * (1 + gyri));
}
function randomDir() {
  const z = rand() * 2 - 1;
  const a = rand() * Math.PI * 2;
  const r = Math.sqrt(1 - z * z);
  return new THREE.Vector3(r * Math.cos(a), z, r * Math.sin(a));
}
seed = 1234;
const shellPts = [];
const shellCols = [];
const cA = new THREE.Color(0x3b82f6);
const cB = new THREE.Color(0x67e8f9);
const pushPt = (v, k) => {
  shellPts.push(v.x, v.y, v.z);
  const c = cA.clone().lerp(cB, k);
  shellCols.push(c.r, c.g, c.b);
};
for (let i = 0; i < 26000; i++) pushPt(brainPoint(randomDir(), i % 2 ? 1 : -1), rand());
for (let i = 0; i < 3600; i++) {
  const u = randomDir();
  pushPt(new THREE.Vector3(u.x * 2.1, -1.75 + u.y * 0.8 * (1 + 0.08 * Math.sin(u.y * 30)), 2.5 + u.z * 1.1), rand() * 0.5);
}
for (let i = 0; i < 1200; i++) {
  const t = rand();
  const a = rand() * Math.PI * 2;
  pushPt(new THREE.Vector3(Math.cos(a) * 0.45, -1.4 - t * 2, 1.3 + t * 0.5 + Math.sin(a) * 0.45), rand() * 0.3);
}
for (let i = 0; i < 5000; i++) {
  const u = randomDir().multiplyScalar(Math.cbrt(rand()) * 0.9);
  pushPt(brainPoint(u, rand() < 0.5 ? 1 : -1), 1);
}
const shellRnd = new Float32Array(shellPts.length / 3).map(() => rand());
const shellGeo = new THREE.BufferGeometry();
shellGeo.setAttribute("position", new THREE.Float32BufferAttribute(shellPts, 3));
shellGeo.setAttribute("color", new THREE.Float32BufferAttribute(shellCols, 3));
shellGeo.setAttribute("aRnd", new THREE.BufferAttribute(shellRnd, 1));
// Pontos com brilho próprio: cintilam e são varridos por ondas de disparo sináptico
const shellU = {
  uTime: { value: 0 },
  uSize: { value: 0.05 },
  uScale: { value: 400 },
  uOpacity: { value: 0 },
  uDot: { value: DOT },
  uFire: { value: new THREE.Color(0xd9fff0) },
};
const shellMat = new THREE.ShaderMaterial({
  uniforms: shellU,
  vertexShader: `
    uniform float uTime, uSize, uScale;
    attribute vec3 color;
    attribute float aRnd;
    varying vec3 vCol;
    varying float vFire;
    const vec3 O1 = vec3(1.6, 1.4, -2.4), O2 = vec3(-1.8, 0.4, 1.8), O3 = vec3(0.2, -1.2, 0.3);
    float wave(vec3 p, vec3 o, float speed, float off) {
      float r = fract(uTime * speed + off) * 9.0;
      float d = distance(p, o) - r;
      return exp(-d * d * 6.0) * (1.0 - r / 9.0);
    }
    void main() {
      float w = wave(position, O1, 0.11, 0.0) + wave(position, O2, 0.08, 0.37) + wave(position, O3, 0.14, 0.71);
      float spark = pow(max(0.0, sin(uTime * (0.6 + aRnd * 1.7) + aRnd * 91.0)), 60.0);
      float twinkle = 0.7 + 0.3 * sin(uTime * (1.5 + aRnd * 3.0) + aRnd * 40.0);
      vFire = clamp(w * 1.2 + spark, 0.0, 1.5);
      vCol = color * twinkle;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = uSize * (1.0 + vFire * 1.6) * uScale / -mv.z;
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: `
    uniform sampler2D uDot;
    uniform float uOpacity;
    uniform vec3 uFire;
    varying vec3 vCol;
    varying float vFire;
    void main() {
      float a = texture2D(uDot, gl_PointCoord).a * uOpacity;
      vec3 c = mix(vCol, uFire, min(vFire, 1.0)) * (1.0 + vFire);
      gl_FragColor = vec4(c * a, a);
    }`,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});
mind.add(new THREE.Points(shellGeo, shellMat));

// Nebulosa e poeira estelar ao fundo do mapa
const nebulaU = { uTime: { value: 0 }, uOpacity: { value: 0 } };
const nebula = new THREE.Mesh(
  new THREE.SphereGeometry(60, 48, 32),
  new THREE.ShaderMaterial({
    uniforms: nebulaU,
    vertexShader: `
      varying vec3 vDir;
      void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform float uTime, uOpacity;
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
        vec3 col = mix(vec3(0.02, 0.05, 0.16), vec3(0.05, 0.35, 0.3), smoothstep(0.55, 1.0, q));
        col += vec3(0.25, 0.08, 0.35) * smoothstep(0.7, 1.0, fbm(d * 2.5 + 4.0)) * 0.5;
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
  Object.assign(n, { mesh, glow, tag: label, el, vis: 0, links: [] });
  nodes.push(n);
  byId[n.id] = n;
  return n;
}

const core = makeNode({
  id: "__core",
  kind: "core",
  label: P.name,
  color: "#e0f2fe",
  pos: new THREE.Vector3(0, 0.3, 0.2),
  r: 0.26,
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
    pos: new THREE.Vector3(...c.pos).multiplyScalar(1.15),
    r: 0.16,
    order: 0.05,
    cat: c,
    catLabel: "Região",
  });
});
seed = 42;
P.nodes.forEach((d) => {
  const c = catById[d.category];
  if (!c) return;
  const hub = byId["__hub_" + c.id];
  const pos = hub.pos.clone().add(randomDir().multiplyScalar(0.7 + rand() * 0.5));
  makeNode({ ...d, kind: "leaf", color: c.color, pos, r: 0.085, cat: c, catLabel: c.label });
});

// Arestas, cada uma com o "porquê" da conexão
const edges = [];
function addEdge(a, b, why, kind) {
  const e = { a, b, why, kind };
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

// Relaxamento de forças: espalha os neurônios sem sobreposição e dentro do cérebro
const leaves = nodes.filter((n) => n.kind === "leaf");
function insideBrain(p, k = 0.8) {
  for (const h of [-1, 1]) {
    const x = (p.x - h * HEMI.cx) / (HEMI.r[0] * k);
    const y = (p.y - HEMI.cy) / (HEMI.r[1] * k);
    const z = p.z / (HEMI.r[2] * k);
    if (x * x + y * y + z * z < 1) return true;
  }
  return false;
}
{
  const tmp = new THREE.Vector3();
  const f = new THREE.Vector3();
  for (let it = 0; it < 400; it++) {
    const cool = 1 - it / 400;
    leaves.forEach((n) => {
      f.set(0, 0, 0);
      nodes.forEach((m) => {
        if (m === n) return;
        tmp.copy(n.pos).sub(m.pos);
        const d = tmp.length() || 0.01;
        const min = m.kind === "leaf" ? 1.15 : 1.3;
        if (d < min) f.add(tmp.multiplyScalar(((min - d) / d) * 0.5));
      });
      n.links.forEach(({ other, e }) => {
        tmp.copy(other.pos).sub(n.pos);
        const d = tmp.length() || 0.01;
        const rest = e.kind === "tree" ? 1.1 : 1.8;
        const k = e.kind === "tree" ? 0.08 : 0.02;
        f.add(tmp.multiplyScalar(((d - rest) / d) * k));
      });
      if (!insideBrain(n.pos)) f.add(tmp.copy(n.pos).multiplyScalar(-0.04));
      n.pos.add(f.multiplyScalar(cool));
    });
  }
}
const maxD = Math.max(...leaves.map((n) => n.pos.distanceTo(core.pos)));
nodes.forEach((n) => {
  n.mesh.position.copy(n.pos);
  n.glow.position.copy(n.pos);
  n.tag.position.copy(n.pos);
  if (n.kind === "leaf") n.order = 0.15 + 0.85 * (n.pos.distanceTo(core.pos) / maxD);
});

// Geometria das arestas: curvas suaves com cor por vértice
const SEG = 12;
const edgePos = new Float32Array(edges.length * SEG * 6);
const edgeCol = new Float32Array(edges.length * SEG * 6);
edges.forEach((e, i) => {
  const mid = e.a.pos.clone().add(e.b.pos).multiplyScalar(0.5);
  const ctrl = mid.clone().add(mid.clone().multiplyScalar(e.kind === "link" ? 0.18 : 0.08));
  e.curve = new THREE.QuadraticBezierCurve3(e.a.pos, ctrl, e.b.pos);
  const pts = e.curve.getPoints(SEG);
  for (let s = 0; s < SEG; s++) {
    edgePos.set([pts[s].x, pts[s].y, pts[s].z, pts[s + 1].x, pts[s + 1].y, pts[s + 1].z], (i * SEG + s) * 6);
  }
  e.color = new THREE.Color(e.kind === "link" ? "#94a3b8" : e.b.color);
});
const edgeGeo = new THREE.BufferGeometry();
edgeGeo.setAttribute("position", new THREE.BufferAttribute(edgePos, 3));
edgeGeo.setAttribute("color", new THREE.BufferAttribute(edgeCol, 3));
mind.add(
  new THREE.LineSegments(
    edgeGeo,
    new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    })
  )
);

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
  exploring = false;
  document.body.classList.remove("exploring");
  controls.enabled = false;
  controls.autoRotate = false;
  clearTimeout(idleTimer);
  tween = null;
  hovered = null;
  closePanel();
  // volta suavemente para a câmera guiada pelo scroll
  returnFrom = { pos: camera.position.clone(), target: controls.target.clone(), t: 0 };
  onResize();
}

$("exploreBtn").addEventListener("click", enterExplore);
$("exitBtn").addEventListener("click", exitExplore);
$("resetBtn").addEventListener("click", () => {
  closePanel();
  tweenTo(mind.position.clone().add(new THREE.Vector3(0, 2.5, finalDist)), mind.position);
});
window.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
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
$("search").addEventListener("input", (e) => {
  if (searchFor(e.target.value, true)) e.target.blur();
});
$("search").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && searchFor(e.target.value, false)) e.target.blur();
});

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
  let bestD = Infinity;
  nodes.forEach((n) => {
    n.mesh.getWorldPosition(tmpV);
    const camD = camera.position.distanceTo(tmpV);
    // raio de acerto generoso, com um mínimo em pixels aproximado pela distância
    const rad = Math.max(n.mesh.getWorldScale(tmpS).x * 2.2, camD * 0.018);
    if (raycaster.ray.distanceSqToPoint(tmpV) < rad * rad && camD < bestD) {
      bestD = camD;
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
// Câmera guiada pelo scroll
// ---------------------------------------------------------------------------
const journey = $("journey");
const intro = $("intro");
const hint = $("scrollHint");
const mapUi = $("mapUi");
const labelsEl = $("labels");
let progress = 0;
let finalDist = 17;

// abertura: de lado e à frente, para ver o rosto; depois a câmera contorna o personagem até ficar atrás da cabeça
const C0 = new THREE.Vector3(-1.6, 1.3, -0.7);
const L0 = new THREE.Vector3(0.15, 1.14, -0.3);
const C1 = new THREE.Vector3(0.3, 1.36, 0.75);
const C2 = HEAD.clone().add(new THREE.Vector3(0, 0.03, 0.34));
const S0 = 0.022; // escala da mente quando ainda está dentro da cabeça
const D0 = 0.34;

const par = new THREE.Vector2();
const parTarget = new THREE.Vector2();
window.addEventListener("pointermove", (e) => {
  if (e.pointerType !== "mouse" || reduceMotion) return;
  parTarget.set((e.clientX / window.innerWidth) * 2 - 1, -((e.clientY / window.innerHeight) * 2 - 1));
});
const camPos = new THREE.Vector3();
const camTarget = new THREE.Vector3();
function scriptedCamera(p, out, outTarget) {
  if (p < 0.3) {
    // arco em volta da cabeça (não atravessa o personagem)
    const t = smooth(0, 0.3, p);
    const a0 = Math.atan2(C0.x - HEAD.x, C0.z - HEAD.z);
    const a1 = Math.atan2(C1.x - HEAD.x, C1.z - HEAD.z);
    const r = lerp(Math.hypot(C0.x - HEAD.x, C0.z - HEAD.z), Math.hypot(C1.x - HEAD.x, C1.z - HEAD.z), t);
    const a = lerp(a0, a1, t);
    out.set(HEAD.x + Math.sin(a) * r, lerp(C0.y, C1.y, t), HEAD.z + Math.cos(a) * r);
    outTarget.lerpVectors(L0, HEAD, smooth(0.05, 0.3, p));
  } else if (p < 0.46) {
    out.lerpVectors(C1, C2, smooth(0.3, 0.46, p));
    outTarget.copy(HEAD);
  } else {
    // a mente cresce ao redor da câmera e depois a câmera se afasta para ver tudo
    const t = smooth(0.46, 0.84, p);
    const d = D0 * Math.pow(finalDist / D0, t * t);
    const az = t * 0.7;
    const el = lerp(0.05, 0.16, t);
    out.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(d).add(HEAD);
    outTarget.copy(HEAD);
  }
}

function onScroll() {
  const rect = journey.getBoundingClientRect();
  progress = clamp(-rect.top / (rect.height - window.innerHeight), 0, 1);
}

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
  shellU.uScale.value = (H * Math.min(window.devicePixelRatio || 1, 2)) / 2;
  labelRenderer.setSize(W, H);
  const halfH = Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * aspect);
  finalDist = Math.max(11.5, 4.6 / Math.tan(halfH) + 1.5);
  if (aspect < 1) C0.set(-1.9, 1.4, -1.0);
  else C0.set(-1.6, 1.3, -0.7);
}

window.addEventListener("scroll", onScroll, { passive: true });

window.addEventListener("resize", onResize);
onResize();
onScroll();

// ---------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();
let mindSpin = 0;
const linkPulseColor = new THREE.Color("#e0f2fe");

function visibility(n) {
  if (n.kind === "core") return smooth(0, 0.12, reveal);
  if (n.kind === "hub") return smooth(0.04, 0.22, reveal);
  return smooth(n.order - 0.15, n.order, reveal);
}

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  const time = clock.elapsedTime;
  if (!exploring && journey.getBoundingClientRect().bottom < 0) return; // fora da tela
  const p = progress;

  // Sala
  const roomOpacity = 1 - smooth(0.46, 0.56, p);
  room.visible = roomOpacity > 0.001;
  R.mats.forEach((m) => (m.opacity = roomOpacity));
  const headFade = 1 - smooth(0.34, 0.46, p);
  R.headMats.forEach((m) => {
    m.opacity = headFade * roomOpacity;
    m.depthWrite = headFade > 0.99;
    m.visible = headFade > 0.3; // o interior da cabeça não aparece durante o mergulho
  });
  if (room.visible) R.update(time, dt);
  // mergulho no código: o túnel aparece enquanto a câmera atravessa a cabeça
  const dive = smooth(0.37, 0.45, p) * (1 - smooth(0.5, 0.6, p));
  tunnel.visible = dive > 0.001;
  tunnelU.uOpacity.value = dive;
  tunnelU.uTime.value = time;
  tunnelU.uFlow.value = p * 6;
  cinema.uniforms.uWarp.value = dive * 0.6;
  bloom.strength = lerp(0.6, 0.32, smooth(0.5, 0.8, p)) + dive * 0.5;

  // Mente
  const grow = smooth(0.46, 0.84, p);
  const s = S0 * Math.pow(1 / S0, grow);
  mind.scale.setScalar(s);
  shellU.uSize.value = 0.03 * s;
  shellU.uOpacity.value = smooth(0.16, 0.36, p) * 0.6;
  shellU.uTime.value = time;
  const space = smooth(0.52, 0.72, p);
  nebula.visible = dust.visible = space > 0.001;
  nebula.position.copy(camera.position);
  nebulaU.uOpacity.value = space * 0.75;
  nebulaU.uTime.value = time;
  dustMat.opacity = space * 0.7;
  dust.rotation.y = time * 0.004;
  reveal = smooth(0.66, 0.92, p);
  if (!exploring && !reduceMotion) mindSpin += dt * 0.06 * reveal;
  mind.rotation.y = mindSpin;

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
    // parallax sutil com o mouse na cena de abertura
    par.x += (parTarget.x - par.x) * Math.min(1, dt * 3);
    par.y += (parTarget.y - par.y) * Math.min(1, dt * 3);
    const pk = 1 - smooth(0, 0.25, p);
    camPos.x += par.x * 0.12 * pk;
    camPos.y += par.y * 0.06 * pk;
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

  // Destaque (hover ou seleção)
  const focus = selected || hovered;
  const related = new Set();
  if (focus) {
    related.add(focus);
    focus.links.forEach((l) => related.add(l.other));
  }

  nodes.forEach((n) => {
    n.vis = visibility(n);
    const dim = !!focus && !related.has(n);
    const hot = n === focus;
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
    n.el.style.opacity = (n.vis * (related.has(n) ? 1 : near)).toFixed(2);
    n.el.classList.toggle("dim", dim);
    n.el.classList.toggle("hot", !!focus && related.has(n));
  });

  edges.forEach((e, i) => {
    const v = Math.min(e.a.vis, e.b.vis);
    const lit = focus && (e.a === focus || e.b === focus);
    const base = e.kind === "link" ? 0.3 : 0.45;
    const a = v * (lit ? 1.2 : focus ? 0.06 : base);
    for (let k = 0; k < SEG * 2; k++) edgeCol.set([e.color.r * a, e.color.g * a, e.color.b * a], (i * SEG * 2 + k) * 3);
  });
  edgeGeo.attributes.color.needsUpdate = true;

  // Pulsos
  pulses.forEach((pu) => {
    if (!pu.e) {
      pu.s.material.opacity = 0;
      if (reduceMotion || reveal < 0.4 || Math.random() > 0.04) return;
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
  intro.style.opacity = 1 - smooth(0, 0.06, p);
  hint.style.opacity = 1 - smooth(0, 0.04, p);
  const ui = smooth(0.88, 0.95, p);
  mapUi.style.opacity = ui;
  mapUi.classList.toggle("on", ui > 0.5);
  labelsEl.style.opacity = exploring ? 1 : smooth(0.62, 0.72, p);

  cinema.uniforms.uTime.value = time;
  composer.render(dt);
  labelRenderer.render(scene, camera);
}
requestAnimationFrame(frame);
