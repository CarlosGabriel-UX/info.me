// Cena de abertura: o quarto, a mesa e o personagem (visual de Matrix) sentado no computador.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// Centro da cabeça: é daqui que a câmera "entra" no cérebro.
export const HEAD = new THREE.Vector3(0, 1.22, -0.02);

let seed = 99;
const smoothstep = (a, b, v) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const rand = () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, "rgba(255,255,255,1)");
  r.addColorStop(0.3, "rgba(255,255,255,0.35)");
  r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

// ---------------------------------------------------------------------------
// Telas desenhadas em canvas
// ---------------------------------------------------------------------------

// Terminal com comandos de redes e Linux sendo digitados
const TERMINAL = [
  ["p", "carlos@senac:~$ ", "ping -c 3 192.168.10.1"],
  ["o", "64 bytes from 192.168.10.1: icmp_seq=1 ttl=64 time=0.84 ms"],
  ["o", "64 bytes from 192.168.10.1: icmp_seq=2 ttl=64 time=0.79 ms"],
  ["o", "--- 3 packets transmitted, 3 received, 0% packet loss"],
  ["p", "Switch# ", "configure terminal"],
  ["p", "Switch(config)# ", "vlan 10"],
  ["p", "Switch(config-vlan)# ", "name ADMIN"],
  ["p", "Switch(config)# ", "interface range fa0/1-12"],
  ["p", "Switch(config-if-range)# ", "switchport access vlan 10"],
  ["p", "Switch(config-if-range)# ", "spanning-tree portfast"],
  ["p", "carlos@senac:~$ ", "sudo tcpdump -i eth0 port 53 -c 2"],
  ["o", "IP 192.168.10.23.51234 > 8.8.8.8.53: A? senac.br"],
  ["o", "IP 8.8.8.8.53 > 192.168.10.23.51234: A 200.x.x.x"],
  ["p", "carlos@senac:~$ ", "python3 automacao_backup.py"],
  ["k", "[OK] 3 servidores sincronizados"],
];

function makeTerminal() {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 560;
  const g = c.getContext("2d");
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  let line = 0;
  let chars = 0;
  let pause = 0;
  const LH = 32;
  const MAXL = 15;

  function draw(cursorOn) {
    g.fillStyle = "#08183a";
    g.fillRect(0, 0, c.width, c.height);
    // barra de título
    g.fillStyle = "#0b1730";
    g.fillRect(0, 0, c.width, 34);
    ["#f43f5e", "#facc15", "#34d399"].forEach((col, i) => {
      g.fillStyle = col;
      g.beginPath();
      g.arc(22 + i * 22, 17, 6, 0, Math.PI * 2);
      g.fill();
    });
    g.fillStyle = "#64748b";
    g.font = "16px ui-monospace, Menlo, Consolas, monospace";
    g.fillText("terminal — carlos@senac", 420, 23);

    g.font = "bold 24px ui-monospace, Menlo, Consolas, monospace";
    const first = Math.max(0, line - MAXL + 1);
    let cx = 20;
    let cy = 60;
    for (let i = first; i <= Math.min(line, TERMINAL.length - 1); i++) {
      const [kind, a, b] = TERMINAL[i];
      const y = 64 + (i - first) * LH;
      if (kind === "p") {
        const cmd = i < line ? b : b.slice(0, chars);
        g.fillStyle = a.startsWith("Switch") ? "#38bdf8" : "#34d399";
        g.fillText(a, 20, y);
        const w = g.measureText(a).width;
        g.fillStyle = "#e5e7eb";
        g.fillText(cmd, 20 + w, y);
        cx = 20 + w + g.measureText(cmd).width + 2;
        cy = y;
      } else if (i < line || i === line) {
        g.fillStyle = kind === "k" ? "#34d399" : "#a5b4c8";
        g.fillText(a, 20, y);
        cx = 20;
        cy = y + LH;
      }
    }
    if (cursorOn) {
      g.fillStyle = "#e0f2fe";
      g.fillRect(cx, cy - 18, 11, 22);
    }
    tex.needsUpdate = true;
  }

  function step() {
    if (pause > 0) {
      pause--;
      return;
    }
    const cur = TERMINAL[line];
    if (!cur) {
      line = 0;
      chars = 0;
      pause = 20;
      return;
    }
    if (cur[0] === "p" && chars < cur[2].length) {
      chars++;
      if (chars === cur[2].length) pause = 8;
      return;
    }
    line++;
    chars = 0;
    pause = cur[0] === "p" ? 4 : 2;
    if (line >= TERMINAL.length) pause = 60;
  }

  return { tex, draw, step, finish: () => ((line = TERMINAL.length - 1), (chars = 99)) };
}

// Monitor lateral: topologia de rede com pacotes circulando
function makeTopology() {
  const c = document.createElement("canvas");
  c.width = 640;
  c.height = 400;
  const g = c.getContext("2d");
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const N = [
    { x: 320, y: 70, t: "R1", k: "r" },
    { x: 170, y: 180, t: "SW1", k: "s" },
    { x: 470, y: 180, t: "SW2", k: "s" },
    { x: 80, y: 310, t: "PC1", k: "p" },
    { x: 220, y: 320, t: "PC2", k: "p" },
    { x: 400, y: 320, t: "SRV", k: "p" },
    { x: 560, y: 310, t: "AP", k: "p" },
  ];
  const L = [
    [0, 1],
    [0, 2],
    [1, 2],
    [1, 3],
    [1, 4],
    [2, 5],
    [2, 6],
  ];
  const pk = L.map((l, i) => ({ l, t: (i * 0.37) % 1, s: 0.004 + (i % 3) * 0.002 }));
  const col = { r: "#a78bfa", s: "#22d3ee", p: "#34d399" };
  function draw() {
    g.fillStyle = "#050d1d";
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = "#0b1730";
    g.fillRect(0, 0, c.width, 30);
    g.fillStyle = "#64748b";
    g.font = "15px ui-monospace, Menlo, monospace";
    g.fillText("topologia — lab VLAN 10/20", 16, 20);
    g.lineWidth = 2;
    L.forEach(([a, b]) => {
      g.strokeStyle = "rgba(56,189,248,0.35)";
      g.beginPath();
      g.moveTo(N[a].x, N[a].y);
      g.lineTo(N[b].x, N[b].y);
      g.stroke();
    });
    pk.forEach((p) => {
      p.t = (p.t + p.s) % 1;
      const [a, b] = p.l;
      const x = N[a].x + (N[b].x - N[a].x) * p.t;
      const y = N[a].y + (N[b].y - N[a].y) * p.t;
      g.fillStyle = "#fde047";
      g.beginPath();
      g.arc(x, y, 5, 0, Math.PI * 2);
      g.fill();
    });
    g.font = "bold 15px ui-monospace, Menlo, monospace";
    g.textAlign = "center";
    N.forEach((n) => {
      g.fillStyle = "#0b1224";
      g.strokeStyle = col[n.k];
      g.lineWidth = 3;
      g.beginPath();
      if (n.k === "r") g.arc(n.x, n.y, 24, 0, Math.PI * 2);
      else g.rect(n.x - 26, n.y - 17, 52, 34);
      g.fill();
      g.stroke();
      g.fillStyle = col[n.k];
      g.fillText(n.t, n.x, n.y + 5);
    });
    g.textAlign = "left";
    tex.needsUpdate = true;
  }
  return { tex, draw };
}

