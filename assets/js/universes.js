// Multiverso: cada pessoa tem o seu "universo", um mapa neural no mesmo formato do PROFILE (data.js).
// O universo do Carlos vem do currículo de verdade; os outros são perfis FICTÍCIOS de exemplo,
// só para mostrar como o multiverso fica com várias pessoas. Nada de telefone ou e-mail aqui.
//
// O mapa (index.html) escolhe o perfil pelo hash: index.html#u=demo-dev. Sem hash, é o do Carlos.
import { PROFILE } from "./data.js";

// Posições das regiões dentro do cérebro 3D (mesmo espaço usado em data.js)
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
const cats = (list) => list.map(([id, label, color], i) => ({ id, label, color, pos: POS[i % POS.length] }));
const N = (category, items) => items.map(([id, label, detail, status]) => ({ id, label, category, detail, status }));

const DEV = {
  name: "Rafa Vetor",
  fullName: "Rafa Vetor (perfil de exemplo)",
  role: "Dev Full Stack · Web, APIs & Nuvem",
  location: "Cidade Exemplo/BR",
  summary:
    "Perfil fictício de exemplo. Dev full stack que gosta de interfaces rápidas, APIs bem desenhadas e deploy sem sustos. Este universo existe só para demonstrar o multiverso.",
  categories: cats([
    ["formacao", "Formação", "#60a5fa"],
    ["certs", "Certificados", "#facc15"],
    ["frontend", "Front-end", "#22d3ee"],
    ["backend", "Back-end", "#34d399"],
    ["nuvem", "Nuvem & DevOps", "#a78bfa"],
    ["dados", "Bancos de dados", "#fb923c"],
    ["perfil", "Perfil", "#f472b6"],
  ]),
  nodes: [
    ...N("formacao", [
      ["ads", "Análise e Desenvolvimento de Sistemas", "Faculdade Exemplo", "Concluído"],
      ["bootcamp", "Bootcamp de Web", "Escola Fictícia de Código", "Concluído"],
    ]),
    ...N("certs", [
      ["cert-cloud", "Certificação de Nuvem (fundamentos)", "Certificado de exemplo", "2025"],
      ["cert-k8s", "Kubernetes para devs", "Certificado de exemplo", "Em andamento"],
    ]),
    ...N("frontend", [
      ["js", "JavaScript", "ES modules, async, DOM"],
      ["ts", "TypeScript"],
      ["react", "React", "Componentes, hooks e estado"],
      ["css", "CSS moderno", "Grid, flexbox e animações"],
      ["a11y", "Acessibilidade", "WAI-ARIA e navegação por teclado"],
      ["webgl", "WebGL / three.js", "Cenas 3D no navegador"],
    ]),
    ...N("backend", [
      ["node", "Node.js"],
      ["rest", "APIs REST", "Versionamento e documentação"],
      ["graphql", "GraphQL"],
      ["auth", "Autenticação", "OAuth e sessões"],
      ["tests", "Testes automatizados", "Unitários e ponta a ponta"],
    ]),
    ...N("nuvem", [
      ["docker", "Docker"],
      ["k8s", "Kubernetes"],
      ["ci", "CI/CD", "Pipelines de build e deploy"],
      ["obs", "Observabilidade", "Logs, métricas e alertas"],
    ]),
    ...N("dados", [
      ["pg", "PostgreSQL"],
      ["redis", "Redis", "Cache e filas"],
      ["mongo", "MongoDB"],
    ]),
    ...N("perfil", [
      ["code-review", "Code review", "Revisões gentis e objetivas"],
      ["mentoria", "Mentoria", "Ajuda quem está começando"],
      ["produto", "Visão de produto"],
    ]),
  ],
  timeline: [
    { when: "início", title: "Primeiros sites em HTML e CSS", ids: ["css", "js"] },
    { when: "faculdade", title: "Análise e Desenvolvimento de Sistemas", ids: ["ads", "pg", "rest"] },
    { when: "bootcamp", title: "Bootcamp de Web", ids: ["bootcamp", "react", "node", "ts"] },
    { when: "1º emprego", title: "APIs em produção", ids: ["graphql", "auth", "tests", "redis", "mongo"] },
    { when: "nuvem", title: "Containers e pipelines", ids: ["docker", "ci", "cert-cloud", "obs"] },
    { when: "agora", title: "Kubernetes e mentoria", ids: ["k8s", "cert-k8s", "mentoria", "code-review", "produto", "a11y", "webgl"] },
  ],
  links: [
    { from: "ts", to: "js", why: "TypeScript é JavaScript com tipos" },
    { from: "react", to: "ts", why: "Componentes tipados" },
    { from: "react", to: "a11y", why: "Componentes acessíveis" },
    { from: "webgl", to: "js", why: "three.js roda em JavaScript" },
    { from: "node", to: "js", why: "Mesma linguagem no servidor" },
    { from: "rest", to: "node", why: "APIs escritas em Node.js" },
    { from: "graphql", to: "react", why: "Consumo de dados no front-end" },
    { from: "auth", to: "rest", why: "Rotas protegidas" },
    { from: "tests", to: "ci", why: "Testes rodam a cada push" },
    { from: "docker", to: "k8s", why: "Containers orquestrados" },
    { from: "cert-k8s", to: "k8s", why: "Estudo formal de Kubernetes" },
    { from: "cert-cloud", to: "docker", why: "Fundamentos de nuvem" },
    { from: "pg", to: "rest", why: "Persistência das APIs" },
    { from: "redis", to: "node", why: "Cache das respostas" },
    { from: "obs", to: "k8s", why: "Monitoramento do cluster" },
    { from: "bootcamp", to: "react", why: "Foco do bootcamp" },
    { from: "ads", to: "pg", why: "Modelagem de dados na faculdade" },
    { from: "code-review", to: "tests", why: "Qualidade antes do merge" },
    { from: "mentoria", to: "code-review", why: "Revisão também ensina" },
  ],
};

