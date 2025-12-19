## Objetivo
Permitir digitar apenas o título e gerar thumbnails no estilo das referências, adaptando cenário/elementos ao título sem fugir do padrão.

## UX no Dashboard
- Campo `Título` + seletor `Prompt Padrão` (variação 1/2/3) + botão `Gerar por Título`.
- Checkbox “Travar estilo das referências” ativo por padrão.
- Opcional: número de variações (1–3). Resultado aparece como cards com Baixar/Salvar.

## Regras de Construção de Prompt
- Base: usar o `standard_prompt` selecionado SEM criar novo prompt.
- Inserir o título:
  - Substituir placeholders de título ([TÍTULO], {TITLE}, {{title}}, etc.).
  - Se não houver, prefixar `Title: "<título>"` e manter o texto do padrão.
- Adaptação de cenário controlada:
  - Extrair palavras-chave do título (lugares, época, personagem, ação) com regra simples ou IA rápida.
  - Injetar somente nos campos de cenário permitidos: [cenário], [elementos], sem alterar composição fixa.
- Bloqueio de estilo (“style lock”):
  - Adicionar linhas de restrição do padrão (paleta, posição do sujeito, tipografia, fumaça/batalha, etc.) para impedir deriva.

## Backend
- Nova rota `POST /api/generate/imagefx/by-title`:
  - Entrada: `{ title, promptVariantId|promptText, language, variations }`.
  - Busca `standard_prompt` (variação) e aplica as regras acima.
  - Opcional: usa IA leve (ex.: Gemini Flash) só para extrair cenário, nunca para reescrever o prompt.
  - Chama geração existente `/api/generate/imagefx` com o prompt final; retorna `imageUrl`(s).

## Frontend
- Nova função `generateThumbnailByTitle()`:
  - Lê `title`, variação, idioma, checkbox de travar estilo.
  - Chama `/api/generate/imagefx/by-title` e renderiza cards.
  - Exibe o prompt efetivamente usado (readonly) para auditoria.

## Validações
- Se não houver prompt padrão para o nicho/subnicho, mostrar modal claro e sugerir re-análise de estilo.
- Se o título estiver vazio, bloquear e destacar campo.
- Logs: mostrar preview do prompt final (primeiros 200 chars).

## Testes
- Casos: títulos com e sem placeholders; idiomas PT/ES; 1–3 variações; comparação visual com referências.
- Garantir que o texto inserido por “Frase de Gancho” só substitui placeholders; não injeta blocos extras quando usando padrão.

## Entrega
- Implementação mínima sem quebrar rotas atuais.
- Configuração opcional de IA de extração pode ser desativada; se desativada, usa heurísticas locais para cenário.
