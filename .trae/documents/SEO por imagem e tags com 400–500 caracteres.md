## Objetivo
- Garantir que cada imagem tenha descrição SEO própria, bem formatada e diferente das demais.
- Gerar tags por imagem, com comprimento total entre 400 e 500 caracteres.
- Remover o botão “Baixar com Headline” (se ainda existir em algum fluxo).

## Mudanças no Backend
- Atualizar o prompt de `generateVariationSEO` para exigir:
  - Descrição em 2–3 frases, com boa pontuação, no idioma selecionado e única por variação.
  - Tags em forma de string separada por vírgulas, com 400–500 caracteres totais, sem duplicação.
- Pós-processamento das tags:
  - Se vierem em array, juntar em string e ajustar o comprimento para 400–500 caracteres, adicionando palavras do título/headline quando abaixo do mínimo e truncando no último separador quando acima do máximo.
- Garantir retorno por variação em `images[i]`: `seoDescription` e `tags` (string única por imagem).

## Mudanças no Frontend
- Renderização de resultados do gerador completo (`dashboard.html`):
  - Usar `imgObj.headline`, `imgObj.seoDescription` e `imgObj.tags` para cada variação.
  - Botões de copiar passam a copiar os valores da variação correspondente.
  - Remover qualquer resquício do botão “Baixar com Headline” (já foi removido na reversão, mas validar).

## Validação
- Gerar 4 variações e conferir que:
  - Cada descrição está no idioma correto e com formatação (duas ou três frases, pontuação).
  - Tags de cada variação têm entre 400 e 500 caracteres (via inspeção e contagem simples).
  - As descrições são diferentes entre as variações.

## Impacto
- Alterações localizadas em `Backend/server.js` (bloco `generateVariationSEO` e montagem de `images`) e `Backend/dashboard.html` (render por variação).