const DESIGN = {
  name: "Bia Paleta",
  fullName: "Bia Paleta (perfil de exemplo)",
  role: "Product Designer · UX, UI & Design Systems",
  location: "Cidade Exemplo/BR",
  summary:
    "Perfil fictício de exemplo. Designer de produto que pesquisa antes de desenhar, cuida de sistemas de design e adora um protótipo animado. Este universo existe só para demonstrar o multiverso.",
  categories: cats([
    ["formacao", "Formação", "#93c5fd"],
    ["certs", "Certificados", "#fde047"],
    ["ux", "Pesquisa & UX", "#f472b6"],
    ["ui", "Interface", "#c084fc"],
    ["sistemas", "Design System", "#2dd4bf"],
    ["motion", "Motion & 3D", "#fb7185"],
    ["ferramentas", "Ferramentas", "#fdba74"],
  ]),
  nodes: [
    ...N("formacao", [
      ["design-grad", "Design Gráfico", "Universidade Exemplo", "Concluído"],
      ["ux-pos", "Especialização em UX", "Instituto Fictício", "Em andamento"],
    ]),
    ...N("certs", [
      ["cert-ux", "Fundamentos de UX", "Certificado de exemplo", "2024"],
      ["cert-a11y", "Acessibilidade digital", "Certificado de exemplo", "2025"],
    ]),
    ...N("ux", [
      ["entrevistas", "Entrevistas com usuários"],
      ["personas", "Personas e jornadas"],
      ["testes-usab", "Testes de usabilidade"],
      ["arq-info", "Arquitetura de informação"],
      ["metricas", "Métricas de produto"],
    ]),
    ...N("ui", [
      ["tipografia", "Tipografia"],
      ["cor", "Teoria das cores"],
      ["grid", "Grids e layout"],
      ["icones", "Iconografia"],
      ["acess", "Contraste e acessibilidade"],
    ]),
    ...N("sistemas", [
      ["tokens", "Design tokens"],
      ["componentes", "Biblioteca de componentes"],
      ["docs", "Documentação de padrões"],
    ]),
    ...N("motion", [
      ["microint", "Microinterações"],
      ["proto", "Protótipos animados"],
      ["3d", "Modelagem 3D básica"],
    ]),
    ...N("ferramentas", [
      ["editor-vetor", "Editor de interface vetorial"],
      ["whiteboard", "Quadro colaborativo"],
      ["html-css", "HTML e CSS", "Para conversar melhor com devs"],
    ]),
  ],
  timeline: [
    { when: "início", title: "Design Gráfico", ids: ["design-grad", "tipografia", "cor", "grid", "icones"] },
    { when: "virada", title: "Primeiro projeto digital", ids: ["arq-info", "editor-vetor", "html-css"] },
    { when: "UX", title: "Pesquisa com usuários", ids: ["entrevistas", "personas", "testes-usab", "cert-ux"] },
    { when: "escala", title: "Design system do produto", ids: ["tokens", "componentes", "docs", "acess", "cert-a11y"] },
    { when: "agora", title: "Motion, métricas e especialização", ids: ["microint", "proto", "3d", "metricas", "whiteboard", "ux-pos"] },
  ],
  links: [
    { from: "entrevistas", to: "personas", why: "Personas nascem das entrevistas" },
    { from: "personas", to: "arq-info", why: "Navegação pensada para quem usa" },
    { from: "testes-usab", to: "proto", why: "Testes rodam em cima dos protótipos" },
    { from: "tokens", to: "cor", why: "A paleta vira tokens" },
    { from: "tokens", to: "tipografia", why: "Escala tipográfica em tokens" },
    { from: "componentes", to: "tokens", why: "Componentes consomem os tokens" },
    { from: "docs", to: "componentes", why: "Cada componente tem sua página" },
    { from: "acess", to: "cor", why: "Contraste mínimo entre cores" },
    { from: "cert-a11y", to: "acess", why: "Estudo formal de acessibilidade" },
    { from: "cert-ux", to: "testes-usab", why: "Métodos de avaliação" },
    { from: "microint", to: "componentes", why: "Estados animados dos componentes" },
    { from: "html-css", to: "componentes", why: "Ponte entre design e código" },
    { from: "metricas", to: "testes-usab", why: "Dado qualitativo + quantitativo" },
    { from: "design-grad", to: "tipografia", why: "Base da graduação" },
    { from: "ux-pos", to: "metricas", why: "Tema da especialização" },
    { from: "3d", to: "proto", why: "Protótipos com profundidade" },
  ],
};

