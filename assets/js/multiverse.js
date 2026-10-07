// Multiverso: espaço profundo com uma galáxia por universo (perfil) e uma nave para voar entre elas.
// Cada galáxia é desenhada com as regiões, cores e neurônios do próprio perfil (universes.js).
// Perto de uma galáxia, Enter abre o mapa neural daquele universo (index.html#u=...).
import * as THREE from "three";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UNIVERSES, universeById, mapUrl, HOME_ID, MY_UNIVERSE } from "./universes.js";
import { SHIPS, buildShip, shipById, shipStats, loadShipId, saveShipId } from "./ships.js";
import { styleById, normalizeStyle } from "./estilos.js";

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
// aproximação exponencial independente da taxa de quadros
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
const esc = (v) =>
  String(v).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
const fmt = (v, d = 0) => v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
function rng(seedStr) {
  let h = 1779033703;
  for (let i = 0; i < seedStr.length; i++) h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353) >>> 0;
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const R0 = rng("multiverso");
const gauss = (r = R0) => (r() + r() + r() + r() - 2) / 2; // ~normal, desvio ~0,58
function randomDir(r = R0, out = new THREE.Vector3()) {
  const z = r() * 2 - 1;
  const a = r() * Math.PI * 2;
  const s = Math.sqrt(1 - z * z);
  return out.set(s * Math.cos(a), z, s * Math.sin(a));
}

// ---------------------------------------------------------------------------
// Renderer e pós-processamento
// ---------------------------------------------------------------------------
const canvas = $("gl");
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
} catch (e) {
  $("fallback").hidden = false;
  $("loading").remove();
  throw e;
}
const DPR = Math.min(window.devicePixelRatio || 1, 1.5);
renderer.setPixelRatio(DPR);
renderer.setClearColor(0x000000, 1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const labelRenderer = new CSS2DRenderer({ element: $("labels") });
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, 1, 0.05, 9000);
scene.add(camera);

const composer = new EffectComposer(
  renderer,
  new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 })
);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.8, 0.5, 0.32);
composer.addPass(bloom);
composer.addPass(new OutputPass());
// Passe "de cinema": aberração cromática, borrão radial de dobra, clarão, grão e vinheta
const cinema = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uWarp: { value: 0 },
    uFlash: { value: 0 },
    uAberr: { value: 0.0012 },
    uGrain: { value: 0.035 },
    uVignette: { value: 0.42 },
    uRes: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uTime, uWarp, uFlash, uAberr, uGrain, uVignette;
    uniform vec2 uRes;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 c = vUv - 0.5;
      float r2 = dot(c, c);
      vec2 dir = c * (uAberr + uWarp * 0.012) * (0.5 + r2 * 3.0);
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + dir).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - dir).b;
      if (uWarp > 0.01) {
        // borrão radial: as estrelas viram riscos saindo do centro
        vec3 acc = vec3(0.0);
        float tot = 0.0;
        for (int i = 0; i < 12; i++) {
          float k = float(i) / 11.0;
          float w = 1.0 - k * 0.6;
          acc += texture2D(tDiffuse, 0.5 + c * (1.0 - k * uWarp * 0.16)).rgb * w;
          tot += w;
        }
        col = mix(col, acc / tot * (1.0 + uWarp * 0.6), smoothstep(0.0, 0.25, uWarp));
        col += vec3(0.25, 0.5, 1.0) * uWarp * 0.08 * smoothstep(0.05, 0.3, r2);
      }
      float g = hash(floor(vUv * uRes) + floor(uTime * 24.0)) - 0.5;
      col += g * uGrain * (0.6 + 0.4 * (1.0 - dot(col, vec3(0.333))));
      col *= 1.0 - uVignette * smoothstep(0.15, 0.8, r2 * 2.0);
      col = mix(col, vec3(0.86, 0.94, 1.0), clamp(uFlash, 0.0, 1.0));
      gl_FragColor = vec4(col, 1.0);
    }`,
});
composer.addPass(cinema);

// ---------------------------------------------------------------------------
// Texturas geradas em canvas
// ---------------------------------------------------------------------------
function canvasTex(size, draw, h = size) {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = h;
  draw(c.getContext("2d"), size, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const radial = (stops) => (g, s) => {
  const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  stops.forEach(([o, a]) => r.addColorStop(o, `rgba(255,255,255,${a})`));
  g.fillStyle = r;
  g.fillRect(0, 0, s, s);
};
const GLOW = canvasTex(128, radial([[0, 1], [0.15, 0.55], [0.45, 0.12], [1, 0]]));
const SOFT = canvasTex(64, radial([[0, 1], [0.35, 0.45], [1, 0]]));
// estrela com raios em cruz (difração), para os neurônios das galáxias
const STAR = canvasTex(128, (g, s) => {
  radial([[0, 1], [0.08, 0.8], [0.25, 0.15], [0.6, 0]])(g, s);
  g.globalCompositeOperation = "lighter";
  const ray = (horiz) => {
    const gr = horiz ? g.createLinearGradient(0, 0, s, 0) : g.createLinearGradient(0, 0, 0, s);
    gr.addColorStop(0, "rgba(255,255,255,0)");
    gr.addColorStop(0.5, "rgba(255,255,255,0.9)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    if (horiz) g.fillRect(0, s / 2 - 1.2, s, 2.4);
    else g.fillRect(s / 2 - 1.2, 0, 2.4, s);
  };
  ray(true);
  ray(false);
});
// nuvem irregular para as nebulosas das galáxias
const CLOUD = canvasTex(128, (g, s) => {
  const r = rng("nuvem");
  for (let i = 0; i < 26; i++) {
    const x = s / 2 + gauss(r) * s * 0.2;
    const y = s / 2 + gauss(r) * s * 0.2;
    const rad = s * (0.12 + r() * 0.22);
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, "rgba(255,255,255,0.16)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, s, s);
  }
});
// ---------------------------------------------------------------------------
// Fundo: nebulosa, faixa de estrelas distantes e poeira próxima
// ---------------------------------------------------------------------------
const sky = new THREE.Group();
scene.add(sky);
const skyU = { uTime: { value: 0 } };
const skyMesh = new THREE.Mesh(
  new THREE.SphereGeometry(4000, 48, 32),
  new THREE.ShaderMaterial({
    uniforms: skyU,
    vertexShader: `
      varying vec3 vDir;
      void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform float uTime;
      varying vec3 vDir;
      float h(vec3 p) { return fract(sin(dot(p, vec3(17.1, 113.7, 71.3))) * 43758.5453); }
      float n(vec3 p) {
        vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(h(i), h(i + vec3(1,0,0)), f.x), mix(h(i + vec3(0,1,0)), h(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(h(i + vec3(0,0,1)), h(i + vec3(1,0,1)), f.x), mix(h(i + vec3(0,1,1)), h(i + vec3(1,1,1)), f.x), f.y), f.z);
      }
      float fbm(vec3 p) { float v = 0.0, a = 0.5; for (int k = 0; k < 6; k++) { v += a * n(p); p *= 2.02; a *= 0.5; } return v; }
      void main() {
        vec3 d = normalize(vDir);
        // faixa principal inclinada, como a Via Láctea
        vec3 bandN = normalize(vec3(0.25, 1.0, 0.35));
        float band = exp(-pow(dot(d, bandN), 2.0) * 7.0);
        vec3 p = d * 2.6;
        float q = fbm(p + fbm(p * 1.6 + 3.0));
        float dust = fbm(d * 7.0 + 11.0);
        float cloud = smoothstep(0.42, 0.95, q) * (0.35 + band);
        vec3 c1 = vec3(0.03, 0.05, 0.16);
        vec3 c2 = vec3(0.20, 0.05, 0.32);
        vec3 c3 = vec3(0.02, 0.26, 0.30);
        vec3 c4 = vec3(0.45, 0.10, 0.25);
        vec3 col = mix(c1, c2, smoothstep(0.5, 0.9, q));
        col = mix(col, c3, smoothstep(0.55, 0.85, fbm(p * 1.3 + 7.0)) * 0.8);
        col += c4 * smoothstep(0.72, 0.95, fbm(p * 2.2 - 5.0)) * 0.6;
        col *= cloud;
        col += vec3(0.10, 0.09, 0.14) * band * smoothstep(0.35, 0.8, fbm(d * 18.0)) * 0.6; // brilho difuso da faixa
        col *= 1.0 - smoothstep(0.55, 0.8, dust) * band * 0.7; // poeira escura
        gl_FragColor = vec4(col, 1.0);
      }`,
    side: THREE.BackSide,
    depthWrite: false,
  })
);
// a nebulosa é estática: desenha uma vez num cubemap e usa como fundo (economiza muito a cada quadro)
{
  const cubeRT = new THREE.WebGLCubeRenderTarget(1024, { type: THREE.HalfFloatType });
  const bake = new THREE.Scene();
  bake.add(skyMesh);
  new THREE.CubeCamera(1, 10000, cubeRT).update(renderer, bake);
  scene.background = cubeRT.texture;
  skyMesh.geometry.dispose();
  skyMesh.material.dispose();
}

// estrelas distantes (acompanham a câmera: ficam "no infinito")
{
  const r = rng("estrelas");
  const N = 9000;
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  const size = new Float32Array(N);
  const rnd = new Float32Array(N);
  const bandN = new THREE.Vector3(0.25, 1, 0.35).normalize();
  const d = new THREE.Vector3();
  const c = new THREE.Color();
  for (let i = 0; i < N; i++) {
    randomDir(r, d);
    // metade das estrelas se concentra na faixa
    if (i % 2) d.addScaledVector(bandN, -d.dot(bandN) * (0.85 + r() * 0.15)).normalize();
    d.multiplyScalar(3600);
    pos.set([d.x, d.y, d.z], i * 3);
    const t = r();
    c.setHSL(t < 0.7 ? 0.58 + r() * 0.06 : 0.06 + r() * 0.08, 0.3 + r() * 0.5, 0.75 + r() * 0.2);
    const b = 0.5 + Math.pow(r(), 6) * 2.6;
    col.set([c.r * b, c.g * b, c.b * b], i * 3);
    size[i] = 1.2 + Math.pow(r(), 5) * 3.6;
    rnd[i] = r();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
  g.setAttribute("aRnd", new THREE.BufferAttribute(rnd, 1));
  const stars = new THREE.Points(
    g,
    new THREE.ShaderMaterial({
      uniforms: { uTime: skyU.uTime, uDpr: { value: DPR }, uTw: { value: reduceMotion ? 0 : 1 } },
      vertexShader: `
        uniform float uTime, uDpr, uTw;
        attribute vec3 color;
        attribute float aSize, aRnd;
        varying vec3 vCol;
        void main() {
          float tw = 1.0 - uTw * 0.35 * (0.5 + 0.5 * sin(uTime * (1.0 + aRnd * 4.0) + aRnd * 60.0));
          vCol = color * tw;
          gl_PointSize = aSize * uDpr;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        varying vec3 vCol;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d);
          gl_FragColor = vec4(vCol * a, a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  stars.renderOrder = -9;
  sky.add(stars);
}

