// Criar meu universo: importa o PDF do LinkedIn (lido só no navegador), mostra o resultado num editor
// com prévia 3D e salva no localStorage. Contas e compartilhamento ficam para a próxima fase.
import { parseLinkedInPdf } from "./linkedin-pdf.js";
import {
  normalizeProfile, loadMine, saveMine, deleteMine, savedAt, uniqueId, regionPos, hasContacts, cleanLinkedin, PALETTE, MY_ID,
} from "./meu-universo.js";
import { createPreview } from "./criar-preview.js";
import { track } from "./analytics.js";

const $ = (id) => document.getElementById(id);
const esc = (t) => String(t).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "style") el.style.cssText = v;
    else if (k in el && k !== "list") el[k] = v;
    else el.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c != null) el.append(c);
  return el;
}

let P = null; // perfil em edição
let dirty = false;
let preview = null;

// ---------------------------------------------------------------------------
// Avisos
// ---------------------------------------------------------------------------
let toastT = 0;
function toast(text, err = false) {
  const t = $("toast");
  t.textContent = text;
  t.classList.toggle("err", err);
  t.hidden = false;
  clearTimeout(toastT);
  toastT = setTimeout(() => (t.hidden = true), 3200);
}
function confirmBox(text, ok = "Confirmar") {
  const d = $("dialog");
  $("dialogText").textContent = text;
  $("dialogOk").textContent = ok;
  return new Promise((res) => {
    d.addEventListener("close", () => res(d.returnValue === "ok"), { once: true });
    d.returnValue = "";
    d.showModal();
  });
}

// ---------------------------------------------------------------------------
// Passo 1: PDF
// ---------------------------------------------------------------------------
const log = $("log");
function logLine(html, cls = "") {
  const p = document.createElement("div");
  p.className = "ln " + cls;
  p.innerHTML = html;
  log.appendChild(p);
  return p;
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function importPdf(file) {
  if (!file) return;
  const drop = $("drop");
  log.innerHTML = "";
  logLine(`<span class="p-user">visitante@info.me</span><span class="p-sep">:</span><span class="p-dir">~</span><span class="p-sep">$</span> <span class="cmd">./importar-linkedin.sh ${esc(file.name)}</span>`);
  if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") {
    logLine(`<span class="r">[ ERRO ]</span> <span class="v">isso não é um PDF. Gere o arquivo em Mais → Salvar em PDF no seu perfil.</span>`);
    return;
  }
  if (file.size > 15 * 1024 * 1024) {
    logLine(`<span class="r">[ ERRO ]</span> <span class="v">arquivo grande demais (máx. 15 MB).</span>`);
    return;
  }
  drop.classList.add("busy");
  const prog = logLine(`<span class="m">[ .. ] lendo o PDF aqui no seu navegador (nada sai do seu computador)</span>`);
  try {
    const buf = await file.arrayBuffer();
    const { profile, report } = await parseLinkedInPdf(buf, ({ page, pages }) => {
      prog.innerHTML = `<span class="m">[ .. ] lendo página ${page} de ${pages} no seu navegador</span>`;
    });
    prog.innerHTML = `<span class="ok">[ OK ]</span> <span class="m">${report.pages} ${report.pages === 1 ? "página lida" : "páginas lidas"}</span>`;
    await wait(160);
    if (report.sections.length) logLine(`<span class="ok">[ OK ]</span> <span class="m">seções:</span> <span class="v">${esc(report.sections.join(" · "))}</span>`);
    const c = report.counts;
    logLine(
      `<span class="ok">[ OK ]</span> <span class="v">${c.experiencias} experiências · ${c.formacoes} formações · ${c.certificados} certificados · ${c.competencias} competências · ${c.idiomas} idiomas${c.premios ? ` · ${c.premios} prêmios` : ""}</span>`
    );
    await wait(160);
    logLine(`<span class="ok">[ OK ]</span> <span class="m">contato descartado: e-mail e telefone não foram lidos para o universo${profile.linkedin ? " (só o endereço do LinkedIn ficou)" : ""}</span>`);
    logLine(`<span class="ok">[ OK ]</span> <span class="m">${profile.nodes.length} neurônios · ${profile.links.length} sinapses · ${profile.categories.length} regiões</span>`);
    await wait(220);
    logLine(`<span class="hi">&gt; abrindo o editor</span>`);
    track("criar/pdf", "universo criado a partir do PDF");
    await wait(reduceMotion ? 0 : 650);
    openEditor(profile, true);
  } catch (e) {
    console.warn(e);
    logLine(`<span class="r">[ ERRO ]</span> <span class="v">${esc(e && e.message ? e.message : "não consegui ler este PDF.")}</span>`);
  } finally {
    drop.classList.remove("busy");
    $("pdfInput").value = "";
  }
}
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

