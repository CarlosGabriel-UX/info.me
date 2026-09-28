// Terminal interativo por cima do mapa: o visitante digita comandos (help, whoami, certs...)
// e "mapa <termo>" leva a câmera até o neurônio. Abre com a tecla ` ou o botão "Terminal".
// Fala com main.js pelos eventos "map:focus" e "map:overview".
import { PROFILE as P } from "./data.js";

const $ = (id) => document.getElementById(id);
const root = $("shell");
const out = $("shellOut");
const input = $("shellInput");
const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const norm = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const byCat = (id) => P.nodes.filter((n) => n.category === id);
const cats = P.categories;
const catFor = (q) => cats.find((c) => c.id === norm(q) || norm(c.label).startsWith(norm(q)));
const linkedinShort = P.linkedin.replace(/^https?:\/\//, "");
const [role, focus] = P.role.split(" · ");
const pad = (k, w) => k + " ".repeat(Math.max(1, w - k.length));

const PROMPT = `<span class="p-user">visitante@info.me</span><span class="p-sep">:</span><span class="p-dir">~</span><span class="p-sep">$</span> `;
const kv = (k, v) => `<span class="k">${esc(pad(k, 11))}</span><span class="v">${v}</span>`;
const item = (mark, cls, n) =>
  `  <span class="${cls}">${mark}</span> <span class="v">${esc(n.label)}</span>${
    n.status ? ` <span class="m">· ${esc(n.status)}</span>` : ""
  }`;
const err = (t) => `<span class="r">${t}</span>`;

// ---------------------------------------------------------------------------
// Comandos
// ---------------------------------------------------------------------------
const COMMANDS = {
  help: {
    desc: "lista os comandos",
    run: () =>
      [
        `<span class="h">comandos disponíveis</span>`,
        ...Object.entries(COMMANDS)
          .filter(([, c]) => c.desc)
          .map(([k, c]) => `  <span class="ok">${esc(pad(k + (c.args ? " " + c.args : ""), 22))}</span><span class="m">${esc(c.desc)}</span>`),
        ``,
        `<span class="m">dica: Tab completa, ↑ ↓ repetem comandos, Esc fecha.</span>`,
      ].join("\n"),
  },
  whoami: {
    desc: "quem sou eu",
    run: () =>
      [
        kv("nome", `<span class="hi">${esc(P.fullName)}</span>`),
        kv("função", esc(role)),
        ...(focus ? [kv("foco", esc(focus))] : []),
        kv("local", esc(P.location)),
        kv("linkedin", `<a href="${esc(P.linkedin)}" target="_blank" rel="noopener">${esc(linkedinShort)}</a>`),
      ].join("\n"),
  },
  sobre: { desc: "resumo profissional", run: () => `<span class="v">${esc(P.summary)}</span>` },
  formacao: {
    desc: "cursos em andamento",
    run: () => byCat("formacao").map((n) => item("▸", "b", n)).join("\n"),
  },
  certs: {
    desc: "certificados",
    run: () => byCat("certs").map((n) => item("✔", "y", n)).join("\n"),
  },
  skills: {
    args: "[área]",
    desc: "conhecimentos, todos ou de uma área",
    run: (a) => {
      const list = cats.filter((c) => !["formacao", "certs"].includes(c.id));
      if (a[0]) {
        const c = catFor(a[0]);
        if (!c) return err(`área não encontrada: ${esc(a[0])}. use ls para ver as áreas.`);
        return [`<span class="h" style="color:${c.color}">${esc(c.label)}</span>`, ...byCat(c.id).map((n) => item("•", "m", n))].join("\n");
      }
      return list
        .map((c) => `<span class="k" style="color:${c.color}">${esc(pad(c.label, 20))}</span><span class="v">${byCat(c.id).map((n) => esc(n.label)).join(", ")}</span>`)
        .join("\n");
    },
  },
  ls: {
    desc: "áreas do cérebro",
    run: () =>
      cats
        .map((c) => `<span style="color:${c.color}">${esc(c.id)}/</span> <span class="m">${byCat(c.id).length} itens</span>`)
        .join("\n"),
  },
  cd: {
    args: "<área>",
    desc: "voa até uma área no mapa",
    run: (a) => {
      const c = a[0] && catFor(a[0]);
      if (!a[0] || a[0] === "~" || a[0] === "..") return focusMap(null);
      if (!c) return err(`cd: ${esc(a[0])}: área não encontrada`);
      return focusMap(c.label);
    },
  },
  mapa: {
    args: "<termo>",
    desc: "foca um neurônio no mapa (ex.: mapa vlan)",
    run: (a) => (a.length ? focusMap(a.join(" ")) : focusMap(null)),
  },
  linkedin: {
    desc: "abre meu LinkedIn",
    run: () => {
      window.open(P.linkedin, "_blank", "noopener");
      return `<span class="m">abrindo ${esc(linkedinShort)}...</span>`;
    },
  },
  nmap: {
    args: "info.me",
    desc: "varre as portas deste site",
    run: () =>
      [
        `<span class="m">Starting Nmap 7.95 ( https://nmap.org )</span>`,
        `<span class="m">Nmap scan report for info.me</span>`,
        `<span class="k">PORT     STATE    SERVICE</span>`,
        `22/tcp   <span class="r">filtered</span> ssh`,
        `80/tcp   <span class="ok">open</span>     http      <span class="m">→ redireciona para 443</span>`,
        `443/tcp  <span class="ok">open</span>     https     <span class="m">→ você está aqui</span>`,
        ``,
        `<span class="m">Nmap done: 1 IP address (1 host up). Nada de portas esquecidas por aqui.</span>`,
      ].join("\n"),
  },
  ping: {
    args: "<host>",
    desc: "",
    run: (a) => {
      const h = esc(a[0] || "info.me");
      return [0, 1, 2]
        .map((i) => `64 bytes from ${h}: icmp_seq=${i} ttl=64 time=${(8 + Math.random() * 6).toFixed(1)} ms`)
        .join("\n");
    },
  },
  sudo: { run: () => err("visitante não está no arquivo sudoers. Este incidente será reportado. 😉") },
  clear: { desc: "limpa a tela", run: () => (out.innerHTML = "", null) },
  exit: { desc: "fecha o terminal", run: () => (close(), null) },
};
const ALIASES = { "?": "help", ajuda: "help", "formação": "formacao", certificados: "certs", resumo: "sobre", cls: "clear", sair: "exit" };

function focusMap(q) {
  if (!q) {
    window.dispatchEvent(new Event("map:overview"));
    return `<span class="m">voltando para a visão geral do mapa</span>`;
  }
  const detail = { q, ok: null };
  window.dispatchEvent(new CustomEvent("map:focus", { detail }));
  return detail.ok
    ? `<span class="ok">→</span> focando <span class="hi">${esc(detail.ok)}</span> no mapa`
    : err(`nada no mapa com "${esc(q)}". tente skills para ver os nomes.`);
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------
const history = [];
let hIdx = 0;

function print(html, cls = "") {
  const div = document.createElement("div");
  div.className = "ln " + cls;
  div.innerHTML = html;
  out.appendChild(div);
  out.scrollTop = out.scrollHeight;
}

function exec(line) {
  print(PROMPT + `<span class="cmd">${esc(line)}</span>`);
  const [raw, ...args] = line.trim().split(/\s+/);
  if (!raw) return;
  history.push(line);
  hIdx = history.length;
  const name = ALIASES[norm(raw)] || norm(raw);
  const cmd = COMMANDS[name];
  const res = cmd ? cmd.run(args) : err(`comando não encontrado: ${esc(raw)}. digite <span class="ok">help</span>.`);
  if (res) print(res, "res");
}

function complete() {
  const v = input.value;
  if (/\s/.test(v.trim()) || !v) {
    // completa o argumento de cd/skills com o id da área
    const [c, a = ""] = v.split(/\s+/);
    if (["cd", "skills"].includes(c)) {
      const m = cats.filter((x) => x.id.startsWith(norm(a)));
      if (m.length === 1) input.value = `${c} ${m[0].id}`;
      else if (m.length > 1) print(m.map((x) => x.id).join("  "), "res m");
    }
    return;
  }
  const m = [...Object.keys(COMMANDS)].filter((k) => k.startsWith(norm(v)));
  if (m.length === 1) input.value = m[0] + " ";
  else if (m.length > 1) print(m.join("  "), "res m");
}

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    exec(input.value);
    input.value = "";
  } else if (e.key === "Tab") {
    e.preventDefault();
    complete();
  } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
    e.preventDefault();
    hIdx = Math.max(0, Math.min(history.length, hIdx + (e.key === "ArrowUp" ? -1 : 1)));
    input.value = history[hIdx] || "";
  } else if (e.key === "Escape") {
    e.preventDefault(); // não deixa o Esc também sair do modo explorar
    close();
  } else if (e.key === "l" && e.ctrlKey) {
    e.preventDefault();
    out.innerHTML = "";
  }
  e.stopPropagation();
});

let greeted = false;
function open() {
  root.hidden = false;
  document.body.classList.add("shell-open");
  if (!greeted) {
    greeted = true;
    print(`<span class="m">info.me shell · digite</span> <span class="ok">help</span> <span class="m">para ver os comandos</span>`);
  }
  requestAnimationFrame(() => input.focus());
}
function close() {
  root.hidden = true;
  document.body.classList.remove("shell-open");
  input.blur();
}
const toggle = () => (root.hidden ? open() : close());

document.querySelectorAll("[data-shell]").forEach((b) => b.addEventListener("click", toggle));
$("shellClose").addEventListener("click", close);
root.addEventListener("click", (e) => {
  if (!e.target.closest("a") && !window.getSelection().toString()) input.focus();
});
// ` abre e fecha, desde que o terminal de abertura já tenha acabado e não se esteja digitando em outro campo
window.addEventListener("keydown", (e) => {
  if (e.key !== "`" && e.key !== "'") return;
  if (!window.__introEntered || (e.target.matches && e.target.matches("input, textarea"))) return;
  e.preventDefault();
  toggle();
});