// poeira espacial perto da nave: dá a sensação de velocidade e vira riscos na dobra
const DUST_BOX = 260;
const dustU = {
  uCam: { value: new THREE.Vector3() },
  uBox: { value: DUST_BOX },
  uTail: { value: new THREE.Vector3() },
  uAlpha: { value: 1 },
  uScale: { value: 500 },
};
let streaks;
{
  const r = rng("poeira");
  const N = 1400;
  const base = new Float32Array(N * 3);
  for (let i = 0; i < N * 3; i++) base[i] = r() * DUST_BOX;
  const dustVS = (isLine) => `
    uniform vec3 uCam, uTail;
    uniform float uBox, uAlpha, uScale;
    ${isLine ? "attribute float aEnd;" : ""}
    varying float vA;
    void main() {
      vec3 rel = mod(position - uCam, uBox) - uBox * 0.5;
      vec3 wp = uCam + rel;
      ${isLine ? "wp -= uTail * aEnd;" : ""}
      vA = (1.0 - smoothstep(uBox * 0.25, uBox * 0.5, length(rel))) * uAlpha;
      vec4 mv = viewMatrix * vec4(wp, 1.0);
      gl_PointSize = clamp(0.35 * uScale / -mv.z, 1.0, 6.0);
      gl_Position = projectionMatrix * mv;
    }`;
  const dustFS = (isLine) => `
    varying float vA;
    void main() {
      ${isLine ? "" : "if (length(gl_PointCoord - 0.5) > 0.5) discard;"}
      gl_FragColor = vec4(vec3(0.65, 0.82, 1.0) * vA, vA);
    }`;
  const pg = new THREE.BufferGeometry();
  pg.setAttribute("position", new THREE.BufferAttribute(base, 3));
  const dustPts = new THREE.Points(
    pg,
    new THREE.ShaderMaterial({
      uniforms: dustU,
      vertexShader: dustVS(false),
      fragmentShader: dustFS(false),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  dustPts.frustumCulled = false;
  scene.add(dustPts);
  // riscos: cada partícula vira um segmento cabeça → cauda
  const lp = new Float32Array(N * 6);
  const le = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) {
    lp.set([base[i * 3], base[i * 3 + 1], base[i * 3 + 2], base[i * 3], base[i * 3 + 1], base[i * 3 + 2]], i * 6);
    le[i * 2 + 1] = 1;
  }
  const lg = new THREE.BufferGeometry();
  lg.setAttribute("position", new THREE.BufferAttribute(lp, 3));
  lg.setAttribute("aEnd", new THREE.BufferAttribute(le, 1));
  streaks = new THREE.LineSegments(
    lg,
    new THREE.ShaderMaterial({
      uniforms: dustU,
      vertexShader: dustVS(true),
      fragmentShader: dustFS(true),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  streaks.frustumCulled = false;
  scene.add(streaks);
}

// ---------------------------------------------------------------------------
// Galáxias: uma por universo, feitas das regiões e neurônios do perfil
// ---------------------------------------------------------------------------
const STYLES = ["espiral", "barrada", "anel", "eliptica", "espiral"];
const RING = 760;
const galaxyPointMat = new THREE.ShaderMaterial({
  uniforms: { uScale: dustU.uScale, uTime: skyU.uTime, uMap: { value: SOFT }, uTw: { value: reduceMotion ? 0 : 1 } },
  vertexShader: `
    uniform float uScale, uTime, uTw;
    attribute vec3 color;
    attribute float aSize, aRnd;
    varying vec3 vCol;
    varying float vA;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      float px = aSize * uScale / -mv.z;
      // abaixo de 1,5 px a estrela fica do mesmo tamanho e só perde brilho (sem cintilar de serrilhado)
      vA = clamp(px / 1.5, 0.0, 1.0);
      float tw = 1.0 - uTw * 0.25 * (0.5 + 0.5 * sin(uTime * (0.7 + aRnd * 2.5) + aRnd * 80.0));
      vCol = color * tw;
      gl_PointSize = clamp(px, 1.5, 56.0);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: `
    uniform sampler2D uMap;
    varying vec3 vCol;
    varying float vA;
    void main() {
      float a = texture2D(uMap, gl_PointCoord).a * vA;
      gl_FragColor = vec4(vCol * a, a);
    }`,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});
const nodePointMat = galaxyPointMat.clone();
nodePointMat.uniforms = { ...galaxyPointMat.uniforms, uMap: { value: STAR } };

const galaxies = [];
UNIVERSES.forEach((u, idx) => {
  const P = u.profile;
  const r = rng("galaxia-" + u.id);
  const style = STYLES[idx % STYLES.length];
  const K = P.categories.length;
  const R = 105 + P.nodes.length * 1.5;
  const cols = P.categories.map((c) => new THREE.Color(c.color));
  const avg = cols.reduce((a, c) => a.add(c), new THREE.Color(0, 0, 0)).multiplyScalar(1 / K);
  const catIdx = Object.fromEntries(P.categories.map((c, i) => [c.id, i]));
  const catDirs = P.categories.map((c) => new THREE.Vector3(...c.pos).normalize());

  const ang = -Math.PI / 2 + (idx / UNIVERSES.length) * Math.PI * 2;
  const center = new THREE.Vector3(Math.cos(ang) * RING, Math.sin(idx * 2.4) * 120, Math.sin(ang) * RING);
  const group = new THREE.Group();
  group.position.copy(center);
  // o disco fica inclinado para o centro do anel (de onde a nave costuma chegar), para ser visto de frente
  const normal = new THREE.Vector3(0, 1, 0)
    .lerp(center.clone().multiplyScalar(-1).setY(0).normalize(), 0.55 + r() * 0.2)
    .add(new THREE.Vector3(gauss(r), 0, gauss(r)).multiplyScalar(0.15))
    .normalize();
  group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
  group.rotateY(r() * Math.PI * 2);
  scene.add(group);
  const spin = new THREE.Group();
  group.add(spin);

  // ponto de uma região (categoria ci) no "progresso" t ∈ [0,1] dentro da forma da galáxia
  const TW = 3.4;
  function region(ci, t, out) {
    if (style === "espiral") {
      // até 4 braços; com mais regiões, cada braço tem duas faixas de cor (dentro e fora)
      const A = K > 4 ? Math.ceil(K / 2) : K;
      const nSeg = Math.ceil(K / A);
      const g = (Math.floor(ci / A) + t) / nSeg;
      const rr = R * (0.12 + 0.88 * g);
      const th = ((ci % A) / A) * Math.PI * 2 + g * TW;
      return out.set(Math.cos(th) * rr, 0, Math.sin(th) * rr);
    }
    if (style === "barrada") {
      // dois braços simétricos saindo da barra; cada região é uma faixa de cor nos dois
      const side = t < 0.5 ? 0 : 1;
      const g = (ci + ((t * 2) % 1)) / K;
      const rr = R * (0.3 + 0.7 * g);
      const th = side * Math.PI + g * 3.2;
      return out.set(Math.cos(th) * rr, 0, Math.sin(th) * rr);
    }
    if (style === "anel") {
      const th = ((ci + t) / K) * Math.PI * 2;
      const rr = R * 0.74;
      return out.set(Math.cos(th) * rr, 0, Math.sin(th) * rr);
    }
    // elíptica: regiões em aglomerados nas direções do cérebro do perfil
    return out.copy(catDirs[ci]).multiplyScalar(R * (0.55 + 0.35 * t));
  }

  // nuvem de partículas
  const N = 6500;
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  const size = new Float32Array(N);
  const rnd = new Float32Array(N);
  const p = new THREE.Vector3();
  const c = new THREE.Color();
  const warm = new THREE.Color(1.0, 0.86, 0.68);
  for (let i = 0; i < N; i++) {
    const kind = r();
    const ci = Math.floor(r() * K);
    let bright = 0.55 + r() * 0.5;
    let s = 0.9 + Math.pow(r(), 3) * 2.2;
    if (kind < 0.1) {
      // núcleo
      randomDir(r, p).multiplyScalar(R * 0.2 * Math.pow(r(), 1.6));
      p.y *= style === "eliptica" ? 0.8 : 0.45;
      c.copy(warm).lerp(cols[ci], 0.15);
      bright = 0.35 + r() * 0.4;
    } else if (kind < 0.16) {
      // halo tênue
      randomDir(r, p).multiplyScalar(R * (0.3 + r() * 0.9));
      p.y *= 0.5;
      c.copy(cols[ci]).lerp(warm, 0.4);
      bright *= 0.35;
    } else if (kind < 0.25 && style === "barrada") {
      p.set(gauss(r) * R * 0.32, gauss(r) * R * 0.03, gauss(r) * R * 0.05);
      c.copy(warm).lerp(cols[ci], 0.3);
    } else if (kind < 0.3 && style === "anel") {
      // anel interno fino
      const th = r() * Math.PI * 2;
      const rr = R * (0.36 + gauss(r) * 0.02);
      p.set(Math.cos(th) * rr, gauss(r) * R * 0.01, Math.sin(th) * rr);
      c.copy(cols[Math.floor((th / (Math.PI * 2)) * K) % K]).lerp(warm, 0.3);
    } else {
      // braços / regiões
      const t = style === "espiral" ? Math.pow(r(), 0.8) : r();
      region(ci, t, p);
      const spread = style === "eliptica" ? R * 0.16 : style === "anel" ? R * 0.06 : style === "barrada" ? R * (0.05 + 0.05 * t) : R * (0.05 + 0.07 * t);
      p.x += gauss(r) * spread;
      p.z += gauss(r) * spread;
      p.y += gauss(r) * (style === "eliptica" ? spread : R * 0.025 * (1 - 0.5 * t));
      c.copy(cols[ci]).lerp(warm, style === "eliptica" ? 0.15 : (1 - t) * 0.35);
      if (r() < 0.08) {
        // estrelas jovens bem brilhantes nos braços
        bright = 1.4 + r();
        s *= 1.6;
      }
    }
    pos.set([p.x, p.y, p.z], i * 3);
    col.set([c.r * bright, c.g * bright, c.b * bright], i * 3);
    size[i] = s;
    rnd[i] = r();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
  g.setAttribute("aRnd", new THREE.BufferAttribute(rnd, 1));
  spin.add(new THREE.Points(g, galaxyPointMat));

  // nebulosas coloridas ao longo das regiões
  for (let i = 0; i < 18; i++) {
    const ci = i % K;
    region(ci, 0.2 + r() * 0.7, p);
    p.x += gauss(r) * R * 0.06;
    p.z += gauss(r) * R * 0.06;
    const m = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: CLOUD,
        color: cols[ci].clone().multiplyScalar(0.9),
        transparent: true,
        opacity: 0.24,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    m.position.copy(p);
    m.scale.setScalar(R * (0.28 + r() * 0.3));
    m.material.rotation = r() * Math.PI * 2;
    spin.add(m);
  }
  // núcleo brilhante
  const coreGlow = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: GLOW, color: avg.clone().lerp(warm, 0.5).multiplyScalar(0.55), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  coreGlow.scale.setScalar(R * 1.1);
  const coreHot = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: GLOW, color: new THREE.Color(1.8, 1.6, 1.35), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  coreHot.scale.setScalar(R * 0.16);
  group.add(coreGlow, coreHot);

  // neurônios do perfil viram estrelas maiores, ligadas como constelações
  const nodePos = {};
  const nPos = [];
  const nCol = [];
  const nSize = [];
  const nRnd = [];
  const addStar = (v, color, s, b) => {
    nPos.push(v.x, v.y, v.z);
    nCol.push(color.r * b, color.g * b, color.b * b);
    nSize.push(s);
    nRnd.push(r());
  };
  P.categories.forEach((cat, ci) => {
    const v = region(ci, 0.5, new THREE.Vector3());
    nodePos["__hub_" + cat.id] = v;
    addStar(v, cols[ci], 9, 2.2);
  });
  P.nodes.forEach((n) => {
    const ci = catIdx[n.category];
    if (ci === undefined) return;
    const v = region(ci, 0.15 + r() * 0.8, new THREE.Vector3());
    const j = style === "eliptica" ? R * 0.12 : R * 0.07;
    v.x += gauss(r) * j;
    v.z += gauss(r) * j;
    v.y += gauss(r) * j * 0.4;
    nodePos[n.id] = v;
    addStar(v, cols[ci], 4.5, 1.6);
  });
  const ng = new THREE.BufferGeometry();
  ng.setAttribute("position", new THREE.Float32BufferAttribute(nPos, 3));
  ng.setAttribute("color", new THREE.Float32BufferAttribute(nCol, 3));
  ng.setAttribute("aSize", new THREE.Float32BufferAttribute(nSize, 1));
  ng.setAttribute("aRnd", new THREE.Float32BufferAttribute(nRnd, 1));
  spin.add(new THREE.Points(ng, nodePointMat));
  const lp = [];
  const lc = [];
  const pushLine = (a, b, color, k) => {
    if (!a || !b) return;
    lp.push(a.x, a.y, a.z, b.x, b.y, b.z);
    lc.push(color.r * k, color.g * k, color.b * k, color.r * k, color.g * k, color.b * k);
  };
  P.nodes.forEach((n) => {
    const ci = catIdx[n.category];
    if (ci !== undefined) pushLine(nodePos["__hub_" + n.category], nodePos[n.id], cols[ci], 0.08);
  });
  P.links.forEach((l) => {
    const n = P.nodes.find((x) => x.id === l.from);
    const ci = n ? catIdx[n.category] : 0;
    pushLine(nodePos[l.from], nodePos[l.to], cols[ci] || avg, 0.11);
  });
  const lg = new THREE.BufferGeometry();
  lg.setAttribute("position", new THREE.Float32BufferAttribute(lp, 3));
  lg.setAttribute("color", new THREE.Float32BufferAttribute(lc, 3));
  spin.add(
    new THREE.LineSegments(
      lg,
      new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
    )
  );

  // rótulo flutuante com o nome (fica fora do grupo inclinado, sempre "em pé")
  const el = document.createElement("div");
  el.className = "uni-label";
  el.style.setProperty("--c", P.categories[Math.min(2, K - 1)].color);
  if (u.mine) el.classList.add("mine");
  el.innerHTML = `<span class="ul-in"><span class="ul-name">${esc(P.name)}${u.demo ? `<span class="chip-demo">exemplo</span>` : ""}${u.mine ? `<span class="chip-you">você</span>` : ""}</span><span class="ul-role">${esc(
    P.role.split(" · ")[0]
  )}</span><span class="ul-meta">${P.nodes.length} neurônios · ${K} regiões</span><span class="chip-style" title="Estilo do mapa: ${esc(styleById(normalizeStyle(P.style)).name)}">${styleById(normalizeStyle(P.style)).icon} ${esc(styleById(normalizeStyle(P.style)).short)}</span></span>`;
  el.title = `Ir em dobra até o universo de ${P.name}`;
  el.addEventListener("click", (e) => {
    e.stopPropagation();
    warpTo(gx);
  });
  const label = new CSS2DObject(el);
  label.position.copy(center).add(new THREE.Vector3(0, R * 0.62, 0));
  scene.add(label);

  const gx = { u, P, idx, style, R, center, group, spin, label, el, color: avg, dist: Infinity };
  galaxies.push(gx);
});

// luz das estrelas para iluminar o casco da nave
scene.add(new THREE.AmbientLight(0x3a4a6a, 0.4));
const sun = new THREE.DirectionalLight(0xfff1dd, 1.25);
sun.position.set(-0.6, 0.8, 0.5);
scene.add(sun);
const rim = new THREE.DirectionalLight(0x6fb7ff, 0.8);
rim.position.set(0.7, -0.2, -0.9);
scene.add(rim);

// ---------------------------------------------------------------------------
// A nave, escolhida no hangar (ships.js). Cada uma voa de um jeito: velocidade, curva, turbo e câmera.
// ---------------------------------------------------------------------------
let ship = buildShip(loadShipId());
scene.add(ship.root);
let MAX_SPEED = 85; // unidades/s na potência máxima
let BOOST = 3.4;
let TURN = 1.15; // rad/s
let ACCEL = 1.6;
function applySpec(spec) {
  ({ maxSpeed: MAX_SPEED, boost: BOOST, turn: TURN, accel: ACCEL } = spec);
}
applySpec(ship.spec);
// troca a nave ao vivo (sem recarregar) e guarda a escolha
function setShip(id, save = true) {
  const spec = shipById(id);
  if (save) saveShipId(spec.id);
  if (spec.id === ship.spec.id) return spec.id;
  const old = ship;
  ship = buildShip(spec.id);
  ship.root.position.copy(old.root.position);
  ship.root.quaternion.copy(old.root.quaternion);
  ship.hull.rotation.copy(old.hull.rotation);
  scene.remove(old.root);
  old.dispose();
  scene.add(ship.root);
  applySpec(spec);
  chaseDist = spec.chase;
  if (!reduceMotion) flash = Math.max(flash, 0.35);
  $("shipName").textContent = spec.name;
  return spec.id;
}

// ---------------------------------------------------------------------------
// Voo: teclado, mouse, câmera de perseguição e piloto automático
// ---------------------------------------------------------------------------
const S = {
  pos: new THREE.Vector3(0, 20, 120),
  yaw: 0,
  pitch: 0,
  yawRate: 0,
  pitchRate: 0,
  bank: 0,
  throttle: 0,
  speed: 0,
  boost: 0,
  mode: "manual", // manual | auto | entering
  warp: 0, // intensidade do efeito de dobra 0..1
  vel: new THREE.Vector3(),
};
const quat = new THREE.Quaternion();
const euler = new THREE.Euler(0, 0, 0, "YXZ");
const fwd = new THREE.Vector3();
const keys = new Set();
const mouse = { steering: false, down: null, x: 0, y: 0 };
let chaseDist = ship.spec.chase;
let introT = reduceMotion ? 1 : 0;

function lookAngles(from, to) {
  const d = to.clone().sub(from).normalize();
  return { yaw: Math.atan2(-d.x, -d.z), pitch: Math.asin(clamp(d.y, -1, 1)) };
}
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// ponto de partida: no centro do anel, olhando para o universo do Carlos,
// ou perto do universo de onde se voltou (multiverso.html#de=id)
{
  const m = /(?:^#|&)de=([\w-]+)/.exec(window.location.hash || "");
  const back = m && galaxies.find((g) => g.u.id === decodeURIComponent(m[1]));
  const target = back || galaxies.find((g) => g.u.id === HOME_ID) || galaxies[0];
  const out = new THREE.Vector3().copy(target.center).multiplyScalar(-1).setY(0).normalize(); // do lado de dentro do anel
  S.pos
    .copy(target.center)
    .addScaledVector(out, target.R * (back ? 2.7 : 3.9))
    .add(new THREE.Vector3(0, target.R * 0.25, 0));
  const a = lookAngles(S.pos, target.center);
  S.yaw = a.yaw;
  S.pitch = a.pitch;
}

const isTyping = (e) => e.target && e.target.matches && e.target.matches("input, textarea");
const FLIGHT = ["KeyW", "KeyS", "KeyA", "KeyD", "KeyQ", "KeyE", "Space", "ControlLeft", "ControlRight", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
window.addEventListener("keydown", (e) => {
  if (isTyping(e)) return;
  if (e.code === "Space" || e.code.startsWith("Arrow")) e.preventDefault();
  if (!hangarEl.hidden) return hangarKey(e);
  if (e.code === "KeyN") return toggleHangar(true);
  if (e.code === "KeyH" || e.key === "?") return toggleHelp();
  if (e.code === "Escape") {
    if (!helpEl.hidden) return toggleHelp(false);
    if (S.mode === "auto") cancelAuto();
    return;
  }
  if (e.code === "Enter") {
    if (e.target && e.target.closest && e.target.closest("button, a")) return; // Enter num botão é clique
    e.preventDefault();
    if (S.mode === "manual" && nearest && nearest.dist < nearest.g.R * ENTER_K) enterUniverse(nearest.g);
    return;
  }
  if (e.code === "KeyX") S.throttle = 0;
  if (FLIGHT.includes(e.code) || e.code.startsWith("Shift")) {
    keys.add(e.code);
    if (!helpEl.hidden && FLIGHT.includes(e.code)) toggleHelp(false);
    if (S.mode === "auto" && ["KeyW", "KeyS", "KeyA", "KeyD"].includes(e.code)) cancelAuto();
  }
});
window.addEventListener("keyup", (e) => keys.delete(e.code));
window.addEventListener("blur", () => keys.clear());
const k = (...codes) => (codes.some((c) => keys.has(c)) ? 1 : 0);

// mouse: segure e aponte para virar; clique rápido numa galáxia ativa o piloto automático
canvas.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  mouse.down = { x: e.clientX, y: e.clientY };
  mouse.x = e.clientX;
  mouse.y = e.clientY;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointermove", (e) => {
  mouse.x = e.clientX;
  mouse.y = e.clientY;
  if (mouse.down && !mouse.steering && Math.hypot(e.clientX - mouse.down.x, e.clientY - mouse.down.y) > 6) {
    mouse.steering = true;
    document.body.classList.add("steering");
    if (S.mode === "auto") cancelAuto();
  }
});
const endPointer = (e) => {
  if (mouse.down && !mouse.steering && e.type === "pointerup") {
    const g = pickGalaxy(e.clientX, e.clientY);
    if (g) warpTo(g);
  }
  mouse.down = null;
  mouse.steering = false;
  document.body.classList.remove("steering");
};
canvas.addEventListener("pointerup", endPointer);
canvas.addEventListener("pointercancel", endPointer);
canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    chaseDist = clamp(chaseDist * (1 + Math.sign(e.deltaY) * 0.1), 4.5, 22);
  },
  { passive: false }
);

const tmp = new THREE.Vector3();
function pickGalaxy(x, y) {
  let best = null;
  let bestD = Infinity;
  const H = window.innerHeight;
  const f = H / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  galaxies.forEach((g) => {
    tmp.copy(g.center).project(camera);
    if (tmp.z > 1) return;
    const sx = (tmp.x * 0.5 + 0.5) * window.innerWidth;
    const sy = (-tmp.y * 0.5 + 0.5) * H;
    const d = camera.position.distanceTo(g.center);
    const rad = Math.max(40, (g.R * 0.7 * f) / d);
    const px = Math.hypot(sx - x, sy - y);
    if (px < rad && d < bestD) {
      best = g;
      bestD = d;
    }
  });
  return best;
}

// Piloto automático: alinha, entra em dobra, sai perto da galáxia e vira para ela
let auto = null;
function warpTo(g) {
  if (S.mode === "entering") return;
  toggleHelp(false);
  const from = S.pos.clone();
  const toCenter = from.clone().sub(g.center);
  if (toCenter.lengthSq() < 1) toCenter.set(0, 0, 1);
  toCenter.normalize();
  const dest = g.center.clone().addScaledVector(toCenter, g.R * 2.3).add(new THREE.Vector3(0, g.R * 0.3, 0));
  const dist = from.distanceTo(dest);
  const dir = lookAngles(from, dest);
  const face = lookAngles(dest, g.center);
  auto = {
    g,
    from,
    dest,
    t: 0,
    phase: dist < g.R * 0.6 ? "arrive" : "align",
    yaw0: S.yaw,
    pitch0: S.pitch,
    dir,
    face,
    warpDur: clamp(dist / 700, 1.6, 3.4),
    dist,
  };
  if (reduceMotion) {
    // sem dobra animada: escurece, reposiciona e clareia
    fadeTo(1, 0.25);
    setTimeout(() => {
      S.pos.copy(dest);
      S.yaw = face.yaw;
      S.pitch = face.pitch;
      S.speed = S.throttle = 0;
      auto = null;
      S.mode = "manual";
      fadeTo(0, 0.3);
    }, 260);
    S.mode = "auto";
    return;
  }
  S.mode = "auto";
  S.throttle = 0;
}
function cancelAuto() {
  auto = null;
  S.mode = "manual";
  S.warp = 0;
  S.throttle = clamp(S.speed / MAX_SPEED, 0, 1);
}

const ENTER_K = 3.4; // perto = a menos de 3,4 raios da galáxia
let entering = null;
function enterUniverse(g) {
  if (S.mode === "entering") return;
  S.mode = "entering";
  auto = null;
  toggleHelp(false);
  entering = { g, t: 0, from: S.pos.clone() };
  const a = lookAngles(S.pos, g.center);
  entering.yaw0 = S.yaw;
  entering.pitch0 = S.pitch;
  entering.face = a;
  fadeEl.classList.add("white");
  fadeTo(1, reduceMotion ? 0.3 : 1.5, reduceMotion ? 0 : 0.6);
  setTimeout(() => window.location.assign(mapUrl(g.u)), reduceMotion ? 380 : 2200);
}

const fadeEl = $("fade");
function fadeTo(op, secs, delay = 0) {
  fadeEl.style.transitionDuration = secs + "s";
  fadeEl.style.transitionDelay = delay + "s";
  fadeEl.style.opacity = op;
}

function updateFlight(dt) {
  const yawIn0 = k("KeyA", "ArrowLeft") - k("KeyD", "ArrowRight");
  const pitchIn0 = k("KeyQ", "Space", "ArrowUp") - k("KeyE", "ControlLeft", "ControlRight", "ArrowDown");
  let yawIn = yawIn0;
  let pitchIn = pitchIn0;
  if (mouse.steering) {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const m = Math.min(W, H) / 2;
    const dz = (v) => Math.sign(v) * Math.max(0, Math.abs(v) - 0.06);
    yawIn -= clamp(dz((mouse.x - W / 2) / m) * 1.6, -1.2, 1.2);
    pitchIn -= clamp(dz((mouse.y - H / 2) / m) * 1.6, -1.2, 1.2);
  }

  if (S.mode === "manual") {
    S.throttle = clamp(S.throttle + (k("KeyW") - k("KeyS")) * dt * 0.75, -0.25, 1);
    S.boost = damp(S.boost, keys.has("ShiftLeft") || keys.has("ShiftRight") ? 1 : 0, 3, dt);
    const target = S.throttle * MAX_SPEED * (1 + (BOOST - 1) * S.boost * (S.throttle > 0 ? 1 : 0));
    S.speed = damp(S.speed, target, ACCEL, dt);
    S.yawRate = damp(S.yawRate, yawIn * TURN, 4, dt);
    S.pitchRate = damp(S.pitchRate, pitchIn * TURN * 0.78, 4, dt);
    S.yaw += S.yawRate * dt;
    S.pitch = clamp(S.pitch + S.pitchRate * dt, -1.35, 1.35);
    S.warp = damp(S.warp, S.boost * smooth(MAX_SPEED, MAX_SPEED * BOOST, S.speed) * 0.25, 3, dt);
  } else if (S.mode === "auto" && auto && !reduceMotion) {
    const a = auto;
    a.t += dt;
    if (a.phase === "align") {
      const k2 = smooth(0, 1, a.t / 1.1);
      S.yaw = a.yaw0 + wrapAngle(a.dir.yaw - a.yaw0) * k2;
      S.pitch = lerp(a.pitch0, a.dir.pitch, k2);
      S.speed = damp(S.speed, 10, 2, dt);
      S.pos.addScaledVector(fwdVec(), S.speed * dt);
      S.warp = smooth(0.6, 1.1, a.t) * 0.3;
      if (a.t >= 1.1) {
        a.phase = "warp";
        a.t = 0;
        a.from.copy(S.pos);
        a.dist = a.from.distanceTo(a.dest);
        flash = 0.85;
      }
    } else if (a.phase === "warp") {
      const u = clamp(a.t / a.warpDur, 0, 1);
      // perfil de velocidade: acelera forte, cruza e freia
      const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
      const prev = S.pos.clone();
      S.pos.lerpVectors(a.from, a.dest, e);
      S.speed = prev.distanceTo(S.pos) / Math.max(dt, 1e-4);
      S.warp = Math.sin(Math.PI * clamp(u * 1.08, 0, 1)) ** 0.7;
      if (u >= 1) {
        a.phase = "arrive";
        a.t = 0;
        a.yaw0 = S.yaw;
        a.pitch0 = S.pitch;
        S.speed = 12;
        flash = 0.6;
      }
    } else {
      const k2 = smooth(0, 1, a.t / 1.2);
      S.yaw = a.yaw0 + wrapAngle(a.face.yaw - a.yaw0) * k2;
      S.pitch = lerp(a.pitch0, a.face.pitch, k2);
      S.speed = damp(S.speed, 0, 2.5, dt);
      S.pos.addScaledVector(fwdVec(), S.speed * dt);
      S.warp = damp(S.warp, 0, 4, dt);
      if (a.t >= 1.3) {
        auto = null;
        S.mode = "manual";
        S.throttle = 0;
        S.speed = 0;
      }
    }
    S.yawRate = damp(S.yawRate, 0, 4, dt);
    S.pitchRate = 0;
  } else if (S.mode === "entering" && entering) {
    const e = entering;
    e.t += dt;
    const k2 = smooth(0, 0.8, e.t);
    S.yaw = e.yaw0 + wrapAngle(e.face.yaw - e.yaw0) * k2;
    S.pitch = lerp(e.pitch0, e.face.pitch, k2);
    S.speed = reduceMotion ? 0 : damp(S.speed, 340, 1.4, dt);
    S.pos.addScaledVector(fwdVec(), S.speed * dt);
    S.warp = reduceMotion ? 0 : smooth(0.3, 1.8, e.t) * 0.9;
  }

  // inclinação visual nas curvas
  S.bank = damp(S.bank, clamp(S.yawRate * 0.55, -0.7, 0.7), 3, dt);
  euler.set(S.pitch, S.yaw, 0);
  quat.setFromEuler(euler);
  if (S.mode === "manual") S.pos.addScaledVector(fwdVec(), S.speed * dt);
  ship.root.position.copy(S.pos);
  ship.root.quaternion.copy(quat);
  ship.hull.rotation.z = S.bank;
  ship.hull.rotation.x = -S.pitchRate * 0.12;
}
function fwdVec() {
  euler.set(S.pitch, S.yaw, 0);
  return fwd.set(0, 0, -1).applyEuler(euler);
}

// câmera de perseguição em 3ª pessoa, com atraso suave
const camPos = new THREE.Vector3();
const camLook = new THREE.Vector3();
const camUp = new THREE.Vector3(0, 1, 0);
let shake = 0;
function updateCamera(dt, time) {
  const intro = smooth(0, 1, introT);
  const dist = chaseDist * (1 + S.warp * 0.35) + (1 - intro) * 38;
  const off = new THREE.Vector3(lerp(9, 0, intro), ship.spec.camY + (1 - intro) * 8, dist).applyQuaternion(quat);
  const want = S.pos.clone().add(off);
  if (S.mode === "entering") want.copy(camPos); // a câmera fica e a nave mergulha na galáxia
  const kpos = S.mode === "auto" ? 6 : 4.5;
  if (!camPos.lengthSq()) camPos.copy(want);
  camPos.x = damp(camPos.x, want.x, kpos, dt);
  camPos.y = damp(camPos.y, want.y, kpos, dt);
  camPos.z = damp(camPos.z, want.z, kpos, dt);
  const look = S.pos.clone().add(new THREE.Vector3(0, 0.6, -6).applyQuaternion(quat));
  if (!camLook.lengthSq()) camLook.copy(look);
  camLook.lerp(look, 1 - Math.exp(-8 * dt));
  camera.position.copy(camPos);
  if (!reduceMotion && S.warp > 0.05) {
    shake = S.warp * 0.05;
    camera.position.x += Math.sin(time * 53) * shake;
    camera.position.y += Math.cos(time * 47) * shake;
  }
  camUp.set(0, 1, 0).applyQuaternion(quat);
  camera.up.lerp(camUp, 1 - Math.exp(-3 * dt));
  camera.lookAt(camLook);
  const fov = 58 + S.warp * 30 + smooth(MAX_SPEED, MAX_SPEED * BOOST, S.speed) * 8;
  if (Math.abs(camera.fov - fov) > 0.05) {
    camera.fov = damp(camera.fov, fov, 5, dt);
    camera.updateProjectionMatrix();
    dustU.uScale.value = (window.innerHeight * DPR) / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  }
}

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------
const helpEl = $("help");
function toggleHelp(force) {
  const show = typeof force === "boolean" ? force : helpEl.hidden;
  helpEl.hidden = !show;
}
$("helpBtn").addEventListener("click", (e) => {
  e.currentTarget.blur();
  toggleHelp();
});
$("helpClose").addEventListener("click", () => toggleHelp(false));
$("helpGo").addEventListener("click", () => toggleHelp(false));

// atalho para criar (ou editar) o próprio universo
if (MY_UNIVERSE) {
  $("criarBtn").textContent = "Editar meu universo ✎";
  $("criarBtn").title = "Editar o seu universo (salvo só neste navegador)";
}

const listEl = $("uniList");
listEl.innerHTML = galaxies
  .map(
    (g, i) =>
      `<li><button type="button" data-i="${i}" style="--c:${g.P.categories[Math.min(2, g.P.categories.length - 1)].color}" title="Ir em dobra até o universo de ${esc(
        g.P.name
      )}"><span class="dot"></span><span class="nm">${esc(g.P.name)}${g.u.demo ? `<span class="chip-demo">exemplo</span>` : ""}${g.u.mine ? `<span class="chip-you">você</span>` : ""}<span class="rl">${esc(g.P.role.split(" · ")[0])} <span class="st">· ${esc(styleById(normalizeStyle(g.P.style)).short)}</span></span></span><span class="ds" data-ds></span></button></li>`
  )
  .join("");
const listBtns = [...listEl.querySelectorAll("button")];
listBtns.forEach((b) =>
  b.addEventListener("click", () => {
    b.blur();
    warpTo(galaxies[+b.dataset.i]);
  })
);
$("enterBtn").addEventListener("click", (e) => {
  e.currentTarget.blur();
  if (nearest) enterUniverse(nearest.g);
});

const al = (d) => `${fmt(d / 10)} al`; // "anos-luz" de brincadeira
let nearest = null;
let hudT = 0;
const ui = {
  nearName: $("nearName"),
  nearDist: $("nearDist"),
  speedVal: $("speedVal"),
  speedUnit: $("speedUnit"),
  mode: $("modeLabel"),
  bar: $("throttleBar"),
  thr: $("throttleTxt"),
  boost: $("boostTxt"),
  prompt: $("prompt"),
  promptTxt: $("promptTxt"),
};
function updateHud(dt) {
  galaxies.forEach((g) => (g.dist = S.pos.distanceTo(g.center)));
  const n = galaxies.reduce((a, g) => (!a || g.dist < a.dist ? g : a), null);
  nearest = { g: n, dist: n.dist };
  const close = S.mode === "manual" && n.dist < n.R * ENTER_K;
  ui.prompt.hidden = !close;
  galaxies.forEach((g) => g.el.classList.toggle("near", g === n && close));
  // rótulos ficam discretos quando a galáxia está muito perto ou muito longe
  galaxies.forEach((g) => {
    const near = smooth(g.R * 0.9, g.R * 1.8, g.dist);
    g.el.style.opacity = (near * (0.55 + 0.45 * (1 - smooth(1200, 2600, g.dist)))).toFixed(2);
  });

  hudT -= dt;
  if (hudT > 0) return;
  hudT = 0.1;
  const name = `${n.P.name}${n.u.demo ? " (exemplo)" : n.u.mine ? " (você)" : ""}`;
  ui.nearName.textContent = name;
  ui.nearDist.textContent = close ? "ao alcance · aperte Enter" : `${al(n.dist)} · ${n.P.role.split(" · ")[0]}`;
  if (close) ui.promptTxt.textContent = `para entrar no universo de ${name}`;
  const warping = S.mode === "auto" && auto && auto.phase === "warp";
  document.body.classList.toggle("warping", warping || S.mode === "entering");
  if (warping || (S.mode === "entering" && S.warp > 0.2)) {
    ui.speedVal.textContent = fmt(1 + S.warp * 8.4, 1);
    ui.speedUnit.textContent = "fator de dobra";
  } else {
    ui.speedVal.textContent = fmt(Math.abs(S.speed) * 1000);
    ui.speedUnit.textContent = "km/s";
  }
  ui.mode.textContent =
    S.mode === "entering"
      ? `Entrando no universo de ${entering.g.P.name}`
      : S.mode === "auto"
      ? `Piloto automático → ${auto ? auto.g.P.name : ""}`
      : S.speed < -0.5
      ? "Manual · ré"
      : "Manual";
  const t = S.throttle;
  ui.bar.style.left = t >= 0 ? "20%" : `${20 + t * 80}%`;
  ui.bar.style.width = `${Math.abs(t) * 80}%`;
  ui.bar.classList.toggle("rev", t < 0);
  ui.thr.textContent = `potência ${fmt(t * 100)}%`;
  ui.boost.textContent = S.boost > 0.5 && S.mode === "manual" ? "TURBO" : "";
  listBtns.forEach((b, i) => {
    b.querySelector("[data-ds]").textContent = al(galaxies[i].dist);
    b.classList.toggle("cur", galaxies[i] === n);
  });
}

// ---------------------------------------------------------------------------
// Hangar: escolha da nave, com prévia 3D girando, barras de atributos e miniaturas
// ---------------------------------------------------------------------------
const hangarEl = $("hangar");
let hangar = null; // prévia 3D (criada na primeira vez que o hangar abre)
let helpAfterHangar = false;
let hgIdx = Math.max(0, SHIPS.findIndex((s) => s.id === ship.spec.id));
$("shipName").textContent = ship.spec.name;

function makeHangar() {
  const cv = $("hgCanvas");
  let r;
  try {
    r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, preserveDrawingBuffer: true });
  } catch (e) {
    return null;
  }
  r.setPixelRatio(DPR);
  r.setClearColor(0x000000, 0);
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.1;
  const sc = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  sc.add(new THREE.AmbientLight(0x3a4a6a, 0.5));
  const key = new THREE.DirectionalLight(0xfff1dd, 1.6);
  key.position.set(-2, 3, 2);
  const back = new THREE.DirectionalLight(0x6fb7ff, 1.0);
  back.position.set(2, -0.5, -3);
  sc.add(key, back);
  // plataforma do hangar: anéis de luz no chão
  const pad = new THREE.Group();
  [1.9, 2.25].forEach((rad, i) => {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(rad, rad + (i ? 0.02 : 0.05), 96),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 0.8, 1.6), transparent: true, opacity: i ? 0.35 : 0.7, side: THREE.DoubleSide, toneMapped: false })
    );
    ring.rotation.x = -Math.PI / 2;
    pad.add(ring);
  });
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(1.9, 64),
    new THREE.MeshBasicMaterial({ map: GLOW, color: new THREE.Color(0.15, 0.35, 0.7), transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  floor.rotation.x = -Math.PI / 2;
  pad.add(floor);
  sc.add(pad);
  const comp = new EffectComposer(r);
  comp.addPass(new RenderPass(sc, cam));
  const bl = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.75, 0.45, 0.45);
  comp.addPass(bl);
  comp.addPass(new OutputPass());
  const turn = new THREE.Group();
  sc.add(turn);
  let model = null;
  let w = 0;
  let h = 0;
  function size() {
    const W = cv.clientWidth || 420;
    const H = cv.clientHeight || 280;
    if (W === w && H === h) return;
    w = W;
    h = H;
    r.setSize(W, H, false);
    comp.setSize(W, H);
    bl.resolution.set(W / 2, H / 2);
    cam.aspect = W / H;
    cam.updateProjectionMatrix();
  }
  function show(id) {
    if (model) {
      turn.remove(model.root);
      model.dispose();
    }
    model = buildShip(id);
    turn.add(model.root);
    const d = model.spec.chase * 0.95;
    cam.position.set(d * 0.62, d * 0.34, d * 0.72);
    pad.position.y = -0.75;
    cam.lookAt(0, -0.1, 0);
  }
  const tickArgs = (time, dt) => ({ time, dt, power: 0.55 + 0.3 * Math.sin(time * 0.9), warp: 0, boost: 0, reduce: reduceMotion });
  // miniaturas: cada nave desenhada uma vez, parada, e guardada como imagem
  function thumbs() {
    size();
    const cur = model && model.spec.id;
    SHIPS.forEach((spec) => {
      show(spec.id);
      turn.rotation.y = -0.5;
      model.tick(tickArgs(1.2, 0.016));
      comp.render();
      const img = hangarEl.querySelector(`[data-ship="${spec.id}"] img`);
      if (img) img.src = cv.toDataURL("image/png");
    });
    if (cur) show(cur);
  }
  return {
    show,
    thumbs,
    render(dt, time) {
      size();
      if (!reduceMotion) turn.rotation.y += dt * 0.55;
      model.tick(tickArgs(time, dt));
      comp.render(dt);
    },
  };
}

