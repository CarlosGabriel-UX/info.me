// Cena de abertura: o quarto, a mesa e o personagem (visual de Matrix) sentado no computador.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";

RectAreaLightUniformsLib.init();

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

// Janela com a cidade à noite
function makeCity() {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 640;
  const g = c.getContext("2d");
  const sky = g.createLinearGradient(0, 0, 0, 640);
  sky.addColorStop(0, "#020617");
  sky.addColorStop(0.6, "#0b1b3a");
  sky.addColorStop(1, "#1e2a5a");
  g.fillStyle = sky;
  g.fillRect(0, 0, 1024, 640);
  seed = 5;
  for (let i = 0; i < 90; i++) {
    g.fillStyle = `rgba(255,255,255,${0.2 + rand() * 0.5})`;
    g.fillRect(rand() * 1024, rand() * 260, 2, 2);
  }
  // lua
  g.fillStyle = "rgba(226,232,240,0.85)";
  g.beginPath();
  g.arc(820, 110, 34, 0, Math.PI * 2);
  g.fill();
  // prédios em duas camadas
  for (const layer of [0, 1]) {
    let x = -20;
    while (x < 1040) {
      const w = 50 + rand() * 90;
      const h = (layer ? 180 : 260) + rand() * (layer ? 180 : 220);
      const top = 640 - h;
      g.fillStyle = layer ? "#060a14" : "#0a1224";
      g.fillRect(x, top, w, h);
      for (let wy = top + 12; wy < 630; wy += 18) {
        for (let wx = x + 8; wx < x + w - 10; wx += 14) {
          if (rand() < (layer ? 0.28 : 0.18)) {
            g.fillStyle = rand() < 0.75 ? "rgba(253,224,71,0.8)" : "rgba(125,211,252,0.8)";
            g.fillRect(wx, wy, 6, 8);
          }
        }
      }
      x += w + 6;
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
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

// Tampo de madeira escura (veios desenhados em canvas)
function makeWood() {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 256;
  const g = c.getContext("2d");
  g.fillStyle = "#3b2618";
  g.fillRect(0, 0, c.width, c.height);
  seed = 5;
  for (let i = 0; i < 90; i++) {
    const y0 = rand() * c.height;
    const amp = 2 + rand() * 6;
    const f = 0.004 + rand() * 0.01;
    g.strokeStyle = rand() < 0.5 ? `rgba(20,10,4,${0.25 + rand() * 0.35})` : `rgba(120,78,46,${0.12 + rand() * 0.2})`;
    g.lineWidth = 0.6 + rand() * 2.2;
    g.beginPath();
    for (let x = 0; x <= c.width; x += 8) {
      const y = y0 + Math.sin(x * f + i) * amp + Math.sin(x * f * 3.1) * amp * 0.3;
      x === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
    }
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// ---------------------------------------------------------------------------
// Montagem
// ---------------------------------------------------------------------------
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

  // --- Quarto -------------------------------------------------------------
  const floor = add(new THREE.PlaneGeometry(14, 14), std(0x0a0c11, { roughness: 0.7, metalness: 0.2 }));
  floor.rotation.x = -Math.PI / 2;
  const rug = add(new THREE.CircleGeometry(1.35, 64), std(0x111726, { roughness: 1 }), 0, 0.003, -0.2);
  rug.rotation.x = -Math.PI / 2;

  const wallMat = std(0x0c0f16, { roughness: 0.95 });
  add(new THREE.PlaneGeometry(14, 5), wallMat, 0, 2.5, -1.75);
  const sideWall = add(new THREE.PlaneGeometry(8, 5), wallMat, -2.6, 2.5, 1);
  sideWall.rotation.y = Math.PI / 2;

  // Janela com a cidade
  const win = add(new THREE.PlaneGeometry(1.5, 0.95), basic(0xffffff, { map: makeCity(), opacity: 1 }), -1.35, 1.55, -1.74);
  const frameMat = std(0x15181f);
  [
    [1.58, 0.05, 0, 0.5],
    [1.58, 0.05, 0, -0.5],
    [0.05, 1.05, -0.77, 0],
    [0.05, 1.05, 0.77, 0],
    [0.03, 0.95, 0, 0],
    [1.5, 0.03, 0, 0.05],
  ].forEach(([w, h, x, y]) => add(new THREE.BoxGeometry(w, h, 0.05), frameMat, win.position.x + x, win.position.y + y, -1.72));
  add(new THREE.BoxGeometry(1.7, 0.04, 0.16), frameMat, win.position.x, win.position.y - 0.53, -1.67);
  const moonLight = new THREE.RectAreaLight(0x6d83c9, 0.55, 1.5, 0.95);
  moonLight.position.set(win.position.x, win.position.y, -1.7);
  moonLight.lookAt(win.position.x, win.position.y - 0.4, 0);
  group.add(moonLight);

  // Prateleira com livros e um cacto
  const shelfMat = std(0x171a21);
  add(rbox(0.9, 0.03, 0.22, 0.008), shelfMat, 1.35, 1.62, -1.63);
  add(rbox(0.9, 0.03, 0.22, 0.008), shelfMat, 1.35, 1.95, -1.63);
  seed = 11;
  const bookCols = [0x1e3a8a, 0x7c2d12, 0x14532d, 0x3b0764, 0x1f2937, 0x0c4a6e];
  let bx = 0.98;
  for (let i = 0; i < 9; i++) {
    const w = 0.035 + rand() * 0.03;
    const h = 0.18 + rand() * 0.08;
    const b = add(rbox(w, h, 0.15, 0.004), std(bookCols[i % bookCols.length]), bx + w / 2, 1.635 + h / 2, -1.63);
    if (i === 8) b.rotation.z = 0.3;
    bx += w + 0.006;
  }
  add(new THREE.CylinderGeometry(0.05, 0.04, 0.08, 20), std(0x3f3f46), 1.6, 2.005, -1.62);
  add(new THREE.CapsuleGeometry(0.03, 0.08, 6, 10), std(0x166534), 1.6, 2.1, -1.62);

  // --- Mesa ---------------------------------------------------------------
  // tampo de madeira escura com pés de metal preto
  const deskMat = std(0xffffff, { map: makeWood(), roughness: 0.55, metalness: 0.05 });
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
  const ledSpill = new THREE.RectAreaLight(0x22d3ee, 2.2, 1.9, 0.05);
  ledSpill.position.set(0, 0.71, -0.54);
  ledSpill.lookAt(0, 0, -0.3);
  group.add(ledSpill);

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
  const monLight = new THREE.RectAreaLight(0x5b8cff, 9, 0.78, 0.44);
  monLight.position.set(0, MON.y, MON.z + 0.02);
  monLight.lookAt(0, MON.y - 0.1, 1);
  group.add(monLight);
  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: GLOW, color: 0x4f46e5, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  mats.push(halo.material);
  halo.scale.set(3.6, 1.8, 1);
  halo.position.set(0, MON.y, -1.7);
  group.add(halo);

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
  const sideLight = new THREE.RectAreaLight(0x22d3ee, 3, 0.43, 0.26);
  sideLight.position.set(0, 0.15, 0.01);
  sideLight.lookAt(0, 0.15, 1);
  lid.add(sideLight);

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
      uniforms: { ...holoUniforms, uColor: { value: HOLO }, uOpacity: { value: 1 } },
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
          float a = (rain + 0.04 + 0.32 * f) * uOpacity;
          gl_FragColor = vec4((col * rain + uColor * (0.04 + 0.32 * f)) * uOpacity, a);
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
  const look = { model: "assets/models/avatar.glb", outfit: "#1c1d22", ...avatar };
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
  new GLTFLoader().load(look.model, (gltf) => (person = setupPerson(gltf.scene)), undefined, (e) => console.warn("avatar:", e));

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
      const m = o.material;
      m.transparent = true;
      if (/Outfit/.test(o.name)) {
        m.color.set(look.outfit);
        m.roughness = Math.min(m.roughness ?? 1, 0.6);
      }
      // cabeça e pele (mãos e pescoço) somem junto com a cabeça quando a câmera entra
      (/Head|Eye|Teeth|Body/.test(o.name) ? headMats : mats).push(m);
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
    B.Head.attach(glasses);

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
      },
    };
  }

  // --- Luz geral ----------------------------------------------------------
  // luz suave no rosto, como o reflexo branco da tela
  const faceLight = new THREE.PointLight(0xdfe6ff, 1.1, 1.6, 1.4);
  faceLight.position.set(-0.35, 1.38, -0.55);
  group.add(faceLight);
  group.add(new THREE.AmbientLight(0x1a2744, 0.7));
  // luzes de contorno vindas das telas (desenham a silhueta do personagem)
  const rim = new THREE.DirectionalLight(0x4ade80, 2.6);
  rim.position.set(1.4, 2.0, -1.6);
  group.add(rim);
  const rim2 = new THREE.DirectionalLight(0x818cf8, 1.6);
  rim2.position.set(-1.6, 1.8, -1.4);
  group.add(rim2);
  // luz suave por trás da câmera para as costas não ficarem pretas
  const fill = new THREE.PointLight(0x6d7fd6, 1.6, 4, 1.5);
  fill.position.set(0.6, 1.7, 1.6);
  group.add(fill);
  // luz suave de destaque no personagem, vinda de trás/direita
  const key = new THREE.SpotLight(0xc7d2fe, 7, 5, 0.5, 1, 1.5);
  key.position.set(1.3, 2.1, 1.5);
  key.target.position.copy(HEAD).add(new THREE.Vector3(0, -0.25, 0));
  group.add(key, key.target);
  // "ambilight" atrás dos monitores lavando a parede
  const wash = new THREE.RectAreaLight(0x6366f1, 5, 1.6, 0.25);
  wash.position.set(0, 1.25, -1.45);
  wash.lookAt(0, 1.6, -1.75);
  group.add(wash);

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

  return { group, mats, headMats, update };
}