const DATA = {
  name: "Duda Dados",
  fullName: "Duda Dados (perfil de exemplo)",
  role: "Cientista de Dados · Estatística, ML & Visualização",
  location: "Cidade Exemplo/BR",
  summary:
    "Perfil fictício de exemplo. Cientista de dados que transforma planilhas bagunçadas em modelos e gráficos que alguém entende. Este universo existe só para demonstrar o multiverso.",
  categories: cats([
    ["formacao", "Formação", "#7dd3fc"],
    ["certs", "Certificados", "#fcd34d"],
    ["estatistica", "Estatística", "#a3e635"],
    ["ml", "Machine Learning", "#f43f5e"],
    ["engenharia", "Engenharia de dados", "#38bdf8"],
    ["viz", "Visualização", "#e879f9"],
    ["comunicacao", "Comunicação", "#fb923c"],
  ]),
  nodes: [
    ...N("formacao", [
      ["estat", "Bacharelado em Estatística", "Universidade Exemplo", "Concluído"],
      ["mestrado", "Mestrado em Ciência de Dados", "Universidade Fictícia", "Em andamento"],
    ]),
    ...N("certs", [
      ["cert-ml", "Machine Learning aplicado", "Certificado de exemplo", "2024"],
      ["cert-sql", "SQL avançado", "Certificado de exemplo", "2023"],
    ]),
    ...N("estatistica", [
      ["inferencia", "Inferência estatística"],
      ["regressao", "Regressão"],
      ["ab", "Testes A/B"],
      ["series", "Séries temporais"],
      ["bayes", "Estatística bayesiana"],
    ]),
    ...N("ml", [
      ["python-ds", "Python científico", "NumPy, pandas, scikit-learn"],
      ["arvores", "Árvores e boosting"],
      ["redes-neurais", "Redes neurais"],
      ["nlp", "Processamento de linguagem"],
      ["mlops", "MLOps", "Versionar, treinar e servir modelos"],
    ]),
    ...N("engenharia", [
      ["sql", "SQL"],
      ["etl", "Pipelines de ETL"],
      ["spark", "Processamento distribuído"],
    ]),
    ...N("viz", [
      ["dashboards", "Dashboards"],
      ["storytelling", "Storytelling com dados"],
      ["notebooks", "Notebooks"],
    ]),
    ...N("comunicacao", [
      ["negocio", "Tradução para o negócio"],
      ["ensino", "Oficinas internas"],
    ]),
  ],
  timeline: [
    { when: "graduação", title: "Bacharelado em Estatística", ids: ["estat", "inferencia", "regressao", "bayes"] },
    { when: "estágio", title: "Primeiras análises", ids: ["sql", "python-ds", "notebooks", "dashboards", "cert-sql"] },
    { when: "produto", title: "Experimentos e previsões", ids: ["ab", "series", "arvores", "cert-ml", "negocio"] },
    { when: "escala", title: "Dados grandes e modelos em produção", ids: ["etl", "spark", "mlops", "storytelling"] },
    { when: "agora", title: "Mestrado e redes neurais", ids: ["mestrado", "redes-neurais", "nlp", "ensino"] },
  ],
  links: [
    { from: "regressao", to: "inferencia", why: "Regressão é inferência aplicada" },
    { from: "ab", to: "inferencia", why: "Testes de hipótese" },
    { from: "bayes", to: "ab", why: "Testes A/B bayesianos" },
    { from: "arvores", to: "python-ds", why: "Modelos em scikit-learn" },
    { from: "redes-neurais", to: "python-ds", why: "Treino em Python" },
    { from: "nlp", to: "redes-neurais", why: "Modelos de linguagem" },
    { from: "mlops", to: "etl", why: "Dados limpos alimentam o treino" },
    { from: "etl", to: "sql", why: "Transformações em SQL" },
    { from: "spark", to: "etl", why: "ETL em escala" },
    { from: "dashboards", to: "sql", why: "Consultas por trás dos gráficos" },
    { from: "storytelling", to: "negocio", why: "Dados viram decisão" },
    { from: "notebooks", to: "python-ds", why: "Exploração interativa" },
    { from: "series", to: "regressao", why: "Modelos de tendência" },
    { from: "cert-ml", to: "arvores", why: "Tema do certificado" },
    { from: "cert-sql", to: "sql", why: "Tema do certificado" },
    { from: "mestrado", to: "redes-neurais", why: "Linha de pesquisa" },
    { from: "ensino", to: "storytelling", why: "Explicar bem é contar bem" },
  ],
};

