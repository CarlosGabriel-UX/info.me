# info.me

Site pessoal em 3D: um personagem sentado no computador, num fundo preto. Ao rolar a página, a câmera entra na cabeça dele, o cérebro se expande e vira um mapa neural 3D com formação, certificados e conhecimentos. No botão **Explorar em 3D** dá para girar, dar zoom e mover o mapa, buscar itens e clicar num neurônio para ver os detalhes e o motivo de cada conexão.

## Rodar localmente

É HTML, CSS e JavaScript puro (módulos ES), sem build. Como usa módulos, precisa ser servido por HTTP (abrir o arquivo direto não funciona):

```bash
python3 -m http.server 8000
# depois abra http://localhost:8000
```

## Editar o conteúdo

Tudo que aparece no site está em [`assets/js/data.js`](assets/js/data.js):

- `name`, `role`, `summary`, `linkedin`: textos da abertura e do rodapé.
- `categories`: as regiões do cérebro (cor e posição 3D).
- `nodes`: cada item (formação, certificado, skill) vira um neurônio ligado à sua região.
- `links`: conexões extras entre neurônios, cada uma com o motivo que aparece no painel.

## Estrutura

- `index.html`: estrutura da página e interface do modo explorar.
- `assets/css/style.css`: estilos.
- `assets/js/main.js`: cena 3D (three.js), câmera guiada pelo scroll, mapa neural, controles de órbita, busca, painel de detalhes e a lista acessível no fim da página.
- `assets/vendor/three/`: three.js r169 (licença MIT) incluído no repositório, sem depender de CDN.

## Deploy

Funciona em qualquer hospedagem estática: GitHub Pages (Settings → Pages → branch `main`), Vercel ou Netlify.
