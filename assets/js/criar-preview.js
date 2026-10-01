// Prévia 3D leve do universo em edição (criar.html): núcleo, regiões, neurônios e sinapses,
// com bloom e rotação automática. Reconstrói a cena a cada mudança do perfil.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

// número pseudoaleatório estável por texto (o neurônio não "pula" de lugar a cada edição)
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

export function createPreview({ canvas, labels, tip, onPick }) {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  } catch (e) {
    return { update() {}, ok: false };
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const labelRenderer = new CSS2DRenderer({ element: labels });
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0, 1.6, 10.8);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 4;
  controls.maxDistance = 16;
  controls.autoRotate = !reduce;
  controls.autoRotateSpeed = 0.8;

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.9, 0.55, 0.2);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // poeira de fundo
  {
    const r = hashRand("poeira");
    const n = 600;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const d = 9 + r() * 14;
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
  let group = null;
  let pickables = [];
  const mats = new Map();
  const mat = (color) => {
    if (!mats.has(color)) mats.set(color, new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.6) }));
    return mats.get(color);
  };

  function clear() {
    if (!group) return;
    group.traverse((o) => {
      if (o.isLineSegments) {
        o.geometry.dispose();
        o.material.dispose();
      }
      if (o.isCSS2DObject) o.element.remove();
    });
    scene.remove(group);
    group = null;
  }

  function update(P) {
    clear();
    group = new THREE.Group();
    pickables = [];
    const cats = Object.fromEntries(P.categories.map((c) => [c.id, c]));
    const pos = new Map();
    const core = new THREE.Vector3(0, 0.2, 0);
    pos.set("__core", core);
    const coreMesh = new THREE.Mesh(sphere, mat("#e0f2fe"));
    coreMesh.scale.setScalar(0.22);
    coreMesh.position.copy(core);
    group.add(coreMesh);
    const cl = document.createElement("div");
    cl.className = "pv-core";
    cl.innerHTML = "<span></span>";
    cl.firstChild.textContent = P.name || "Meu universo";
    const clo = new CSS2DObject(cl);
    clo.position.copy(core);
    group.add(clo);

    const hubs = new Map();
    P.categories.forEach((c) => {
      const p = new THREE.Vector3(...c.pos).multiplyScalar(1.15);
      hubs.set(c.id, p);
      const m = new THREE.Mesh(sphere, mat(c.color));
      m.scale.setScalar(0.14);
      m.position.copy(p);
      group.add(m);
      const el = document.createElement("div");
      el.className = "pv-hub";
      el.style.color = c.color;
      el.innerHTML = "<span></span>";
      el.firstChild.textContent = c.label;
      const o = new CSS2DObject(el);
      o.position.copy(p);
      group.add(o);
    });

    // neurônios em volta da região, com um relaxamento simples para não sobrepor
    const leaves = [];
    P.nodes.forEach((n) => {
      const hub = hubs.get(n.category);
      if (!hub) return;
      const r = hashRand(n.id);
      const z = r() * 2 - 1;
      const a = r() * Math.PI * 2;
      const s = Math.sqrt(1 - z * z);
      const p = hub.clone().add(new THREE.Vector3(Math.cos(a) * s, z, Math.sin(a) * s).multiplyScalar(0.6 + r() * 0.55));
      leaves.push({ n, p, hub });
    });
    const tmp = new THREE.Vector3();
    for (let it = 0; it < 40; it++) {
      for (const a of leaves) {
        const f = new THREE.Vector3();
        for (const b of leaves) {
          if (a === b) continue;
          tmp.copy(a.p).sub(b.p);
          const d = tmp.length() || 0.01;
          if (d < 0.75) f.add(tmp.multiplyScalar((0.75 - d) / d * 0.3));
        }
        tmp.copy(a.hub).sub(a.p);
        const dh = tmp.length();
        if (dh > 1.3) f.add(tmp.multiplyScalar(0.05));
        a.p.add(f);
      }
    }
    leaves.forEach(({ n, p }) => {
      pos.set(n.id, p);
      const c = cats[n.category];
      const m = new THREE.Mesh(sphere, mat(c.color));
      m.scale.setScalar(0.075);
      m.position.copy(p);
      m.userData = { node: n, color: c.color };
      group.add(m);
      pickables.push(m);
    });

    // linhas: núcleo-região, região-neurônio e as conexões extras
    const seg = [];
    const col = [];
    const push = (a, b, ca, cb) => {
      seg.push(a.x, a.y, a.z, b.x, b.y, b.z);
      col.push(ca.r, ca.g, ca.b, cb.r, cb.g, cb.b);
    };
    const white = new THREE.Color("#cbd5e1").multiplyScalar(0.6);
    P.categories.forEach((c) => push(core, hubs.get(c.id), white, new THREE.Color(c.color).multiplyScalar(0.7)));
    leaves.forEach(({ n, p, hub }) => {
      const cc = new THREE.Color(cats[n.category].color).multiplyScalar(0.55);
      push(hub, p, cc, cc);
    });
    const linkC = new THREE.Color("#94a3b8").multiplyScalar(0.55);
    P.links.forEach((l) => {
      const a = pos.get(l.from);
      const b = pos.get(l.to);
      if (!a || !b) return;
      // curva leve, em 6 segmentos
      const mid = a.clone().add(b).multiplyScalar(0.5);
      const ctrl = mid.clone().add(mid.clone().multiplyScalar(0.2));
      const pts = new THREE.QuadraticBezierCurve3(a, ctrl, b).getPoints(6);
      for (let i = 0; i < pts.length - 1; i++) push(pts[i], pts[i + 1], linkC, linkC);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(seg, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    group.add(
      new THREE.LineSegments(
        g,
        new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false })
      )
    );
    scene.add(group);
  }

  // tamanho
  function resize() {
    const w = canvas.clientWidth || 400;
    const h = canvas.clientHeight || 400;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    labelRenderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
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
  new IntersectionObserver((en) => (visible = en[0].isIntersecting)).observe(canvas);
  function frame() {
    requestAnimationFrame(frame);
    if (!visible || document.hidden) return;
    const t = clock.getElapsedTime();
    controls.autoRotate = !reduce && !hover;
    controls.update();
    if (group) {
      group.children.forEach((o, i) => {
        if (o.isMesh && o.userData.node) o.scale.setScalar(0.075 * (1 + 0.12 * Math.sin(t * 2 + i) + (o === hover ? 0.6 : 0)));
      });
    }
    composer.render();
    labelRenderer.render(scene, camera);
  }
  frame();
  return { update, ok: true };
}