const GAMEDEV = {
  name: "Teo Pixel",
  fullName: "Teo Pixel (perfil de exemplo)",
  role: "Game Dev · Gameplay, Shaders & Áudio",
  location: "Cidade Exemplo/BR",
  summary:
    "Perfil fictício de exemplo. Desenvolvedor de jogos independentes que mistura programação de gameplay, shaders e trilha sonora. Este universo existe só para demonstrar o multiverso.",
  categories: cats([
    ["formacao", "Formação", "#818cf8"],
    ["certs", "Certificados", "#fbbf24"],
    ["gameplay", "Gameplay", "#4ade80"],
    ["grafica", "Computação gráfica", "#22d3ee"],
    ["audio", "Áudio", "#f97316"],
    ["design", "Game design", "#f472b6"],
  ]),
  nodes: [
    ...N("formacao", [
      ["jogos-digitais", "Tecnologia em Jogos Digitais", "Faculdade Exemplo", "Concluído"],
    ]),
    ...N("certs", [
      ["cert-engine", "Programação em motor de jogo", "Certificado de exemplo", "2024"],
      ["jam", "3 game jams", "Eventos fictícios", "Participações"],
    ]),
    ...N("gameplay", [
      ["csharp", "C#"],
      ["cpp", "C++"],
      ["fisica", "Física de jogo"],
      ["ia-npc", "IA de personagens", "Máquinas de estado e navegação"],
      ["netcode", "Multiplayer", "Sincronização de estado"],
    ]),
    ...N("grafica", [
      ["shaders", "Shaders", "GLSL e HLSL"],
      ["particulas", "Partículas"],
      ["pos-proc", "Pós-processamento", "Bloom, LUTs e aberração"],
      ["proc", "Geração procedural"],
    ]),
    ...N("audio", [
      ["trilha", "Trilha sonora"],
      ["sfx", "Efeitos sonoros"],
      ["audio-adapt", "Áudio adaptativo"],
    ]),
    ...N("design", [
      ["level", "Level design"],
      ["balance", "Balanceamento"],
      ["playtest", "Playtests"],
    ]),
  ],
  timeline: [
    { when: "infância", title: "Modificando jogos antigos", ids: ["level", "sfx"] },
    { when: "faculdade", title: "Jogos Digitais", ids: ["jogos-digitais", "csharp", "cpp", "fisica"] },
    { when: "jams", title: "Game jams de fim de semana", ids: ["jam", "particulas", "trilha", "playtest", "proc"] },
    { when: "estúdio", title: "Primeiro jogo publicado", ids: ["ia-npc", "shaders", "pos-proc", "balance", "cert-engine"] },
    { when: "agora", title: "Multiplayer e áudio adaptativo", ids: ["netcode", "audio-adapt"] },
  ],
  links: [
    { from: "shaders", to: "pos-proc", why: "Pós-processamento é shader de tela" },
    { from: "particulas", to: "shaders", why: "Partículas desenhadas na GPU" },
    { from: "proc", to: "level", why: "Fases geradas por código" },
    { from: "ia-npc", to: "fisica", why: "Personagens andam pelo mundo físico" },
    { from: "netcode", to: "fisica", why: "Física sincronizada entre jogadores" },
    { from: "audio-adapt", to: "trilha", why: "A trilha reage ao jogo" },
    { from: "sfx", to: "fisica", why: "Colisões tocam sons" },
    { from: "balance", to: "playtest", why: "Ajustes vêm dos testes" },
    { from: "jam", to: "playtest", why: "Jogos testados no fim da jam" },
    { from: "cert-engine", to: "csharp", why: "Scripts do motor em C#" },
    { from: "jogos-digitais", to: "cpp", why: "Base da faculdade" },
    { from: "level", to: "balance", why: "Dificuldade de cada fase" },
  ],
};

