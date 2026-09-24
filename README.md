# info.me

Site pessoal: um personagem sentado no computador, num fundo preto. Ao rolar a página, a câmera entra na cabeça dele e revela um mapa neural com as skills e certificações.

## Rodar localmente

É HTML, CSS e JavaScript puro, sem build. Abra o `index.html` no navegador, ou sirva a pasta:

```bash
python3 -m http.server 8000
# depois abra http://localhost:8000
```

## Editar o conteúdo

Tudo que aparece no site está em [`assets/js/data.js`](assets/js/data.js):

- `name`, `role`, `tagline`: textos da abertura.
- `categories`: as regiões do cérebro (cor e posição).
- `skills`: cada skill vira um neurônio ligado à sua categoria.
- `certifications`: cada certificação vira um neurônio amarelo, com instituição e ano.

## Estrutura

- `index.html`: cena em SVG (personagem, monitor, mesa) e o canvas do mapa neural.
- `assets/css/style.css`: estilos.
- `assets/js/main.js`: animação de scroll (zoom na cabeça), mapa neural em canvas, hover/toque e a lista acessível no fim da página.

## Deploy

Funciona em qualquer hospedagem estática: GitHub Pages (Settings → Pages → branch `main`), Vercel ou Netlify.
