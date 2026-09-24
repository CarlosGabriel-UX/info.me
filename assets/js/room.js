// Cena de abertura: o quarto, a mesa e o personagem sentado no computador (visto de costas).
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";

RectAreaLightUniformsLib.init();

// Centro da cabeça: é daqui que a câmera "entra" no cérebro.
export const HEAD = new THREE.Vector3(0, 1.235, 0.13);

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
  const deskMat = std(0x16181f, { roughness: 0.5, metalness: 0.2 });
  const metal = std(0x0e0f13, { roughness: 0.4, metalness: 0.7 });
  add(rbox(2.0, 0.04, 0.85, 0.012), deskMat, 0, 0.74, -0.95);
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

  // Monitor lateral com a topologia de rede
  const topo = makeTopology();
  const side = new THREE.Group();
  side.position.set(0.72, 1.07, -1.08);
  side.rotation.y = -0.55;
  group.add(side);
  add(rbox(0.56, 0.35, 0.025, 0.006), std(0x07080b, { roughness: 0.4 }), 0, 0, -0.014, side);
  add(new THREE.PlaneGeometry(0.53, 0.32), basic(0xffffff, { map: topo.tex }), 0, 0, 0.0, side);
  add(new THREE.BoxGeometry(0.04, 0.25, 0.04), metal, 0, -0.2, -0.04, side);
  add(rbox(0.22, 0.012, 0.16, 0.005), metal, 0, -0.32, -0.03, side);
  const sideLight = new THREE.RectAreaLight(0x22d3ee, 3, 0.53, 0.32);
  sideLight.position.set(0, 0, 0.01);
  sideLight.lookAt(0, 0, 1);
  side.add(sideLight);

  // Teclado, mouse e mousepad
  const keysTex = makeKeys();
  add(rbox(0.44, 0.018, 0.14, 0.006), std(0x0b0c10, { emissive: 0xffffff, emissiveMap: keysTex, emissiveIntensity: 0.9, roughness: 0.6 }), 0, 0.768, -0.66);
  const pad = add(new THREE.PlaneGeometry(0.3, 0.25), std(0x0a0b10, { roughness: 1 }), 0.36, 0.7615, -0.66);
  pad.rotation.x = -Math.PI / 2;
  const mouse = add(new THREE.CapsuleGeometry(0.022, 0.03, 6, 12), std(0x111217, { roughness: 0.4 }), 0.36, 0.775, -0.64);
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
  const chairMat = std(0x0f1116, { roughness: 0.7 });
  const accent = basic(0x0ea5e9, { opacity: 0.45 });
  add(rbox(0.52, 0.08, 0.5, 0.03), chairMat, 0, 0.46, 0.22);
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

  // --- Personagem no estilo avatar do Xbox --------------------------------
  // Cabeça grande, rosto expressivo, formas arredondadas. Cores vêm de PROFILE.avatar.
  const A = {
    skin: "#c68b63",
    hair: "#2b1b12",
    eyes: "#4a2c17",
    hoodie: "#1d4ed8",
    pants: "#1f2937",
    shoes: "#f1f5f9",
    ...avatar,
  };
  const hoodie = std(A.hoodie, { roughness: 0.85 });
  const skin = std(A.skin, { roughness: 0.55 });
  const pants = std(A.pants, { roughness: 0.9 });
  const shoeMat = std(A.shoes, { roughness: 0.6 });

  const body = new THREE.Group();
  group.add(body);
  // tronco levemente inclinado para frente, pivô na cintura
  const torsoPivot = new THREE.Group();
  torsoPivot.position.set(0, 0.52, 0.2);
  torsoPivot.rotation.x = -0.1;
  body.add(torsoPivot);
  const profile = [
    [0.0, 0.0],
    [0.16, 0.0],
    [0.175, 0.1],
    [0.19, 0.26],
    [0.2, 0.36],
    [0.185, 0.44],
    [0.12, 0.49],
    [0.05, 0.51],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const torso = add(new THREE.LatheGeometry(profile, 40), hoodie, 0, 0, 0, torsoPivot);
  torso.scale.set(1.25, 1, 0.82);
  // capuz dobrado sobre as costas e gola em volta do pescoço
  const hood = add(new THREE.SphereGeometry(1, 32, 20), hoodie, 0, 0.41, 0.12, torsoPivot);
  hood.scale.set(0.15, 0.1, 0.07);
  hood.rotation.x = 0.35;
  const collar = add(new THREE.TorusGeometry(0.068, 0.026, 12, 32), hoodie, 0, 0.5, 0.0, torsoPivot);
  collar.rotation.x = Math.PI / 2 + 0.1;
  [-1, 1].forEach((s) => add(new THREE.SphereGeometry(0.078, 20, 16), hoodie, s * 0.18, 0.43, 0, torsoPivot));
  const neckMat = std(A.skin, { roughness: 0.55 });
  limb([0, 1.0, 0.14], [0, 1.1, 0.13], 0.05, neckMat);

  // braços com mãos de dedos arredondados
  const arms = [-1, 1].map((s) => {
    const g = new THREE.Group();
    body.add(g);
    limb([s * 0.2, 0.93, 0.15], [s * 0.26, 0.76, -0.04], 0.062, hoodie, g);
    limb([s * 0.26, 0.76, -0.04], [s * 0.14, 0.785, -0.44], 0.054, hoodie, g);
    const cuff = add(new THREE.TorusGeometry(0.047, 0.012, 8, 20), hoodie, s * 0.145, 0.785, -0.45, g);
    cuff.lookAt(s * 0.26, 0.76, -0.04);
    const hand = new THREE.Group();
    hand.position.set(s * 0.12, 0.785, -0.52);
    hand.rotation.y = s * -0.15;
    g.add(hand);
    const palm = add(new THREE.SphereGeometry(0.04, 18, 14), skin, 0, 0, 0, hand);
    palm.scale.set(1, 0.55, 1.15);
    for (let f = 0; f < 4; f++) {
      const fx = (f - 1.5) * 0.019;
      const finger = limb([fx, 0, -0.035], [fx, -0.012, -0.066 + Math.abs(f - 1.5) * 0.006], 0.0105, skin, hand);
      finger.userData.base = finger.position.y;
    }
    limb([s * -0.038, 0, 0.0], [s * -0.052, -0.004, -0.03], 0.012, skin, hand);
    return { g, s };
  });

  // pernas e tênis
  [-1, 1].forEach((s) => {
    limb([s * 0.1, 0.53, 0.22], [s * 0.12, 0.53, -0.18], 0.072, pants);
    limb([s * 0.12, 0.53, -0.18], [s * 0.13, 0.12, -0.22], 0.058, pants);
    const shoe = add(rbox(0.11, 0.07, 0.2, 0.03), shoeMat, s * 0.13, 0.045, -0.27);
    shoe.rotation.y = s * 0.08;
    add(rbox(0.115, 0.018, 0.205, 0.008), std(A.hoodie), s * 0.13, 0.012, -0.27);
  });

  // cabeça
  const headGroup = new THREE.Group();
  headGroup.position.copy(HEAD);
  body.add(headGroup);
  const headMat = std(A.skin, { roughness: 0.55 });
  const hairMat = std(A.hair, { roughness: 0.55, metalness: 0.05 });
  const eyeWhite = std(0xf8fafc, { roughness: 0.25 });
  const irisMat = std(A.eyes, { roughness: 0.3 });
  const pupilMat = std(0x050505, { roughness: 0.2 });
  const lipMat = std(0x8a4a3a, { roughness: 0.6 });
  const phMat = std(0x111318, { roughness: 0.35, metalness: 0.6 });
  const phLed = basic(0x22d3ee);
  const shine = basic(0xffffff);
  headMats.push(headMat, hairMat, eyeWhite, irisMat, pupilMat, lipMat, phMat, phLed, shine, neckMat);

  const HR = 0.155;
  const skull = add(new THREE.SphereGeometry(HR, 48, 36), headMat, 0, 0, 0, headGroup);
  skull.scale.set(1, 1.04, 0.97);
  // queixo e bochechas mais cheias
  const jaw = add(new THREE.SphereGeometry(0.11, 32, 24), headMat, 0, -0.06, -0.035, headGroup);
  jaw.scale.set(1.05, 0.8, 0.95);
  // orelhas
  [-1, 1].forEach((s) => {
    const ear = add(new THREE.SphereGeometry(0.036, 16, 12), headMat, s * 0.152, -0.01, 0.012, headGroup);
    ear.scale.set(0.42, 1, 0.78);
  });
  // olhos grandes (piscam de vez em quando)
  const eyes = [];
  [-1, 1].forEach((s) => {
    const eye = new THREE.Group();
    eye.position.set(s * 0.053, 0.005, -0.128);
    eye.rotation.y = s * 0.28;
    headGroup.add(eye);
    const white = add(new THREE.SphereGeometry(0.031, 20, 16), eyeWhite, 0, 0, 0, eye);
    white.scale.set(1, 1.18, 0.55);
    const iris = add(new THREE.SphereGeometry(0.021, 20, 16), irisMat, 0, -0.002, -0.012, eye);
    iris.scale.set(1, 1.1, 0.5);
    const pupil = add(new THREE.SphereGeometry(0.011, 14, 10), pupilMat, 0, -0.002, -0.019, eye);
    pupil.scale.set(1, 1.1, 0.4);
    add(new THREE.SphereGeometry(0.0045, 8, 6), shine, 0.007, 0.008, -0.022, eye);
    eyes.push(eye);
    // sobrancelha
    const brow = limb([s * 0.03, 0.052, -0.141], [s * 0.075, 0.048, -0.128], 0.0065, hairMat, headGroup);
    brow.userData.s = s;
  });
  // nariz e boca
  const nose = add(new THREE.SphereGeometry(0.019, 16, 12), headMat, 0, -0.03, -0.158, headGroup);
  nose.scale.set(0.9, 0.95, 1.1);
  const mouth = add(new THREE.TorusGeometry(0.024, 0.0045, 8, 20, Math.PI * 0.75), lipMat, 0, -0.058, -0.147, headGroup);
  mouth.rotation.z = Math.PI + Math.PI * 0.125;
  mouth.rotation.x = -0.25;

  // cabelo: calota + mechas esculpidas
  const capGeo = new THREE.SphereGeometry(HR + 0.01, 64, 40, 0, Math.PI * 2, 0, Math.PI * 0.6);
  const cap = add(capGeo, hairMat, 0, 0.006, 0.008, headGroup);
  cap.scale.set(1.01, 1.05, 1.0);
  cap.rotation.x = 0.42;
  seed = 17;
  const tuft = new THREE.SphereGeometry(1, 16, 12);
  const up = new THREE.Vector3(0, 1, 0);
  const addTuft = (theta, phi, sx, sy, sz, lift = 0) => {
    const dir = new THREE.Vector3(Math.sin(phi) * Math.sin(theta), Math.cos(phi), Math.sin(phi) * Math.cos(theta));
    const m = new THREE.Mesh(tuft, hairMat);
    m.position.copy(dir).multiplyScalar(HR * 1.02 + lift);
    m.quaternion.setFromUnitVectors(up, dir);
    m.scale.set(sx, sy, sz);
    headGroup.add(m);
  };
  // topete e franja na frente (theta = PI aponta para -z, o rosto)
  for (let i = 0; i < 7; i++) addTuft(Math.PI + (i - 3) * 0.24, 0.62 + (i % 2) * 0.07, 0.034, 0.024, 0.055, 0.006);
  addTuft(Math.PI, 0.35, 0.06, 0.035, 0.07, 0.01);
  addTuft(Math.PI + 0.5, 0.42, 0.045, 0.028, 0.06, 0.008);
  addTuft(Math.PI - 0.5, 0.42, 0.045, 0.028, 0.06, 0.008);

  // fone de ouvido
  const band = add(new THREE.TorusGeometry(HR + 0.02, 0.012, 10, 40, Math.PI), phMat, 0, 0.005, 0.005, headGroup);
  band.scale.set(1, 1.08, 1);
  [-1, 1].forEach((s) => {
    const cup = add(new THREE.CylinderGeometry(0.058, 0.058, 0.04, 32), phMat, s * 0.163, -0.012, 0.012, headGroup);
    cup.rotation.z = Math.PI / 2;
    const pad = add(new THREE.TorusGeometry(0.045, 0.012, 10, 28), phMat, s * 0.143, -0.012, 0.012, headGroup);
    pad.rotation.y = Math.PI / 2;
    const ring = add(new THREE.TorusGeometry(0.04, 0.0035, 8, 32), phLed, s * 0.184, -0.012, 0.012, headGroup);
    ring.rotation.y = Math.PI / 2;
  });

  // --- Luz geral ----------------------------------------------------------
  group.add(new THREE.AmbientLight(0x1a2744, 0.7));
  // luzes de contorno vindas das telas (desenham a silhueta do personagem)
  const rim = new THREE.DirectionalLight(0x7dd3fc, 2.4);
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
    if (!reduce) {
      // respiração e pequenos movimentos de cabeça
      torsoPivot.scale.y = 1 + 0.012 * Math.sin(time * 1.6);
      // olha ora para o monitor principal, ora para o lateral
      const glance = smoothstep(-0.3, 0.3, Math.sin(time * 0.35));
      headGroup.rotation.set(-0.12 + 0.02 * Math.sin(time * 0.7), -0.1 - 0.55 * glance, 0.02 * Math.sin(time * 0.5));
      // piscar
      const blink = time % 4.2 < 0.12 ? 0.1 : 1;
      eyes.forEach((e) => (e.scale.y = blink));
      // digitação
      arms.forEach(({ g, s }, i) => {
        const tap = Math.max(0, Math.sin(time * 14 + i * 1.7 + Math.sin(time * 3.1) * 2));
        g.position.y = 0.006 * tap;
        g.position.x = s * 0.004 * Math.sin(time * 1.3 + i);
      });
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