{
  const drop = $("drop");
  $("pdfInput").addEventListener("change", (e) => importPdf(e.target.files[0]));
  let depth = 0;
  window.addEventListener("dragenter", (e) => {
    if (!$("step1").hidden && e.dataTransfer && [...e.dataTransfer.types].includes("Files")) {
      depth++;
      drop.classList.add("over");
    }
  });
  window.addEventListener("dragleave", () => {
    depth = Math.max(0, depth - 1);
    if (!depth) drop.classList.remove("over");
  });
  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("drop", (e) => {
    e.preventDefault();
    depth = 0;
    drop.classList.remove("over");
    if ($("step1").hidden) return;
    const f = e.dataTransfer && e.dataTransfer.files[0];
    if (f) importPdf(f);
  });
}

// começar do zero: regiões prontas, sem neurônios
function blankProfile() {
  return normalizeProfile({
    name: "",
    fullName: "",
    role: "",
    categories: [
      { id: "formacao", label: "Formação", color: "#60a5fa" },
      { id: "certs", label: "Certificados", color: "#facc15" },
      { id: "experiencia", label: "Experiência", color: "#34d399" },
      { id: "competencias", label: "Competências", color: "#f472b6" },
      { id: "idiomas", label: "Idiomas", color: "#e879f9" },
    ],
    nodes: [],
    links: [],
  });
}
$("scratchBtn").addEventListener("click", () => {
  const p = blankProfile();
  p.name = "";
  openEditor(p, true);
});

// JSON (exportado daqui mesmo)
async function importJson(file) {
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const prof = normalizeProfile(data && data.profile ? data.profile : data);
    if (!prof.nodes.length && !prof.summary && !prof.role) throw new Error("vazio");
    if (dirty && !(await confirmBox("Substituir o universo em edição pelo do arquivo JSON?", "Substituir"))) return;
    openEditor(prof, true);
    toast("JSON importado. Confira e salve.");
  } catch (e) {
    toast("Esse arquivo não parece um universo exportado do info.me.", true);
  }
}
$("jsonInput1").addEventListener("change", (e) => importJson(e.target.files[0]).finally(() => (e.target.value = "")));
$("jsonInput2").addEventListener("change", (e) => importJson(e.target.files[0]).finally(() => (e.target.value = "")));

$("resumeBtn").addEventListener("click", () => {
  const p = loadMine();
  if (p) openEditor(p, false);
});

// ---------------------------------------------------------------------------
// Passo 2: editor
// ---------------------------------------------------------------------------
function openEditor(profile, unsaved) {
  P = JSON.parse(JSON.stringify(profile));
  $("step1").hidden = true;
  $("step2").hidden = false;
  window.scrollTo(0, 0);
  fillProfile();
  renderCats();
  renderLinks();
  setDirty(!!unsaved);
  if (!preview) {
    preview = createPreview({ canvas: $("pv"), labels: $("pvLabels"), tip: $("pvTip"), onPick: focusNode });
  }
  refresh(true);
}
function backToStep1() {
  $("step2").hidden = true;
  $("step1").hidden = false;
  log.innerHTML = "";
  $("resumeBtn").hidden = !loadMine();
  window.scrollTo(0, 0);
}

