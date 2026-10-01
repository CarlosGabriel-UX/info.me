// Lê o PDF que o LinkedIn exporta do perfil ("Mais" → "Salvar em PDF") e monta um universo
// no mesmo formato do PROFILE (data.js). Roda só no navegador, com o pdf.js incluído no repositório:
// o arquivo nunca sai do computador da pessoa.
//
// Como funciona:
//  1. extrai os trechos de texto com posição (x, y) e tamanho da fonte;
//  2. separa a coluna lateral (Contato, Principais competências, Idiomas, Certificações, Honors-Awards)
//     da coluna principal (nome, título, local, Resumo, Experiência, Formação acadêmica) pela posição x;
//  3. junta os trechos em linhas e as linhas em seções, reconhecendo os títulos em português e inglês;
//  4. monta regiões, neurônios e conexões com heurísticas (skill citada numa experiência, tema de
//     certificado, formação e experiência na mesma época...).
// PRIVACIDADE: e-mail e telefone são descartados. Do Contato só fica o endereço do LinkedIn, e todo
// texto passa por stripContacts antes de sair daqui.
import { stripContacts, normalizeProfile, cleanLinkedin, uniqueId, PALETTE } from "./meu-universo.js";

const PDFJS = "../vendor/pdfjs/pdf.min.mjs";
const WORKER = new URL("../vendor/pdfjs/pdf.worker.min.mjs", import.meta.url).href;

const norm = (t) =>
  String(t || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

// ---------------------------------------------------------------------------
// 1. Texto com posição
// ---------------------------------------------------------------------------
export async function extractItems(data, onProgress = () => {}) {
  const pdfjs = await import(PDFJS);
  pdfjs.GlobalWorkerOptions.workerSrc = WORKER;
  const task = pdfjs.getDocument({
    data: data instanceof Uint8Array ? data : new Uint8Array(data),
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
    verbosity: 0,
  });
  const doc = await task.promise;
  const items = [];
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    pages.push({ w: vp.width, h: vp.height });
    const tc = await page.getTextContent();
    for (const it of tc.items) {
      if (!it.str || !it.str.trim()) continue;
      const t = it.transform;
      items.push({
        page: p,
        x: t[4],
        y: t[5],
        size: Math.round(Math.hypot(t[2], t[3]) * 4) / 4,
        w: it.width,
        str: it.str,
      });
    }
    onProgress({ page: p, pages: doc.numPages });
  }
  await task.destroy();
  return { items, pages };
}

// ---------------------------------------------------------------------------
// 2 e 3. Colunas, linhas e seções
// ---------------------------------------------------------------------------
const FOOTER = /^(page|pagina|página)\s+\d+\s+(of|de)\s+\d+$/i;

function toLines(items) {
  // agrupa por página e linha de base; dentro da linha, ordena por x
  const sorted = items.slice().sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x);
  const lines = [];
  for (const it of sorted) {
    const last = lines[lines.length - 1];
    if (last && last.page === it.page && Math.abs(last.y - it.y) < Math.max(2, it.size * 0.4)) last.items.push(it);
    else lines.push({ page: it.page, y: it.y, items: [it] });
  }
  return lines
    .map((l) => {
      l.items.sort((a, b) => a.x - b.x);
      let text = "";
      let end = null;
      for (const it of l.items) {
        if (end != null && it.x - end > it.size * 0.15 && !/\s$/.test(text) && !/^\s/.test(it.str)) text += " ";
        text += it.str;
        end = it.x + it.w;
      }
      return {
        page: l.page,
        y: l.y,
        x: l.items[0].x,
        size: Math.max(...l.items.map((i) => i.size)),
        text: text.replace(/\s+/g, " ").trim(),
      };
    })
    .filter((l) => l.text && !FOOTER.test(norm(l.text)));
}

function withGaps(lines) {
  lines.forEach((l, i) => {
    const prev = lines[i - 1];
    l.gap = prev && prev.page === l.page ? prev.y - l.y : Infinity;
  });
  return lines;
}

function modeSize(lines) {
  const count = new Map();
  for (const l of lines) count.set(l.size, (count.get(l.size) || 0) + l.text.length);
  let best = 10;
  let n = -1;
  for (const [s, c] of count) if (c > n) [best, n] = [s, c];
  return best;
}

const MAIN_HEADINGS = {
  summary: ["resumo", "summary", "sobre", "about", "acerca de", "extracto"],
  experience: ["experiencia", "experience", "experiencia profissional", "professional experience"],
  education: ["formacao academica", "education", "formacao", "educacao", "educacion"],
  other: [
    "projetos", "projects", "publicacoes", "publications", "cursos", "courses", "voluntariado",
    "volunteer experience", "experiencia de voluntariado", "organizacoes", "organizations",
    "licencas e certificados", "licenses & certifications", "recomendacoes", "recommendations",
  ],
};
const SIDE_HEADINGS = {
  contact: ["contato", "contact", "contact info", "informacoes de contato", "contacto"],
  skills: ["principais competencias", "top skills", "competencias", "skills", "aptitudes principales"],
  languages: ["idiomas", "languages", "linguas"],
  certs: ["certificacoes", "certifications", "licencas e certificados", "licenses & certifications", "certificaciones"],
  honors: ["honors-awards", "honors & awards", "honors and awards", "premios", "premios e reconhecimentos", "honors", "awards", "reconhecimentos"],
  publications: ["publicacoes", "publications", "publicaciones"],
  patents: ["patentes", "patents"],
};
function headingKind(text, dict) {
  const t = norm(text).replace(/[:·]+$/, "").trim();
  for (const [k, list] of Object.entries(dict)) if (list.includes(t)) return k;
  return null;
}

