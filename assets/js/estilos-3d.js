// Estilos 3D de um universo. Cada estilo recebe os mesmos neurônios (núcleo, regiões e itens) e decide:
//   - layout(nodes): onde fica cada um (e o tamanho de cada tipo, em `radii`);
//   - animate(nodes, t): movimento contínuo, nos estilos com órbitas (`dynamic: true`);
//   - curve(e): o desenho de cada conexão (curva, arco no céu, trilha de cobre...);
//   - build(env): o "cenário" que substitui o cérebro de partículas (estrela e planetas, céu, placa...),
//     com setTheme(tema), update(quadro) e dispose().
// Também diz como a câmera olha (`view`), se a cena gira (`spin`) e o raio que precisa caber na tela (`fit`).
// Usado pelo mapa (main.js) e pela prévia do editor (criar-preview.js).
import * as THREE from "three";
import { STYLES, normalizeStyle } from "./estilos.js";

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// gerador pseudoaleatório estável a partir de um texto (o mesmo perfil sempre dá o mesmo desenho)
function rngStr(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// o gerador "clássico" do cérebro (mantém o mapa neural idêntico ao de antes)
function lcg(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}
function dirFrom(rand, out = V()) {
  const z = rand() * 2 - 1;
  const a = rand() * TAU;
  const r = Math.sqrt(1 - z * z);
  return out.set(r * Math.cos(a), z, r * Math.sin(a));
}
const gauss = (r) => (r() + r() + r() + r() - 2) / 2;

// ---------------------------------------------------------------------------
// Texturas geradas (criadas uma vez e compartilhadas)
// ---------------------------------------------------------------------------
const KEEP = new Set(); // texturas e geometrias que não são descartadas ao trocar de estilo
function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const lazy = (make) => {
  let v = null;
  return () => {
    if (!v) {
      v = make();
      KEEP.add(v);
    }
    return v;
  };
};
const radial = (stops) => (g, s) => {
  const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  stops.forEach(([o, a]) => r.addColorStop(o, `rgba(255,255,255,${a})`));
  g.fillStyle = r;
  g.fillRect(0, 0, s, s);
};
// estrela com raios em cruz (constelação)
export const STAR_TEX = lazy(() =>
  canvasTex(128, 128, (g, s) => {
    radial([[0, 1], [0.07, 0.85], [0.22, 0.18], [0.55, 0]])(g, s);
    g.globalCompositeOperation = "lighter";
    [true, false].forEach((horiz) => {
      const gr = horiz ? g.createLinearGradient(0, 0, s, 0) : g.createLinearGradient(0, 0, 0, s);
      gr.addColorStop(0, "rgba(255,255,255,0)");
      gr.addColorStop(0.5, "rgba(255,255,255,0.95)");
      gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr;
      if (horiz) g.fillRect(0, s / 2 - 1.3, s, 2.6);
      else g.fillRect(s / 2 - 1.3, 0, 2.6, s);
    });
  }, false)
);
const CLOUD_TEX = lazy(() =>
  canvasTex(128, 128, (g, s) => {
    const r = rngStr("nebulosa");
    for (let i = 0; i < 30; i++) {
      const x = s / 2 + gauss(r) * s * 0.2;
      const y = s / 2 + gauss(r) * s * 0.2;
      const rad = s * (0.1 + r() * 0.22);
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, "rgba(255,255,255,0.15)");
      gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr;
      g.fillRect(0, 0, s, s);
    }
  }, false)
);
// faixas de planeta gasoso
const BANDS_TEX = lazy(() =>
  canvasTex(256, 128, (g, w, h) => {
    const r = rngStr("faixas");
    for (let y = 0; y < h; y++) {
      const v = 150 + 70 * Math.sin(y * 0.19 + Math.sin(y * 0.05) * 3) + (r() - 0.5) * 24;
      g.fillStyle = `rgb(${v | 0},${v | 0},${v | 0})`;
      g.fillRect(0, y, w, 1);
    }
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(255,255,255,${0.05 + r() * 0.1})`;
      g.beginPath();
      g.ellipse(r() * w, r() * h, 6 + r() * 20, 2 + r() * 4, 0, 0, TAU);
      g.fill();
    }
  })
);

// helpers de cenário
const additiveSprite = (tex, color, scale, opacity = 1) => {
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })
  );
  s.scale.setScalar(scale);
  s.userData.op = opacity;
  return s;
};
const lineMat = (color, opacity) =>
  new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
function circlePts(n, fn) {
  const pts = [];
  for (let i = 0; i < n; i++) pts.push(fn((i / n) * TAU));
  return new THREE.BufferGeometry().setFromPoints(pts);
}
function disposeGroup(group) {
  group.traverse((o) => {
    if (o.geometry && !KEEP.has(o.geometry)) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    mats.forEach((m) => {
      ["map", "emissiveMap"].forEach((k) => m[k] && !KEEP.has(m[k]) && m[k].dispose());
      if (m.uniforms) Object.values(m.uniforms).forEach((u) => u.value && u.value.isTexture && !KEEP.has(u.value) && u.value.dispose());
      m.dispose();
    });
  });
}
// opacidade de todo o cenário acompanha a chegada (aparece junto com o mapa)
function fadeAll(group, k) {
  group.traverse((o) => {
    const m = o.material;
    if (!m || Array.isArray(m) || !m.transparent) return;
    if (o.userData.op == null) o.userData.op = m.opacity;
    m.opacity = o.userData.op * k;
  });
}

// ---------------------------------------------------------------------------
// Curvas das conexões
// ---------------------------------------------------------------------------
// linha poligonal (trilhas da placa): ponto por comprimento e amostras que passam pelos vértices
class Poly extends THREE.Curve {
  constructor(pts) {
    super();
    this.pts = pts.filter((p, i) => i === 0 || p.distanceTo(pts[i - 1]) > 1e-5);
    if (this.pts.length < 2) this.pts.push(this.pts[0].clone());
    this.lens = [];
    this.total = 0;
    for (let i = 1; i < this.pts.length; i++) {
      const l = this.pts[i].distanceTo(this.pts[i - 1]);
      this.lens.push(l);
      this.total += l;
    }
  }
  getPoint(t, target = V()) {
    let d = clamp(t, 0, 1) * this.total;
    for (let i = 0; i < this.lens.length; i++) {
      if (d <= this.lens[i] || i === this.lens.length - 1) {
        const k = this.lens[i] ? clamp(d / this.lens[i], 0, 1) : 0;
        return target.lerpVectors(this.pts[i], this.pts[i + 1], k);
      }
      d -= this.lens[i];
    }
    return target.copy(this.pts[this.pts.length - 1]);
  }
  getPoints(n) {
    const legs = this.lens.length;
    if (legs > n || !this.total) return super.getPoints(n);
    const div = this.lens.map((l) => Math.max(1, Math.floor((n * l) / this.total)));
    let sum = div.reduce((a, b) => a + b, 0);
    while (sum < n) {
      div[this.lens.indexOf(Math.max(...this.lens))]++;
      sum++;
    }
    while (sum > n) {
      let j = 0;
      div.forEach((d, i) => (d > div[j] ? (j = i) : 0));
      div[j]--;
      sum--;
    }
    const out = [this.pts[0].clone()];
    div.forEach((d, i) => {
      for (let s = 1; s <= d; s++) out.push(V().lerpVectors(this.pts[i], this.pts[i + 1], s / d));
    });
    return out;
  }
}
// arco sobre uma esfera (constelação): as linhas seguem a curvatura do céu
class SphereArc extends THREE.Curve {
  constructor(a, b) {
    super();
    this.a = a.clone();
    this.b = b.clone();
    this.ra = a.length();
    this.rb = b.length();
    this.da = a.clone().normalize();
    this.db = b.clone().normalize();
    this.ang = this.da.angleTo(this.db);
  }
  getPoint(t, target = V()) {
    if (this.ang < 1e-4) return target.lerpVectors(this.a, this.b, t);
    const s = Math.sin(this.ang);
    const ka = Math.sin((1 - t) * this.ang) / s;
    const kb = Math.sin(t * this.ang) / s;
    return target.copy(this.da).multiplyScalar(ka).addScaledVector(this.db, kb).normalize().multiplyScalar(this.ra + (this.rb - this.ra) * t);
  }
}
// arco ao longo de uma órbita (átomo)
class OrbitArc extends THREE.Curve {
  constructor(u, v, a, a0, a1) {
    super();
    Object.assign(this, { u, v, a, a0, a1 });
  }
  getPoint(t, target = V()) {
    const ang = this.a0 + (this.a1 - this.a0) * t;
    return target.copy(this.u).multiplyScalar(Math.cos(ang) * this.a).addScaledVector(this.v, Math.sin(ang) * this.a);
  }
}
function bulge(a, b, k) {
  const mid = a.clone().add(b).multiplyScalar(0.5);
  return new THREE.QuadraticBezierCurve3(a.clone(), mid.clone().add(mid.clone().multiplyScalar(k)), b.clone());
}

const hubsOf = (nodes) => nodes.filter((n) => n.kind === "hub");
const coreOf = (nodes) => nodes.find((n) => n.kind === "core");
function leavesByHub(nodes) {
  const m = new Map();
  hubsOf(nodes).forEach((h) => m.set(h, []));
  nodes.forEach((n) => {
    if (n.kind !== "leaf") return;
    const h = n.links.find((l) => l.e.kind === "tree");
    if (h && m.has(h.other)) m.get(h.other).push(n);
  });
  return m;
}

// ===========================================================================
// 1. Mente neural: o cérebro de partículas
// ===========================================================================
const HEMI = { r: [2.1, 2.6, 3.9], cx: 1.5, cy: 0.2 };
function brainPoint(u, h) {
  const gyri = 0.06 * Math.sin(u.x * 11 + u.y * 7) * Math.sin(u.z * 9 - u.y * 5) + 0.03 * Math.sin(u.z * 23 + u.x * 17);
  let x = u.x * HEMI.r[0];
  if (u.x * h < 0) x *= 0.62; // parede interna mais reta
  let y = u.y * HEMI.r[1];
  if (u.y < -0.2) y *= 0.8;
  const z = u.z * HEMI.r[2];
  return V(h * HEMI.cx + x * (1 + gyri), HEMI.cy + y * (1 + gyri), z * (1 + gyri));
}
function insideBrain(p, k = 0.8) {
  for (const h of [-1, 1]) {
    const x = (p.x - h * HEMI.cx) / (HEMI.r[0] * k);
    const y = (p.y - HEMI.cy) / (HEMI.r[1] * k);
    const z = p.z / (HEMI.r[2] * k);
    if (x * x + y * y + z * z < 1) return true;
  }
  return false;
}
// pontos do cérebro (forma fixa: calculada uma vez)
const brainGeo = lazy(() => {
  const rand = lcg(1234);
  const pts = [];
  const K = [];
  const push = (v, k) => {
    pts.push(v.x, v.y, v.z);
    K.push(k);
  };
  for (let i = 0; i < 26000; i++) push(brainPoint(dirFrom(rand), i % 2 ? 1 : -1), rand());
  for (let i = 0; i < 3600; i++) {
    const u = dirFrom(rand);
    push(V(u.x * 2.1, -1.75 + u.y * 0.8 * (1 + 0.08 * Math.sin(u.y * 30)), 2.5 + u.z * 1.1), rand() * 0.5);
  }
  for (let i = 0; i < 1200; i++) {
    const t = rand();
    const a = rand() * TAU;
    push(V(Math.cos(a) * 0.45, -1.4 - t * 2, 1.3 + t * 0.5 + Math.sin(a) * 0.45), rand() * 0.3);
  }
  for (let i = 0; i < 5000; i++) {
    const u = dirFrom(rand).multiplyScalar(Math.cbrt(rand()) * 0.9);
    push(brainPoint(u, rand() < 0.5 ? 1 : -1), 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(K.length * 3), 3));
  g.setAttribute("aRnd", new THREE.BufferAttribute(new Float32Array(K.length).map(() => rand()), 1));
  g.userData.k = K;
  return g;
});

const neural = {
  id: "neural",
  fit: 4.6,
  view: { az: 0.7, el: 0.16 },
  spin: "full",
  radii: { core: 0.26, hub: 0.16, leaf: 0.085 },
  edgeAlpha: { core: 1, tree: 1, link: 1 },
  layout(nodes) {
    const core = coreOf(nodes);
    core.pos.set(0, 0.3, 0.2);
    hubsOf(nodes).forEach((h) => h.pos.set(...h.cat.pos).multiplyScalar(1.15));
    const rand = lcg(42);
    const leaves = nodes.filter((n) => n.kind === "leaf");
    leaves.forEach((n) => {
      const hub = n.links.find((l) => l.e.kind === "tree").other;
      n.pos.copy(hub.pos).add(dirFrom(rand).multiplyScalar(0.7 + rand() * 0.5));
    });
    // relaxamento de forças: espalha os neurônios sem sobreposição e dentro do cérebro
    const tmp = V();
    const f = V();
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
  },
  curve: (e) => bulge(e.a.pos, e.b.pos, e.kind === "link" ? 0.18 : 0.08),
  build(env) {
    const group = new THREE.Group();
    const geo = brainGeo();
    const U = {
      uTime: { value: 0 },
      uSize: { value: 0.05 },
      uScale: { value: 400 },
      uOpacity: { value: 0 },
      uDot: { value: env.tex.DOT },
      uFire: { value: new THREE.Color(0xd9fff0) },
    };
    // pontos com brilho próprio: cintilam e são varridos por ondas de disparo sináptico
    const mat = new THREE.ShaderMaterial({
      uniforms: U,
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
    group.add(new THREE.Points(geo, mat));
    return {
      group,
      setTheme(t) {
        const a = new THREE.Color(t.a);
        const b = new THREE.Color(t.b);
        const c = new THREE.Color();
        const col = geo.attributes.color;
        geo.userData.k.forEach((k, i) => {
          c.copy(a).lerp(b, k);
          col.setXYZ(i, c.r, c.g, c.b);
        });
        col.needsUpdate = true;
        U.uFire.value.set(t.fire);
      },
      update(f) {
        U.uTime.value = f.time;
        U.uSize.value = 0.03 * f.scale;
        U.uScale.value = f.pxScale;
        U.uOpacity.value = clamp((f.p - 0.16) / 0.2, 0, 1) * 0.6;
      },
      dispose: () => disposeGroup(group),
    };
  },
};

// ===========================================================================
// 2. Sistema solar: a pessoa é a estrela, as regiões são planetas e os itens, luas
// ===========================================================================
const solar = {
  id: "solar",
  fit: 6.3,
  view: { az: 0.55, el: 0.62 },
  spin: "none",
  dynamic: true,
  radii: { core: 0.5, hub: 0.24, leaf: 0.07 },
  edgeAlpha: { core: 0.35, tree: 0.45, link: 0.9 },
  hideMesh: (n) => n.kind !== "leaf",
  layout(nodes) {
    const hubs = hubsOf(nodes);
    const K = hubs.length;
    const r = rngStr("solar");
    const groups = leavesByHub(nodes);
    hubs.forEach((h, i) => {
      const a = K === 1 ? 2.8 : 1.8 + (i * 4.4) / (K - 1);
      const tilt = 0.35 + r() * 0.5;
      h.orb = {
        a,
        w: 0.42 / Math.pow(a, 1.5),
        ph: i * 2.39996 + 0.5,
        inc: (r() - 0.5) * 0.14,
        node: r() * TAU,
        q: new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, r() * TAU, 0, "YXZ")),
        rings: [],
      };
      const moons = groups.get(h);
      let j = 0;
      let ring = 0;
      while (j < moons.length) {
        const cap = ring === 0 ? 6 : 8 + ring * 2;
        const count = Math.min(cap, moons.length - j);
        const rr = 0.62 + ring * 0.36;
        h.orb.rings.push(rr);
        for (let k = 0; k < count; k++, j++) moons[j].orb = { rr, w: (ring % 2 ? -0.16 : 0.2) / (0.6 + rr), ph: (k / count) * TAU + ring * 0.4, hub: h };
        ring++;
      }
    });
    coreOf(nodes).pos.set(0, 0, 0);
    nodes.forEach((n) => n.kind === "leaf" && !n.orb && n.pos.set(0, 0, 0));
    this.animate(nodes, 0);
  },
  animate(nodes, t) {
    const tmp = V();
    nodes.forEach((h) => {
      if (h.kind !== "hub" || !h.orb) return;
      const o = h.orb;
      const ang = o.ph + o.w * t;
      h.pos.set(Math.cos(ang) * o.a, Math.sin(ang - o.node) * o.a * Math.sin(o.inc), Math.sin(ang) * o.a);
    });
    nodes.forEach((n) => {
      if (n.kind !== "leaf" || !n.orb) return;
      const o = n.orb;
      const ang = o.ph + o.w * t;
      tmp.set(Math.cos(ang) * o.rr, 0, Math.sin(ang) * o.rr).applyQuaternion(o.hub.orb.q);
      n.pos.copy(o.hub.pos).add(tmp);
    });
  },
  curve(e) {
    if (e.kind === "core" || e.kind === "tree") return new THREE.LineCurve3(e.a.pos.clone(), e.b.pos.clone());
    // conexões entre luas fazem um arco por cima do plano das órbitas
    const a = e.a.pos;
    const b = e.b.pos;
    const mid = a.clone().add(b).multiplyScalar(0.5);
    mid.y += 0.25 + a.distanceTo(b) * 0.22;
    return new THREE.QuadraticBezierCurve3(a.clone(), mid, b.clone());
  },
  build(env) {
    const group = new THREE.Group();
    const nodes = env.nodes;
    const core = coreOf(nodes);
    const hubs = hubsOf(nodes);
    // a estrela: superfície animada com granulação
    const sunU = { uTime: { value: 0 }, uHot: { value: new THREE.Color(1.0, 0.85, 0.45) }, uCool: { value: new THREE.Color(1.0, 0.38, 0.06) } };
    const sun = new THREE.Mesh(
      new THREE.SphereGeometry(1, 48, 32),
      new THREE.ShaderMaterial({
        uniforms: sunU,
        vertexShader: `
          varying vec3 vP; varying vec3 vN;
          void main() { vP = position; vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `
          uniform float uTime; uniform vec3 uHot, uCool;
          varying vec3 vP; varying vec3 vN;
          float h(vec3 p) { return fract(sin(dot(p, vec3(17.1, 113.7, 71.3))) * 43758.5453); }
          float n(vec3 p) {
            vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
            return mix(mix(mix(h(i), h(i + vec3(1,0,0)), f.x), mix(h(i + vec3(0,1,0)), h(i + vec3(1,1,0)), f.x), f.y),
                       mix(mix(h(i + vec3(0,0,1)), h(i + vec3(1,0,1)), f.x), mix(h(i + vec3(0,1,1)), h(i + vec3(1,1,1)), f.x), f.y), f.z);
          }
          float fbm(vec3 p) { float v = 0.0, a = 0.5; for (int k = 0; k < 5; k++) { v += a * n(p); p *= 2.07; a *= 0.5; } return v; }
          void main() {
            float q = fbm(vP * 3.2 + vec3(0.0, uTime * 0.07, 0.0) + fbm(vP * 2.0 - uTime * 0.05));
            float g = fbm(vP * 11.0 + uTime * 0.2);
            vec3 c = mix(uCool, uHot, smoothstep(0.3, 0.75, q));
            c += vec3(1.0, 0.95, 0.75) * pow(g, 3.0) * 0.9;
            float rim = pow(1.0 - abs(vN.z), 2.2);
            c = mix(c, uCool * 1.4, rim * 0.6);
            gl_FragColor = vec4(c * 1.9, 1.0);
          }`,
        fog: false,
      })
    );
    group.add(sun);
    const corona = additiveSprite(env.tex.GLOW, new THREE.Color(1.0, 0.6, 0.22), 1, 0.9);
    const corona2 = additiveSprite(env.tex.GLOW, new THREE.Color(1.0, 0.45, 0.15), 1, 0.35);
    group.add(corona, corona2);
    const light = new THREE.PointLight(0xffe2b8, 34, 0, 1.25);
    group.add(light, new THREE.AmbientLight(0x6b7a99, 0.35));

    // órbitas, planetas (com anéis em alguns), anéis das luas
    const planets = [];
    hubs.forEach((h, i) => {
      const o = h.orb;
      const c = new THREE.Color(h.color);
      group.add(
        new THREE.LineLoop(
          circlePts(160, (ang) => V(Math.cos(ang) * o.a, Math.sin(ang - o.node) * o.a * Math.sin(o.inc), Math.sin(ang) * o.a)),
          lineMat(c.clone().multiplyScalar(0.55), 0.5)
        )
      );
      const pr = 0.24 + Math.min(0.12, o.rings.length * 0.03 + (i % 3) * 0.02);
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(1, 40, 24),
        new THREE.MeshStandardMaterial({ color: c, map: BANDS_TEX(), roughness: 0.75, metalness: 0.05, emissive: c.clone().multiplyScalar(0.12), fog: false })
      );
      mesh.rotation.z = 0.3 + (i % 4) * 0.15;
      const pg = new THREE.Group();
      pg.add(mesh);
      if (i % 3 === 1) {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(1.45, 2.3, 64),
          new THREE.MeshBasicMaterial({ color: c.clone().lerp(new THREE.Color(1, 1, 1), 0.4), transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, fog: false })
        );
        ring.rotation.x = -Math.PI / 2 + 0.45;
        mesh.add(ring);
      }
      const moonRings = new THREE.Group();
      moonRings.quaternion.copy(o.q);
      o.rings.forEach((rr) => moonRings.add(new THREE.LineLoop(circlePts(72, (a) => V(Math.cos(a) * rr, 0, Math.sin(a) * rr)), lineMat(c.clone().multiplyScalar(0.5), 0.35))));
      group.add(pg, moonRings);
      planets.push({ h, pg, mesh, pr, moonRings });
    });

    // cinturão de asteroides depois do último planeta
    const amax = hubs.length ? Math.max(...hubs.map((h) => h.orb.a)) : 2.6;
    const r = rngStr("cinturao");
    const N = 2200;
    const bp = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const a = r() * TAU;
      const rad = amax + 0.75 + gauss(r) * 0.28;
      bp.set([Math.cos(a) * rad, gauss(r) * 0.07, Math.sin(a) * rad], i * 3);
    }
    const bg = new THREE.BufferGeometry();
    bg.setAttribute("position", new THREE.BufferAttribute(bp, 3));
    const beltMat = new THREE.PointsMaterial({ size: 0.045, map: env.tex.DOT, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const belt = new THREE.Points(bg, beltMat);
    group.add(belt);

    return {
      group,
      setTheme(t) {
        beltMat.color.set(t.dust);
      },
      update(f) {
        sunU.uTime.value = f.time;
        const cs = core.r * (0.3 + 0.7 * core.vis);
        sun.scale.setScalar(cs);
        corona.scale.setScalar(cs * 5.5);
        corona2.scale.setScalar(cs * 12);
        planets.forEach((pl) => {
          pl.pg.position.copy(pl.h.pos);
          pl.moonRings.position.copy(pl.h.pos);
          pl.pg.scale.setScalar(pl.pr * (0.2 + 0.8 * pl.h.vis) * (pl.h.hot ? 1.25 : 1));
          pl.mesh.rotation.y = f.time * 0.25;
        });
        belt.rotation.y = f.time * 0.01;
        fadeAll(group, f.appear);
      },
      dispose: () => disposeGroup(group),
    };
  },
};

