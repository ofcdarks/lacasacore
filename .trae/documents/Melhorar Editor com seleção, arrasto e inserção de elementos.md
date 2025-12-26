## Objetivo
- Editor funcional para: selecionar área com texto e esconder/mover, pintar cor, desfocar, inserir texto editável, inserir logo, inserir selo 4K, mover elementos.

## Alterações
- Substituir o modal e lógica do editor no `dashboard.html` por uma versão com:
  - Ferramentas: Faixa (retângulo), Desfoque, Pincel, Texto, Logo, 4K.
  - Controles: cor, tamanho, opacidade, fonte/tamanho do texto, upload de logo, escala.
  - Interações: seleção retangular, arrastar elementos (texto/logo/4K) com mouse.
  - Salvar como PNG, Reset limpa overlays.

## Implementação
- Estado do editor: `overlays[]` contendo objetos (text, logo, badge4k, bandRect, blurRect, brushStroke).
- Renderização: desenha imagem base e cada overlay, com bounding-box para arrasto.
- Handlers: mousedown/mousemove/mouseup para seleção/arrasto; apply para criar overlays conforme ferramenta; file input para logo.

## Validação
- Testar arrasto/edição em Chrome/Edge/Firefox; aplicar múltiplas seleções; salvar PNG.

## Impacto
- Apenas frontend; sem alterações no backend além do já existente seletor 4K externo.