export function layoutFromItems({ items }) {
  if (!items.length) throw new Error("O PDF não tem texto selecionável (pode ser uma imagem escaneada).");
  const p1 = items.filter((i) => i.page === 1);
  const pool = p1.length ? p1 : items;
  // o nome é o maior texto da primeira página; a coluna principal começa no x dele
  const nameItem = pool.reduce((a, b) => (b.size > a.size ? b : a));
  const mainX = nameItem.x;
  const isSide = (i) => i.x < mainX - 8;
  const side = withGaps(toLines(items.filter(isSide)));
  const main = withGaps(toLines(items.filter((i) => !isSide(i))));
  return { side, main, mainX, nameSize: nameItem.size };
}

// Separa uma coluna em blocos { kind, title, lines } pelos títulos de seção
function sections(lines, dict, minSize) {
  const out = [{ kind: "head", title: "", lines: [] }];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.size >= minSize) {
      // títulos podem quebrar em duas linhas ("Principais" / "competências")
      let text = l.text;
      let kind = headingKind(text, dict);
      const nx = lines[i + 1];
      if (nx && nx.size === l.size && nx.page === l.page && nx.gap < l.size * 1.6) {
        const two = headingKind(`${text} ${nx.text}`, dict);
        if (two || !kind) {
          if (two) {
            kind = two;
            text = `${text} ${nx.text}`;
            i++;
          }
        }
      }
      if (kind) {
        out.push({ kind, title: text, lines: [] });
        continue;
      }
    }
    out[out.length - 1].lines.push(l);
  }
  return out;
}

// Junta linhas que são continuação do mesmo item (quebra de linha estreita na coluna lateral)
function listItems(lines) {
  const res = [];
  for (const l of lines) {
    const prev = res[res.length - 1];
    const cont =
      prev &&
      l.page === prev.page &&
      (l.gap < l.size * 1.28 ||
        /^[a-zà-ú(–—-]/.test(l.text) ||
        /[-–—:,&/]$|\b(de|da|do|e|and|of|for|the|em|in|para)$/i.test(prev.text));
    if (cont) {
      prev.text = /[-/]$/.test(prev.text) && !/\s[-–]$/.test(prev.text) ? prev.text + l.text : `${prev.text} ${l.text}`;
    } else res.push({ text: l.text, page: l.page });
  }
  return res.map((r) => r.text.replace(/\s+/g, " ").trim());
}

function paragraphs(lines) {
  const ps = [];
  for (const l of lines) {
    const prev = ps[ps.length - 1];
    if (prev && !(l.gap > l.size * 1.6)) prev.push(l.text);
    else ps.push([l.text]);
  }
  return ps.map((p) => p.join(" ").replace(/\s+/g, " ").trim()).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Datas ("março de 2023 - o momento (1 ano 7 meses)", "May 2021 - Present", "(2014 - 2018)")
// ---------------------------------------------------------------------------
const MONTHS = {
  janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, fev: 2, feb: 2, mar: 3, abr: 4, apr: 4, mai: 5, jun: 6, jul: 7, ago: 8, aug: 8, set: 9, sep: 9, sept: 9, out: 10, oct: 10, nov: 11, dez: 12, dec: 12,
  enero: 1, febrero: 2, mayo: 5, junio: 6, julio: 7, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};
const PRESENT = /\b(present|presente|o momento|momento|atual|atualmente|current|now|hoje|actualidad)\b/;
const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function stripDateWords(t) {
  return norm(t)
    .replace(/\([^)]*\)/g, " ")
    .replace(PRESENT, " ")
    .replace(/\b(19|20)\d{2}\b/g, " ")
    .replace(/\b[a-z]+\.?/g, (w) => (MONTHS[w.replace(".", "")] || ["de", "of", "o", "a", "to", "ate", "del"].includes(w) ? " " : w))
    .replace(/[-–—·,\s/0-9]/g, "");
}
export function isDateLine(t) {
  return /\b(19|20)\d{2}\b/.test(t) && stripDateWords(t) === "" && (/[-–—]/.test(t) || /\b[a-z]{3,}\b/i.test(t));
}
// devolve { start: {y, m}, end: {y, m} | null (atual) } a partir de um texto com datas
export function parseRange(t) {
  const n = norm(t).replace(/\([^)]*meses?[^)]*\)|\([^)]*months?[^)]*\)|\([^)]*anos?[^)]*\)|\([^)]*years?[^)]*\)/g, " ");
  const parts = n.split(/\s[-–—]\s|\s[-–—]|[-–—]\s|\bto\b|\bate\b/);
  const one = (s) => {
    const y = /\b((?:19|20)\d{2})\b/.exec(s);
    if (!y) return null;
    let m = 0;
    for (const w of s.match(/[a-z]+/g) || []) if (MONTHS[w]) m = MONTHS[w];
    return { y: +y[1], m };
  };
  const start = one(parts[0] || "");
  if (!start) return null;
  const endTxt = parts.slice(1).join(" ");
  const end = PRESENT.test(endTxt) ? null : one(endTxt) || (parts.length > 1 ? null : start);
  return { start, end, present: PRESENT.test(endTxt) };
}
const fmtYM = (d) => (d.m ? `${MES[d.m - 1]}/${d.y}` : `${d.y}`);
export function fmtRange(r) {
  if (!r) return "";
  if (r.present) return `${fmtYM(r.start)} – atual`;
  if (!r.end || (r.end.y === r.start.y && r.end.m === r.start.m)) return fmtYM(r.start);
  return `${fmtYM(r.start)} – ${fmtYM(r.end)}`;
}
const NOW = new Date().getFullYear();
const span = (r) => (r ? [r.start.y + (r.start.m || 1) / 13, r.present ? NOW + 0.99 : (r.end || r.start).y + ((r.end || r.start).m || 12) / 13] : null);