// ===========================================================================
// 3. Constelação: estrelas na abóbada do céu, uma constelação (e nebulosa) por região
// ===========================================================================
const SKY_R = 4.3;
const constelacao = {
  id: "constelacao",
  fit: 6.1,
  view: { az: 0.7, el: 0.2 },
  spin: "full",
  spinSpeed: 0.05,
  radii: { core: 0.22, hub: 0.15, leaf: 0.075 },
  edgeAlpha: { core: 0.12, tree: 1.25, link: 0.8 },
  glow: "star",
  layout(nodes) {
    const r = rngStr("ceu");
    coreOf(nodes).pos.set(0, 0, 0);
    const hubs = hubsOf(nodes);
    hubs.forEach((h) => {
      const d = V(...h.cat.pos);
      if (d.lengthSq() < 1e-6) dirFrom(r, d);
      h.pos.copy(d.normalize().multiplyScalar(SKY_R));
    });
    const groups = leavesByHub(nodes);
    const t1 = V();
    const t2 = V();
    groups.forEach((list, h) => {
      const d = h.pos.clone().normalize();
      t1.set(0, 1, 0).cross(d);
      if (t1.lengthSq() < 1e-4) t1.set(1, 0, 0);
      t1.normalize();
      t2.copy(d).cross(t1).normalize();
      list.forEach((n, j) => {
        const a = j * 2.39996 + r() * 0.6;
        const rad = 0.17 + 0.075 * Math.sqrt(j + 1) + r() * 0.05;
        n.pos.copy(d).addScaledVector(t1, Math.cos(a) * rad).addScaledVector(t2, Math.sin(a) * rad).normalize().multiplyScalar(SKY_R);
      });
    });
    // espalha as estrelas sobre a esfera sem sobreposição
    const leaves = nodes.filter((n) => n.kind === "leaf");
    const sky = nodes.filter((n) => n.kind !== "core");
    const tmp = V();
    const f = V();
    for (let it = 0; it < 160; it++) {
      const cool = 1 - it / 160;
      leaves.forEach((n) => {
        f.set(0, 0, 0);
        sky.forEach((m) => {
          if (m === n) return;
          tmp.copy(n.pos).sub(m.pos);
          const d = tmp.length() || 0.01;
          const min = m.kind === "leaf" ? 0.95 : 1.1;
          if (d < min) f.add(tmp.multiplyScalar(((min - d) / d) * 0.4));
        });
        n.links.forEach(({ other, e }) => {
          if (e.kind !== "tree") return;
          tmp.copy(other.pos).sub(n.pos);
          const d = tmp.length() || 0.01;
          if (d > 1.0) f.add(tmp.multiplyScalar(((d - 1.0) / d) * 0.06));
        });
        n.pos.add(f.multiplyScalar(cool)).normalize().multiplyScalar(SKY_R);
      });
    }
    // um pouco de profundidade para não parecer uma bola lisa
    leaves.forEach((n) => n.pos.multiplyScalar(1 + (r() - 0.5) * 0.05));
  },
  curve(e) {
    if (e.kind === "core") return new THREE.LineCurve3(e.a.pos.clone(), e.b.pos.clone());
    return new SphereArc(e.a.pos, e.b.pos);
  },
  build(env) {
    const group = new THREE.Group();
    // grade celeste (paralelos e meridianos)
    const gp = [];
    const R = SKY_R * 1.004;
    for (let lat = -60; lat <= 60; lat += 30) {
      const y = Math.sin((lat * Math.PI) / 180) * R;
      const rr = Math.cos((lat * Math.PI) / 180) * R;
      for (let i = 0; i < 96; i++) {
        const a0 = (i / 96) * TAU;
        const a1 = ((i + 1) / 96) * TAU;
        gp.push(Math.cos(a0) * rr, y, Math.sin(a0) * rr, Math.cos(a1) * rr, y, Math.sin(a1) * rr);
      }
    }
    for (let m = 0; m < 12; m++) {
      const lon = (m / 12) * TAU;
      for (let i = 0; i < 48; i++) {
        const b0 = -Math.PI / 2 + (i / 48) * Math.PI;
        const b1 = -Math.PI / 2 + ((i + 1) / 48) * Math.PI;
        gp.push(
          Math.cos(b0) * Math.cos(lon) * R, Math.sin(b0) * R, Math.cos(b0) * Math.sin(lon) * R,
          Math.cos(b1) * Math.cos(lon) * R, Math.sin(b1) * R, Math.cos(b1) * Math.sin(lon) * R
        );
      }
    }
    const gg = new THREE.BufferGeometry();
    gg.setAttribute("position", new THREE.Float32BufferAttribute(gp, 3));
    const gridMat = lineMat(0x88aaff, 0.09);
    group.add(new THREE.LineSegments(gg, gridMat));
    // equador celeste um pouco mais forte
    const eqMat = lineMat(0x88aaff, 0.22);
    group.add(new THREE.LineLoop(circlePts(160, (a) => V(Math.cos(a) * R, 0, Math.sin(a) * R)), eqMat));

    // poeira de estrelas na abóbada (com uma faixa mais densa, como a Via Láctea)
    const r = rngStr("abobada");
    const N = 6000;
    const sp = new Float32Array(N * 3);
    const sc = new Float32Array(N * 3);
    const band = V(0.3, 1, 0.2).normalize();
    const d = V();
    for (let i = 0; i < N; i++) {
      dirFrom(r, d);
      if (i % 3 === 0) d.addScaledVector(band, -d.dot(band) * 0.9).normalize();
      d.multiplyScalar(SKY_R * (0.985 + r() * 0.05));
      sp.set([d.x, d.y, d.z], i * 3);
      const b = 0.25 + Math.pow(r(), 4) * 1.3;
      sc.set([b, b, b], i * 3);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(sp, 3));
    sg.setAttribute("color", new THREE.BufferAttribute(sc, 3));
    const dustMat = new THREE.PointsMaterial({ size: 0.04, map: env.tex.DOT, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    group.add(new THREE.Points(sg, dustMat));

    // uma nebulosa suave por região
    const clouds = [];
    const groups = leavesByHub(env.nodes);
    hubsOf(env.nodes).forEach((h) => {
      const list = groups.get(h) || [];
      const c = new THREE.Color(h.color).multiplyScalar(0.75);
      const center = list.reduce((a, n) => a.add(n.pos), h.pos.clone()).multiplyScalar(1 / (list.length + 1));
      for (let k = 0; k < 3; k++) {
        const s = additiveSprite(CLOUD_TEX(), c, 1.7 + r() * 1.0 + list.length * 0.08, 0.2);
        s.position.copy(center).add(V(gauss(r), gauss(r), gauss(r)).multiplyScalar(0.35));
        s.material.rotation = r() * TAU;
        group.add(s);
        clouds.push(s);
      }
    });
    return {
      group,
      setTheme(t) {
        gridMat.color.set(t.b);
        eqMat.color.set(t.b);
        dustMat.color.set(t.dust);
      },
      update(f) {
        fadeAll(group, f.appear);
      },
      dispose: () => disposeGroup(group),
    };
  },
};

// ===========================================================================
// 4. Placa de circuito: a pessoa é o processador, as regiões são chips e os itens, componentes
// ===========================================================================
const PCB_TILT = -0.42; // a placa fica um pouco deitada, de frente para a câmera
const pcbQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(PCB_TILT, 0, 0));
const onBoard = (u, v, h, out = V()) => out.set(u, v, h).applyQuaternion(pcbQ);
const PCB_H = 0.13; // altura dos LEDs (neurônios) acima da placa
const circuito = {
  id: "circuito",
  fit: 5.5,
  view: { az: 0.18, el: 0.3 },
  spin: "rock",
  radii: { core: 0.3, hub: 0.17, leaf: 0.075 },
  edgeAlpha: { core: 1, tree: 1.1, link: 0.8 },
  pulses: 2.4,
  hideMesh: (n) => n.kind !== "leaf",
  layout(nodes) {
    const core = coreOf(nodes);
    const hubs = hubsOf(nodes);
    const K = hubs.length;
    const leaves = nodes.filter((n) => n.kind === "leaf");
    // a placa cresce com o número de itens
    const scale = Math.max(1, Math.sqrt((leaves.length + K * 3) / 52));
    const BW = 11.2 * scale;
    const BH = 7.4 * scale;
    this.board = { w: BW, h: BH };
    core.uv = [0, 0];
    // chips num anel em volta do processador, na ordem do ângulo de cada região no cérebro
    const order = hubs
      .map((h) => ({ h, a: Math.atan2(h.cat.pos[1], h.cat.pos[0]) }))
      .sort((x, y) => x.a - y.a);
    const ru = 3.5 * scale;
    const rv = 2.2 * scale;
    const snap = (x) => Math.round(x / 0.1) * 0.1;
    order.forEach(({ h }, i) => {
      const a = (i / Math.max(1, K)) * TAU + 0.35;
      h.uv = [snap(Math.cos(a) * ru), snap(Math.sin(a) * rv)];
    });
    // componentes num grid, perto do seu chip e para o lado de fora
    const free = [];
    const step = 0.68;
    for (let u = -BW / 2 + 0.6; u <= BW / 2 - 0.6; u += step)
      for (let v = -BH / 2 + 0.6; v <= BH / 2 - 0.6; v += step) {
        if (Math.abs(u) < 1.35 && Math.abs(v) < 1.15) continue; // processador
        if (hubs.some((h) => Math.abs(u - h.uv[0]) < 0.8 && Math.abs(v - h.uv[1]) < 0.8)) continue; // chips
        free.push([u, v]);
      }
    const groups = leavesByHub(nodes);
    const queues = hubs.map((h) => ({ h, list: groups.get(h).slice() }));
    let left = leaves.length;
    while (left > 0 && free.length) {
      for (const q of queues) {
        const n = q.list.shift();
        if (!n) continue;
        left--;
        const [hu, hv] = q.h.uv;
        const out = Math.hypot(hu, hv) || 1;
        let best = 0;
        let bestS = Infinity;
        free.forEach(([u, v], i) => {
          const du = u - hu;
          const dv = v - hv;
          const s = Math.hypot(du, dv) - 0.45 * ((du * hu + dv * hv) / out);
          if (s < bestS) {
            bestS = s;
            best = i;
          }
        });
        n.uv = free.splice(best, 1)[0];
        if (!free.length) break;
      }
    }
    leaves.forEach((n) => n.uv || (n.uv = [0, -BH / 2 + 0.3]));
    nodes.forEach((n) => onBoard(n.uv[0], n.uv[1], n.kind === "leaf" ? PCB_H : n.kind === "hub" ? 0.2 : 0.26, n.pos));
  },
  // trilhas octogonais: reta no eixo principal e um trecho a 45°
  curve(e) {
    const [au, av] = e.a.uv;
    const [bu, bv] = e.b.uv;
    const du = bu - au;
    const dv = bv - av;
    const h = 0.012 + (e.kind === "link" ? 0.006 : 0);
    const flip = (e.i || 0) % 2 === 1;
    const AU = Math.abs(du);
    const AV = Math.abs(dv);
    const pts = [[au, av]];
    // sem flip: reto e depois a 45°; com flip: a 45° e depois reto
    if (AU >= AV) pts.push(flip ? [au + Math.sign(du) * AV, bv] : [au + Math.sign(du) * (AU - AV), av]);
    else pts.push(flip ? [bu, av + Math.sign(dv) * AU] : [au, av + Math.sign(dv) * (AV - AU)]);
    pts.push([bu, bv]);
    const poly = new Poly(pts.map(([u, v]) => onBoard(u, v, h)));
    poly.uv = pts;
    return poly;
  },
  build(env) {
    const group = new THREE.Group();
    const nodes = env.nodes;
    const B = this.board || { w: 11.2, h: 7.4 };
    const board = new THREE.Group();
    board.quaternion.copy(pcbQ);
    group.add(board);
    const PX = 100; // pixels por unidade na textura da placa
    const W = B.w + 1.0;
    const H = B.h + 1.0;
    const tw = Math.min(2048, Math.round(W * PX));
    const th = Math.round((tw * H) / W);
    const canvas = document.createElement("canvas");
    canvas.width = tw;
    canvas.height = th;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const toPx = (u, v) => [((u + W / 2) / W) * tw, ((H / 2 - v) / H) * th];
    function paint(theme) {
      const g = canvas.getContext("2d");
      const r = rngStr("placa");
      const base = new THREE.Color(theme.a).multiplyScalar(0.09).lerp(new THREE.Color(0x02140b), 0.45);
      g.fillStyle = `#${base.getHexString()}`;
      g.fillRect(0, 0, tw, th);
      const k = tw / W / 100;
      // trilhas de fundo (decorativas)
      const faint = new THREE.Color(theme.b).multiplyScalar(0.55);
      g.strokeStyle = `rgba(${(faint.r * 255) | 0},${(faint.g * 255) | 0},${(faint.b * 255) | 0},0.18)`;
      g.lineWidth = 3 * k;
      g.lineCap = g.lineJoin = "round";
      for (let i = 0; i < 160; i++) {
        let x = r() * tw;
        let y = r() * th;
        g.beginPath();
        g.moveTo(x, y);
        for (let s = 0; s < 3; s++) {
          const dir = Math.floor(r() * 8) * (Math.PI / 4);
          const len = (20 + r() * 120) * k;
          x += Math.cos(dir) * len;
          y += Math.sin(dir) * len;
          g.lineTo(x, y);
        }
        g.stroke();
        g.fillStyle = "rgba(200,170,90,0.35)";
        g.beginPath();
        g.arc(x, y, 3.5 * k, 0, TAU);
        g.fill();
      }
      // cobre de verdade por baixo das conexões
      g.strokeStyle = "rgba(196,150,70,0.55)";
      g.lineWidth = 7 * k;
      env.edges.forEach((e) => {
        if (!e.curve || !e.curve.uv) return;
        g.beginPath();
        e.curve.uv.forEach(([u, v], i) => (i ? g.lineTo(...toPx(u, v)) : g.moveTo(...toPx(u, v))));
        g.stroke();
      });
      // serigrafia: contorno, chips, componentes e um carimbo
      g.strokeStyle = "rgba(235,240,245,0.55)";
      g.fillStyle = "rgba(235,240,245,0.6)";
      g.lineWidth = 2 * k;
      g.strokeRect(14 * k, 14 * k, tw - 28 * k, th - 28 * k);
      g.font = `${15 * k}px monospace`;
      nodes.forEach((n, i) => {
        const [x, y] = toPx(...n.uv);
        if (n.kind === "hub") {
          g.strokeRect(x - 58 * k, y - 58 * k, 116 * k, 116 * k);
          g.fillText(`U${i}`, x - 56 * k, y - 64 * k);
        } else if (n.kind === "leaf") {
          g.strokeRect(x - 20 * k, y - 15 * k, 40 * k, 30 * k);
          g.fillText(`R${i}`, x + 24 * k, y + 5 * k);
        }
      });
      g.font = `bold ${20 * k}px monospace`;
      g.fillText("INFO.ME · PLACA-MÃE NEURAL · REV 7", 30 * k, th - 30 * k);
      // furos de fixação
      [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([sx, sy]) => {
        const [x, y] = toPx(sx * (W / 2 - 0.35), sy * (H / 2 - 0.35));
        g.fillStyle = "#c8a24a";
        g.beginPath();
        g.arc(x, y, 18 * k, 0, TAU);
        g.fill();
        g.fillStyle = "#000";
        g.beginPath();
        g.arc(x, y, 10 * k, 0, TAU);
        g.fill();
      });
      tex.needsUpdate = true;
    }
    const top = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, metalness: 0.15, transparent: true, fog: false });
    const side = new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.8, transparent: true, fog: false });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.14), [side, side, side, side, top, side]);
    slab.position.z = -0.07;
    board.add(slab);
    // borda dourada
    const edgeMat = lineMat(0xd4a64a, 0.6);
    board.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([V(-W / 2, -H / 2, 0.002), V(W / 2, -H / 2, 0.002), V(W / 2, H / 2, 0.002), V(-W / 2, H / 2, 0.002)]), edgeMat));

    const gold = new THREE.MeshStandardMaterial({ color: 0xd8b25a, metalness: 0.9, roughness: 0.3, fog: false });
    const black = new THREE.MeshStandardMaterial({ color: 0x0d0f13, metalness: 0.3, roughness: 0.45, fog: false });
    // pinos de todos os chips num único InstancedMesh
    const pinSpots = [];
    const chips = [];
    function chip(n, size, pins, lid) {
      const g = new THREE.Group();
      g.position.set(n.uv[0], n.uv[1], 0);
      const body = new THREE.Mesh(new THREE.BoxGeometry(size, size, 0.16), black);
      body.position.z = 0.08;
      g.add(body);
      const c = new THREE.Color(n.color);
      if (lid) {
        const l = new THREE.Mesh(new THREE.BoxGeometry(size * 0.72, size * 0.72, 0.06), new THREE.MeshStandardMaterial({ color: 0xaab3bd, metalness: 0.9, roughness: 0.28, fog: false }));
        l.position.z = 0.19;
        g.add(l);
      }
      const ringMat = new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(2.2), transparent: true, toneMapped: false, fog: false });
      const ring = new THREE.Mesh(new THREE.RingGeometry(size * 0.38, size * 0.43, 4, 1), ringMat);
      ring.rotation.z = Math.PI / 4;
      ring.position.z = lid ? 0.225 : 0.165;
      g.add(ring);
      const dot = new THREE.Mesh(new THREE.CircleGeometry(size * 0.05, 12), ringMat);
      dot.position.set(-size * 0.36, size * 0.36, ring.position.z);
      g.add(dot);
      const step = size / (pins + 1);
      for (let i = 1; i <= pins; i++) {
        const o = -size / 2 + i * step;
        pinSpots.push([n.uv[0] + o, n.uv[1] + size / 2 + 0.05, 0], [n.uv[0] + o, n.uv[1] - size / 2 - 0.05, 0], [n.uv[0] + size / 2 + 0.05, n.uv[1] + o, Math.PI / 2], [n.uv[0] - size / 2 - 0.05, n.uv[1] + o, Math.PI / 2]);
      }
      board.add(g);
      chips.push({ n, g, ring: ringMat });
    }
    chip(coreOf(nodes), 1.55, 9, true);
    hubsOf(nodes).forEach((h) => chip(h, 0.95, 6, false));
    const pinGeo = new THREE.BoxGeometry(0.05, 0.12, 0.03);
    const pinsMesh = new THREE.InstancedMesh(pinGeo, gold, pinSpots.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const one = V(1, 1, 1);
    pinSpots.forEach(([u, v, rot], i) => {
      q.setFromAxisAngle(V(0, 0, 1), rot);
      pinsMesh.setMatrixAt(i, m4.compose(V(u, v, 0.015), q, one));
    });
    board.add(pinsMesh);
    // componentes: ilha dourada e um resistor SMD ao lado de cada LED
    const leaves = nodes.filter((n) => n.kind === "leaf");
    const pads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.2, 0.2, 0.012), gold, leaves.length);
    const smd = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 0.11, 0.07), black, leaves.length);
    leaves.forEach((n, i) => {
      pads.setMatrixAt(i, m4.compose(V(n.uv[0], n.uv[1], 0.006), q.identity(), one));
      smd.setMatrixAt(i, m4.compose(V(n.uv[0], n.uv[1] - 0.24, 0.035), q.identity(), one));
    });
    board.add(pads, smd);
    group.add(new THREE.AmbientLight(0x8090b0, 0.9));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(2, 5, 6);
    group.add(key);
    paint({ a: 0x3b82f6, b: 0x67e8f9 });
    return {
      group,
      setTheme: paint,
      update(f) {
        chips.forEach(({ n, g, ring }) => {
          g.scale.setScalar(0.25 + 0.75 * n.vis);
          ring.opacity = 0.6 + 0.4 * Math.sin(f.time * 2 + n.order * 9) * (n.hot ? 0 : 1);
        });
        top.opacity = side.opacity = f.appear;
        edgeMat.opacity = 0.6 * f.appear;
        board.visible = f.appear > 0.01;
      },
      dispose: () => {
        disposeGroup(group);
        tex.dispose();
      },
    };
  },
};

