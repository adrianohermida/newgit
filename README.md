# Como publicar no domínio hermidamaia.adv.br

1. Rode:
   npm run build && npx next export

2. Faça deploy do conteúdo da pasta `out/` para o branch/pasta configurado no GitHub Pages OU para o serviço de hospedagem que aponta para hermidamaia.adv.br.

3. No GitHub, configure o Pages para servir a partir da pasta /out (ou /docs, se preferir).

4. No Cloudflare Pages, configure o domínio customizado hermidamaia.adv.br para apontar para o repositório e branch correto.

5. Certifique-se de que o CNAME do domínio customizado está configurado para hermidamaia.adv.br.

Pronto! Seu site estará disponível em https://hermidamaia.adv.br
