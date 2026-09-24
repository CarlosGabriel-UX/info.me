(function () {
  "use strict";

  const P = window.PROFILE;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, v) => {
    const t = clamp((v - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };

  // Mesmo contorno usado no SVG (#brainShape). Caixa aproximada: x 150–935, y 55–600.
  const BRAIN_PATH =
    "M180 420C120 330 150 200 260 150C330 80 450 60 540 90C620 50 740 70 800 140C890 170 930 270 900 350C940 430 880 520 790 520C740 580 640 590 580 550C520 600 420 600 370 560C280 590 190 530 180 420Z";
  const SULCI = [
    "M300 250C360 200 420 260 480 220",
    "M560 160C600 240 680 200 720 260",
    "M320 420C380 380 440 460 520 400",
    "M600 420C650 360 720 440 800 380",
    "M430 130C440 200 400 260 420 330",
    "M640 110C620 160 660 200 640 250",
    "M220 330C260 300 300 340 350 320",
    "M760 300C800 280 840 320 880 300",
  ];
  const BRAIN_CX = 540;
  const BRAIN_CY = 330;
  const BRAIN_W = 800;
  const BRAIN_H = 560;
  const SVG_BRAIN_SCALE = 0.085; // escala do cérebro dentro da cabeça no SVG
  const HEAD = { x: 600, y: 378 }; // centro da cabeça no desenho
  const VIEW = { x: 0, y: -100, w: 1200, h: 900 }; // viewBox do SVG

  // ---------- Textos e lista acessível ----------
  $("name").textContent = P.name;
  $("role").textContent = P.role;
  $("tagline").textContent = P.tagline;
  document.title = P.name + " · info.me";

  const catById = Object.fromEntries(P.categories.map((c) => [c.id, c]));

  $("certList").innerHTML = P.certifications
    .map((c) => `<li><strong>${esc(c.name)}</strong><span>${esc(c.issuer)} · ${esc(c.year)}</span></li>`)
    .join("");

  $("skillGroups").innerHTML = P.categories
    .filter((c) => c.id !== "certs")
    .map((c) => {
      const items = P.skills.filter((s) => s.category === c.id);
      if (!items.length) return "";
      return `<div class="skill-group"><h4 style="color:${c.color}">${esc(c.label)}</h4><ul class="chips">${items
        .map((s) => `<li>${esc(s.name)}</li>`)
        .join("")}</ul></div>`;
    })
    .join("");

  function esc(v) {
    return String(v).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  }

  // ---------- Código "digitando" no monitor ----------
  const code = $("code");
  const SVGNS = "http://www.w3.org/2000/svg";
  const codeColors = ["#38bdf8", "#a78bfa", "#f472b6", "#34d399", "#94a3b8", "#facc15"];
  const LINES = 11;
  let seed = 7;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const lines = [];
  for (let i = 0; i < LINES; i++) {
    const indent = [0, 16, 32, 16, 0][i % 5];
    const segs = [];
    let x = indent;
    const n = 1 + Math.floor(rand() * 3);
    for (let j = 0; j < n; j++) {
      const w = 18 + rand() * 70;
      if (x + w > 320) break;
      const r = document.createElementNS(SVGNS, "rect");
      r.setAttribute("x", x);
      r.setAttribute("y", i * 17);
      r.setAttribute("height", 7);
      r.setAttribute("rx", 2);
      r.setAttribute("width", 0);
      r.setAttribute("fill", codeColors[Math.floor(rand() * codeColors.length)]);
      r.setAttribute("opacity", 0.85);
      code.appendChild(r);
      segs.push({ el: r, w });
      x += w + 8;
    }
    lines.push(segs);
  }
  const cursor = document.createElementNS(SVGNS, "rect");
  cursor.setAttribute("width", 6);
  cursor.setAttribute("height", 11);
  cursor.setAttribute("fill", "#e0f2fe");
  code.appendChild(cursor);

  const allSegs = lines.flatMap((segs, i) => segs.map((s) => ({ ...s, line: i })));
  let segIdx = 0;
  let segProgress = 0;
  function typeTick() {
    if (segIdx >= allSegs.length) {
      allSegs.forEach((s) => s.el.setAttribute("width", 0));
      segIdx = 0;
      segProgress = 0;
    }
    const s = allSegs[segIdx];
    segProgress = Math.min(s.w, segProgress + 6);
    s.el.setAttribute("width", segProgress);
    cursor.setAttribute("x", +s.el.getAttribute("x") + segProgress + 2);
    cursor.setAttribute("y", s.line * 17 - 2);
    if (segProgress >= s.w) {
      segIdx++;
      segProgress = 0;
    }
  }
  if (reduceMotion) {
    allSegs.forEach((s) => s.el.setAttribute("width", s.w));
  } else {
    setInterval(typeTick, 45);
    setInterval(() => cursor.setAttribute("opacity", cursor.getAttribute("opacity") === "0" ? 1 : 0), 500);
  }

  // ---------- Mapa neural ----------
  const canvas = $("neural");
  const ctx = canvas.getContext("2d");
  const brainPath = new Path2D(BRAIN_PATH);
  const sulci = SULCI.map((d) => new Path2D(d));
  const probe = document.createElement("canvas").getContext("2d");

  const insideBrain = (x, y) => probe.isPointInPath(brainPath, x, y);

  // Nós: um núcleo central (nome), um hub por categoria, e um nó por skill/certificação.
  const nodes = [];
  const edges = [];
  const core = { x: BRAIN_CX, y: 300, r: 14, label: P.name, color: "#e0f2fe", kind: "core", order: 0 };
  nodes.push(core);

  const hubs = {};
  P.categories.forEach((c) => {
    const hub = { x: c.x, y: c.y, r: 9, label: c.label, color: c.color, kind: "hub", cat: c, order: 0.1 };
    hubs[c.id] = hub;
    nodes.push(hub);
    edges.push([core, hub]);
  });

  const items = [
    ...P.skills.map((s) => ({ label: s.name, cat: catById[s.category], detail: null })),
    ...P.certifications.map((c) => ({ label: c.name, cat: catById.certs, detail: `${c.issuer} · ${c.year}` })),
  ].filter((it) => it.cat);

  seed = 42;
  items.forEach((it) => {
    const hub = hubs[it.cat.id];
    let best = null;
    // Rótulos são largos, então a distância horizontal conta menos que a vertical.
    // Os rótulos dos hubs ficam logo abaixo deles, então essa área também é evitada.
    const obstacles = () => nodes.flatMap((n) => (n.kind === "leaf" ? [n] : n.kind === "core" ? [n, { x: n.x, y: n.y - 30 }] : [n, { x: n.x, y: n.y + 26 }]));
    for (let tries = 0; tries < 400; tries++) {
      const a = rand() * Math.PI * 2;
      const d = 40 + rand() * (tries < 200 ? 75 : 110);
      const x = hub.x + Math.cos(a) * d * 1.3;
      const y = hub.y + Math.sin(a) * d * 0.9;
      if (!insideBrain(x, y) || !insideBrain(x + 40, y) || !insideBrain(x - 40, y)) continue;
      const minDist = Math.min(...obstacles().map((n) => Math.hypot((n.x - x) / 2.4, n.y - y)));
      if (!best || minDist > best.minDist) best = { x, y, minDist };
      if (minDist > 36) break;
    }
    const n = {
      x: best.x,
      y: best.y,
      r: 5,
      label: it.label,
      color: it.cat.color,
      kind: "leaf",
      cat: it.cat,
      detail: it.detail,
      order: 0,
      phase: rand() * Math.PI * 2,
    };
    nodes.push(n);
    edges.push([hub, n]);
  });

  // Conexões extras entre vizinhos próximos (sinapses entre regiões)
  const leaves = nodes.filter((n) => n.kind === "leaf");
  leaves.forEach((a) => {
    const near = leaves
      .filter((b) => b !== a)
      .map((b) => ({ b, d: Math.hypot(a.x - b.x, a.y - b.y) }))
      .sort((p, q) => p.d - q.d)
      .slice(0, 2);
    near.forEach(({ b, d }) => {
      if (d < 140 && !edges.some(([p, q]) => (p === a && q === b) || (p === b && q === a))) edges.push([a, b]);
    });
  });

  // Ordem de revelação: do centro para fora
  const maxD = Math.max(...leaves.map((n) => Math.hypot(n.x - core.x, n.y - core.y)));
  leaves.forEach((n) => (n.order = 0.2 + 0.8 * (Math.hypot(n.x - core.x, n.y - core.y) / maxD)));

  // Neurônios de fundo, só decorativos
  const dust = [];
  seed = 99;
  while (dust.length < 140) {
    const x = 150 + rand() * 790;
    const y = 55 + rand() * 545;
    if (insideBrain(x, y)) dust.push({ x, y, r: 0.6 + rand() * 1.4, phase: rand() * 6.28 });
  }

  const pulses = [];
  let W = 0;
  let H = 0;
  let dpr = 1;
  let fitX = 1;
  let fitY = 1;
  let offX = 0;
  let offY = 0;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    const narrow = W < 640;
    fitX = Math.min((W * (narrow ? 0.96 : 0.86)) / BRAIN_W, (H * 0.74) / BRAIN_H);
    // Em telas em pé o cérebro é esticado na vertical para dar espaço aos neurônios
    fitY = Math.max(fitX, Math.min((H * 0.72) / BRAIN_H, fitX * 1.7));
    offX = W / 2 - BRAIN_CX * fitX;
    offY = H / 2 - BRAIN_CY * fitY;
  }

  const toScreen = (n) => ({ x: offX + n.x * fitX, y: offY + n.y * fitY });

  let reveal = 0;
  let hover = null;

  function visibility(n) {
    if (n.kind === "core") return smooth(0, 0.12, reveal);
    if (n.kind === "hub") return smooth(0.05, 0.25, reveal);
    return smooth(n.order - 0.15, n.order, reveal);
  }

  function draw(time) {
    const t = time / 1000;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // Contorno do cérebro
    ctx.save();
    ctx.translate(offX, offY);
    ctx.scale(fitX, fitY);
    const g = ctx.createRadialGradient(BRAIN_CX, BRAIN_CY, 20, BRAIN_CX, BRAIN_CY, 480);
    g.addColorStop(0, "rgba(37, 99, 235, 0.18)");
    g.addColorStop(1, "rgba(37, 99, 235, 0)");
    ctx.fillStyle = g;
    ctx.fill(brainPath);
    ctx.lineWidth = 2 / fitX;
    ctx.strokeStyle = "rgba(125, 211, 252, 0.35)";
    ctx.stroke(brainPath);
    ctx.strokeStyle = "rgba(125, 211, 252, 0.12)";
    ctx.lineWidth = 1.5 / fitX;
    sulci.forEach((s) => ctx.stroke(s));
    ctx.restore();

    // Poeira neural
    dust.forEach((d) => {
      const p = toScreen(d);
      const a = 0.15 + 0.2 * Math.sin(t * 1.3 + d.phase);
      ctx.fillStyle = `rgba(148, 197, 255, ${a})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, d.r, 0, Math.PI * 2);
      ctx.fill();
    });

    const focus = hover;
    const related = new Set();
    if (focus) {
      related.add(focus);
      edges.forEach(([a, b]) => {
        if (a === focus) related.add(b);
        if (b === focus) related.add(a);
      });
    }

    // Conexões
    edges.forEach(([a, b]) => {
      const v = Math.min(visibility(a), visibility(b));
      if (v <= 0) return;
      const pa = toScreen(a);
      const pb = toScreen(b);
      const lit = focus && related.has(a) && related.has(b) && (a === focus || b === focus);
      const dim = focus && !lit;
      ctx.strokeStyle = hexA(b.kind === "leaf" ? b.color : a.kind === "core" ? b.color : a.color, (lit ? 0.9 : dim ? 0.08 : 0.3) * v);
      ctx.lineWidth = lit ? 1.8 : 1;
      ctx.beginPath();
      // leve curva para parecer orgânico
      const mx = (pa.x + pb.x) / 2 + (pb.y - pa.y) * 0.12;
      const my = (pa.y + pb.y) / 2 - (pb.x - pa.x) * 0.12;
      ctx.moveTo(pa.x, pa.y);
      ctx.quadraticCurveTo(mx, my, pb.x, pb.y);
      ctx.stroke();
    });

    // Pulsos elétricos
    if (!reduceMotion && reveal > 0.3 && Math.random() < 0.35 && pulses.length < 40) {
      const e = edges[Math.floor(Math.random() * edges.length)];
      if (Math.min(visibility(e[0]), visibility(e[1])) > 0.9) {
        pulses.push({ a: e[0], b: e[1], reverse: Math.random() < 0.5, t: 0, speed: 0.6 + Math.random() * 0.8 });
      }
    }
    for (let i = pulses.length - 1; i >= 0; i--) {
      const p = pulses[i];
      p.t += p.speed / 60;
      if (p.t >= 1) {
        pulses.splice(i, 1);
        continue;
      }
      const pa = toScreen(p.a);
      const pb = toScreen(p.b);
      const mx = (pa.x + pb.x) / 2 + (pb.y - pa.y) * 0.12;
      const my = (pa.y + pb.y) / 2 - (pb.x - pa.x) * 0.12;
      const u = p.reverse ? 1 - p.t : p.t;
      const x = (1 - u) * (1 - u) * pa.x + 2 * (1 - u) * u * mx + u * u * pb.x;
      const y = (1 - u) * (1 - u) * pa.y + 2 * (1 - u) * u * my + u * u * pb.y;
      const col = p.b.kind === "leaf" ? p.b.color : p.a.color;
      ctx.fillStyle = hexA(col, 0.9 * Math.sin(p.t * Math.PI));
      ctx.shadowColor = col;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(x, y, 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Nós
    const narrow = W < 640;
    nodes.forEach((n) => {
      const v = visibility(n);
      if (v <= 0) return;
      const p = toScreen(n);
      const isFocus = n === focus;
      const dim = focus && !related.has(n);
      const breathe = n.kind === "leaf" && !reduceMotion ? 1 + 0.15 * Math.sin(t * 2 + n.phase) : 1;
      const r = n.r * (isFocus ? 1.6 : 1) * breathe * (0.4 + 0.6 * v) * (narrow ? 0.85 : 1);

      ctx.globalAlpha = v * (dim ? 0.3 : 1);
      ctx.shadowColor = n.color;
      ctx.shadowBlur = isFocus ? 24 : n.kind === "leaf" ? 10 : 18;
      ctx.fillStyle = n.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      if (n.kind !== "leaf") {
        ctx.strokeStyle = hexA(n.color, 0.5);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r + 5 + (reduceMotion ? 0 : 2 * Math.sin(t * 1.5)), 0, Math.PI * 2);
        ctx.stroke();
      }

      // Rótulos
      const showLabel = n.kind !== "leaf" || !narrow || isFocus || related.has(n);
      if (showLabel) {
        const size = n.kind === "core" ? (narrow ? 15 : 18) : n.kind === "hub" ? (narrow ? 11 : 13) : 11;
        ctx.font = `${n.kind === "leaf" ? 500 : 700} ${size}px Inter, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = n.kind === "core" ? "bottom" : "top";
        ctx.fillStyle = n.kind === "leaf" ? "rgba(229, 231, 235, 0.85)" : n.color;
        const ly = n.kind === "core" ? p.y - r - 10 : p.y + r + (n.kind === "hub" ? 9 : 5);
        const text = n.kind === "hub" ? n.label.toUpperCase() : n.label;
        const half = ctx.measureText(text).width / 2 + 4;
        ctx.fillText(text, clamp(p.x, half, W - half), ly);
      }
      ctx.globalAlpha = 1;
    });

    if (canvasVisible) requestAnimationFrame(draw);
    else drawing = false;
  }

  function hexA(hex, a) {
    const h = hex.replace("#", "");
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${clamp(a, 0, 1)})`;
  }

  // ---------- Hover / toque ----------
  const tooltip = $("tooltip");
  function pick(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    let best = null;
    let bestD = 22;
    nodes.forEach((n) => {
      if (visibility(n) < 0.8) return;
      const p = toScreen(n);
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bestD) {
        best = n;
        bestD = d;
      }
    });
    return best;
  }

  function showTip(n) {
    hover = n;
    if (!n) {
      tooltip.classList.remove("show");
      canvas.style.cursor = "";
      return;
    }
    canvas.style.cursor = "pointer";
    const p = toScreen(n);
    const catLabel = n.kind === "core" ? P.role : n.kind === "hub" ? "Região" : n.cat.label;
    const count = n.kind === "hub" ? edges.filter(([a]) => a === n).length : 0;
    const meta = n.kind === "hub" ? `${count} ${count === 1 ? "item" : "itens"}` : n.detail || "";
    tooltip.innerHTML = `<span class="cat" style="color:${n.color}">${esc(catLabel)}</span><strong>${esc(n.label)}</strong>${
      meta ? `<span class="meta">${esc(meta)}</span>` : ""
    }`;
    tooltip.classList.add("show");
    const tw = tooltip.offsetWidth;
    const th = tooltip.offsetHeight;
    let left = p.x + 14;
    let top = p.y - th - 14;
    if (left + tw > W - 8) left = p.x - tw - 14;
    if (top < 8) top = p.y + 14;
    tooltip.style.left = clamp(left, 8, W - tw - 8) + "px";
    tooltip.style.top = top + "px";
  }

  canvas.addEventListener("pointermove", (e) => {
    if (e.pointerType === "mouse") showTip(pick(e.clientX, e.clientY));
  });
  canvas.addEventListener("pointerleave", () => showTip(null));
  canvas.addEventListener("click", (e) => showTip(pick(e.clientX, e.clientY)));

  // ---------- Scroll: zoom na cabeça e transição para o mapa ----------
  const journey = $("journey");
  const world = $("world");
  const scene = $("scene");
  const brainInHead = $("brainInHead");
  const intro = $("intro");
  const hint = $("scrollHint");
  const caption = $("neuralCaption");

  let canvasVisible = false;
  let drawing = false;

  function onScroll() {
    const rect = journey.getBoundingClientRect();
    const total = rect.height - window.innerHeight;
    const p = clamp(-rect.top / total, 0, 1);

    // Escala final: o cérebro do SVG fica do mesmo tamanho do cérebro no canvas
    const unitsToPx = Math.max(W / VIEW.w, H / VIEW.h); // preserveAspectRatio slice
    const sTarget = fitX / (SVG_BRAIN_SCALE * unitsToPx);
    const z = smooth(0.06, 0.56, p);
    const s = Math.exp(lerp(0, Math.log(sTarget * 1.12), Math.pow(z, 1.6)));
    const move = smooth(0.04, 0.4, p);
    const tx = lerp(HEAD.x, VIEW.x + VIEW.w / 2, move);
    const ty = lerp(HEAD.y, VIEW.y + VIEW.h / 2, move);
    world.setAttribute("transform", `translate(${tx} ${ty}) scale(${s}) translate(${-HEAD.x} ${-HEAD.y})`);

    brainInHead.setAttribute("opacity", smooth(0.14, 0.38, p));
    scene.style.opacity = 1 - smooth(0.52, 0.62, p);

    const c = smooth(0.5, 0.62, p);
    canvas.style.opacity = c;
    canvas.style.transform = `scale(${lerp(0.9, 1, smooth(0.5, 0.7, p))})`;
    canvas.style.pointerEvents = c > 0.9 ? "auto" : "none";
    reveal = smooth(0.58, 0.9, p);

    intro.style.opacity = 1 - smooth(0, 0.07, p);
    hint.style.opacity = 1 - smooth(0, 0.05, p);
    caption.style.opacity = smooth(0.86, 0.94, p);

    if (c < 0.9 && hover) showTip(null);

    canvasVisible = c > 0 && rect.bottom > 0;
    if (canvasVisible && !drawing) {
      drawing = true;
      requestAnimationFrame(draw);
    }
  }

  function onResize() {
    resize();
    onScroll();
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onResize);
  onResize();
})();
