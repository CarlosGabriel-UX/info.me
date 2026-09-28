# info.me

Site pessoal em 3D. Ao abrir, um terminal roda um script que imprime o perfil (nome, função, resumo, formação, certificados e conhecimentos). No fim, a tela dá zoom no cursor e entra num cérebro de partículas que cresce e vira um mapa neural 3D. No botão **Explorar em 3D** dá para girar, dar zoom e mover o mapa, buscar itens e clicar num neurônio para ver os detalhes e o motivo de cada conexão.

## Rodar localmente

É HTML, CSS e JavaScript puro (módulos ES), sem build. Como usa módulos, precisa ser servido por HTTP (abrir o arquivo direto não funciona):

```bash
python3 -m http.server 8000
# depois abra http://localhost:8000
```

## Editar o conteúdo

Tudo que aparece no site está em [`assets/js/data.js`](assets/js/data.js):

- `fullName`, `role`, `location`, `summary`, `linkedin`: o que o terminal imprime e o rodapé.
- `categories`: as regiões do cérebro (cor e posição 3D).
- `nodes`: cada item (formação, certificado, skill) vira um neurônio ligado à sua região.
- `links`: conexões extras entre neurônios, cada uma com o motivo que aparece no painel.

## Estrutura

- `index.html`: estrutura da página e interface do modo explorar.
- `assets/css/style.css`: estilos.
- `assets/js/terminal.js`: a abertura em terminal (script digitado, saída com os dados de `data.js` e o zoom final).
- `assets/js/shell.js`: terminal interativo por cima do mapa (tecla `'` ou botão **Terminal**). Comandos: `help`, `whoami`, `sobre`, `formacao`, `certs`, `skills [área]`, `ls`, `cd <área>`, `mapa <termo>`, `linkedin`, `nmap`, `clear`, `exit`.
- `assets/js/main.js`: cena 3D (three.js), câmera que se afasta de dentro do cérebro, mapa neural, controles de órbita, busca, painel de detalhes e a lista acessível no fim da página.
- `assets/vendor/three/`: three.js r169 (licença MIT) incluído no repositório, sem depender de CDN.

## Deploy

Funciona em qualquer hospedagem estática: GitHub Pages (Settings → Pages → branch `main`), Vercel ou Netlify.