const hgList = $("hgList");
hgList.innerHTML = SHIPS.map(
  (s, i) =>
    `<li><button type="button" data-ship="${s.id}" data-i="${i}" title="${esc(s.name)}"><img alt="" width="160" height="100"><span>${esc(s.name)}</span></button></li>`
).join("");
const hgBtns = [...hgList.querySelectorAll("button")];
function hangarPick(i, live = true) {
  hgIdx = (i + SHIPS.length) % SHIPS.length;
  const spec = SHIPS[hgIdx];
  $("hgName").textContent = spec.name;
  $("hgDesc").textContent = spec.desc;
  $("hgCount").textContent = `nave ${hgIdx + 1} de ${SHIPS.length}`;
  $("hgStats").innerHTML = shipStats(spec)
    .map(([k, v]) => `<dt>${k}</dt><dd><i style="width:${Math.round(v * 100)}%"></i></dd>`)
    .join("");
  hgBtns.forEach((b, j) => b.classList.toggle("on", j === hgIdx));
  if (hangar) hangar.show(spec.id);
  if (live) setShip(spec.id); // troca ao vivo: a nave lá fora muda junto
  $("hgCur").textContent = `pilotando agora: ${ship.spec.name}`;
}
function toggleHangar(force) {
  const show = typeof force === "boolean" ? force : hangarEl.hidden;
  if (show === !hangarEl.hidden) return;
  hangarEl.hidden = !show;
  document.body.classList.toggle("in-hangar", show);
  if (show) {
    toggleHelp(false);
    keys.clear();
    if (S.mode === "auto") cancelAuto();
    if (!hangar) {
      hangar = makeHangar();
      if (hangar) {
        hangar.thumbs();
      }
    }
    hangarPick(SHIPS.findIndex((s) => s.id === ship.spec.id), false);
    hgBtns[hgIdx].focus({ preventScroll: true });
  } else {
    hangarEl.querySelectorAll(":focus").forEach((el) => el.blur());
    if (helpAfterHangar) {
      helpAfterHangar = false;
      toggleHelp(true);
    }
  }
}
function hangarKey(e) {
  if (e.code === "ArrowLeft" || e.code === "KeyA") hangarPick(hgIdx - 1);
  else if (e.code === "ArrowRight" || e.code === "KeyD") hangarPick(hgIdx + 1);
  else if (e.code === "Escape" || e.code === "KeyN") toggleHangar(false);
  else if (e.code === "Enter") {
    e.preventDefault(); // Enter decola com a nave escolhida (mesmo com o foco num botão do hangar)
    toggleHangar(false);
  }
}
hgBtns.forEach((b) =>
  b.addEventListener("click", () => {
    const same = +b.dataset.i === hgIdx && ship.spec.id === SHIPS[hgIdx].id;
    hangarPick(+b.dataset.i);
    if (same) toggleHangar(false); // segundo clique na mesma nave: decola
  })
);
$("hgPrev").addEventListener("click", () => hangarPick(hgIdx - 1));
$("hgNext").addEventListener("click", () => hangarPick(hgIdx + 1));
$("hgGo").addEventListener("click", () => toggleHangar(false));
$("hangarClose").addEventListener("click", () => toggleHangar(false));
$("hangarBtn").addEventListener("click", (e) => {
  e.currentTarget.blur();
  toggleHangar();
});
$("helpHangar").addEventListener("click", () => toggleHangar(true));

