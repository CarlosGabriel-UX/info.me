// Abertura: um terminal roda um script que imprime o perfil (tirado de data.js),
// depois dá zoom no cursor e revela o mapa neural. main.js escuta o evento "intro:enter".
import { PROFILE as P } from "./data.js";
import { track } from "./analytics.js";

const root = document.getElementById("term");
const win = document.getElementById("termWin");
const body = document.getElementById("termBody");
const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const PROMPT = `<span class="p-user">carlos@info.me</span><span class="p-sep">:</span><span class="p-dir">~</span><span class="p-sep">$</span> `;
const byCat = (id) => P.nodes.filter((n) => n.category === id);
const catLabel = Object.fromEntries(P.categories.map((c) => [c.id, c.label]));
const firstClause = (t) => (t || "").split(/[.;]/)[0].trim();
const [role, focus] = P.role.split(" · ");
const dots = (k, w = 21) => `${k} ${".".repeat(Math.max(2, w - k.length))}`;

// Cada linha: { cmd } é digitada depois do prompt; { html } aparece de uma vez, como saída.
const kv = (k, v, cls = "") => ({ kv: true, html: `<span class="k">${esc(dots(k))}</span> <span class="v ${cls}">${v}</span>` });
const head = (t) => ({ html: `<span class="h">## ${esc(t)}</span>`, gap: true });
const item = (mark, cls, label, meta) => ({
  html: `<span class="${cls}">${mark}</span> <span class="v">${esc(label)}</span>${meta ? ` <span class="m">· ${esc(meta)}</span>` : ""}`,
  ind: true,
});

const date = new Date().toLocaleString("pt-BR", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const LINES = [
  { html: `<span class="m">Último login: ${esc(date)} em ttys001</span>` },
  { cmd: "./perfil.sh --fonte linkedin" },
  { html: `<span class="m">[ .. ] lendo perfil de ${esc(P.linkedin.replace(/^https?:\/\//, ""))}</span>`, pause: 380 },
  { html: `<span class="ok">[ OK ]</span> <span class="m">perfil carregado</span>`, gap: true },
  kv("Usuário", esc(P.fullName), "hi"),
  kv("Função", esc(role)),
  ...(focus ? [kv("Foco", esc(focus))] : []),
  kv("Local", esc(P.location)),
  kv("LinkedIn", `<a href="${esc(P.linkedin)}" target="_blank" rel="noopener">${esc(P.linkedin.replace(/^https?:\/\//, ""))}</a>`),
  head("Resumo"),
  { html: `<span class="v">${esc(P.summary)}</span>`, ind: true },
  head("Formação"),
  ...byCat("formacao").map((n) => item("▸", "b", n.label, [firstClause(n.detail), n.status].filter(Boolean).join(" · "))),
  head("Certificados"),
  ...byCat("certs").map((n) => item("✔", "y", n.label, [firstClause(n.detail), n.status].filter(Boolean).join(" · "))),
  head("Conhecimentos"),
  ...P.categories
    .filter((c) => !["formacao", "certs"].includes(c.id))
    .map((c) => ({
      kv: true,
      html: `<span class="k" style="color:${c.color}">${esc(dots(catLabel[c.id]))}</span> <span class="v">${byCat(c.id)
        .map((n) => esc(n.label) + (n.status ? ` <span class="m">(${esc(n.status)})</span>` : ""))
        .join(", ")}</span>`,
    })),
  { html: "", gap: true },
  { cmd: "./mapa-neural --iniciar", pause: 500 },
  { html: `<span class="ok">[ OK ]</span> <span class="m">${P.nodes.length} neurônios · ${P.links.length} sinapses</span>` },
  { html: `<span class="ok">[ OK ]</span> <span class="m">sincronizando córtex</span>`, pause: 260 },
  { html: `<span class="hi">&gt; entrando no mapa neural</span>`, last: true },
];

let skipped = false;
let done = false;
const sleep = (ms) => (skipped || reduce ? Promise.resolve() : new Promise((r) => setTimeout(r, ms)));

const cursor = document.createElement("span");
cursor.className = "cursor";

function addLine(l) {
  const div = document.createElement("div");
  div.className = "ln" + (l.ind ? " ind" : "") + (l.gap ? " gap" : "") + (l.kv ? " kv" : "");
  body.appendChild(div);
  return div;
}
function scroll() {
  body.scrollTop = body.scrollHeight;
}

async function typeCmd(l) {
  const div = addLine(l);
  div.innerHTML = PROMPT;
  const span = document.createElement("span");
  span.className = "cmd";
  div.append(span, cursor);
  scroll();
  await sleep(l.pause || 650);
  for (let i = 1; i <= l.cmd.length; i++) {
    span.textContent = l.cmd.slice(0, i);
    if (skipped || reduce) {
      span.textContent = l.cmd;
      break;
    }
    await sleep(38 + Math.random() * 55);
  }
  await sleep(260);
}

async function run() {
  await sleep(350);
  for (const l of LINES) {
    if (l.cmd) {
      await typeCmd(l);
      continue;
    }
    if (l.pause) await sleep(l.pause);
    const div = addLine(l);
    div.innerHTML = l.html;
    if (l.last) div.appendChild(cursor);
    else body.appendChild(cursor);
    scroll();
    await sleep(l.gap ? 90 : 42);
  }
  await sleep(900);
  enter();
}

// Zoom no cursor: a janela cresce a partir dele até o texto sumir e o mapa aparecer por trás
function enter() {
  if (done) return;
  done = true;
  const w = win.getBoundingClientRect();
  const c = cursor.getBoundingClientRect();
  win.style.transformOrigin = `${c.left + c.width / 2 - w.left}px ${c.top + c.height / 2 - w.top}px`;
  root.classList.add("zoom");
  document.documentElement.classList.remove("intro-on");
  window.__introEntered = true;
  window.dispatchEvent(new Event("intro:enter"));
  track(skipped ? "intro/pulou" : "intro/assistiu", skipped ? "abertura pulada" : "abertura assistida até o fim");
  setTimeout(() => root.remove(), reduce ? 400 : 1500);
}

// pular: termina de imprimir tudo na hora e segue para o mapa
const skip = (e) => {
  if (e.target.closest && e.target.closest("a")) return;
  if (skipped) enter();
  skipped = true;
};
root.addEventListener("click", skip);
window.addEventListener("keydown", skip);
window.addEventListener("intro:enter", () => window.removeEventListener("keydown", skip), { once: true });

run();
