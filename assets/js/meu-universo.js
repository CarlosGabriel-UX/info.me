// O universo da própria pessoa: criado em criar.html (a partir do PDF do LinkedIn ou do zero)
// e guardado só neste navegador (localStorage). Contas e compartilhamento ficam para a próxima fase.
//
// Tudo que entra ou sai daqui passa por normalizeProfile: o perfil fica no mesmo formato do PROFILE
// (data.js), com ids únicos, cores válidas, ligações só entre neurônios que existem e SEM e-mail
// nem telefone em nenhum texto.

import { normalizeStyle } from "./estilos.js";

export const MY_ID = "meu";
export const STORAGE_KEY = "infome-meu-universo";

// Cores bem distintas para as regiões (neon sobre fundo preto)
export const PALETTE = ["#60a5fa", "#facc15", "#34d399", "#22d3ee", "#e879f9", "#fb923c", "#f43f5e", "#a78bfa", "#4ade80", "#f472b6", "#38bdf8", "#fbbf24"];

// Posições das regiões dentro do cérebro 3D (as mesmas dos universos de exemplo)
const POS = [
  [0, 2.2, 1.6],
  [2.6, 1.2, 0.6],
  [-2.8, 0.6, 0.8],
  [0.4, 0.4, -2.6],
  [3.0, -0.8, -1.4],
  [-2.4, -1.2, -1.8],
  [-0.6, -1.6, 2.4],
  [1.8, -1.9, 1.8],
];
export function regionPos(i) {
  if (i < POS.length) return POS[i].slice();
  // mais de 8 regiões: pontos espalhados numa esfera (espiral de Fibonacci)
  const k = i - POS.length + 0.5;
  const y = 1 - (2 * ((k * 0.381966) % 1));
  const r = Math.sqrt(1 - y * y);
  const a = k * 2.399963;
  return [Math.cos(a) * r * 2.8, y * 1.9, Math.sin(a) * r * 2.4].map((v) => Math.round(v * 100) / 100);
}

// ---------------------------------------------------------------------------
// Privacidade: e-mail e telefone nunca ficam guardados
// ---------------------------------------------------------------------------
const EMAIL = /[\w.+%-]+\s*(?:@|\(at\)|\[at\])\s*[\w-]+(?:-\s+[\w-]+)?(?:\.[\w-]+)+/gi;
// rede de segurança: qualquer pedaço com "@" seguido de texto (e-mail quebrado em duas linhas, por exemplo)
const AT_TOKEN = /\S*@\S*\w\S*/g;
const PHONE_LABEL = /\((?:mobile|celular|cel|home|casa|work|trabalho|comercial|telefone|phone|whatsapp)\)/gi;
// candidatos a telefone: dígitos com espaços, pontos, traços e parênteses
const PHONE = /(?:\+\s?\d{1,3}[\s.-]?)?(?:\(\s?\d{1,4}\s?\)[\s.-]?)?\d[\d\s.-]{5,}\d/g;
const isYear = (g) => /^(19|20)\d{2}$/.test(g);
function looksLikePhone(s) {
  const groups = s.match(/\d+/g) || [];
  const digits = groups.join("").length;
  if (digits < 8 || digits > 15) return false;
  // "2014 - 2018", "03/2020 - 05/2022": anos (e meses) não são telefone
  if (groups.every((g) => isYear(g) || g.length <= 2)) return false;
  // valores com separador de milhar (1.200.000) também não
  if (/^\d{1,3}(?:[.,]\d{3})+$/.test(s.trim())) return false;
  if (/^\+/.test(s.trim())) return true;
  // um telefone tem pelo menos um bloco de 3+ dígitos que não é ano
  return groups.some((g) => g.length >= 3 && !isYear(g));
}
export function stripContacts(text) {
  if (text == null) return "";
  let t = String(text)
    .replace(EMAIL, " ")
    .replace(AT_TOKEN, " ")
    .replace(PHONE, (m) => (looksLikePhone(m) ? " " : m))
    .replace(PHONE_LABEL, " ");
  // limpa o que sobrou: "e-mail ou telefone ." -> "e-mail ou telefone."
  t = t.replace(/[ \t]+([.,;:!?)])/g, "$1").replace(/[:;,]+\./g, ".").replace(/\(\s*\)/g, "").replace(/[ \t]{2,}/g, " ");
  return t
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
export function hasContacts(text) {
  const t = String(text || "");
  EMAIL.lastIndex = AT_TOKEN.lastIndex = 0;
  if (EMAIL.test(t) || AT_TOKEN.test(t)) return true;
  return (t.match(PHONE) || []).some(looksLikePhone);
}