// ---------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------
function onResize() {
  const W = window.innerWidth;
  const H = window.innerHeight;
  camera.aspect = W / H;
  camera.updateProjectionMatrix();
  renderer.setSize(W, H, false);
  composer.setPixelRatio(DPR);
  composer.setSize(W, H);
  bloom.resolution.set(W / 2, H / 2);
  cinema.uniforms.uRes.value.set(W, H);
  labelRenderer.setSize(W, H);
  dustU.uScale.value = (H * DPR) / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
}
window.addEventListener("resize", onResize);
onResize();

const clock = new THREE.Clock();
let flash = 0;
let frames = 0;
const fps = { t: performance.now(), n: 0, v: 0 };
function frame() {
  if (++fps.n >= 10) {
    const now = performance.now();
    fps.v = (fps.n * 1000) / (now - fps.t);
    fps.t = now;
    fps.n = 0;
  }
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.1);
  const time = clock.elapsedTime;
  if (frames > 0) introT = Math.min(1, introT + dt / 2.6);

  updateFlight(dt);
  updateCamera(dt, time);
  updateHud(dt);

  // galáxias girando devagar
  if (!reduceMotion) galaxies.forEach((g, i) => (g.spin.rotation.y += dt * (0.012 + i * 0.002)));

  // nave: motores, luzes e efeitos de cada modelo
  const power = clamp(Math.abs(S.speed) / MAX_SPEED, 0, 1.5) + S.warp * 2;
  ship.tick({ time, dt, power, warp: S.warp, boost: S.boost, reduce: reduceMotion });
  if (!hangarEl.hidden && hangar) hangar.render(dt, time);

  // fundo acompanha a câmera; poeira e riscos de dobra
  sky.position.copy(camera.position);
  skyU.uTime.value = time;
  dustU.uCam.value.copy(camera.position);
  const v = fwdVec().clone();
  const streak = (reduceMotion ? 0 : S.warp) * 90 + Math.abs(S.speed) * 0.035;
  dustU.uTail.value.copy(v).multiplyScalar(streak);
  dustU.uAlpha.value = 0.55 + S.warp * 0.6;
  streaks.visible = streak > 0.6;

  // pós-processamento
  flash = Math.max(0, flash - dt * 2.2);
  cinema.uniforms.uWarp.value = reduceMotion ? 0 : S.warp;
  cinema.uniforms.uFlash.value = reduceMotion ? 0 : flash;
  cinema.uniforms.uTime.value = time;
  bloom.strength = 0.85 + S.warp * 0.5;

  composer.render(dt);
  labelRenderer.render(scene, camera);
  if (frames++ === 1) {
    $("loading").classList.add("off");
    fadeTo(0, reduceMotion ? 0.3 : 1.4);
  }
}
requestAnimationFrame(frame);

