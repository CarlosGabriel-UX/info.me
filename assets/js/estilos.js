// Estilos visuais de um universo: a mesma lista de regiões, neurônios e conexões
// pode aparecer como um cérebro, um sistema solar, um céu de constelações, uma placa de circuito...
// Este arquivo só tem a lista e a validação (sem three.js); o desenho 3D fica em estilos-3d.js.

export const STYLES = [
  { id: "neural", name: "Mente neural", short: "neural", desc: "Um cérebro de partículas com neurônios e sinapses.", icon: "🧠" },
  { id: "solar", name: "Sistema solar", short: "solar", desc: "Você é a estrela; cada região é um planeta e os itens são luas.", icon: "☀" },
  { id: "constelacao", name: "Constelação", short: "constelação", desc: "Estrelas num céu escuro, cada região uma constelação com sua nebulosa.", icon: "✦" },
  { id: "circuito", name: "Placa de circuito", short: "circuito", desc: "Chips, componentes e trilhas de cobre com pulsos de dados.", icon: "▣" },
  { id: "atomo", name: "Átomo", short: "átomo", desc: "Um núcleo com órbitas de elétrons, uma camada por região.", icon: "⚛" },
];
export const DEFAULT_STYLE = "neural";

const plain = (t) =>
  String(t || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
// apelidos aceitos no terminal e em JSON importado
const ALIASES = {
  cerebro: "neural", mente: "neural", brain: "neural",
  sol: "solar", sistema: "solar", planetas: "solar", "sistema-solar": "solar",
  constelacoes: "constelacao", estrelas: "constelacao", ceu: "constelacao", constellation: "constelacao",
  circuit: "circuito", placa: "circuito", pcb: "circuito", chip: "circuito",
  atom: "atomo", nucleo: "atomo",
};

// devolve o id de um estilo válido, ou null
export function findStyle(name) {
  const q = plain(name).replace(/\s+/g, "-");
  if (!q) return null;
  const id = ALIASES[q] || q;
  return STYLES.find((s) => s.id === id) ? id : null;
}
// sempre um estilo válido (o padrão quando vier qualquer outra coisa)
export const normalizeStyle = (name) => findStyle(name) || DEFAULT_STYLE;
export const styleById = (id) => STYLES.find((s) => s.id === id) || STYLES[0];
