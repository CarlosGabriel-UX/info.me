// Hangar do multiverso: naves procedurais (só primitivas do three.js), cada uma com materiais,
// brilhos e motores próprios, e um jeito diferente de voar (velocidade, curva, turbo e câmera).
// Frente da nave = -Z, em cima = +Y. Nomes genéricos: as formas lembram arquétipos clássicos da ficção científica.
import * as THREE from "three";

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
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

// ---------------------------------------------------------------------------
// Texturas (criadas uma vez, compartilhadas entre as naves e a prévia do hangar)
// ---------------------------------------------------------------------------
const SHARED = new Set();
function canvasTex(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  SHARED.add(t);
  return t;
}
let TEX = null;
function tex() {
  if (TEX) return TEX;
  const radial = (stops) => (g, s) => {
    const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    stops.forEach(([o, a]) => r.addColorStop(o, `rgba(255,255,255,${a})`));
    g.fillStyle = r;
    g.fillRect(0, 0, s, s);
  };
  const GLOW = canvasTex(128, 128, radial([[0, 1], [0.15, 0.55], [0.45, 0.12], [1, 0]]));
  // placas do casco
  const panels = (base, seed) =>
    canvasTex(512, 256, (g, w, h) => {
      const r = rng(seed);
      g.fillStyle = base;
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 220; i++) {
        const v = 185 + Math.floor(r() * 40);
        g.fillStyle = `rgba(${v},${v + 4},${v + 10},0.55)`;
        g.fillRect(r() * w, r() * h, 10 + r() * 60, 6 + r() * 26);
      }
      g.strokeStyle = "rgba(60,70,85,0.35)";
      g.lineWidth = 1;
      for (let x = 0; x < w; x += 32) g.strokeRect(x + 0.5, 0.5, 32, h);
      for (let y = 0; y < h; y += 24) g.strokeRect(0.5, y + 0.5, w, 24);
    });
  const PANELS = panels("#c3cad3", "casco");
  PANELS.wrapS = PANELS.wrapT = THREE.RepeatWrapping;
  // pás giratórias dentro dos coletores das naceles
  const VANES = canvasTex(128, 128, (g, s) => {
    const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    gr.addColorStop(0, "#ffffff");
    gr.addColorStop(0.5, "#9fdcff");
    gr.addColorStop(1, "#2a6fd6");
    g.fillStyle = gr;
    g.fillRect(0, 0, s, s);
    g.translate(s / 2, s / 2);
    for (let i = 0; i < 6; i++) {
      g.rotate(Math.PI / 3);
      g.fillStyle = "rgba(10,40,120,0.55)";
      g.beginPath();
      g.moveTo(0, 0);
      g.quadraticCurveTo(s * 0.25, s * 0.05, s * 0.5, s * 0.18);
      g.lineTo(s * 0.5, s * 0.3);
      g.quadraticCurveTo(s * 0.2, s * 0.18, 0, 0);
      g.fill();
    }
  });
  // casco do cargueiro: chapas remendadas e amareladas
  const RUST = canvasTex(512, 256, (g, w, h) => {
    const r = rng("cargueiro");
    g.fillStyle = "#bdb6a6";
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) {
      const v = 150 + Math.floor(r() * 70);
      g.fillStyle = `rgba(${v},${v - 6},${v - 18},0.6)`;
      g.fillRect(r() * w, r() * h, 8 + r() * 50, 6 + r() * 30);
    }
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(90,60,40,${0.08 + r() * 0.15})`;
      g.beginPath();
      g.ellipse(r() * w, r() * h, 4 + r() * 18, 2 + r() * 10, r() * 3, 0, TAU);
      g.fill();
    }
    g.strokeStyle = "rgba(50,45,40,0.4)";
    for (let x = 0; x < w; x += 40) g.strokeRect(x + 0.5, 0.5, 40, h);
  });
  RUST.wrapS = RUST.wrapT = THREE.RepeatWrapping;
  TEX = { GLOW, PANELS, VANES, RUST };
  return TEX;
}

// ---------------------------------------------------------------------------
// Peças comuns
// ---------------------------------------------------------------------------
const glowMat = (r, g, b) => new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b), toneMapped: false });
const lathe = (pts, seg = 48) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg);
function sprite(color, scale, op = 1) {
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex().GLOW, color, transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  s.scale.setScalar(scale);
  return s;
}
// barra fina entre dois pontos (luzes de borda)
function bar(a, b, w, mat) {
  const len = a.distanceTo(b);
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, w, len), mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.lookAt(b);
  return m;
}
// chama: cone aditivo com tremulação (ponta para +Z, para trás da nave)
function flame(radius, length, inner, outer) {
  const U = { uTime: { value: 0 }, uPower: { value: 0 }, uIn: { value: new THREE.Color(...inner) }, uOut: { value: new THREE.Color(...outer) } };
  const g = new THREE.ConeGeometry(radius, length, 24, 6, true);
  g.translate(0, -length / 2, 0);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(
    g,
    new THREE.ShaderMaterial({
      uniforms: U,
      vertexShader: `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform float uTime, uPower; uniform vec3 uIn, uOut;
        varying vec2 vUv;
        void main() {
          float along = 1.0 - vUv.y; // 0 no bocal, 1 na ponta
          float flick = 0.75 + 0.25 * sin(uTime * 38.0 + vUv.x * 40.0) * sin(uTime * 23.0 - along * 12.0);
          float a = pow(1.0 - along, 1.6) * flick * uPower;
          vec3 c = mix(uIn, uOut, smoothstep(0.0, 0.6, along));
          gl_FragColor = vec4(c * a, a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    })
  );
  m.userData.U = U;
  m.userData.len = length;
  return m;
}
function setFlame(f, time, power, k = 1) {
  f.userData.U.uTime.value = time;
  f.userData.U.uPower.value = clamp(0.25 + power * 0.9, 0, 1.6);
  f.scale.set(1, 1, k * (0.35 + Math.min(power, 1.6) * 0.75));
}
// luzes de navegação: bombordo vermelho, boreste verde, piscas brancos
function navLights(hull, list) {
  return list.map(([color, scale, p, ph = 0, short = false]) => {
    const s = sprite(new THREE.Color(...color), scale);
    s.position.set(...p);
    hull.add(s);
    return { s, ph, short };
  });
}
function blink(nav, time, reduce) {
  nav.forEach((n) => {
    n.s.material.opacity = reduce ? 1 : (time + n.ph) % 1.6 < (n.short ? 0.08 : 0.9) ? 1 : 0.15;
  });
}