// Teclado com teclas iluminadas
function makeKeys() {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 160;
  const g = c.getContext("2d");
  g.fillStyle = "#050608";
  g.fillRect(0, 0, 512, 160);
  const rows = [15, 14, 13, 12];
  rows.forEach((n, r) => {
    const kw = 512 / 15.5;
    for (let i = 0; i < n; i++) {
      const hue = 190 + (i / n) * 80 + r * 6;
      g.fillStyle = `hsla(${hue}, 90%, 60%, 0.55)`;
      g.fillRect(6 + i * kw + r * 8, 8 + r * 36, kw - 6, 28);
    }
  });
  g.fillStyle = "hsla(230, 90%, 60%, 0.55)";
  g.fillRect(130, 8 + 4 * 36 - 4, 250, 10);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------------------------------------------------------------------------
// Montagem
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Holograma: superfícies translúcidas com brilho nas bordas (fresnel), linhas de
// varredura e uma faixa clara subindo. Funciona em malhas comuns e com esqueleto.
// ---------------------------------------------------------------------------
const HOLO_TIME = { value: 0 };
const HOLO_GREEN = new THREE.Color(0x22ff99);
// main.js ajusta opacity/depthWrite dos materiais da sala; aqui a opacidade vai
// para o uniform e o depthWrite fica sempre desligado (tudo é luz somada)
function bindFade(m, u, pow = 1) {
  Object.defineProperty(m, "opacity", { get: () => u.value, set: (v) => (u.value = Math.pow(v, pow)) });
  Object.defineProperty(m, "depthWrite", { get: () => false, set: () => {} });
  return m;
}
function holoSurface(color = HOLO_GREEN, strength = 1, fadePow = 1) {
  const uniforms = {
    uColor: { value: new THREE.Color(color) },
    uTime: HOLO_TIME,
    uOpacity: { value: 1 },
    uStrength: { value: strength },
  };
  const m = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `
      #include <common>
      #include <skinning_pars_vertex>
      varying vec3 vN;
      varying vec3 vV;
      varying vec3 vW;
      void main() {
        #include <beginnormal_vertex>
        #include <skinbase_vertex>
        #include <skinnormal_vertex>
        #include <defaultnormal_vertex>
        #include <begin_vertex>
        #include <skinning_vertex>
        #include <project_vertex>
        vN = normalize(transformedNormal);
        vV = -mvPosition.xyz;
        vW = (modelMatrix * vec4(transformed, 1.0)).xyz;
      }`,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uTime, uOpacity, uStrength;
      varying vec3 vN;
      varying vec3 vV;
      varying vec3 vW;
      void main() {
        vec3 n = normalize(vN);
        float f = pow(1.0 - abs(dot(n, normalize(vV))), 2.4);
        float scan = 0.5 + 0.5 * sin(vW.y * 320.0 - uTime * 5.0);
        float sweep = 1.0 - smoothstep(0.0, 0.035, abs(fract(uTime * 0.11) * 3.2 - 0.2 - vW.y));
        float a = (0.035 + f * 0.85) * (0.7 + 0.3 * scan) + sweep * 0.3;
        a *= uStrength * uOpacity;
        gl_FragColor = vec4(mix(uColor, vec3(0.85, 1.0, 0.92), sweep * 0.6) * a, a);
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
  });
  return bindFade(m, uniforms.uOpacity, fadePow);
}
const EDGE_MAT = new THREE.LineBasicMaterial({
  color: new THREE.Color(0x22ff99).multiplyScalar(0.55),
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  toneMapped: false,
});