const DURATION = /^\(?\d+\s+(anos?|years?|mes(es)?|months?|meses)\b.*\)?$/i;
const LOCATION_HINT =
  /(,|\bbrasil\b|\bbrazil\b|\bportugal\b|\bremot|\bh[íi]brid|\bhybrid\b|\bárea\b|\barea\b|\bregi[ãa]o\b|\bregion\b|\bunited\b|\bestados unidos\b|\bmetropolitan|\bmetropolitana\b|\bon-?site\b|\bpresencial\b|\be regi[ãa]o\b)/i;
const looksLocation = (t) => t.length < 70 && LOCATION_HINT.test(t) && !/[.!?]$/.test(t) && t.split(" ").length <= 8;

// ---------------------------------------------------------------------------
// Seções da coluna principal
// ---------------------------------------------------------------------------
function parseExperience(lines, body) {
  const big = (l) => l && l.size >= body * 1.08;
  const tight = (l) => l && l.gap < l.size * 1.28; // colada na linha de cima (mesmo bloco)
  const dates = lines.map((l, i) => (isDateLine(l.text) && !big(l) ? i : -1)).filter((i) => i >= 0);
  // cabeçalho de cada cargo: [empresa] [duração total] cargo (1 ou 2 linhas) data
  const heads = dates.map((d) => {
    let start = d - 1;
    const prev = lines[d - 2];
    if (
      prev && !big(prev) && !DURATION.test(prev.text) && !isDateLine(prev.text) && tight(lines[d - 1]) &&
      (big(lines[d - 3]) || DURATION.test(lines[d - 3]?.text || "") || (!tight(prev) && prev.text.length <= 100 && !/[.!?;:]$/.test(prev.text)))
    )
      start = d - 2;
    let s = start;
    if (DURATION.test(lines[s - 1]?.text || "")) s--;
    if (big(lines[s - 1])) s--;
    return { d, roleStart: start, start: Math.max(0, s) };
  });
  return heads.map((h, k) => {
    let ci = -1;
    for (let i = h.roleStart - 1; i >= 0; i--)
      if (big(lines[i])) {
        ci = i;
        break;
      }
    let title = lines
      .slice(Math.max(0, h.roleStart), h.d)
      .map((l) => l.text)
      .join(" ");
    if (big(lines[h.roleStart]) && h.roleStart === h.d - 1) ci = -1; // empresa sem cargo: o título é a própria empresa
    const company = ci >= 0 ? lines[ci].text : "";
    let s = h.d + 1;
    let location = "";
    if (lines[s] && !big(lines[s]) && looksLocation(lines[s].text)) {
      location = lines[s].text;
      s++;
    }
    const e = k + 1 < heads.length ? heads[k + 1].start : lines.length;
    const desc = paragraphs(lines.slice(s, Math.max(s, e)).filter((l) => !big(l) && !DURATION.test(l.text)));
    if (!title) title = company;
    return { title, company, location, range: parseRange(lines[h.d].text), dateText: lines[h.d].text, description: desc.join("\n") };
  });
}

function parseEducation(lines, body) {
  const big = (l) => l.size >= body * 1.08;
  const out = [];
  const anyBig = lines.some(big);
  let cur = null;
  lines.forEach((l, i) => {
    const startsEntry = anyBig ? big(l) : !cur || (/\(\s*(19|20)\d{2}/.test(lines[i - 1]?.text || "") && !/\(\s*(19|20)\d{2}/.test(l.text));
    if (startsEntry) {
      cur = { school: l.text, lines: [] };
      out.push(cur);
    } else if (cur) cur.lines.push(l.text);
  });
  return out.map((e) => {
    const text = e.lines.join(" ").replace(/\s+/g, " ").trim();
    const m = /^(.*?)\s*·?\s*\(([^)]*\d{4}[^)]*)\)\s*$/.exec(text);
    const degree = (m ? m[1] : text).replace(/[·,\s]+$/, "").trim();
    const range = m ? parseRange(m[2]) : /\d{4}/.test(text) ? parseRange(text) : null;
    return { school: e.school, degree, range };
  });
}