// ===========================================================================
// 1. Exploradora: disco, casco secundário e duas naceles (a nave original do multiverso)
// ===========================================================================
function buildExplorer() {
  const T = tex();
  const root = new THREE.Group();
  const hull = new THREE.Group();
  root.add(hull);
  const hullMat = new THREE.MeshStandardMaterial({ color: 0xb4bcc6, map: T.PANELS, metalness: 0.4, roughness: 0.5 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x5d6673, metalness: 0.5, roughness: 0.5 });

  const saucer = new THREE.Mesh(
    lathe([
      [0, -0.17], [0.12, -0.165], [0.3, -0.125], [0.7, -0.075], [0.97, -0.03], [1.0, 0.0],
      [0.97, 0.03], [0.85, 0.045], [0.4, 0.085], [0.2, 0.11], [0.16, 0.14], [0.11, 0.17],
      [0.06, 0.19], [0, 0.195],
    ].reverse(), 72),
    hullMat
  );
  saucer.position.set(0, 0.34, -0.72);
  hull.add(saucer);
  const rimRing = new THREE.Mesh(new THREE.TorusGeometry(0.985, 0.018, 8, 96), darkMat);
  rimRing.rotation.x = Math.PI / 2;
  rimRing.position.copy(saucer.position);
  hull.add(rimRing);
  const bridge = new THREE.Mesh(new THREE.SphereGeometry(0.075, 20, 12, 0, TAU, 0, Math.PI / 2), hullMat);
  bridge.position.set(0, 0.34 + 0.19, -0.72);
  hull.add(bridge);
  const beacon = sprite(new THREE.Color(1.5, 1.6, 2.0), 0.12);
  beacon.position.set(0, 0.34 + 0.27, -0.72);
  hull.add(beacon);

  // janelas: pontinhos quentes na borda do disco e no casco secundário
  const windows = new THREE.InstancedMesh(new THREE.BoxGeometry(0.022, 0.012, 0.012), glowMat(2.2, 1.85, 1.2), 260);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = V(1, 1, 1);
  let wi = 0;
  const wr = rng("janelas");
  [[0.965, 0.012], [0.93, -0.035], [0.6, 0.068]].forEach(([rad, y], row) => {
    const n = row === 2 ? 50 : 80;
    for (let i = 0; i < n && wi < 260; i++) {
      if (wr() < 0.18) continue;
      const a = (i / n) * TAU;
      q.setFromAxisAngle(V(0, 1, 0), -a);
      windows.setMatrixAt(wi++, m4.compose(V(Math.cos(a) * rad, 0.34 + y, -0.72 + Math.sin(a) * rad), q, sc));
    }
  });
  for (let i = 0; i < 40 && wi < 260; i++) {
    const side = i % 2 ? 1 : -1;
    const z = -0.3 + (Math.floor(i / 2) / 20) * 1.25;
    q.setFromAxisAngle(V(0, 1, 0), Math.PI / 2);
    windows.setMatrixAt(wi++, m4.compose(V(side * 0.262 * (1 - Math.max(0, z - 0.4) * 0.35), -0.28, z), q, sc));
  }
  windows.count = wi;
  hull.add(windows);

  [-1, 1].forEach((s) => {
    const imp = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.03), glowMat(3.2, 0.5, 0.25));
    imp.position.set(s * 0.17, 0.39, -0.72 + 0.79);
    imp.rotation.y = s * 0.25;
    hull.add(imp);
  });
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.72, 0.36), hullMat);
  neck.position.set(0, 0.02, 0.06);
  neck.rotation.x = -0.92;
  hull.add(neck);
  const sec = new THREE.Mesh(
    lathe([[0, -0.95], [0.19, -0.95], [0.235, -0.85], [0.26, -0.55], [0.255, -0.1], [0.22, 0.4], [0.16, 0.78], [0.1, 0.92], [0, 0.95]]),
    hullMat
  );
  sec.rotation.x = Math.PI / 2;
  sec.position.set(0, -0.3, 0.55);
  hull.add(sec);
  const bay = new THREE.Mesh(new THREE.CircleGeometry(0.08, 24), glowMat(0.8, 1.0, 1.4));
  bay.position.set(0, -0.3, 0.55 + 0.951);
  hull.add(bay);
  const defRing = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.03, 10, 40), darkMat);
  defRing.position.set(0, -0.3, -0.41);
  hull.add(defRing);
  const dish = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.14, 40, 1, true), glowMat(4.0, 0.55, 0.3));
  dish.rotation.x = -Math.PI / 2;
  dish.position.set(0, -0.3, -0.45);
  hull.add(dish);
  const defGlow = sprite(new THREE.Color(1.0, 0.25, 0.15), 1.0, 0.9);
  defGlow.position.set(0, -0.3, -0.55);
  hull.add(defGlow);

  const caps = [];
  const grilles = [];
  const trails = [];
  [-1, 1].forEach((s) => {
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.92, 0.32), hullMat);
    pylon.position.set(s * 0.42, 0.06, 1.0);
    pylon.rotation.z = -s * 0.88;
    hull.add(pylon);
    const nac = new THREE.Mesh(lathe([[0, -1.05], [0.125, -1.05], [0.14, -0.9], [0.14, 0.7], [0.12, 0.92], [0.07, 1.04], [0, 1.05]], 40), hullMat);
    nac.rotation.x = Math.PI / 2;
    nac.position.set(s * 0.8, 0.42, 0.92);
    hull.add(nac);
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.128, 28, 16, 0, TAU, 0, Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: T.VANES, color: new THREE.Color(1.6, 2.2, 3.6), toneMapped: false })
    );
    cap.rotation.x = -Math.PI / 2;
    cap.position.set(s * 0.8, 0.42, 0.92 - 1.05);
    hull.add(cap);
    caps.push(cap);
    const capGlow = sprite(new THREE.Color(0.3, 0.6, 1.4), 0.9, 0.9);
    capGlow.position.set(s * 0.8, 0.42, 0.92 - 1.12);
    hull.add(capGlow);
    caps.push(capGlow);
    [[-s * 0.135, 0, 0.03, 0.05], [0, 0.135, 0.05, 0.03]].forEach(([dx, dy, w, h]) => {
      const gr = new THREE.Mesh(new THREE.BoxGeometry(w, h, 1.35), glowMat(0.3, 0.75, 2.0));
      gr.position.set(s * 0.8 + dx, 0.42 + dy, 1.0);
      hull.add(gr);
      grilles.push(gr);
    });
    const tr = sprite(new THREE.Color(0.35, 0.6, 1.4), 0.5, 0);
    tr.position.set(s * 0.8, 0.42, 0.92 + 1.15);
    hull.add(tr);
    trails.push(tr);
  });
  const nav = navLights(hull, [
    [[2.5, 0.2, 0.2], 0.22, [-1.0, 0.34, -0.72]],
    [[0.2, 2.5, 0.5], 0.22, [1.0, 0.34, -0.72]],
    [[2.5, 2.5, 2.5], 0.25, [0, 0.42, 1.98], 0.5, true],
  ]);
  const nacLight = new THREE.PointLight(0x5aa8ff, 1.2, 3.5, 2);
  nacLight.position.set(0, 0.5, 0.8);
  hull.add(nacLight);

  return {
    root,
    hull,
    tick({ time, dt, power, warp, reduce }) {
      caps.forEach((c, i) => {
        if (i % 2 === 0) c.rotation.y += dt * (2 + power * 6);
        else c.material.opacity = 0.7 + 0.2 * Math.sin(time * 6 + i) + warp * 0.4;
      });
      grilles.forEach((g) => g.material.color.setRGB(0.22 + power * 0.25, 0.6 + power * 0.35, 1.5 + power * 0.8));
      trails.forEach((tr) => {
        tr.material.opacity = clamp(power * 0.6, 0, 1);
        tr.scale.set(0.5 + power * 0.6, 0.5 + power * 0.6, 1);
      });
      blink(nav, time, reduce);
      defGlow.material.opacity = 0.75 + 0.15 * Math.sin(time * 2.2) + warp * 0.3;
    },
  };
}

