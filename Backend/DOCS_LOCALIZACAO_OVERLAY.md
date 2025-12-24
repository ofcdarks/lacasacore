# Localização e Overlay de Headline

## Idioma
- Frontend normaliza códigos: `pt-BR`, `en-US`, `es-ES` → `pt-BR`, `en`, `es`.
- Backend converte códigos regionais para nomes usados nos prompts.
- Todas as strings (headline, descrição, tags) são geradas no idioma selecionado.

## Overlay
- Prompt reforça: posição bottom‑center, faixa semitransparente, strokes e sombra.
- Fallback no frontend: botão “Baixar com Headline” aplica overlay via canvas.
- Tipografia: Montserrat 800/900 carregada via Google Fonts.

## Testes
- Unitários: `node Backend/tests/unit-language.js`.
- Integração: gerar variações em cada idioma e verificar strings.
- Cross‑browser: validar canvas em Chrome, Edge e Firefox.
