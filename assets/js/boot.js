// Tela de boot: linhas de terminal digitadas enquanto o modelo 3D baixa.
// room.js avisa o andamento com os eventos "boot:progress" (0 a 1) e "boot:ready".
import { PROFILE as P } from "./data.js";

const root = document.getElementById("boot");
const log = document.getElementById("bootLog");
const bar = document.getElementById("bootBar");
const pct = document.getElementById("bootPct");
const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const certs = P.nodes.filter((n) => n.category === "certs").length;
const LINES = [
  ["dim", "info.me neural os · v2.6 · boot"],
  ["ok", "[ OK ] verificando integridade do córtex"],
  ["ok", "[ OK ] montando /dev/hipocampo"],
  ["ok", `[ OK ] carregando ${certs} certificados`],
  ["ok", `[ OK ] indexando ${P.nodes.length} habilidades e ${P.links.length} conexões`],
  ["ok", "[ .. ] renderizando holograma"],
];
const FINAL = ["hi", "> acesso concedido. bem-vindo."];

let typed = []; // linhas já completas
let current = ""; // linha sendo digitada
let loaded = 0; // progresso real do download
let fake = 0; // progresso estimado, caso o servidor não informe o tamanho
let ready = false;
let skipped = false;
let closing = false;

const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;");
function render() {
  const rows = typed.map(([cls, t]) => `<span class="${cls}">${esc(t)}</span>`);
  const cls = typed.length < LINES.length ? LINES[typed.length][0] : FINAL[0];
  rows.push(`<span class="${cls}">${esc(current)}</span><span class="cursor"></span>`);
  log.innerHTML = rows.join("\n");
  const p = ready ? 1 : Math.max(loaded, fake);
  bar.style.width = `${(p * 100).toFixed(1)}%`;
  pct.textContent = `${Math.round(p * 100)}%`;
}

const wait = (ms) => new Promise((r) => setTimeout(r, skipped || reduce ? 0 : ms));
async function type(line) {
  const [, text] = line;
  for (let i = 1; i <= text.length; i++) {
    current = text.slice(0, i);
    render();
    if (!skipped && !reduce) await wait(text[i - 1] === " " ? 8 : 16);
  }
  current = "";
  typed.push(line);
  render();
}

async function run() {
  for (let i = 0; i < LINES.length; i++) {
    await wait(i === 0 ? 150 : 110 + Math.random() * 160);
    await type(LINES[i]);
  }
  // espera o modelo terminar de chegar
  while (!ready) await new Promise((r) => setTimeout(r, 60));
  typed[typed.length - 1] = ["ok", "[ OK ] renderizando holograma"];
  render();
  await wait(250);
  await type(FINAL);
  await wait(650);
  close();
}

function close() {
  if (closing) return;
  closing = true;
  root.classList.add("out");
  document.documentElement.classList.remove("booting");
  setTimeout(() => root.remove(), 900);
}

window.addEventListener("boot:progress", (e) => {
  loaded = Math.min(1, e.detail || 0);
  render();
});
window.addEventListener("boot:ready", () => {
  ready = true;
  render();
});
// progresso estimado que avança devagar até 90%
const tick = setInterval(() => {
  if (ready || closing) return clearInterval(tick);
  fake = Math.min(0.9, fake + (0.9 - fake) * 0.04);
  render();
}, 100);
// pular: acelera o texto e fecha assim que o modelo estiver pronto
const skip = () => (skipped = true);
root.addEventListener("click", skip);
window.addEventListener("keydown", skip, { once: true });
// segurança: nunca prende o site se o modelo não carregar
setTimeout(() => {
  ready = true;
  close();
}, 15000);

render();
run();