// ---------------------------------------------------------------------------
// Normalização
// ---------------------------------------------------------------------------
export function slug(t) {
  return (
    String(t || "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "item"
  );
}
export function uniqueId(base, taken) {
  let id = slug(base);
  if (id.startsWith("__")) id = id.replace(/^_+/, "");
  if (!taken.has(id)) return id;
  for (let i = 2; ; i++) if (!taken.has(`${id}-${i}`)) return `${id}-${i}`;
}
const str = (v, max = 2000) => stripContacts(typeof v === "string" ? v : v == null ? "" : String(v)).slice(0, max);
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const LINKEDIN = /^(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/in\/([\w%-]{2,100})\/?$/i;

export function cleanLinkedin(url) {
  const m = LINKEDIN.exec(String(url || "").trim());
  return m ? `https://linkedin.com/in/${m[1]}` : "";
}

export function normalizeProfile(raw) {
  const p = raw && typeof raw === "object" ? raw : {};
  const out = {
    name: str(p.name, 80) || str(p.fullName, 80).split(/\s+/).slice(0, 2).join(" ") || "Meu universo",
    fullName: "",
    role: str(p.role, 220).replace(/\s*\n\s*/g, " "),
    location: str(p.location, 120),
    summary: str(p.summary, 3000),
    style: normalizeStyle(p.style),
    categories: [],
    nodes: [],
    links: [],
    timeline: [],
  };
  out.fullName = str(p.fullName, 120) || out.name;
  const li = cleanLinkedin(p.linkedin);
  if (li) out.linkedin = li;

  const catIds = new Set();
  (Array.isArray(p.categories) ? p.categories : []).slice(0, 16).forEach((c, i) => {
    if (!c || typeof c !== "object") return;
    const label = str(c.label, 60) || `Região ${i + 1}`;
    const id = uniqueId(c.id || label, catIds);
    catIds.add(id);
    out.categories.push({
      id,
      label,
      color: HEX.test(c.color || "") ? c.color.toLowerCase() : PALETTE[out.categories.length % PALETTE.length],
      pos: null,
    });
  });
  if (!out.categories.length) out.categories.push({ id: "perfil", label: "Perfil", color: PALETTE[0], pos: null });
  out.categories.forEach((c, i) => (c.pos = regionPos(i)));
  // ids antigos de região (antes de virar único) -> id final
  const catMap = new Map();
  (Array.isArray(p.categories) ? p.categories : []).forEach((c, i) => c && out.categories[i] && catMap.set(c.id, out.categories[i].id));

  const nodeIds = new Set(["__core"]);
  const idMap = new Map();
  (Array.isArray(p.nodes) ? p.nodes : []).slice(0, 300).forEach((n) => {
    if (!n || typeof n !== "object") return;
    const label = str(n.label, 120);
    if (!label) return;
    const cat = catMap.get(n.category) || (catIds.has(n.category) ? n.category : null);
    if (!cat) return;
    const id = uniqueId(n.id || label, nodeIds);
    nodeIds.add(id);
    if (n.id != null && !idMap.has(n.id)) idMap.set(n.id, id);
    const node = { id, label, category: cat };
    const detail = str(n.detail, 1200);
    const status = str(n.status, 80);
    if (detail) node.detail = detail;
    if (status) node.status = status;
    out.nodes.push(node);
  });
  const real = (id) => idMap.get(id) || null;

  const seen = new Set();
  (Array.isArray(p.links) ? p.links : []).slice(0, 600).forEach((l) => {
    if (!l || typeof l !== "object") return;
    const a = real(l.from);
    const b = real(l.to);
    if (!a || !b || a === b) return;
    const key = [a, b].sort().join("|");
    if (seen.has(key)) return;
    seen.add(key);
    out.links.push({ from: a, to: b, why: str(l.why, 200) || "Conexão" });
  });

  (Array.isArray(p.timeline) ? p.timeline : []).slice(0, 20).forEach((t) => {
    if (!t || typeof t !== "object") return;
    const ids = (Array.isArray(t.ids) ? t.ids : []).map(real).filter(Boolean);
    const title = str(t.title, 120);
    if (title && ids.length) out.timeline.push({ when: str(t.when, 30) || "·", title, ids });
  });
  return out;
}

// ---------------------------------------------------------------------------
// localStorage (pode falhar em aba anônima, com cookies bloqueados etc.)
// ---------------------------------------------------------------------------
export function loadMine() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    const prof = normalizeProfile(data && data.profile ? data.profile : data);
    return prof.nodes.length || prof.summary || prof.role ? prof : null;
  } catch (e) {
    return null;
  }
}
export function saveMine(profile) {
  try {
    const prof = normalizeProfile(profile);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 1, savedAt: new Date().toISOString(), profile: prof }));
    return prof;
  } catch (e) {
    return null;
  }
}
export function deleteMine() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    return true;
  } catch (e) {
    return false;
  }
}
export function savedAt() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw).savedAt || null : null;
  } catch (e) {
    return null;
  }
}