// ---------------------------------------------------------------------------
// Dicionário de competências: termos que, citados no texto, viram neurônios
// ---------------------------------------------------------------------------
const T = (label, topic, rx) => ({ label, topic, rx: rx || new RegExp(`(^|[^\\w+#])${label.replace(/[.+#]/g, (c) => "\\" + c)}($|[^\\w+#])`, "i") });
export const TOPICS = {
  dados: "dados",
  nuvem: "nuvem",
  dev: "desenvolvimento",
  web: "web",
  design: "design",
  gestao: "gestão e métodos",
  seguranca: "segurança",
  redes: "redes",
  ia: "IA e machine learning",
  devops: "DevOps",
  office: "ferramentas de escritório",
  suporte: "suporte de TI",
  marketing: "marketing",
  pessoas: "pessoas e comunicação",
};
const SKILLS = [
  T("Python", "dev"), T("Java", "dev", /(^|[^\w])Java($|[^\w]|\s(?!Script))/), T("JavaScript", "web"), T("TypeScript", "web"), T("C#", "dev"), T("C++", "dev"),
  T("Go", "dev", /\b(Golang|Go \(lang\))\b/i), T("Rust", "dev"), T("Kotlin", "dev"), T("Swift", "dev"), T("PHP", "web"), T("Ruby", "dev"), T("R", "dados", /(^|[\s(,])R(?=[\s,).]|$)(?!\$)/),
  T("SQL", "dados", /\bSQL\b(?! ?Server)/i), T("SQL Server", "dados"), T("PostgreSQL", "dados", /\bPostgre(SQL|s)\b/i), T("MySQL", "dados"), T("MongoDB", "dados"), T("Redis", "dados"), T("Oracle", "dados"),
  T("Apache Spark", "dados", /\b(Apache )?Spark\b/i), T("Airflow", "dados"), T("dbt", "dados", /\bdbt\b/), T("Kafka", "dados"), T("Databricks", "dados"), T("Delta Lake", "dados"), T("Snowflake", "dados"), T("BigQuery", "dados"),
  T("Redshift", "dados"), T("pandas", "dados"), T("Power BI", "dados"), T("Tableau", "dados"), T("Looker", "dados"), T("Excel", "office"), T("ETL", "dados"), T("Data Lake", "dados", /\bdata ?lake\b/i),
  T("Modelagem de dados", "dados", /\bmodelagem (de dados|dimensional)\b|\bdata modeling\b/i), T("Estatística", "dados", /\bestat[ií]stic|\bstatistic/i),
  T("Machine Learning", "ia", /\bmachine learning\b|\baprendizado de m[aá]quina\b/i), T("IA generativa", "ia", /\b(gen ?ai|ia generativa|generative ai|llms?)\b/i), T("TensorFlow", "ia"), T("PyTorch", "ia"), T("scikit-learn", "ia"),
  T("AWS", "nuvem", /\bAWS\b|\bAmazon Web Services\b/), T("Azure", "nuvem"), T("Google Cloud", "nuvem", /\b(Google Cloud|GCP)\b/), T("Docker", "devops"), T("Kubernetes", "devops", /\b(Kubernetes|k8s)\b/i), T("Terraform", "devops"),
  T("CI/CD", "devops", /\bCI ?\/ ?CD\b/i), T("GitHub Actions", "devops"), T("Git", "devops", /\bGit\b(?!Hub)/), T("Linux", "devops"), T("Datadog", "devops"), T("Observabilidade", "devops", /\bobservabilidade\b|\bobservability\b/i),
  T("React", "web", /\bReact(\.js)?\b(?! Native)/), T("React Native", "dev"), T("Vue.js", "web", /\bVue(\.js)?\b/), T("Angular", "web"), T("Node.js", "web", /\bNode(\.js)?\b/), T("Next.js", "web"), T("HTML", "web"), T("CSS", "web"),
  T("APIs REST", "web", /\b(REST(ful)?|APIs?)\b/), T("GraphQL", "web"), T("Django", "web"), T("Flask", "web"), T("Spring", "dev", /\bSpring( Boot)?\b/), T(".NET", "dev", /\.NET\b/), T("Testes automatizados", "dev", /\btestes automatizados\b|\bautomated tests?\b|\bunit tests?\b|\btestes unit[aá]rios\b/i),
  T("Figma", "design"), T("Sketch", "design"), T("Adobe XD", "design"), T("Photoshop", "design"), T("Illustrator", "design"), T("Design Systems", "design", /\bdesign systems?\b|\bsistemas? de design\b/i),
  T("User Research", "design", /\buser research\b|\bpesquisa (com usu[aá]rios|de usu[aá]rio|de ux)\b/i), T("Usabilidade", "design", /\busabilidade\b|\busability\b/i), T("Prototipagem", "design", /\bprot[óo]tip|\bprototyp/i),
  T("Acessibilidade", "design", /\bacessibilidade\b|\baccessibility\b|\bWCAG\b/i), T("UX", "design", /\bUX\b/), T("UI", "design", /\bUI\b/), T("Design Sprint", "design", /\bdesign sprints?\b/i),
  T("Scrum", "gestao"), T("Kanban", "gestao"), T("Métodos ágeis", "gestao", /\b[aá]gil\b|\bagile\b|\bmetodologias? [aá]geis\b/i), T("Gestão de projetos", "gestao", /\bgest[ãa]o de projetos\b|\bproject management\b/i), T("Jira", "gestao"),
  T("Product Management", "gestao", /\bproduct (management|owner|manager)\b|\bgest[ãa]o de produto/i), T("OKRs", "gestao", /\bOKRs?\b/),
  T("Segurança da informação", "seguranca", /\bseguran[cç]a da informa[cç][ãa]o\b|\binformation security\b|\bcyber ?security\b|\bciberseguran/i), T("Pentest", "seguranca", /\bpen(etration )?test/i), T("SIEM", "seguranca"), T("Firewall", "seguranca", /\bfirewalls?\b/i), T("ISO 27001", "seguranca", /\bISO ?27001\b/i), T("LGPD", "seguranca"),
  T("Redes de computadores", "redes", /\bredes de computadores\b|\bnetworking\b|\bcomputer networks?\b/i), T("TCP/IP", "redes"), T("Cisco", "redes"), T("VLANs", "redes", /\bVLANs?\b/), T("Roteamento", "redes", /\broteamento\b|\brouting\b/i),
  T("Active Directory", "suporte"), T("Windows Server", "suporte"), T("Suporte técnico", "suporte", /\bsuporte t[eé]cnico\b|\bhelp ?desk\b|\bservice ?desk\b|\btechnical support\b|\bsuporte (a|ao) usu[aá]rios?\b/i), T("ITIL", "suporte"),
  T("SEO", "marketing"), T("Google Analytics", "marketing"), T("Marketing digital", "marketing", /\bmarketing digital\b|\bdigital marketing\b/i), T("Copywriting", "marketing"),
  T("Liderança", "pessoas", /\blideran[cç]a\b|\blider(ei|o|ar)\b|\bleadership\b|\bled a team\b|\blead (user|the)\b/i), T("Mentoria", "pessoas", /\bmentor/i), T("Comunicação", "pessoas", /\bcomunica[cç][ãa]o\b|\bcommunication\b/i),
  T("Code review", "dev", /\bcode review\b|\brevis[ãa]o de c[oó]digo\b/i), T("Treinamentos", "pessoas", /\btreine[il]|\btreinamentos?\b|\btrained\b|\btraining\b/i),
];
const TOPIC_WORDS = {
  dados: /\b(dados|data|analytics|bi|sql|databricks|snowflake|tableau|power bi)\b/i,
  nuvem: /\b(aws|azure|cloud|nuvem|gcp|google cloud)\b/i,
  dev: /\b(developer|desenvolv|programa|software|python|java|engenharia de software)\b/i,
  web: /\b(web|front-?end|back-?end|full ?stack|react|javascript)\b/i,
  design: /\b(ux|ui|design|figma|nielsen|usabilidade|usability)\b/i,
  gestao: /\b(scrum|agile|[aá]gil|pmp|kanban|product owner|cspo|psm|prince2|gest[ãa]o de projetos|project management)\b/i,
  seguranca: /\b(security|seguran[cç]a|comptia|cyber|ciber|ethical hacking|cissp|ceh)\b/i,
  redes: /\b(cisco|ccna|network|redes|tcp)\b/i,
  ia: /\b(machine learning|ia|ai|intelig[eê]ncia artificial|deep learning)\b/i,
  devops: /\b(devops|kubernetes|docker|terraform|ci\/cd|sre)\b/i,
  suporte: /\b(suporte|support|itil|help ?desk|service ?desk)\b/i,
  marketing: /\b(marketing|seo|ads|analytics)\b/i,
};
const ISSUERS = [
  [/\bAWS\b|Amazon Web Services/i, "Amazon Web Services"], [/Microsoft|Azure/i, "Microsoft"], [/Google/i, "Google"], [/Cisco|CCNA|CCNP/i, "Cisco"],
  [/Databricks/i, "Databricks"], [/Scrum\.org|PSM|PSPO/i, "Scrum.org"], [/CSPO|CSM\b|Scrum Alliance/i, "Scrum Alliance"], [/\bSFPC\b|CertiProf/i, "CertiProf"],
  [/Nielsen Norman|NN\/g/i, "Nielsen Norman Group"], [/IBM/i, "IBM"], [/Oracle/i, "Oracle"], [/CompTIA/i, "CompTIA"], [/Senac/i, "Senac"], [/Alura/i, "Alura"],
  [/Fortinet/i, "Fortinet"], [/Salesforce/i, "Salesforce"], [/HubSpot/i, "HubSpot"], [/Meta\b/i, "Meta"], [/Linux Foundation|CKA|CKAD/i, "Linux Foundation"], [/PMI|PMP\b/i, "PMI"],
];
const topicsOf = (t) => Object.keys(TOPIC_WORDS).filter((k) => TOPIC_WORDS[k].test(t));

