// Prévia 3D do universo em edição (criar.html): o mesmo estilo do mapa (cérebro, sistema solar,
// constelação, placa de circuito, átomo), com bloom e rotação automática. Reconstrói a cena a cada mudança.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { style3d, STAR_TEX } from "./estilos-3d.js";

// número pseudoaleatório estável por texto
function hashRand(str) {
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
const THEME = { a: 0x3b82f6, b: 0x67e8f9, fire: 0xd9fff0, neb: [0x050d29, 0x0d594d, 0x40145a], dust: 0x9fdcff };
const SEG = 8;

export function createPreview({ canvas, labels, tip, onPick }) {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  } catch (e) {
    return { update() {}, ok: false };
  }
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(DPR);
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const labelRenderer = new CSS2DRenderer({ element: labels });
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
  camera.position.set(0, 1.6, 10.8);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 4;
  controls.maxDistance = 24;
  controls.autoRotate = !reduce;
  controls.autoRotateSpeed = 0.8;

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.8, 0.55, 0.25);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const tex = {
    GLOW: radialTexture(128, [[0, 1], [0.2, 0.6], [0.5, 0.12], [1, 0]]),
    DOT: radialTexture(32, [[0, 1], [0.4, 0.5], [1, 0]]),
  };

  // poeira de fundo
  {
    const r = hashRand("poeira");
    const n = 600;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const d = 12 + r() * 16;
      const a = r() * Math.PI * 2;
      const z = r() * 2 - 1;
      const s = Math.sqrt(1 - z * z);
      pos.set([Math.cos(a) * s * d, z * d, Math.sin(a) * s * d], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0x3b5b7a, size: 0.05, sizeAttenuation: true })));
  }

  const sphere = new THREE.SphereGeometry(1, 18, 14);
  const mats = new Map();
  const mat = (color) => {
    if (!mats.has(color)) mats.set(color, new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.6) }));
    return mats.get(color);
  };
  let group = null;
  let deco = null;
  let style = null;
  let nodes = [];
  let edges = [];
  let lineGeo = null;
  let pickables = [];
  let lastStyle = null;

  function clear() {
    if (!group) return;
    if (deco) deco.dispose();
    deco = null;
    group.traverse((o) => {
      if (o.isLineSegments && o.geometry === lineGeo) {
        o.geometry.dispose();
        o.material.dispose();
      }
      if (o.isSprite) o.material.dispose();
      if (o.isCSS2DObject) o.element.remove();
    });
    scene.remove(group);
    group = null;
  }

  function writeLines() {
    const pos = lineGeo.attributes.position.array;
    edges.forEach((e, i) => {
      e.curve = style.curve(e);
      const pts = e.curve.getPoints(SEG);
      for (let s = 0; s < SEG; s++) {
        const a = pts[s];
        const b = pts[s + 1] || a;
        pos.set([a.x, a.y, a.z, b.x, b.y, b.z], (i * SEG + s) * 6);
      }
    });
    lineGeo.attributes.position.needsUpdate = true;
  }
  function place() {
    nodes.forEach((n) => {
      n.mesh.position.copy(n.pos);
      if (n.glow) n.glow.position.copy(n.pos);
      if (n.tag) n.tag.position.copy(n.pos);
    });
  }

  function update(P) {
    clear();
    style = style3d(P.style);
    group = new THREE.Group();
    pickables = [];
    nodes = [];
    edges = [];
    const node = (o) => {
      Object.assign(o, { pos: new THREE.Vector3(), links: [], vis: 1, hot: false, order: 0.5, r: style.radii[o.kind] });
      nodes.push(o);
      return o;
    };
    const edge = (a, b, kind) => {
      const e = { a, b, kind, i: edges.length };
      edges.push(e);
      a.links.push({ other: b, e });
      b.links.push({ other: a, e });
    };
    const core = node({ id: "__core", kind: "core", color: "#e0f2fe", label: P.name || "Meu universo" });
    const hubs = new Map();
    P.categories.forEach((c) => {
      const h = node({ id: "__hub_" + c.id, kind: "hub", color: c.color, cat: c, label: c.label });
      hubs.set(c.id, h);
      edge(core, h, "core");
    });
    const byId = new Map();
    P.nodes.forEach((n) => {
      const h = hubs.get(n.category);
      if (!h) return;
      const l = node({ id: n.id, kind: "leaf", color: h.color, cat: h.cat, data: n, label: n.label });
      byId.set(n.id, l);
      edge(h, l, "tree");
    });
    P.links.forEach((l) => {
      const a = byId.get(l.from);
      const b = byId.get(l.to);
      if (a && b) edge(a, b, "link");
    });
    style.layout(nodes);

    // esferas (com brilho em estrela na constelação), rótulos do núcleo e das regiões
    const star = style.glow === "star" ? STAR_TEX() : null;
    nodes.forEach((n) => {
      const m = new THREE.Mesh(sphere, mat(n.color));
      m.scale.setScalar(n.kind === "leaf" ? n.r * 0.95 : n.r);
      m.visible = !(style.hideMesh && style.hideMesh(n));
      n.mesh = m;
      group.add(m);
      if (star) {
        n.glow = new THREE.Sprite(
          new THREE.SpriteMaterial({ map: star, color: new THREE.Color(n.color), transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending })
        );
        n.glow.scale.setScalar(n.r * 9);
        group.add(n.glow);
      }
      if (n.kind === "leaf") {
        m.userData = { node: n.data, color: n.color };
        pickables.push(m);
        return;
      }
      const el = document.createElement("div");
      el.className = n.kind === "core" ? "pv-core" : "pv-hub";
      if (n.kind === "hub") el.style.color = n.color;
      el.innerHTML = "<span></span>";
      el.firstChild.textContent = n.label;
      n.tag = new CSS2DObject(el);
      group.add(n.tag);
    });
    place();

    // linhas das conexões, no desenho do estilo
    const col = [];
    const white = new THREE.Color("#cbd5e1").multiplyScalar(0.6);
    const linkC = new THREE.Color("#94a3b8").multiplyScalar(0.55);
    edges.forEach((e) => {
      const k = Math.min(1.3, style.edgeAlpha[e.kind]);
      const c = (e.kind === "core" ? white : e.kind === "link" ? linkC : new THREE.Color(e.b.color).multiplyScalar(0.6)).clone().multiplyScalar(k);
      for (let s = 0; s < SEG * 2; s++) col.push(c.r, c.g, c.b);
    });
    lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(edges.length * SEG * 6), 3));
    lineGeo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    const lines = new THREE.LineSegments(
      lineGeo,
      new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    lines.frustumCulled = false;
    group.add(lines);
    writeLines();

    deco = style.build({ nodes, edges, tex });
    deco.setTheme(THEME);
    group.add(deco.group);
    scene.add(group);

    // ao trocar de estilo, a câmera volta para o ângulo e a distância daquele estilo
    if (lastStyle !== style.id) {
      lastStyle = style.id;
      const d = style.fit * 2.25;
      const el = Math.max(0.2, style.view.el);
      camera.position.set(Math.sin(0.35) * Math.cos(el) * d, Math.sin(el) * d, Math.cos(0.35) * Math.cos(el) * d);
      controls.target.set(0, 0, 0);
      controls.autoRotate = !reduce && style.spin !== "rock";
    }
  }

  // tamanho
  let pxScale = 200;
  function resize() {
    const w = canvas.clientWidth || 400;
    const h = canvas.clientHeight || 400;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    labelRenderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    pxScale = (h * DPR) / 2;
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  // passar o mouse mostra o nome; clicar leva ao campo no editor
  const ray = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  let hover = null;
  let downAt = null;
  function pick(e) {
    const r = canvas.getBoundingClientRect();
    mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(mouse, camera);
    const hit = ray.intersectObjects(pickables, false)[0];
    return hit ? { obj: hit.object, x: e.clientX - r.left, y: e.clientY - r.top } : null;
  }
  canvas.addEventListener("pointermove", (e) => {
    const h = pick(e);
    hover = h && h.obj;
    if (h) {
      tip.hidden = false;
      tip.textContent = h.obj.userData.node.label;
      tip.style.left = `${h.x}px`;
      tip.style.top = `${h.y}px`;
      tip.style.setProperty("--c", h.obj.userData.color);
      canvas.style.cursor = "pointer";
    } else {
      tip.hidden = true;
      canvas.style.cursor = "";
    }
  });
  canvas.addEventListener("pointerleave", () => {
    tip.hidden = true;
    hover = null;
  });
  canvas.addEventListener("pointerdown", (e) => (downAt = [e.clientX, e.clientY]));
  canvas.addEventListener("pointerup", (e) => {
    if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
    const h = pick(e);
    if (h && onPick) onPick(h.obj.userData.node);
  });

  const clock = new THREE.Clock();
  let visible = true;
  let orbitT = 0;
  new IntersectionObserver((en) => (visible = en[0].isIntersecting)).observe(canvas);
  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05);
    if (!visible || document.hidden) return;
    const t = clock.elapsedTime;
    controls.autoRotate = !reduce && !hover && !!style && style.spin !== "rock";
    controls.update();
    if (group && style) {
      if (style.dynamic && !reduce) {
        orbitT += dt * (hover ? 0 : 1);
        style.animate(nodes, orbitT);
        place();
        writeLines();
      }
      nodes.forEach((n, i) => {
        if (n.kind === "leaf") n.mesh.scale.setScalar(n.r * (1 + 0.12 * Math.sin(t * 2 + i) + (n.mesh === hover ? 0.6 : 0)));
      });
      deco.update({ time: t, dt, p: 1, appear: 1, scale: 1, pxScale });
    }
    composer.render();
    labelRenderer.render(scene, camera);
  }
  frame();
  return { update, ok: true };
}
