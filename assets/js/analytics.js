// Contador de visitas e de uso dos comandos, com GoatCounter (gratuito, sem cookies).
// Só liga quando PROFILE.analytics.goatcounter tem o código da conta (ex.: "carlosgabriel").
// Visitas aparecem no painel como páginas; comandos e cliques como eventos ("cmd/help", "click/cv").
import { PROFILE as P } from "./data.js";

const code = (P.analytics && P.analytics.goatcounter) || "";
const base = code ? `https://${code}.goatcounter.com` : "";
const local = /^(localhost|127\.|0\.0\.0\.0)/.test(location.hostname) || location.protocol === "file:";

export const enabled = !!code && !local;

if (enabled) {
  const s = document.createElement("script");
  s.async = true;
  s.src = "https://gc.zgo.at/count.js";
  s.dataset.goatcounter = `${base}/count`;
  document.head.appendChild(s);
}

// eventos que chegam antes do script carregar ficam na fila
const queue = [];
function flush() {
  if (!window.goatcounter || !window.goatcounter.count) return false;
  while (queue.length) window.goatcounter.count(queue.shift());
  return true;
}
const clean = (t) => String(t).toLowerCase().normalize("NFD").replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "").slice(0, 30);

export function track(path, title) {
  if (!enabled) return;
  queue.push({ path: path.split("/").map(clean).join("/"), title: title || path, event: true });
  if (!flush()) setTimeout(flush, 1500);
}

// total de visitantes únicos; precisa da opção "Allow adding visitor counts on your website" ligada no GoatCounter
export async function totalVisits() {
  if (!code) return null;
  try {
    const r = await fetch(`${base}/counter/TOTAL.json`);
    if (!r.ok) return null;
    const j = await r.json();
    return j.count_unique || j.count || null;
  } catch (e) {
    return null;
  }
}