// ===========================================================================
// 2. Caça Vespa: caça rápido com quatro asas em X e motores vermelho-alaranjados
// ===========================================================================
function buildFighter() {
  const root = new THREE.Group();
  const hull = new THREE.Group();
  root.add(hull);
  const white = new THREE.MeshStandardMaterial({ color: 0xe4e6ea, map: tex().PANELS, metalness: 0.25, roughness: 0.5, flatShading: true });
  const grey = new THREE.MeshStandardMaterial({ color: 0x6b7280, metalness: 0.6, roughness: 0.4 });
  const red = new THREE.MeshStandardMaterial({ color: 0xd9412b, metalness: 0.2, roughness: 0.45 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x0a1626, metalness: 0.9, roughness: 0.08, emissive: 0x06223a });
  // fuselagem facetada, bico fino
  const body = new THREE.Mesh(
    lathe([[0, -1.75], [0.05, -1.6], [0.11, -1.1], [0.16, -0.55], [0.2, -0.1], [0.22, 0.55], [0.2, 0.95], [0, 1.0]], 6),
    white
  );
  body.rotation.x = Math.PI / 2;
  body.rotation.y = Math.PI / 6;
  body.scale.set(1.15, 1, 0.8);
  hull.add(body);
  // faixas vermelhas no bico
  [-1, 1].forEach((s) => {
    const st = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.7), red);
    st.position.set(s * 0.09, 0.1, -0.95);
    st.rotation.y = s * -0.06;
    hull.add(st);
  });
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12, 0, TAU, 0, Math.PI / 2), glass);
  canopy.scale.set(0.14, 0.13, 0.42);
  canopy.position.set(0, 0.13, -0.12);
  hull.add(canopy);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 10, 0, TAU, 0, Math.PI / 2), grey);
  dome.position.set(0, 0.16, 0.42);
  hull.add(dome);
  const domeLight = sprite(new THREE.Color(0.3, 0.6, 2.0), 0.18, 0.9);
  domeLight.position.set(0, 0.25, 0.42);
  hull.add(domeLight);

  // quatro asas articuladas (abrem em X quando a nave acelera)
  const wings = [];
  const flames = [];
  const nozzles = [];
  const tips = [];
  [-1, 1].forEach((s) =>
    [-1, 1].forEach((u) => {
      const pivot = new THREE.Group();
      pivot.position.set(0, 0, 0.45);
      hull.add(pivot);
      const shape = new THREE.Shape();
      shape.moveTo(0.15, -0.32);
      shape.lineTo(1.55, -0.12);
      shape.lineTo(1.55, 0.2);
      shape.lineTo(0.15, 0.36);
      shape.closePath();
      const wg = new THREE.ExtrudeGeometry(shape, { depth: 0.035, bevelEnabled: false });
      wg.rotateX(Math.PI / 2);
      wg.translate(0, 0.0175, 0);
      if (s < 0) wg.scale(-1, 1, 1);
      const wing = new THREE.Mesh(wg, white);
      pivot.add(wing);
      // faixa vermelha na asa
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.012, 0.09), red);
      st.position.set(s * 1.05, u * 0.022, 0.02);
      pivot.add(st);
      // motor na raiz da asa
      const eng = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.85, 20), grey);
      eng.rotation.x = Math.PI / 2;
      eng.position.set(s * 0.38, u * 0.12, 0.02);
      pivot.add(eng);
      const intake = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.025, 8, 20), white);
      intake.position.set(s * 0.38, u * 0.12, -0.42);
      pivot.add(intake);
      const noz = new THREE.Mesh(new THREE.CircleGeometry(0.095, 20), glowMat(3.4, 0.9, 0.35));
      noz.position.set(s * 0.38, u * 0.12, 0.446);
      pivot.add(noz);
      nozzles.push(noz);
      const fl = flame(0.09, 0.9, [1.6, 1.3, 1.0], [1.4, 0.35, 0.08]);
      fl.position.set(s * 0.38, u * 0.12, 0.45);
      pivot.add(fl);
      flames.push(fl);
      const gl = sprite(new THREE.Color(1.6, 0.45, 0.15), 0.6, 0.8);
      gl.position.set(s * 0.38, u * 0.12, 0.55);
      pivot.add(gl);
      flames.push(gl);
      // canhão na ponta da asa
      const gun = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.03, 1.5, 10), grey);
      gun.rotation.x = Math.PI / 2;
      gun.position.set(s * 1.56, 0, -0.4);
      pivot.add(gun);
      const tip = sprite(new THREE.Color(2.4, 0.25, 0.2), 0.16, 0.9);
      tip.position.set(s * 1.56, 0, -1.17);
      pivot.add(tip);
      tips.push(tip);
      wings.push({ pivot, s, u });
    })
  );
  let open = 0.08;
  return {
    root,
    hull,
    tick({ time, dt, power, warp, boost, reduce }) {
      const want = power > 0.06 || warp > 0.05 ? 0.24 + boost * 0.06 : 0.05;
      open += (want - open) * (1 - Math.exp(-3 * dt));
      wings.forEach(({ pivot, s, u }) => (pivot.rotation.z = s * u * open));
      flames.forEach((f) => {
        if (f.isSprite) {
          f.material.opacity = clamp(0.35 + power * 0.6, 0, 1);
          f.scale.setScalar(0.45 + power * 0.5);
        } else setFlame(f, time, power, 1 + warp);
      });
      nozzles.forEach((n) => n.material.color.setRGB(2.6 + power * 1.5, 0.7 + power * 0.4, 0.3));
      tips.forEach((t, i) => (t.material.opacity = reduce ? 0.9 : 0.4 + 0.5 * ((time * 1.3 + i * 0.25) % 1 < 0.5 ? 1 : 0)));
    },
  };
}