// ===========================================================================
// 5. Átomo: núcleo no centro, uma órbita de elétrons por região
// ===========================================================================
const atomo = {
  id: "atomo",
  fit: 5.9,
  view: { az: 0.7, el: 0.28 },
  spin: "full",
  spinSpeed: 0.04,
  dynamic: true,
  radii: { core: 0.4, hub: 0.15, leaf: 0.075 },
  edgeAlpha: { core: 0.3, tree: 0.9, link: 0.7 },
  hideMesh: (n) => n.kind === "core",
  layout(nodes) {
    const hubs = hubsOf(nodes);
    const K = hubs.length;
    const groups = leavesByHub(nodes);
    hubs.forEach((h, i) => {
      // normais das órbitas bem espalhadas (espiral de Fibonacci numa semiesfera)
      const y = 1 - (i + 0.5) / K;
      const rr = Math.sqrt(1 - y * y);
      const t = i * 2.39996;
      const nrm = V(Math.cos(t) * rr, y, Math.sin(t) * rr).normalize();
      const u = V(0, 1, 0).cross(nrm);
      if (u.lengthSq() < 1e-4) u.set(1, 0, 0);
      u.normalize();
      const v = nrm.clone().cross(u).normalize();
      const a = K === 1 ? 3 : 1.9 + (i * 2.4) / (K - 1);
      const members = [h, ...groups.get(h)];
      members.forEach((n, k) => {
        n.orb = { u, v, a, nrm, off: (k / members.length) * TAU, w: (i % 2 ? -0.32 : 0.36) / a, ph: i * 0.9 };
      });
    });
    coreOf(nodes).pos.set(0, 0, 0);
    this.animate(nodes, 0);
  },
  animate(nodes, t) {
    nodes.forEach((n) => {
      const o = n.orb;
      if (!o || n.kind === "core") return;
      o.ang = o.ph + o.off + o.w * t;
      n.pos.copy(o.u).multiplyScalar(Math.cos(o.ang) * o.a).addScaledVector(o.v, Math.sin(o.ang) * o.a);
    });
  },
  curve(e) {
    if (e.kind === "tree" && e.a.orb && e.b.orb && e.a.orb.u === e.b.orb.u) {
      // elétrons da mesma camada: a ligação corre pela própria órbita
      let a0 = e.a.orb.ang;
      let a1 = e.b.orb.ang;
      let d = (((a1 - a0) % TAU) + TAU) % TAU;
      if (d > Math.PI) d -= TAU;
      return new OrbitArc(e.a.orb.u, e.a.orb.v, e.a.orb.a, a0, a0 + d);
    }
    if (e.kind === "core") return new THREE.LineCurve3(e.a.pos.clone(), e.b.pos.clone());
    return bulge(e.a.pos, e.b.pos, 0.22);
  },
  build(env) {
    const group = new THREE.Group();
    const core = coreOf(env.nodes);
    const r = rngStr("nucleo");
    // núcleo: prótons e nêutrons
    const nucleus = new THREE.Group();
    const pMat = new THREE.MeshStandardMaterial({ color: 0xff5a6e, roughness: 0.35, metalness: 0.1, emissive: 0x401018, fog: false });
    const nMat = new THREE.MeshStandardMaterial({ color: 0x8ab4ff, roughness: 0.35, metalness: 0.1, emissive: 0x101a40, fog: false });
    const ball = new THREE.SphereGeometry(1, 24, 16);
    for (let i = 0; i < 22; i++) {
      const m = new THREE.Mesh(ball, i % 2 ? pMat : nMat);
      m.position.copy(dirFrom(r).multiplyScalar(Math.cbrt(r()) * 0.62));
      m.scale.setScalar(0.3);
      nucleus.add(m);
    }
    group.add(nucleus);
    const halo = additiveSprite(env.tex.GLOW, new THREE.Color(1.0, 0.75, 0.9), 1, 0.7);
    group.add(halo);
    group.add(new THREE.AmbientLight(0x8899bb, 0.7));
    const key = new THREE.PointLight(0xffffff, 10, 0, 1.5);
    key.position.set(1.2, 1.6, 2.2);
    group.add(key);
    // órbitas (um anel brilhante por região)
    const rings = [];
    hubsOf(env.nodes).forEach((h) => {
      const o = h.orb;
      const c = new THREE.Color(h.color);
      const torus = new THREE.Mesh(
        new THREE.TorusGeometry(o.a, 0.012, 6, 180),
        new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(1.1), transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })
      );
      torus.quaternion.setFromUnitVectors(V(0, 0, 1), o.nrm);
      group.add(torus);
      rings.push(torus);
    });
    // nuvem de probabilidade bem tênue
    const N = 3000;
    const cp = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) cp.set(dirFrom(r).multiplyScalar(1.2 + Math.pow(r(), 0.7) * 3.8).toArray(), i * 3);
    const cg = new THREE.BufferGeometry();
    cg.setAttribute("position", new THREE.BufferAttribute(cp, 3));
    const cloudMat = new THREE.PointsMaterial({ size: 0.03, map: env.tex.DOT, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    group.add(new THREE.Points(cg, cloudMat));
    return {
      group,
      setTheme(t) {
        cloudMat.color.set(t.dust);
        nMat.color.set(t.b);
        nMat.emissive.set(t.a).multiplyScalar(0.25);
      },
      update(f) {
        const s = core.r * (0.3 + 0.7 * core.vis) * (core.hot ? 1.2 : 1);
        nucleus.scale.setScalar(s * 1.2);
        nucleus.rotation.y = f.time * 0.3;
        nucleus.rotation.x = f.time * 0.17;
        halo.scale.setScalar(s * 9);
        fadeAll(group, f.appear);
      },
      dispose: () => disposeGroup(group),
    };
  },
};

export const STYLE3D = { neural, solar, constelacao, circuito, atomo };
export const style3d = (id) => STYLE3D[normalizeStyle(id)];
export { STYLES };
