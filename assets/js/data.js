// Conteúdo do site. Edite este arquivo para trocar nome, skills e certificações.
// Os itens abaixo são exemplos (placeholders) e devem ser substituídos pelos reais.
window.PROFILE = {
  name: "Carlos",
  role: "Desenvolvedor & Designer",
  tagline: "Role para baixo e entre na minha mente.",

  // Cada categoria vira uma "região" do cérebro.
  // x/y são a posição do centro da região no desenho do cérebro (0 a 1000 / 0 a 700).
  categories: [
    { id: "frontend", label: "Front-end", color: "#38bdf8", x: 300, y: 250 },
    { id: "backend", label: "Back-end", color: "#a78bfa", x: 530, y: 175 },
    { id: "design", label: "Design", color: "#f472b6", x: 745, y: 235 },
    { id: "data", label: "Dados & Ferramentas", color: "#34d399", x: 760, y: 420 },
    { id: "soft", label: "Soft skills", color: "#fb923c", x: 310, y: 440 },
    { id: "certs", label: "Certificações", color: "#facc15", x: 540, y: 455 },
  ],

  skills: [
    { name: "HTML", category: "frontend" },
    { name: "CSS", category: "frontend" },
    { name: "JavaScript", category: "frontend" },
    { name: "TypeScript", category: "frontend" },
    { name: "React", category: "frontend" },
    { name: "Next.js", category: "frontend" },
    { name: "Node.js", category: "backend" },
    { name: "APIs REST", category: "backend" },
    { name: "Python", category: "backend" },
    { name: "Supabase", category: "backend" },
    { name: "Figma", category: "design" },
    { name: "UI Design", category: "design" },
    { name: "UX Research", category: "design" },
    { name: "Design Systems", category: "design" },
    { name: "SQL", category: "data" },
    { name: "Git", category: "data" },
    { name: "Vercel", category: "data" },
    { name: "Excel", category: "data" },
    { name: "Comunicação", category: "soft" },
    { name: "Trabalho em equipe", category: "soft" },
    { name: "Resolução de problemas", category: "soft" },
  ],

  certifications: [
    { name: "Certificação Exemplo 1", issuer: "Instituição", year: 2024 },
    { name: "Certificação Exemplo 2", issuer: "Instituição", year: 2024 },
    { name: "Certificação Exemplo 3", issuer: "Instituição", year: 2023 },
    { name: "Certificação Exemplo 4", issuer: "Instituição", year: 2023 },
  ],
};