// ===========================================================================
// 3. Cargueiro Corsário: cargueiro redondo, cabine de lado e uma faixa larga de motor azul
// ===========================================================================
function buildFreighter() {
  const T = tex();
  const root = new THREE.Group();
  const hull = new THREE.Group();
  root.add(hull);
  const hullMat = new THREE.MeshStandardMaterial({ color: 0xd2ccbe, map: T.RUST, metalness: 0.35, roughness: 0.6 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x3f4248, metalness: 0.5, roughness: 0.55 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x0c1a24, metalness: 0.9, roughness: 0.1, emissive: 0x0a2a3a });
  const disc = new THREE.Mesh(
    lathe([[0, -0.2], [0.9, -0.17], [1.22, -0.09], [1.3, 0], [1.22, 0.09], [0.9, 0.17], [0.35, 0.21], [0, 0.22]], 64),
    hullMat
  );
  hull.add(disc);
  // "pratos" e caixas sobre o casco
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.025, 8, 64), dark);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.19;
  hull.add(ring);
  const r = rng("caixas");
  for (let i = 0; i < 14; i++) {
    const a = r() * TAU;
    const rad = 0.35 + r() * 0.75;
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.06 + r() * 0.16, 0.04 + r() * 0.05, 0.06 + r() * 0.2), r() < 0.5 ? dark : hullMat);
    b.position.set(Math.cos(a) * rad, 0.18 - rad * 0.05, Math.sin(a) * rad);
    b.rotation.y = a;
    hull.add(b);
  }
  // mandíbulas na frente
  [-1, 1].forEach((s) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.15, 1.0), hullMat);
    m.position.set(s * 0.33, 0, -1.35);
    hull.add(m);
    const tipM = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.11, 0.08), dark);
    tipM.position.set(s * 0.33, 0, -1.87);
    hull.add(tipM);
  });
  // cabine de lado: tubo, braço e vidro na ponta
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.3), hullMat);
  arm.position.set(1.12, 0, -0.42);
  arm.rotation.y = 0.35;
  hull.add(arm);
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.8, 20), hullMat);
  tube.rotation.x = Math.PI / 2;
  tube.position.set(1.36, 0, -0.75);
  hull.add(tube);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.15, 20, 12, 0, TAU, 0, Math.PI / 2), glass);
  nose.rotation.x = -Math.PI / 2;
  nose.position.set(1.36, 0, -1.15);
  hull.add(nose);
  const cabinLight = sprite(new THREE.Color(0.4, 1.2, 1.6), 0.3, 0.6);
  cabinLight.position.set(1.36, 0, -1.2);
  hull.add(cabinLight);
  // antena parabólica girando
  const dishG = new THREE.Group();
  dishG.position.set(-0.58, 0.24, -0.35);
  const dish = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 8, 0, TAU, 0, 0.9), dark);
  dish.material = dark.clone();
  dish.material.side = THREE.DoubleSide;
  dish.rotation.x = -0.5;
  dishG.add(dish);
  hull.add(dishG);
  // torre de canhões em cima
  const turret = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 10, 0, TAU, 0, Math.PI / 2), glass);
  turret.position.set(0, 0.2, 0.1);
  hull.add(turret);
  [-1, 1].forEach((s) => {
    const gun = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.4, 8), dark);
    gun.rotation.x = Math.PI / 2;
    gun.position.set(s * 0.05, 0.28, -0.12);
    hull.add(gun);
  });
  // faixa de motor azul na traseira, em arco
  const arc = 1.9;
  const sg = new THREE.TorusGeometry(1.27, 0.06, 10, 80, arc);
  sg.rotateZ(Math.PI / 2 - arc / 2);
  sg.rotateX(Math.PI / 2);
  sg.scale(1, 1.6, 1);
  const stripMat = glowMat(0.6, 1.4, 3.2);
  const strip = new THREE.Mesh(sg, stripMat);
  hull.add(strip);
  const glows = [];
  for (let i = 0; i < 7; i++) {
    const a = Math.PI / 2 - arc / 2 + (i / 6) * arc;
    const s = sprite(new THREE.Color(0.35, 0.75, 1.8), 0.9, 0.8);
    s.position.set(Math.cos(a) * 1.4, 0, Math.sin(a) * 1.4);
    hull.add(s);
    glows.push(s);
  }
  const wash = sprite(new THREE.Color(0.25, 0.55, 1.4), 2.6, 0.4);
  wash.position.set(0, 0, 1.6);
  hull.add(wash);
  const nav = navLights(hull, [
    [[2.5, 0.2, 0.2], 0.2, [-1.3, 0.02, 0]],
    [[0.2, 2.5, 0.5], 0.2, [1.3, 0.02, 0.2]],
    [[2.5, 2.5, 2.5], 0.22, [0, 0.25, 0.9], 0.6, true],
  ]);
  return {
    root,
    hull,
    tick({ time, dt, power, warp, reduce }) {
      const k = 0.55 + Math.min(power, 1.6) * 0.7 + warp * 0.6;
      stripMat.color.setRGB(0.5 * k + 0.2, 1.2 * k + 0.2, 2.6 * k + 0.5);
      glows.forEach((g, i) => {
        g.material.opacity = clamp(0.35 + power * 0.5 + 0.08 * Math.sin(time * 9 + i), 0, 1);
        g.scale.setScalar(0.7 + power * 0.6);
      });
      wash.material.opacity = clamp(power * 0.45, 0, 0.8);
      if (!reduce) dishG.rotation.y += dt * 1.2;
      blink(nav, time, reduce);
    },
  };
}

