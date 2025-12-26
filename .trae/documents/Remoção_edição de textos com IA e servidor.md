## Objetivo
- Permitir apagar, modificar e inserir textos/elementos nas imagens usando três modos complementares: (1) edição local no navegador; (2) processamento no servidor (Sharp); (3) regeneração com IA (ImageFX via cookies) sem textos.

## Backend
1) Nova rota `POST /api/edit/image/apply`
- Entrada: `imageUrl|dataUrl`, `overlays[]` (bandRect, blurRect, brushStroke, text, logo, badge4k).
- Processamento: Sharp
  - bandRect: compósito de SVG retangular com cor/opacity.
  - blurRect: extrair região, aplicar blur, recompor.
  - brushStroke: compor círculos como SVG.
  - text: compor SVG com texto (cor, stroke, tamanho).
  - logo: compor imagem enviada (dataURL) com `scale`.
  - badge4k: compor SVG do selo.
- Saída: PNG base64.

2) Rota `POST /api/edit/imagefx/clean`
- Entrada: `promptBase`, `style`, `referenceHints` (opcional) e imagem original (para guardar contexto textual).
- Ação: usar `ImageFX.generateImage` com instruções “same style, no text/captions/logos/badges”, retornando nova imagem sem textos.
- Usa cookies já salvos.

## Frontend (Editor)
- Adicionar opcional “Salvar via servidor” além do Salvar PNG do canvas.
- Serializar `overlays[]` e enviar para `/api/edit/image/apply`.
- Botão “Limpar com IA (ImageFX)” que chama `/api/edit/imagefx/clean` usando estilo selecionado.
- Permitir inserir/mover: Texto, Logo, 4K (já implementado); persistir via servidor quando solicitado.

## Validação
- Testar: apagar textos com banda/blur; inserir/mover texto/logo/4K; salvar servidor.
- Testar regeneração com IA (sem textos) em 2 variações.

## Impacto
- Apenas um arquivo backend e ajustes no editor do `dashboard.html`. Usa cookies do ImageFX já existentes.