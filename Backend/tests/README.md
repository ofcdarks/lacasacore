# Testes

## Unitários
- `node tests/unit-language.js` valida o mapeamento de idiomas e a presença das instruções reforçadas de overlay no `server.js`.

## Integração
- Gere thumbnails completas a partir do `dashboard.html` selecionando idiomas diferentes e verifique se headlines, descrições e tags vêm no idioma correto.

## Cross‑browser
- No `dashboard.html`, use o botão “Baixar com Headline” em Chrome, Edge e Firefox e valide se o arquivo baixado contém a faixa semitransparente e o texto com Montserrat.