const LANG_LEVEL = [
  [/native or bilingual|nativo ou bil[ií]ngue|native|nativo/i, "Nativo ou bilíngue"],
  [/full professional|profici[eê]ncia profissional completa|profissional completo/i, "Profissional completo"],
  [/professional working|profici[eê]ncia profissional|profissional/i, "Profissional"],
  [/limited working|profici[eê]ncia profissional limitada|limitad/i, "Profissional limitado"],
  [/elementary|elementar|b[aá]sic/i, "Básico"],
];
const LANG_PT = { english: "Inglês", portuguese: "Português", spanish: "Espanhol", french: "Francês", german: "Alemão", italian: "Italiano", japanese: "Japonês", chinese: "Chinês", mandarin: "Mandarim", korean: "Coreano", russian: "Russo", arabic: "Árabe", dutch: "Holandês", hindi: "Hindi" };

// ---------------------------------------------------------------------------
// 4. Do layout ao universo
// ---------------------------------------------------------------------------
export function profileFromLayout(layout) {
  const { side, main, nameSize } = layout;
  const body = modeSize(main);
  const sideBody = side.length ? modeSize(side) : body;
  const mainSecs = sections(main, MAIN_HEADINGS, body * 1.3);
  const sideSecs = sections(side, SIDE_HEADINGS, sideBody * 1.12);
  const report = { pages: 0, removed: 0, sections: [] };
  const sec = (list, kind) => list.filter((s) => s.kind === kind).flatMap((s) => s.lines);
  report.sections = [...sideSecs, ...mainSecs].filter((s) => s.kind !== "head").map((s) => s.title);

  // Cabeçalho: nome, título (headline) e local
  const head = mainSecs[0].lines;
  const ni = head.findIndex((l) => l.size >= nameSize - 0.5);
  const nameLines = [];
  let i = Math.max(ni, 0);
  while (head[i] && head[i].size >= nameSize - 0.5) nameLines.push(head[i++].text);
  const rest = head.slice(i).map((l) => l.text);
  let location = "";
  if (rest.length > 1 && looksLocation(rest[rest.length - 1])) location = rest.pop();
  else if (rest.length === 1 && looksLocation(rest[0]) && !/[|·]/.test(rest[0])) location = rest.pop();
  const fullName = nameLines.join(" ").replace(/\s+/g, " ").trim();
  const headline = rest.join(" ").replace(/\s+/g, " ").replace(/\s*\|\s*/g, " · ").trim();

  // Contato: só o LinkedIn (o resto, incluindo e-mail e telefone, é descartado)
  const contactRaw = sec(sideSecs, "contact").map((l) => l.text);
  let contact = "";
  contactRaw.forEach((t) => (contact += /[-/]$/.test(contact) ? t : ` ${t}`));
  const liM = /(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/in\/[\w%-]+/i.exec(contact.replace(/\s+(?=[\w%-]*\s*\(LinkedIn\))/i, ""));
  const linkedin = liM ? cleanLinkedin(liM[0]) : "";
  report.removed = contactRaw.length;

  const topSkills = listItems(sec(sideSecs, "skills"));
  const langs = listItems(sec(sideSecs, "languages"));
  const certs = listItems(sec(sideSecs, "certs"));
  const honors = listItems(sec(sideSecs, "honors"));
  const summary = paragraphs(sec(mainSecs, "summary")).join("\n\n");
  const roles = parseExperience(sec(mainSecs, "experience"), body);
  const edus = parseEducation(sec(mainSecs, "education"), body);

  // ---------------- regiões e neurônios ----------------
  const ids = new Set(["__core"]);
  const nodes = [];
  const add = (category, label, detail, status, extra = {}) => {
    label = stripContacts(label).replace(/\s+/g, " ").trim();
    if (!label) return null;
    const n = { id: uniqueId(label, ids), label: label.slice(0, 120), category };
    ids.add(n.id);
    if (detail) n.detail = stripContacts(detail);
    if (status) n.status = status;
    nodes.push(Object.assign(n, { _: extra }));
    return n;
  };

  const expNodes = roles.map((r) => {
    const company = r.company && r.company !== r.title ? r.company : "";
    const detail = [company, r.location].filter(Boolean).join(" · ") + (r.description ? `${company || r.location ? ". " : ""}${r.description}` : "");
    return add("experiencia", r.title || company || "Experiência", detail, fmtRange(r.range), {
      text: `${r.title} ${r.description}`,
      span: span(r.range),
      company,
    });
  }).filter(Boolean);
  const eduNodes = edus.map((e) =>
    add("formacao", e.degree || e.school, e.degree ? e.school : "", fmtRange(e.range), { text: `${e.degree} ${e.school}`, span: span(e.range) })
  ).filter(Boolean);
  const certNodes = certs.map((c) => {
    const iss = ISSUERS.find(([rx]) => rx.test(c));
    return add("certs", c, iss ? iss[1] : "Certificação listada no LinkedIn", "", { text: c, topics: topicsOf(c) });
  }).filter(Boolean);
  const honorNodes = honors.map((h) => add("premios", h, "Prêmio ou reconhecimento listado no LinkedIn", (/\b(19|20)\d{2}\b/.exec(h) || [""])[0], { text: h })).filter(Boolean);

  // competências: as "principais" do LinkedIn + as citadas no texto (dicionário)
  const allText = [headline, summary, ...roles.map((r) => `${r.title} ${r.description}`), ...certs, ...edus.map((e) => e.degree)].join("\n");
  const skillNodes = [];
  const skillKey = new Set();
  topSkills.forEach((s) => {
    const dict = SKILLS.find((d) => d.rx.test(s) || norm(d.label) === norm(s));
    const n = add("competencias", s, "Uma das principais competências no LinkedIn", "Principal competência", { rx: dict ? dict.rx : null, topic: dict ? dict.topic : null, label: s });
    if (n) {
      skillNodes.push(n);
      skillKey.add(norm(s));
      if (dict) skillKey.add(norm(dict.label));
    }
  });
  const found = SKILLS.map((d) => ({ d, hits: (allText.match(new RegExp(d.rx.source, d.rx.flags.includes("g") ? d.rx.flags : d.rx.flags + "g")) || []).length }))
    .filter((f) => f.hits && !skillKey.has(norm(f.d.label)))
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 22);
  const toolNodes = found.map(({ d, hits }) =>
    add(d.topic === "pessoas" || d.topic === "gestao" ? "competencias" : "ferramentas", d.label, `Citada ${hits === 1 ? "uma vez" : `${hits} vezes`} no currículo`, "", { rx: d.rx, topic: d.topic })
  ).filter(Boolean);
  skillNodes.push(...toolNodes.filter((n) => n.category === "competencias"));
  const tools = toolNodes.filter((n) => n.category === "ferramentas");

  const langNodes = langs.map((l) => {
    const m = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(l);
    const nameRaw = (m ? m[1] : l).trim();
    const lvl = m ? (LANG_LEVEL.find(([rx]) => rx.test(m[2])) || [null, m[2]])[1] : "";
    const name = LANG_PT[norm(nameRaw)] || nameRaw;
    return add("idiomas", name, "", lvl, { text: `${nameRaw} ${name}` });
  }).filter(Boolean);

  // regiões que realmente têm neurônios, com cores bem distintas
  const CATS = [
    ["formacao", "Formação", "#60a5fa"],
    ["certs", "Certificados", "#facc15"],
    ["experiencia", "Experiência", "#34d399"],
    ["competencias", "Competências", "#f472b6"],
    ["ferramentas", "Ferramentas & tecnologias", "#22d3ee"],
    ["idiomas", "Idiomas", "#e879f9"],
    ["premios", "Prêmios", "#fb923c"],
  ];
  const used = new Set(nodes.map((n) => n.category));
  const categories = CATS.filter(([id]) => used.has(id)).map(([id, label, color]) => ({ id, label, color }));
  if (!categories.length) categories.push({ id: "perfil", label: "Perfil", color: PALETTE[0] });

  // ---------------- conexões ----------------
  const links = [];
  const linked = new Set();
  const has = new Set();
  const link = (a, b, why) => {
    if (!a || !b || a === b) return false;
    const k = [a.id, b.id].sort().join("|");
    if (has.has(k)) return false;
    has.add(k);
    links.push({ from: a.id, to: b.id, why: stripContacts(why) });
    linked.add(a.id).add(b.id);
    return true;
  };
  const mentions = (n, text) => {
    if (n._.rx) return n._.rx.test(text);
    const t = norm(n.label);
    return t.length > 2 && norm(text).includes(t);
  };
  const where = (e) => (e._.company ? `${e.label} · ${e._.company}` : e.label);
  const byRecent = expNodes.slice().sort((a, b) => ((b._.span || [0, 0])[1] - (a._.span || [0, 0])[1]) || ((b._.span || [0])[0] - (a._.span || [0])[0]));
  const latest = byRecent[0] || eduNodes[0] || null;

  // skill citada numa experiência
  [...skillNodes, ...tools].forEach((s) =>
    expNodes.forEach((e) => {
      if (mentions(s, e._.text)) link(s, e, `Usada como ${where(e)}`);
    })
  );
  // skill citada no nome de um certificado ou de uma formação
  [...skillNodes, ...tools].forEach((s) => {
    certNodes.forEach((c) => mentions(s, c.label) && link(c, s, "Tema do certificado"));
    eduNodes.forEach((e) => mentions(s, e._.text) && link(e, s, "Estudada na formação"));
  });
  // certificado -> tema do emissor (mesma área de uma ferramenta, competência ou experiência)
  certNodes.forEach((c, ci) => {
    let n = 0;
    for (const t of c._.topics) {
      // varia as escolhas entre certificados para não ligar todos aos mesmos neurônios
      const sameTopic = tools.concat(skillNodes).filter((s) => s._.topic === t);
      const pick = sameTopic.length ? [sameTopic[(ci * 2) % sameTopic.length], sameTopic[(ci * 2 + 1) % sameTopic.length]] : [];
      for (const s of pick) if (link(c, s, `Mesma área: ${TOPICS[t] || t}`)) n++;
      const e = byRecent.find((x) => topicsOf(x._.text).includes(t));
      if (e && link(c, e, `Certificado de ${TOPICS[t] || t}, usado como ${where(e)}`)) n++;
      if (n >= 3) break;
    }
  });
  // formação -> experiências da mesma época (ou a primeira depois dela)
  eduNodes.forEach((ed) => {
    const s = ed._.span;
    if (!s) return;
    const same = expNodes.filter((e) => e._.span && e._.span[0] < s[1] && e._.span[1] > s[0]);
    same.forEach((e) => {
      const a = Math.floor(Math.max(s[0], e._.span[0]));
      const b = Math.min(Math.floor(Math.min(s[1], e._.span[1])), NOW);
      link(ed, e, `Na mesma época (${a === b ? a : `${a}–${b}`})`);
    });
    if (!same.length) {
      const next = expNodes.filter((e) => e._.span && e._.span[0] >= s[1] - 0.5).sort((a, b) => a._.span[0] - b._.span[0])[0];
      if (next) link(ed, next, `Formação que abriu caminho para ${where(next)}`);
    }
  });
  // carreira: cada experiência liga à anterior
  const chrono = expNodes.filter((e) => e._.span).sort((a, b) => a._.span[0] - b._.span[0]);
  chrono.forEach((e, k) => k && link(chrono[k - 1], e, chrono[k - 1]._.company && chrono[k - 1]._.company === e._.company ? "Promoção na mesma empresa" : "Próximo passo da carreira"));
  // idiomas: citados numa experiência, senão ligados à experiência mais recente
  langNodes.forEach((l) => {
    const e = expNodes.find((x) => norm(x._.text).includes(norm(l.label)));
    if (e) link(l, e, `Idioma usado como ${where(e)}`);
  });
  // prêmios: na experiência do mesmo ano
  honorNodes.forEach((h) => {
    const y = +(h.status || 0);
    const e = y && expNodes.find((x) => x._.span && x._.span[0] <= y + 1 && x._.span[1] >= y);
    if (e) link(h, e, `Conquistado como ${where(e)}`);
  });
  // sem órfãos: quem sobrou liga a um centro que faça sentido
  const hubFor = (n) => {
    if (n.category === "idiomas") return latest && [latest, n.status === "Nativo ou bilíngue" ? "Língua do dia a dia" : "Idioma do perfil profissional"];
    if (n.category === "certs") return (latest || eduNodes[0]) && [latest || eduNodes[0], "Formação complementar"];
    if (n.category === "premios") return latest && [latest, "Reconhecimento na carreira"];
    if (n.category === "formacao") return latest && latest !== n && [latest, "Base da carreira"];
    if (n.category === "experiencia") return eduNodes[0] && [eduNodes[0], "Formação e prática"];
    return latest && latest !== n && [latest, "Competência em destaque no perfil"];
  };
  nodes.forEach((n) => {
    if (linked.has(n.id)) return;
    const h = hubFor(n);
    if (h && h[0]) link(n, h[0], h[1]);
    else {
      const other = nodes.find((o) => o !== n && o.category === n.category) || nodes.find((o) => o !== n);
      if (other) link(n, other, "Faz parte do mesmo perfil");
    }
  });

  // ---------------- linha do tempo ----------------
  const steps = [...eduNodes, ...expNodes]
    .filter((n) => n._.span)
    .sort((a, b) => a._.span[0] - b._.span[0])
    .slice(-8)
    .map((n) => ({
      when: String(Math.floor(n._.span[0])),
      title: n.category === "experiencia" ? where(n) : n.label,
      ids: [n.id, ...links.filter((l) => l.from === n.id || l.to === n.id).map((l) => (l.from === n.id ? l.to : l.from))].filter(
        (id) => !expNodes.some((e) => e.id === id && e !== n)
      ).slice(0, 8),
    }));

  const words = fullName.split(/\s+/).filter(Boolean);
  const profile = normalizeProfile({
    name: words.length > 2 ? `${words[0]} ${words[words.length - 1]}` : fullName,
    fullName,
    role: headline,
    location,
    linkedin,
    summary,
    categories,
    nodes: nodes.map(({ _, ...n }) => n),
    links,
    timeline: steps,
  });
  report.counts = {
    experiencias: expNodes.length,
    formacoes: eduNodes.length,
    certificados: certNodes.length,
    competencias: skillNodes.length + tools.length,
    idiomas: langNodes.length,
    premios: honorNodes.length,
  };
  return { profile, report };
}

// Atalho: bytes do PDF -> { profile, report }
export async function parseLinkedInPdf(data, onProgress) {
  const ex = await extractItems(data, onProgress);
  const layout = layoutFromItems(ex);
  const res = profileFromLayout(layout);
  res.report.pages = ex.pages.length;
  if (!res.profile.nodes.length && !res.profile.summary)
    throw new Error("Não reconheci as seções do LinkedIn neste PDF. Ele foi gerado em Mais → Salvar em PDF no seu perfil?");
  return res;
}