// Lista do multiverso. `demo: true` aparece como "exemplo" na interface.
export const UNIVERSES = [
  { id: "carlos", demo: false, profile: PROFILE },
  { id: "demo-dev", demo: true, profile: DEV },
  { id: "demo-design", demo: true, profile: DESIGN },
  { id: "demo-dados", demo: true, profile: DATA },
  { id: "demo-games", demo: true, profile: GAMEDEV },
];
export const HOME_ID = "carlos";
export const universeById = (id) => UNIVERSES.find((u) => u.id === id) || null;

// Endereço do mapa de cada universo (o do Carlos é a página inicial de sempre)
export const mapUrl = (u) => (u.id === HOME_ID ? "index.html" : `index.html#u=${encodeURIComponent(u.id)}`);
// Volta para a nave, perto do universo de onde se saiu
export const shipUrl = (u) => `multiverso.html#de=${encodeURIComponent(u ? u.id : HOME_ID)}`;

// Universo ativo no mapa, escolhido pelo hash (#u=id). `viaHash` indica que se chegou pela nave.
function fromHash() {
  const m = /(?:^#|&)u=([\w-]+)/.exec(window.location.hash || "");
  return m ? universeById(decodeURIComponent(m[1])) : null;
}
const hashed = typeof window !== "undefined" ? fromHash() : null;
export const ACTIVE_UNIVERSE = hashed || universeById(HOME_ID);
export const ACTIVE = ACTIVE_UNIVERSE.profile;
export const viaHash = !!hashed;
