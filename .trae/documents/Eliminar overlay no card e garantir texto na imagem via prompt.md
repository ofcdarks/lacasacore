## Diagnóstico
- O overlay visual que adicionei no card está cobrindo a área dos botões, interceptando cliques e causando a impressão de “headline em cima da imagem”.
- O serviço de imagem às vezes imprime linhas de tipografia/cores dos prompts de estilo (ex.: “MONTSERRAT Extra Bold 32pt”, “#FFCC00”, “NO ANALIZED”), em vez de renderizar apenas a headline.
- Resultado: a imagem retorna com textos técnicos e sem a headline correta; e, no frontend, o overlay do card interfere nos cliques.

## Correções Propostas
### 1) Frontend (dashboard.html)
- Remover o overlay visual no card das variações (sem banda/absoluto), para que a imagem exibida venha apenas do serviço.
- Reativar cliques dos botões: nenhum elemento absoluto deve ficar sobre os botões; caso mantenhamos algum indicador, usar `pointer-events: none` e recortar estritamente dentro da área da imagem.
- Manter apenas o botão opcional “Baixar com Headline” (canvas) como fallback — sem overlay no card.

### 2) Backend (server.js)
- Sanitizar `promptBase` de estilo antes de adicionar a headline:
  - Remover linhas que contenham padrões técnicos: nomes de fonte (Montserrat), códigos hex `#RRGGBB`, tokens “NO”, “ANALIZED”, “tracking”, “32pt”, etc.
  - Remover qualquer instrução prévia de “text overlay”, mantendo apenas a nossa headline.
- Ajustar a instrução de overlay para palavras‑chave aceitas e mais curtas:
  - “Bottom overlay text: "<HEADLINE>"; white text; bold; high contrast; only render this caption; do not render font names or color codes.”
  - Reforçar negativo: “do not render debug text, font names, color codes, or policy markers”.
- Manter localização: continuar usando o `languageName` já normalizado.

### 3) Validação
- Testes unitários simples para o sanitizador de prompt (regex/padronização), garantindo remoção de linhas técnicas.
- Teste manual: gerar 4 variações, verificar que a imagem não contém linhas técnicas e que a headline aparece (quando o serviço suporta overlay). Caso não apareça, usar botão de fallback para baixar com texto embutido.
- Verificar cliques dos botões em Chrome/Edge/Firefox.

## Critérios de Aceite
- Os botões voltam a funcionar imediatamente (sem overlay no card interrompendo eventos).
- Imagens retornadas não exibem linhas técnicas do prompt; exibem apenas a headline quando o serviço respeita overlay.
- Fallback “Baixar com Headline” continua disponível para garantia de entrega.

## Impacto
- Mudanças localizadas em `dashboard.html` (remoção do overlay visual do card) e no bloco de construção de prompt do endpoint de thumbnail completa em `server.js` (sanitização e instruções de overlay).