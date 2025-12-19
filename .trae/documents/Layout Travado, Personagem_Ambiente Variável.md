## Objetivo
Garantir que o estilo/layout (tipografia, letterbox, paleta, iluminação, composição) siga o padrão do canal, enquanto personagem e ambiente SEMPRE variam conforme o título.

## Perfil de Estilo (Style Lock)
- Extrair do painel de “Analisar Estilo” um objeto `styleProfile` com campos: `composition`, `letterbox`, `typography`, `palette`, `lighting`, `texture`, `logo_policy`.
- Gerar instruções imutáveis: “Do not change layout; keep letterbox; gold all‑caps headline with subtle glow; maintain subject placement; obey palette/lighting”.

## Análise de Título
- Parsear o título para: `subject_theme` (ex.: Neandertais), `era/context` (ex.: era do gelo), `key_motifs` (ex.: DNA), `language` (selecionado).
- Mapas temáticos (Roma/Egito/Neandertais/Aztecas/Incas/Maya etc.) para cenários e elementos visuais permitidos.
- IA opcional (Gemini/OpenAI/Claude) apenas para 3 “hints” curtos de cenário; nunca reescrever o prompt padrão.

## Compilador de Prompt (Builder)
- Montar o prompt final em blocos:
  1) `styleProfile` (lock do layout/estética)
  2) `subjectBlock`: “Replace primary subject with: <descrição derivada do título>”
  3) `environmentBlock`: elementos de fundo coerentes com o título + era/contexto
  4) `typographyBlock`: headline curta e subheadline (traduzidas), sem termos de guia
  5) `negativeBlock`: banir elementos de outros temas (ex.: cocar/pirâmides/navios espanhóis) e logos/watermarks
- Remover tokens conflitantes do prompt padrão antes de compor (personagem/cenário fixos).

## Headline/Subheadline
- HEADLINE: extrair núcleo do título (antes dos “:”), encurtar e traduzir; aplicar tipografia dourada all‑caps.
- SUBHEADLINE: conteúdo entre parênteses ou trecho breve após “:”; traduzir e aplicar estilo menor.

## Política de Logos/Marcas
- Filtro forte: “Exclude any logos, watermarks, badges, branding; do not render channel names/corner marks”.
- Remoção no prompt base e reforço nos negativos.

## UI
- Painel “Gerar por Título”: legível, com selects de variação do prompt, nº de variações (até 4), IA opcional, idioma, estilo de arte.
- Mostrar “Ver prompt usado” e estado “Salvo!”.

## Validação
- Casos de teste por tema (Neandertais, Roma, Egito, Incas) verificando que o SUJEITO e o CENÁRIO mudam, e o layout/estilo permanecem.
- Se vazar elementos indevidos, ampliar `avoid/replace` do tema e ajustar mapas.

## Entrega Incremental
- Implementar `styleProfile` + `promptBuilder` com negativos por tema.
- Conectar ao painel atual sem quebrar rotas; logs com preview do prompt final.