function setDirty(v) {
  dirty = v;
  const s = $("saveState");
  if (v) {
    s.className = "save-state dirty";
    s.textContent = "● alterações não salvas";
  } else {
    const at = savedAt();
    s.className = "save-state ok";
    s.textContent = at ? `✓ salvo neste navegador às ${new Date(at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : "✓ salvo";
  }
}

let refreshT = 0;
function refresh(now) {
  clearTimeout(refreshT);
  const run = () => {
    const view = normalizeProfile(P);
    if (preview) preview.update(view);
    $("pvStats").textContent = `${view.nodes.length} neurônios · ${view.links.length} sinapses · ${view.categories.length} regiões`;
    $("cCount").textContent = `${P.categories.length} regiões · ${P.nodes.length} neurônios`;
    $("lCount").textContent = `${P.links.length}`;
  };
  if (now) run();
  else refreshT = setTimeout(run, 220);
}
function changed(structural) {
  setDirty(true);
  if (structural) renderLinks();
  refresh();
}

// ---- perfil ----
const F = { fName: "name", fFull: "fullName", fRole: "role", fLoc: "location", fLi: "linkedin", fSum: "summary" };
function fillProfile() {
  for (const [id, k] of Object.entries(F)) $(id).value = P[k] || "";
}
for (const [id, k] of Object.entries(F)) {
  $(id).addEventListener("input", (e) => {
    P[k] = e.target.value;
    changed(false);
  });
}
$("fLi").addEventListener("change", (e) => {
  if (e.target.value && !cleanLinkedin(e.target.value)) toast("Endereço do LinkedIn não reconhecido (use linkedin.com/in/seu-perfil).", true);
});

// ---- regiões e neurônios ----
const catOf = (id) => P.categories.find((c) => c.id === id);
const nodeOf = (id) => P.nodes.find((n) => n.id === id);
const takenNodeIds = () => new Set(["__core", ...P.nodes.map((n) => n.id)]);
const closed = new Set();

function nodeRow(n, c) {
  const row = h(
    "li",
    { className: "node", "data-id": n.id },
    h("input", {
      value: n.label,
      placeholder: "nome do neurônio",
      "aria-label": "Nome",
      maxLength: 120,
      oninput: (e) => {
        n.label = e.target.value;
        changed(false);
        renderLinksSoon();
      },
    }),
    h("input", {
      value: n.status || "",
      placeholder: "status / datas",
      "aria-label": "Status ou datas",
      maxLength: 80,
      oninput: (e) => {
        n.status = e.target.value;
        changed(false);
      },
    }),
    h("textarea", {
      value: n.detail || "",
      placeholder: "detalhe (aparece no painel)",
      "aria-label": "Detalhe",
      maxLength: 1200,
      oninput: (e) => {
        n.detail = e.target.value;
        changed(false);
      },
    }),
    h("button", {
      className: "x",
      type: "button",
      title: "Remover neurônio",
      "aria-label": `Remover ${n.label}`,
      textContent: "✕",
      onclick: () => {
        P.nodes = P.nodes.filter((x) => x !== n);
        P.links = P.links.filter((l) => l.from !== n.id && l.to !== n.id);
        row.remove();
        updateCatCount(c);
        changed(true);
      },
    })
  );
  return row;
}
function updateCatCount(c) {
  const el = document.querySelector(`.cat[data-id="${CSS.escape(c.id)}"] .cnt`);
  if (el) {
    const k = P.nodes.filter((n) => n.category === c.id).length;
    el.textContent = `${k} ${k === 1 ? "neurônio" : "neurônios"}`;
  }
}
function catBox(c) {
  const list = h("ul", { className: "nodes" }, P.nodes.filter((n) => n.category === c.id).map((n) => nodeRow(n, c)));
  const box = h(
    "div",
    { className: "cat" + (closed.has(c.id) ? " closed" : ""), "data-id": c.id, style: `--c:${c.color}` },
    h(
      "div",
      { className: "cat-h" },
      h("button", {
        className: "cat-toggle",
        type: "button",
        title: "Mostrar ou esconder os neurônios",
        textContent: closed.has(c.id) ? "▸" : "▾",
        onclick: (e) => {
          box.classList.toggle("closed");
          const isClosed = box.classList.contains("closed");
          isClosed ? closed.add(c.id) : closed.delete(c.id);
          e.currentTarget.textContent = isClosed ? "▸" : "▾";
        },
      }),
      h("span", { className: "dot" }),
      h("input", {
        className: "cat-label",
        value: c.label,
        "aria-label": "Nome da região",
        maxLength: 60,
        oninput: (e) => {
          c.label = e.target.value;
          changed(false);
          renderLinksSoon();
        },
      }),
      h("input", {
        type: "color",
        value: c.color,
        title: "Cor da região",
        "aria-label": `Cor da região ${c.label}`,
        oninput: (e) => {
          c.color = e.target.value;
          box.style.setProperty("--c", c.color);
          changed(false);
          renderLinksSoon();
        },
      }),
      h("span", { className: "cnt" }),
      h("button", {
        className: "x",
        type: "button",
        title: "Remover região",
        "aria-label": `Remover região ${c.label}`,
        textContent: "✕",
        onclick: async () => {
          const k = P.nodes.filter((n) => n.category === c.id).length;
          if (k && !(await confirmBox(`Remover a região "${c.label}" e os ${k} neurônios dela?`, "Remover"))) return;
          const gone = new Set(P.nodes.filter((n) => n.category === c.id).map((n) => n.id));
          P.nodes = P.nodes.filter((n) => !gone.has(n.id));
          P.links = P.links.filter((l) => !gone.has(l.from) && !gone.has(l.to));
          P.categories = P.categories.filter((x) => x !== c);
          P.categories.forEach((x, i) => (x.pos = regionPos(i)));
          box.remove();
          changed(true);
        },
      })
    ),
    list,
    P.nodes.some((n) => n.category === c.id) ? null : h("p", { className: "empty", textContent: "nenhum neurônio ainda" }),
    h("button", {
      className: "btn add add-node",
      type: "button",
      textContent: "＋ neurônio",
      onclick: () => {
        const n = { id: uniqueId(`neuronio-${c.id}`, takenNodeIds()), label: "", category: c.id };
        P.nodes.push(n);
        box.querySelector(".empty")?.remove();
        const row = nodeRow(n, c);
        list.appendChild(row);
        updateCatCount(c);
        row.querySelector("input").focus();
        changed(true);
      },
    })
  );
  setTimeout(() => updateCatCount(c));
  return box;
}
function renderCats() {
  $("cats").replaceChildren(...P.categories.map(catBox));
}
$("addCat").addEventListener("click", () => {
  const taken = new Set(P.categories.map((c) => c.id));
  const used = new Set(P.categories.map((c) => c.color));
  const c = {
    id: uniqueId(`regiao-${P.categories.length + 1}`, taken),
    label: `Nova região`,
    color: PALETTE.find((x) => !used.has(x)) || PALETTE[P.categories.length % PALETTE.length],
    pos: regionPos(P.categories.length),
  };
  P.categories.push(c);
  const box = catBox(c);
  $("cats").appendChild(box);
  box.querySelector(".cat-label").select();
  box.querySelector(".cat-label").focus();
  changed(true);
});

// clicar num neurônio da prévia leva até o campo dele
function focusNode(n) {
  const row = document.querySelector(`.node[data-id="${CSS.escape(n.id)}"]`);
  if (!row) return;
  const box = row.closest(".cat");
  if (box.classList.contains("closed")) box.querySelector(".cat-toggle").click();
  row.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
  row.classList.add("flash");
  setTimeout(() => row.classList.remove("flash"), 1200);
  row.querySelector("input").focus({ preventScroll: true });
}

// ---- conexões ----
let linksT = 0;
function renderLinksSoon() {
  clearTimeout(linksT);
  linksT = setTimeout(renderLinks, 400);
}
const nodeName = (n) => n.label || "(sem nome)";
function options(sel, withAll) {
  const cur = sel.value;
  const groups = P.categories.map((c) =>
    h(
      "optgroup",
      { label: c.label || "região" },
      P.nodes.filter((n) => n.category === c.id).map((n) => h("option", { value: n.id, textContent: nodeName(n) }))
    )
  );
  sel.replaceChildren(...(withAll ? [h("option", { value: "", textContent: "todos os neurônios" })] : []), ...groups);
  if ([...sel.options].some((o) => o.value === cur)) sel.value = cur;
}
function renderLinks() {
  if (!P) return;
  clearTimeout(linksT);
  options($("lFrom"));
  options($("lTo"));
  options($("lFilter"), true);
  const f = $("lFilter").value;
  const list = P.links.filter((l) => !f || l.from === f || l.to === f);
  $("links").replaceChildren(
    ...list.map((l) => {
      const a = nodeOf(l.from);
      const b = nodeOf(l.to);
      if (!a || !b) return "";
      const ca = (catOf(a.category) || {}).color || "#fff";
      const cb = (catOf(b.category) || {}).color || "#fff";
      return h(
        "li",
        { className: "lk", style: `--a:${ca};--b:${cb}` },
        h("span", { className: "lk-ends" }, h("b", { textContent: nodeName(a) }), h("i", { textContent: "⟷" }), h("b", { textContent: nodeName(b) })),
        h("input", {
          value: l.why || "",
          placeholder: "motivo da conexão",
          "aria-label": "Motivo da conexão",
          maxLength: 200,
          oninput: (e) => {
            l.why = e.target.value;
            changed(false);
          },
        }),
        h("button", {
          className: "x",
          type: "button",
          title: "Remover conexão",
          "aria-label": "Remover conexão",
          textContent: "✕",
          onclick: () => {
            P.links = P.links.filter((x) => x !== l);
            changed(true);
          },
        })
      );
    })
  );
  if (!list.length) $("links").replaceChildren(h("li", { className: "empty", textContent: f ? "este neurônio ainda não tem conexões extras" : "nenhuma conexão ainda" }));
  $("lCount").textContent = `${P.links.length}`;
}
$("lFilter").addEventListener("change", renderLinks);
$("addLink").addEventListener("click", () => {
  const a = $("lFrom").value;
  const b = $("lTo").value;
  if (!a || !b) return toast("Crie alguns neurônios antes de ligar.", true);
  if (a === b) return toast("Escolha dois neurônios diferentes.", true);
  if (P.links.some((l) => (l.from === a && l.to === b) || (l.from === b && l.to === a))) return toast("Essa conexão já existe.", true);
  P.links.unshift({ from: a, to: b, why: $("lWhy").value.trim() || "Conexão" });
  $("lWhy").value = "";
  changed(true);
  toast("Conexão criada.");
});

// ---------------------------------------------------------------------------
// Salvar, ver, exportar, apagar
// ---------------------------------------------------------------------------
function save(quiet) {
  const clean = normalizeProfile(P);
  if (!clean.nodes.length && !clean.summary && !clean.role) {
    toast("Adicione pelo menos um neurônio (ou um título) antes de salvar.", true);
    return false;
  }
  const strings = [];
  JSON.stringify(P, (k, v) => (typeof v === "string" && strings.push(v), v));
  const hadContacts = strings.some(hasContacts);
  const saved = saveMine(P);
  if (!saved) {
    toast("Não deu para salvar: o navegador bloqueou o armazenamento local (aba anônima?).", true);
    return false;
  }
  const dropped = saved.nodes.length < P.nodes.length;
  // mantém o editor em sincronia com o que foi guardado (ids únicos, sem e-mail/telefone)
  P = JSON.parse(JSON.stringify(saved));
  fillProfile();
  renderCats();
  renderLinks();
  refresh(true);
  setDirty(false);
  track("criar/salvou", "universo salvo");
  if (!quiet)
    toast(
      hadContacts
        ? "Salvo. E-mails e telefones foram apagados do texto."
        : dropped
          ? "Salvo. Neurônios sem nome foram descartados."
          : "Salvo neste navegador."
    );
  return true;
}
$("saveBtn").addEventListener("click", () => save(false));
$("viewBtn").addEventListener("click", (e) => {
  if (dirty && !save(true)) e.preventDefault();
  else if (!loadMine()) {
    e.preventDefault();
    toast("Salve o seu universo primeiro.", true);
  }
});
$("mvBtn").addEventListener("click", (e) => {
  if (dirty && !save(true)) e.preventDefault();
  else if (!loadMine()) {
    e.preventDefault();
    toast("Salve o seu universo primeiro.", true);
  }
});
$("exportBtn").addEventListener("click", () => {
  const prof = normalizeProfile(P);
  const blob = new Blob([JSON.stringify({ formato: "info.me/universo", versao: 1, exportadoEm: new Date().toISOString(), profile: prof }, null, 2)], {
    type: "application/json",
  });
  const a = h("a", { href: URL.createObjectURL(blob), download: `universo-${uniqueId(prof.name || MY_ID, new Set())}.json` });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast("JSON exportado.");
});
$("againBtn").addEventListener("click", async () => {
  if (dirty && !(await confirmBox("Voltar para importar outro PDF? As alterações não salvas serão perdidas.", "Voltar"))) return;
  dirty = false;
  backToStep1();
});
$("deleteBtn").addEventListener("click", async () => {
  if (!(await confirmBox("Apagar o seu universo deste navegador? Isso não pode ser desfeito (exporte o JSON antes se quiser guardar).", "Apagar"))) return;
  deleteMine();
  dirty = false;
  P = null;
  track("criar/apagou", "universo apagado");
  backToStep1();
  toast("Seu universo foi apagado deste navegador.");
});
window.addEventListener("beforeunload", (e) => {
  if (dirty) {
    e.preventDefault();
    e.returnValue = "";
  }
});

// ---------------------------------------------------------------------------
// Início: com universo salvo, abre direto no editor
// ---------------------------------------------------------------------------
{
  const mine = loadMine();
  if (mine && !/novo/.test(window.location.hash)) openEditor(mine, false);
  else $("resumeBtn").hidden = !mine;
}

// para testes automatizados
window.__criar = {
  get profile() {
    return P && normalizeProfile(P);
  },
  get dirty() {
    return dirty;
  },
  importPdfBytes: (bytes, name = "Profile.pdf") => importPdf(new File([bytes], name, { type: "application/pdf" })),
};