// ===========================================================================
// 4. Disco Errante: disco voador com anel de luzes girando e raio trator
// ===========================================================================
function buildSaucer() {
  const root = new THREE.Group();
  const hull = new THREE.Group();
  root.add(hull);
  const spinner = new THREE.Group();
  hull.add(spinner);
  const chrome = new THREE.MeshStandardMaterial({ color: 0xc9d2de, map: tex().PANELS, metalness: 0.75, roughness: 0.28, emissive: 0x10161f });
  const lens = new THREE.Mesh(
    lathe([[0, -0.26], [0.45, -0.23], [0.95, -0.12], [1.28, -0.02], [1.3, 0], [1.28, 0.02], [1.0, 0.1], [0.6, 0.18], [0, 0.22]], 72),
    chrome
  );
  spinner.add(lens);
  const band = new THREE.Mesh(new THREE.TorusGeometry(1.29, 0.03, 8, 96), new THREE.MeshStandardMaterial({ color: 0x5b6472, metalness: 0.8, roughness: 0.3 }));
  band.rotation.x = Math.PI / 2;
  spinner.add(band);
  // cúpula de vidro com um brilho verde dentro
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(0.46, 32, 16, 0, TAU, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x7dffd0, transparent: true, opacity: 0.42, metalness: 0.2, roughness: 0.05, emissive: 0x0c5a44, depthWrite: false })
  );
  dome.position.y = 0.17;
  hull.add(dome);
  const pilot = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), glowMat(0.5, 2.4, 1.4));
  pilot.position.y = 0.3;
  hull.add(pilot);
  const domeGlow = sprite(new THREE.Color(0.3, 1.4, 0.9), 1.1, 0.55);
  domeGlow.position.y = 0.32;
  hull.add(domeGlow);
  // anel de luzes coloridas
  const lights = [];
  const lightRing = new THREE.Group();
  hull.add(lightRing);
  const bulb = new THREE.SphereGeometry(0.045, 10, 8);
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * TAU;
    const m = new THREE.Mesh(bulb, glowMat(1, 1, 1));
    m.position.set(Math.cos(a) * 1.18, -0.06, Math.sin(a) * 1.18);
    lightRing.add(m);
    const s = sprite(new THREE.Color(1, 1, 1), 0.28, 0.8);
    s.position.copy(m.position);
    lightRing.add(s);
    lights.push({ m, s, a });
  }
  // emissor embaixo e raio trator
  const emitter = new THREE.Mesh(new THREE.CircleGeometry(0.3, 32), glowMat(0.6, 2.6, 1.7));
  emitter.rotation.x = Math.PI / 2;
  emitter.position.y = -0.262;
  hull.add(emitter);
  const beamU = { uTime: { value: 0 }, uOn: { value: 1 } };
  const bg = new THREE.CylinderGeometry(0.3, 1.15, 2.6, 40, 8, true);
  bg.translate(0, -1.3 - 0.26, 0);
  const beam = new THREE.Mesh(
    bg,
    new THREE.ShaderMaterial({
      uniforms: beamU,
      vertexShader: `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform float uTime, uOn;
        varying vec2 vUv;
        void main() {
          float fade = pow(vUv.y, 1.4); // forte perto do disco
          float rings = 0.55 + 0.45 * sin(vUv.y * 40.0 + uTime * 6.0);
          float a = fade * rings * uOn * 0.55;
          gl_FragColor = vec4(vec3(0.45, 1.6, 1.1) * a, a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    })
  );
  hull.add(beam);
  const under = sprite(new THREE.Color(0.35, 1.5, 1.0), 1.4, 0.7);
  under.position.y = -0.35;
  hull.add(under);
  const c = new THREE.Color();
  return {
    root,
    hull,
    tick({ time, dt, power, warp, reduce }) {
      if (!reduce) {
        spinner.rotation.y += dt * (0.6 + power * 2.5);
        lightRing.rotation.y -= dt * (1.4 + power * 3);
      }
      lights.forEach(({ m, s, a }, i) => {
        c.setHSL((a / TAU + time * 0.15) % 1, 1, 0.55).multiplyScalar(2.2);
        m.material.color.copy(c);
        s.material.color.copy(c);
        s.material.opacity = reduce ? 0.8 : 0.5 + 0.5 * Math.max(0, Math.sin(time * 5 - i * 0.7));
      });
      // o raio trator liga quando o disco está devagar
      beamU.uOn.value += (clamp(1 - power * 1.6, 0, 1) - beamU.uOn.value) * (1 - Math.exp(-3 * dt));
      beamU.uTime.value = time;
      under.material.opacity = 0.35 + beamU.uOn.value * 0.4;
      pilot.scale.setScalar(1 + 0.12 * Math.sin(time * 3));
      domeGlow.material.opacity = 0.45 + 0.15 * Math.sin(time * 3) + warp * 0.2;
    },
  };
}

// ===========================================================================
// 5. Foguete Retrô: casco vermelho e creme, aletas, vigias e chama
// ===========================================================================
function buildRocket() {
  const root = new THREE.Group();
  const hull = new THREE.Group();
  root.add(hull);
  const red = new THREE.MeshStandardMaterial({ color: 0xd8262f, metalness: 0.35, roughness: 0.32 });
  const cream = new THREE.MeshStandardMaterial({ color: 0xf1e7d0, metalness: 0.2, roughness: 0.38 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xc8ccd2, metalness: 0.9, roughness: 0.22 });
  const along = (mesh) => {
    mesh.rotation.x = Math.PI / 2;
    hull.add(mesh);
    return mesh;
  };
  along(new THREE.Mesh(lathe([[0, -1.85], [0.06, -1.78], [0.16, -1.55], [0.27, -1.25], [0.34, -1.0], [0.36, -0.95], [0, -0.95]], 40), red));
  along(new THREE.Mesh(lathe([[0, -0.96], [0.37, -0.96], [0.4, -0.5], [0.4, 0.45], [0.37, 0.75], [0, 0.75]], 40), cream));
  along(new THREE.Mesh(lathe([[0, 0.74], [0.375, 0.74], [0.33, 1.05], [0.26, 1.18], [0, 1.18]], 40), red));
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.405, 0.022, 8, 48), chrome);
  band.position.z = -0.2;
  hull.add(band);
  // bocal
  const nozzle = along(new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.24, 0.22, 24, 1, true), chrome));
  nozzle.position.z = 1.28;
  nozzle.material = chrome.clone();
  nozzle.material.side = THREE.DoubleSide;
  // vigias com luz quente
  const ringG = new THREE.TorusGeometry(0.075, 0.018, 8, 24);
  const winMat = glowMat(2.4, 1.6, 0.6);
  [-0.55, -0.15, 0.25].forEach((z, i) =>
    [-1, 1].forEach((s) => {
      const a = s * (Math.PI / 2 - 0.35);
      const p = V(Math.sin(a) * 0.405, Math.cos(a) * 0.405, z);
      const ring = new THREE.Mesh(ringG, chrome);
      ring.position.copy(p);
      ring.lookAt(p.clone().multiplyScalar(2).setZ(z));
      hull.add(ring);
      const w = new THREE.Mesh(new THREE.CircleGeometry(0.07, 20), winMat);
      w.position.copy(p).multiplyScalar(1.005).setZ(z);
      w.lookAt(p.clone().multiplyScalar(2).setZ(z));
      hull.add(w);
      if (i === 1) {
        const g = sprite(new THREE.Color(1.4, 0.9, 0.4), 0.3, 0.5);
        g.position.copy(p).multiplyScalar(1.08).setZ(z);
        hull.add(g);
      }
    })
  );
  // três aletas
  const shape = new THREE.Shape();
  shape.moveTo(0.3, 0.05);
  shape.quadraticCurveTo(0.8, 0.45, 0.92, 1.25);
  shape.lineTo(0.92, 1.42);
  shape.lineTo(0.62, 1.2);
  shape.lineTo(0.3, 1.12);
  shape.closePath();
  const fg = new THREE.ExtrudeGeometry(shape, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 2 });
  fg.translate(0, 0, -0.025);
  fg.rotateX(Math.PI / 2); // y da forma vira +z (para trás)
  [90, 210, 330].forEach((deg) => {
    const f = new THREE.Mesh(fg, red);
    f.rotation.z = (deg * Math.PI) / 180;
    f.position.z = 0;
    const g = new THREE.Group();
    g.add(f);
    hull.add(g);
  });
  // antena no bico
  const tip = sprite(new THREE.Color(2.4, 0.3, 0.25), 0.2, 1);
  tip.position.z = -1.9;
  hull.add(tip);
  // chama em duas camadas
  const outer = flame(0.24, 1.9, [1.7, 1.2, 0.5], [1.6, 0.35, 0.05]);
  outer.position.z = 1.36;
  const inner = flame(0.12, 1.0, [2.2, 2.1, 1.8], [1.8, 1.0, 0.3]);
  inner.position.z = 1.36;
  hull.add(outer, inner);
  const exhaust = sprite(new THREE.Color(1.7, 0.75, 0.25), 1.2, 0.8);
  exhaust.position.z = 1.55;
  hull.add(exhaust);
  const light = new THREE.PointLight(0xff8a3a, 1.5, 4, 2);
  light.position.z = 1.8;
  hull.add(light);
  return {
    root,
    hull,
    tick({ time, power, warp, reduce }) {
      setFlame(outer, time, power, 1 + warp * 0.8);
      setFlame(inner, time, power, 1 + warp * 0.5);
      const flick = reduce ? 1 : 0.85 + 0.15 * Math.sin(time * 31) * Math.sin(time * 17);
      exhaust.material.opacity = clamp(0.4 + power * 0.5, 0, 1) * flick;
      exhaust.scale.setScalar((0.8 + power * 0.9) * flick);
      light.intensity = (0.8 + power * 1.6) * flick;
      tip.material.opacity = reduce ? 1 : time % 1.2 < 0.6 ? 1 : 0.2;
      hull.rotation.z += 0; // a inclinação vem do voo
    },
  };
}

// ===========================================================================
// 6. Semente de Cristal: nave orgânica de cristal violeta com fragmentos orbitando
// ===========================================================================
function buildCrystal() {
  const root = new THREE.Group();
  const hull = new THREE.Group();
  root.add(hull);
  const crystal = new THREE.MeshStandardMaterial({
    color: 0xa58bff,
    emissive: 0x3b1e9a,
    metalness: 0.15,
    roughness: 0.12,
    flatShading: true,
    transparent: true,
    opacity: 0.86,
  });
  const teal = crystal.clone();
  teal.color.set(0x6ff3ff);
  teal.emissive.set(0x0d5566);
  const coreG = new THREE.OctahedronGeometry(0.55, 0);
  coreG.scale(0.8, 0.62, 2.2);
  const core = new THREE.Mesh(coreG, crystal);
  hull.add(core);
  const heart = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), glowMat(2.4, 1.2, 3.6));
  hull.add(heart);
  const heartGlow = sprite(new THREE.Color(0.9, 0.5, 1.8), 1.6, 0.8);
  hull.add(heartGlow);
  // asas de cristal varridas para trás
  [-1, 1].forEach((s) => {
    const g = new THREE.OctahedronGeometry(0.5, 0);
    g.scale(2.0, 0.12, 0.55);
    const w = new THREE.Mesh(g, crystal);
    w.position.set(s * 0.85, -0.05, 0.25);
    w.rotation.y = s * -0.45;
    w.rotation.z = s * 0.12;
    hull.add(w);
    const t = new THREE.Mesh(new THREE.OctahedronGeometry(0.14, 0), teal);
    t.scale.set(1, 1, 2.2);
    t.position.set(s * 1.75, -0.02, 0.62);
    hull.add(t);
  });
  // coroa de fragmentos na traseira (os "motores")
  const shards = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU;
    const g = new THREE.ConeGeometry(0.09, 0.85, 5);
    g.rotateX(Math.PI / 2); // ponta para +z
    const m = new THREE.Mesh(g, i % 2 ? teal : crystal);
    m.position.set(Math.cos(a) * 0.28, Math.sin(a) * 0.22, 1.0);
    m.lookAt(m.position.clone().add(V(Math.cos(a) * 0.5, Math.sin(a) * 0.4, 1.4)));
    hull.add(m);
    shards.push(m);
  }
  const trail = flame(0.22, 1.6, [1.6, 1.4, 2.6], [0.4, 0.9, 2.0]);
  trail.position.z = 1.15;
  hull.add(trail);
  const tail = sprite(new THREE.Color(0.5, 1.0, 2.0), 1.3, 0.7);
  tail.position.z = 1.4;
  hull.add(tail);
  // fragmentos orbitando
  const orbit = new THREE.Group();
  hull.add(orbit);
  const motes = [];
  for (let i = 0; i < 7; i++) {
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.07, 0), i % 2 ? teal : crystal);
    const a = (i / 7) * TAU;
    m.position.set(Math.cos(a) * 1.05, Math.sin(a * 2) * 0.18, Math.sin(a) * 1.05);
    orbit.add(m);
    const s = sprite(new THREE.Color(0.8, 0.6, 1.8), 0.35, 0.7);
    s.position.copy(m.position);
    orbit.add(s);
    motes.push(m);
  }
  const light = new THREE.PointLight(0xb08cff, 2.2, 5, 2);
  hull.add(light);
  return {
    root,
    hull,
    tick({ time, dt, power, warp, reduce }) {
      if (!reduce) {
        orbit.rotation.y += dt * (0.9 + power * 2);
        orbit.rotation.x = Math.sin(time * 0.4) * 0.3;
        motes.forEach((m, i) => (m.rotation.y += dt * (2 + i)));
      }
      const pulse = reduce ? 1 : 0.75 + 0.25 * Math.sin(time * 2.4);
      crystal.emissive.setRGB(0.23 * pulse, 0.12 * pulse, 0.6 * pulse + power * 0.15);
      heartGlow.material.opacity = 0.55 + 0.25 * pulse + warp * 0.3;
      heart.rotation.y += dt * 1.5;
      setFlame(trail, time, power, 1 + warp);
      tail.material.opacity = clamp(0.3 + power * 0.6, 0, 1);
      shards.forEach((s, i) => s.scale.setScalar(1 + 0.08 * Math.sin(time * 6 + i) * power));
    },
  };
}

// ===========================================================================
// 7. Asa Sombra: asa voadora furtiva, quase preta, com bordas em ciano
// ===========================================================================
function buildStealth() {
  const root = new THREE.Group();
  const hull = new THREE.Group();
  root.add(hull);
  const skin = new THREE.MeshStandardMaterial({ color: 0x1b1f26, metalness: 0.55, roughness: 0.42, flatShading: true });
  const shape = new THREE.Shape();
  const P = [[0, -1.5], [1.85, 0.55], [1.35, 0.85], [0.75, 0.48], [0, 0.85], [-0.75, 0.48], [-1.35, 0.85], [-1.85, 0.55]];
  shape.moveTo(...P[0]);
  P.slice(1).forEach((p) => shape.lineTo(...p));
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 1 });
  g.rotateX(Math.PI / 2); // y da forma vira +z; a espessura vai para -y
  g.translate(0, 0.05, 0);
  hull.add(new THREE.Mesh(g, skin));
  // corcova central e cabine
  const hump = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12, 0, TAU, 0, Math.PI / 2), skin);
  hump.scale.set(0.38, 0.17, 1.1);
  hump.position.set(0, 0.08, -0.05);
  hull.add(hump);
  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(1, 20, 10, 0, TAU, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x07131a, metalness: 0.95, roughness: 0.05, emissive: 0x022a33 })
  );
  canopy.scale.set(0.16, 0.1, 0.38);
  canopy.position.set(0, 0.2, -0.55);
  hull.add(canopy);
  // bordas de ataque acesas
  const edge = glowMat(0.3, 1.6, 2.2);
  const y = 0.06;
  hull.add(bar(V(0, y, -1.5), V(1.85, y, 0.55), 0.022, edge), bar(V(0, y, -1.5), V(-1.85, y, 0.55), 0.022, edge));
  const tips = [-1, 1].map((s) => {
    const t = sprite(new THREE.Color(0.3, 1.5, 2.0), 0.35, 0.8);
    t.position.set(s * 1.85, y, 0.55);
    hull.add(t);
    return t;
  });
  // motores: fendas largas na traseira
  const slitMat = glowMat(0.6, 1.8, 2.6);
  const slits = [-1, 1].map((s) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.04, 0.02), slitMat);
    m.position.set(s * 0.32, 0.1, 0.62);
    hull.add(m);
    return m;
  });
  const exh = [-1, 1].map((s) => {
    const sp = sprite(new THREE.Color(0.3, 1.1, 1.8), 0.7, 0.5);
    sp.position.set(s * 0.32, 0.1, 0.8);
    sp.scale.set(1.0, 0.35, 1);
    hull.add(sp);
    return sp;
  });
  // linhas de "camuflagem": varredura de luz no casco
  const scanMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 0.9, 1.3), transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const scan = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 0.06), scanMat);
  scan.rotation.x = -Math.PI / 2;
  scan.position.y = 0.13;
  hull.add(scan);
  return {
    root,
    hull,
    tick({ time, power, warp, boost, reduce }) {
      const k = 0.6 + power * 0.8 + warp;
      slitMat.color.setRGB(0.4 * k + 0.2, 1.4 * k, 2.2 * k);
      exh.forEach((e) => {
        e.material.opacity = clamp(0.25 + power * 0.6, 0, 1);
        e.scale.set(0.8 + power * 1.1, 0.3, 1);
      });
      tips.forEach((t) => (t.material.opacity = reduce ? 0.8 : 0.5 + 0.4 * Math.sin(time * 2.5)));
      edge.color.setRGB(0.25, 1.2 + 0.4 * boost, 1.8 + 0.6 * boost);
      if (!reduce) {
        const u = (time * 0.35) % 1;
        scan.position.z = -1.4 + u * 2.4;
        scanMat.opacity = Math.sin(u * Math.PI) * 0.35;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Catálogo. maxSpeed em unidades/s, turn em rad/s, accel = rapidez para chegar à velocidade,
// chase = distância da câmera, camY = altura da câmera
// ---------------------------------------------------------------------------
export const SHIPS = [
  {
    id: "exploradora",
    name: "Exploradora Horizonte",
    desc: "Nave de exploração clássica: disco, naceles de dobra e defletor. Equilibrada em tudo.",
    maxSpeed: 85, boost: 3.4, turn: 1.15, accel: 1.6, chase: 7.5, camY: 1.9, build: buildExplorer,
  },
  {
    id: "vespa",
    name: "Caça Vespa",
    desc: "Caça leve com quatro asas em X que se abrem em voo. Rápido e muito ágil.",
    maxSpeed: 105, boost: 3.6, turn: 1.75, accel: 2.3, chase: 6.2, camY: 1.45, build: buildFighter,
  },
  {
    id: "corsario",
    name: "Cargueiro Corsário",
    desc: "Cargueiro redondo e remendado, cabine de lado e um turbo absurdo na faixa azul.",
    maxSpeed: 92, boost: 4.4, turn: 0.95, accel: 1.2, chase: 8.6, camY: 2.3, build: buildFreighter,
  },
  {
    id: "disco",
    name: "Disco Errante",
    desc: "Disco voador com anel de luzes e raio trator. Vira no próprio eixo, mas não corre muito.",
    maxSpeed: 72, boost: 2.8, turn: 2.2, accel: 2.6, chase: 7.4, camY: 2.1, build: buildSaucer,
  },
  {
    id: "foguete",
    name: "Foguete Retrô",
    desc: "Foguete dos anos 50, com aletas e vigias. Voa reto como ninguém e faz curvas largas.",
    maxSpeed: 128, boost: 3.0, turn: 0.78, accel: 1.4, chase: 7.4, camY: 1.6, build: buildRocket,
  },
  {
    id: "cristal",
    name: "Semente de Cristal",
    desc: "Nave orgânica de cristal que pulsa e carrega fragmentos em órbita. Turbo suave e longo.",
    maxSpeed: 90, boost: 3.9, turn: 1.4, accel: 1.8, chase: 7.2, camY: 1.8, build: buildCrystal,
  },
  {
    id: "sombra",
    name: "Asa Sombra",
    desc: "Asa voadora furtiva, quase invisível no escuro. Rápida e estável.",
    maxSpeed: 110, boost: 3.3, turn: 1.3, accel: 2.0, chase: 6.8, camY: 1.5, build: buildStealth,
  },
];
export const DEFAULT_SHIP = "exploradora";
export const shipById = (id) => SHIPS.find((s) => s.id === id) || SHIPS[0];

// barras de 0 a 1 para o hangar
export function shipStats(s) {
  return [
    ["Velocidade", clamp(s.maxSpeed / 130, 0.1, 1)],
    ["Manobra", clamp(s.turn / 2.2, 0.1, 1)],
    ["Turbo", clamp((s.boost - 2.4) / 2.1, 0.1, 1)],
    ["Arranque", clamp(s.accel / 2.6, 0.1, 1)],
  ];
}

// monta uma nave nova (cada chamada cria a sua própria malha)
export function buildShip(id) {
  const spec = shipById(id);
  const ship = spec.build();
  ship.spec = spec;
  ship.dispose = () =>
    ship.root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      mats.forEach((m) => {
        if (m.map && !SHARED.has(m.map)) m.map.dispose();
        m.dispose();
      });
    });
  return ship;
}

// escolha salva no navegador (pode falhar em aba anônima etc.)
const KEY = "infome-nave";
export function loadShipId() {
  try {
    const v = window.localStorage.getItem(KEY);
    return SHIPS.some((s) => s.id === v) ? v : DEFAULT_SHIP;
  } catch (e) {
    return DEFAULT_SHIP;
  }
}
export function saveShipId(id) {
  try {
    window.localStorage.setItem(KEY, id);
    return true;
  } catch (e) {
    return false;
  }
}