// Grade no chão, com um pulso circular saindo de baixo da mesa
function holoGrid() {
  const u = { uTime: HOLO_TIME, uOpacity: { value: 1 } };
  const m = new THREE.ShaderMaterial({
    uniforms: u,
    vertexShader: `
      varying vec3 vW;
      void main() { vW = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0); }`,
    fragmentShader: `
      uniform float uTime, uOpacity;
      varying vec3 vW;
      float grid(vec2 p, float w) {
        vec2 d = abs(fract(p - 0.5) - 0.5) / fwidth(p);
        return 1.0 - min(min(d.x, d.y) / w, 1.0);
      }
      void main() {
        vec2 p = vW.xz;
        float r = length(p - vec2(0.0, -0.6));
        float g = grid(p * 4.0, 1.0) * 0.3 + grid(p, 1.3) * 0.7;
        float ph = fract(uTime * 0.18);
        float ring = exp(-pow(r - ph * 9.0, 2.0) * 5.0) * (1.0 - ph);
        float fade = exp(-r * 0.32);
        vec3 col = vec3(0.12, 1.0, 0.6) * (g * (0.55 + ring * 1.5) + ring * 0.12) * fade;
        col += vec3(0.02, 0.12, 0.08) * exp(-r * 1.4); // brilho sob a mesa
        gl_FragColor = vec4(col * uOpacity, 1.0);
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
  });
  return bindFade(m, u.uOpacity);
}

export function buildRoom(avatar = {}) {
  const group = new THREE.Group();
  const mats = [];
  const headMats = [];
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const GLOW = glowTexture();

  const std = (color, o = {}) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.05, transparent: true, ...o });
    mats.push(m);
    return m;
  };
  const basic = (color, o = {}) => {
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, toneMapped: false, ...o });
    mats.push(m);
    return m;
  };
  const add = (geo, m, x = 0, y = 0, z = 0, parent = group) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    parent.add(o);
    return o;
  };
  const rbox = (w, h, d, r = 0.01) => new RoundedBoxGeometry(w, h, d, 3, r);
  function limb(a, b, r, m, parent = group) {
    const va = new THREE.Vector3(...a);
    const vb = new THREE.Vector3(...b);
    const o = new THREE.Mesh(new THREE.CapsuleGeometry(r, va.distanceTo(vb), 6, 14), m);
    o.position.copy(va).add(vb).multiplyScalar(0.5);
    o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
    parent.add(o);
    return o;
  }

  // --- Mesa ---------------------------------------------------------------
  // tampo com pés de metal
  const deskMat = std(0xffffff);
  const metal = std(0x0e0f13, { roughness: 0.4, metalness: 0.7 });
  add(rbox(2.0, 0.045, 0.85, 0.014), deskMat, 0, 0.74, -0.95);
  [
    [-0.95, -0.58],
    [0.95, -0.58],
    [-0.95, -1.32],
    [0.95, -1.32],
  ].forEach(([x, z]) => add(new THREE.BoxGeometry(0.04, 0.72, 0.04), metal, x, 0.36, z));
  // fita de LED sob a borda da mesa
  add(new THREE.BoxGeometry(1.9, 0.008, 0.008), basic(0x22d3ee), 0, 0.715, -0.54);

  // Monitor principal (curvo) com terminal
  const term = makeTerminal();
  term.tex.wrapS = THREE.RepeatWrapping;
  term.tex.repeat.x = -1;
  const MON = { r: 1.4, h: 0.44, th: 0.56, y: 1.13, z: -1.25 };
  const screen = new THREE.Mesh(
    new THREE.CylinderGeometry(MON.r, MON.r, MON.h, 40, 1, true, Math.PI - MON.th / 2, MON.th),
    basic(0xffffff, { map: term.tex, side: THREE.BackSide })
  );
  screen.position.set(0, MON.y, MON.z + MON.r);
  group.add(screen);
  const bezel = new THREE.Mesh(
    new THREE.CylinderGeometry(MON.r + 0.012, MON.r + 0.012, MON.h + 0.03, 40, 1, true, Math.PI - MON.th / 2 - 0.01, MON.th + 0.02),
    std(0x07080b, { side: THREE.DoubleSide, roughness: 0.4 })
  );
  bezel.position.copy(screen.position);
  group.add(bezel);
  add(new THREE.BoxGeometry(0.05, 0.3, 0.05), metal, 0, 0.9, MON.z - 0.05);
  add(rbox(0.3, 0.015, 0.2, 0.006), metal, 0, 0.765, MON.z - 0.02);

  // Notebook aberto ao lado, com a topologia de rede
  const topo = makeTopology();
  const side = new THREE.Group();
  side.position.set(0.66, 0.7625, -0.86);
  side.rotation.y = -0.6;
  group.add(side);
  const lapMat = std(0x1b1d23, { roughness: 0.35, metalness: 0.6 });
  add(rbox(0.46, 0.016, 0.31, 0.008), lapMat, 0, 0.008, 0, side);
  add(new THREE.PlaneGeometry(0.4, 0.15), std(0x0b0c10, { roughness: 0.6 }), 0, 0.0165, -0.03, side).rotation.x = -Math.PI / 2;
  const lid = new THREE.Group();
  lid.position.set(0, 0.016, -0.155);
  lid.rotation.x = -0.28;
  side.add(lid);
  add(rbox(0.46, 0.3, 0.012, 0.008), lapMat, 0, 0.15, -0.006, lid);
  add(new THREE.PlaneGeometry(0.43, 0.26), basic(0xffffff, { map: topo.tex }), 0, 0.152, 0.001, lid);

  // Teclado, mouse e mousepad
  const keysTex = makeKeys();
  add(rbox(0.44, 0.018, 0.14, 0.006), std(0x0b0c10, { emissive: 0xffffff, emissiveMap: keysTex, emissiveIntensity: 0.9, roughness: 0.6 }), 0, 0.768, -0.66);
  const pad = add(new THREE.PlaneGeometry(0.3, 0.25), std(0x0a0b10, { roughness: 1 }), 0.36, 0.7635, -0.65);
  pad.rotation.x = -Math.PI / 2;
  const mouse = add(new THREE.CapsuleGeometry(0.022, 0.03, 6, 12), std(0x111217, { roughness: 0.4 }), 0.345, 0.777, -0.56);
  mouse.rotation.x = Math.PI / 2;
  mouse.scale.set(1, 1, 0.55);

  // Caneca com vapor
  const mugMat = std(0x1d4ed8, { roughness: 0.5 });
  add(new THREE.CylinderGeometry(0.038, 0.034, 0.1, 24), mugMat, -0.5, 0.81, -0.78);
  const handle = add(new THREE.TorusGeometry(0.025, 0.007, 8, 16, Math.PI), mugMat, -0.54, 0.81, -0.78);
  handle.rotation.z = Math.PI / 2;
  const steam = [];
  for (let i = 0; i < 7; i++) {
    const s = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: GLOW, color: 0x9fb4d8, transparent: true, opacity: 0, depthWrite: false })
    );
    s.userData.t = i / 7;
    group.add(s);
    steam.push(s);
  }

  // Switch de rede com LEDs piscando e cabos
  const sw = new THREE.Group();
  sw.position.set(-0.62, 0.785, -1.12);
  sw.rotation.y = 0.25;
  group.add(sw);
  add(rbox(0.34, 0.045, 0.16, 0.006), std(0x1a1d24, { metalness: 0.5, roughness: 0.4 }), 0, 0, 0, sw);
  const leds = [];
  for (let i = 0; i < 8; i++) {
    add(new THREE.BoxGeometry(0.022, 0.014, 0.004), std(0x050507), -0.13 + i * 0.034, -0.002, 0.081, sw);
    const led = add(new THREE.BoxGeometry(0.006, 0.004, 0.003), basic(i % 3 === 2 ? 0xf59e0b : 0x22c55e), -0.13 + i * 0.034, 0.014, 0.082, sw);
    led.userData.phase = rand() * 10;
    leds.push(led);
  }
  const cableMat = std(0x1e40af, { roughness: 0.7 });
  [
    [-0.1, 0x1e40af],
    [-0.03, 0xca8a04],
    [0.04, 0x1e40af],
  ].forEach(([x], i) => {
    const start = new THREE.Vector3(x, 0, 0.09).applyMatrix4(sw.matrixWorld.compose(sw.position, sw.quaternion, sw.scale));
    const pts = [
      start,
      start.clone().add(new THREE.Vector3(0.02, -0.02, 0.08)),
      new THREE.Vector3(-0.5 + i * 0.05, 0.765, -0.72),
      new THREE.Vector3(-0.2 + i * 0.03, 0.765, -0.8 - i * 0.02),
    ];
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.004, 6), i === 1 ? std(0xca8a04) : cableMat);
  });

  // Planta
  add(new THREE.CylinderGeometry(0.06, 0.045, 0.12, 20), std(0x27272a), 0.88, 0.82, -1.28);
  seed = 21;
  const leafMat = std(0x14532d, { roughness: 0.7 });
  for (let i = 0; i < 9; i++) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), leafMat);
    leaf.scale.set(0.35, 1.6, 0.12);
    const a = (i / 9) * Math.PI * 2;
    leaf.position.set(0.88 + Math.cos(a) * 0.035, 0.94 + rand() * 0.04, -1.28 + Math.sin(a) * 0.035);
    leaf.rotation.set(Math.sin(a) * 0.5, -a, Math.cos(a) * 0.5);
    group.add(leaf);
  }

  // --- Cadeira ------------------------------------------------------------
  // cadeira preta com assento verde-azulado
  const chairMat = std(0x0f1116, { roughness: 0.7 });
  const seatMat = std(0x0e4f52, { roughness: 0.85 });
  const accent = basic(0x14b8a6, { opacity: 0.35 });
  add(rbox(0.52, 0.035, 0.5, 0.012), chairMat, 0, 0.425, 0.22);
  add(rbox(0.5, 0.07, 0.48, 0.03), seatMat, 0, 0.47, 0.22);
  const back = new THREE.Group();
  back.position.set(0, 0.5, 0.47);
  back.rotation.x = 0.12;
  group.add(back);
  add(rbox(0.5, 0.52, 0.07, 0.035), chairMat, 0, 0.3, 0, back);
  add(new THREE.BoxGeometry(0.006, 0.44, 0.006), accent, -0.2, 0.3, 0.037, back);
  add(new THREE.BoxGeometry(0.006, 0.44, 0.006), accent, 0.2, 0.3, 0.037, back);
  [-1, 1].forEach((s) => {
    add(new THREE.BoxGeometry(0.03, 0.18, 0.03), metal, s * 0.27, 0.56, 0.25);
    add(rbox(0.06, 0.03, 0.26, 0.01), chairMat, s * 0.27, 0.66, 0.18);
  });
  add(new THREE.CylinderGeometry(0.025, 0.025, 0.34, 12), metal, 0, 0.25, 0.22);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    const leg = add(new THREE.BoxGeometry(0.3, 0.025, 0.035), metal, Math.cos(a) * 0.15, 0.07, 0.22 + Math.sin(a) * 0.15);
    leg.rotation.y = -a;
    add(new THREE.SphereGeometry(0.025, 10, 8), chairMat, Math.cos(a) * 0.3, 0.03, 0.22 + Math.sin(a) * 0.3);
  }

  // --- Chuva de código (estilo Matrix) ------------------------------------
  // Caracteres verdes caindo (katakana e números espelhados), com a ponta de cada
  // coluna mais clara. Usada no reflexo dos óculos do personagem.
  const HOLO = new THREE.Color(0x22ff66);
  const glyphs = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 512;
    const g = c.getContext("2d");
    g.fillStyle = "#000";
    g.fillRect(0, 0, 512, 512);
    g.fillStyle = "#fff";
    g.font = "bold 50px monospace";
    g.textAlign = "center";
    g.textBaseline = "middle";
    const chars = "ｦｱｳｴｵｶｷｹｺｻｼｽｾｿﾀﾂﾃﾅﾆﾇﾈﾊﾋﾎﾏﾐﾑﾒﾓﾔﾕﾗﾘﾜ0123456789Z:.=*+-<>¦|ｸﾁﾄﾉﾌﾍﾖﾙﾚﾛﾝ";
    for (let i = 0; i < 64; i++) {
      const x = (i % 8) * 64 + 32;
      const y = Math.floor(i / 8) * 64 + 34;
      g.save();
      g.translate(x, y);
      g.scale(-1, 1); // espelhado, como no filme
      g.fillText(chars[i % chars.length], 0, 0);
      g.restore();
    }
    const t = new THREE.CanvasTexture(c);
    t.minFilter = THREE.LinearFilter;
    t.generateMipmaps = false;
    return t;
  })();
  const holoUniforms = {
    uTime: { value: 0 },
    uGlyphs: { value: glyphs },
    uCell: { value: 14 * Math.min(window.devicePixelRatio || 1, 2) },
  };
  function holoMaterial() {
    const m = new THREE.ShaderMaterial({
      uniforms: { ...holoUniforms, uColor: { value: HOLO }, uOpacity: { value: 1 }, uGain: { value: 1 } },
      vertexShader: `
        varying vec3 vN;
        varying vec3 vV;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vN = normalize(normalMatrix * normal);
          vV = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform float uTime;
        uniform sampler2D uGlyphs;
        uniform float uCell;
        uniform vec3 uColor;
        uniform float uOpacity;
        uniform float uGain;
        varying vec3 vN;
        varying vec3 vV;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        void main() {
          float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
          vec2 cell = floor(gl_FragCoord.xy / uCell);
          vec2 inCell = fract(gl_FragCoord.xy / uCell);
          float seed = hash(vec2(cell.x, 3.7));
          // cada coluna tem uma "gota" descendo, com rastro que apaga
          float period = 40.0 + floor(seed * 30.0);
          float head = fract(uTime * (0.12 + seed * 0.22) + seed * 7.0) * period;
          float row = mod(-cell.y, period);
          float d = mod(head - row, period);
          float trail = exp(-d * 0.16);
          float isHead = 1.0 - step(1.0, d);
          float idx = floor(hash(cell + floor(uTime * (1.5 + seed * 5.0) + seed * 20.0)) * 64.0);
          vec2 guv = (vec2(mod(idx, 8.0), 7.0 - floor(idx / 8.0)) + inCell) / 8.0;
          float glyph = texture2D(uGlyphs, guv).r;
          vec3 col = mix(uColor * 0.8, vec3(0.8, 1.0, 0.85), isHead);
          float rain = glyph * (0.15 + 1.5 * trail);
          float a = (rain + 0.04 + 0.32 * f) * uOpacity * uGain;
          gl_FragColor = vec4((col * rain + uColor * (0.04 + 0.32 * f)) * uOpacity * uGain, a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    // main.js controla opacity/depthWrite de todos os materiais da sala;
    // aqui a opacidade vai para o uniform e o personagem nunca escreve profundidade.
    Object.defineProperty(m, "opacity", { get: () => m.uniforms.uOpacity.value, set: (v) => (m.uniforms.uOpacity.value = v) });
    Object.defineProperty(m, "depthWrite", { get: () => false, set: () => {} });
    return m;
  }
  // reflexo nas lentes dos óculos: a mesma chuva de código
  const lensRain = holoMaterial();
  headMats.push(lensRain);

  // --- Personagem (modelo 3D) ---------------------------------------------
  // Modelo humano com esqueleto (assets/models/avatar.glb), de sobretudo preto e
  // óculos escuros. A pose sentada é montada apontando os ossos para alvos na
  // cena: IK de dois ossos para braços e pernas, dedos dobrados em volta da palma.
  const look = { model: "assets/models/avatar.glb", ...avatar };
  const V3 = THREE.Vector3;
  const Q = THREE.Quaternion;
  const wpos = (o) => o.getWorldPosition(new V3());
  // gira o osso em torno de um eixo do mundo
  function rotateWorld(b, axis, ang) {
    const pq = b.parent.getWorldQuaternion(new Q()).invert();
    const wq = b.getWorldQuaternion(new Q());
    b.quaternion.copy(pq.multiply(new Q().setFromAxisAngle(axis, ang)).multiply(wq));
    b.updateMatrixWorld(true);
  }
  // gira o osso para que o filho fique na direção do alvo
  function aim(b, child, target) {
    const bp = wpos(b);
    const d = new Q().setFromUnitVectors(wpos(child).sub(bp).normalize(), target.clone().sub(bp).normalize());
    const pq = b.parent.getWorldQuaternion(new Q()).invert();
    b.quaternion.copy(pq.multiply(d).multiply(b.getWorldQuaternion(new Q())));
    b.updateMatrixWorld(true);
  }
  // braço/perna: a, b, c = ombro, cotovelo, punho; o cotovelo vai para o lado do "pole"
  function twoBone(a, b, c, target, pole) {
    const A = wpos(a);
    const la = A.distanceTo(wpos(b));
    const lb = wpos(b).distanceTo(wpos(c));
    const dir = target.clone().sub(A);
    const d = Math.min(dir.length(), (la + lb) * 0.999);
    dir.normalize();
    const x = (la * la - lb * lb + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(la * la - x * x, 0));
    const p = pole.clone().sub(A);
    p.addScaledVector(dir, -p.dot(dir)).normalize();
    aim(a, b, A.clone().addScaledVector(dir, x).addScaledVector(p, h));
    aim(b, c, A.clone().addScaledVector(dir, d));
  }

  let person = null;
  // avisa a tela de boot (boot.js) do andamento do download do modelo
  const bootSignal = (type, detail) => window.dispatchEvent(new CustomEvent("boot:" + type, { detail }));
  new GLTFLoader().load(
    look.model,
    (gltf) => {
      person = setupPerson(gltf.scene);
      bootSignal("ready");
    },
    (e) => e.total && bootSignal("progress", e.loaded / e.total),
    (e) => {
      console.warn("avatar:", e);
      bootSignal("ready");
    }
  );

  // Nuvem de pontos sobre a superfície do modelo já posado. A pele é calculada na
  // CPU a cada quadro (a pose respira e a cabeça se mexe) e os pontos são sorteados
  // nos triângulos, proporcionais à área. Os pontos da cabeça se espalham quando a
  // câmera entra nela e viram poeira luminosa.
  function avatarCloud(root) {
    const parts = [];
    root.traverse((o) => {
      if (!o.isSkinnedMesh || !o.visible) return;
      const g = o.geometry;
      const pos = g.attributes.position;
      const idx = g.index ? g.index.array : [...Array(pos.count).keys()];
      const area = [];
      let total = 0;
      const a = new V3(), b = new V3(), c = new V3();
      for (let t = 0; t < idx.length; t += 3) {
        a.fromBufferAttribute(pos, idx[t]);
        b.fromBufferAttribute(pos, idx[t + 1]);
        c.fromBufferAttribute(pos, idx[t + 2]);
        total += b.sub(a).cross(c.sub(a)).length() / 2;
        area.push(total);
      }
      parts.push({ mesh: o, idx, area, total, skinned: new Float32Array(pos.count * 3) });
    });
    const sumArea = parts.reduce((s, p) => s + p.total, 0);
    const N = 90000;
    seed = 2718;
    const samples = []; // [parte, a, b, c, u, v]
    parts.forEach((p, pi) => {
      const n = Math.round((N * p.total) / sumArea);
      for (let k = 0; k < n; k++) {
        const r = rand() * p.total;
        let lo = 0, hi = p.area.length - 1;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (p.area[mid] < r) lo = mid + 1;
          else hi = mid;
        }
        let u = rand(), v = rand();
        if (u + v > 1) (u = 1 - u), (v = 1 - v);
        samples.push(pi, p.idx[lo * 3], p.idx[lo * 3 + 1], p.idx[lo * 3 + 2], u, v);
      }
    });
    const count = samples.length / 6;
    const posArr = new Float32Array(count * 3);
    const rnd = new Float32Array(count).map(() => rand());
    const head = new Float32Array(count);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(posArr, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("aRnd", new THREE.BufferAttribute(rnd, 1));
    geo.setAttribute("aHead", new THREE.BufferAttribute(head, 1));
    const u = {
      uTime: HOLO_TIME,
      uSize: { value: 0.0065 },
      uScale: { value: 400 },
      uHead: { value: 1 },
      uOpacity: { value: 1 },
      uHC: { value: HEAD.clone() },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: u,
      vertexShader: `
        uniform float uTime, uSize, uScale, uHead;
        uniform vec3 uHC;
        attribute float aRnd, aHead;
        varying float vA;
        varying float vHot;
        void main() {
          vec3 p = position;
          // a cabeça se desfaz para fora quando a câmera entra
          float burst = (1.0 - uHead) * aHead;
          vec3 dir = normalize(p - uHC + vec3(0.0, 1e-4, 0.0));
          p += dir * burst * (0.1 + aRnd * 0.9) + vec3(0.0, burst * aRnd * 0.2, 0.0);
          // falha de sinal: uma faixa horizontal desloca de vez em quando
          float glitch = step(0.93, fract(sin(floor(uTime * 7.0) * 91.7) * 437.58));
          float bandY = 0.3 + fract(sin(floor(uTime * 7.0) * 13.1) * 91.3) * 1.2;
          p.x += glitch * step(abs(p.y - bandY), 0.025) * 0.03;
          float sweep = 1.0 - smoothstep(0.0, 0.045, abs(fract(uTime * 0.11) * 3.2 - 0.2 - p.y));
          vHot = sweep;
          vA = (0.55 + 0.45 * sin(uTime * (1.5 + aRnd * 4.0) + aRnd * 60.0)) * (1.0 - burst * 0.6);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = min(uSize * (1.0 + sweep * 1.4 + burst * 1.5) * uScale / -mv.z, 7.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform float uOpacity;
        varying float vA;
        varying float vHot;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.05, d) * vA * uOpacity;
          vec3 c = mix(vec3(0.15, 1.0, 0.55), vec3(0.9, 1.0, 0.95), vHot);
          gl_FragColor = vec4(c * a, a);
        }`,
      transparent: true,
      blending: THREE.AdditiveBlending,
    });
    bindFade(mat, u.uOpacity);
    mats.push(mat);
    // a cabeça é controlada pelo fade da cabeça em main.js
    headMats.push({
      set opacity(v) {
        u.uHead.value = v;
      },
      set depthWrite(v) {},
      set visible(v) {},
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    group.add(pts);

    const M = new THREE.Matrix4();
    const inv = new THREE.Matrix4();
    const mats4 = parts.map((p) => p.mesh.skeleton.bones.map(() => new THREE.Matrix4()));
    const v = new V3();
    const tv = new V3();
    let first = true;
    function update() {
      inv.copy(group.matrixWorld).invert();
      parts.forEach((p, pi) => {
        const m = p.mesh;
        const sk = m.skeleton;
        // matriz final de cada osso, já levando para o espaço do grupo da sala
        const pre = new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld).multiply(m.bindMatrixInverse);
        sk.bones.forEach((bone, i) => {
          mats4[pi][i].multiplyMatrices(pre, M.multiplyMatrices(bone.matrixWorld, sk.boneInverses[i])).multiply(m.bindMatrix);
        });
        const g = m.geometry;
        const pos = g.attributes.position;
        const si = g.attributes.skinIndex;
        const sw = g.attributes.skinWeight;
        const out = p.skinned;
        const e = mats4[pi];
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i);
          let x = 0, y = 0, z = 0;
          for (let k = 0; k < 4; k++) {
            const w = sw.getComponent(i, k);
            if (w === 0) continue;
            tv.copy(v).applyMatrix4(e[si.getComponent(i, k)]);
            x += tv.x * w;
            y += tv.y * w;
            z += tv.z * w;
          }
          out[i * 3] = x;
          out[i * 3 + 1] = y;
          out[i * 3 + 2] = z;
        }
      });
      for (let s = 0, j = 0; s < samples.length; s += 6, j += 3) {
        const q = parts[samples[s]].skinned;
        const a = samples[s + 1] * 3, b = samples[s + 2] * 3, c = samples[s + 3] * 3;
        const uu = samples[s + 4], vv = samples[s + 5], ww = 1 - uu - vv;
        posArr[j] = q[a] * ww + q[b] * uu + q[c] * vv;
        posArr[j + 1] = q[a + 1] * ww + q[b + 1] * uu + q[c + 1] * vv;
        posArr[j + 2] = q[a + 2] * ww + q[b + 2] * uu + q[c + 2] * vv;
      }
      if (first) {
        // pontos perto do centro da cabeça (rosto, crânio, pescoço alto) são "cabeça"
        for (let j = 0; j < count; j++) {
          const dx = posArr[j * 3] - HEAD.x, dy = posArr[j * 3 + 1] - HEAD.y, dz = posArr[j * 3 + 2] - HEAD.z;
          head[j] = Math.hypot(dx, dy * 0.85, dz) < 0.17 ? 1 : 0;
        }
        geo.attributes.aHead.needsUpdate = true;
        first = false;
      }
      geo.attributes.position.needsUpdate = true;
      u.uScale.value = (window.innerHeight * Math.min(window.devicePixelRatio || 1, 2)) / 2;
    }
    update();
    return { update };
  }

  function setupPerson(root) {
    const B = {};
    root.traverse((o) => {
      if (o.isBone) B[o.name] = o;
      if (!o.isMesh) return;
      o.frustumCulled = false;
      // sem chapéu e sem bigode: careca, como o Morpheus
      if (o.name === "Wolf3D_Headwear" || o.name === "Wolf3D_Beard") {
        o.visible = false;
        return;
      }
      if (/Teeth/.test(o.name)) {
        o.visible = false;
        return;
      }
      // holograma: a malha vira só um contorno translúcido; o corpo em si é a nuvem de pontos
      const m = holoSurface(HOLO_GREEN, /Eye/.test(o.name) ? 0.3 : 0.45);
      o.material = m;
      o.castShadow = o.receiveShadow = false;
      // cabeça e pele (mãos e pescoço) somem junto com a cabeça quando a câmera entra
      (/Head|Eye|Body/.test(o.name) ? headMats : mats).push(m);
    });
    root.rotation.y = Math.PI; // o modelo olha para +z; a mesa fica em -z
    group.add(root);
    root.updateMatrixWorld(true);

    // lado da palma de cada mão, guardado em coordenadas locais antes de posar
    // (na pose de fábrica os braços caem ao lado do corpo com a palma para dentro)
    const palm = {};
    ["Left", "Right"].forEach((s) => {
      const hand = B[s + "Hand"];
      const inward = new V3(-wpos(hand).x, 0, 0).normalize();
      palm[s] = inward.applyQuaternion(hand.getWorldQuaternion(new Q()).invert());
    });

    // quadril sobre o assento
    const hips = wpos(B.Hips);
    root.position.add(new V3(0, 0.6, 0.02).sub(hips));
    root.updateMatrixWorld(true);

    // coluna inclinada para a frente, pescoço compensando
    const X = new V3(1, 0, 0);
    rotateWorld(B.Spine, X, -0.17);
    rotateWorld(B.Spine1, X, -0.08);
    rotateWorld(B.Spine2, X, -0.04);
    rotateWorld(B.Neck, X, 0.14);
    rotateWorld(B.Head, X, 0.02);

    // pernas: coxas para a frente, canelas para baixo, pés no chão
    ["Left", "Right"].forEach((s) => {
      const hip = wpos(B[s + "UpLeg"]);
      const sx = Math.sign(hip.x);
      const ankle = new V3(hip.x + sx * 0.04, 0.11, hip.z - 0.45);
      twoBone(B[s + "UpLeg"], B[s + "Leg"], B[s + "Foot"], ankle, hip.clone().add(new V3(sx * 0.1, 0.4, -1)));
      aim(B[s + "Foot"], B[s + "ToeBase"], ankle.clone().add(new V3(0, -0.07, -0.13)));
    });

    // dobra os dedos em direção à palma
    function curl(side, amount, thumb = 0.4) {
      const hand = B[side + "Hand"];
      const pn = palm[side].clone().applyQuaternion(hand.getWorldQuaternion(new Q())).normalize();
      ["Index", "Middle", "Ring", "Pinky"].forEach((f) => {
        for (let j = 1; j <= 3; j++) {
          const bone = B[side + "Hand" + f + j];
          const next = B[side + "Hand" + f + (j + 1)];
          const dir = wpos(next).sub(wpos(bone)).normalize();
          rotateWorld(bone, new V3().crossVectors(dir, pn).normalize(), amount * (j === 1 ? 0.8 : 1));
        }
      });
      for (let j = 2; j <= 3; j++) {
        const bone = B[side + "HandThumb" + j];
        const dir = wpos(B[side + "HandThumb" + (j + 1)]).sub(wpos(bone)).normalize();
        rotateWorld(bone, new V3().crossVectors(dir, pn).normalize(), thumb);
      }
    }

    // gira a mão em torno do próprio eixo até a palma ficar virada para "want"
    function rollPalm(side, want) {
      const hand = B[side + "Hand"];
      const axis = wpos(B[side + "HandMiddle1"]).sub(wpos(hand)).normalize();
      const pn = palm[side].clone().applyQuaternion(hand.getWorldQuaternion(new Q()));
      const a = pn.clone().addScaledVector(axis, -pn.dot(axis)).normalize();
      const b = want.clone().addScaledVector(axis, -want.dot(axis)).normalize();
      rotateWorld(hand, axis, Math.atan2(new V3().crossVectors(a, b).dot(axis), a.dot(b)));
    }

    // braço direito: mão no mouse, palma para baixo
    const shR = wpos(B.RightArm);
    const mouseWrist = new V3(0.34, 0.795, -0.46);
    twoBone(B.RightArm, B.RightForeArm, B.RightHand, mouseWrist, shR.clone().add(new V3(0.6, -0.5, 0.3)));
    aim(B.RightHand, B.RightHandMiddle1, mouseWrist.clone().add(new V3(0.01, -0.015, -0.1)));
    rollPalm("Right", new V3(0, -1, 0));
    curl("Right", 0.3, 0.1);

    // braço esquerdo: cotovelo baixo, punho fechado sob o queixo
    const shL = wpos(B.LeftArm);
    const eyeMid = wpos(B.LeftEye).add(wpos(B.RightEye)).multiplyScalar(0.5);
    const chin = eyeMid.clone().add(new V3(0, -0.12, 0.0));
    const wristL = chin.clone().add(new V3(-0.02, -0.08, 0.02));
    twoBone(B.LeftArm, B.LeftForeArm, B.LeftHand, wristL, shL.clone().add(new V3(-0.4, -1, -0.5)));
    aim(B.LeftHand, B.LeftHandMiddle1, wristL.clone().add(new V3(0.02, 0.09, -0.03)));
    rollPalm("Left", new V3(0.3, 0, 1).normalize());
    curl("Left", 1.35, 0.7);

    // cabeça no lugar da câmera: acerta o corpo para o centro da cabeça cair em HEAD
    const headCenter = () => {
      const e = wpos(B.LeftEye).add(wpos(B.RightEye)).multiplyScalar(0.5);
      return e.add(new V3(0, -0.02, 0.07));
    };
    root.position.add(HEAD.clone().sub(headCenter()));
    root.updateMatrixWorld(true);

    // óculos escuros redondos, presos ao osso da cabeça
    const eL = wpos(B.LeftEye);
    const eR = wpos(B.RightEye);
    const right = eR.clone().sub(eL).normalize();
    const up = wpos(B.HeadTop_End).sub(wpos(B.Head)).normalize();
    const back = new V3().crossVectors(right, up).normalize();
    up.crossVectors(back, right).normalize();
    const glasses = new THREE.Group();
    glasses.position.copy(eL).add(eR).multiplyScalar(0.5);
    glasses.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, back));
    group.add(glasses);
    const glassFrame = std(0x0a0a0b, { roughness: 0.3, metalness: 0.8 });
    const lensMat = std(0x020203, { roughness: 0.05, metalness: 0.95 });
    mats.splice(mats.indexOf(glassFrame), 1);
    mats.splice(mats.indexOf(lensMat), 1);
    headMats.push(glassFrame, lensMat);
    const lensGeo = new THREE.SphereGeometry(0.02, 28, 18);
    const half = eL.distanceTo(eR) / 2;
    [-1, 1].forEach((s) => {
      const lens = add(lensGeo, lensMat, s * half, -0.002, -0.03, glasses);
      lens.scale.set(1.05, 1, 0.3);
      const rain = new THREE.Mesh(lensGeo, lensRain);
      rain.scale.setScalar(1.04);
      lens.add(rain);
      const rim = add(new THREE.TorusGeometry(0.021, 0.0016, 8, 32), glassFrame, s * half, -0.002, -0.03, glasses);
      rim.scale.set(1.05, 1, 1);
      limb([s * (half + 0.021), 0.0, -0.028], [s * (half + 0.03), 0.006, 0.07], 0.0016, glassFrame, glasses);
    });
    limb([-half + 0.02, 0.004, -0.032], [half - 0.02, 0.004, -0.032], 0.0016, glassFrame, glasses);
    // os óculos somem mais rápido que a cabeça, para não ficarem na frente do mergulho
    const glassEdge = EDGE_MAT.clone();
    let ge = 1;
    Object.defineProperty(glassEdge, "opacity", { get: () => ge, set: (v) => (ge = Math.pow(v, 4)) });
    headMats.push(glassEdge);
    holoify(glasses, glassEdge, 4);
    B.Head.attach(glasses);

    const cloud = avatarCloud(root);

    // pose base para a animação
    const base = {};
    ["Head", "Spine2", "RightForeArm"].forEach((n) => (base[n] = B[n].quaternion.clone()));
    const tmp = new Q();
    const axisY = new V3(0, 1, 0);
    const axisX = new V3(1, 0, 0);
    return {
      update(time) {
        // respiração
        B.Spine2.quaternion.copy(base.Spine2).multiply(tmp.setFromAxisAngle(axisX, 0.015 * Math.sin(time * 1.6)));
        // olha ora para o monitor, ora para o notebook, apoiado na mão
        const glance = smoothstep(-0.3, 0.3, Math.sin(time * 0.35));
        B.Head.quaternion
          .copy(base.Head)
          .multiply(tmp.setFromAxisAngle(axisY, -0.05 - 0.18 * glance))
          .multiply(new Q().setFromAxisAngle(axisX, 0.03 * Math.sin(time * 0.7)));
        // mão mexendo o mouse
        B.RightForeArm.quaternion.copy(base.RightForeArm).multiply(tmp.setFromAxisAngle(axisY, 0.04 * Math.sin(time * 0.9)));
        root.updateMatrixWorld(true);
        cloud.update(time);
      },
    };
  }

  // Cortina de código caindo no escuro atrás do personagem (visível na abertura)
  const wallRain = holoMaterial();
  wallRain.uniforms.uColor.value = new THREE.Color(0x16a34a);
  wallRain.uniforms.uGain.value = 0.4;
  mats.push(wallRain);
  const rainWall = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 4.2), wallRain);
  rainWall.position.set(3.33, 1.6, 0.6);
  rainWall.rotation.y = -Math.PI / 2;
  group.add(rainWall);

  // Poeira flutuando na luz do monitor
  const DUST = 140;
  const dustPos = new Float32Array(DUST * 3);
  seed = 77;
  for (let i = 0; i < DUST; i++) {
    dustPos[i * 3] = (rand() - 0.5) * 1.3;
    dustPos[i * 3 + 1] = 0.8 + rand() * 0.8;
    dustPos[i * 3 + 2] = -1.2 + rand() * 0.9;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
  const dustMat = new THREE.PointsMaterial({
    size: 0.008,
    map: GLOW,
    color: 0x93c5fd,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  mats.push(dustMat);
  group.add(new THREE.Points(dustGeo, dustMat));

  // --- Animação -----------------------------------------------------------
  let lastScreen = 0;
  let lastType = 0;
  if (reduce) term.finish();
  term.draw(true);
  topo.draw();

  function update(time, dt) {
    holoUniforms.uTime.value = time;
    HOLO_TIME.value = time;
    if (!reduce) {
      if (person) person.update(time);
      // LEDs do switch
      leds.forEach((l) => (l.visible = Math.sin(time * 9 + l.userData.phase * 3) > -0.3 || Math.random() < 0.1));
      // vapor
      steam.forEach((s) => {
        s.userData.t = (s.userData.t + dt * 0.25) % 1;
        const t = s.userData.t;
        s.position.set(-0.5 + Math.sin(t * 6 + s.id) * 0.015, 0.87 + t * 0.22, -0.78);
        s.scale.setScalar(0.03 + t * 0.07);
        s.material.opacity = Math.sin(t * Math.PI) * 0.18;
      });
      // poeira
      for (let i = 0; i < DUST; i++) {
        let y = dustPos[i * 3 + 1] + dt * 0.02 * (0.5 + (i % 5) * 0.2);
        if (y > 1.6) y = 0.8;
        dustPos[i * 3 + 1] = y;
        dustPos[i * 3] += Math.sin(time * 0.5 + i) * dt * 0.004;
      }
      dustGeo.attributes.position.needsUpdate = true;

      // digita pelo tempo decorrido, independente do FPS
      const steps = Math.min(30, Math.floor((time - lastType) / 0.035));
      if (steps > 0) {
        lastType += steps * 0.035;
        for (let i = 0; i < steps; i++) term.step();
      }
      if (time - lastScreen > 1 / 30) {
        lastScreen = time;
        term.draw(Math.floor(time * 2) % 2 === 0);
        topo.draw();
      }
    }
  }

  // --- Holograma ---------------------------------------------------------
  // o quarto some: fica só a mesa flutuando sobre uma grade, no meio da chuva de código
  const grid = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), holoGrid());
  grid.rotation.x = -Math.PI / 2;
  mats.push(grid.material);
  group.add(grid);
  // cortinas de chuva de código em volta, bem ao fundo
  [
    [0, 1.8, -4.2, 0, 12],
    [-4.4, 1.8, 0, Math.PI / 2, 10],
  ].forEach(([x, y, z, ry, w]) => {
    const m = holoMaterial();
    m.uniforms.uColor.value = new THREE.Color(0x15803d);
    m.uniforms.uGain.value = 0.28;
    mats.push(m);
    const c = new THREE.Mesh(new THREE.PlaneGeometry(w, 5), m);
    c.position.set(x, y, z);
    c.rotation.y = ry;
    group.add(c);
  });

  // troca os materiais sólidos por holograma e desenha as arestas
  function holoify(root, edgeMat = EDGE_MAT, fadePow = 1) {
    const swap = new Map();
    root.traverse((o) => {
      if (!o.isMesh || o.isSkinnedMesh || !o.material || !o.material.isMeshStandardMaterial) return;
      const old = o.material;
      if (!swap.has(old)) {
        const c = HOLO_GREEN.clone().lerp(old.color, 0.25);
        const m = holoSurface(c, 0.9, fadePow);
        (headMats.includes(old) ? headMats : mats).push(m);
        swap.set(old, m);
      }
      o.material = swap.get(old);
      o.castShadow = o.receiveShadow = false;
      const tris = o.geometry.index ? o.geometry.index.count / 3 : o.geometry.attributes.position.count / 3;
      if (tris < 6000 && o.visible) {
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry, 28), edgeMat);
        edges.userData.fadeWith = o.material;
        o.add(edges);
      }
    });
  }
  holoify(group);
  mats.push(EDGE_MAT);

  return { group, mats, headMats, update, glyphs };
}
