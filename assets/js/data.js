// Conteúdo do site, tirado do currículo. Edite aqui para atualizar o mapa neural.
//
// - categories: regiões do cérebro. `pos` é a posição da região dentro do cérebro 3D
//   (x = esquerda/direita, y = baixo/cima, z = trás/frente), em unidades de cena.
// - nodes: cada item vira um neurônio ligado à sua região.
// - links: conexões extras entre neurônios, cada uma com o motivo (aparece no painel).
export const PROFILE = {
  name: "Carlos Gabriel",
  fullName: "Carlos Gabriel Gonçalves Mendes",
  role: "Estudante de Segurança Cibernética · Suporte de TI, Redes & Segurança",
  location: "São Paulo/SP",
  linkedin: "https://linkedin.com/in/carlos-gabriel-368aa32b6",
  tagline: "Role para baixo e entre na minha mente.",
  summary:
    "Estudante do Técnico em Segurança Cibernética no Senac, com duas qualificações técnicas concluídas e trilha Cisco CCNA em andamento. Buscando estágio ou primeira oportunidade em Suporte de TI (N1/N2) e Sistemas.",

  categories: [
    { id: "formacao", label: "Formação", color: "#60a5fa", pos: [0, 2.2, 1.6] },
    { id: "certs", label: "Certificados", color: "#facc15", pos: [2.6, 1.2, 0.6] },
    { id: "redes", label: "Redes", color: "#22d3ee", pos: [-2.8, 0.6, 0.8] },
    { id: "seguranca", label: "Segurança", color: "#f43f5e", pos: [0.4, 0.4, -2.6] },
    { id: "sistemas", label: "Sistemas & Suporte", color: "#a78bfa", pos: [3.0, -0.8, -1.4] },
    { id: "ferramentas", label: "Ferramentas", color: "#34d399", pos: [-2.4, -1.2, -1.8] },
    { id: "perfil", label: "Perfil", color: "#fb923c", pos: [-0.6, -1.6, 2.4] },
    { id: "idiomas", label: "Idiomas", color: "#e879f9", pos: [1.8, -1.9, 1.8] },
  ],

  nodes: [
    // Formação
    { id: "tsc", label: "Técnico em Segurança Cibernética", category: "formacao", detail: "Senac Lapa Tito (turma TSC02)", status: "Em andamento" },
    { id: "ccna-trilha", label: "Trilha CCNA", category: "formacao", detail: "Cisco Networking Academy, curso noturno. Módulos 1 e 2 concluídos; módulo 3 e exame CCNA são as próximas etapas.", status: "Em andamento" },

    // Certificados
    { id: "cert-seginfo", label: "Assistente em Segurança da Informação", category: "certs", detail: "Qualificação Profissional Técnica, Senac", status: "set/2026" },
    { id: "cert-redes", label: "Assistente de Operação de Redes de Computadores", category: "certs", detail: "Qualificação Profissional Técnica, Senac", status: "mai/2026" },
    { id: "cert-srwe", label: "CCNA: Switching, Routing, and Wireless Essentials", category: "certs", detail: "Cisco Networking Academy", status: "Badge verificado" },
    { id: "cert-itn", label: "CCNA: Introduction to Networks", category: "certs", detail: "Cisco Networking Academy", status: "Badge verificado" },

    // Redes
    { id: "tcpip", label: "TCP/IP", category: "redes" },
    { id: "subnet", label: "Endereçamento IP e sub-redes", category: "redes" },
    { id: "vlan", label: "VLANs", category: "redes" },
    { id: "routing", label: "Roteamento estático e entre VLANs", category: "redes" },
    { id: "etherchannel", label: "EtherChannel", category: "redes" },
    { id: "stp", label: "STP", category: "redes" },
    { id: "dhcp", label: "DHCP", category: "redes" },
    { id: "wlan", label: "Redes sem fio (WLAN)", category: "redes" },

    // Segurança
    { id: "pfsense", label: "Firewall pfSense", category: "seguranca", detail: "Regras e segurança de perímetro" },
    { id: "l2sec", label: "Segurança de camada 2", category: "seguranca" },
    { id: "boaspraticas", label: "Boas práticas de segurança da informação", category: "seguranca" },

    // Sistemas & Suporte
    { id: "suporte", label: "Suporte a usuários", category: "sistemas", detail: "Atendimento, diagnóstico e resolução de problemas em estações de trabalho, sistemas e rede" },
    { id: "windows", label: "Windows e Windows Server", category: "sistemas", detail: "Configuração e suporte" },
    { id: "ad", label: "Active Directory", category: "sistemas", detail: "Administração básica de usuários, grupos e domínio" },
    { id: "linux", label: "Linux", category: "sistemas", detail: "Linha de comando e administração básica de servidores" },
    { id: "python", label: "Python", category: "sistemas", detail: "Algoritmos e scripts para automação de tarefas em servidores" },

    // Ferramentas
    { id: "packettracer", label: "Cisco Packet Tracer", category: "ferramentas", detail: "Simulação de topologias" },
    { id: "wireshark", label: "Wireshark", category: "ferramentas", detail: "Captura e análise de tráfego" },

    // Perfil
    { id: "problemas", label: "Resolução de problemas", category: "perfil", detail: "Iniciativa e senso de urgência" },
    { id: "comunicacao", label: "Comunicação", category: "perfil", detail: "Boa comunicação e paciência no atendimento a usuários" },
    { id: "aprendizado", label: "Aprendizado contínuo", category: "perfil", detail: "Facilidade de aprendizado e busca contínua por evolução técnica" },
    { id: "disciplina", label: "Disciplina", category: "perfil", detail: "Concilia o curso técnico e a formação Cisco no período noturno" },

    // Idiomas
    { id: "pt", label: "Português", category: "idiomas", status: "Nativo" },
    { id: "en", label: "Inglês", category: "idiomas", status: "Técnico/Leitura", detail: "Documentações, interfaces e comandos de equipamentos de rede e ferramentas de TI" },
  ],

  links: [
    { from: "tsc", to: "cert-seginfo", why: "Qualificação técnica concluída dentro do curso técnico" },
    { from: "tsc", to: "cert-redes", why: "Qualificação técnica concluída dentro do curso técnico" },
    { from: "ccna-trilha", to: "cert-itn", why: "Módulo 1 da trilha CCNA" },
    { from: "ccna-trilha", to: "cert-srwe", why: "Módulo 2 da trilha CCNA" },
    { from: "cert-itn", to: "tcpip", why: "Fundamentos de redes do módulo Introduction to Networks" },
    { from: "cert-itn", to: "subnet", why: "Endereçamento e sub-redes são base do Introduction to Networks" },
    { from: "cert-srwe", to: "vlan", why: "Tema do módulo Switching, Routing, and Wireless Essentials" },
    { from: "cert-srwe", to: "routing", why: "Tema do módulo Switching, Routing, and Wireless Essentials" },
    { from: "cert-srwe", to: "etherchannel", why: "Tema do módulo Switching, Routing, and Wireless Essentials" },
    { from: "cert-srwe", to: "stp", why: "Tema do módulo Switching, Routing, and Wireless Essentials" },
    { from: "cert-srwe", to: "dhcp", why: "Tema do módulo Switching, Routing, and Wireless Essentials" },
    { from: "cert-srwe", to: "wlan", why: "A parte \"Wireless\" do módulo" },
    { from: "cert-srwe", to: "l2sec", why: "Segurança de switches é parte do módulo" },
    { from: "cert-redes", to: "tcpip", why: "Operação de redes de computadores" },
    { from: "cert-seginfo", to: "boaspraticas", why: "Foco da qualificação em Segurança da Informação" },
    { from: "cert-seginfo", to: "pfsense", why: "Segurança de perímetro" },
    { from: "vlan", to: "routing", why: "Roteamento entre VLANs" },
    { from: "l2sec", to: "vlan", why: "Segurança de camada 2 protege a infraestrutura de switches" },
    { from: "pfsense", to: "routing", why: "O firewall também fica no caminho do roteamento" },
    { from: "packettracer", to: "ccna-trilha", why: "Simulação de topologias usada nos estudos de redes" },
    { from: "packettracer", to: "vlan", why: "Topologias simuladas no Packet Tracer" },
    { from: "wireshark", to: "tcpip", why: "Captura e análise de tráfego de rede" },
    { from: "wireshark", to: "dhcp", why: "Análise de tráfego de protocolos de rede" },
    { from: "python", to: "linux", why: "Scripts para automação de tarefas em servidores" },
    { from: "ad", to: "windows", why: "Active Directory roda no Windows Server" },
    { from: "suporte", to: "windows", why: "Suporte em estações de trabalho e sistemas" },
    { from: "suporte", to: "comunicacao", why: "Paciência e boa comunicação no atendimento" },
    { from: "suporte", to: "problemas", why: "Diagnóstico e resolução de problemas" },
    { from: "en", to: "ccna-trilha", why: "Documentação e comandos de equipamentos em inglês" },
    { from: "disciplina", to: "ccna-trilha", why: "Formação Cisco no período noturno" },
    { from: "disciplina", to: "tsc", why: "Conciliando os dois cursos" },
    { from: "aprendizado", to: "ccna-trilha", why: "Evolução técnica contínua" },
  ],
};