// na primeira visita: primeiro o hangar (escolher a nave), depois os controles
let seen = null;
try {
  seen = localStorage.getItem("infome-nave-ajuda");
  localStorage.setItem("infome-nave-ajuda", "1");
} catch (e) {}
helpEl.hidden = true;
if (!seen) {
  helpAfterHangar = true;
  toggleHangar(true);
}

// para testes automatizados e curiosos no console
window.__multiverso = {
  get state() {
    return { mode: S.mode, speed: S.speed, throttle: S.throttle, warp: S.warp, pos: S.pos.toArray(), yaw: S.yaw, pitch: S.pitch };
  },
  get fps() {
    return fps.v;
  },
  // coloca a nave perto de uma galáxia (k raios de distância), olhando para ela
  place(id, k = 2.5) {
    const g = galaxies.find((x) => x.u.id === id);
    if (!g) return false;
    const out = g.center.clone().multiplyScalar(-1).setY(0).normalize();
    S.pos.copy(g.center).addScaledVector(out, g.R * k).add(new THREE.Vector3(0, g.R * 0.25, 0));
    const a = lookAngles(S.pos, g.center);
    Object.assign(S, { yaw: a.yaw, pitch: a.pitch, speed: 0, throttle: 0, mode: "manual" });
    auto = null;
    camPos.set(0, 0, 0);
    camLook.set(0, 0, 0);
    return true;
  },
  get nearest() {
    return nearest && { id: nearest.g.u.id, dist: nearest.dist, R: nearest.g.R, inRange: nearest.dist < nearest.g.R * ENTER_K };
  },
  universes: galaxies.map((g) => ({ id: g.u.id, name: g.P.name, demo: g.u.demo, mine: !!g.u.mine, center: g.center.toArray(), R: g.R })),
  get ship() {
    return ship.spec.id;
  },
  ships: SHIPS.map((s) => s.id),
  setShip: (id) => setShip(id),
  get hangarOpen() {
    return !hangarEl.hidden;
  },
  openHangar: () => toggleHangar(true),
  warpTo: (id) => {
    const g = galaxies.find((x) => x.u.id === id);
    if (g) warpTo(g);
    return !!g;
  },
};
console.log("%cmultiverso%c  W/S acelera · A/D vira · Q/E sobe e desce · Shift turbo · H ajuda", "color:#38bdf8;font:bold 14px monospace", "color:#7dd3fc;font:12px monospace");
