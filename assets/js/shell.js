// Terminal interativo por cima do mapa: o visitante digita comandos (help, whoami, certs...)
// e "mapa <termo>" leva a câmera até o neurônio. Abre com a tecla ` ou o botão "Terminal".
// Fala com main.js pelos eventos "map:focus" e "map:overview".
import { ACTIVE as P, ACTIVE_UNIVERSE as U, UNIVERSES, universeById, mapUrl, shipUrl } from "./universes.js";
import { PROFILE as OWNER } from "./data.js"; // o dono do site (o CTF manda print para ele)
import { track, totalVisits } from "./analytics.js";

const $ = (id) => document.getElementById(id);
const root = $("shell");
const out = $("shellOut");
const input = $("shellInput");
const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const norm = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const byCat = (id) => P.nodes.filter((n) => n.category === id);
const cats = P.categories;
const catFor = (q) => cats.find((c) => c.id === norm(q) || norm(c.label).startsWith(norm(q)));
const linkedinShort = (P.linkedin || "").replace(/^https?:\/\//, "");
const onlyReal = () => err("este é um universo de exemplo (perfil fictício): não tem currículo nem LinkedIn.");
const [role, focus] = P.role.split(" · ");
const pad = (k, w) => k + " ".repeat(Math.max(1, w - k.length));

const PROMPT = `<span class="p-user">visitante@info.me</span><span class="p-sep">:</span><span class="p-dir">~</span><span class="p-sep">$</span> `;
const kv = (k, v) => `<span class="k">${esc(pad(k, 11))}</span><span class="v">${v}</span>`;
const item = (mark, cls, n) =>
  `  <span class="${cls}">${mark}</span> <span class="v">${esc(n.label)}</span>${
    n.status ? ` <span class="m">· ${esc(n.status)}</span>` : ""
  }`;
const err = (t) => `<span class="r">${t}</span>`;

// Desafio CTF: a flag fica só em base64 no código, para não aparecer num Ctrl+F
const SECRET = "ZmxhZ3ttM250M19kM19jNHJsMHNfNGIzcnQ0fQ==";
const CV_URL = "assets/cv-carlos-gabriel.pdf";
let hints = 0;

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
        `<span class="m">voe entre universos com</span> <span class="ok">nave</span><span class="m">.</span>`,
        `<span class="y">psst:</span> <span class="m">tem uma flag escondida neste site. digite</span> <span class="ok">hint</span> <span class="m">se travar.</span>`,
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
        ...(P.linkedin ? [kv("linkedin", `<a href="${esc(P.linkedin)}" target="_blank" rel="noopener">${esc(linkedinShort)}</a>`)] : []),
        ...(U.demo ? [kv("universo", `<span class="y">exemplo · perfil fictício</span>`)] : []),
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
    run: (a) =>
      [
        ...(a.some((x) => /^-\w*a/.test(x)) ? [`<span class="m">./  ../</span>  <span class="y">.segredo</span>`] : []),
        ...cats.map((c) => `<span style="color:${c.color}">${esc(c.id)}/</span> <span class="m">${byCat(c.id).length} itens</span>`),
      ].join("\n"),
  },
  cat: {
    args: "<arquivo>",
    run: (a) => {
      const f = (a[0] || "").replace(/^\.\//, "");
      if (f === ".segredo")
        return [
          `<span class="m"># você achou um arquivo escondido. o conteúdo está codificado:</span>`,
          `<span class="y">${SECRET}</span>`,
        ].join("\n");
      const c = f && catFor(f.replace(/\/$/, ""));
      if (c) return COMMANDS.skills.run([c.id]);
      return err(`cat: ${esc(a[0] || "")}: arquivo não encontrado`);
    },
  },
  base64: {
    args: "-d <texto>",
    run: (a) => {
      const txt = a.filter((x) => !x.startsWith("-")).join("");
      if (!a.some((x) => x === "-d" || x === "--decode")) return err("use base64 -d &lt;texto&gt; para decodificar");
      try {
        return `<span class="hi">${esc(atob(txt))}</span>`;
      } catch (e) {
        return err("base64: entrada inválida");
      }
    },
  },
  submit: {
    args: "<flag>",
    run: (a) => {
      if (!a[0]) return err("use submit flag{...}");
      if (a.join(" ").trim() !== atob(SECRET))
        return err("flag incorreta. continue tentando, ou digite hint.");
      track("ctf/resolvido", "CTF resolvido");
      return [
        `<span class="ok">   ___________</span>`,
        `<span class="ok">  '._==_==_=_.'</span>`,
        `<span class="ok">  .-\\:      /-.</span>    <span class="hi">FLAG CORRETA!</span>`,
        `<span class="ok"> | (|:.     |) |</span>   <span class="v">Você tem olho de analista de segurança.</span>`,
        `<span class="ok">  '-|:.     |-'</span>    <span class="v">Me manda um print no</span> <a href="${esc(OWNER.linkedin)}" target="_blank" rel="noopener">LinkedIn</a><span class="v">,</span>`,
        `<span class="ok">    \\::.    /</span>      <span class="v">vou gostar de saber quem achou.</span>`,
        `<span class="ok">     '::. .'</span>`,
        `<span class="ok">       ) (</span>`,
        `<span class="ok">     _.' '._</span>`,
      ].join("\n");
    },
  },
  hint: {
    run: () => {
      const tips = [
        "nem todo arquivo aparece num ls comum.",
        "no Linux, arquivos que começam com ponto ficam escondidos. tente ls -a.",
        "leia o arquivo com cat. o texto que aparece está em base64.",
        "decodifique com base64 -d &lt;texto&gt; e envie o resultado com submit.",
      ];
      const t = tips[Math.min(hints++, tips.length - 1)];
      return `<span class="y">dica ${Math.min(hints, tips.length)}/${tips.length}:</span> <span class="v">${t}</span>`;
    },
  },
  timeline: {
    desc: "conta minha trajetória no mapa",
    run: (a) => {
      if (a[0] === "stop" || a[0] === "parar") {
        window.dispatchEvent(new CustomEvent("map:timeline", { detail: { stop: true } }));
        return `<span class="m">linha do tempo parada</span>`;
      }
      print(`<span class="m">acendendo os neurônios na ordem em que aprendi. Esc duas vezes para parar.</span>`, "res");
      window.dispatchEvent(new CustomEvent("map:timeline", { detail: {} }));
      return null;
    },
  },
  theme: {
    args: "[verde|azul|vermelho]",
    desc: "troca as cores do cérebro",
    run: (a) => {
      const detail = { name: a[0] ? norm(a[0]) : null, ok: false };
      window.dispatchEvent(new CustomEvent("map:theme", { detail }));
      if (!detail.themes) return err("o mapa ainda não carregou");
      if (!a[0])
        return `temas: ${detail.themes
          .map((t) => (t === detail.current ? `<span class="hi">${t}</span> <span class="m">(atual)</span>` : t))
          .join(", ")}\n<span class="m">use theme &lt;nome&gt;</span>`;
      return detail.ok ? `<span class="ok">tema ${esc(detail.name)} aplicado</span>` : err(`tema não encontrado: ${esc(a[0])}`);
    },
  },
  cv: {
    desc: "baixa meu currículo em PDF",
    run: () => {
      if (U.demo) return onlyReal();
      const a = document.createElement("a");
      a.href = CV_URL;
      a.download = CV_URL.split("/").pop();
      document.body.appendChild(a);
      a.click();
      a.remove();
      return `<span class="m">baixando</span> <a href="${CV_URL}" download>${esc(a.download)}</a>`;
    },
  },
  stats: {
    desc: "quantas pessoas já visitaram",
    run: () => {
      const line = document.createElement("div");
      line.className = "ln res";
      line.innerHTML = `<span class="m">consultando o contador...</span>`;
      out.appendChild(line);
      totalVisits().then((n) => {
        line.innerHTML =
          n != null
            ? `<span class="ok">${esc(Number(n).toLocaleString("pt-BR"))}</span> <span class="v">visitantes já passaram por aqui. obrigado por ser um deles!</span>`
            : `<span class="m">contador indisponível no momento.</span>`;
        out.scrollTop = out.scrollHeight;
      });
      return null;
    },
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
      if (!P.linkedin) return onlyReal();
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
  nave: {
    desc: "volta para a nave no multiverso",
    run: () => {
      setTimeout(() => window.location.assign(shipUrl(U)), 450);
      return `<span class="ok">→</span> <span class="m">teletransportando para a ponte da nave...</span>`;
    },
  },
  multiverso: {
    args: "[universo]",
    desc: "lista os universos ou entra num deles",
    run: (a) => {
      if (!a[0])
        return [
          `<span class="h">universos conhecidos</span>`,
          ...UNIVERSES.map(
            (u) =>
              `  <span class="ok">${esc(pad(u.id, 13))}</span><span class="v">${esc(u.profile.name)}</span> <span class="m">· ${esc(
                u.profile.role.split(" · ")[0]
              )}</span>${u.demo ? ` <span class="y">(exemplo)</span>` : ""}${u === U ? ` <span class="hi">← você está aqui</span>` : ""}`
          ),
          ``,
          `<span class="m">use</span> <span class="ok">multiverso &lt;universo&gt;</span> <span class="m">para entrar num deles, ou</span> <span class="ok">nave</span> <span class="m">para pilotar até lá.</span>`,
        ].join("\n");
      const q = norm(a.join(" "));
      const u = universeById(q) || UNIVERSES.find((x) => norm(x.profile.name).includes(q) || x.id.includes(q));
      if (!u) return err(`universo não encontrado: ${esc(a.join(" "))}. digite multiverso para ver a lista.`);
      if (u === U) return `<span class="m">você já está no universo de</span> <span class="hi">${esc(u.profile.name)}</span>`;
      setTimeout(() => window.location.assign(mapUrl(u)), 450);
      return `<span class="ok">→</span> <span class="m">abrindo o universo de</span> <span class="hi">${esc(u.profile.name)}</span>`;
    },
  },
  sudo: { run: () => err("visitante não está no arquivo sudoers. Este incidente será reportado. 😉") },
  clear: { desc: "limpa a tela", run: () => (out.innerHTML = "", null) },
  exit: { desc: "fecha o terminal", run: () => (close(), null) },
};
const ALIASES = { ship: "nave", multiverse: "multiverso", universos: "multiverso", curriculo: "cv", "currículo": "cv", tema: "theme", dica: "hint",  "?": "help", ajuda: "help", "formação": "formacao", certificados: "certs", resumo: "sobre", cls: "clear", sair: "exit" };

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
  const pipe = line.match(/^\s*echo\s+["']?([^"'|]+?)["']?\s*\|\s*base64\s+(-d|--decode)\s*$/);
  if (pipe) line = `base64 -d ${pipe[1]}`;
  const [raw, ...args] = line.trim().split(/\s+/);
  if (!raw) return;
  history.push(line);
  hIdx = history.length;
  const name = ALIASES[norm(raw)] || norm(raw);
  const cmd = COMMANDS[name];
  // conta só o nome do comando (e a área ou tema escolhido), nunca o texto livre digitado
  const known = cmd ? name : "desconhecido";
  const arg = cmd && ["cd", "skills", "theme", "mapa"].includes(name) && args[0] ? "/" + args[0] : "";
  track(`cmd/${known}${arg}`, `terminal: ${known}`);
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

// a linha do tempo roda no mapa; aqui cada etapa vira uma linha de saída
window.addEventListener("map:timeline-step", (e) => {
  const { i, step } = e.detail;
  if (i < 0) return;
  print(`<span class="y">[${esc(step.when)}]</span> <span class="v">${esc(step.title)}</span>`, "tl");
});

let greeted = false;
function open() {
  root.hidden = false;
  document.body.classList.add("shell-open");
  if (!greeted) {
    greeted = true;
    track("shell/aberto", "terminal interativo aberto");
    print(`<span class="m">info.me shell · digite</span> <span class="ok">help</span> <span class="m">para ver os comandos</span>`);
  }
  input.focus({ preventScroll: true });
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

// Para quem abre o console do navegador
console.log(
  "%cinfo.me%c  curioso? aperte ' no mapa e digite ls -a. tem uma flag escondida.",
  "color:#22ff88;font:bold 14px monospace",
  "color:#86efac;font:12px monospace"
);

// cliques em botões e links marcados com data-track
document.addEventListener("click", (e) => {
  const el = e.target.closest && e.target.closest("[data-track]");
  if (el) track(el.dataset.track, el.dataset.track);
});
