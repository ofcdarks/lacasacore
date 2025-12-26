## Objetivo
- Garantir que as thumbnails geradas não contenham nenhum texto, legenda, tipografia ou códigos.
- Manter headlines/descrições/tags apenas no painel, não embutidas na imagem.

## Mudanças no Backend
- `Backend/server.js` (rota `POST /api/generate/thumbnail/complete`):
  - Em `variations_data` (`server.js:17318–17355`), definir `hasHeadline: false` e remover `headlineLine`.
  - Na construção do `finalPrompt` (`server.js:17380–17400`), remover o bloco que adiciona a headline; usar somente `negativeBlock` com reforço:
    - “Do not render any text, letters, numbers, captions, typography, font names, color codes, labels, watermarks.”
  - Sanitizar `promptBase` para remover qualquer instrução pré‑existente de overlay/typography:
    - Excluir linhas que contenham `text overlay`, `font`, `Montserrat`, `#HEX`, `tracking`, `32pt`, etc.
  - Manter o restante do estilo, ambientação e detecção de idioma.

## Mudanças no Frontend
- `Backend/dashboard.html`:
  - Confirmar que não há overlay visual sobre a imagem (já removido: `dashboard.html:14369–14371`).
  - Manter renderização por variação apenas nos campos de texto (headline/descrição/tags) e os botões de copiar.

## Validação
- Gerar 4 variações e inspecionar visualmente se nenhuma imagem contém texto.
- Verificar que as headlines e descrições continuam visíveis nos campos, mas não na imagem.
- Teste unitário simples (Node) para garantir que `finalPrompt` inclui o bloqueio “no text/no captions” e não inclui “Montserrat/32pt/#HEX”.

## Critérios de Aceite
- Zero texto em todas as thumbnails geradas.
- Nenhum impacto nos campos de headline/descrição/tags do painel.
- Compatível com idiomas e estilos já suportados.

## Impacto
- Alteração localizada no builder de prompt do endpoint de geração; sem quebra de contrato de resposta. 