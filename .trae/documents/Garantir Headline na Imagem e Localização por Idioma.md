## Problemas Identificados
- Headline em N/A ou duplicada: frontend usava campos globais; ajustamos renderização, mas a imagem ainda pode não incorporar a headline (dependendo do serviço).
- Localização: frontend envia códigos `pt-BR`, `en-US`, `es-ES`; backend mapeia apenas `pt`, `pt-BR`, `en`, `es`, fazendo espanhol cair em `pt-BR` às vezes.
- Legibilidade da sobreposição: prompt atual pede Montserrat 32pt com contorno; nem sempre respeitado.

## Correções Propostas
### 1) Renderização da Headline na Imagem
- Backend (`server.js`): reforçar instruções do prompt final para overlay
  - Alinhamento: bottom-center, dentro da safe area (bottom 18–22%).
  - Legibilidade: barra semitransparente escura atrás do texto (opacity 0.35), stroke duplo (black 3px + yellow 1px), drop shadow.
  - Exclusividade: “render ONLY the provided headline text; DO NOT render any debug text, font names, color codes”.
  - Remover qualquer placeholder textual anterior.
- Frontend (`dashboard.html`): fallback de composição via `<canvas>`
  - Botão “Baixar Imagem” passa a baixar versão com overlay garantida.
  - Canvas: carrega `Montserrat` (ExtraBold) via WebFont; posiciona texto com medidas responsivas; garante contraste.
  - Mantém download da original como alternativa.

### 2) Localização por Idioma
- Frontend: normalizar o valor enviado ao backend
  - Mapear `pt-BR → pt-BR`, `en-US → en`, `es-ES → es` antes do fetch.
- Backend: expandir `languageMap`
  - Aceitar códigos regionais (pt-BR, pt-PT, en-US, es-ES, es-419) e convergir para nomes legíveis.
- Geração de strings
  - Garantir que `seoPrompt` e `generateVariationSEO` usem `languageName` consistente.
  - Confirmar encoding UTF‑8 em respostas (acentos).

### 3) Testes
- Unitários (Node/Jest):
  - `languageMap` resolve corretamente `pt-BR`, `en-US`, `es-ES`.
  - `normalizeText` elimina placeholders e espaços; nunca retorna `N/A`.
  - Construção do `finalPrompt` inclui instruções de overlay e não contém texto proibido.
- Integração (mock de geração):
  - Simular resposta do endpoint completo; verificar headlines/descrições/tags por variação no idioma certo.
- Cross‑browser (manual + script):
  - Exercitar canvas overlay em Chrome, Edge e Firefox; validar `toDataURL` e fonte carregada.

### 4) Documentação
- Atualizar doc técnica:
  - Fluxo de idioma: valores aceitos, mapeamento e uso em prompts.
  - Estratégia de overlay: instruções do prompt e fallback via canvas.
  - Guia de testes: como rodar unit/integration e validações visuais.

## Critérios de Aceite
- Toda variação exibe headline única e legível dentro da imagem (sem textos extras).
- Descrição, tags e headline são geradas no idioma selecionado.
- Nenhum campo retorna placeholders (`N/A`).
- Canvas fallback produz imagem com overlay consistente.

## Impacto e Risco
- Alterações localizadas: bloco do endpoint `thumbnail/complete` e módulo do gerador no frontend.
- Sem quebra de API; adiciona robustez caso serviço de imagem não cumpra instruções.

## Próximo Passo
- Implementar mapeamentos de idioma e reforço do prompt no backend.
- Adicionar o fallback de canvas e normalização de idioma no frontend.
- Incluir testes e documentação conforme descrito.